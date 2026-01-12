import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useInput } from 'ink';
import { useApp } from '../context/AppContext.js';
import { logger } from '../utils/logger.js';
import { Message, Run } from '../models/types.js';
import { getChangedFiles, getFileDiff, ChangedFile, createCommit } from '../utils/gitUtils.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';

// Animated spinner for progress indication
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const ProgressSpinner = React.memo(function ProgressSpinner({ startTime }: { startTime: Date }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % spinnerFrames.length);
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatElapsed = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  return (
    <Text color="yellow">
      {spinnerFrames[frame]} Working... ({formatElapsed(elapsed)})
    </Text>
  );
});

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

  // Truncate prompt if too long
  const displayPrompt = prompt && prompt.length > 100 
    ? prompt.slice(0, 100) + '...' 
    : (prompt || 'No prompt');

  return (
    <Box borderBottom={true} borderStyle="single" paddingX={1} height={3}>
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
        <Text dimColor wrap="truncate-end">{displayPrompt}</Text>
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
  const { state, database, sendMessageToTask, showConfirmation, mergeTaskBranch, refreshRuns, setChatEditing, markTaskComplete } = useApp();
  const { stdout } = useStdout();

  // Get terminal dimensions reactively
  const terminalWidth = stdout?.columns || 80;

  // Simple layout - just calculate widths, let flexGrow handle heights
  const halfWidth = Math.floor(terminalWidth / 2);

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
  
  // Chat scroll state
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  // Focus state: 'chat' | 'files'
  const [focusPane, setFocusPane] = useState<'chat' | 'files'>('chat');

  // Load messages when selected run ID changes (initial load)
  useEffect(() => {
    if (selectedRunId) {
      const runMessages = database.getMessagesByRunId(selectedRunId);
      setMessages(runMessages);
      // Auto-scroll to bottom on new task
      setChatScrollOffset(0);
    } else {
      setMessages([]);
    }
  }, [selectedRunId, database]);

  // Poll for message updates while task is running (for streaming chat)
  // Poll very frequently (100ms) for smooth streaming feel
  useEffect(() => {
    if (!selectedRunId || !selectedRun) {
      return;
    }

    // Only poll when running (either actively processing or waiting for input)
    if (selectedRun.status !== 'running') {
      return;
    }

    // Poll every 100ms while actively processing, 500ms when waiting for input
    const pollIntervalMs = selectedRun.readyToAct ? 500 : 100;
    
    const pollInterval = setInterval(() => {
      const runMessages = database.getMessagesByRunId(selectedRunId);
      setMessages(prevMessages => {
        // Only update if messages have changed
        const lastPrev = prevMessages[prevMessages.length - 1];
        const lastNew = runMessages[runMessages.length - 1];
        
        if (prevMessages.length !== runMessages.length) {
          return runMessages;
        }
        if (lastPrev && lastNew && lastPrev.content !== lastNew.content) {
          return runMessages;
        }
        return prevMessages;
      });
    }, pollIntervalMs);

    return () => clearInterval(pollInterval);
  }, [selectedRunId, selectedRun?.status, selectedRun?.readyToAct, database]);

  // Helper function to resolve worktree path
  const resolveWorktreePath = useMemo(() => {
    return (runId: string, worktreePath: string | null): string => {
      let resolvedPath = worktreePath || '';
      if (!resolvedPath || resolvedPath.startsWith('/tmp/') || resolvedPath.trim() === '') {
        const projectRoot = process.cwd();
        const worktreesDir = join(projectRoot, '.worktrees');
        if (existsSync(worktreesDir)) {
          try {
            const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => join(worktreesDir, dirent.name));
            
            const runIdPrefix = runId.slice(0, 8);
            for (const dir of worktreeDirs) {
              const dirName = dir.split('/').pop() || '';
              if (dirName.includes(runIdPrefix)) {
                resolvedPath = dir;
                break;
              }
            }
          } catch {
            // Ignore errors
          }
        }
      }
      return resolvedPath;
    };
  }, []);

  // Helper to load changed files and diff
  const loadChangedFiles = useMemo(() => {
    return (run: Run, fileIndex: number) => {
      try {
        const files = getChangedFiles(run.worktreePath || '', run.id);
        const worktreePath = resolveWorktreePath(run.id, run.worktreePath);
        
        let diff = '';
        if (files.length > 0 && fileIndex < files.length && worktreePath && !worktreePath.startsWith('/tmp/')) {
          diff = getFileDiff(worktreePath, files[fileIndex].path, run.id);
        }
        
        return { files, diff };
      } catch {
        return { files: [], diff: '' };
      }
    };
  }, [resolveWorktreePath]);

  // Load changed files when selected run or file index changes
  useEffect(() => {
    if (selectedRun) {
      const { files, diff } = loadChangedFiles(selectedRun, selectedFileIndex);
      setChangedFiles(files);
      setFileDiff(diff);
    } else {
      setChangedFiles([]);
      setFileDiff('');
    }
  }, [selectedRun, selectedFileIndex, loadChangedFiles]);

  // Poll for changed files while task is running
  useEffect(() => {
    if (!selectedRun || selectedRun.status !== 'running') {
      return;
    }

    // Poll every 2 seconds for file changes while task is running
    const pollInterval = setInterval(() => {
      const { files, diff } = loadChangedFiles(selectedRun, selectedFileIndex);
      setChangedFiles(prevFiles => {
        // Only update if files have changed
        if (prevFiles.length !== files.length) {
          return files;
        }
        const prevPaths = prevFiles.map(f => f.path).join(',');
        const newPaths = files.map(f => f.path).join(',');
        if (prevPaths !== newPaths) {
          return files;
        }
        return prevFiles;
      });
      setFileDiff(diff);
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [selectedRun?.id, selectedRun?.status, selectedFileIndex, loadChangedFiles]);

  // Calculate chat lines for scrolling
  const chatLines = useMemo(() => {
    const lines: { type: 'header' | 'content' | 'thinking'; role?: 'user' | 'assistant'; text: string; isStreaming?: boolean }[] = [];
    
    if (messages.length === 0 && selectedRun?.status === 'running') {
      lines.push({ type: 'header', role: 'assistant', text: 'Assistant:' });
      lines.push({ type: 'thinking', text: 'working' });
    } else {
      messages.forEach((msg, index) => {
        const isLastMessage = index === messages.length - 1;
        const isStreaming = isLastMessage && msg.role === 'assistant' && selectedRun?.status === 'running';
        
        // Add header line
        lines.push({ 
          type: 'header', 
          role: msg.role, 
          text: msg.role === 'user' ? 'You:' : 'Assistant:', 
          isStreaming,
        });
        
        // Split content into lines and add each
        const contentLines = msg.content.split('\n');
        contentLines.forEach((line, lineIdx) => {
          const isLastLine = lineIdx === contentLines.length - 1;
          lines.push({ 
            type: 'content', 
            role: msg.role,
            text: line + (isStreaming && isLastLine ? ' ▌' : ''),
            isStreaming,
          });
        });
        
        // Add blank line between messages
        if (index < messages.length - 1) {
          lines.push({ type: 'content', text: '' });
        }
      });
      
      // Show thinking if running but last message is from user
      if (selectedRun?.status === 'running' && messages.length > 0 && messages[messages.length - 1].role === 'user') {
        lines.push({ type: 'content', text: '' });
        lines.push({ type: 'header', role: 'assistant', text: 'Assistant:' });
        lines.push({ type: 'thinking', text: 'working' });
      }
    }
    
    return lines;
  }, [messages, selectedRun?.status]);

  // Calculate visible height for chat based on terminal height
  // Reserve: StatusBar(3) + ChatHeader(2) + ChatBottom(2) + buffer(2) = 9 lines
  const terminalHeight = stdout?.rows || 24;
  const chatVisibleHeight = Math.max(5, terminalHeight - 9);

  // Calculate visible chat lines based on scroll
  const visibleChatLines = useMemo(() => {
    if (chatLines.length === 0) return [];
    
    // scrollOffset 0 = bottom (newest), higher = further back
    if (chatScrollOffset === 0) {
      return chatLines.slice(-chatVisibleHeight);
    }
    
    const end = chatLines.length - chatScrollOffset;
    const start = Math.max(0, end - chatVisibleHeight);
    return chatLines.slice(start, end);
  }, [chatLines, chatVisibleHeight, chatScrollOffset]);

  // Auto-scroll to bottom when new messages arrive (if already at bottom)
  const prevChatLinesLength = useRef(chatLines.length);
  useEffect(() => {
    // If we were at the bottom and new content arrived, stay at bottom
    if (chatScrollOffset === 0 && chatLines.length > prevChatLinesLength.current) {
      // Already at bottom, stay there (offset 0 = bottom)
    }
    prevChatLinesLength.current = chatLines.length;
  }, [chatLines.length, chatScrollOffset]);

  // Handle input for chat and file navigation
  useInput((input, key) => {
    // Tab to switch focus between panes
    if (key.tab) {
      setFocusPane(prev => prev === 'chat' ? 'files' : 'chat');
      return;
    }

    // Chat editing mode
    if (editingChat) {
      if (key.escape) {
        setEditingChat(false);
        setChatEditing(false);
        chatInputRef.current = '';
        setChatInputDisplay(x => x + 1);
        return;
      }

      if (key.return && chatInputRef.current.trim()) {
        // Send message
        const message = chatInputRef.current.trim();
        chatInputRef.current = '';
        setEditingChat(false);
        setChatEditing(false);
        setChatInputDisplay(x => x + 1);
        if (selectedRun) {
          sendMessageToTask(selectedRun.id, message);
        }
        return;
      }

      if (key.backspace || key.delete) {
        chatInputRef.current = chatInputRef.current.slice(0, -1);
        setChatInputDisplay(x => x + 1);
        return;
      }

      // Handle multi-character input (paste, special characters, etc.)
      if (input && input.length > 0) {
        chatInputRef.current = chatInputRef.current + input;
        setChatInputDisplay(x => x + 1);
        return;
      }
      return;
    }

    // Chat pane navigation
    if (focusPane === 'chat') {
      const maxOffset = Math.max(0, chatLines.length - chatVisibleHeight);
      
      if (input === 'j' || key.downArrow) {
        // Scroll down (toward newer messages)
        setChatScrollOffset(prev => Math.max(0, prev - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        // Scroll up (toward older messages)
        setChatScrollOffset(prev => Math.min(maxOffset, prev + 1));
        return;
      }
      if (key.pageDown) {
        setChatScrollOffset(prev => Math.max(0, prev - chatVisibleHeight));
        return;
      }
      if (key.pageUp) {
        setChatScrollOffset(prev => Math.min(maxOffset, prev + chatVisibleHeight));
        return;
      }
      if (input === 'g') {
        // Go to top (oldest)
        setChatScrollOffset(maxOffset);
        return;
      }
      if (input === 'G') {
        // Go to bottom (newest)
        setChatScrollOffset(0);
        return;
      }
      
      // Enter to start typing (when task is ready)
      if (key.return && selectedRun?.readyToAct) {
        setEditingChat(true);
        setChatEditing(true);
        return;
      }
    }

    // Files pane navigation
    if (focusPane === 'files' && changedFiles.length > 0) {
      if (input === 'j' || key.downArrow) {
        setSelectedFileIndex(prev => Math.min(changedFiles.length - 1, prev + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelectedFileIndex(prev => Math.max(0, prev - 1));
        return;
      }
    }

    // Shift+M to merge worktree to main
    if (key.shift && (input === 'm' || input === 'M')) {
      if (!selectedRun) {
        logger.warn('No task selected for merge', 'TaskDetailView');
        return;
      }

      // Try to resolve worktree path (handles empty paths by searching)
      const worktreePath = resolveWorktreePath(selectedRun.id, selectedRun.worktreePath);
      
      // Check if worktree was found
      if (!worktreePath || worktreePath.trim() === '' || !existsSync(worktreePath)) {
        showConfirmation(
          'No worktree found for this task. Cannot merge.',
          () => {
            // Just close the dialog
          }
        );
        return;
      }

      // Check if there are any edits
      const files = getChangedFiles(worktreePath, selectedRun.id);

      if (files.length === 0) {
        // No edits - show message
        showConfirmation(
          'No changes detected in worktree. Nothing to merge.',
          () => {
            // Just close the dialog
          }
        );
      } else {
        // Has edits - show confirmation
        const fileCount = files.length;
        const prompt = selectedRun.prompt || 'this task';
        const targetBranch = selectedRun.baseBranch || 'main';
        showConfirmation(
          `Merge task "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}" to ${targetBranch}?\n\n${fileCount} file${fileCount > 1 ? 's' : ''} will be merged.\n\nCursor will generate a commit message first.`,
          async () => {
            try {
              // Step 1: Ask Cursor to generate a commit message
              logger.info(`Asking Cursor to generate commit message for task ${selectedRun.id}`, 'TaskDetailView');
              
              // Get the current message count to identify the new response
              const messagesBefore = database.getMessagesByRunId(selectedRun.id);
              const messageCountBefore = messagesBefore.length;
              
              const commitPrompt = `Please generate a concise commit message for the changes in this worktree. Only provide the commit message text, nothing else.`;
              await sendMessageToTask(selectedRun.id, commitPrompt);

              // Step 2: Poll for the response
              // Wait for the agent to finish and be ready to act
              const pollForCommitMessage = async (): Promise<string | null> => {
                const maxAttempts = 120; // 60 seconds max (500ms * 120)
                let attempts = 0;
                
                while (attempts < maxAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Refresh run state
                  const updatedRun = database.getRun(selectedRun.id);
                  if (!updatedRun) {
                    return null;
                  }

                  // Check if run failed
                  if (updatedRun.status === 'failed') {
                    return null;
                  }

                  // Check if agent is ready (has responded)
                  if (updatedRun.readyToAct) {
                    // Get messages and find the new assistant message
                    const runMessages = database.getMessagesByRunId(selectedRun.id);
                    
                    // Find assistant messages that came after our request
                    const newMessages = runMessages.slice(messageCountBefore);
                    const newAssistantMessages = newMessages.filter(m => m.role === 'assistant');
                    
                    // If no new assistant messages, check the last one overall
                    const messagesToCheck = newAssistantMessages.length > 0 
                      ? newAssistantMessages 
                      : runMessages.filter(m => m.role === 'assistant');
                    
                    if (messagesToCheck.length > 0) {
                      const lastMessage = messagesToCheck[messagesToCheck.length - 1];
                      // Extract commit message (should be the last assistant message)
                      let commitMessage = lastMessage.content.trim();
                      
                      // Remove markdown code blocks if present (```commit or ```)
                      commitMessage = commitMessage.replace(/^```[\w]*\n?/i, '').replace(/\n?```$/i, '');
                      
                      // Remove any leading/trailing quotes
                      commitMessage = commitMessage.replace(/^["']|["']$/g, '');
                      
                      // Take only the first line (commit messages are typically single line)
                      const firstLine = commitMessage.split('\n')[0].trim();
                      
                      // Remove any prefix like "Commit message:" or similar
                      const cleanedMessage = firstLine
                        .replace(/^(commit message|message|commit):\s*/i, '')
                        .trim();
                      
                      if (cleanedMessage && cleanedMessage.length > 0) {
                        return cleanedMessage;
                      }
                    }
                  }
                  
                  attempts++;
                }
                
                return null; // Timeout
              };

              const commitMessage = await pollForCommitMessage();
              
              if (!commitMessage) {
                showConfirmation(
                  'Timeout waiting for commit message from Cursor. Please try again.',
                  () => {
                    // Just close the dialog
                  }
                );
                return;
              }

              logger.info(`Received commit message from Cursor: ${commitMessage.substring(0, 50)}`, 'TaskDetailView');

              // Step 3: Create the commit
              const commitResult = createCommit(worktreePath, commitMessage);
              if (!commitResult.success) {
                showConfirmation(
                  `Failed to create commit: ${commitResult.error || 'Unknown error'}`,
                  () => {
                    // Just close the dialog
                  }
                );
                return;
              }

              logger.info(`Created commit successfully`, 'TaskDetailView');

              // Step 4: Merge to base branch (main/master)
              const targetBranch = selectedRun.baseBranch || 'main';
              await mergeTaskBranch(selectedRun.id, targetBranch);
              logger.info(`Successfully merged task ${selectedRun.id} to ${targetBranch}`, 'TaskDetailView');
              
              // Step 5: Mark task as complete
              markTaskComplete(selectedRun.id);
              logger.info(`Marked task ${selectedRun.id} as complete`, 'TaskDetailView');
              
              // Refresh runs to update UI
              refreshRuns();
            } catch (error: any) {
              logger.error(`Failed to merge task ${selectedRun.id}`, 'TaskDetailView', { error });
              // Show error confirmation
              showConfirmation(
                `Merge failed: ${error.message || 'Unknown error'}`,
                () => {
                  // Just close the dialog
                }
              );
            }
          }
        );
      }
      return;
    }

    // Shift+R to run test command
    if (key.shift && (input === 'r' || input === 'R')) {
      if (!selectedRun) {
        logger.warn('No task selected for running test command', 'TaskDetailView');
        return;
      }

      // Resolve worktree path
      const worktreePath = resolveWorktreePath(selectedRun.id, selectedRun.worktreePath);
      
      // Check if worktree exists
      if (!worktreePath || worktreePath.trim() === '' || !existsSync(worktreePath)) {
        showConfirmation(
          'No worktree found for this task. Cannot run test command.',
          () => {
            // Just close the dialog
          }
        );
        return;
      }

      // Get run command from database
      const runCommand = database.getPreference('runCommand');
      if (!runCommand || runCommand.trim() === '') {
        showConfirmation(
          'No run command configured. Please set it in Settings > Project.',
          () => {
            // Just close the dialog
          }
        );
        return;
      }

      // Execute the command in the worktree directory
      try {
        logger.info(`Running test command in worktree: ${worktreePath}`, 'TaskDetailView', { command: runCommand });

        // Run the command as a shell script from the worktree directory
        const childProcess = spawn(runCommand, {
          cwd: worktreePath,
          stdio: 'inherit',
          shell: true,
        });

        childProcess.on('error', (error) => {
          logger.error(`Failed to run test command`, 'TaskDetailView', { error, command: runCommand });
          showConfirmation(
            `Failed to run test command: ${error.message || 'Unknown error'}`,
            () => {
              // Just close the dialog
            }
          );
        });

        childProcess.on('exit', (code) => {
          if (code === 0) {
            logger.info(`Test command completed successfully`, 'TaskDetailView');
          } else {
            logger.warn(`Test command exited with code ${code}`, 'TaskDetailView');
          }
        });
      } catch (error: any) {
        logger.error(`Error running test command`, 'TaskDetailView', { error, command: runCommand });
        showConfirmation(
          `Error running test command: ${error.message || 'Unknown error'}`,
          () => {
            // Just close the dialog
          }
        );
      }
      return;
    }
  });

  if (!selectedRun) {
    return (
      <Box padding={2} flexDirection="column" flexGrow={1}>
        <Text color="red">Task not found</Text>
      </Box>
    );
  }

  // Calculate scroll indicator
  const chatScrollPercent = chatLines.length <= chatVisibleHeight 
    ? 100 
    : Math.round(((chatLines.length - chatScrollOffset) / chatLines.length) * 100);

  return (
    <Box flexDirection="column" flexGrow={1} width={terminalWidth}>
      {/* Status bar at top - memoized to isolate timer updates */}
      <StatusBar
        runId={selectedRun.id}
        status={selectedRun.status}
        createdAt={selectedRun.createdAt}
        durationMs={selectedRun.durationMs}
        progressPercent={selectedRun.progressPercent}
        prompt={selectedRun.prompt}
      />

      {/* Two column layout: Chat (left half) | Files+Changes (right half) */}
      <Box flexDirection="row" flexGrow={1} width={terminalWidth}>
        {/* Chat column - left half */}
        <Box 
          width={halfWidth} 
          borderRight={true} 
          borderStyle="single"
          borderColor={focusPane === 'chat' ? 'cyan' : undefined}
          flexDirection="column"
          flexGrow={1}
        >
          {/* Chat header */}
          <Box paddingX={1} borderBottom={true} borderStyle="single" justifyContent="space-between">
            <Box>
              <Text bold color="cyan">💬 Chat</Text>
              {focusPane === 'chat' && <Text color="cyan"> (focused)</Text>}
            </Box>
            <Box>
              <Text dimColor>
                {chatScrollPercent}%
                {chatScrollOffset > 0 && ` ↑${chatScrollOffset}`}
              </Text>
            </Box>
          </Box>
          
          {/* Chat messages - scrollable */}
          <Box flexDirection="column" flexGrow={1} paddingX={1}>
            {visibleChatLines.length === 0 ? (
              <Text dimColor>No messages yet</Text>
            ) : (
              visibleChatLines.map((line, index) => {
                if (line.type === 'header') {
                  return (
                    <Box key={`line-${index}`}>
                      <Text bold color={line.role === 'user' ? 'cyan' : 'green'}>
                        {line.text}
                      </Text>
                      {line.isStreaming && <Text color="yellow"> ●</Text>}
                    </Box>
                  );
                }
                if (line.type === 'thinking') {
                  return (
                    <Box key={`line-${index}`}>
                      <ProgressSpinner startTime={selectedRun.createdAt} />
                    </Box>
                  );
                }
                return (
                  <Box key={`line-${index}`} paddingLeft={1}>
                    <Text wrap="wrap">{line.text}</Text>
                  </Box>
                );
              })
            )}
          </Box>

          {/* Chat input/help at bottom */}
          <Box borderTop={true} borderStyle="single" paddingX={1} flexShrink={0} flexDirection="column">
            {selectedRun.readyToAct ? (
              editingChat ? (
                <Box flexDirection="column" width="100%">
                  {chatInputRef.current === '' ? (
                    <Box flexDirection="row">
                      <Text color="cyan">&gt; </Text>
                      <Text color="yellow">█</Text>
                    </Box>
                  ) : (
                    chatInputRef.current.split('\n').map((line, lineIndex) => {
                      const isLastLine = lineIndex === chatInputRef.current.split('\n').length - 1;
                      const prompt = lineIndex === 0 ? '> ' : '  ';
                      
                      return (
                        <Box key={lineIndex} flexDirection="row" width="100%">
                          <Text color="cyan" wrap="wrap">
                            {prompt}
                            {line}
                          </Text>
                          {isLastLine && (
                            <Text color="yellow">█</Text>
                          )}
                        </Box>
                      );
                    })
                  )}
                </Box>
              ) : (
                <Text dimColor>Enter=reply | j/k=scroll | Tab=switch</Text>
              )
            ) : (
              <Text dimColor>j/k=scroll | Tab=switch</Text>
            )}
          </Box>
        </Box>

        {/* Right column - Files Changed (top) + Changes (bottom) */}
        <Box 
          width={halfWidth} 
          flexDirection="column"
          flexGrow={1}
        >
          {/* Files Changed - top half of right side */}
          <Box 
            flexGrow={1}
            borderBottom={true}
            borderStyle="single"
            borderColor={focusPane === 'files' ? 'cyan' : undefined}
            flexDirection="column"
          >
            <Box paddingX={1} borderBottom={true} borderStyle="single">
              <Text bold color="cyan">📁 Files Changed</Text>
              {changedFiles.length > 0 && (
                <Text dimColor> ({changedFiles.length})</Text>
              )}
              {focusPane === 'files' && <Text color="cyan"> (focused)</Text>}
            </Box>
            <Box flexDirection="column" paddingX={1} flexGrow={1}>
              {changedFiles.length === 0 ? (
                <Text dimColor>No files changed yet</Text>
              ) : (
                changedFiles.map((file, index) => (
                  <Box key={file.path}>
                    <Text 
                      color={index === selectedFileIndex ? 'cyan' : undefined} 
                      bold={index === selectedFileIndex}
                    >
                      {index === selectedFileIndex ? '▶ ' : '  '}
                      {file.status === 'A' ? '+' : file.status === 'D' ? '-' : file.status === 'R' ? '→' : 'M'} {file.path}
                    </Text>
                  </Box>
                ))
              )}
            </Box>
          </Box>

          {/* Changes/Diff - bottom half of right side */}
          <Box 
            flexGrow={1}
            flexDirection="column"
          >
            <Box paddingX={1} borderBottom={true} borderStyle="single">
              <Text bold color="cyan">📝 Changes</Text>
              {changedFiles.length > 0 && selectedFileIndex < changedFiles.length && (
                <Text dimColor> - {changedFiles[selectedFileIndex].path}</Text>
              )}
            </Box>
            <Box flexDirection="column" paddingX={1} flexGrow={1}>
              {fileDiff ? (
                fileDiff.split('\n').slice(0, 20).map((line, index) => {
                  let color: string | undefined;
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    color = 'green';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    color = 'red';
                  } else if (line.startsWith('@@')) {
                    color = 'cyan';
                  }
                  return (
                    <Text key={index} color={color} wrap="wrap">{line}</Text>
                  );
                })
              ) : (
                <Text dimColor>Select a file to view changes</Text>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
