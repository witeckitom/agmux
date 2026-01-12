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
  sessionId: string | null;  // Cursor's session ID for resuming
  waitingForInput: boolean;
}

// Cursor JSON output types
interface CursorJsonMessage {
  type: 'system' | 'user' | 'assistant' | 'thinking' | 'tool_call' | 'result';
  session_id?: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
  text?: string;  // for thinking
  subtype?: string;
  model?: string;
}

export class CursorAgent implements Agent {
  private database: DatabaseManager;
  private runningTasks: Map<string, TaskState> = new Map();
  private static totalSpawnCount = 0;

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  private findCursorAgent(): string | null {
    // Try cursor-agent first (the CLI tool)
    const paths = [
      '/usr/local/bin/cursor-agent',
      '/opt/homebrew/bin/cursor-agent',
    ];

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Try which
    try {
      const result = execSync('which cursor-agent', { 
        encoding: 'utf-8', 
        stdio: 'pipe' 
      }).trim();
      if (result && existsSync(result)) {
        return result;
      }
    } catch {
      // Not found via which
    }

    // Fallback to cursor agent (space)
    try {
      const result = execSync('which cursor', { 
        encoding: 'utf-8', 
        stdio: 'pipe' 
      }).trim();
      if (result && existsSync(result)) {
        return result;  // Will use 'cursor agent' subcommand
      }
    } catch {
      // Not found
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
          .filter(dirent => dirent.isDirectory())
          .map(dirent => resolve(worktreesDir, dirent.name));
        
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
      logger.warn(`Task ${run.id} already has a running process, ignoring`, 'CursorAgent');
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

    const cursorPath = this.findCursorAgent();
    if (!cursorPath) {
      onError(new Error('cursor-agent not found. Please install it with: curl https://cursor.com/install | bash'));
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
      
      CursorAgent.totalSpawnCount++;
      logger.info(`=== SPAWN #${CursorAgent.totalSpawnCount} ===`, 'CursorAgent', {
        runId: run.id,
        cwd: worktreeCwd,
      });

      // Build command args: -p for print mode, --output-format=stream-json for JSON output
      const isCursorAgent = cursorPath.includes('cursor-agent');
      const args = isCursorAgent 
        ? ['-p', '--output-format=stream-json']
        : ['agent', '-p', '--output-format=stream-json'];

      logger.info(`Running: ${cursorPath} ${args.join(' ')}`, 'CursorAgent');

      const childProcess = spawn(cursorPath, args, {
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

      // Write prompt to stdin and close it
      if (childProcess.stdin) {
        childProcess.stdin.write(run.prompt);
        childProcess.stdin.end();
        logger.info(`Sent prompt via stdin (${run.prompt.length} chars)`, 'CursorAgent');
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
            const json: CursorJsonMessage = JSON.parse(line);
            
            // Extract session_id if present
            if (json.session_id && !taskState.sessionId) {
              taskState.sessionId = json.session_id;
              logger.info(`Got session_id: ${json.session_id}`, 'CursorAgent');
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
            } else if (json.type === 'thinking' && json.text) {
              // Could show thinking indicator
              logger.debug(`Thinking: ${json.text.substring(0, 50)}...`, 'CursorAgent');
            } else if (json.type === 'tool_call') {
              logger.debug(`Tool call: ${json.subtype}`, 'CursorAgent');
            } else if (json.type === 'system') {
              if (json.model) {
                logger.info(`Using model: ${json.model}`, 'CursorAgent');
              }
            }
          } catch (e) {
            // Not JSON, might be plain text output
            logger.debug(`Non-JSON output: ${line.substring(0, 100)}`, 'CursorAgent');
          }
        }
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        logger.warn(`stderr: ${text}`, 'CursorAgent');
      });

      childProcess.on('close', (exitCode) => {
        logger.info(`Process exited`, 'CursorAgent', { exitCode, sessionId: taskState.sessionId });

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
          onError(new Error(`cursor-agent exited with code ${exitCode}`));
        }
      });

      childProcess.on('error', (error) => {
        logger.error(`Process error`, 'CursorAgent', { error });
        this.runningTasks.delete(run.id);
        onError(error);
      });

    } catch (error: any) {
      logger.error(`Error starting cursor-agent`, 'CursorAgent', { error });
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
    
    logger.info(`sendMessage called`, 'CursorAgent', {
      runId,
      hasExistingTask: !!existingTask,
      processRunning: existingTask?.process !== null,
      waitingForInput: existingTask?.waitingForInput,
      hasSessionId: !!existingTask?.sessionId,
    });
    
    if (existingTask && existingTask.process !== null) {
      logger.warn(`Task ${runId} already has a running process, ignoring sendMessage`, 'CursorAgent');
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
      const cursorPath = this.findCursorAgent();
      if (!cursorPath) {
        onError(new Error('cursor-agent not found'));
        return;
      }

      CursorAgent.totalSpawnCount++;
      logger.info(`=== SPAWN #${CursorAgent.totalSpawnCount} (resume) ===`, 'CursorAgent', {
        runId,
        sessionId: existingTask.sessionId,
      });

      const isCursorAgent = cursorPath.includes('cursor-agent');
      const args = isCursorAgent 
        ? ['-p', '--output-format=stream-json', '--resume', existingTask.sessionId]
        : ['agent', '-p', '--output-format=stream-json', '--resume', existingTask.sessionId];

      logger.info(`Running: ${cursorPath} ${args.join(' ')}`, 'CursorAgent');

      const childProcess = spawn(cursorPath, args, {
        cwd: existingTask.worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      existingTask.process = childProcess;
      existingTask.waitingForInput = false;

      // Write message to stdin and close
      if (childProcess.stdin) {
        childProcess.stdin.write(message);
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
            const json: CursorJsonMessage = JSON.parse(line);
            
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
            }
          } catch {
            // Non-JSON output
          }
        }
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        logger.warn(`stderr: ${data.toString()}`, 'CursorAgent');
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
          onError(new Error(`cursor-agent exited with code ${exitCode}`));
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
      logger.info(`Stopped cursor-agent`, 'CursorAgent', { runId });
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
