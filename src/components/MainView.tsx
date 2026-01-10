import React from 'react';
import { Box } from 'ink';
import { ViewRouter } from './ViewRouter.js';

interface MainViewProps {
  height: number;
}

export const MainView = React.memo(function MainView({ height }: MainViewProps) {
  return (
    <Box flexDirection="column" height={height} flexGrow={1}>
      <ViewRouter />
    </Box>
  );
});
