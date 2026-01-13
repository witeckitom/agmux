import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { logger, LogEntry } from '../utils/logger.js';
import { useInput } from 'ink';

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

export function LogView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogEntry['level'] | 'all'>('all');

  // Get terminal dimensions for full-screen overlay
  const terminalHeight = useMemo(() => (process.stdout.rows || 24) - 1, []);
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);
  
  // Calculate available height for logs (subtract header and footer)
  const headerHeight = 3; // Title bar
  const footerHeight = 2; // Help text
  const logsHeight = terminalHeight - headerHeight - footerHeight;

  // Load and auto-refresh logs
  useEffect(() => {
    const loadLogs = () => setLogs(logger.getLogs(500)); // Show last 500 logs
    loadLogs();
    
    // Refresh logs every second while view is open
    const interval = setInterval(loadLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter logs based on selected level
  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all') return logs;
    return logs.filter(log => log.level === filterLevel);
  }, [logs, filterLevel]);

  // Handle keyboard input for filtering only (scrolling disabled)
  useInput((input) => {
    if (input === '1') {
      setFilterLevel('debug');
    } else if (input === '2') {
      setFilterLevel('info');
    } else if (input === '3') {
      setFilterLevel('warn');
    } else if (input === '4') {
      setFilterLevel('error');
    } else if (input === '0') {
      setFilterLevel('all');
    }
  });

  // Calculate visible logs - always show latest logs (scrolling disabled)
  const visibleLogs = useMemo(() => {
    if (filteredLogs.length === 0) return [];
    // Always show the most recent logs
    return filteredLogs.slice(-logsHeight);
  }, [filteredLogs, logsHeight]);

  return (
    <Box
      width={terminalWidth}
      height={terminalHeight}
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
    >
      {/* Header */}
      <Box 
        paddingX={2} 
        borderBottom={true} 
        borderStyle="single"
        justifyContent="space-between"
      >
        <Box>
          <Text bold color="cyan">📋 Application Logs</Text>
          <Text dimColor> ({filteredLogs.length} entries</Text>
          {filterLevel !== 'all' && (
            <Text dimColor>, filtered: {filterLevel}</Text>
          )}
          <Text dimColor>)</Text>
        </Box>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLogs.length === 0 ? (
          <Box padding={2} justifyContent="center">
            <Text dimColor>
              {filterLevel === 'all' ? 'No logs yet' : `No ${filterLevel} logs`}
            </Text>
          </Box>
        ) : (
          visibleLogs.map((log, index) => {
            try {
              const timestamp = log?.timestamp;
              const timeStr = timestamp instanceof Date 
                ? timestamp.toLocaleTimeString() 
                : (typeof timestamp === 'string' ? timestamp : '--:--:--');
              
              const level = log?.level || 'info';
              const levelStr = formatLogLevel(level);
              const color = getLogColor(level);
              
              let message = '';
              if (typeof log?.message === 'string') {
                message = log.message;
              } else if (log?.message != null) {
                message = String(log.message);
              }
              
              const context = typeof log?.context === 'string' ? log.context : '';

              let metadataStr = '';
              if (log?.metadata && typeof log.metadata === 'object') {
                try {
                  const safeMetadata = JSON.parse(JSON.stringify(log.metadata, (key, value) => {
                    if (typeof value === 'function') return '[Function]';
                    if (value === undefined) return '[undefined]';
                    if (value instanceof Error) return { message: value.message, stack: value.stack };
                    return value;
                  }));
                  if (Object.keys(safeMetadata).length > 0) {
                    metadataStr = ' ' + JSON.stringify(safeMetadata);
                  }
                } catch {
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
                        <Text color="magenta">[{context}]</Text>
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
              const logId = log?.id || `log-error-${index}`;
              return (
                <Box key={logId} paddingX={1}>
                  <Text color="red">
                    [ERR] Error displaying log entry
                  </Text>
                </Box>
              );
            }
          })
        )}
      </Box>

      {/* Footer with help */}
      <Box 
        paddingX={2} 
        borderTop={true} 
        borderStyle="single"
        justifyContent="flex-end"
      >
        <Box>
          <Text dimColor>
            <Text bold>Filter:</Text> 0=all 1=
            <Text color="gray">dbg</Text> 2=
            <Text color="cyan">inf</Text> 3=
            <Text color="yellow">wrn</Text> 4=
            <Text color="red">err</Text>
            {' '}| <Text bold>L</Text>=close
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
