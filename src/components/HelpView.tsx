import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { getViewCommands } from '../utils/viewCommands.js';
import { ViewType } from '../models/types.js';

interface HelpViewProps {
  onClose: () => void;
}

export function HelpView({ onClose }: HelpViewProps) {
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);
  
  // Collect all commands from all views
  const allCommands: { view: ViewType; commands: ReturnType<typeof getViewCommands> }[] = [
    { view: 'tasks', commands: getViewCommands('tasks') },
    { view: 'skills', commands: getViewCommands('skills') },
    { view: 'commands', commands: getViewCommands('commands') },
    { view: 'hooks', commands: getViewCommands('hooks') },
    { view: 'profiles', commands: getViewCommands('profiles') },
    { view: 'agents', commands: getViewCommands('agents') },
    { view: 'task-detail', commands: getViewCommands('task-detail') },
  ];

  // Global commands
  const globalCommands = [
    { key: ':', description: 'Command mode' },
    { key: 'Shift+L', description: 'Toggle logs' },
    { key: 'Shift+H', description: 'Toggle help' },
    { key: 'q', description: 'Quit application' },
    { key: 'r', description: 'Refresh' },
    { key: 'j/k', description: 'Navigate up/down' },
    { key: 'h/l', description: 'Navigate left/right (tasks view)' },
    { key: 'Enter', description: 'View task detail (tasks view)' },
  ];

  const dialogWidth = Math.min(80, terminalWidth - 4);
  const maxHeight = (process.stdout.rows || 24) - 4;

  return (
    <Box
      width={terminalWidth}
      height="100%"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
    >
      <Box
        width={dialogWidth}
        borderStyle="single"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        height={maxHeight}
      >
        <Box marginBottom={1}>
          <Text bold color="cyan">
            📖 Help - Keyboard Shortcuts
          </Text>
        </Box>
        
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="yellow">
            Global Commands:
          </Text>
          {globalCommands.map((cmd, index) => (
            <Text key={index}>
              <Text bold color="green">{cmd.key.padEnd(12)}</Text> - {cmd.description}
            </Text>
          ))}
        </Box>

        {allCommands.map(({ view, commands }) => {
          if (commands.length === 0) return null;
          return (
            <Box key={view} marginBottom={1} flexDirection="column">
              <Text bold color="yellow">
                {view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ')} View:
              </Text>
              {commands.map((cmd, index) => (
                <Text key={index}>
                  <Text bold color="green">{cmd.key.padEnd(12)}</Text> - {cmd.description}
                </Text>
              ))}
            </Box>
          );
        })}

        <Box marginTop={1} borderTop={true} paddingTop={1}>
          <Text>
            <Text bold color="gray">Press </Text>
            <Text bold color="red">Esc</Text>
            <Text bold color="gray"> or </Text>
            <Text bold color="green">Shift+H</Text>
            <Text bold color="gray"> to close</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
