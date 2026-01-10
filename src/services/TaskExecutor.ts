import { DatabaseManager } from '../db/database.js';
import { Run, AgentType } from '../models/types.js';
import { Agent } from '../agents/Agent.js';
import { ClaudeAgent } from '../agents/ClaudeAgent.js';
import { CursorAgent } from '../agents/CursorAgent.js';
import { createWorktree, removeWorktree } from '../utils/gitWorktree.js';
import { logger } from '../utils/logger.js';

export class TaskExecutor {
  private database: DatabaseManager;
  private agents: Map<string, Agent> = new Map();
  private runningTasks: Map<string, Agent> = new Map();

  constructor(database: DatabaseManager) {
    this.database = database;
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

    if (run.status === 'running') {
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
      });

      // Create git worktree
      const gitBranchPrefix = this.database.getPreference('gitBranchPrefix') || 'agent-orch';
      const worktreeInfo = createWorktree(run.baseBranch, gitBranchPrefix, runId);

      // Update run with worktree path
      this.database.updateRun(runId, {
        worktreePath: worktreeInfo.path,
        phase: 'agent_execution',
      });

      // Refresh the run object to get the updated worktree path
      const updatedRun = this.database.getRun(runId);
      if (!updatedRun) {
        throw new Error(`Run ${runId} not found after update`);
      }

      // Get the agent
      const agent = this.getAgent(selectedAgentType);
      this.runningTasks.set(runId, agent);

      // Start the agent with the updated run object
      // If the run has readyToAct=true, we're continuing a conversation
      await agent.startTask(
        updatedRun,
        (content: string) => {
          // On message - update UI will happen via refreshRuns
          logger.debug(`Message received for task ${runId}`, 'TaskExecutor');
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
        },
        () => {
          // On complete - set to Needs Input (running with readyToAct=true)
          logger.info(`Task ${runId} completed, waiting for user input`, 'TaskExecutor');
          this.database.updateRun(runId, {
            status: 'running',
            phase: 'agent_execution',
            readyToAct: true, // This puts it in "Needs Input" status
          });
          this.runningTasks.delete(runId);
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
      throw error;
    }
  }

  async stopTask(runId: string): Promise<void> {
    const agent = this.runningTasks.get(runId);
    if (agent) {
      await agent.stopTask(runId);
      this.runningTasks.delete(runId);
      this.database.updateRun(runId, {
        status: 'cancelled',
        phase: 'finalization',
        completedAt: new Date(),
      });
    }
  }

  isRunning(runId: string): boolean {
    return this.runningTasks.has(runId);
  }
}
