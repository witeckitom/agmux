import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';

// Helper function to get autocomplete suggestion
function getAutocompleteSuggestion(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  // Only navigation commands in command mode
  const commands = [
    { name: 'tasks', aliases: ['task'] },
    { name: 'skills', aliases: ['skill'] },
    { name: 'commands', aliases: ['command'] },
    { name: 'hooks', aliases: ['hook'] },
    { name: 'profiles', aliases: ['profile'] },
    { name: 'agents', aliases: ['agent'] },
    { name: 'quit', aliases: ['q'] },
  ];

  for (const cmd of commands) {
    if (cmd.name.startsWith(trimmed) || cmd.aliases?.some(a => a.startsWith(trimmed))) {
      return cmd.name;
    }
  }
  return null;
}

export const CommandMode = React.memo(function CommandMode() {
  const { state } = useApp();
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  if (!state.commandMode) {
    return null;
  }

  const input = state.commandInput.trim();
  const suggestion = getAutocompleteSuggestion(input);
  
  // Calculate remaining characters for autocomplete preview
  // Match case-insensitively but preserve the original suggestion case
  let remainingChars = '';
  if (suggestion && input) {
    const inputLower = input.toLowerCase();
    const suggestionLower = suggestion.toLowerCase();
    if (suggestionLower.startsWith(inputLower)) {
      // Use the original input length to slice, preserving case
      remainingChars = suggestion.slice(input.length);
    }
  }

  return (
    <Box 
      width={terminalWidth}
      borderStyle="single" 
      borderBottom={true}
      height={3}
      flexDirection="row"
      alignItems="center"
    >
      <Box paddingX={1} flexGrow={1}>
        <Text>
          <Text color="yellow" bold>:</Text>
          <Text>{input}</Text>
          {remainingChars ? (
            <Text dimColor color="gray">
              {remainingChars}
            </Text>
          ) : null}
          <Text color="gray">█</Text>
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          {suggestion ? 'Tab: complete' : ''} Enter: execute | Esc: cancel
        </Text>
      </Box>
    </Box>
  );
});
