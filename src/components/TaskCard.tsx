import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Run } from '../models/types.js';

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

export function TaskCard({ run, selected = false, width = 45 }: TaskCardProps) {
  const [runningDuration, setRunningDuration] = useState<number>(0);

  useEffect(() => {
    if (run.status === 'running') {
      // Calculate initial duration from when task started
      const now = Date.now();
      const startTime = run.createdAt.getTime();
      setRunningDuration(now - startTime);

      // Update every minute since we only show minutes on kanban
      const interval = setInterval(() => {
        const now = Date.now();
        const startTime = run.createdAt.getTime();
        setRunningDuration(now - startTime);
      }, 60000); // 60 seconds = 1 minute

      return () => clearInterval(interval);
    } else if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      // Use stored duration from database
      if (run.durationMs !== null && run.durationMs !== undefined && run.durationMs > 0) {
        setRunningDuration(run.durationMs);
      } else {
        setRunningDuration(0);
      }
    } else {
      setRunningDuration(0);
    }
  }, [run.status, run.createdAt, run.durationMs]);

  const progressBarWidth = Math.max(8, width - 6); // Account for padding, minimum 8 chars
  const progressBar = renderProgressBar(run.progressPercent, progressBarWidth);
  const promptDisplay = run.prompt || 'No prompt';
  const maxPromptLength = Math.max(10, width - 4);
  const truncatedPrompt =
    promptDisplay.length > maxPromptLength
      ? promptDisplay.slice(0, maxPromptLength - 3) + '...'
      : promptDisplay;

  const showProgress = run.status === 'running';
  const showDuration = (run.status === 'running' && runningDuration > 0) || 
                       ((run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') && runningDuration > 0);

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
        <Text wrap="truncate">{truncatedPrompt}</Text>
      </Box>
      <Box marginBottom={0} height={1}>
        <Text dimColor>
          {formatPhase(run.phase)}
        </Text>
      </Box>
      {showProgress && (
        <Box marginBottom={0} height={1}>
          <Text>
            {progressBar} <Text bold color="cyan">{run.progressPercent}%</Text>
          </Text>
        </Box>
      )}
      <Box marginTop={0} height={1}>
        <Text dimColor>
          {run.completedSubtasks}/{run.totalSubtasks} tasks
          {run.readyToAct && ' | ⚠'}
          {showDuration && (
            <>
              {' | '}
              <Text>
                {run.status === 'running' 
                  ? formatDuration(runningDuration, false) // Minutes only for running tasks
                  : formatDuration(runningDuration, true)  // Full format for completed tasks
                }
              </Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
