import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ViewType, Run } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';

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
}

interface AppContextValue {
  state: AppState;
  database: DatabaseManager;
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
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  database: DatabaseManager;
  projectRoot: string;
}

export function AppProvider({ children, database, projectRoot }: AppProviderProps) {
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


  return (
    <AppContext.Provider
      value={{
        state,
        database,
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
