import { useEffect, useMemo } from 'react';
import { useInput, useApp as useInkApp } from 'ink';
import { useApp } from '../context/AppContext.js';

// Helper function to get autocomplete suggestion (single best match)
function getAutocompleteSuggestion(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const commands = [
    { name: 'tasks', aliases: ['task'] },
    { name: 'skills', aliases: ['skill'] },
    { name: 'commands', aliases: ['command'] },
    { name: 'hooks', aliases: ['hook'] },
    { name: 'profiles', aliases: ['profile'] },
    { name: 'agents', aliases: ['agent'] },
    { name: 'refresh', aliases: ['r'] },
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
  } = useApp();

  useInput((input, key) => {
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

    // Normal mode handling
    if (input === ':') {
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

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(state.selectedIndex - 1);
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(state.selectedIndex + 1);
      return;
    }

    if (input === 'q') {
      // Quit application
      exit();
      return;
    }

    if (input === 'r' || input === 'R') {
      refreshRuns();
      return;
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
