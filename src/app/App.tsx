import React, { useEffect, useMemo } from 'react';
import { Box, useApp as useInkApp } from 'ink';
import { AppProvider, useApp } from '../context/AppContext.js';
import { SettingsProvider } from '../context/SettingsContext.js';
import { TopBar } from '../components/TopBar.js';
import { MainView } from '../components/MainView.js';
import { CommandMode } from '../components/CommandMode.js';
import { LogView } from '../components/LogView.js';
import { ConfirmationDialog } from '../components/ConfirmationDialog.js';
import { useKeyboard } from '../hooks/useKeyboard.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';

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
    logger.info('Application started', 'App');
    refreshRuns();
    if (state.commandMode) {
      // Don't refresh while typing commands
      return;
    }
    const interval = setInterval(() => {
      refreshRuns();
      logger.debug('Refreshed runs', 'App', { runCount: state.runs.length });
    }, 3000); // Increased to 3 seconds
    return () => clearInterval(interval);
  }, [refreshRuns, state.commandMode, state.runs.length]);

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

  // Calculate heights for layout
  const topBarHeight = 4; // TopBar with commands
  const commandModeHeight = state.commandMode ? 3 : 0;
  const logViewHeight = state.logsVisible ? 8 : 0;
  const mainViewHeight = Math.max(
    1,
    terminalDimensions.height - topBarHeight - commandModeHeight - logViewHeight
  );

  // If confirmation dialog is showing, render it instead of main content
  if (state.confirmation) {
    return (
      <Box
        flexDirection="column"
        width={terminalDimensions.width}
        height={terminalDimensions.height}
      >
        <ConfirmationDialog
          message={state.confirmation.message}
          onConfirm={state.confirmation.onConfirm}
          onCancel={state.confirmation.onCancel}
        />
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={terminalDimensions.width}
      height={terminalDimensions.height}
    >
      <TopBar />
      <CommandMode />
      <MainView height={mainViewHeight} />
      {state.logsVisible && <LogView height={logViewHeight} />}
    </Box>
  );
}

interface AppProps {
  database: DatabaseManager;
  projectRoot: string;
}

export function App({ database, projectRoot }: AppProps) {
  return (
    <SettingsProvider database={database}>
      <AppProvider database={database} projectRoot={projectRoot}>
        <AppContent database={database} />
      </AppProvider>
    </SettingsProvider>
  );
}
