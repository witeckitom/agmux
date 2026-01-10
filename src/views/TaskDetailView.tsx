import React, { useMemo, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';
import { Message } from '../models/types.js';
import { getChangedFiles, getFileDiff, ChangedFile } from '../utils/gitUtils.js';

function formatDuration(ms: number, showSeconds: boolean = true): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return showSeconds 
      ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
      : `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return showSeconds
      ? `${minutes}m ${seconds % 60}s`
      : `${minutes}m`;
  }
  return showSeconds ? `${seconds}s` : '< 1 min';
}

function renderProgressBar(percent: number, width: number): string {
  const barWidth = Math.max(10, width - 2);
  const filled = Math.floor((percent / 100) * barWidth);
  const empty = barWidth - filled;
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
}

export function TaskDetailView() {
  const { state, refreshRuns, database, sendMessageToTask } = useApp();
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);
  const terminalHeight = useMemo(() => process.stdout.rows || 24, []);
  
  const selectedRun = useMemo(() => {
    if (!state.selectedRunId) return null;
    return state.runs.find(r => r.id === state.selectedRunId) || null;
  }, [state.runs, state.selectedRunId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [editingChat, setEditingChat] = useState(false);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [fileDiff, setFileDiff] = useState<string>('');

  const [runningTime, setRunningTime] = useState<number>(0);

  useEffect(() => {
    if (!selectedRun) {
      setRunningTime(0);
      return;
    }

    if (selectedRun.status === 'running') {
      // Calculate running time from when task started
      const now = Date.now();
      const startTime = selectedRun.createdAt.getTime();
      setRunningTime(now - startTime);

      const interval = setInterval(() => {
        const now = Date.now();
        const startTime = selectedRun.createdAt.getTime();
        setRunningTime(now - startTime);
      }, 1000);

      return () => clearInterval(interval);
    } else if (selectedRun.status === 'completed' || selectedRun.status === 'failed' || selectedRun.status === 'cancelled') {
      // Use stored duration from database
      if (selectedRun.durationMs !== null && selectedRun.durationMs !== undefined && selectedRun.durationMs > 0) {
        setRunningTime(selectedRun.durationMs);
      } else {
        setRunningTime(0);
      }
    } else {
      setRunningTime(0);
    }
  }, [selectedRun]);

  useEffect(() => {
    // Load messages when selected run changes
    if (selectedRun) {
      const runMessages = database.getMessagesByRunId(selectedRun.id);
      setMessages(runMessages);
    } else {
      setMessages([]);
    }
  }, [selectedRun, database]);

  useEffect(() => {
    // Load changed files when selected run changes
    if (selectedRun && selectedRun.worktreePath) {
      try {
        const files = getChangedFiles(selectedRun.worktreePath);
        setChangedFiles(files);
        if (files.length > 0 && selectedFileIndex < files.length) {
          const diff = getFileDiff(selectedRun.worktreePath, files[selectedFileIndex].path);
          setFileDiff(diff);
        } else {
          setFileDiff('');
        }
      } catch (error) {
        setChangedFiles([]);
        setFileDiff('');
      }
    } else {
      setChangedFiles([]);
      setFileDiff('');
    }
  }, [selectedRun, selectedFileIndex]);

  useEffect(() => {
    // Refresh runs and messages more frequently when viewing task detail (for streaming)
    const interval = setInterval(() => {
      refreshRuns();
      if (selectedRun) {
        const runMessages = database.getMessagesByRunId(selectedRun.id);
        setMessages(runMessages);

        // Refresh changed files
        if (selectedRun.worktreePath) {
          try {
            const files = getChangedFiles(selectedRun.worktreePath);
            setChangedFiles(files);
            if (files.length > 0 && selectedFileIndex < files.length) {
              const diff = getFileDiff(selectedRun.worktreePath, files[selectedFileIndex].path);
              setFileDiff(diff);
            }
          } catch {
            // Ignore errors
          }
        }
      }
    }, 500); // Refresh every 500ms for better streaming experience
    return () => clearInterval(interval);
  }, [refreshRuns, selectedRun, database, selectedFileIndex]);

  // Handle input for chat and file navigation
  useInput((input, key) => {
    // File navigation (when not editing chat)
    if (!editingChat && changedFiles.length > 0) {
      if (input === 'j' || key.downArrow) {
        setSelectedFileIndex(prev => Math.min(changedFiles.length - 1, prev + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelectedFileIndex(prev => Math.max(0, prev - 1));
        return;
      }
    }

    // Chat input handling when task is in "Needs Input" state
    if (!selectedRun) {
      return; // Let other handlers process
    }

    // Only handle chat input if task is ready for input
    if (selectedRun.readyToAct) {
      // Start editing chat input
      if (!editingChat && key.return) {
        setEditingChat(true);
        return;
      }

      if (editingChat) {
        if (key.escape) {
          setEditingChat(false);
          setChatInput('');
          return;
        }

        if (key.return && chatInput.trim()) {
          // Send message
          const message = chatInput.trim();
          setChatInput('');
          setEditingChat(false);
          sendMessageToTask(selectedRun.id, message);
          return;
        }

        if (key.backspace || key.delete) {
          setChatInput(prev => prev.slice(0, -1));
          return;
        }

        if (input && input.length === 1) {
          setChatInput(prev => prev + input);
          return;
        }
      }
    }
  });

  if (!selectedRun) {
    return (
      <Box padding={2} flexDirection="column">
        <Text color="red">Task not found</Text>
      </Box>
    );
  }

  // Calculate column widths (3 columns with 2 separators)
  const separatorWidth = 1;
  const availableWidth = terminalWidth - separatorWidth * 2;
  const columnWidth = Math.floor(availableWidth / 3);

  // Calculate available height (accounting for status bar)
  const statusBarHeight = 3;
  const availableHeight = terminalHeight - statusBarHeight;

  const statusColor = selectedRun.status === 'running' ? 'green' : 
                     selectedRun.status === 'completed' ? 'cyan' :
                     selectedRun.status === 'failed' ? 'red' :
                     selectedRun.status === 'cancelled' ? 'yellow' : 'gray';

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* Status bar at top */}
      <Box borderBottom={true} borderStyle="single" paddingX={1} paddingY={0} height={statusBarHeight}>
        <Box flexDirection="column" width="100%">
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text bold color="cyan">Task:</Text>
              <Text> {selectedRun.id.slice(0, 8)}</Text>
              <Text dimColor> | </Text>
              <Text bold color={statusColor}>Status:</Text>
              <Text color={statusColor}> {selectedRun.status}</Text>
              {selectedRun.status === 'running' && runningTime > 0 && (
                <>
                  <Text dimColor> | </Text>
                  <Text bold>Running:</Text>
                  <Text> {formatDuration(runningTime, true)}</Text>
                </>
              )}
              {(selectedRun.status === 'completed' || selectedRun.status === 'failed' || selectedRun.status === 'cancelled') && runningTime > 0 && (
                <>
                  <Text dimColor> | </Text>
                  <Text bold>Duration:</Text>
                  <Text> {formatDuration(runningTime, true)}</Text>
                </>
              )}
            </Box>
            <Box>
              <Text>
                {renderProgressBar(selectedRun.progressPercent, 30)} <Text bold color="cyan">{selectedRun.progressPercent}%</Text>
              </Text>
            </Box>
          </Box>
          <Box>
            <Text dimColor>{selectedRun.prompt || 'No prompt'}</Text>
          </Box>
        </Box>
      </Box>

      {/* Three column layout */}
      <Box flexDirection="row" flexGrow={1} height={availableHeight}>
              {/* Chat column */}
              <Box 
                width={columnWidth} 
                borderRight={true} 
                borderStyle="single" 
                flexDirection="column"
                paddingX={1}
                paddingY={1}
              >
                <Box marginBottom={1}>
                  <Text bold color="cyan">Chat</Text>
                </Box>
                <Box flexGrow={1} flexDirection="column">
                  {messages.length === 0 ? (
                    <Text dimColor>No messages yet</Text>
                  ) : (
                    messages.map((msg) => (
                      <Box key={msg.id} marginBottom={1} flexDirection="column">
                        <Box marginBottom={0}>
                          <Text bold color={msg.role === 'user' ? 'cyan' : 'green'}>
                            {msg.role === 'user' ? 'You' : 'Assistant'}:
                          </Text>
                        </Box>
                        <Box paddingX={1}>
                          <Text wrap="wrap">{msg.content}</Text>
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
                {/* Chat input at bottom */}
                {selectedRun.readyToAct && (
                  <Box borderTop={true} borderStyle="single" marginTop={1} paddingY={0}>
                    {editingChat ? (
                      <Box flexDirection="column">
                        <Box>
                          <Text>
                            <Text color="cyan">{chatInput}</Text>
                            <Text color="yellow">█</Text>
                          </Text>
                        </Box>
                        <Box marginTop={0}>
                          <Text dimColor>Enter to send, Esc to cancel</Text>
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        <Text dimColor>Press Enter to continue conversation...</Text>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>

        {/* Files changed column */}
        <Box 
          width={columnWidth} 
          borderRight={true} 
          borderStyle="single" 
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">Files Changed</Text>
            {changedFiles.length > 0 && (
              <Text dimColor> ({changedFiles.length})</Text>
            )}
          </Box>
          <Box flexGrow={1} flexDirection="column">
            {changedFiles.length === 0 ? (
              <Text dimColor>No files changed yet</Text>
            ) : (
              changedFiles.map((file, index) => (
                <Box key={file.path} marginBottom={0}>
                  <Text color={index === selectedFileIndex ? 'cyan' : undefined} bold={index === selectedFileIndex}>
                    {index === selectedFileIndex ? '▶ ' : '  '}
                    {file.status === 'A' ? '+' : file.status === 'D' ? '-' : file.status === 'R' ? '→' : 'M'} {file.path}
                  </Text>
                </Box>
              ))
            )}
          </Box>
        </Box>

        {/* Changes/Diff column */}
        <Box 
          width={columnWidth} 
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">Changes</Text>
            {changedFiles.length > 0 && selectedFileIndex < changedFiles.length && (
              <Text dimColor> - {changedFiles[selectedFileIndex].path}</Text>
            )}
          </Box>
          <Box flexGrow={1}>
            {fileDiff ? (
              <Text wrap="wrap">{fileDiff}</Text>
            ) : (
              <Text dimColor>No changes to display</Text>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
