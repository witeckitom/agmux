import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, accessSync, constants } from 'fs';
import { Agent } from './Agent.js';
import { Run, Message } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';

export class CursorAgent implements Agent {
  private database: DatabaseManager;
  private runningTasks: Map<string, { process: ChildProcess }> = new Map();

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  private checkCursorAvailable(): { available: boolean; path?: string } {
    // Try common installation paths first (more reliable, using fs module)
    const commonPaths = [
      '/usr/local/bin/cursor',
      '/opt/homebrew/bin/cursor',
      '/usr/bin/cursor',
    ];

    for (const path of commonPaths) {
      try {
        if (existsSync(path)) {
          // Check if it's executable
          accessSync(path, constants.X_OK);
          logger.debug(`Found cursor at common path: ${path}`, 'CursorAgent');
          return { available: true, path };
        }
      } catch {
        // Path doesn't exist or isn't executable
      }
    }

    // Fall back to which command
    try {
      const whichResult = execSync('which cursor', { 
        encoding: 'utf-8', 
        stdio: 'pipe',
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
      }).trim();
      if (whichResult && whichResult.length > 0 && existsSync(whichResult)) {
        logger.debug(`Found cursor via which: ${whichResult}`, 'CursorAgent');
        return { available: true, path: whichResult };
      }
    } catch (error: any) {
      logger.debug(`which cursor failed: ${error.message}`, 'CursorAgent');
    }

    logger.warn('Cursor not found in PATH or common locations', 'CursorAgent', { 
      PATH: process.env.PATH 
    });
    return { available: false };
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

    // Check if cursor is available
    const cursorCheck = this.checkCursorAvailable();
    logger.info(`Cursor availability check result:`, 'CursorAgent', { 
      available: cursorCheck.available, 
      path: cursorCheck.path,
      PATH: process.env.PATH 
    });
    
    // If check fails, still try to use 'cursor' command - let spawn handle the error
    // This is more permissive and handles edge cases where the check might fail
    // but the command still works
    const cursorPath = cursorCheck.path || 'cursor';
    
    if (!cursorCheck.available) {
      logger.warn(`Cursor check failed, but attempting to use '${cursorPath}' anyway`, 'CursorAgent');
      // Don't return early - let the spawn attempt happen and handle errors there
    }

    try {
      // Save user message (only if it's not already the last message)
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

      logger.info(`Starting Cursor agent for task ${run.id}`, 'CursorAgent');

      // Change to worktree directory if it exists, otherwise use current directory
      let worktreeCwd = process.cwd();
      if (run.worktreePath && existsSync(run.worktreePath)) {
        worktreeCwd = run.worktreePath;
        logger.debug(`Using worktree directory: ${worktreeCwd}`, 'CursorAgent');
      } else {
        logger.debug(`Worktree path doesn't exist (${run.worktreePath}), using current directory: ${worktreeCwd}`, 'CursorAgent');
      }

      // Since cursor is a shell script with a shebang, we can spawn it directly
      // Node.js will use the shebang to determine how to execute it
      logger.debug(`Executing cursor command: ${cursorPath} agent "${run.prompt}"`, 'CursorAgent', { 
        cwd: worktreeCwd,
        cursorPath 
      });
      
      // Spawn cursor directly - Node.js will handle the shebang
      const cursorProcess = spawn(cursorPath, ['agent', run.prompt], {
        cwd: worktreeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      this.runningTasks.set(run.id, { process: cursorProcess });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let assistantMessageId: string | null = null;
      let lastSaveTime = Date.now();
      const SAVE_INTERVAL_MS = 500; // Save to DB every 500ms

      cursorProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        onMessage(chunk);

        // Create or update assistant message incrementally
        const now = Date.now();
        if (!assistantMessageId) {
          // Create initial message
          assistantMessageId = crypto.randomUUID();
          const assistantMessage: Message = {
            id: assistantMessageId,
            runId: run.id,
            role: 'assistant',
            content: stdoutBuffer,
            createdAt: new Date(),
          };
          this.database.createMessage(assistantMessage);
          lastSaveTime = now;
        } else if (now - lastSaveTime > SAVE_INTERVAL_MS) {
          // Update existing message periodically
          this.database.updateMessage(assistantMessageId, stdoutBuffer);
          lastSaveTime = now;
        }
      });

      cursorProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuffer += chunk;
        // Log errors but don't necessarily fail
        logger.warn(`Cursor agent stderr for task ${run.id}`, 'CursorAgent', { stderr: chunk });
      });

      cursorProcess.on('close', (code: number | null) => {
        this.runningTasks.delete(run.id);

        // Final save of assistant message
        if (assistantMessageId && stdoutBuffer.trim()) {
          this.database.updateMessage(assistantMessageId, stdoutBuffer.trim());
        } else if (!assistantMessageId && stdoutBuffer.trim()) {
          // Create message if it wasn't created during streaming
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            runId: run.id,
            role: 'assistant',
            content: stdoutBuffer.trim(),
            createdAt: new Date(),
          };
          this.database.createMessage(assistantMessage);
        }

        if (code === 0) {
          logger.info(`Cursor agent completed for task ${run.id}`, 'CursorAgent');
          onComplete();
        } else {
          const error = new Error(`Cursor agent exited with code ${code}`);
          logger.error(`Cursor agent failed for task ${run.id}`, 'CursorAgent', { code, stderr: stderrBuffer });
          onError(error);
        }
      });

      cursorProcess.on('error', (error: Error & { code?: string }) => {
        this.runningTasks.delete(run.id);
        let errorMessage = error.message;
        
        if (error.code === 'ENOENT') {
          errorMessage = `Cursor command not found at '${cursorPath}'. Please ensure Cursor is installed and the 'cursor' command is in your PATH. You can check by running 'which cursor' in your terminal. Original error: ${error.message}`;
        }
        
        const enhancedError = new Error(errorMessage);
        logger.error(`Cursor agent error for task ${run.id}`, 'CursorAgent', { 
          error: enhancedError.message,
          code: error.code,
          syscall: (error as any).syscall,
          cursorPath,
          cwd: worktreeCwd
        });
        onError(enhancedError);
      });
    } catch (error: any) {
      logger.error(`Error starting Cursor agent for task ${run.id}`, 'CursorAgent', { error });
      this.runningTasks.delete(run.id);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async stopTask(runId: string): Promise<void> {
    const task = this.runningTasks.get(runId);
    if (task) {
      task.process.kill('SIGTERM');
      this.runningTasks.delete(runId);
      logger.info(`Stopped Cursor agent for task ${runId}`, 'CursorAgent');
    }
  }

  isRunning(runId: string): boolean {
    return this.runningTasks.has(runId);
  }
}
