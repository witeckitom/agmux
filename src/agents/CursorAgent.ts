import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, accessSync, constants, readdirSync } from 'fs';
import { resolve } from 'path';
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

      // Use worktree directory - this is critical so changes happen in the worktree, not main branch
      let worktreeCwd = process.cwd();
      
      // Try to find worktree by run ID if path is empty or temp path
      if (!run.worktreePath || run.worktreePath.trim() === '' || run.worktreePath.startsWith('/tmp/')) {
        // Worktree path not set yet or is temp - try to find it by run ID
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
                logger.info(`Found worktree by run ID: ${dir}`, 'CursorAgent', {
                  runId: run.id,
                  runIdPrefix,
                  dirName,
                });
                worktreeCwd = dir;
                break;
              }
            }
            
            // If still not found and there's only one worktree, use it
            if (worktreeCwd === process.cwd() && worktreeDirs.length === 1) {
              logger.info(`Using only available worktree: ${worktreeDirs[0]}`, 'CursorAgent');
              worktreeCwd = worktreeDirs[0];
            }
          } catch (error: any) {
            logger.warn(`Could not search for worktree: ${error.message}`, 'CursorAgent');
          }
        }
        
        if (worktreeCwd === process.cwd()) {
          logger.warn(`No worktree path set for task ${run.id} and could not find worktree by run ID, using current directory: ${worktreeCwd}`, 'CursorAgent', {
            runId: run.id,
            worktreePath: run.worktreePath,
          });
        }
      } else {
        // Resolve to absolute path if it's relative
        const absoluteWorktreePath = run.worktreePath.startsWith('/') 
          ? run.worktreePath 
          : resolve(process.cwd(), run.worktreePath);
        
        if (existsSync(absoluteWorktreePath)) {
          worktreeCwd = absoluteWorktreePath;
          logger.info(`Using worktree directory: ${worktreeCwd}`, 'CursorAgent', {
            originalPath: run.worktreePath,
            resolvedPath: absoluteWorktreePath,
            taskId: run.id,
          });
        } else {
          logger.warn(`Worktree path doesn't exist: ${absoluteWorktreePath}, using current directory: ${worktreeCwd}`, 'CursorAgent', {
            originalPath: run.worktreePath,
            resolvedPath: absoluteWorktreePath,
          });
        }
      }

      // Since cursor is a shell script with a shebang, we can spawn it directly
      // Node.js will use the shebang to determine how to execute it
      // CRITICAL: The cwd must be the worktree directory so all file operations happen there
      logger.info(`Executing cursor command: ${cursorPath} agent "${run.prompt}"`, 'CursorAgent', { 
        cwd: worktreeCwd,
        cursorPath,
        worktreePath: run.worktreePath,
        taskId: run.id,
      });
      
      // Verify we're in the worktree before spawning
      if (run.worktreePath && existsSync(worktreeCwd)) {
        try {
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: worktreeCwd,
            encoding: 'utf-8',
          }).trim();
          logger.info(`Worktree verified: branch ${currentBranch} in ${worktreeCwd}`, 'CursorAgent');
        } catch (error: any) {
          logger.warn(`Could not verify worktree branch: ${error.message}`, 'CursorAgent');
        }
      }
      
      // Verify the worktree is properly set up before spawning
      const gitFile = resolve(worktreeCwd, '.git');
      if (!existsSync(gitFile)) {
        logger.error(`Git worktree not properly set up: .git file not found at ${gitFile}`, 'CursorAgent', {
          worktreeCwd,
          worktreePath: run.worktreePath,
        });
        throw new Error(`Worktree directory ${worktreeCwd} does not appear to be a valid git worktree`);
      }
      
      // Verify we're on the correct branch in the worktree
      try {
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreeCwd,
          encoding: 'utf-8',
        }).trim();
        logger.info(`Worktree branch verified: ${currentBranch}`, 'CursorAgent', {
          worktreeCwd,
          currentBranch,
        });
      } catch (error: any) {
        logger.warn(`Could not verify worktree branch: ${error.message}`, 'CursorAgent');
      }
      
      // Spawn cursor directly - Node.js will handle the shebang
      // CRITICAL: The cwd option ensures all file operations happen in the worktree, not main branch
      // For git worktrees, git automatically detects the worktree from the .git file, so we don't need to set GIT_DIR
      // However, we should ensure the process starts in the worktree directory
      const env = {
        ...process.env,
        // Set PWD to ensure shell commands use the worktree directory
        PWD: worktreeCwd,
      };
      
      // Verify git is actually using the worktree before spawning
      try {
        const gitTopLevel = execSync('git rev-parse --show-toplevel', {
          cwd: worktreeCwd,
          encoding: 'utf-8',
        }).trim();
        
        // For worktrees, git rev-parse --show-toplevel should return the worktree path, not the main repo
        // But it might return the main repo path. Let's check if we're actually in a worktree
        const gitDir = execSync('git rev-parse --git-dir', {
          cwd: worktreeCwd,
          encoding: 'utf-8',
        }).trim();
        
        logger.info(`Git context before spawning`, 'CursorAgent', {
          worktreeCwd,
          gitTopLevel,
          gitDir,
          expectedWorktree: worktreeCwd,
          isWorktree: gitDir.includes('worktrees'),
        });
        
        // If git-dir doesn't contain 'worktrees', we might not be in a proper worktree context
        if (!gitDir.includes('worktrees') && gitTopLevel !== worktreeCwd) {
          logger.warn(`Git context may not be correct for worktree. Top level: ${gitTopLevel}, Expected: ${worktreeCwd}`, 'CursorAgent');
        }
      } catch (error: any) {
        logger.warn(`Could not verify git context: ${error.message}`, 'CursorAgent');
      }
      
      logger.info(`Spawning cursor agent in worktree directory: ${worktreeCwd}`, 'CursorAgent', {
        worktreeCwd,
        worktreePath: run.worktreePath,
        cursorPath,
        prompt: run.prompt.substring(0, 50) + '...',
      });
      
      // IMPORTANT: Prepend the prompt with a directive to work in the current directory
      // This ensures the cursor agent knows to stay in the worktree
      // Also add explicit instruction to NOT change directories
      const enhancedPrompt = `CRITICAL: You are working in a git worktree directory: ${worktreeCwd}. 
- DO NOT change directories (do not use 'cd' command)
- DO NOT navigate to the main repository root
- All file operations MUST happen in the current directory: ${worktreeCwd}
- If you need to reference files, use relative paths from this directory
- The git repository root is NOT where you should work - stay in ${worktreeCwd}

${run.prompt}`;
      
      logger.info(`Starting cursor with enhanced prompt (first 200 chars): ${enhancedPrompt.substring(0, 200)}...`, 'CursorAgent');
      
      // CRITICAL: The cursor agent MUST work in the worktree directory
      // We'll spawn it directly with cwd set, but also verify git context
      // Note: Even though we set cwd, cursor might detect git root and change directories
      // So we also add explicit instructions in the prompt to stay in the worktree
      
      logger.info(`Executing cursor command in worktree: ${worktreeCwd}`, 'CursorAgent', {
        worktreeCwd,
        worktreePath: run.worktreePath,
        cursorPath,
      });
      
      // CRITICAL: We need to ensure the cursor agent stays in the worktree
      // Even though we set cwd, the cursor agent might run `git rev-parse --show-toplevel`
      // and change to that directory. If that returns the main repo, it will work on main.
      //
      // Solution: Set GIT_WORK_TREE environment variable to force git to use worktree context
      // This ensures that even if cursor changes directories, git commands will still operate
      // in the worktree context.
      const worktreeEnv = {
        ...process.env,
        GIT_WORK_TREE: worktreeCwd,
        PWD: worktreeCwd,
        // Ensure OLDPWD is also set to prevent confusion
        OLDPWD: worktreeCwd,
      };
      
      // Verify that git will see the worktree when GIT_WORK_TREE is set
      try {
        const testTopLevel = execSync('git rev-parse --show-toplevel', {
          cwd: worktreeCwd,
          encoding: 'utf-8',
          env: worktreeEnv,
        }).trim();
        
        logger.info(`Git top-level with GIT_WORK_TREE set: ${testTopLevel}`, 'CursorAgent', {
          testTopLevel,
          worktreeCwd,
          expected: worktreeCwd,
          matches: testTopLevel === worktreeCwd,
        });
        
        if (testTopLevel !== worktreeCwd) {
          logger.error(`CRITICAL: Git top-level (${testTopLevel}) does not match worktree (${worktreeCwd}). Cursor will work on wrong branch!`, 'CursorAgent');
        }
      } catch (error: any) {
        logger.warn(`Could not verify git top-level with GIT_WORK_TREE: ${error.message}`, 'CursorAgent');
      }
      
      logger.info(`Spawning cursor with worktree isolation`, 'CursorAgent', {
        cwd: worktreeCwd,
        GIT_WORK_TREE: worktreeCwd,
        PWD: worktreeCwd,
      });
      
      // Spawn cursor with cwd set to worktree AND GIT_WORK_TREE env var
      // The cwd ensures the process starts in the worktree
      // GIT_WORK_TREE ensures git commands operate in the worktree context even if cursor changes dirs
      const cursorProcess = spawn(cursorPath, ['agent', enhancedPrompt], {
        cwd: worktreeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: worktreeEnv,
      });
      
      // Log the actual working directory after spawn (for debugging)
      logger.info(`Cursor process spawned`, 'CursorAgent', {
        pid: cursorProcess.pid,
        cwd: worktreeCwd,
        worktreePath: run.worktreePath,
        shellWrapped: true,
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
