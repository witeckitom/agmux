import React from 'react';
import { Box, Text } from 'ink';
import { TaskGroup as TaskGroupType } from '../utils/taskGrouping.js';
import { TaskCard } from './TaskCard.js';
import { Run } from '../models/types.js';

interface TaskGroupProps {
  group: TaskGroupType;
  selectedRunId?: string;
  cardWidth?: number;
  terminalWidth: number;
}

export function TaskGroup({ group, selectedRunId, cardWidth = 45, terminalWidth }: TaskGroupProps) {
  return (
    <Box flexDirection="column" marginBottom={2}>
      <Box paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          {group.status} ({group.runs.length})
        </Text>
      </Box>
      {group.runs.length === 0 ? (
        <Box paddingX={1}>
          <Text dimColor>No tasks in this status</Text>
        </Box>
      ) : (
        <Box flexWrap="wrap" flexDirection="row" paddingX={1}>
          {group.runs.map(run => (
            <Box key={run.id} marginRight={1} marginBottom={1}>
              <TaskCard
                run={run}
                selected={run.id === selectedRunId}
                width={cardWidth}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
