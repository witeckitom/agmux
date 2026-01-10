import React, { useState } from 'react';
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
  const [branchInput, setBranchInput] = useState(defaultBranch);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && branchInput.trim()) {
      onConfirm(branchInput.trim());
      return;
    }

    if (key.backspace || key.delete) {
      setBranchInput(prev => prev.slice(0, -1));
      return;
    }

    if (input && input.length === 1) {
      setBranchInput(prev => prev + input);
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
          <Text color="cyan">{branchInput}</Text>
          <Text color="yellow">█</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>Press Enter to merge, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
