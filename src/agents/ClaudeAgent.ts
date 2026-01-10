import Anthropic from '@anthropic-ai/sdk';
import { Agent, AgentResponse } from './Agent.js';
import { Run, Message } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export class ClaudeAgent implements Agent {
  private anthropic: Anthropic;
  private database: DatabaseManager;
  private runningTasks: Map<string, { abortController: AbortController }> = new Map();

  constructor(database: DatabaseManager, apiKey?: string) {
    this.database = database;
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables');
    }
    this.anthropic = new Anthropic({ apiKey: key });
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

    try {
      // Get conversation history first
      const existingMessages = this.database.getMessagesByRunId(run.id);
      const lastMessage = existingMessages[existingMessages.length - 1];
      
      // Save user message (only if it's not already the last message)
      if (!lastMessage || lastMessage.content !== run.prompt) {
        const userMessage: Message = {
          id: crypto.randomUUID(),
          runId: run.id,
          role: 'user',
          content: run.prompt,
          createdAt: new Date(),
        };
        this.database.createMessage(userMessage);
      }

      // Create abort controller for this task
      const abortController = new AbortController();
      this.runningTasks.set(run.id, { abortController });

      // Build messages array for API
      const messages: Anthropic.MessageParam[] = existingMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      // Add the current prompt if it's new
      if (!lastMessage || lastMessage.content !== run.prompt) {
        messages.push({
          role: 'user',
          content: run.prompt,
        });
      }

      logger.info(`Starting Claude agent for task ${run.id}`, 'ClaudeAgent');

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
      const SAVE_INTERVAL_MS = 500; // Save to DB every 500ms

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          const delta = event.delta.text;
          fullContent += delta;
          onMessage(delta);

          // Create or update assistant message incrementally
          const now = Date.now();
          if (!assistantMessageId) {
            // Create initial message
            assistantMessageId = crypto.randomUUID();
            const assistantMessage: Message = {
              id: assistantMessageId,
              runId: run.id,
              role: 'assistant',
              content: fullContent,
              createdAt: new Date(),
            };
            this.database.createMessage(assistantMessage);
            lastSaveTime = now;
          } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
            // Update existing message periodically
            this.database.updateMessage(assistantMessageId, fullContent);
            lastSaveTime = now;
          }
        } else if (event.type === 'message_stop') {
          // Final save of assistant message
          if (assistantMessageId) {
            this.database.updateMessage(assistantMessageId, fullContent);
          } else {
            // Create message if it wasn't created during streaming
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              runId: run.id,
              role: 'assistant',
              content: fullContent,
              createdAt: new Date(),
            };
            this.database.createMessage(assistantMessage);
          }
          this.runningTasks.delete(run.id);
          onComplete();
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info(`Task ${run.id} was cancelled`, 'ClaudeAgent');
        this.runningTasks.delete(run.id);
        return;
      }
      logger.error(`Error in Claude agent for task ${run.id}`, 'ClaudeAgent', { error });
      this.runningTasks.delete(run.id);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async stopTask(runId: string): Promise<void> {
    const task = this.runningTasks.get(runId);
    if (task) {
      task.abortController.abort();
      this.runningTasks.delete(runId);
      logger.info(`Stopped Claude agent for task ${runId}`, 'ClaudeAgent');
    }
  }

  isRunning(runId: string): boolean {
    return this.runningTasks.has(runId);
  }
}
