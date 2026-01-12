import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo } from 'react';
import { ViewType, Run } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { TaskExecutor } from '../services/TaskExecutor.js';
import { mergeToBranch, getPRUrl } from '../utils/gitUtils.js';
import { removeWorktree } from '../utils/gitWorktree.js';
import { execSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, readdirSync } from 'fs';

interface ConfirmationState {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface AppState {
  currentView: ViewType;
  selectedIndex: number;
  runs: Run[];
  commandMode: boolean;
  commandInput: string;
  logsVisible: boolean;
  projectRoot: string;
  currentBranch?: string;
  confirmation: ConfirmationState | null;
  selectedRunId: string | null;
  mergePrompt: { runId: string; defaultBranch: string } | null;
  chatEditing: boolean; // True when user is typing in chat input
}

interface AppContextValue {
  state: AppState;
  database: DatabaseManager;
  taskExecutor: TaskExecutor;
  setCurrentView: (view: ViewType) => void;
  setSelectedIndex: (index: number) => void;
  refreshRuns: () => void;
  setCommandMode: (enabled: boolean) => void;
  setCommandInput: (input: string) => void;
  setLogsVisible: (visible: boolean) => void;
  toggleLogs: () => void;
  executeCommand: (command: string) => void;
  showConfirmation: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  hideConfirmation: () => void;
  deleteRun: (runId: string) => void;
  setSelectedRunId: (runId: string | null) => void;
  toggleTaskStatus: (runId: string) => void;
  sendMessageToTask: (runId: string, message: string) => Promise<void>;
  showMergePrompt: (runId: string, defaultBranch: string) => void;
  hideMergePrompt: () => void;
  mergeTaskBranch: (runId: string, targetBranch: string) => Promise<void>;
  openPRForTask: (runId: string) => Promise<void>;
  markTaskComplete: (runId: string) => void;
  openWorktreeInVSCode: (runId: string) => void;
  setChatEditing: (editing: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  database: DatabaseManager;
  projectRoot: string;
}

export function AppProvider({ children, database, projectRoot }: AppProviderProps) {
  const refreshRunsRef = useRef<(() => void) | null>(null);
  
  const refreshRuns = useCallback(() => {
    const runs = database.getAllRuns();
    logger.debug(`Refreshing runs: found ${runs.length} runs`, 'App');
    setState(prev => {
      // Only update if runs actually changed (by comparing IDs)
      const prevRunIds = prev.runs.map(r => r.id).join(',');
      const newRunIds = runs.map(r => r.id).join(',');
      
      if (prevRunIds === newRunIds) {
        // Check if any run data changed
        const runsChanged = prev.runs.some((prevRun, index) => {
          const newRun = runs[index];
          return !newRun || 
                 prevRun.status !== newRun.status ||
                 prevRun.progressPercent !== newRun.progressPercent ||
                 prevRun.phase !== newRun.phase ||
                 prevRun.readyToAct !== newRun.readyToAct ||
                 prevRun.durationMs !== newRun.durationMs;
        });
        
        if (!runsChanged) {
          // No changes, return previous state to prevent re-render
          return prev;
        }
      }
      
      return {
        ...prev,
        runs,
        selectedIndex: Math.min(prev.selectedIndex, Math.max(0, runs.length - 1)),
      };
    });
  }, [database]);

  // Store refreshRuns in ref so TaskExecutor can access it
  refreshRunsRef.current = refreshRuns;

  const taskExecutor = useRef<TaskExecutor>(
    new TaskExecutor(database, () => {
      // Call refreshRuns when TaskExecutor notifies of updates
      if (refreshRunsRef.current) {
        refreshRunsRef.current();
      }
    })
  ).current;

  const [state, setState] = useState<AppState>({
    currentView: 'tasks',
    selectedIndex: 0,
    runs: [],
    commandMode: false,
    commandInput: '',
    logsVisible: false,
    projectRoot,
    currentBranch: undefined,
    confirmation: null,
    selectedRunId: null,
    mergePrompt: null,
    chatEditing: false,
  });

  const setCurrentView = useCallback((view: ViewType) => {
    setState(prev => {
      if (prev.currentView !== view) {
        logger.info(`View changed: ${prev.currentView} -> ${view}`, 'App');
      }
      return { ...prev, currentView: view, selectedIndex: 0 };
    });
  }, []);

  const setSelectedIndex = useCallback((index: number) => {
    setState(prev => {
      const maxIndex = prev.runs.length > 0 ? prev.runs.length - 1 : 0;
      return { ...prev, selectedIndex: Math.max(0, Math.min(index, maxIndex)) };
    });
  }, []);

  const setCommandMode = useCallback((enabled: boolean) => {
    setState(prev => ({ 
      ...prev, 
      commandMode: enabled,
      // Don't clear commandInput here - let InputContext handle it
    }));
  }, []);

  const setCommandInput = useCallback((input: string) => {
    setState(prev => {
      // Only update if input actually changed to prevent unnecessary re-renders
      if (prev.commandInput === input) {
        return prev;
      }
      return { ...prev, commandInput: input };
    });
  }, []);

  const setLogsVisible = useCallback((visible: boolean) => {
    setState(prev => ({ ...prev, logsVisible: visible }));
  }, []);

  const toggleLogs = useCallback(() => {
    setState(prev => ({ ...prev, logsVisible: !prev.logsVisible }));
  }, []);

  const executeCommand = useCallback(
    (command: string) => {
      const parts = command.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      switch (cmd) {
        case 'tasks':
        case 'task':
          setCurrentView('tasks');
          break;
        case 'new-task':
          // This is now triggered by hotkey 'T', not command mode
          setCurrentView('new-task');
          break;
        case 'skills':
        case 'skill':
          setCurrentView('skills');
          break;
        case 'commands':
        case 'command':
          setCurrentView('commands');
          break;
        case 'hooks':
        case 'hook':
          setCurrentView('hooks');
          break;
        case 'profiles':
        case 'profile':
          setCurrentView('profiles');
          break;
        case 'agents':
        case 'agent':
          setCurrentView('agents');
          break;
        case 'settings':
        case 'setting':
          setCurrentView('settings');
          break;
        case 'quit':
        case 'q':
          // Quit will be handled by useKeyboard hook
          break;
        default:
          // Unknown command - could show error or ignore
          break;
      }

      setCommandMode(false);
    },
    [setCurrentView, refreshRuns, setCommandMode]
  );

  const showConfirmation = useCallback(
    (message: string, onConfirm: () => void, onCancel?: () => void) => {
      setState(prev => ({
        ...prev,
        confirmation: {
          message,
          onConfirm: () => {
            onConfirm();
            setState(p => ({ ...p, confirmation: null }));
          },
          onCancel: () => {
            if (onCancel) {
              onCancel();
            }
            setState(p => ({ ...p, confirmation: null }));
          },
        },
      }));
    },
    []
  );

  const hideConfirmation = useCallback(() => {
    setState(prev => ({ ...prev, confirmation: null }));
  }, []);

  const deleteRun = useCallback(
    (runId: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Attempted to delete non-existent run: ${runId}`, 'App');
        return;
      }

      const prompt = run.prompt || 'this task';
      showConfirmation(
        `Delete task "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}"?`,
        () => {
          // Delete the worktree if it exists and task is not set to retain it
          if (run.worktreePath && run.worktreePath.trim() !== '' && !run.retainWorktree) {
            try {
              logger.info(`Attempting to remove worktree for deleted task: ${runId}`, 'App', { 
                worktreePath: run.worktreePath,
                retainWorktree: run.retainWorktree 
              });
              
              // Git worktree remove needs the path relative to repo root (e.g., .worktrees/branch-name)
              // The database stores absolute paths, but git expects relative paths
              let worktreePathForRemoval: string;
              
              if (run.worktreePath.startsWith('/')) {
                // Absolute path - convert to relative by removing projectRoot prefix
                const normalizedProjectRoot = projectRoot.replace(/\/$/, ''); // Remove trailing slash
                const normalizedWorktreePath = run.worktreePath.replace(/\/$/, ''); // Remove trailing slash
                
                if (normalizedWorktreePath.startsWith(normalizedProjectRoot + '/')) {
                  worktreePathForRemoval = normalizedWorktreePath.substring(normalizedProjectRoot.length + 1);
                  logger.debug(`Converted absolute to relative path`, 'App', {
                    absolute: run.worktreePath,
                    relative: worktreePathForRemoval
                  });
                } else {
                  // Path doesn't start with projectRoot - try to extract .worktrees part
                  const worktreesMatch = normalizedWorktreePath.match(/\.worktrees\/[^/]+/);
                  if (worktreesMatch) {
                    worktreePathForRemoval = worktreesMatch[0];
                    logger.debug(`Extracted worktree path from absolute`, 'App', {
                      absolute: run.worktreePath,
                      extracted: worktreePathForRemoval
                    });
                  } else {
                    // Fallback: use absolute path (git might accept it)
                    worktreePathForRemoval = run.worktreePath;
                    logger.debug(`Using absolute path as fallback`, 'App', {
                      path: worktreePathForRemoval
                    });
                  }
                }
              } else {
                // Already relative
                worktreePathForRemoval = run.worktreePath;
                logger.debug(`Using relative path as-is`, 'App', {
                  path: worktreePathForRemoval
                });
              }
              
              // Check if worktree directory exists before trying to remove
              const absolutePath = resolve(projectRoot, worktreePathForRemoval);
              if (existsSync(absolutePath)) {
                logger.info(`Removing worktree: ${worktreePathForRemoval}`, 'App');
                removeWorktree(worktreePathForRemoval);
                logger.info(`Successfully removed worktree for deleted task: ${runId}`, 'App', { 
                  worktreePath: worktreePathForRemoval,
                  absolutePath 
                });
              } else {
                logger.debug(`Worktree path does not exist, skipping removal: ${absolutePath}`, 'App');
              }
            } catch (error: any) {
              // Log but don't fail deletion if worktree removal fails
              // The task will still be deleted even if worktree removal fails
              logger.error(`Failed to remove worktree for deleted task ${runId}`, 'App', { 
                error: error.message || String(error),
                worktreePath: run.worktreePath,
                stack: error.stack
              });
            }
          } else {
            logger.debug(`Skipping worktree removal for task ${runId}`, 'App', {
              hasWorktreePath: !!run.worktreePath,
              worktreePath: run.worktreePath,
              retainWorktree: run.retainWorktree
            });
          }
          
          const deleted = database.deleteRun(runId);
          if (deleted) {
            logger.info(`Deleted run: ${runId}`, 'App');
            refreshRuns();
          } else {
            logger.warn(`Failed to delete run: ${runId}`, 'App');
          }
        }
      );
    },
    [state.runs, database, refreshRuns, showConfirmation]
  );

  const setSelectedRunId = useCallback((runId: string | null) => {
    setState(prev => ({ ...prev, selectedRunId: runId }));
  }, []);

  // HARD LOCK for toggleTaskStatus to prevent repeated calls
  const toggleLockRef = useRef<Set<string>>(new Set());
  
  const toggleTaskStatus = useCallback(
    async (runId: string) => {
      // HARD LOCK CHECK
      if (toggleLockRef.current.has(runId)) {
        logger.error(`BLOCKED: toggleTaskStatus already in progress for ${runId}`, 'App');
        return;
      }
      toggleLockRef.current.add(runId);
      
      try {
        const run = state.runs.find(r => r.id === runId);
        if (!run) {
          logger.warn(`Attempted to toggle status for non-existent run: ${runId}`, 'App');
          return;
        }

        logger.info(`toggleTaskStatus called for ${runId}, current status: ${run.status}, readyToAct: ${run.readyToAct}`, 'App');

        if (run.status === 'queued' || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
          // Start the task
          logger.info(`Starting task: ${runId}`, 'App');
          try {
            await taskExecutor.startTask(runId);
            refreshRuns();
          } catch (error: any) {
            logger.error(`Failed to start task ${runId}`, 'App', { error });
            refreshRuns();
          }
        } else if (run.status === 'running') {
          // Stop the task - calculate and save duration
          logger.info(`Stopping task: ${runId}`, 'App');
          try {
            await taskExecutor.stopTask(runId);
            const now = new Date();
            const durationMs = now.getTime() - run.createdAt.getTime();
            database.updateRun(runId, { 
              status: 'cancelled',
              completedAt: now,
              durationMs: durationMs
            });
            refreshRuns();
          } catch (error: any) {
            logger.error(`Failed to stop task ${runId}`, 'App', { error });
            refreshRuns();
          }
        }
      } finally {
        // Release lock after 3 seconds to prevent rapid re-calls
        setTimeout(() => {
          toggleLockRef.current.delete(runId);
        }, 3000);
      }
    },
    [state.runs, database, refreshRuns]
  );

  const sendMessageToTask = useCallback(
    async (runId: string, message: string) => {
      // Read fresh from database to avoid stale state issues
      const run = database.getRun(runId);
      if (!run) {
        logger.warn(`Attempted to send message to non-existent run: ${runId}`, 'App');
        return;
      }

      try {
        // Use TaskExecutor's sendMessageToTask which handles everything
        // - Creates agent if needed
        // - Uses existing worktree  
        // - Manages conversation state
        await taskExecutor.sendMessageToTask(runId, message);
        refreshRuns();
      } catch (error: any) {
        logger.error(`Failed to send message to task ${runId}`, 'App', { error });
        refreshRuns();
      }
    },
    [database, refreshRuns, taskExecutor]
  );

  const mergeTaskBranch = useCallback(
    async (runId: string, targetBranch: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Cannot merge: run ${runId} not found`, 'App');
        throw new Error(`Run ${runId} not found`);
      }

      // Resolve worktree path (handles empty paths by searching)
      let worktreePath = run.worktreePath || '';
      if (!worktreePath || worktreePath.startsWith('/tmp/') || worktreePath.trim() === '') {
        const worktreesDir = join(projectRoot, '.worktrees');
        if (existsSync(worktreesDir)) {
          try {
            const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => join(worktreesDir, dirent.name));
            
            const runIdPrefix = runId.slice(0, 8);
            for (const dir of worktreeDirs) {
              const dirName = dir.split('/').pop() || '';
              if (dirName.includes(runIdPrefix)) {
                worktreePath = dir;
                break;
              }
            }
          } catch (error: any) {
            logger.warn(`Could not search for worktree: ${error.message}`, 'App');
          }
        }
      }

