import React, { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  // Read logo from file - try src/agmux_logo relative to project root
  const logoLines = useMemo(() => {
    try {
      const logoPath = join(storeData.projectRoot, 'src', 'agmux_logo');
      const logoContent = readFileSync(logoPath, 'utf-8').trim();
      return logoContent.split('\n');
    } catch {
      // Fallback to empty array if file can't be read
      return [];
    }
  }, [storeData.projectRoot]);

  // Calculate min height based on logo lines + padding
  // paddingTop={1} and paddingBottom={1} add 2 lines total
  // Add extra buffer to account for border and prevent clipping
  const navBarMinHeight = logoLines.length > 0 ? logoLines.length + 3 : 8;

  return (
    <Box 
      width={terminalWidth}
      borderStyle="single" 
      borderBottom={true} 
      minHeight={navBarMinHeight}
      flexDirection="row"
      paddingTop={1}
      paddingBottom={1}
      alignItems="flex-start"
    >
      {/* Left side - logo */}
      <Box paddingX={1} flexDirection="column">
        {logoLines.map((line, index) => (
          <Text key={index} color="cyan">
            {line}
          </Text>
        ))}
      </Box>
      {/* Right side - content */}
      <Box flexDirection="row" flexGrow={1} paddingX={1} alignItems="flex-start">
        <Box paddingX={1} paddingY={0} flexGrow={1}>
          <Text>
            <Text bold color="cyan">Project:</Text> {projectName} |{' '}
            <Text bold color="cyan">Branch:</Text> {gitBranch} |{' '}
            <Text bold color="cyan">View:</Text> {contextDisplay}
          </Text>
        </Box>
        <Box paddingX={1} paddingY={0}>
          <Text dimColor>
            {runningCount} running | <Text bold>Shift+H</Text> help
          </Text>
        </Box>
      </Box>
    </Box>
  );
});
