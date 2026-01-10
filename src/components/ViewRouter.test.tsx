import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '../test-utils/render.js';
import { ViewRouter } from './ViewRouter.js';
import { AppProvider, useApp } from '../context/AppContext.js';
import { DatabaseManager } from '../db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

function createTestContext() {
  const testDbPath = join(process.cwd(), 'test-router.db');
  try {
    unlinkSync(testDbPath);
  } catch {}
  const db = new DatabaseManager(testDbPath);
  return { db, testDbPath };
}

function TestWrapper({ view }: { view: string }) {
  const { setCurrentView } = useApp();
  React.useEffect(() => {
    setCurrentView(view as any);
  }, [view, setCurrentView]);
  return <ViewRouter />;
}

function TestWrapperWithDelay({ view }: { view: string }) {
  const { setCurrentView } = useApp();
  React.useEffect(() => {
    setTimeout(() => {
      setCurrentView(view as any);
    }, 10);
  }, [view, setCurrentView]);
  return <ViewRouter />;
}

describe('ViewRouter', () => {
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    const context = createTestContext();
    db = context.db;
    testDbPath = context.testDbPath;
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(testDbPath);
    } catch {}
  });

  it('should render TasksView by default', () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <ViewRouter />
      </AppProvider>
    );

    const output = lastFrame();
    expect(output).toContain('No runs yet');
  });

  it('should render SkillsView when view is skills', async () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapperWithDelay view="skills" />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).toContain('Skills View');
  });

  it('should render CommandsView when view is commands', async () => {
    const { lastFrame } = render(
      <AppProvider database={db} projectRoot="/test/project">
        <TestWrapperWithDelay view="commands" />
      </AppProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    expect(output).toContain('Commands View');
  });
});
