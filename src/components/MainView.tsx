import React from 'react';
import { Box, useStdout } from 'ink';
import { ViewRouter } from './ViewRouter.js';

// No explicit height - use flexGrow to avoid repaint issues with timers
export const MainView = React.memo(function MainView() {
  const { stdout } = useStdout();
  const width = stdout?.columns || 80;

  return (
    <Box flexDirection="column" flexGrow={1} width={width}>
      <ViewRouter />
    </Box>
  );
});
