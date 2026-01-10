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
    // Initial load
    setLogs(logger.getLogs(200)); // Show last 200 logs

    // Subscribe to new logs
    const unsubscribe = logger.subscribe(() => {
      setLogs(logger.getLogs(200));
    });

    return unsubscribe;
  }, []);

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
          Application Logs ({logs.length} total) - Use ↑/↓ to scroll, 'LL' to hide
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLogs.length === 0 ? (
          <Box padding={1}>
            <Text dimColor>No logs yet</Text>
          </Box>
        ) : (
          visibleLogs.map(log => {
            const timeStr = log.timestamp.toLocaleTimeString();
            const levelStr = formatLogLevel(log.level);
            const color = getLogColor(log.level);

            return (
              <Box key={log.id} paddingX={1}>
                <Text>
                  <Text dimColor>{timeStr}</Text>
                  {' '}
                  <Text color={color} bold>
                    [{levelStr}]
                  </Text>
                  {log.context && (
                    <>
                      {' '}
                      <Text dimColor>[{log.context}]</Text>
                    </>
                  )}
                  {' '}
                  <Text>{log.message}</Text>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <Text dimColor>
                      {' '}
                      {JSON.stringify(log.metadata)}
                    </Text>
                  )}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
