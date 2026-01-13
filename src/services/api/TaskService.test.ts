import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from './TaskService.js';
import { DatabaseManager } from '../../db/database.js';
import { TaskExecutor } from '../TaskExecutor.js';
import { Run } from '../../models/types.js';

describe('TaskService', () => {
  let taskService: TaskService;
  let mockDatabase: DatabaseManager;
  let mockTaskExecutor: TaskExecutor;

  beforeEach(() => {
    mockDatabase = {
      createRun: vi.fn(),
      getRun: vi.fn(),
      getAllRuns: vi.fn(),
    } as any;

    mockTaskExecutor = {
      startTask: vi.fn(),
    } as any;

    taskService = new TaskService(mockDatabase, mockTaskExecutor);
  });

  describe('createTask', () => {
    it('should create a task with required parameters', async () => {
      const mockRun: Run = {
        id: 'test-id',
        name: null,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'main',
        agentProfileId: 'claude',
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
        durationMs: null,
        retainWorktree: false,
      };

      vi.mocked(mockDatabase.createRun).mockReturnValue(mockRun);

      const result = await taskService.createTask({
        prompt: 'Test prompt',
      });

      expect(result).toEqual(mockRun);
      expect(mockDatabase.createRun).toHaveBeenCalledWith({
        name: null,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'main',
        agentProfileId: 'claude',
        conversationId: null,
        skillId: null,
        prompt: 'Test prompt',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        durationMs: null,
        retainWorktree: false,
      });
    });

    it('should create a task with all optional parameters', async () => {
      const mockRun: Run = {
        id: 'test-id',
        name: 'Test Task',
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'develop',
        agentProfileId: 'cursor',
        conversationId: null,
        skillId: 'test-skill',
        prompt: 'Test prompt',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        durationMs: null,
        retainWorktree: false,
      };

      vi.mocked(mockDatabase.createRun).mockReturnValue(mockRun);

      const result = await taskService.createTask({
        name: 'Test Task',
        prompt: 'Test prompt',
        baseBranch: 'develop',
        agentProfileId: 'cursor',
        skillId: 'test-skill',
      });

      expect(result).toEqual(mockRun);
      expect(mockDatabase.createRun).toHaveBeenCalledWith({
        name: 'Test Task',
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'develop',
        agentProfileId: 'cursor',
        conversationId: null,
        skillId: 'test-skill',
        prompt: 'Test prompt',
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        durationMs: null,
        retainWorktree: false,
      });
    });
  });

  describe('startTask', () => {
    it('should start a task successfully', async () => {
      const runId = 'test-run-id';
      const mockRun: Run = {
        id: runId,
        name: null,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'main',
        agentProfileId: 'claude',
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
        durationMs: null,
        retainWorktree: false,
      };

      vi.mocked(mockDatabase.getRun).mockReturnValue(mockRun);
      vi.mocked(mockTaskExecutor.startTask).mockResolvedValue(undefined);

      await taskService.startTask(runId);

      expect(mockDatabase.getRun).toHaveBeenCalledWith(runId);
      expect(mockTaskExecutor.startTask).toHaveBeenCalledWith(runId, undefined);
    });

    it('should throw error if task not found', async () => {
      const runId = 'non-existent-id';
      vi.mocked(mockDatabase.getRun).mockReturnValue(null);

      await expect(taskService.startTask(runId)).rejects.toThrow(
        `Task ${runId} not found`
      );
    });

    it('should start a task with agent type', async () => {
      const runId = 'test-run-id';
      const mockRun: Run = {
        id: runId,
        name: null,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'main',
        agentProfileId: 'claude',
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
        durationMs: null,
        retainWorktree: false,
      };

      vi.mocked(mockDatabase.getRun).mockReturnValue(mockRun);
      vi.mocked(mockTaskExecutor.startTask).mockResolvedValue(undefined);

      await taskService.startTask(runId, 'cursor');

      expect(mockTaskExecutor.startTask).toHaveBeenCalledWith(runId, 'cursor');
    });
  });

  describe('getTask', () => {
    it('should get a task by ID', async () => {
      const runId = 'test-run-id';
      const mockRun: Run = {
        id: runId,
        name: null,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '',
        baseBranch: 'main',
        agentProfileId: 'claude',
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
        durationMs: null,
        retainWorktree: false,
      };

      vi.mocked(mockDatabase.getRun).mockReturnValue(mockRun);

      const result = await taskService.getTask(runId);

      expect(result).toEqual(mockRun);
      expect(mockDatabase.getRun).toHaveBeenCalledWith(runId);
    });

    it('should return null if task not found', async () => {
      const runId = 'non-existent-id';
      vi.mocked(mockDatabase.getRun).mockReturnValue(null);

      const result = await taskService.getTask(runId);

      expect(result).toBeNull();
    });
  });

  describe('getAllTasks', () => {
    it('should get all tasks', async () => {
      const mockRuns: Run[] = [
        {
          id: 'run-1',
          name: null,
          status: 'queued',
          phase: 'worktree_creation',
          worktreePath: '',
          baseBranch: 'main',
          agentProfileId: 'claude',
          conversationId: null,
          skillId: null,
          prompt: 'Test prompt 1',
          progressPercent: 0,
          totalSubtasks: 0,
          completedSubtasks: 0,
          readyToAct: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
          durationMs: null,
          retainWorktree: false,
        },
        {
          id: 'run-2',
          name: null,
          status: 'running',
          phase: 'agent_execution',
          worktreePath: '/tmp/worktree',
          baseBranch: 'main',
          agentProfileId: 'cursor',
          conversationId: null,
          skillId: null,
          prompt: 'Test prompt 2',
          progressPercent: 50,
          totalSubtasks: 10,
          completedSubtasks: 5,
          readyToAct: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
          durationMs: null,
          retainWorktree: false,
        },
      ];

      vi.mocked(mockDatabase.getAllRuns).mockReturnValue(mockRuns);

      const result = await taskService.getAllTasks();

      expect(result).toEqual(mockRuns);
      expect(mockDatabase.getAllRuns).toHaveBeenCalled();
    });
  });
});
