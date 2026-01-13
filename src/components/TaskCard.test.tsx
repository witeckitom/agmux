import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '../test-utils/render.js';
import { TaskCard } from './TaskCard.js';
import { Run } from '../models/types.js';
import { AppProvider } from '../context/AppContext.js';
import { DatabaseManager } from '../db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';
import * as skillsLoader from '../utils/skillsLoader.js';

describe('TaskCard', () => {
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = join(process.cwd(), 'test-taskcard.db');
    try {
      unlinkSync(testDbPath);
    } catch {}
    db = new DatabaseManager(testDbPath);
    // Mock skillsLoader
    vi.spyOn(skillsLoader, 'loadSkills').mockReturnValue([]);
    vi.spyOn(skillsLoader, 'getSkillById').mockReturnValue(undefined);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(testDbPath);
    } catch {}
    vi.restoreAllMocks();
  });

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

  const renderTaskCard = (run: Run) => {
    return render(
      <AppProvider database={db} projectRoot="/test/project">
        <TaskCard run={run} />
      </AppProvider>
    );
  };

  it('should display name instead of ID', () => {
    const run = createRun({
      name: 'My Task Name',
      status: 'running',
    });

    const { lastFrame } = renderTaskCard(run);
    const output = lastFrame();
    
    // Should show name
    expect(output).toContain('My Task Name');
    // Should NOT show ID
    expect(output).not.toContain('test-run-123');
  });

  it('should display persona when skillId is present', () => {
    vi.spyOn(skillsLoader, 'loadSkills').mockReturnValue([
      { id: 'coder', name: 'Coder', content: 'test', path: '/test', source: 'local' as const }
    ]);
    vi.spyOn(skillsLoader, 'getSkillById').mockReturnValue({
      id: 'coder',
      name: 'Coder',
      content: 'test',
      path: '/test',
      source: 'local'
    });

    const run = createRun({
      skillId: 'coder',
      status: 'running',
    });

    const { lastFrame } = renderTaskCard(run);
    const output = lastFrame();
    
    // Should show persona
    expect(output).toContain('Coder');
    expect(output).toContain('🎭');
  });

  it('should display progress bar when status is running', () => {
    const run = createRun({
      status: 'running',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
    });

    const { lastFrame } = renderTaskCard(run);
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

    const { lastFrame } = renderTaskCard(run);
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

    const { lastFrame } = renderTaskCard(run);
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

    const { lastFrame } = renderTaskCard(run);
    const output = lastFrame();
    
    // Should show 100% progress bar
    expect(output).toContain('100%');
    expect(output).toContain('10/10 tasks');
  });
});
