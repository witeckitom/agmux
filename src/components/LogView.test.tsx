import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '../test-utils/render.js';
import { LogView } from './LogView.js';
import { logger, LogEntry } from '../utils/logger.js';

describe('LogView', () => {
  beforeEach(() => {
    // Clear logs before each test
    logger.clear();
    // Mock terminal dimensions
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(24);
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(80);
  });

  afterEach(() => {
    logger.clear();
    vi.restoreAllMocks();
  });

  const createLogEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    level: 'info',
    message: 'Test log message',
    ...overrides,
  });

  it('should display logs', () => {
    logger.info('Test message 1');
    logger.info('Test message 2');

    const { lastFrame } = render(<LogView />);
    const output = lastFrame();

    expect(output).toContain('Application Logs');
    expect(output).toContain('Test message 1');
    expect(output).toContain('Test message 2');
  });

  it('should always show latest logs (scrolling disabled)', () => {
    // Create many logs to test that only latest are shown
    for (let i = 0; i < 50; i++) {
      logger.info(`Log message ${i}`);
    }

    const { lastFrame } = render(<LogView />);
    const output = lastFrame();

    // Should show the latest logs (terminal height is 24, minus header/footer = ~19 logs visible)
    // Should contain recent log numbers
    expect(output).toContain('Log message 49');
    expect(output).toContain('Log message 48');
    // Should NOT contain early log numbers (scrolling disabled)
    expect(output).not.toContain('Log message 0');
    expect(output).not.toContain('Log message 1');
  });

  it('should not respond to scroll keyboard inputs', () => {
    logger.info('Test message');

    const { stdin, lastFrame } = render(<LogView />);
    const initialOutput = lastFrame();

    // Try scroll up (k key)
    stdin.write('k');
    const afterK = lastFrame();
    expect(afterK).toBe(initialOutput); // Should not change

    // Try scroll down (j key)
    stdin.write('j');
    const afterJ = lastFrame();
    expect(afterJ).toBe(initialOutput); // Should not change

    // Try page up
    stdin.write('\u001b[5~'); // Page Up escape sequence
    const afterPageUp = lastFrame();
    expect(afterPageUp).toBe(initialOutput); // Should not change

    // Try page down
    stdin.write('\u001b[6~'); // Page Down escape sequence
    const afterPageDown = lastFrame();
    expect(afterPageDown).toBe(initialOutput); // Should not change

    // Try go to top (g key)
    stdin.write('g');
    const afterG = lastFrame();
    expect(afterG).toBe(initialOutput); // Should not change

    // Try go to bottom (G key)
    stdin.write('G');
    const afterCapitalG = lastFrame();
    expect(afterCapitalG).toBe(initialOutput); // Should not change
  });

  it('should not display scroll indicators', () => {
    // Create many logs
    for (let i = 0; i < 50; i++) {
      logger.info(`Log message ${i}`);
    }

    const { lastFrame } = render(<LogView />);
    const output = lastFrame();

    // Should not show scroll percentage
    expect(output).not.toMatch(/\d+%/);
    // Should not show scroll offset indicator
    expect(output).not.toMatch(/↑\d+/);
  });

  it('should still support filtering by log level', async () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    const { stdin, lastFrame } = render(<LogView />);
    
    // Filter to error level
    stdin.write('4');
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Error message');
      expect(output).not.toContain('Info message');
      expect(output).not.toContain('Warning message');
      expect(output).not.toContain('Debug message');
    });

    // Filter to info level
    stdin.write('2');
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Info message');
      expect(output).not.toContain('Error message');
    });

    // Filter to all
    stdin.write('0');
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Info message');
      expect(output).toContain('Error message');
    });
  });

  it('should not show scroll navigation in help text', () => {
    logger.info('Test message');

    const { lastFrame } = render(<LogView />);
    const output = lastFrame();

    // Should not contain scroll navigation instructions
    expect(output).not.toContain('j/k');
    expect(output).not.toContain('↑/↓');
    expect(output).not.toContain('PgUp/PgDn');
    expect(output).not.toContain('g/G');
    expect(output).not.toContain('scroll');
    expect(output).not.toContain('page');
    expect(output).not.toContain('top/bottom');

    // Should still show filter instructions
    expect(output).toContain('Filter:');
    expect(output).toContain('0=all');
  });

  it('should show latest logs even when many logs are added', async () => {
    // Add logs over time
    for (let i = 0; i < 10; i++) {
      logger.info(`Early log ${i}`);
    }

    const { lastFrame } = render(<LogView />);
    const initialOutput = lastFrame();
    expect(initialOutput).toContain('Early log 9');

    // Add more logs
    for (let i = 10; i < 20; i++) {
      logger.info(`Later log ${i}`);
    }

    // Wait for refresh (component refreshes every second)
    await waitFor(() => {
      const updatedOutput = lastFrame();
      expect(updatedOutput).toContain('Later log 19');
      // Should still show latest, not early logs
      expect(updatedOutput).not.toContain('Early log 0');
    }, { timeout: 2000 });
  });
});
