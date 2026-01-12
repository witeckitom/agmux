import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '../test-utils/render.js';
import { TaskDetailView } from './TaskDetailView.js';
import { AppProvider, useApp } from '../context/AppContext.js';
import { DatabaseManager } from '../db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { loadSkills, getSkillById } from '../utils/skillsLoader.js';

// Mock the skills loader
vi.mock('../utils/skillsLoader.js', () => ({
  loadSkills: vi.fn(),
  getSkillById: vi.fn(),
}));

function createTestContext(projectRoot: string) {
  const testDbPath = join(process.cwd(), 'test-taskdetail.db');
  try {
    unlinkSync(testDbPath);
  } catch {}
  const db = new DatabaseManager(testDbPath);
  return { db, testDbPath };
}

describe('TaskDetailView', () => {
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    const context = createTestContext('/test/project');
    db = context.db;
    testDbPath = context.testDbPath;
    
    // Reset mocks
    vi.mocked(loadSkills).mockReturnValue([]);
    vi.mocked(getSkillById).mockReturnValue(undefined);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(testDbPath);
    } catch {}
    vi.clearAllMocks();
  });

  it('should display task not found when no run is selected', () => {
    function TestWrapper() {
      const { setSelectedRunId } = useApp();
      React.useEffect(() => {
        setSelectedRunId(null);
      }, [setSelectedRunId]);
      return <TaskDetailView />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('Task not found');
  });

  it('should display task name when run has a name', async () => {
    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-1',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      name: 'Test Task Name',
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    function TestWrapper() {
      const { setSelectedRunId, refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
        setSelectedRunId(run.id);
      }, [setSelectedRunId, refreshRuns]);
      return <TaskDetailView />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).toContain('Test Task Name');
    expect(output).toContain('Name:');
  });

  it('should display skill/persona name when run has a skillId', async () => {
    const mockSkill = {
      id: 'test-skill',
      name: 'Test Skill Persona',
      content: 'Skill content',
      path: '/test/skill',
      source: 'local' as const,
    };

    vi.mocked(loadSkills).mockReturnValue([mockSkill]);
    vi.mocked(getSkillById).mockReturnValue(mockSkill);

    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-1',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: 'test-skill',
      name: 'Test Task',
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    function TestWrapper() {
      const { setSelectedRunId, refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
        setSelectedRunId(run.id);
      }, [setSelectedRunId, refreshRuns]);
      return <TaskDetailView />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    expect(output).toContain('Test Skill Persona');
    expect(output).toContain('Persona:');
  });

  it('should fallback to run ID when task has no name', async () => {
    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-1',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      name: null,
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    function TestWrapper() {
      const { setSelectedRunId, refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
        setSelectedRunId(run.id);
      }, [setSelectedRunId, refreshRuns]);
      return <TaskDetailView />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    // Should show the first 8 characters of the run ID as the name (fallback)
    expect(output).toContain(run.id.slice(0, 8));
    expect(output).toContain('Name:');
  });

  it('should not display persona when run has no skillId', async () => {
    const run = db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test-1',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      name: 'Test Task',
      prompt: 'Test prompt',
      progressPercent: 50,
      totalSubtasks: 10,
      completedSubtasks: 5,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    function TestWrapper() {
      const { setSelectedRunId, refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
        setSelectedRunId(run.id);
      }, [setSelectedRunId, refreshRuns]);
      return <TaskDetailView />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).not.toContain('Persona:');
  });
});
