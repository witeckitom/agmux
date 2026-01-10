export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs
  private listeners: Set<() => void> = new Set();

  log(level: LogLevel, message: string, context?: string, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
      context,
      metadata,
    };

    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify listeners
    this.listeners.forEach(listener => listener());

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${entry.timestamp.toISOString()}] [${level.toUpperCase()}]`;
      const contextStr = context ? `[${context}]` : '';
      console.log(`${prefix} ${contextStr} ${message}`, metadata || '');
    }
  }

  debug(message: string, context?: string, metadata?: Record<string, any>) {
    this.log('debug', message, context, metadata);
  }

  info(message: string, context?: string, metadata?: Record<string, any>) {
    this.log('info', message, context, metadata);
  }

  warn(message: string, context?: string, metadata?: Record<string, any>) {
    this.log('warn', message, context, metadata);
  }

  error(message: string, context?: string, metadata?: Record<string, any>) {
    this.log('error', message, context, metadata);
  }

  getLogs(limit?: number): LogEntry[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  clear() {
    this.logs = [];
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const logger = new Logger();
