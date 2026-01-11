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
      'Needs Input': [],
      Done: [],
    };
    taskGroups.forEach(group => {
      map[group.status] = group.runs;
    });
    return map;
  }, [taskGroups]);

      return (
        <Box flexDirection="column" flexGrow={1} width={terminalWidth}>
          <Box flexDirection="row" flexGrow={1} width={terminalWidth}>
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
              status="Needs Input"
              runs={statusMap['Needs Input']}
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
