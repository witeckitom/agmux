import { spawn, ChildProcess } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { Agent } from './Agent.js';
import { Run, Message } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { parseAndUpdateProgress } from '../utils/progressParser.js';

interface TaskState {
  process: ChildProcess | null;
  worktreePath: string;
  sessionId: string | null;  // Claude Code's session ID for resuming
  waitingForInput: boolean;
}

// Claude Code JSON output types (similar to vibe-kanban)
interface ClaudeJsonMessage {
  type: 'system' | 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'stream_event';
  session_id?: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string; thinking?: string }>;
  };
  text?: string;  // for thinking
  subtype?: string;
  model?: string;
  event?: {
    type: string;
    message?: {
      role: string;
      content: Array<{ type: string; text?: string }>;
    };
    content_block_delta?: {
      text?: string;
      thinking?: string;
    };
  };
}

export class ClaudeAgent implements Agent {
  private database: DatabaseManager;
  private runningTasks: Map<string, TaskState> = new Map();
  private static totalSpawnCount = 0;

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  private findClaudeCode(): string | null {
    // Try npx first (most reliable)
    try {
      execSync('which npx', { encoding: 'utf-8', stdio: 'pipe' });
      return 'npx';
    } catch {
      // npx not found
    }

    return null;
  }

  private resolveWorktreePath(run: Run): string {
    if (run.worktreePath && existsSync(run.worktreePath)) {
      return run.worktreePath;
    }
    
    const projectRoot = process.cwd();
    const worktreesDir = resolve(projectRoot, '.worktrees');
    
    if (existsSync(worktreesDir)) {
      try {
        const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => resolve(worktreesDir, dirent.name));
        
        const runIdPrefix = run.id.slice(0, 8);
        for (const dir of worktreeDirs) {
          const dirName = dir.split('/').pop() || '';
          if (dirName.includes(runIdPrefix)) {
            return dir;
          }
        }
      } catch {
        // Ignore
      }
    }
    
