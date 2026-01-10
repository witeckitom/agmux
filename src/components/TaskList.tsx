import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { Run } from '../models/types.js';

function formatStatus(status: Run['status']): string {
  const statusMap: Record<Run['status'], string> = {
    queued: '⏳',
    running: '▶',
    completed: '✓',
    failed: '✗',
    cancelled: '⊘',
  };
  return statusMap[status] || status;
}

function formatPhase(phase: Run['phase']): string {
  const phaseMap: Record<Run['phase'], string> = {
    worktree_creation: 'Creating worktree',
    setup_hooks: 'Setup hooks',
    agent_execution: 'Agent running',
    cleanup_hooks: 'Cleanup',
    finalization: 'Finalizing',
  };
  return phaseMap[phase] || phase;
}

export const TaskList = React.memo(function TaskList() {
  const { state } = useApp();
  const { runs, selectedIndex } = state;

  if (runs.length === 0) {
    return (
      <Box padding={2} flexDirection="column">
        <Text dimColor>No runs yet.</Text>
        <Text dimColor>Press ':' to open command mode and start a new run.</Text>
        <Text dimColor>Use j/k or arrow keys to navigate when runs are available.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} paddingY={1} borderStyle="single" borderBottom={true}>
        <Text bold>
          Tasks ({runs.length}) - Use j/k or ↑/↓ to navigate, Enter to view details
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {runs.map((run, index) => (
        <Box
          key={run.id}
          paddingX={1}
          paddingY={0}
        >
            <Text
              inverse={index === selectedIndex}
              color={index === selectedIndex ? 'white' : undefined}
            >
              {formatStatus(run.status)} [{run.status}] {run.id.slice(0, 8)} -{' '}
              {run.prompt || 'No prompt'}
            </Text>
            <Text dimColor={index !== selectedIndex}>
              {'   '}
              {formatPhase(run.phase)} | {run.progressPercent}% ({run.completedSubtasks}/
              {run.totalSubtasks} tasks)
              {run.readyToAct && ' | ⚠ Ready for input'}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
});
