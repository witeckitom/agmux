import { useState } from 'react';
import { useInput, useApp as useInkApp } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';

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
  } = useApp();

  // Track last key press for double-key sequences like 'LL'
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [lastKeyTime, setLastKeyTime] = useState<number>(0);

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

    // Handle double-L for logs toggle (LL) - must be checked first
    if (input === 'l' || input === 'L') {
      const now = Date.now();
      if ((lastKey === 'l' || lastKey === 'L') && now - lastKeyTime < 500) {
        // Double L detected - toggle logs
        logger.info('Toggling logs visibility', 'Keyboard');
        toggleLogs();
        setLastKey(null);
        setLastKeyTime(0);
        return;
      }
      // Single L - remember it for potential double-L
      setLastKey(input);
      setLastKeyTime(now);
      // Continue to check if it's used for navigation in tasks view
    } else {
      // Reset last key tracking if it's not L
      if (lastKey === 'l' || lastKey === 'L') {
        // Single L was pressed but not followed by another L - reset after a delay
        setTimeout(() => {
          setLastKey(null);
          setLastKeyTime(0);
        }, 500);
      }
    }

    // Normal mode handling
    if (input === ':') {
      logger.debug('Entering command mode', 'Keyboard');
      setCommandMode(true);
      return;
    }

    if (key.escape) {
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
      if (key.upArrow || input === 'k') {
        setSelectedIndex(state.selectedIndex - 1);
        return;
      }

      if (key.downArrow || input === 'j') {
        setSelectedIndex(state.selectedIndex + 1);
        return;
      }

      // Left/right navigation for card grid
      if (key.leftArrow || input === 'h') {
        setSelectedIndex(Math.max(0, state.selectedIndex - 1));
        return;
      }

      if (key.rightArrow) {
        setSelectedIndex(Math.min(state.runs.length - 1, state.selectedIndex + 1));
        return;
      }

      // Handle 'l' for right navigation only if it's not part of double-L
      if (input === 'l' || input === 'L') {
        const now = Date.now();
        // If we just pressed L and it's been less than 500ms, wait to see if it's double-L
        if (lastKey === 'l' || lastKey === 'L') {
          // This is the second L - already handled above, so don't navigate
          return;
        }
        // Single L - navigate right
        setSelectedIndex(Math.min(state.runs.length - 1, state.selectedIndex + 1));
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
