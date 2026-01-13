import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInputContext } from '../context/InputContext.js';

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

// Isolated component that only re-renders when its own input changes
// Takes commandMode as prop to avoid subscribing to entire context
export const CommandMode = React.memo(function CommandMode({ isCommandMode }: { isCommandMode: boolean }) {
  const { getCommandInput, renderCommandInput } = useInputContext();
  const inputRef = useRef<string>('');
  const [inputVersion, setInputVersion] = useState(0);
  const commandModeRef = useRef(isCommandMode);
  
  // Update ref when commandMode changes
  useEffect(() => {
    commandModeRef.current = isCommandMode;
    if (isCommandMode) {
      inputRef.current = getCommandInput();
      setInputVersion(v => v + 1);
    } else {
      inputRef.current = '';
    }
  }, [isCommandMode, getCommandInput]);

  // Register callback to update input display - only update when value actually changes
  useEffect(() => {
    renderCommandInput(() => {
      // Only update if command mode is active
      if (!commandModeRef.current) return;
      
      const newInput = getCommandInput();
      // Only trigger re-render if input actually changed
      if (inputRef.current !== newInput) {
        inputRef.current = newInput;
        setInputVersion(v => v + 1);
      }
    });
  }, [getCommandInput, renderCommandInput]);

  if (!isCommandMode) {
    return null;
  }

  // Read from ref to avoid React dependency tracking
  const displayInput = inputRef.current;
  const input = displayInput.trim();
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
      width="100%"
      borderStyle="single" 
      borderBottom={true}
      height={3}
      flexDirection="row"
      alignItems="center"
      paddingX={1}
      flexShrink={0}
    >
      <Box flexGrow={1} minWidth={0}>
        <Text>
          <Text color="yellow" bold>:</Text>
          <Text>{displayInput}</Text>
          {remainingChars ? (
            <Text dimColor color="gray">
              {remainingChars}
            </Text>
          ) : null}
          <Text color="gray">█</Text>
        </Text>
      </Box>
      <Box paddingLeft={1} flexShrink={0}>
        <Text dimColor>
          {suggestion ? 'Tab: complete' : ''} Enter: execute | Esc: cancel
        </Text>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Only re-render if commandMode prop actually changed
  return prevProps.isCommandMode === nextProps.isCommandMode;
});