    return process.cwd();
  }

  async startTask(
    run: Run,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    const existingTask = this.runningTasks.get(run.id);
    if (existingTask && existingTask.process !== null) {
      logger.warn(`Task ${run.id} already has a running process, ignoring`, 'ClaudeAgent');
      return;
    }
    
    // If we have an existing session, continue it
    if (existingTask && existingTask.waitingForInput && existingTask.sessionId) {
      return this.sendMessage(run.id, run.prompt || '', onMessage, onError, onComplete);
    }

    if (!run.prompt) {
      onError(new Error('No prompt provided for task'));
      return;
    }

    const npxPath = this.findClaudeCode();
    if (!npxPath) {
      onError(new Error('npx not found. Please install Node.js to use Claude Code.'));
      return;
    }

    try {
      // Save user message
      const existingMessages = this.database.getMessagesByRunId(run.id);
      const lastMessage = existingMessages[existingMessages.length - 1];
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

      const worktreeCwd = this.resolveWorktreePath(run);
      
      ClaudeAgent.totalSpawnCount++;
      logger.info(`=== SPAWN #${ClaudeAgent.totalSpawnCount} ===`, 'ClaudeAgent', {
        runId: run.id,
        cwd: worktreeCwd,
      });

      // Build command args: -p for print mode, --output-format=stream-json for JSON output
      // Note: --verbose is required when using --print with --output-format=stream-json
      // --dangerously-skip-permissions bypasses permission prompts (like vibe-kanban does)
      const args = [
        '-y',
        '@anthropic-ai/claude-code@2.1.2',
        '-p',
        '--verbose',
        '--output-format=stream-json',
        '--input-format=stream-json',
        '--include-partial-messages',
        '--dangerously-skip-permissions',
      ];

      logger.info(`Running: ${npxPath} ${args.join(' ')}`, 'ClaudeAgent');

      const childProcess = spawn(npxPath, args, {
        cwd: worktreeCwd,
        stdio: ['pipe', 'pipe', 'pipe'],  // pipe stdin so we can write prompt
        env: process.env,
      });

      // Initialize task state
      const taskState: TaskState = {
        process: childProcess,
        worktreePath: worktreeCwd,
        sessionId: null,
        waitingForInput: false,
      };
      this.runningTasks.set(run.id, taskState);

      // Write prompt to stdin as JSON message format
      if (childProcess.stdin) {
        const message = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: run.prompt,
          },
        });
        childProcess.stdin.write(message + '\n');
        childProcess.stdin.end();
        logger.info(`Sent prompt via stdin (${run.prompt.length} chars)`, 'ClaudeAgent');
      }

      let assistantContent = '';
      let assistantMessageId: string | null = null;
      let lastSaveTime = Date.now();
      let lastProgressCheck = Date.now();
      const SAVE_INTERVAL_MS = 200;
      const PROGRESS_CHECK_INTERVAL_MS = 1000;

      // Process stdout as JSON lines
      let buffer = '';
      childProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const json: ClaudeJsonMessage = JSON.parse(line);
            
            // Extract session_id if present
            if (json.session_id && !taskState.sessionId) {
              taskState.sessionId = json.session_id;
              logger.info(`Got session_id: ${json.session_id}`, 'ClaudeAgent');
            }
            
            // Handle different message types
            if (json.type === 'assistant' && json.message?.content) {
              for (const item of json.message.content) {
                if (item.type === 'text' && item.text) {
                  assistantContent += item.text;
                  onMessage(item.text);  // Stream to UI
                }
              }
              
              // Save to database periodically
              const now = Date.now();
              if (!assistantMessageId) {
                assistantMessageId = crypto.randomUUID();
                const assistantMessage: Message = {
                  id: assistantMessageId,
                  runId: run.id,
                  role: 'assistant',
                  content: assistantContent,
                  createdAt: new Date(),
                };
                this.database.createMessage(assistantMessage);
                lastSaveTime = now;
              } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
                this.database.updateMessage(assistantMessageId, assistantContent);
                lastSaveTime = now;
              }

              // Check for progress updates periodically
              if (now - lastProgressCheck > PROGRESS_CHECK_INTERVAL_MS) {
                parseAndUpdateProgress(this.database, run.id, assistantContent);
                lastProgressCheck = now;
              }
            } else if (json.type === 'stream_event' && json.event) {
              // Handle streaming events
              if (json.event.type === 'content_block_delta' && json.event.content_block_delta) {
                const delta = json.event.content_block_delta;
                if (delta.text) {
                  assistantContent += delta.text;
                  onMessage(delta.text);
                  
                  const now = Date.now();
                  if (!assistantMessageId) {
                    assistantMessageId = crypto.randomUUID();
                    const assistantMessage: Message = {
                      id: assistantMessageId,
                      runId: run.id,
                      role: 'assistant',
                      content: assistantContent,
                      createdAt: new Date(),
                    };
                    this.database.createMessage(assistantMessage);
                    lastSaveTime = now;
                  } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
                    this.database.updateMessage(assistantMessageId, assistantContent);
                    lastSaveTime = now;
                  }

                  if (now - lastProgressCheck > PROGRESS_CHECK_INTERVAL_MS) {
                    parseAndUpdateProgress(this.database, run.id, assistantContent);
                    lastProgressCheck = now;
                  }
                }
              } else if (json.event.type === 'message_start' && json.event.message) {
                // New message starting
                assistantContent = '';
                assistantMessageId = null;
              }
            } else if (json.type === 'thinking' && json.text) {
              // Could show thinking indicator
              logger.debug(`Thinking: ${json.text.substring(0, 50)}...`, 'ClaudeAgent');
            } else if (json.type === 'system') {
              if (json.model) {
                logger.info(`Using model: ${json.model}`, 'ClaudeAgent');
              }
            }
          } catch (e) {
            // Not JSON, might be plain text output
            logger.debug(`Non-JSON output: ${line.substring(0, 100)}`, 'ClaudeAgent');
          }
        }
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        logger.warn(`stderr: ${text}`, 'ClaudeAgent');
      });

      childProcess.on('close', (exitCode) => {
        logger.info(`Process exited`, 'ClaudeAgent', { exitCode, sessionId: taskState.sessionId });

        // Final save
        if (assistantMessageId && assistantContent.trim()) {
          this.database.updateMessage(assistantMessageId, assistantContent.trim());
        } else if (!assistantMessageId && assistantContent.trim()) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            runId: run.id,
            role: 'assistant',
            content: assistantContent.trim(),
            createdAt: new Date(),
          };
          this.database.createMessage(assistantMessage);
        }

        // Final progress check
        if (assistantContent.trim()) {
          parseAndUpdateProgress(this.database, run.id, assistantContent.trim());
        }

        taskState.process = null;
        taskState.waitingForInput = true;

        if (exitCode === 0) {
          onComplete();
        } else {
          this.runningTasks.delete(run.id);
          onError(new Error(`claude-code exited with code ${exitCode}`));
        }
      });

      childProcess.on('error', (error) => {
        logger.error(`Process error`, 'ClaudeAgent', { error });
        this.runningTasks.delete(run.id);
        onError(error);
      });

    } catch (error: any) {
      logger.error(`Error starting claude-code`, 'ClaudeAgent', { error });
      this.runningTasks.delete(run.id);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async sendMessage(
    runId: string,
    message: string,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    const existingTask = this.runningTasks.get(runId);
    
    logger.info(`sendMessage called`, 'ClaudeAgent', {
      runId,
      hasExistingTask: !!existingTask,
      processRunning: existingTask?.process !== null,
      waitingForInput: existingTask?.waitingForInput,
      hasSessionId: !!existingTask?.sessionId,
    });
    
    if (existingTask && existingTask.process !== null) {
      logger.warn(`Task ${runId} already has a running process, ignoring sendMessage`, 'ClaudeAgent');
      return;
    }
    
    // Save user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      runId: runId,
      role: 'user',
      content: message,
      createdAt: new Date(),
    };
    this.database.createMessage(userMessage);

    if (existingTask && existingTask.waitingForInput && existingTask.sessionId) {
      // Resume the session!
      const npxPath = this.findClaudeCode();
      if (!npxPath) {
        onError(new Error('npx not found'));
        return;
      }

      ClaudeAgent.totalSpawnCount++;
      logger.info(`=== SPAWN #${ClaudeAgent.totalSpawnCount} (resume) ===`, 'ClaudeAgent', {
        runId,
        sessionId: existingTask.sessionId,
      });

      const args = [
        '-y',
        '@anthropic-ai/claude-code@2.1.2',
        '-p',
        '--verbose',
        '--output-format=stream-json',
        '--input-format=stream-json',
        '--include-partial-messages',
        '--dangerously-skip-permissions',
        '--fork-session',
        '--resume',
        existingTask.sessionId,
      ];

      logger.info(`Running: ${npxPath} ${args.join(' ')}`, 'ClaudeAgent');

      const childProcess = spawn(npxPath, args, {
        cwd: existingTask.worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      existingTask.process = childProcess;
      existingTask.waitingForInput = false;

      // Write message to stdin as JSON message format
      if (childProcess.stdin) {
        const jsonMessage = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: message,
          },
        });
        childProcess.stdin.write(jsonMessage + '\n');
        childProcess.stdin.end();
      }

      let assistantContent = '';
      let assistantMessageId: string | null = null;
      let lastSaveTime = Date.now();
      let lastProgressCheck = Date.now();
      const SAVE_INTERVAL_MS = 200;
      const PROGRESS_CHECK_INTERVAL_MS = 1000;

      let buffer = '';
      childProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const json: ClaudeJsonMessage = JSON.parse(line);
            
            if (json.type === 'assistant' && json.message?.content) {
              for (const item of json.message.content) {
                if (item.type === 'text' && item.text) {
                  assistantContent += item.text;
                  onMessage(item.text);
                }
              }
              
              const now = Date.now();
              if (!assistantMessageId) {
                assistantMessageId = crypto.randomUUID();
                const assistantMessage: Message = {
                  id: assistantMessageId,
                  runId: runId,
                  role: 'assistant',
                  content: assistantContent,
                  createdAt: new Date(),
                };
                this.database.createMessage(assistantMessage);
                lastSaveTime = now;
              } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
                this.database.updateMessage(assistantMessageId, assistantContent);
                lastSaveTime = now;
              }

              // Check for progress updates periodically
              if (now - lastProgressCheck > PROGRESS_CHECK_INTERVAL_MS) {
                parseAndUpdateProgress(this.database, runId, assistantContent);
                lastProgressCheck = now;
              }
            } else if (json.type === 'stream_event' && json.event) {
              if (json.event.type === 'content_block_delta' && json.event.content_block_delta) {
                const delta = json.event.content_block_delta;
                if (delta.text) {
                  assistantContent += delta.text;
                  onMessage(delta.text);
                  
                  const now = Date.now();
                  if (!assistantMessageId) {
                    assistantMessageId = crypto.randomUUID();
                    const assistantMessage: Message = {
                      id: assistantMessageId,
                      runId: runId,
                      role: 'assistant',
                      content: assistantContent,
                      createdAt: new Date(),
                    };
                    this.database.createMessage(assistantMessage);
                    lastSaveTime = now;
                  } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
                    this.database.updateMessage(assistantMessageId, assistantContent);
                    lastSaveTime = now;
                  }

                  if (now - lastProgressCheck > PROGRESS_CHECK_INTERVAL_MS) {
                    parseAndUpdateProgress(this.database, runId, assistantContent);
                    lastProgressCheck = now;
                  }
                }
              } else if (json.event.type === 'message_start' && json.event.message) {
                assistantContent = '';
                assistantMessageId = null;
              }
            }
          } catch {
            // Non-JSON output
          }
        }
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        logger.warn(`stderr: ${data.toString()}`, 'ClaudeAgent');
      });

      childProcess.on('close', (exitCode) => {
        if (assistantMessageId && assistantContent.trim()) {
          this.database.updateMessage(assistantMessageId, assistantContent.trim());
        } else if (!assistantMessageId && assistantContent.trim()) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            runId: runId,
            role: 'assistant',
            content: assistantContent.trim(),
            createdAt: new Date(),
          };
          this.database.createMessage(assistantMessage);
        }

        // Final progress check
        if (assistantContent.trim()) {
          parseAndUpdateProgress(this.database, runId, assistantContent.trim());
        }

        existingTask.process = null;
        existingTask.waitingForInput = true;

        if (exitCode === 0) {
          onComplete();
        } else {
          this.runningTasks.delete(runId);
          onError(new Error(`claude-code exited with code ${exitCode}`));
        }
      });

      childProcess.on('error', (error) => {
        this.runningTasks.delete(runId);
        onError(error);
      });

    } else {
      // No session to resume, start fresh
      const run = this.database.getRun(runId);
      if (!run) {
        onError(new Error(`Run ${runId} not found`));
        return;
      }
      
      const runWithNewPrompt = { ...run, prompt: message };
      return this.startTask(runWithNewPrompt, onMessage, onError, onComplete);
    }
  }

  async stopTask(runId: string): Promise<void> {
    const task = this.runningTasks.get(runId);
    if (task && task.process) {
      task.process.kill();
      this.runningTasks.delete(runId);
      logger.info(`Stopped claude-code`, 'ClaudeAgent', { runId });
    }
  }

  isRunning(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.process !== null;
  }

  isWaitingForInput(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.waitingForInput;
  }
}
