import Database from 'better-sqlite3';
import { Run, Worktree, Preference } from '../models/types.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    const schemaPath = join(process.cwd(), 'src', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
    
    // Migrate existing databases: add duration_ms column if it doesn't exist
    try {
      this.db.exec(`
        ALTER TABLE runs ADD COLUMN duration_ms INTEGER;
      `);
    } catch (error: any) {
      // Column already exists or other error - ignore
      if (!error.message?.includes('duplicate column')) {
        // Log other errors but don't fail
      }
    }
  }

  // Run operations
  createRun(run: Omit<Run, 'id' | 'createdAt' | 'updatedAt'>): Run {
    const id = crypto.randomUUID();
    const now = new Date();
    
    this.db
      .prepare(
        `INSERT INTO runs (
          id, status, phase, worktree_path, base_branch, agent_profile_id,
          conversation_id, skill_id, prompt, progress_percent, total_subtasks,
          completed_subtasks, ready_to_act, created_at, updated_at, completed_at, duration_ms, retain_worktree
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        run.status,
        run.phase,
        run.worktreePath,
        run.baseBranch,
        run.agentProfileId,
        run.conversationId,
        run.skillId,
        run.prompt,
        run.progressPercent,
        run.totalSubtasks,
        run.completedSubtasks,
        run.readyToAct ? 1 : 0,
        now.toISOString(),
        now.toISOString(),
        run.completedAt?.toISOString() || null,
        run.durationMs ?? null,
        run.retainWorktree ? 1 : 0
      );

    return this.getRun(id)!;
  }

  getRun(id: string): Run | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      status: row.status as Run['status'],
      phase: row.phase as Run['phase'],
      worktreePath: row.worktree_path,
      baseBranch: row.base_branch,
      agentProfileId: row.agent_profile_id,
      conversationId: row.conversation_id,
      skillId: row.skill_id,
      prompt: row.prompt,
      progressPercent: row.progress_percent,
      totalSubtasks: row.total_subtasks,
      completedSubtasks: row.completed_subtasks,
      readyToAct: row.ready_to_act === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined ? row.duration_ms : null,
      retainWorktree: row.retain_worktree === 1,
    };
  }

  getAllRuns(): Run[] {
    const rows = this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapRowToRun);
  }

  getRunsByStatus(status: Run['status']): Run[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE status = ? ORDER BY created_at DESC')
      .all(status) as any[];
    return rows.map(this.mapRowToRun);
  }

  updateRun(id: string, updates: Partial<Run>): Run | null {
    const setParts: string[] = [];
    const values: any[] = [];
    
    // Get the current run to check if we need to calculate duration
    const currentRun = this.getRun(id);
    const isCompleting = updates.status !== undefined && 
                         (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') &&
                         currentRun && 
                         currentRun.status === 'running';

    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
    }
    if (updates.phase !== undefined) {
      setParts.push('phase = ?');
      values.push(updates.phase);
    }
    if (updates.progressPercent !== undefined) {
      setParts.push('progress_percent = ?');
      values.push(updates.progressPercent);
    }
    if (updates.totalSubtasks !== undefined) {
      setParts.push('total_subtasks = ?');
      values.push(updates.totalSubtasks);
    }
    if (updates.completedSubtasks !== undefined) {
      setParts.push('completed_subtasks = ?');
      values.push(updates.completedSubtasks);
    }
    if (updates.readyToAct !== undefined) {
      setParts.push('ready_to_act = ?');
      values.push(updates.readyToAct ? 1 : 0);
    }
    
    // Handle completedAt - if not provided but task is completing, set it to now
    if (updates.completedAt !== undefined) {
      setParts.push('completed_at = ?');
      values.push(updates.completedAt?.toISOString() || null);
    } else if (isCompleting) {
      setParts.push('completed_at = ?');
      values.push(new Date().toISOString());
    }
    
    // Calculate and save duration if task is completing and duration not explicitly provided
    if (updates.durationMs !== undefined) {
      setParts.push('duration_ms = ?');
      values.push(updates.durationMs);
    } else if (isCompleting && currentRun) {
      const now = new Date();
      const durationMs = now.getTime() - currentRun.createdAt.getTime();
      setParts.push('duration_ms = ?');
      values.push(durationMs);
    }
    
    if (updates.conversationId !== undefined) {
      setParts.push('conversation_id = ?');
      values.push(updates.conversationId);
    }

    if (setParts.length === 0) {
      return this.getRun(id);
    }

    setParts.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db
      .prepare(`UPDATE runs SET ${setParts.join(', ')} WHERE id = ?`)
      .run(...values);

    return this.getRun(id);
  }

  deleteRun(id: string): boolean {
    const result = this.db.prepare('DELETE FROM runs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapRowToRun(row: any): Run {
    return {
      id: row.id,
      status: row.status as Run['status'],
      phase: row.phase as Run['phase'],
      worktreePath: row.worktree_path,
      baseBranch: row.base_branch,
      agentProfileId: row.agent_profile_id,
      conversationId: row.conversation_id,
      skillId: row.skill_id,
      prompt: row.prompt,
      progressPercent: row.progress_percent,
      totalSubtasks: row.total_subtasks,
      completedSubtasks: row.completed_subtasks,
      readyToAct: row.ready_to_act === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined ? row.duration_ms : null,
      retainWorktree: row.retain_worktree === 1,
    };
  }

  // Worktree operations
  createWorktree(worktree: Omit<Worktree, 'id' | 'createdAt'>): Worktree {
    const id = crypto.randomUUID();
    const now = new Date();

    this.db
      .prepare(
        `INSERT INTO worktrees (id, path, base_branch, run_id, created_at, cleanup_at, retained)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        worktree.path,
        worktree.baseBranch,
        worktree.runId,
        now.toISOString(),
        worktree.cleanupAt?.toISOString() || null,
        worktree.retained ? 1 : 0
      );

    return this.getWorktree(id)!;
  }

  getWorktree(id: string): Worktree | null {
    const row = this.db.prepare('SELECT * FROM worktrees WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      path: row.path,
      baseBranch: row.base_branch,
      runId: row.run_id,
      createdAt: new Date(row.created_at),
      cleanupAt: row.cleanup_at ? new Date(row.cleanup_at) : null,
      retained: row.retained === 1,
    };
  }

  // Preference operations
  getPreference(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as any;
    return row?.value || null;
  }

  setPreference(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
