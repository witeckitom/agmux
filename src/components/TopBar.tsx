import React, { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

  // Read logo from file - try agmux installation directory, not project directory
  const logoLines = useMemo(() => {
    try {
      // Get the directory where this module is located
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      // Try to find logo relative to the dist directory (when built) or src (when running with tsx)
      const possiblePaths = [
        join(__dirname, '..', 'agmux_logo'), // When running from dist/components/
        join(__dirname, '..', '..', 'src', 'agmux_logo'), // When running from dist/
        join(__dirname, 'agmux_logo'), // When running from src/components/ (development)
      ];
      
      for (const logoPath of possiblePaths) {
        if (existsSync(logoPath)) {
          const logoContent = readFileSync(logoPath, 'utf-8').trim();
          return logoContent.split('\n');
        }
      }
      return [];
    } catch {
      // Fallback to empty array if file can't be read
      return [];
    }
  }, []);

  // Calculate min height based on logo lines + padding
  // paddingTop={1} and paddingBottom={1} add 2 lines total
  // Add extra buffer to account for border and prevent clipping
  const navBarMinHeight = logoLines.length > 0 ? logoLines.length + 3 : 8;

  return (
    <Box 
      width="100%"
      borderStyle="single" 
      borderBottom={true} 
      minHeight={navBarMinHeight}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      flexShrink={0}
    >
      {/* Main row: logo on left, flex box on right */}
      <Box flexDirection="row" paddingX={1} alignItems="flex-start">
        {/* Left side: logo */}
        {logoLines.length > 0 ? (
          <Box flexDirection="column" marginTop={-1}>
            {logoLines.map((line, index) => (
              <Text key={index} color="cyan">
                {line}
              </Text>
            ))}
          </Box>
        ) : null}
        {/* Flex box taking remaining space: project info left, running tasks right */}
        <Box flexGrow={1} flexDirection="row" alignItems="flex-start" marginLeft={2}>
          {/* Left side: project/branch/view */}
          <Box flexDirection="column" marginTop={-0.5}>
            <Text>
              <Text bold color="cyan">Project:</Text> {projectName} |{' '}
              <Text bold color="cyan">Branch:</Text> {gitBranch} |{' '}
              <Text bold color="cyan">View:</Text> {contextDisplay}
            </Text>
          </Box>
          {/* Spacer to push running count to right */}
          <Box flexGrow={1} />
          {/* Right side: running count/help */}
          <Box flexDirection="column" alignItems="flex-end">
            <Text dimColor>
              {runningCount} running | <Text bold>Shift+H</Text> help
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
