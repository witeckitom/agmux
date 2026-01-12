import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Run } from '../models/types.js';
import { Spinner } from './Spinner.js';

interface TaskCardProps {
  run: Run;
  selected?: boolean;
  width?: number;
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

function renderProgressBar(percent: number, width: number): string {
  const barWidth = Math.max(10, width - 2); // Minimum 10 chars
  const filled = Math.floor((percent / 100) * barWidth);
  const empty = barWidth - filled;
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
}

function formatDuration(ms: number, showSeconds: boolean = false): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    if (showSeconds) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${minutes} min`;
  }
  if (showSeconds) {
    return `${seconds}s`;
  }
  return '< 1 min';
}

// Isolated timer component - only this component re-renders on interval,
// not the entire TaskCard. This prevents screen flashing.
function IsolatedCardTimer({ startTime, showSeconds = false }: { startTime: Date; showSeconds?: boolean }) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    // Update every minute since we only show minutes on kanban cards
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  
  const elapsed = now - startTime.getTime();
  return <Text>{formatDuration(elapsed, showSeconds)}</Text>;
}

export const TaskCard = React.memo(function TaskCard({ run, selected = false, width = 45 }: TaskCardProps) {
  const progressBarWidth = Math.max(8, width - 6); // Account for padding, minimum 8 chars
  const progressBar = renderProgressBar(run.progressPercent, progressBarWidth);
  // Use name if available, otherwise fall back to prompt or ID
  const displayText = run.name || run.prompt || run.id.slice(0, 8);
  const maxDisplayLength = Math.max(10, width - 4);
  const truncatedDisplay =
    displayText.length > maxDisplayLength
      ? displayText.slice(0, maxDisplayLength - 3) + '...'
      : displayText;

  const isRunning = run.status === 'running';
  const isCompleted = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const showCompletedDuration = isCompleted && run.durationMs && run.durationMs > 0;

  return (
    <Box
      width={width}
      minHeight={8}
      borderStyle="single"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      borderColor={selected ? 'cyan' : 'gray'}
    >
      <Box marginBottom={0} height={1}>
        <Text bold color={selected ? 'cyan' : 'white'}>
          {run.id.slice(0, 8)}
        </Text>
      </Box>
      <Box marginBottom={0} height={2}>
        <Text wrap="truncate">{truncatedDisplay}</Text>
      </Box>
      <Box marginBottom={0} height={1}>
        <Text dimColor>
          {formatPhase(run.phase)}
        </Text>
      </Box>
      {isRunning && (
        <Box marginBottom={0} height={1}>
          <Text>
            <Spinner active={isRunning} /> {progressBar} <Text bold color="cyan">{run.progressPercent}%</Text>
          </Text>
        </Box>
      )}
      <Box marginTop={0} height={1}>
        <Text dimColor>
          {run.completedSubtasks}/{run.totalSubtasks} tasks
          {run.readyToAct && ' | ⚠'}
          {run.status === 'running' && (
            <>
              {' | '}
              <IsolatedCardTimer startTime={run.createdAt} showSeconds={false} />
            </>
          )}
          {showCompletedDuration && (
            <>
              {' | '}
              <Text>{formatDuration(run.durationMs!, true)}</Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if run data actually changed or selection changed
  return (
    prevProps.run.id === nextProps.run.id &&
    prevProps.run.status === nextProps.run.status &&
    prevProps.run.progressPercent === nextProps.run.progressPercent &&
    prevProps.run.phase === nextProps.run.phase &&
    prevProps.run.readyToAct === nextProps.run.readyToAct &&
    prevProps.run.durationMs === nextProps.run.durationMs &&
    prevProps.selected === nextProps.selected &&
    prevProps.width === nextProps.width
  );
});
