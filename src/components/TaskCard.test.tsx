import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '../test-utils/render.js';
import { TaskCard } from './TaskCard.js';
import { Run } from '../models/types.js';

describe('TaskCard', () => {
  const createRun = (overrides: Partial<Run> = {}): Run => ({
    id: 'test-run-123',
    name: null,
    status: 'running',
    phase: 'agent_execution',
    worktreePath: '/tmp/test',
    baseBranch: 'main',
    agentProfileId: 'profile-1',
    conversationId: null,
    skillId: null,
    prompt: 'Test task',
    progressPercent: 0,
    totalSubtasks: 0,
    completedSubtasks: 0,
    readyToAct: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    durationMs: null,
    retainWorktree: false,
    ...overrides,
  });

  it('should display progress bar when status is running', () => {
    const run = createRun({
      status: 'running',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
    });

    const { lastFrame } = render(<TaskCard run={run} />);
    const output = lastFrame();
    
    // Should show progress bar with percentage
    expect(output).toContain('50%');
    // Should show task count
    expect(output).toContain('5/10 tasks');
  });

  it('should not display progress bar when status is not running', () => {
    const run = createRun({
      status: 'completed',
      progressPercent: 100,
      totalSubtasks: 10,
      completedSubtasks: 10,
    });

    const { lastFrame } = render(<TaskCard run={run} />);
    const output = lastFrame();
    
    // Should not show progress bar for completed tasks
    // But should still show task count
    expect(output).toContain('10/10 tasks');
    // Progress bar should not be visible (only shown when running)
    expect(output).not.toContain('100%');
  });

  it('should display progress bar at 0% when task starts', () => {
    const run = createRun({
      status: 'running',
      progressPercent: 0,
      totalSubtasks: 0,
      completedSubtasks: 0,
    });

    const { lastFrame } = render(<TaskCard run={run} />);
    const output = lastFrame();
    
    // Should show 0% progress bar
    expect(output).toContain('0%');
  });

  it('should display progress bar at 100% when task is nearly complete', () => {
    const run = createRun({
      status: 'running',
      progressPercent: 100,
      totalSubtasks: 10,
      completedSubtasks: 10,
    });

    const { lastFrame } = render(<TaskCard run={run} />);
    const output = lastFrame();
    
    // Should show 100% progress bar
    expect(output).toContain('100%');
    expect(output).toContain('10/10 tasks');
  });
});
