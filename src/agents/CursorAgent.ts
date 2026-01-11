import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, accessSync, constants, readdirSync } from 'fs';
import { resolve } from 'path';
import { Agent } from './Agent.js';
import { Run, Message } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';

interface TaskProcess {
  process: ChildProcess | null; // null when process has exited but task is waiting for input
  waitingForInput: boolean;
  worktreePath: string;
  stdoutBuffer: string;
  assistantMessageId: string | null;
  lastSaveTime: number;
  onMessage: (content: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export class CursorAgent implements Agent {
  private database: DatabaseManager;
  private runningTasks: Map<string, TaskProcess> = new Map();
  private readonly SAVE_INTERVAL_MS = 500;

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  private checkCursorAvailable(): { available: boolean; path?: string } {
    const commonPaths = [
      '/usr/local/bin/cursor',
      '/opt/homebrew/bin/cursor',
      '/usr/bin/cursor',
    ];

    for (const path of commonPaths) {
      try {
        if (existsSync(path)) {
          accessSync(path, constants.X_OK);
          logger.debug(`Found cursor at common path: ${path}`, 'CursorAgent');
          return { available: true, path };
        }
      } catch {
        // Path doesn't exist or isn't executable
      }
    }

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

    logger.warn('Cursor not found in PATH or common locations', 'CursorAgent');
    return { available: false };
  }

  private resolveWorktreePath(run: Run): string {
    let worktreeCwd = process.cwd();
    
    if (!run.worktreePath || run.worktreePath.trim() === '' || run.worktreePath.startsWith('/tmp/')) {
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
              logger.info(`Found worktree by run ID: ${dir}`, 'CursorAgent');
              worktreeCwd = dir;
              break;
            }
          }
          
          if (worktreeCwd === process.cwd() && worktreeDirs.length === 1) {
            logger.info(`Using only available worktree: ${worktreeDirs[0]}`, 'CursorAgent');
            worktreeCwd = worktreeDirs[0];
          }
        } catch (error: any) {
          logger.warn(`Could not search for worktree: ${error.message}`, 'CursorAgent');
        }
      }
      
