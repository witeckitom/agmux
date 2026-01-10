import React, { useState, useRef } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { useInput } from 'ink';
import { logger } from '../utils/logger.js';

export function NewTaskView() {
  const { database, setCurrentView, refreshRuns } = useApp();
  const promptRef = useRef<string>('');
  const [promptDisplay, setPromptDisplay] = useState(0); // Counter to force re-render

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

    if (key.return && promptRef.current.trim()) {
      // Create the task
      logger.info('Creating new task', 'NewTaskView', { prompt: promptRef.current.trim() });
      createTask();
      return;
    }

    if (key.backspace || key.delete) {
      promptRef.current = promptRef.current.slice(0, -1);
      setPromptDisplay(x => x + 1); // Force re-render of input display only
      return;
    }

    if (input) {
      promptRef.current = promptRef.current + input;
      setPromptDisplay(x => x + 1); // Force re-render of input display only
    }
  });

  const createTask = () => {
    const taskPrompt = promptRef.current.trim();
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

      // Refresh the runs list to show the new task
      refreshRuns();

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
            <Text bold>Prompt:</Text> {promptRef.current}
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
