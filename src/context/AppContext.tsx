import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { ViewType, Run } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { TaskExecutor } from '../services/TaskExecutor.js';
import { mergeToBranch, getPRUrl } from '../utils/gitUtils.js';
import { execSync } from 'child_process';

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
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  database: DatabaseManager;
  projectRoot: string;
}

export function AppProvider({ children, database, projectRoot }: AppProviderProps) {
  const taskExecutor = useRef<TaskExecutor>(new TaskExecutor(database)).current;

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
  });

  const refreshRuns = useCallback(() => {
    const runs = database.getAllRuns();
    logger.debug(`Refreshing runs: found ${runs.length} runs`, 'App');
    setState(prev => ({
      ...prev,
      runs,
      selectedIndex: Math.min(prev.selectedIndex, Math.max(0, runs.length - 1)),
    }));
  }, [database]);

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
      commandInput: enabled ? '' : '',
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

  const toggleTaskStatus = useCallback(
    async (runId: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Attempted to toggle status for non-existent run: ${runId}`, 'App');
        return;
      }

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
    },
    [state.runs, database, refreshRuns]
  );

  const sendMessageToTask = useCallback(
    async (runId: string, message: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) {
        logger.warn(`Attempted to send message to non-existent run: ${runId}`, 'App');
        return;
      }

      if (!run.readyToAct) {
        logger.warn(`Task ${runId} is not ready for input`, 'App');
        return;
      }

      try {
        // Update prompt with new message and clear readyToAct
        database.updateRun(runId, {
          prompt: message,
          readyToAct: false,
          status: 'running',
        });

        // Refresh to get updated run
        refreshRuns();
        const updatedRun = database.getRun(runId);
        if (updatedRun) {
          // Restart the agent with the new message
          await taskExecutor.startTask(runId);
          refreshRuns();
        }
      } catch (error: any) {
        logger.error(`Failed to send message to task ${runId}`, 'App', { error });
        refreshRuns();
      }
    },
    [state.runs, database, refreshRuns, taskExecutor]
  );

  const mergeTaskBranch = useCallback(
    async (runId: string, targetBranch: string) => {
      const run = state.runs.find(r => r.id === runId);
      if (!run || !run.worktreePath) {
        logger.warn(`Cannot merge: run ${runId} not found or no worktree`, 'App');
        return;
      }

      try {
        const result = mergeToBranch(run.worktreePath, targetBranch);
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
    [state.runs, refreshRuns]
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

  return (
    <AppContext.Provider
      value={{
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
      }}
    >
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
