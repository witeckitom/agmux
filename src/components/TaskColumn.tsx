import React from 'react';
import { Box, Text } from 'ink';
import { Run } from '../models/types.js';
import { TaskCard } from './TaskCard.js';
import { DisplayStatus } from '../utils/taskGrouping.js';

interface TaskColumnProps {
  status: DisplayStatus;
  runs: Run[];
  selectedRunId?: string;
  cardWidth?: number;
  columnWidth: number;
  isFirst?: boolean;
}

export function TaskColumn({
  status,
  runs,
  selectedRunId,
  cardWidth = 45,
  columnWidth,
  isFirst = false,
}: TaskColumnProps) {
  return (
    <Box 
      flexDirection="column" 
      width={columnWidth} 
      borderStyle="single"
      flexGrow={1}
      paddingX={1}
      paddingY={0}
    >
      <Box paddingY={0} height={2}>
        <Text bold color="cyan">
          {status}
        </Text>
        <Text dimColor> ({runs.length})</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={0} paddingY={0}>
        {runs.length === 0 ? (
          <Box paddingY={1}>
            <Text dimColor>No tasks</Text>
          </Box>
        ) : (
          runs.map(run => (
            <Box key={run.id} marginBottom={1}>
              <TaskCard run={run} selected={run.id === selectedRunId} width={cardWidth} />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
