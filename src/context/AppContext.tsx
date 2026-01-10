import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ViewType, Run } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';

interface AppState {
  currentView: ViewType;
  selectedIndex: number;
  runs: Run[];
  commandMode: boolean;
  commandInput: string;
  projectRoot: string;
  currentBranch?: string;
}

interface AppContextValue {
  state: AppState;
  database: DatabaseManager;
  setCurrentView: (view: ViewType) => void;
  setSelectedIndex: (index: number) => void;
  refreshRuns: () => void;
  setCommandMode: (enabled: boolean) => void;
  setCommandInput: (input: string) => void;
  executeCommand: (command: string) => void;
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
    projectRoot,
    currentBranch: undefined,
  });

  const refreshRuns = useCallback(() => {
    const runs = database.getAllRuns();
    setState(prev => ({
      ...prev,
      runs,
      selectedIndex: Math.min(prev.selectedIndex, Math.max(0, runs.length - 1)),
    }));
  }, [database]);

  const setCurrentView = useCallback((view: ViewType) => {
    setState(prev => ({ ...prev, currentView: view, selectedIndex: 0 }));
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

  const executeCommand = useCallback(
    (command: string) => {
      const parts = command.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      switch (cmd) {
        case 'tasks':
        case 'task':
          setCurrentView('tasks');
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
        case 'refresh':
        case 'r':
          refreshRuns();
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

  // Helper to get autocomplete suggestions
  const getAutocompleteSuggestions = useCallback((input: string): string[] => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
      return ['tasks', 'skills', 'commands', 'hooks', 'profiles', 'agents'];
    }

    const suggestions: string[] = [];
    for (const cmd of [
      { name: 'tasks', aliases: ['task'] },
      { name: 'skills', aliases: ['skill'] },
      { name: 'commands', aliases: ['command'] },
      { name: 'hooks', aliases: ['hook'] },
      { name: 'profiles', aliases: ['profile'] },
      { name: 'agents', aliases: ['agent'] },
      { name: 'refresh', aliases: ['r'] },
      { name: 'quit', aliases: ['q'] },
    ]) {
      if (cmd.name.startsWith(trimmed) || cmd.aliases?.some(a => a.startsWith(trimmed))) {
        suggestions.push(cmd.name);
      }
    }
    return suggestions;
  }, []);

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
        executeCommand,
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
