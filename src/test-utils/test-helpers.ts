import { Run } from '../models/types.js';

/**
 * Creates a mock Run object for testing
 */
export function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: crypto.randomUUID(),
    status: 'queued',
    phase: 'worktree_creation',
    worktreePath: '/tmp/test-worktree',
    baseBranch: 'main',
    agentProfileId: 'profile-1',
    conversationId: null,
    skillId: null,
    prompt: 'Test prompt',
    progressPercent: 0,
    totalSubtasks: 0,
    completedSubtasks: 0,
    readyToAct: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    retainWorktree: false,
    ...overrides,
  };
}

/**
 * Helper to create a test database path
 */
export function getTestDbPath(name: string): string {
  return `${process.cwd()}/${name}.db`;
}
