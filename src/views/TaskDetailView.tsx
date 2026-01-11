import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';
import { Message, Run } from '../models/types.js';
import { getChangedFiles, getFileDiff, ChangedFile } from '../utils/gitUtils.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

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

// Isolated timer component - only this component re-renders every second,
// not the entire TaskDetailView. This prevents screen flashing.
const IsolatedRunningTimer = React.memo(function IsolatedRunningTimer({ startTime, showSeconds = true }: { startTime: Date; showSeconds?: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - startTime.getTime();
  const formatted = formatDuration(elapsed, showSeconds).padEnd(12);
  return <Text>{formatted}</Text>;
}, (prevProps, nextProps) => {
  return prevProps.startTime.getTime() === nextProps.startTime.getTime() &&
         prevProps.showSeconds === nextProps.showSeconds;
});

function renderProgressBar(percent: number, width: number): string {
  const barWidth = Math.max(10, width - 2);
  const filled = Math.floor((percent / 100) * barWidth);
  const empty = barWidth - filled;
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
}

// Memoized StatusBar component - contains the timer and isolates its updates
// from the rest of the TaskDetailView. Only re-renders when its props change.
interface StatusBarProps {
  runId: string;
  status: string;
  createdAt: Date;
  durationMs?: number | null;
  progressPercent: number;
  prompt?: string | null;
}

const StatusBar = React.memo(function StatusBar({
  runId,
  status,
  createdAt,
  durationMs,
  progressPercent,
  prompt,
}: StatusBarProps) {
  const statusColor = status === 'running' ? 'green' :
                     status === 'completed' ? 'cyan' :
                     status === 'failed' ? 'red' :
                     status === 'cancelled' ? 'yellow' : 'gray';

  const isCompleted = status === 'completed' || status === 'failed' || status === 'cancelled';
  const showCompletedDuration = isCompleted && durationMs && durationMs > 0;

  return (
    <Box borderBottom={true} borderStyle="single" paddingX={1} paddingY={0}>
      <Box flexDirection="column" width="100%">
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text bold color="cyan">Task:</Text>
            <Text> {runId.slice(0, 8)}</Text>
            <Text dimColor> | </Text>
            <Text bold color={statusColor}>Status:</Text>
            <Text color={statusColor}> {status}</Text>
            {status === 'running' && (
              <>
                <Text dimColor> | </Text>
                <Text bold>Running:</Text>
                <Text> </Text>
                <IsolatedRunningTimer startTime={createdAt} showSeconds={true} />
              </>
            )}
            {showCompletedDuration && (
              <>
                <Text dimColor> | </Text>
                <Text bold>Duration:</Text>
                <Text> {formatDuration(durationMs!, true)}</Text>
              </>
            )}
          </Box>
          <Box>
            <Text>
              {renderProgressBar(progressPercent, 30)} <Text bold color="cyan">{progressPercent}%</Text>
            </Text>
          </Box>
        </Box>
        <Box>
          <Text dimColor>{prompt || 'No prompt'}</Text>
        </Box>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if status-related props change
  // Note: createdAt is a Date object, so compare timestamps
  return (
    prevProps.runId === nextProps.runId &&
    prevProps.status === nextProps.status &&
    prevProps.createdAt.getTime() === nextProps.createdAt.getTime() &&
    prevProps.durationMs === nextProps.durationMs &&
    prevProps.progressPercent === nextProps.progressPercent &&
    prevProps.prompt === nextProps.prompt
  );
});

export function TaskDetailView() {
  const { state, database, sendMessageToTask } = useApp();

  // Memoize terminal width - used for column calculations
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  // Memoize layout calculations to prevent recalculation on every render
  const layoutConfig = useMemo(() => {
    const separatorWidth = 1;
    const availableWidth = terminalWidth - separatorWidth * 2;
    const columnWidth = Math.floor(availableWidth / 3);
    return { columnWidth };
  }, [terminalWidth]);

  // Track previous run to avoid unnecessary re-renders
  const prevRunRef = useRef<Run | null>(null);

  // Extract only the values we need from context to minimize re-renders
  const selectedRunId = state.selectedRunId;
  const runs = state.runs;

  const selectedRun = useMemo(() => {
    if (!selectedRunId) {
      prevRunRef.current = null;
      return null;
    }
    const newRun = runs.find(r => r.id === selectedRunId) || null;
    const prevRun = prevRunRef.current;

    // If the key properties haven't changed, return the previous reference
    // to avoid triggering downstream effects
    if (prevRun && newRun &&
        prevRun.id === newRun.id &&
        prevRun.status === newRun.status &&
        prevRun.phase === newRun.phase &&
        prevRun.progressPercent === newRun.progressPercent &&
        prevRun.readyToAct === newRun.readyToAct &&
        prevRun.durationMs === newRun.durationMs &&
        prevRun.completedSubtasks === newRun.completedSubtasks &&
        prevRun.totalSubtasks === newRun.totalSubtasks) {
      return prevRun; // Return same reference to prevent re-renders
    }

    prevRunRef.current = newRun;
    return newRun;
  }, [runs, selectedRunId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const chatInputRef = useRef<string>('');
  const [, setChatInputDisplay] = useState(0); // Counter to force re-render of input display (value unused)
  const [editingChat, setEditingChat] = useState(false);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [fileDiff, setFileDiff] = useState<string>('');

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
    // Always try to get changed files - getChangedFiles will handle empty/temp paths by searching for worktree
    if (selectedRun) {
      try {
        const files = getChangedFiles(selectedRun.worktreePath || '', selectedRun.id);
        setChangedFiles(files);
        if (files.length > 0 && selectedFileIndex < files.length) {
          // For getFileDiff, we need the actual worktree path
          // getChangedFiles already found it, so we can use the same logic
          // But we need to pass the found path to getFileDiff
          // Since getChangedFiles modifies worktreePath internally, we need to find it again
          let worktreePathForDiff = selectedRun.worktreePath || '';
          if (!worktreePathForDiff || worktreePathForDiff.startsWith('/tmp/') || worktreePathForDiff.trim() === '') {
            // Find worktree by run ID (same logic as getChangedFiles)
            const projectRoot = process.cwd();
            const worktreesDir = join(projectRoot, '.worktrees');
            if (existsSync(worktreesDir)) {
              try {
                const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
                  .filter(dirent => dirent.isDirectory())
                  .map(dirent => join(worktreesDir, dirent.name));
                
                const runIdPrefix = selectedRun.id.slice(0, 8);
                for (const dir of worktreeDirs) {
                  const dirName = dir.split('/').pop() || '';
                  if (dirName.includes(runIdPrefix)) {
                    worktreePathForDiff = dir;
                    break;
                  }
                }
              } catch (error) {
                // Ignore errors
              }
            }
          }
          
          if (worktreePathForDiff && !worktreePathForDiff.startsWith('/tmp/') && worktreePathForDiff.trim() !== '') {
            const diff = getFileDiff(worktreePathForDiff, files[selectedFileIndex].path, selectedRun.id);
            setFileDiff(diff);
          } else {
            setFileDiff('');
          }
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

  // Refresh messages and changed files reactively when selected run changes
  // This will be triggered by refreshRuns() calls after database operations
  useEffect(() => {
    if (selectedRun) {
      const runMessages = database.getMessagesByRunId(selectedRun.id);
      setMessages(runMessages);

      // Refresh changed files (always try, even if worktreePath is empty)
      try {
        const files = getChangedFiles(selectedRun.worktreePath || '', selectedRun.id);
        setChangedFiles(files);
        if (files.length > 0 && selectedFileIndex < files.length) {
          // Find the actual worktree path for getFileDiff
          let worktreePathForDiff = selectedRun.worktreePath || '';
          if (!worktreePathForDiff || worktreePathForDiff.startsWith('/tmp/') || worktreePathForDiff.trim() === '') {
            const projectRoot = process.cwd();
            const worktreesDir = join(projectRoot, '.worktrees');
            if (existsSync(worktreesDir)) {
              try {
                const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
                  .filter(dirent => dirent.isDirectory())
                  .map(dirent => join(worktreesDir, dirent.name));
                
                const runIdPrefix = selectedRun.id.slice(0, 8);
                for (const dir of worktreeDirs) {
                  const dirName = dir.split('/').pop() || '';
                  if (dirName.includes(runIdPrefix)) {
                    worktreePathForDiff = dir;
                    break;
                  }
                }
              } catch (error) {
                // Ignore errors
              }
            }
          }
          
          if (worktreePathForDiff && !worktreePathForDiff.startsWith('/tmp/') && worktreePathForDiff.trim() !== '') {
            const diff = getFileDiff(worktreePathForDiff, files[selectedFileIndex].path, selectedRun.id);
            setFileDiff(diff);
          } else {
            setFileDiff('');
          }
        } else {
          setFileDiff('');
        }
      } catch {
        // Ignore errors
      }
    }
  }, [selectedRun, database, selectedFileIndex]);

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
          chatInputRef.current = '';
          setChatInputDisplay(x => x + 1);
          return;
        }

        if (key.return && chatInputRef.current.trim()) {
          // Send message
          const message = chatInputRef.current.trim();
          chatInputRef.current = '';
          setEditingChat(false);
          setChatInputDisplay(x => x + 1);
          sendMessageToTask(selectedRun.id, message);
          return;
        }

        if (key.backspace || key.delete) {
          chatInputRef.current = chatInputRef.current.slice(0, -1);
          setChatInputDisplay(x => x + 1); // Force re-render of input display only
          return;
        }

        if (input && input.length === 1) {
          chatInputRef.current = chatInputRef.current + input;
          setChatInputDisplay(x => x + 1); // Force re-render of input display only
          return;
        }
      }
    }
  });

  // Extract layout values for cleaner JSX
  const { columnWidth } = layoutConfig;

  if (!selectedRun) {
    return (
      <Box padding={2} flexDirection="column">
        <Text color="red">Task not found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Status bar at top - memoized to isolate timer updates */}
      <StatusBar
        runId={selectedRun.id}
        status={selectedRun.status}
        createdAt={selectedRun.createdAt}
        durationMs={selectedRun.durationMs}
        progressPercent={selectedRun.progressPercent}
        prompt={selectedRun.prompt}
      />

      {/* Three column layout */}
      <Box flexDirection="row" flexGrow={1}>
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
                            <Text color="cyan">{chatInputRef.current}</Text>
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
