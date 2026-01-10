import React, { useMemo, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function renderProgressBar(percent: number, width: number): string {
  const barWidth = Math.max(10, width - 2);
  const filled = Math.floor((percent / 100) * barWidth);
  const empty = barWidth - filled;
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
}

export function TaskDetailView() {
  const { state, refreshRuns } = useApp();
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);
  const terminalHeight = useMemo(() => process.stdout.rows || 24, []);
  
  const selectedRun = useMemo(() => {
    if (!state.selectedRunId) return null;
    return state.runs.find(r => r.id === state.selectedRunId) || null;
  }, [state.runs, state.selectedRunId]);

  const [runningTime, setRunningTime] = useState<number>(0);

  useEffect(() => {
    if (!selectedRun || selectedRun.status !== 'running') {
      setRunningTime(0);
      return;
    }

    // Calculate initial running time
    const now = Date.now();
    const startTime = selectedRun.updatedAt.getTime();
    setRunningTime(now - startTime);

    const interval = setInterval(() => {
      const now = Date.now();
      const startTime = selectedRun.updatedAt.getTime();
      setRunningTime(now - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedRun]);

  useEffect(() => {
    // Refresh runs periodically when viewing task detail
    const interval = setInterval(() => {
      refreshRuns();
    }, 2000);
    return () => clearInterval(interval);
  }, [refreshRuns]);

  if (!selectedRun) {
    return (
      <Box padding={2} flexDirection="column">
        <Text color="red">Task not found</Text>
      </Box>
    );
  }

  // Calculate column widths (3 columns with 2 separators)
  const separatorWidth = 1;
  const availableWidth = terminalWidth - separatorWidth * 2;
  const columnWidth = Math.floor(availableWidth / 3);

  // Calculate available height (accounting for status bar)
  const statusBarHeight = 3;
  const availableHeight = terminalHeight - statusBarHeight;

  const statusColor = selectedRun.status === 'running' ? 'green' : 
                     selectedRun.status === 'completed' ? 'cyan' :
                     selectedRun.status === 'failed' ? 'red' :
                     selectedRun.status === 'cancelled' ? 'yellow' : 'gray';

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* Status bar at top */}
      <Box borderBottom={true} borderStyle="single" paddingX={1} paddingY={0} height={statusBarHeight}>
        <Box flexDirection="column" width="100%">
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text bold color="cyan">Task:</Text>
              <Text> {selectedRun.id.slice(0, 8)}</Text>
              <Text dimColor> | </Text>
              <Text bold color={statusColor}>Status:</Text>
              <Text color={statusColor}> {selectedRun.status}</Text>
              {selectedRun.status === 'running' && (
                <>
                  <Text dimColor> | </Text>
                  <Text bold>Running:</Text>
                  <Text> {formatDuration(runningTime)}</Text>
                </>
              )}
            </Box>
            <Box>
              <Text>
                {renderProgressBar(selectedRun.progressPercent, 30)} <Text bold color="cyan">{selectedRun.progressPercent}%</Text>
              </Text>
            </Box>
          </Box>
          <Box>
            <Text dimColor>{selectedRun.prompt || 'No prompt'}</Text>
          </Box>
        </Box>
      </Box>

      {/* Three column layout */}
      <Box flexDirection="row" flexGrow={1} height={availableHeight}>
        {/* Chat column */}
        <Box 
          width={columnWidth} 
          borderRight={true} 
          borderStyle="single" 
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">Chat</Text>
          </Box>
          <Box flexGrow={1}>
            <Text dimColor>No messages yet</Text>
          </Box>
        </Box>

        {/* Files changed column */}
        <Box 
          width={columnWidth} 
          borderRight={true} 
          borderStyle="single" 
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">Files Changed</Text>
          </Box>
          <Box flexGrow={1}>
            <Text dimColor>No files changed yet</Text>
          </Box>
        </Box>

        {/* Changes/Diff column */}
        <Box 
          width={columnWidth} 
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">Changes</Text>
          </Box>
          <Box flexGrow={1}>
            <Text dimColor>No changes to display</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
