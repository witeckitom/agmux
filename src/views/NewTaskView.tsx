import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { useInput } from 'ink';
import { logger } from '../utils/logger.js';

export function NewTaskView() {
  const { database, setCurrentView } = useApp();
  const [prompt, setPrompt] = useState('');

  React.useEffect(() => {
    logger.info('Entered new task creation view', 'NewTaskView');
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      // Cancel and go back to tasks view
      logger.info('Cancelled task creation', 'NewTaskView');
      setCurrentView('tasks');
      return;
    }

    if (key.return && prompt.trim()) {
      // Create the task
      logger.info('Creating new task', 'NewTaskView', { prompt: prompt.trim() });
      createTask();
      return;
    }

    if (key.backspace || key.delete) {
      setPrompt(p => p.slice(0, -1));
      return;
    }

    if (input) {
      setPrompt(p => p + input);
    }
  });

  const createTask = () => {
    const taskPrompt = prompt.trim();
    logger.info('Starting task creation', 'NewTaskView', { prompt: taskPrompt });

    try {
      // Create a new run/task
      // Don't set worktreePath yet - it will be set when the task is started and worktree is created
      const run = database.createRun({
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '', // Empty until worktree is created
        baseBranch: 'main',
        agentProfileId: 'default',
        conversationId: null,
        skillId: null,
        prompt: taskPrompt,
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        durationMs: null,
        retainWorktree: false,
      });

      logger.info('Task created successfully', 'NewTaskView', {
        runId: run.id,
        prompt: taskPrompt,
        status: run.status,
      });

      // Go back to tasks view
      setCurrentView('tasks');
    } catch (error) {
      logger.error('Failed to create task', 'NewTaskView', {
        error: error instanceof Error ? error.message : String(error),
        prompt: taskPrompt,
      });
    }
  };

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Create New Task</Text>
      </Box>
      
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text>
            <Text bold>Prompt:</Text> {prompt}
            <Text color="gray">█</Text>
          </Text>
        </Box>
        <Text dimColor>Enter your task prompt. Press Enter to create, Esc to cancel.</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>
          <Text bold>Note:</Text> Task creation will be enhanced with skill selection,
          agent profile selection, and git worktree setup in future updates.
        </Text>
      </Box>
    </Box>
  );
}
