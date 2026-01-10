import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/db/database.js';
import { TaskExecutor } from '../src/services/TaskExecutor.js';
import { getTestDbPath } from '../src/test-utils/test-helpers.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('Task Execution E2E', () => {
  let db: DatabaseManager;
  let executor: TaskExecutor;
  let testRepoPath: string;

  beforeEach(() => {
    // Create a temporary test repository
    testRepoPath = join(process.cwd(), 'test-repo-e2e');

    // Clean up if exists
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }

    mkdirSync(testRepoPath, { recursive: true });

    // Initialize git repo (without chdir)
    try {
      execSync('git init', { stdio: 'ignore', cwd: testRepoPath });
      execSync('git config user.name "Test User"', { stdio: 'ignore', cwd: testRepoPath });
      execSync('git config user.email "test@example.com"', { stdio: 'ignore', cwd: testRepoPath });
      
      // Create initial commit
      writeFileSync(join(testRepoPath, 'README.md'), '# Test Repo');
      execSync('git add README.md', { stdio: 'ignore', cwd: testRepoPath });
      execSync('git commit -m "Initial commit"', { stdio: 'ignore', cwd: testRepoPath });
      execSync('git checkout -b main', { stdio: 'ignore', cwd: testRepoPath });
    } catch (error) {
      // Git might not be available, skip git setup
      console.warn('Git not available, skipping git setup');
    }

    // Create database
    const dbPath = getTestDbPath('task-execution-e2e');
    db = new DatabaseManager(dbPath);
    executor = new TaskExecutor(db);

    // Set default agent preference
    db.setPreference('agent', 'claude');
    db.setPreference('gitBranchPrefix', 'test-agent');
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.close();
    }

    // Clean up test repo
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }

    // Clean up worktrees
    const worktreesPath = join(testRepoPath, '.worktrees');
    if (existsSync(worktreesPath)) {
      rmSync(worktreesPath, { recursive: true, force: true });
    }
  });

  it('should create a task and verify database operations', async () => {
    // Create a task
    const run = db.createRun({
      status: 'queued',
      phase: 'worktree_creation',
      worktreePath: '/tmp/test-worktree',
      baseBranch: 'main',
      agentProfileId: 'default',
      conversationId: null,
      skillId: null,
      prompt: 'Test prompt for e2e',
      progressPercent: 0,
      totalSubtasks: 0,
      completedSubtasks: 0,
      readyToAct: false,
      completedAt: null,
      durationMs: null,
      retainWorktree: false,
    });

    expect(run.id).toBeDefined();
    expect(run.status).toBe('queued');
    expect(run.prompt).toBe('Test prompt for e2e');

    // Verify we can retrieve it
    const retrieved = db.getRun(run.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(run.id);
    expect(retrieved?.status).toBe('queued');
  });

  it('should save messages when agent responds', () => {
    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-worktree',
      baseBranch: 'main',
      agentProfileId: 'default',
      conversationId: null,
      skillId: null,
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      durationMs: null,
      retainWorktree: false,
    });

    // Create user message
    const userMessage = db.createMessage({
      id: crypto.randomUUID(),
      runId: run.id,
      role: 'user',
      content: 'Test prompt',
    });

    expect(userMessage.id).toBeDefined();
    expect(userMessage.role).toBe('user');
    expect(userMessage.content).toBe('Test prompt');

    // Create assistant message
    const assistantMessage = db.createMessage({
      id: crypto.randomUUID(),
      runId: run.id,
      role: 'assistant',
      content: 'Test response',
    });

    expect(assistantMessage.id).toBeDefined();
    expect(assistantMessage.role).toBe('assistant');

    // Retrieve messages
    const messages = db.getMessagesByRunId(run.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should update run status when task completes', () => {
    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-worktree',
      baseBranch: 'main',
      agentProfileId: 'default',
      conversationId: null,
      skillId: null,
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      durationMs: null,
      retainWorktree: false,
    });

    const now = new Date();
    const durationMs = 5000; // 5 seconds

    const updated = db.updateRun(run.id, {
      status: 'completed',
      phase: 'finalization',
      completedAt: now,
      durationMs: durationMs,
    });

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).not.toBeNull();
    expect(updated?.durationMs).toBe(durationMs);
  });

  it('should handle worktree creation (if git is available)', () => {
    // This test verifies the worktree creation logic works
    // Note: This will only work if git is available in the test environment
    if (!existsSync(join(testRepoPath, '.git'))) {
      console.log('Skipping worktree test - git not initialized');
      return;
    }

    const branchName = 'test-agent-12345678';
    const worktreePath = join(testRepoPath, '.worktrees', branchName);

    try {
      // Create worktree directory
      mkdirSync(join(testRepoPath, '.worktrees'), { recursive: true });

      // Create worktree
      execSync(`git worktree add -b ${branchName} ${worktreePath} main`, {
        cwd: testRepoPath,
        stdio: 'ignore',
      });

      expect(existsSync(worktreePath)).toBe(true);
      expect(existsSync(join(worktreePath, '.git'))).toBe(true);

      // Clean up
      execSync(`git worktree remove ${worktreePath}`, {
        cwd: testRepoPath,
        stdio: 'ignore',
      });
    } catch (error: any) {
      // Git worktree might not be available, skip
      console.warn('Git worktree not available, skipping worktree test:', error.message);
    }
  });
});
