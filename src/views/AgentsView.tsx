import React from 'react';
import { Box, Text } from 'ink';

export function AgentsView() {
  return (
    <Box padding={2} flexDirection="column" flexGrow={1}>
      <Text bold>Agents View</Text>
      <Text dimColor>Active agent sessions will be displayed here.</Text>
      <Text dimColor>Coming soon...</Text>
    </Box>
  );
}
