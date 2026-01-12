import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface MultiLineTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  height?: number;
}

export function MultiLineTextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = '',
  height = 15,
}: MultiLineTextInputProps) {
  const [input, setInput] = useState(value);
  const [cursorPos, setCursorPos] = useState(value.length);

  // Track if we're the source of the change to avoid resetting cursor
  const isInternalChange = useRef(false);

  // Sync with external value changes only
  useEffect(() => {
    if (!isInternalChange.current) {
      setInput(value);
      setCursorPos(value.length);
    }
    isInternalChange.current = false;
  }, [value]);

  // Helper to update input and notify parent
  const updateInput = useCallback((newInput: string, newCursorPos: number) => {
    isInternalChange.current = true;
    setInput(newInput);
    setCursorPos(newCursorPos);
    onChange(newInput);
  }, [onChange]);

  // Helper to get line and column from cursor position
  const getCursorLineAndCol = useCallback((text: string, pos: number) => {
    const beforeCursor = text.slice(0, pos);
    const lines = beforeCursor.split('\n');
    const line = lines.length - 1;
    const col = lines[lines.length - 1].length;
    return { line, col };
  }, []);

  // Helper to get cursor position from line and column
  const getPosFromLineAndCol = useCallback((text: string, targetLine: number, targetCol: number) => {
    const lines = text.split('\n');
    let pos = 0;
    for (let i = 0; i < targetLine && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    const lineLength = lines[targetLine]?.length ?? 0;
    pos += Math.min(targetCol, lineLength);
    return pos;
  }, []);

  useInput((char, key) => {
    // Handle escape - cancel
    if (key.escape) {
      onCancel?.();
      return;
    }

    // Handle save (Ctrl+S)
    if (key.ctrl && char === 's') {
      onSubmit(input);
      return;
    }

    // Handle arrow keys for navigation
    if (key.leftArrow) {
      setCursorPos(p => Math.max(0, p - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPos(p => Math.min(input.length, p + 1));
      return;
    }

    if (key.upArrow) {
      const { line, col } = getCursorLineAndCol(input, cursorPos);
      if (line > 0) {
        setCursorPos(getPosFromLineAndCol(input, line - 1, col));
      }
      return;
    }

    if (key.downArrow) {
      const { line, col } = getCursorLineAndCol(input, cursorPos);
      const lines = input.split('\n');
      if (line < lines.length - 1) {
        setCursorPos(getPosFromLineAndCol(input, line + 1, col));
      }
      return;
    }

    // Handle Enter
    if (key.return) {
      if (key.ctrl) {
        onSubmit(input);
        return;
      }
      // If at end and input ends with newline (or empty), save
      if (cursorPos === input.length && (input.endsWith('\n') || input === '')) {
        onSubmit(input.trimEnd());
        return;
      }
      // Add newline at cursor
      const newInput = input.slice(0, cursorPos) + '\n' + input.slice(cursorPos);
      updateInput(newInput, cursorPos + 1);
      return;
    }

    // Handle backspace
    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        const newInput = input.slice(0, cursorPos - 1) + input.slice(cursorPos);
        updateInput(newInput, cursorPos - 1);
      }
      return;
    }

    // Handle character input
    if (char && !key.ctrl && !key.meta) {
      const normalized = char
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, '');

      if (normalized) {
        const newInput = input.slice(0, cursorPos) + normalized + input.slice(cursorPos);
        updateInput(newInput, cursorPos + normalized.length);
      }
    }
  });

  // Render
  const lines = input.split('\n');
  const { line: cursorLine, col: cursorCol } = getCursorLineAndCol(input, cursorPos);

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      height={height}
      width="100%"
    >
      {input === '' ? (
        <Text>
          <Text inverse> </Text>
          {placeholder && <Text dimColor> {placeholder}</Text>}
        </Text>
      ) : (
        lines.map((line, lineIndex) => {
          const isCursorLine = lineIndex === cursorLine;

          if (isCursorLine) {
            const beforeCursor = line.slice(0, cursorCol);
            const cursorChar = cursorCol < line.length ? line[cursorCol] : ' ';
            const afterCursor = cursorCol < line.length ? line.slice(cursorCol + 1) : '';

            return (
              <Text key={`l${lineIndex}`}>
                <Text color="cyan">{beforeCursor}</Text>
                <Text inverse>{cursorChar}</Text>
                <Text color="cyan">{afterCursor}</Text>
              </Text>
            );
          }

          return (
            <Text key={`l${lineIndex}`} color="cyan">
              {line || ' '}
            </Text>
          );
        })
      )}
    </Box>
  );
}
