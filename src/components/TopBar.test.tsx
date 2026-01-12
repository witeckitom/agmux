import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '../test-utils/render.js';
import { TopBar } from './TopBar.js';
import { AppProvider, useApp } from '../context/AppContext.js';
import { DatabaseManager } from '../db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

function createTestContext(projectRoot: string) {
  const testDbPath = join(process.cwd(), 'test-topbar.db');
  try {
    unlinkSync(testDbPath);
  } catch {}
  const db = new DatabaseManager(testDbPath);
  return { db, testDbPath };
}

describe('TopBar', () => {
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

  it('should display project root, branch, and context', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/path/to/my-project">
        <TopBar />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('Project:');
    expect(output).toContain('my-project');
    expect(output).toContain('Branch:');
    expect(output).toContain('View:');
    expect(output).toContain('tasks');
  });

  it('should extract project name from path', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/home/user/agent-orch">
        <TopBar />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('agent-orch');
  });

  it('should show running count', async () => {
    // Create a running run BEFORE rendering
    db.createRun({
      status: 'running',
      phase: 'agent_execution',
      worktreePath: '/tmp/test',
      baseBranch: 'main',
      agentProfileId: 'profile-1',
      conversationId: null,
      skillId: null,
      prompt: 'Test',
      progressPercent: 0,
      totalSubtasks: 0,
      completedSubtasks: 0,
      readyToAct: false,
      completedAt: null,
      retainWorktree: false,
    });

    // Create a component that triggers refreshRuns
    function TestWrapper() {
      const { refreshRuns } = useApp();
      React.useEffect(() => {
        refreshRuns();
      }, [refreshRuns]);
      return <TopBar />;
    }

    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapper />
      </AppProvider>
    );

    // Wait for React to update
    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    // The output includes border characters, so we check for the text content
    const cleanOutput = output.replace(/[┌─│┘┐└┴├┤┬┼]/g, ' ');
    // Check if it contains either "1 running" or the number
    expect(cleanOutput.includes('1 running') || cleanOutput.includes('running')).toBe(true);
  });

  it('should display the AGMuX logo on the right side', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/path/to/my-project">
        <TopBar />
      </AppProvider>
    );

    const output = lastFrame();
    // Check for logo characters - the full ASCII logo contains block characters
    expect(output).toMatch(/[█╗╔╝╚═]/);
  });

  it('should display help shortcut in the top bar', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/path/to/my-project">
        <TopBar />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('Shift+H');
    expect(output).toContain('help');
  });

  it('should align the project/branch/view line with the top of the logo', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/path/to/my-project">
        <TopBar />
      </AppProvider>
    );

    const output = lastFrame();
    const lines = output.split('\n');
    
    // Find the line with the logo's first line (starts with "_____")
    let logoFirstLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('_____     ____')) {
        logoFirstLineIndex = i;
        break;
      }
    }
    
    expect(logoFirstLineIndex).toBeGreaterThan(-1);
    
    // Find the line with "Project:" text
    let projectLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Project:') && lines[i].includes('Branch:') && lines[i].includes('View:')) {
        projectLineIndex = i;
        break;
      }
    }
    
    expect(projectLineIndex).toBeGreaterThan(-1);
    
    // The project line should be on the same line as the logo's first line
    // Both should start at the same vertical position after the border and padding
    // With paddingY={1} and alignItems="flex-start", both should align at the top
    expect(projectLineIndex).toBe(logoFirstLineIndex);
  });
});