      // Verify worktree exists
      if (!worktreePath || worktreePath.trim() === '' || !existsSync(worktreePath)) {
        logger.warn(`Cannot merge: no worktree found for run ${runId}`, 'App', { 
          storedPath: run.worktreePath,
          resolvedPath: worktreePath 
        });
        throw new Error(`No worktree found for task ${runId}`);
      }

      try {
        const result = mergeToBranch(worktreePath, targetBranch);
        if (result.success) {
          logger.info(`Merged task ${runId} branch to ${targetBranch}`, 'App');
          refreshRuns();
        } else {
          logger.error(`Failed to merge task ${runId}`, 'App', { error: result.error });
          throw new Error(result.error || 'Merge failed');
        }
      } catch (error: any) {
        logger.error(`Error merging task ${runId}`, 'App', { error });
        throw error;
      }
    },
    [state.runs, refreshRuns, projectRoot]
  );

  const openPRForTask = useCallback(
    async (runId: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run || !run.worktreePath) {
        logger.warn(`Cannot open PR: run ${runId} not found or no worktree`, 'App');
        return;
      }

      try {
        const prUrl = getPRUrl(run.worktreePath, run.baseBranch);
        if (!prUrl) {
          throw new Error('Could not determine PR URL. Make sure the repository has a remote configured.');
        }

        // Open URL in default browser
        const command = process.platform === 'darwin' 
          ? 'open' 
          : process.platform === 'win32' 
          ? 'start' 
          : 'xdg-open';
        
        execSync(`${command} "${prUrl}"`, { stdio: 'ignore' });
        logger.info(`Opened PR URL for task ${runId}: ${prUrl}`, 'App');
      } catch (error: any) {
        logger.error(`Failed to open PR for task ${runId}`, 'App', { error });
        throw error;
      }
    },
    [state.runs]
  );

  const showMergePrompt = useCallback(
    (runId: string, defaultBranch: string) => {
      setState(prev => ({
        ...prev,
        mergePrompt: { runId, defaultBranch },
      }));
    },
    []
  );

  const hideMergePrompt = useCallback(() => {
    setState(prev => ({ ...prev, mergePrompt: null }));
  }, []);

  const markTaskComplete = useCallback(
    (runId: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Attempted to mark non-existent run as complete: ${runId}`, 'App');
        return;
      }

      const now = new Date();
      const durationMs = run.durationMs || (now.getTime() - run.createdAt.getTime());
      
      database.updateRun(runId, {
        status: 'completed',
        phase: 'finalization',
        completedAt: now,
        durationMs: durationMs,
        readyToAct: false,
      });
      refreshRuns();
      logger.info(`Marked task ${runId} as complete`, 'App');
    },
    [state.runs, database, refreshRuns]
  );

  const openWorktreeInVSCode = useCallback(
    (runId: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Cannot open worktree: run ${runId} not found`, 'App');
        return;
      }

      try {
        // Find the actual worktree path (handle empty/temp paths)
        let worktreePath = run.worktreePath || '';
        
        // If path is empty or temp, try to find it by run ID
        if (!worktreePath || worktreePath.startsWith('/tmp/') || worktreePath.trim() === '') {
          const projectRoot = process.cwd();
          const worktreesDir = join(projectRoot, '.worktrees');
          
          if (existsSync(worktreesDir)) {
            try {
              const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => join(worktreesDir, dirent.name));
              
              const runIdPrefix = runId.slice(0, 8);
              for (const dir of worktreeDirs) {
                const dirName = dir.split('/').pop() || '';
                if (dirName.includes(runIdPrefix)) {
                  worktreePath = dir;
                  break;
                }
              }
            } catch (error: any) {
              logger.warn(`Could not search for worktree: ${error.message}`, 'App');
            }
          }
        }
        
        if (!worktreePath || worktreePath.startsWith('/tmp/') || worktreePath.trim() === '') {
          logger.warn(`Cannot open worktree: no valid worktree path found for run ${runId}`, 'App');
          return;
        }

        // Resolve to absolute path
        const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
        
        // Verify path exists
        if (!existsSync(absolutePath)) {
          logger.warn(`Worktree path does not exist: ${absolutePath}`, 'App');
          return;
        }

        // Open in VSCode using 'code' command
        execSync(`code "${absolutePath}"`, { stdio: 'ignore' });
        logger.info(`Opened worktree in VSCode for task ${runId}`, 'App', { worktreePath: absolutePath });
      } catch (error: any) {
        logger.error(`Failed to open worktree in VSCode for task ${runId}`, 'App', { error });
      }
    },
    [state.runs]
  );

  const setChatEditing = useCallback((editing: boolean) => {
    setState(prev => ({ ...prev, chatEditing: editing }));
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    state,
    database,
    taskExecutor,
    setCurrentView,
    setSelectedIndex,
    refreshRuns,
    setCommandMode,
    setCommandInput,
    setLogsVisible,
    toggleLogs,
    executeCommand,
    showConfirmation,
    hideConfirmation,
    deleteRun,
    setSelectedRunId,
    toggleTaskStatus,
    sendMessageToTask,
    showMergePrompt,
    hideMergePrompt,
    mergeTaskBranch,
    openPRForTask,
    markTaskComplete,
    openWorktreeInVSCode,
    setChatEditing,
  }), [
    state,
    database,
    taskExecutor,
    setCurrentView,
    setSelectedIndex,
    refreshRuns,
    setCommandMode,
    setCommandInput,
    setLogsVisible,
    toggleLogs,
    executeCommand,
    showConfirmation,
    hideConfirmation,
    deleteRun,
    setSelectedRunId,
    toggleTaskStatus,
    sendMessageToTask,
    showMergePrompt,
    hideMergePrompt,
    mergeTaskBranch,
    openPRForTask,
    markTaskComplete,
    openWorktreeInVSCode,
    setChatEditing,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
