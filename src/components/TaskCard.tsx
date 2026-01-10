import React from 'react';
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

export function TaskCard({ run, selected = false, width = 45 }: TaskCardProps) {
  const progressBarWidth = Math.max(8, width - 6); // Account for padding, minimum 8 chars
  const progressBar = renderProgressBar(run.progressPercent, progressBarWidth);
  const promptDisplay = run.prompt || 'No prompt';
  const maxPromptLength = Math.max(10, width - 4);
  const truncatedPrompt =
    promptDisplay.length > maxPromptLength
      ? promptDisplay.slice(0, maxPromptLength - 3) + '...'
      : promptDisplay;

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
      <Box marginBottom={0} height={1}>
        <Text>
          {progressBar} <Text bold color="cyan">{run.progressPercent}%</Text>
        </Text>
      </Box>
      <Box marginTop={0} height={1}>
        <Text dimColor>
          {run.completedSubtasks}/{run.totalSubtasks} tasks
          {run.readyToAct && ' | ⚠'}
        </Text>
      </Box>
    </Box>
  );
}
