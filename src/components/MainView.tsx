import React, { useMemo } from 'react';
import { Box } from 'ink';
import { useApp } from '../context/AppContext.js';
import { ViewRouter } from './ViewRouter.js';

export const MainView = React.memo(function MainView() {
  const { state } = useApp();
  const terminalHeight = useMemo(() => process.stdout.rows || 24, []);
  // TopBar is 3 lines, CommandMode is 3 lines (when visible)
  // Calculate height dynamically based on whether command mode is visible
  const mainViewHeight = useMemo(() => {
    const commandModeHeight = state.commandMode ? 3 : 0;
    return Math.max(1, terminalHeight - 3 - commandModeHeight);
  }, [terminalHeight, state.commandMode]);

  return (
    <Box flexDirection="column" height={mainViewHeight} flexGrow={1}>
      <ViewRouter />
    </Box>
  );
});
