import React from 'react';
import { Box, Text } from 'ink';

export function CommandsView() {
  return (
    <Box padding={2} flexDirection="column" flexGrow={1}>
      <Text bold>Commands View</Text>
      <Text dimColor>Commands will be loaded from project configuration files.</Text>
      <Text dimColor>Coming soon...</Text>
    </Box>
  );
}
