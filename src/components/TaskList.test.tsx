import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '../test-utils/render.js';
import { TaskList } from './TaskList.js';
import { AppProvider, useApp } from '../context/AppContext.js';
import { DatabaseManager } from '../db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

function createTestContext(projectRoot: string) {
  const testDbPath = join(process.cwd(), 'test-tasklist.db');
  try {
    unlinkSync(testDbPath);
  } catch {}
  const db = new DatabaseManager(testDbPath);
  return { db, testDbPath };
}

describe('TaskList', () => {
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    const context = createTestContext('/test/project');
    db = context.db;
    testDbPath = context.testDbPath;
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(testDbPath);
    } catch {}
  });

  it('should display empty message when no runs', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TaskList />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('No runs yet');
  });

  it('should display list of runs', async () => {
    db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-1',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      prompt: 'First run',
      progressPercent: 30,
      totalSubtasks: 10,
      completedSubtasks: 3,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    db.createRun({
      status: 'completed',
      phase: 'finalization',
      worktreePath: '/tmp/test-2',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: 'conv-123',
      skillId: null,
      prompt: 'Second run',
      progressPercent: 100,
      totalSubtasks: 5,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: new Date(),
      retainWorktree: false,
    });

    function TestWrapper() {
      const { refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
      }, [refreshRuns]);
      return <TaskList />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).toContain('running');
    expect(output).toContain('First run');
    expect(output).toContain('30%');
    expect(output).toContain('completed');
    expect(output).toContain('Second run');
    expect(output).toContain('100%');
  });

  it('should display run status icons', async () => {
    db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      prompt: 'Test run',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    function TestWrapper() {
      const { refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
      }, [refreshRuns]);
      return <TaskList />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).toContain('▶'); // Running icon
  });
});
