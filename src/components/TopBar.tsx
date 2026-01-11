import React, { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { getViewCommands } from '../utils/viewCommands.js';
import { ViewType } from '../models/types.js';

// External store for TopBar data - only updates when relevant data changes
let topBarStore: {
  projectRoot: string;
  currentView: string;
  runningCount: number;
  commandMode: boolean;
  listeners: Set<() => void>;
} = {
  projectRoot: process.cwd(),
  currentView: 'tasks',
  runningCount: 0,
  commandMode: false,
  listeners: new Set(),
};

export function updateTopBarStore(data: Partial<typeof topBarStore>) {
  let changed = false;
  if (data.projectRoot !== undefined && data.projectRoot !== topBarStore.projectRoot) {
    topBarStore.projectRoot = data.projectRoot;
    changed = true;
  }
  if (data.currentView !== undefined && data.currentView !== topBarStore.currentView) {
    topBarStore.currentView = data.currentView;
    changed = true;
  }
  if (data.runningCount !== undefined && data.runningCount !== topBarStore.runningCount) {
    topBarStore.runningCount = data.runningCount;
    changed = true;
  }
  if (data.commandMode !== undefined && data.commandMode !== topBarStore.commandMode) {
    topBarStore.commandMode = data.commandMode;
    changed = true;
  }
  if (changed) {
    topBarStore.listeners.forEach(listener => listener());
  }
}

function subscribeToTopBar(callback: () => void) {
  topBarStore.listeners.add(callback);
  return () => topBarStore.listeners.delete(callback);
}

function getTopBarSnapshot() {
  return topBarStore;
}

export const TopBar = React.memo(function TopBar() {
  // Use external store instead of context to avoid re-renders on unrelated changes
  const storeData = useSyncExternalStore(subscribeToTopBar, getTopBarSnapshot);
  const [gitBranch, setGitBranch] = useState<string>('main');
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  useEffect(() => {
    // Try to get current git branch
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: storeData.projectRoot,
        encoding: 'utf-8',
      }).trim();
      setGitBranch(branch);
    } catch {
      // Not a git repo or git not available
      setGitBranch('main');
    }
  }, [storeData.projectRoot]);

  const projectName = storeData.projectRoot.split('/').pop() || 'unknown';
  const contextDisplay = storeData.currentView;
  const runningCount = storeData.runningCount;
  const viewCommands = useMemo(() => getViewCommands(storeData.currentView as ViewType), [storeData.currentView]);

  const navBarHeight = viewCommands.length > 0 && !storeData.commandMode ? 5 : 4;

  return (
    <Box 
      width={terminalWidth}
      borderStyle="single" 
      borderBottom={true} 
      height={navBarHeight}
      flexDirection="row"
    >
      {/* Left side - content */}
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row">
          <Box paddingX={1} flexGrow={1}>
            <Text>
              <Text bold color="cyan">Project:</Text> {projectName} |{' '}
              <Text bold color="cyan">Branch:</Text> {gitBranch} |{' '}
              <Text bold color="cyan">View:</Text> {contextDisplay}
            </Text>
          </Box>
          <Box paddingX={1}>
            <Text dimColor>
              {runningCount} running | <Text bold>:</Text> nav | <Text bold>Shift+L</Text> logs
            </Text>
          </Box>
        </Box>
        {viewCommands.length > 0 && !storeData.commandMode && (
          <Box paddingX={1} paddingY={0}>
            <Text dimColor>
              {viewCommands.map((cmd, index) => (
                <Text key={cmd.key}>
                  {index > 0 && ' | '}
                  <Text bold color="yellow">{cmd.key}</Text>
                  {' - '}
                  {cmd.description}
                </Text>
              ))}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
});
