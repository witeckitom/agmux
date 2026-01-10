import { Run } from '../models/types.js';

export interface AgentResponse {
  content: string;
  done: boolean;
}

export interface Agent {
  /**
   * Start executing a task with the given prompt
   * @param run The run/task to execute
   * @param onMessage Callback when a new message is received
   * @param onError Callback when an error occurs
   * @param onComplete Callback when the task completes
   */
  startTask(
    run: Run,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void>;

  /**
   * Stop the currently running task
   * @param runId The ID of the run to stop
   */
  stopTask(runId: string): Promise<void>;

  /**
   * Check if the agent is currently running a task
   * @param runId The ID of the run to check
   */
  isRunning(runId: string): boolean;
}
