import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '../test-utils/render.js';
import { Spinner } from './Spinner.js';

describe('Spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render spinner when active', () => {
    const { lastFrame } = render(<Spinner active={true} />);
    const output = lastFrame();
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('should not render when inactive', () => {
    const { lastFrame } = render(<Spinner active={false} />);
    const output = lastFrame();
    expect(output).toBe('');
  });

  it('should animate through frames', async () => {
    const { rerender, lastFrame } = render(<Spinner active={true} interval={100} />);
    
    const firstFrame = lastFrame();
    expect(firstFrame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    
    // Advance time by 100ms
    vi.advanceTimersByTime(100);
    await waitFor(() => {
      const nextFrame = lastFrame();
      expect(nextFrame).not.toBe(firstFrame);
    });
  });

  it('should use custom frames', () => {
    const customFrames = ['-', '\\', '|', '/'];
    const { lastFrame } = render(<Spinner active={true} frames={customFrames} />);
    const output = lastFrame();
    expect(customFrames).toContain(output.trim());
  });
});
