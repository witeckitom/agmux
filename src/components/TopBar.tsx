import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { execSync } from 'child_process';

export const TopBar = React.memo(function TopBar() {
  const { state } = useApp();
  const [gitBranch, setGitBranch] = useState<string>('main');
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  useEffect(() => {
    // Try to get current git branch
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: state.projectRoot,
        encoding: 'utf-8',
      }).trim();
      setGitBranch(branch);
    } catch {
      // Not a git repo or git not available
      setGitBranch('main');
    }
  }, [state.projectRoot]);

  const projectName = state.projectRoot.split('/').pop() || 'unknown';
  const contextDisplay = state.currentView;
  const runningCount = state.runs.filter(r => r.status === 'running').length;

  return (
    <Box 
      width={terminalWidth}
      borderStyle="single" 
      borderBottom={true} 
      height={3}
    >
      <Box paddingX={1} flexGrow={1}>
        <Text>
          <Text bold color="cyan">Project:</Text> {projectName} |{' '}
          <Text bold color="cyan">Branch:</Text> {gitBranch} |{' '}
          <Text bold color="cyan">View:</Text> {contextDisplay}
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          {runningCount} running | <Text bold>:</Text> commands
        </Text>
      </Box>
    </Box>
  );
});
