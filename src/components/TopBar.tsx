import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { execSync } from 'child_process';
import { getViewCommands } from '../utils/viewCommands.js';
import { AMUX_LOGO_SMALL } from '../utils/amuxLogo.js';

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
  // Memoize running count calculation to prevent new array creation on every render
  const runningCount = useMemo(() => 
    state.runs.filter(r => r.status === 'running').length,
    [state.runs]
  );
  const viewCommands = useMemo(() => getViewCommands(state.currentView), [state.currentView]);

  // Make nav bar taller to fit ASCII logo (6 lines) + padding
  const navBarHeight = viewCommands.length > 0 && !state.commandMode ? 5 : 4;
  const logoLines = AMUX_LOGO_SMALL.split('\n').filter(line => line.trim());

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
        {viewCommands.length > 0 && !state.commandMode && (
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
      
      {/* Right side - ASCII logo */}
      <Box 
        paddingX={1}
        justifyContent="center"
        alignItems="flex-end"
        flexDirection="column"
      >
        <Box flexDirection="column">
          {logoLines.map((line, index) => (
            <Text key={index} color="cyan" bold>
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
});
