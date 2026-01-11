import React, { useEffect, useMemo, useState } from 'react';
import { Box, useApp as useInkApp } from 'ink';
import { AppProvider, useApp } from '../context/AppContext.js';
import { SettingsProvider } from '../context/SettingsContext.js';
import { InputProvider } from '../context/InputContext.js';
import { TopBar, updateTopBarStore } from '../components/TopBar.js';
import { MainView } from '../components/MainView.js';
import { setCurrentViewExternal } from '../components/ViewRouter.js';
import { CommandMode } from '../components/CommandMode.js';
import { LogView } from '../components/LogView.js';
import { ConfirmationDialog } from '../components/ConfirmationDialog.js';
import { MergeBranchPromptView } from '../views/MergeBranchPromptView.js';
import { KeyboardHandler } from '../components/KeyboardHandler.js';
import { SplashScreen } from '../components/SplashScreen.js';
import { DatabaseManager } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json
const packageJsonPath = join(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

interface AppContentProps {
  database: DatabaseManager;
}

// Memoize AppContent to prevent re-renders when CommandMode updates
const AppContent = React.memo(function AppContent({ database }: AppContentProps) {

  const { exit } = useInkApp();
  const appContext = useApp();
  const [showSplash, setShowSplash] = useState(true);

  // Only read what we need - don't destructure state to avoid subscribing to all changes
  const commandMode = appContext.state.commandMode;
  const logsVisible = appContext.state.logsVisible;
  const mergePrompt = appContext.state.mergePrompt;
  const confirmation = appContext.state.confirmation;
  const currentView = appContext.state.currentView;
  const runsLength = appContext.state.runs.length;
  
  // Sync currentView to external store for ViewRouter
  // This allows ViewRouter to not depend on the full context
  useEffect(() => {
    setCurrentViewExternal(currentView);
  }, [currentView]);
  
  // Calculate running count for TopBar
  const runningCount = useMemo(() => 
    appContext.state.runs.filter(r => r.status === 'running').length,
    [appContext.state.runs]
  );
  
  // Sync TopBar data to external store
  // This allows TopBar to not depend on the full context
  useEffect(() => {
    updateTopBarStore({
      projectRoot: appContext.state.projectRoot,
      currentView,
      runningCount,
      commandMode,
    });
  }, [appContext.state.projectRoot, currentView, runningCount, commandMode]);

  // Initial load only - everything else is reactive
  useEffect(() => {
    logger.info('Application started', 'App');
    appContext.refreshRuns();
  }, [appContext.refreshRuns]);

  // Handle quit command
  useEffect(() => {
    if (!commandMode && currentView === 'tasks' && runsLength === 0) {
      // Could add auto-quit logic here if needed
    }
  }, [commandMode, currentView, runsLength]);

  // Get terminal dimensions for full-screen layout
  // Memoize to prevent recalculation on every render
  // NOTE: Using rows - 1 to prevent Ink flickering issue
  // See: https://github.com/vadimdemedes/ink/issues/359
  const terminalDimensions = useMemo(() => ({
    height: (process.stdout.rows || 24) - 1,
    width: process.stdout.columns || 80,
  }), []);

  // Calculate heights for layout - memoize to prevent recalculation
  const layoutHeights = useMemo(() => {
    const topBarHeight = 5; // TopBar with ASCII logo
    const commandModeHeight = commandMode ? 3 : 0;
    const logViewHeight = logsVisible ? 8 : 0;
    const mainViewHeight = Math.max(
      1,
      terminalDimensions.height - topBarHeight - commandModeHeight - logViewHeight
    );
    return { topBarHeight, commandModeHeight, logViewHeight, mainViewHeight };
  }, [terminalDimensions.height, commandMode, logsVisible]);

        // If merge prompt is showing, render it instead of main content
        if (mergePrompt) {
          return (
            <Box flexDirection="column" height={terminalDimensions.height}>
              <MergeBranchPromptView
                runId={mergePrompt.runId}
                defaultBranch={mergePrompt.defaultBranch}
                onConfirm={async (branch: string) => {
                  try {
                    await appContext.mergeTaskBranch(mergePrompt!.runId, branch);
                    appContext.hideMergePrompt();
                  } catch (error) {
                    logger.error('Merge failed', 'App', { error });
                    // Keep prompt open on error so user can try again
                  }
                }}
                onCancel={() => {
                  appContext.hideMergePrompt();
                }}
              />
            </Box>
          );
        }

        // If confirmation dialog is showing, render it instead of main content
        if (confirmation) {
          return (
            <Box flexDirection="column" height={terminalDimensions.height}>
              <KeyboardHandler />
              <ConfirmationDialog
                message={confirmation.message}
                onConfirm={confirmation.onConfirm}
                onCancel={confirmation.onCancel}
              />
            </Box>
          );
        }

  // Show splash screen on initial load
  if (showSplash) {
    return (
      <Box flexDirection="column" height={terminalDimensions.height}>
        <SplashScreen
          version={packageJson.version}
          onComplete={() => setShowSplash(false)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={terminalDimensions.height}>
      <KeyboardHandler />
      <TopBar />
      <CommandMode isCommandMode={commandMode} />
      <MainView />
      {logsVisible && <LogView height={layoutHeights.logViewHeight} />}
    </Box>
  );
});

interface AppProps {
  database: DatabaseManager;
  projectRoot: string;
}

export function App({ database, projectRoot }: AppProps) {
  return (
    <InputProvider>
      <SettingsProvider database={database}>
        <AppProvider database={database} projectRoot={projectRoot}>
          <AppContent database={database} />
        </AppProvider>
      </SettingsProvider>
    </InputProvider>
  );
}
