import React, { useEffect, useMemo } from 'react';
import { Box, useApp as useInkApp } from 'ink';
import { AppProvider, useApp } from '../context/AppContext.js';
import { TopBar } from '../components/TopBar.js';
import { MainView } from '../components/MainView.js';
import { CommandMode } from '../components/CommandMode.js';
import { useKeyboard } from '../hooks/useKeyboard.js';
import { DatabaseManager } from '../db/database.js';

interface AppContentProps {
  database: DatabaseManager;
}

function AppContent({ database }: AppContentProps) {
  const { exit } = useInkApp();
  const { state, refreshRuns, executeCommand } = useApp();

  // Set up keyboard handling
  useKeyboard();

  // Initial load and periodic refresh
  // Pause refresh when in command mode to prevent flickering
  useEffect(() => {
    refreshRuns();
    if (state.commandMode) {
      // Don't refresh while typing commands
      return;
    }
    const interval = setInterval(refreshRuns, 3000); // Increased to 3 seconds
    return () => clearInterval(interval);
  }, [refreshRuns, state.commandMode]);

  // Handle quit command
  useEffect(() => {
    if (!state.commandMode && state.currentView === 'tasks' && state.runs.length === 0) {
      // Could add auto-quit logic here if needed
    }
  }, [state]);

  // Get terminal dimensions for full-screen layout
  // Memoize to prevent recalculation on every render
  const terminalDimensions = useMemo(() => ({
    height: process.stdout.rows || 24,
    width: process.stdout.columns || 80,
  }), []);

  return (
    <Box 
      flexDirection="column" 
      width={terminalDimensions.width}
      height={terminalDimensions.height}
    >
      <TopBar />
      <CommandMode />
      <MainView />
    </Box>
  );
}

interface AppProps {
  database: DatabaseManager;
  projectRoot: string;
}

export function App({ database, projectRoot }: AppProps) {
  return (
    <AppProvider database={database} projectRoot={projectRoot}>
      <AppContent database={database} />
    </AppProvider>
  );
}
