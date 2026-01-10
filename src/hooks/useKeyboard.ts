import { useState } from 'react';
import { useInput, useApp as useInkApp } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';
import { groupTasksByStatus } from '../utils/taskGrouping.js';

// Helper function to get autocomplete suggestion (single best match)
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
    { name: 'settings', aliases: ['setting'] },
    { name: 'quit', aliases: ['q'] },
  ];

  for (const cmd of commands) {
    if (cmd.name.startsWith(trimmed) || cmd.aliases?.some(a => a.startsWith(trimmed))) {
      return cmd.name;
    }
  }
  return null;
}

export function useKeyboard() {
  const { exit } = useInkApp();
  const {
    state,
    setSelectedIndex,
    setCommandMode,
    setCommandInput,
    executeCommand,
    refreshRuns,
    toggleLogs,
    deleteRun,
    hideConfirmation,
    setCurrentView,
    setSelectedRunId,
    toggleTaskStatus,
  } = useApp();


  useInput((input, key) => {
    // Confirmation dialog handling (takes priority)
    if (state.confirmation) {
      if (input === 'y' || input === 'Y' || key.return) {
        state.confirmation.onConfirm();
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        state.confirmation.onCancel();
        return;
      }
      // Ignore other input when confirmation is showing
      return;
    }

    // Command mode handling
    if (state.commandMode) {
      if (key.return) {
        // Execute command
        executeCommand(state.commandInput);
      } else if (key.escape) {
        // Cancel command mode
        setCommandMode(false);
      } else if (key.tab) {
        // Tab to autocomplete
        const suggestion = getAutocompleteSuggestion(state.commandInput.trim());
        if (suggestion) {
          setCommandInput(suggestion);
        }
      } else if (key.backspace || key.delete) {
        // Delete character
        setCommandInput(state.commandInput.slice(0, -1));
      } else if (input) {
        // Add character
        setCommandInput(state.commandInput + input);
      }
      return;
    }

    // Skip normal mode handling if we're in a special view that handles its own input
    if (state.currentView === 'new-task') {
      // Let NewTaskView handle its own input
      return;
    }

    // Handle Shift+L for logs toggle
    if (key.shift && (input === 'l' || input === 'L')) {
      logger.info('Toggling logs visibility', 'Keyboard');
      toggleLogs();
      return;
    }

    // Normal mode handling
    if (input === ':') {
      logger.debug('Entering command mode', 'Keyboard');
      setCommandMode(true);
      return;
    }

    if (key.escape) {
      // Return to tasks view if in task-detail view
      if (state.currentView === 'task-detail') {
        logger.debug('Returning to tasks view', 'Keyboard');
        setCurrentView('tasks');
        setSelectedRunId(null);
        return;
      }
      // Close detail pane or cancel action
      return;
    }

    if (key.ctrl && input === 'c') {
      // Quit application
      exit();
      return;
    }

    // Navigation - only in tasks view for now
    if (state.currentView === 'tasks') {
      // Group tasks by status for column-aware navigation
      const taskGroups = groupTasksByStatus(state.runs);
      
      // Find which column and position the selected task is in
      let currentColumnIndex = -1;
      let currentTaskIndexInColumn = -1;
      let currentRunId: string | null = null;
      
      if (state.selectedIndex >= 0 && state.selectedIndex < state.runs.length) {
        currentRunId = state.runs[state.selectedIndex].id;
        
        // Find which column contains this task
        for (let colIdx = 0; colIdx < taskGroups.length; colIdx++) {
          const taskIdx = taskGroups[colIdx].runs.findIndex(r => r.id === currentRunId);
          if (taskIdx >= 0) {
            currentColumnIndex = colIdx;
            currentTaskIndexInColumn = taskIdx;
            break;
          }
        }
      }
      
      // If no task selected, start at first task of first column
      if (currentColumnIndex === -1 && taskGroups.length > 0 && taskGroups[0].runs.length > 0) {
        currentColumnIndex = 0;
        currentTaskIndexInColumn = 0;
        const firstRunId = taskGroups[0].runs[0].id;
        const firstRunIndex = state.runs.findIndex(r => r.id === firstRunId);
        if (firstRunIndex >= 0) {
          setSelectedIndex(firstRunIndex);
        }
        return;
      }
      
      // Handle vim-style navigation
      if (key.upArrow || input === 'k') {
        // Move up within column
        if (currentColumnIndex >= 0 && currentTaskIndexInColumn > 0) {
          const newTaskIndexInColumn = currentTaskIndexInColumn - 1;
          const newRunId = taskGroups[currentColumnIndex].runs[newTaskIndexInColumn].id;
          const newRunIndex = state.runs.findIndex(r => r.id === newRunId);
          if (newRunIndex >= 0) {
            setSelectedIndex(newRunIndex);
          }
        }
        return;
      }

      if (key.downArrow || input === 'j') {
        // Move down within column
        if (currentColumnIndex >= 0 && currentTaskIndexInColumn < taskGroups[currentColumnIndex].runs.length - 1) {
          const newTaskIndexInColumn = currentTaskIndexInColumn + 1;
          const newRunId = taskGroups[currentColumnIndex].runs[newTaskIndexInColumn].id;
          const newRunIndex = state.runs.findIndex(r => r.id === newRunId);
          if (newRunIndex >= 0) {
            setSelectedIndex(newRunIndex);
          }
        }
        return;
      }

      // Left navigation (h) - move to previous column, same row position
      if (key.leftArrow || input === 'h') {
        if (currentColumnIndex > 0) {
          const targetColumn = taskGroups[currentColumnIndex - 1];
          const targetRow = Math.min(currentTaskIndexInColumn, targetColumn.runs.length - 1);
          if (targetRow >= 0 && targetRow < targetColumn.runs.length) {
            const newRunId = targetColumn.runs[targetRow].id;
            const newRunIndex = state.runs.findIndex(r => r.id === newRunId);
            if (newRunIndex >= 0) {
              setSelectedIndex(newRunIndex);
            }
          }
        }
        return;
      }

      // Right navigation (l) - move to next column, same row position
      if (input === 'l' || input === 'L') {
        // Single L - navigate right (Shift+L is handled above for logs toggle)
        if (currentColumnIndex >= 0 && currentColumnIndex < taskGroups.length - 1) {
          const targetColumn = taskGroups[currentColumnIndex + 1];
          const targetRow = Math.min(currentTaskIndexInColumn, targetColumn.runs.length - 1);
          if (targetRow >= 0 && targetRow < targetColumn.runs.length) {
            const newRunId = targetColumn.runs[targetRow].id;
            const newRunIndex = state.runs.findIndex(r => r.id === newRunId);
            if (newRunIndex >= 0) {
              setSelectedIndex(newRunIndex);
            }
          }
        }
        return;
      }

      if (key.rightArrow) {
        // Arrow key right navigation
        if (currentColumnIndex >= 0 && currentColumnIndex < taskGroups.length - 1) {
          const targetColumn = taskGroups[currentColumnIndex + 1];
          const targetRow = Math.min(currentTaskIndexInColumn, targetColumn.runs.length - 1);
          if (targetRow >= 0 && targetRow < targetColumn.runs.length) {
            const newRunId = targetColumn.runs[targetRow].id;
            const newRunIndex = state.runs.findIndex(r => r.id === newRunId);
            if (newRunIndex >= 0) {
              setSelectedIndex(newRunIndex);
            }
          }
        }
        return;
      }
    } else {
      // Navigation for other views
      if (key.upArrow || input === 'k') {
        setSelectedIndex(state.selectedIndex - 1);
        return;
      }

      if (key.downArrow || input === 'j') {
        setSelectedIndex(state.selectedIndex + 1);
        return;
      }
    }

    if (input === 'q') {
      // Quit application
      exit();
      return;
    }

    if (input === 'r' || input === 'R') {
      logger.debug('Refreshing runs', 'Keyboard');
      refreshRuns();
      return;
    }

    // Context-specific hotkeys based on current view
    if (state.currentView === 'tasks') {
      if (input === 'T') {
        // 'T' hotkey for new-task when on tasks view
        logger.info('Creating new task via hotkey', 'Keyboard');
        executeCommand('new-task');
        return;
      }

      // Enter to view task detail
      if (key.return) {
        if (state.runs.length === 0 || state.selectedIndex < 0 || state.selectedIndex >= state.runs.length) {
          logger.warn('No task selected to view', 'Keyboard');
          return;
        }
        const selectedRun = state.runs[state.selectedIndex];
        logger.info(`Viewing task detail: ${selectedRun.id}`, 'Keyboard');
        setSelectedRunId(selectedRun.id);
        setCurrentView('task-detail');
        return;
      }

      // Shift+D for delete task
      if (key.shift && (input === 'd' || input === 'D')) {
        if (state.runs.length === 0 || state.selectedIndex < 0 || state.selectedIndex >= state.runs.length) {
          logger.warn('No task selected to delete', 'Keyboard');
          return;
        }
        const selectedRun = state.runs[state.selectedIndex];
        logger.info(`Delete requested for task: ${selectedRun.id}`, 'Keyboard');
        deleteRun(selectedRun.id);
        return;
      }
    }

    // Task detail view hotkeys
    if (state.currentView === 'task-detail') {
      if (input === 'S' || input === 's') {
        if (!state.selectedRunId) {
          logger.warn('No task selected', 'Keyboard');
          return;
        }
        logger.info(`Toggling task status: ${state.selectedRunId}`, 'Keyboard');
        toggleTaskStatus(state.selectedRunId);
        return;
      }
    }

    // View switching shortcuts (optional)
    if (key.ctrl) {
      switch (input) {
        case 't':
          executeCommand('tasks');
          break;
        case 's':
          executeCommand('skills');
          break;
        case 'c':
          executeCommand('commands');
          break;
      }
    }
  });
}
