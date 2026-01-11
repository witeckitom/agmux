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
  // HARD LOCK: Prevent concurrent startTask calls for same runId
  private startingTasks: Set<string> = new Set();

  constructor(database: DatabaseManager, onUpdate?: () => void) {
    this.database = database;
    this.onUpdate = onUpdate;
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      // Debounce updates - batch rapid notifications (like streaming messages)
      // Only call onUpdate after 50ms of no new notifications for faster streaming
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
      }
      this.updateTimeout = setTimeout(() => {
        if (this.onUpdate) {
          this.onUpdate();
        }
        this.updateTimeout = null;
      }, 50); // 50ms debounce - fast for streaming but still reduces re-renders
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
    // HARD LOCK CHECK - prevent concurrent startTask calls
    if (this.startingTasks.has(runId)) {
      logger.error(`BLOCKED: Task ${runId} startTask already in progress (TaskExecutor hard lock)`, 'TaskExecutor');
      return;
    }
    
    const run = this.database.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Check if we have an existing task
    const existingTaskInfo = this.runningTasks.get(runId);
    
    // CRITICAL: If agent is actively running, do NOT start another
    if (existingTaskInfo && existingTaskInfo.agent.isRunning(runId)) {
      logger.error(`BLOCKED: Task ${runId} agent is already running`, 'TaskExecutor');
      return;
    }
    
    // If task is waiting for input, continue the conversation
    if (existingTaskInfo && existingTaskInfo.agent.isWaitingForInput(runId)) {
      logger.info(`Task ${runId} is waiting for input, continuing conversation`, 'TaskExecutor');
      return this.sendMessageToTask(runId, run.prompt || '');
    }

    // Double-check database status as a fallback
    if (run.status === 'running' && !run.readyToAct) {
      logger.error(`BLOCKED: Task ${runId} is already running (per database)`, 'TaskExecutor');
      return;
    }
    
    // ACQUIRE HARD LOCK
    this.startingTasks.add(runId);
    logger.info(`LOCK ACQUIRED (TaskExecutor): Starting task ${runId}`, 'TaskExecutor');

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
          // On message - notify UI to refresh (no logging - too noisy)
          this.notifyUpdate();
        },
        (error: Error) => {
          // RELEASE HARD LOCK
          this.startingTasks.delete(runId);
          logger.error(`LOCK RELEASED (TaskExecutor error): Task ${runId} error`, 'TaskExecutor', { error });
          this.database.updateRun(runId, {
            status: 'failed',
            phase: 'finalization',
            completedAt: new Date(),
          });
          this.runningTasks.delete(runId);
          this.notifyUpdate();
        },
        () => {
          // RELEASE HARD LOCK
          this.startingTasks.delete(runId);
          logger.info(`LOCK RELEASED (TaskExecutor complete): Task ${runId} completed, waiting for user input`, 'TaskExecutor');
          // On complete - set to Needs Input (running with readyToAct=true)
          // NOTE: We DON'T delete from runningTasks - the agent maintains context
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
      // RELEASE HARD LOCK
      this.startingTasks.delete(runId);
      logger.error(`LOCK RELEASED (TaskExecutor catch): Failed to start task ${runId}`, 'TaskExecutor', { error });
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
    let taskInfo = this.runningTasks.get(runId);
    const run = this.database.getRun(runId);
    
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    
    logger.info(`sendMessageToTask called`, 'TaskExecutor', {
      runId,
      hasTaskInfo: !!taskInfo,
      runReadyToAct: run.readyToAct,
      runStatus: run.status,
      hasWorktree: !!run.worktreePath,
    });
    
    if (!taskInfo) {
      // No existing task info - create agent instance to handle the message
      // The agent will use the existing worktree if available
      logger.info(`Creating agent for task ${runId}`, 'TaskExecutor');
      
      const selectedAgentType = (this.database.getPreference('agent') as AgentType) || 'cursor';
      const agent = this.getAgent(selectedAgentType);
      
      // Register in runningTasks
      taskInfo = { agent, agentType: selectedAgentType };
      this.runningTasks.set(runId, taskInfo);
    }

    const { agent } = taskInfo;
    
    // CRITICAL: If agent is actively running, do NOT send another message
    if (agent.isRunning(runId)) {
      logger.warn(`Task ${runId} agent is already running, cannot send message`, 'TaskExecutor');
      return;
    }

    logger.info(`Sending message to task ${runId}`, 'TaskExecutor');
    
    // Update status to running (In Progress)
    this.database.updateRun(runId, {
      prompt: message,
      readyToAct: false,
      status: 'running',
      phase: 'agent_execution',
    });
    this.notifyUpdate();

    // Send message to the agent - agent handles worktree resolution internally
    await agent.sendMessage(
      runId,
      message,
      (content: string) => {
        // On message - notify UI to refresh (no logging - too noisy)
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
        // Agent completed - back to Needs Input
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
