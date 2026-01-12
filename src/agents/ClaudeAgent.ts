import Anthropic from '@anthropic-ai/sdk';
import { Agent, AgentResponse } from './Agent.js';
import { Run, Message } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';
import { parseAndUpdateProgress } from '../utils/progressParser.js';

interface TaskState {
  abortController: AbortController | null;
  waitingForInput: boolean;
}

export class ClaudeAgent implements Agent {
  private anthropic: Anthropic;
  private database: DatabaseManager;
  private runningTasks: Map<string, TaskState> = new Map();

  constructor(database: DatabaseManager, apiKey?: string) {
    this.database = database;
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables');
    }
    this.anthropic = new Anthropic({ apiKey: key });
  }

  private async executeRequest(
    runId: string,
    prompt: string,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    try {
      // Get conversation history
      const existingMessages = this.database.getMessagesByRunId(runId);
      const lastMessage = existingMessages[existingMessages.length - 1];
      
      // Save user message (only if it's not already the last message)
      if (!lastMessage || lastMessage.content !== prompt) {
        const userMessage: Message = {
          id: crypto.randomUUID(),
          runId: runId,
          role: 'user',
          content: prompt,
          createdAt: new Date(),
        };
        this.database.createMessage(userMessage);
      }

      // Create abort controller for this request
      const abortController = new AbortController();
      this.runningTasks.set(runId, { abortController, waitingForInput: false });

      // Build messages array for API (re-fetch to include the new user message)
      const allMessages = this.database.getMessagesByRunId(runId);
      const messages: Anthropic.MessageParam[] = allMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      logger.info(`Starting Claude agent for task ${runId}`, 'ClaudeAgent');

      // Stream the response
      const stream = await this.anthropic.messages.stream(
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: messages,
        },
        { signal: abortController.signal }
      );

      let fullContent = '';
      let assistantMessageId: string | null = null;
      let lastSaveTime = Date.now();
      let lastProgressCheck = Date.now();
      const SAVE_INTERVAL_MS = 500;
      const PROGRESS_CHECK_INTERVAL_MS = 1000; // Check for progress updates every second

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          const delta = event.delta.text;
          fullContent += delta;
          onMessage(delta);

          const now = Date.now();
          if (!assistantMessageId) {
            assistantMessageId = crypto.randomUUID();
            const assistantMessage: Message = {
              id: assistantMessageId,
              runId: runId,
              role: 'assistant',
              content: fullContent,
              createdAt: new Date(),
            };
            this.database.createMessage(assistantMessage);
            lastSaveTime = now;
          } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
            this.database.updateMessage(assistantMessageId, fullContent);
            lastSaveTime = now;
          }

          // Check for progress updates periodically
          if (now - lastProgressCheck > PROGRESS_CHECK_INTERVAL_MS) {
            parseAndUpdateProgress(this.database, runId, fullContent);
            lastProgressCheck = now;
          }
        } else if (event.type === 'message_stop') {
          // Final save of assistant message
          if (assistantMessageId) {
            this.database.updateMessage(assistantMessageId, fullContent);
          } else {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              runId: runId,
              role: 'assistant',
              content: fullContent,
              createdAt: new Date(),
            };
            this.database.createMessage(assistantMessage);
          }
          
          // Final progress check
          parseAndUpdateProgress(this.database, runId, fullContent);
          
          // Mark as waiting for input instead of removing
          const task = this.runningTasks.get(runId);
          if (task) {
            task.abortController = null;
            task.waitingForInput = true;
          }
          
          logger.info(`Claude agent completed for task ${runId}, waiting for user input`, 'ClaudeAgent');
          onComplete();
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info(`Task ${runId} was cancelled`, 'ClaudeAgent');
        this.runningTasks.delete(runId);
        return;
      }
      logger.error(`Error in Claude agent for task ${runId}`, 'ClaudeAgent', { error });
      this.runningTasks.delete(runId);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async startTask(
    run: Run,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    if (!run.prompt) {
      onError(new Error('No prompt provided for task'));
      return;
    }

    // Check if we already have a task waiting for input - continue conversation
    const existingTask = this.runningTasks.get(run.id);
    if (existingTask && existingTask.waitingForInput) {
      logger.info(`Task ${run.id} has existing context, continuing conversation`, 'ClaudeAgent');
      return this.sendMessage(run.id, run.prompt, onMessage, onError, onComplete);
    }

    await this.executeRequest(run.id, run.prompt, onMessage, onError, onComplete);
  }

  async sendMessage(
    runId: string,
    message: string,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    const existingTask = this.runningTasks.get(runId);
    
    if (existingTask && existingTask.waitingForInput) {
      logger.info(`Continuing conversation for task ${runId}`, 'ClaudeAgent');
      existingTask.waitingForInput = false;
    }
    
    await this.executeRequest(runId, message, onMessage, onError, onComplete);
  }

  async stopTask(runId: string): Promise<void> {
    const task = this.runningTasks.get(runId);
    if (task) {
      if (task.abortController) {
        task.abortController.abort();
      }
      this.runningTasks.delete(runId);
      logger.info(`Stopped Claude agent for task ${runId}`, 'ClaudeAgent');
    }
  }

  isRunning(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.abortController !== null && !task.waitingForInput;
  }

  isWaitingForInput(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.waitingForInput;
  }
}
