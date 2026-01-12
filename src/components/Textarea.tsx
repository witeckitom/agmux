import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

export interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  height?: number;
  isFocused?: boolean;
}

export function Textarea({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  height = 10,
  isFocused = true,
}: TextareaProps) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const [internalValue, setInternalValue] = useState(value);
  const cursorPosition = useRef(0);

  // Sync external value changes
  useEffect(() => {
    setInternalValue(value);
    cursorPosition.current = value.length;
  }, [value]);

  // Split value into lines for display
  const lines = internalValue.split('\n');
  const displayHeight = Math.max(height, lines.length + 1);

  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Handle Enter - insert newline
      if (key.return && !key.ctrl && !key.meta) {
        const newValue = internalValue + '\n';
        setInternalValue(newValue);
        onChange(newValue);
        cursorPosition.current = newValue.length;
        return;
      }

      // Handle Ctrl+Enter or Ctrl+S - submit
      if ((key.ctrl && key.return) || (key.ctrl && input === 's')) {
        if (onSubmit) {
          onSubmit(internalValue);
        }
        return;
      }

      // Handle backspace/delete
      if (key.backspace || key.delete) {
        if (internalValue.length > 0) {
          const newValue = internalValue.slice(0, -1);
          setInternalValue(newValue);
          onChange(newValue);
          cursorPosition.current = newValue.length;
        }
        return;
      }

      // Handle any other input (including pasted text with newlines)
      if (input && input.length > 0) {
        const newValue = internalValue + input;
        setInternalValue(newValue);
        onChange(newValue);
        cursorPosition.current = newValue.length;
        return;
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      height={displayHeight}
      minHeight={height}
      width="100%"
    >
      {lines.length > 0 ? (
        lines.map((line, index) => (
          <Text key={`line-${index}`} color={isFocused ? 'cyan' : undefined}>
            {line}
            {index === lines.length - 1 && isFocused && <Text color="yellow">█</Text>}
          </Text>
        ))
      ) : (
        <Text color={isFocused ? 'yellow' : 'gray'}>
          {isFocused ? '█' : placeholder || ' '}
        </Text>
      )}
    </Box>
  );
}
