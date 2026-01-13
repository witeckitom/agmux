import { DatabaseManager } from '../../db/database.js';
import { TaskExecutor } from '../TaskExecutor.js';
import { Run, RunStatus, RunPhase, AgentType } from '../../models/types.js';
import { ITaskService, CreateTaskParams } from './interfaces.js';
import { logger } from '../../utils/logger.js';

/**
 * Service for managing tasks
 */
export class TaskService implements ITaskService {
  constructor(
    private database: DatabaseManager,
    private taskExecutor: TaskExecutor
  ) {}

  async createTask(params: CreateTaskParams): Promise<Run> {
    const baseBranch = params.baseBranch || 'main';
    const agentProfileId = params.agentProfileId || 'claude';
    
    const run = this.database.createRun({
      name: params.name || null,
      status: 'queued',
      phase: 'worktree_creation',
      worktreePath: '',
      baseBranch,
      agentProfileId,
      conversationId: null,
      skillId: params.skillId || null,
      prompt: params.prompt,
      progressPercent: 0,
      totalSubtasks: 0,
      completedSubtasks: 0,
      readyToAct: false,
      completedAt: null,
      durationMs: null,
      retainWorktree: false,
    });

    logger.info(`Created task ${run.id}`, 'TaskService');

    // Trigger UI refresh so the new task appears immediately
    this.taskExecutor.triggerRefresh();

    return run;
  }

  async startTask(runId: string, agentType?: string): Promise<void> {
    const run = this.database.getRun(runId);
    if (!run) {
      throw new Error(`Task ${runId} not found`);
    }

    const typedAgentType = agentType ? (agentType as AgentType) : undefined;
    await this.taskExecutor.startTask(runId, typedAgentType);
    logger.info(`Started task ${runId}`, 'TaskService');
  }

  async getTask(runId: string): Promise<Run | null> {
    return this.database.getRun(runId);
  }

  async getAllTasks(): Promise<Run[]> {
    return this.database.getAllRuns();
  }
}
