import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

interface ConfirmationDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({ message, onConfirm, onCancel }: ConfirmationDialogProps) {
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);
  const messageLines = message.split('\n');
  const maxLineLength = Math.max(...messageLines.map(l => l.length), 40);
  const dialogWidth = Math.min(maxLineLength + 8, terminalWidth - 4);

  return (
    <Box
      width={terminalWidth}
      height="100%"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
    >
      <Box
        width={dialogWidth}
        borderStyle="single"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">
            ⚠ Confirm
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>{message}</Text>
        </Box>
        <Box flexDirection="row">
          <Text>
            <Text bold color="green">Y</Text> - Yes | <Text bold color="red">N</Text> - No |{' '}
            <Text bold>Esc</Text> - Cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
