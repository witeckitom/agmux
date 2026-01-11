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
   * @param onComplete Callback when the agent is ready for more input (process stays alive)
   */
  startTask(
    run: Run,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void>;

  /**
   * Send a message to an existing task that is waiting for input.
   * The process should already be running and in "ready for input" state.
   * @param runId The ID of the run to send the message to
   * @param message The message content to send
   * @param onMessage Callback when a new message is received
   * @param onError Callback when an error occurs
   * @param onComplete Callback when the agent is ready for more input
   */
  sendMessage(
    runId: string,
    message: string,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void>;

  /**
   * Stop the currently running task and cleanup the process
   * @param runId The ID of the run to stop
   */
  stopTask(runId: string): Promise<void>;

  /**
   * Check if the agent has an active process for the task
   * @param runId The ID of the run to check
   */
  isRunning(runId: string): boolean;

  /**
   * Check if the agent is waiting for user input (process alive but idle)
   * @param runId The ID of the run to check
   */
  isWaitingForInput(runId: string): boolean;
}
