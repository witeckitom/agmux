import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from './database.js';
import { Run } from '../models/types.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  const testDbPath = join(process.cwd(), 'test.db');

  beforeEach(() => {
    // Clean up any existing test database
    try {
      unlinkSync(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createRun', () => {
    it('should create a new run with all required fields', () => {
      const runData: Omit<Run, 'id' | 'createdAt' | 'updatedAt'> = {
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
        completedAt: null,
        retainWorktree: false,
      };

      const created = db.createRun(runData);

      expect(created.id).toBeDefined();
      expect(created.status).toBe('queued');
      expect(created.worktreePath).toBe('/tmp/test-worktree');
      expect(created.prompt).toBe('Test prompt');
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for each run', () => {
      const runData: Omit<Run, 'id' | 'createdAt' | 'updatedAt'> = {
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '/tmp/test-worktree-1',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: null,
        skillId: null,
        prompt: 'Test prompt',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      };

      const run1 = db.createRun(runData);
      const run2 = db.createRun({ ...runData, worktreePath: '/tmp/test-worktree-2' });

      expect(run1.id).not.toBe(run2.id);
    });
  });

  describe('getRun', () => {
    it('should retrieve a run by ID', () => {
      const runData: Omit<Run, 'id' | 'createdAt' | 'updatedAt'> = {
        status: 'running',
        phase: 'agent_execution',
        worktreePath: '/tmp/test-worktree',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: 'conv-123',
        skillId: 'skill-1',
        prompt: 'Test prompt',
        progressPercent: 50,
        totalSubtasks: 10,
        completedSubtasks: 5,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      };

      const created = db.createRun(runData);
      const retrieved = db.getRun(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.status).toBe('running');
      expect(retrieved!.progressPercent).toBe(50);
      expect(retrieved!.conversationId).toBe('conv-123');
    });

    it('should return null for non-existent run', () => {
      const result = db.getRun('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getAllRuns', () => {
    it('should return all runs ordered by creation date', async () => {
      const run1 = db.createRun({
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '/tmp/test-1',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: null,
        skillId: null,
        prompt: 'First',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const run2 = db.createRun({
        status: 'running',
        phase: 'agent_execution',
        worktreePath: '/tmp/test-2',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: null,
        skillId: null,
        prompt: 'Second',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      });

      const allRuns = db.getAllRuns();

      expect(allRuns.length).toBe(2);
      // Should be ordered by created_at DESC, so run2 should be first
      expect(allRuns[0].id).toBe(run2.id);
      expect(allRuns[1].id).toBe(run1.id);
    });
  });

  describe('updateRun', () => {
    it('should update run fields', () => {
      const run = db.createRun({
        status: 'queued',
        phase: 'worktree_creation',
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

      const updated = db.updateRun(run.id, {
        status: 'running',
        progressPercent: 75,
        phase: 'agent_execution',
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('running');
      expect(updated!.progressPercent).toBe(75);
      expect(updated!.phase).toBe('agent_execution');
      expect(updated!.id).toBe(run.id);
    });

    it('should update updatedAt timestamp', async () => {
      const run = db.createRun({
        status: 'queued',
        phase: 'worktree_creation',
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

      const originalUpdatedAt = run.updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = db.updateRun(run.id, { status: 'running' });

      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('getRunsByStatus', () => {
    it('should filter runs by status', () => {
      db.createRun({
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '/tmp/test-1',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: null,
        skillId: null,
        prompt: 'Queued run',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      });

      db.createRun({
        status: 'running',
        phase: 'agent_execution',
        worktreePath: '/tmp/test-2',
        baseBranch: 'main',
        agentProfileId: 'profile-1',
        conversationId: null,
        skillId: null,
        prompt: 'Running run',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        retainWorktree: false,
      });

      const queuedRuns = db.getRunsByStatus('queued');
      const runningRuns = db.getRunsByStatus('running');

      expect(queuedRuns.length).toBe(1);
      expect(queuedRuns[0].status).toBe('queued');
      expect(runningRuns.length).toBe(1);
      expect(runningRuns[0].status).toBe('running');
    });
  });

  describe('preferences', () => {
    it('should store and retrieve preferences', () => {
      db.setPreference('theme', 'matrix');
      db.setPreference('default_branch', 'main');

      expect(db.getPreference('theme')).toBe('matrix');
      expect(db.getPreference('default_branch')).toBe('main');
      expect(db.getPreference('non_existent')).toBeNull();
    });

    it('should update existing preferences', () => {
      db.setPreference('theme', 'matrix');
      db.setPreference('theme', 'dark');

      expect(db.getPreference('theme')).toBe('dark');
    });
  });
});
