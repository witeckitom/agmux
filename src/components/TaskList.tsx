import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { groupTasksByStatus, DisplayStatus } from '../utils/taskGrouping.js';
import { TaskColumn } from './TaskColumn.js';
import { Run } from '../models/types.js';

export const TaskList = React.memo(function TaskList() {
  const { state } = useApp();
  const { runs, selectedIndex } = state;
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  // Get selected run ID
  const selectedRunId = useMemo(() => {
    if (runs.length === 0 || selectedIndex < 0 || selectedIndex >= runs.length) {
      return undefined;
    }
    return runs[selectedIndex].id;
  }, [runs, selectedIndex]);

  // Group tasks by status
  const taskGroups = useMemo(() => groupTasksByStatus(runs), [runs]);

  // Calculate column width (4 columns)
  const columnWidth = useMemo(() => {
    return Math.floor(terminalWidth / 4);
  }, [terminalWidth]);

  // Create a map of status to runs for easy lookup
  const statusMap = useMemo(() => {
    const map: Record<DisplayStatus, Run[]> = {
      Queued: [],
      'In Progress': [],
      'In Review': [],
      Done: [],
    };
    taskGroups.forEach(group => {
      map[group.status] = group.runs;
    });
    return map;
  }, [taskGroups]);

  if (runs.length === 0) {
    return (
      <Box padding={2} flexDirection="column">
        <Text dimColor>No runs yet.</Text>
        <Text dimColor>Press 'T' to create a new task.</Text>
        <Text dimColor>Use j/k or arrow keys to navigate when tasks are available.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} width={terminalWidth}>
      <Box flexDirection="row" flexGrow={1} width={terminalWidth} height="100%">
        <TaskColumn
          status="Queued"
          runs={statusMap.Queued}
          selectedRunId={selectedRunId}
          cardWidth={Math.max(30, columnWidth - 4)}
          columnWidth={columnWidth}
          isFirst={true}
        />
        <TaskColumn
          status="In Progress"
          runs={statusMap['In Progress']}
          selectedRunId={selectedRunId}
          cardWidth={Math.max(30, columnWidth - 4)}
          columnWidth={columnWidth}
        />
        <TaskColumn
          status="In Review"
          runs={statusMap['In Review']}
          selectedRunId={selectedRunId}
          cardWidth={Math.max(30, columnWidth - 4)}
          columnWidth={columnWidth}
        />
        <TaskColumn
          status="Done"
          runs={statusMap.Done}
          selectedRunId={selectedRunId}
          cardWidth={Math.max(30, columnWidth - 4)}
          columnWidth={columnWidth}
        />
      </Box>
    </Box>
  );
});
