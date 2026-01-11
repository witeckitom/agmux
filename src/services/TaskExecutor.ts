import { DatabaseManager } from '../db/database.js';
import { Run, AgentType } from '../models/types.js';
import { Agent } from '../agents/Agent.js';
import { ClaudeAgent } from '../agents/ClaudeAgent.js';
import { CursorAgent } from '../agents/CursorAgent.js';
import { createWorktree, removeWorktree } from '../utils/gitWorktree.js';
import { logger } from '../utils/logger.js';

interface TaskInfo {
  agent: Agent;
  agentType: AgentType;
}

export class TaskExecutor {
  private database: DatabaseManager;
  private agents: Map<string, Agent> = new Map();
  private runningTasks: Map<string, TaskInfo> = new Map();
  private onUpdate?: () => void;
  private updateTimeout: NodeJS.Timeout | null = null;

  constructor(database: DatabaseManager, onUpdate?: () => void) {
    this.database = database;
    this.onUpdate = onUpdate;
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      // Debounce updates - batch rapid notifications (like streaming messages)
      // Only call onUpdate after 200ms of no new notifications
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
      }
      this.updateTimeout = setTimeout(() => {
        if (this.onUpdate) {
          this.onUpdate();
        }
        this.updateTimeout = null;
      }, 200); // 200ms debounce - feels instant but reduces re-renders
    }
  }

  private getAgent(agentType: 'claude' | 'cursor'): Agent {
    if (this.agents.has(agentType)) {
      return this.agents.get(agentType)!;
    }

    let agent: Agent;
    if (agentType === 'claude') {
      agent = new ClaudeAgent(this.database);
    } else {
      agent = new CursorAgent(this.database);
    }

    this.agents.set(agentType, agent);
    return agent;
  }

  async startTask(runId: string, agentType?: AgentType): Promise<void> {
    const run = this.database.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Check if we have an existing task that's waiting for input
    const existingTaskInfo = this.runningTasks.get(runId);
    if (existingTaskInfo && existingTaskInfo.agent.isWaitingForInput(runId)) {
      logger.info(`Task ${runId} is waiting for input, continuing conversation`, 'TaskExecutor');
      // Continue the conversation instead of restarting
      return this.sendMessageToTask(runId, run.prompt || '');
    }

    if (run.status === 'running' && !run.readyToAct) {
      logger.warn(`Task ${runId} is already running`, 'TaskExecutor');
      return;
    }

    try {
      // Get agent type from parameter, settings, or default
      const selectedAgentType = agentType || 
        (this.database.getPreference('agent') as AgentType) || 
        'claude';

      // Update status to running
      this.database.updateRun(runId, {
        status: 'running',
        phase: 'worktree_creation',
        readyToAct: false,
      });
      this.notifyUpdate();

      // Create git worktree only if we don't have one yet
      let worktreePath = run.worktreePath;
      if (!worktreePath || worktreePath.trim() === '' || worktreePath.startsWith('/tmp/')) {
        const gitBranchPrefix = this.database.getPreference('gitBranchPrefix') || 'agent-orch';
        const worktreeInfo = createWorktree(run.baseBranch, gitBranchPrefix, runId);
        worktreePath = worktreeInfo.path;
        
        // Update run with worktree path
        this.database.updateRun(runId, {
          worktreePath: worktreePath,
        });
      }
      
      this.database.updateRun(runId, {
        phase: 'agent_execution',
      });
      this.notifyUpdate();

      // Refresh the run object to get the updated worktree path
      const updatedRun = this.database.getRun(runId);
      if (!updatedRun) {
        throw new Error(`Run ${runId} not found after update`);
      }

      // Get the agent
      const agent = this.getAgent(selectedAgentType);
      this.runningTasks.set(runId, { agent, agentType: selectedAgentType });

      // Start the agent with the updated run object
      await agent.startTask(
        updatedRun,
        (content: string) => {
          // On message - notify UI to refresh
          logger.debug(`Message received for task ${runId}`, 'TaskExecutor');
          this.notifyUpdate();
        },
        (error: Error) => {
          // On error
          logger.error(`Task ${runId} error`, 'TaskExecutor', { error });
          this.database.updateRun(runId, {
            status: 'failed',
            phase: 'finalization',
            completedAt: new Date(),
          });
          this.runningTasks.delete(runId);
          this.notifyUpdate();
        },
        () => {
          // On complete - set to Needs Input (running with readyToAct=true)
          // NOTE: We DON'T delete from runningTasks - the agent maintains context
          logger.info(`Task ${runId} completed, waiting for user input`, 'TaskExecutor');
          this.database.updateRun(runId, {
            status: 'running',
            phase: 'agent_execution',
            readyToAct: true, // This puts it in "Needs Input" status
          });
          this.notifyUpdate();
          // Don't cleanup worktree - user might want to continue or merge
        }
      );
    } catch (error: any) {
      logger.error(`Failed to start task ${runId}`, 'TaskExecutor', { error });
      this.database.updateRun(runId, {
        status: 'failed',
        phase: 'finalization',
        completedAt: new Date(),
      });
      this.runningTasks.delete(runId);
      this.notifyUpdate();
      throw error;
    }
  }

  async sendMessageToTask(runId: string, message: string): Promise<void> {
    const taskInfo = this.runningTasks.get(runId);
    
    if (!taskInfo) {
      // No existing task info - need to restart
      const run = this.database.getRun(runId);
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }
      
      // Update prompt and start fresh
      this.database.updateRun(runId, { prompt: message });
      return this.startTask(runId);
    }

    const { agent } = taskInfo;
    
    // Check if agent is waiting for input
    if (!agent.isWaitingForInput(runId)) {
      logger.warn(`Task ${runId} is not waiting for input`, 'TaskExecutor');
      return;
    }

    logger.info(`Sending message to task ${runId}`, 'TaskExecutor');
    
    // Update status
    this.database.updateRun(runId, {
      prompt: message,
      readyToAct: false,
      status: 'running',
    });
    this.notifyUpdate();

    // Send message to the agent
    await agent.sendMessage(
      runId,
      message,
      (content: string) => {
        logger.debug(`Message received for task ${runId}`, 'TaskExecutor');
        this.notifyUpdate();
      },
      (error: Error) => {
        logger.error(`Task ${runId} error`, 'TaskExecutor', { error });
        this.database.updateRun(runId, {
          status: 'failed',
          phase: 'finalization',
          completedAt: new Date(),
        });
        this.runningTasks.delete(runId);
        this.notifyUpdate();
      },
      () => {
        logger.info(`Task ${runId} completed, waiting for user input`, 'TaskExecutor');
        this.database.updateRun(runId, {
          status: 'running',
          phase: 'agent_execution',
          readyToAct: true,
        });
        this.notifyUpdate();
      }
    );
  }

  async stopTask(runId: string): Promise<void> {
    const taskInfo = this.runningTasks.get(runId);
    if (taskInfo) {
      await taskInfo.agent.stopTask(runId);
      this.runningTasks.delete(runId);
      this.database.updateRun(runId, {
        status: 'cancelled',
        phase: 'finalization',
        completedAt: new Date(),
      });
      this.notifyUpdate();
    }
  }

  isRunning(runId: string): boolean {
    const taskInfo = this.runningTasks.get(runId);
    return taskInfo !== undefined && taskInfo.agent.isRunning(runId);
  }

  isWaitingForInput(runId: string): boolean {
    const taskInfo = this.runningTasks.get(runId);
    return taskInfo !== undefined && taskInfo.agent.isWaitingForInput(runId);
  }
}
