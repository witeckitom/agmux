import React, { useState, useRef } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';

interface MergeBranchPromptViewProps {
  runId: string;
  defaultBranch: string;
  onConfirm: (branch: string) => void;
  onCancel: () => void;
}

export function MergeBranchPromptView({ runId, defaultBranch, onConfirm, onCancel }: MergeBranchPromptViewProps) {
  const branchInputRef = useRef<string>(defaultBranch);
  const [branchInputDisplay, setBranchInputDisplay] = useState(0); // Counter to force re-render

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && branchInputRef.current.trim()) {
      onConfirm(branchInputRef.current.trim());
      return;
    }

    if (key.backspace || key.delete) {
      branchInputRef.current = branchInputRef.current.slice(0, -1);
      setBranchInputDisplay(x => x + 1); // Force re-render of input display only
      return;
    }

    if (input && input.length === 1) {
      branchInputRef.current = branchInputRef.current + input;
      setBranchInputDisplay(x => x + 1); // Force re-render of input display only
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text bold color="yellow">Merge Task Branch</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>Enter target branch to merge into:</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          <Text color="cyan">{branchInputRef.current}</Text>
          <Text color="yellow">█</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>Press Enter to merge, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
