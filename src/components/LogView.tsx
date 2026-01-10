import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { logger, LogEntry } from '../utils/logger.js';
import { useInput } from 'ink';

interface LogViewProps {
  height: number;
}

function formatLogLevel(level: LogEntry['level']): string {
  const levelMap: Record<LogEntry['level'], string> = {
    debug: 'DBG',
    info: 'INF',
    warn: 'WRN',
    error: 'ERR',
  };
  return levelMap[level] || level.toUpperCase();
}

function getLogColor(level: LogEntry['level']): string {
  const colorMap: Record<LogEntry['level'], string> = {
    debug: 'gray',
    info: 'cyan',
    warn: 'yellow',
    error: 'red',
  };
  return colorMap[level] || 'white';
}

export function LogView({ height }: LogViewProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    // Load logs once when the view is opened
    // Don't subscribe to updates - keep the view static
    setLogs(logger.getLogs(200)); // Show last 200 logs
  }, []); // Empty dependency array means this runs once on mount

  // Handle keyboard input for scrolling logs
  useInput((input, key) => {
    if (key.upArrow) {
      setScrollOffset(prev => Math.min(prev + 1, Math.max(0, logs.length - height)));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.min(prev + height, Math.max(0, logs.length - height)));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.max(0, prev - height));
    }
  });

  // Calculate visible logs based on scroll offset
  const visibleLogs = useMemo(() => {
    if (logs.length === 0) {
      return [];
    }
    if (scrollOffset === 0) {
      // Show most recent logs
      return logs.slice(-height);
    }
    const start = Math.max(0, logs.length - height - scrollOffset);
    const end = logs.length - scrollOffset;
    return logs.slice(start, end);
  }, [logs, height, scrollOffset]);

  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  return (
    <Box
      width={terminalWidth}
      borderStyle="single"
      borderTop={true}
      flexDirection="column"
      height={height}
    >
            <Box paddingX={1} borderBottom={true}>
              <Text bold>
                Application Logs ({logs.length} total) - Use ↑/↓ to scroll, 'Shift+L' to hide
              </Text>
            </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLogs.length === 0 ? (
          <Box padding={1}>
            <Text dimColor>No logs yet</Text>
          </Box>
        ) : (
          visibleLogs.map((log, index) => {
            try {
              // Safely extract log properties with defaults
              const timestamp = log?.timestamp;
              const timeStr = timestamp instanceof Date 
                ? timestamp.toLocaleTimeString() 
                : (typeof timestamp === 'string' ? timestamp : '--:--:--');
              
              const level = log?.level || 'info';
              const levelStr = formatLogLevel(level);
              const color = getLogColor(level);
              
              // Safely extract message - handle various types
              let message = '';
              if (typeof log?.message === 'string') {
                message = log.message;
              } else if (log?.message != null) {
                message = String(log.message);
              }
              
              const context = typeof log?.context === 'string' ? log.context : '';

              // Safely stringify metadata, handling circular references and non-serializable values
              let metadataStr = '';
              if (log?.metadata && typeof log.metadata === 'object') {
                try {
                  // Filter out functions, undefined, and circular references
                  const safeMetadata = JSON.parse(JSON.stringify(log.metadata, (key, value) => {
                    if (typeof value === 'function') return '[Function]';
                    if (value === undefined) return '[undefined]';
                    if (value instanceof Error) return { message: value.message, stack: value.stack };
                    return value;
                  }));
                  if (Object.keys(safeMetadata).length > 0) {
                    metadataStr = ' ' + JSON.stringify(safeMetadata);
                  }
                } catch (metaError) {
                  // If metadata can't be stringified, just skip it
                  metadataStr = '';
                }
              }

              const logId = log?.id || `log-${index}`;

              return (
                <Box key={logId} paddingX={1}>
                  <Text>
                    <Text dimColor>{timeStr}</Text>
                    {' '}
                    <Text color={color} bold>
                      [{levelStr}]
                    </Text>
                    {context && (
                      <>
                        {' '}
                        <Text dimColor>[{context}]</Text>
                      </>
                    )}
                    {' '}
                    <Text>{message}</Text>
                    {metadataStr && (
                      <Text dimColor>{metadataStr}</Text>
                    )}
                  </Text>
                </Box>
              );
            } catch (error: any) {
              // Fallback if log entry is malformed - show minimal info
              const logId = log?.id || `log-error-${index}`;
              const errorMsg = error?.message || 'Unknown error';
              return (
                <Box key={logId} paddingX={1}>
                  <Text color="red">
                    [ERR] Error displaying log entry: {errorMsg}
                    {log?.message && ` (message: ${String(log.message).substring(0, 50)})`}
                  </Text>
                </Box>
              );
            }
          })
        )}
      </Box>
    </Box>
  );
}