      if (worktreeCwd === process.cwd()) {
        logger.warn(`No worktree path set for task ${run.id}, using current directory`, 'CursorAgent');
      }
    } else {
      const absoluteWorktreePath = run.worktreePath.startsWith('/') 
        ? run.worktreePath 
        : resolve(process.cwd(), run.worktreePath);
      
      if (existsSync(absoluteWorktreePath)) {
        worktreeCwd = absoluteWorktreePath;
        logger.info(`Using worktree directory: ${worktreeCwd}`, 'CursorAgent');
      } else {
        logger.warn(`Worktree path doesn't exist: ${absoluteWorktreePath}`, 'CursorAgent');
      }
    }
    
    return worktreeCwd;
  }

  private createEnhancedPrompt(prompt: string, worktreeCwd: string): string {
    return `CRITICAL: You are working in a git worktree directory: ${worktreeCwd}. 
- DO NOT change directories (do not use 'cd' command)
- DO NOT navigate to the main repository root
- All file operations MUST happen in the current directory: ${worktreeCwd}
- If you need to reference files, use relative paths from this directory
- The git repository root is NOT where you should work - stay in ${worktreeCwd}

${prompt}`;
  }

  private createWorktreeEnv(worktreeCwd: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      GIT_WORK_TREE: worktreeCwd,
      PWD: worktreeCwd,
      OLDPWD: worktreeCwd,
    };
  }

  private verifyWorktree(worktreeCwd: string): void {
    const gitFile = resolve(worktreeCwd, '.git');
    if (!existsSync(gitFile)) {
      throw new Error(`Worktree directory ${worktreeCwd} does not appear to be a valid git worktree`);
    }
    
    try {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreeCwd,
        encoding: 'utf-8',
      }).trim();
      logger.info(`Worktree branch verified: ${currentBranch}`, 'CursorAgent', { worktreeCwd });
    } catch (error: any) {
      logger.warn(`Could not verify worktree branch: ${error.message}`, 'CursorAgent');
    }
  }

  private setupProcessHandlers(runId: string, taskProcess: TaskProcess): void {
    const cursorProcess = taskProcess.process;
    if (!cursorProcess) return;

    cursorProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      taskProcess.stdoutBuffer += chunk;
      taskProcess.onMessage(chunk);
      
      logger.debug(`Cursor stdout received for task ${runId}`, 'CursorAgent', { 
        chunkLength: chunk.length,
        totalLength: taskProcess.stdoutBuffer.length,
        preview: chunk.substring(0, 100),
      });

      const now = Date.now();
      if (!taskProcess.assistantMessageId) {
        taskProcess.assistantMessageId = crypto.randomUUID();
        const assistantMessage: Message = {
          id: taskProcess.assistantMessageId,
          runId: runId,
          role: 'assistant',
          content: taskProcess.stdoutBuffer,
          createdAt: new Date(),
        };
        this.database.createMessage(assistantMessage);
        taskProcess.lastSaveTime = now;
        logger.debug(`Created assistant message for task ${runId}`, 'CursorAgent', { 
          messageId: taskProcess.assistantMessageId,
        });
      } else if (now - taskProcess.lastSaveTime > this.SAVE_INTERVAL_MS) {
        this.database.updateMessage(taskProcess.assistantMessageId, taskProcess.stdoutBuffer);
        taskProcess.lastSaveTime = now;
        logger.debug(`Updated assistant message for task ${runId}`, 'CursorAgent', { 
          messageId: taskProcess.assistantMessageId,
          contentLength: taskProcess.stdoutBuffer.length,
        });
      }
    });

    cursorProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      logger.warn(`Cursor agent stderr for task ${runId}`, 'CursorAgent', { stderr: chunk });
    });

    cursorProcess.on('close', (code: number | null) => {
      const task = this.runningTasks.get(runId);
      if (!task) return;

      // Final save of assistant message
      if (task.assistantMessageId && task.stdoutBuffer.trim()) {
        this.database.updateMessage(task.assistantMessageId, task.stdoutBuffer.trim());
      } else if (!task.assistantMessageId && task.stdoutBuffer.trim()) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          runId: runId,
          role: 'assistant',
          content: task.stdoutBuffer.trim(),
          createdAt: new Date(),
        };
        this.database.createMessage(assistantMessage);
      }

      // Process has exited - mark as waiting for input
      // Keep the task in our map so we can continue the conversation
      task.process = null;
      task.waitingForInput = true;
      task.stdoutBuffer = '';
      task.assistantMessageId = null;
      
      if (code === 0) {
        logger.info(`Cursor agent completed for task ${runId}, waiting for user input`, 'CursorAgent');
        task.onComplete();
      } else {
        // On error, remove from running tasks entirely
        this.runningTasks.delete(runId);
        const error = new Error(`Cursor agent exited with code ${code}`);
        logger.error(`Cursor agent failed for task ${runId}`, 'CursorAgent', { code });
        task.onError(error);
      }
    });

    cursorProcess.on('error', (error: Error & { code?: string }) => {
      const task = this.runningTasks.get(runId);
      this.runningTasks.delete(runId);
      
      let errorMessage = error.message;
      if (error.code === 'ENOENT') {
        errorMessage = `Cursor command not found. Please ensure Cursor is installed and the 'cursor' command is in your PATH.`;
      }
      
      const enhancedError = new Error(errorMessage);
      logger.error(`Cursor agent error for task ${runId}`, 'CursorAgent', { error: enhancedError.message });
      task?.onError(enhancedError);
    });
  }

  private spawnCursorProcess(
    runId: string,
    prompt: string,
    worktreePath: string,
    onMessage: (content: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): void {
    const cursorCheck = this.checkCursorAvailable();
    const cursorPath = cursorCheck.path || 'cursor';
    
    if (!cursorCheck.available) {
      logger.warn(`Cursor check failed, attempting to use '${cursorPath}' anyway`, 'CursorAgent');
    }

    const enhancedPrompt = this.createEnhancedPrompt(prompt, worktreePath);
    const worktreeEnv = this.createWorktreeEnv(worktreePath);
    
    logger.info(`Spawning cursor process`, 'CursorAgent', {
      cwd: worktreePath,
      taskId: runId,
    });
    
    const cursorProcess = spawn(cursorPath, ['agent', enhancedPrompt], {
      cwd: worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: worktreeEnv,
    });
    
    logger.info(`Cursor process spawned`, 'CursorAgent', {
      pid: cursorProcess.pid,
      cwd: worktreePath,
    });

    const taskProcess: TaskProcess = {
      process: cursorProcess,
      waitingForInput: false,
      worktreePath: worktreePath,
      stdoutBuffer: '',
      assistantMessageId: null,
      lastSaveTime: Date.now(),
      onMessage,
      onError,
      onComplete,
    };

    this.runningTasks.set(runId, taskProcess);
    this.setupProcessHandlers(runId, taskProcess);
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
      logger.info(`Task ${run.id} has existing context, continuing conversation`, 'CursorAgent');
      return this.sendMessage(run.id, run.prompt, onMessage, onError, onComplete);
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

      logger.info(`Starting Cursor agent for task ${run.id}`, 'CursorAgent');

      // Resolve and verify worktree
      const worktreePath = this.resolveWorktreePath(run);
      this.verifyWorktree(worktreePath);
      
      // Spawn the cursor process
      this.spawnCursorProcess(run.id, run.prompt, worktreePath, onMessage, onError, onComplete);
      
    } catch (error: any) {
      logger.error(`Error starting Cursor agent for task ${run.id}`, 'CursorAgent', { error });
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
    // Save user message to database
    const userMessage: Message = {
      id: crypto.randomUUID(),
      runId: runId,
      role: 'user',
      content: message,
      createdAt: new Date(),
    };
    this.database.createMessage(userMessage);

    const existingTask = this.runningTasks.get(runId);
    
    if (existingTask && existingTask.waitingForInput) {
      // We have context from a previous run - spawn new process in same worktree
      logger.info(`Continuing conversation for task ${runId}`, 'CursorAgent');
      
      try {
        // Update callbacks for this continuation
        existingTask.onMessage = onMessage;
        existingTask.onError = onError;
        existingTask.onComplete = onComplete;
        existingTask.waitingForInput = false;
        
        // Spawn new cursor process in the same worktree
        this.spawnCursorProcess(
          runId,
          message,
          existingTask.worktreePath,
          onMessage,
          onError,
          onComplete
        );
        
      } catch (error: any) {
        logger.error(`Error continuing Cursor agent for task ${runId}`, 'CursorAgent', { error });
        this.runningTasks.delete(runId);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      // No existing task context - get run from database and start fresh
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
    if (task) {
      if (task.process) {
        task.process.kill('SIGTERM');
      }
      this.runningTasks.delete(runId);
      logger.info(`Stopped Cursor agent for task ${runId}`, 'CursorAgent');
    }
  }

  isRunning(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.process !== null && !task.waitingForInput;
  }

  isWaitingForInput(runId: string): boolean {
    const task = this.runningTasks.get(runId);
    return task !== undefined && task.waitingForInput;
  }
}
