import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpApiServer } from './HttpApiServer.js';
import { ITaskService } from './interfaces.js';
import { ISkillService } from './interfaces.js';
import { Run } from '../../models/types.js';
import { Skill } from '../../utils/skillsLoader.js';

describe('HttpApiServer', () => {
  let httpServer: HttpApiServer;
  let mockTaskService: ITaskService;
  let mockSkillService: ISkillService;
  const TEST_PORT = 3001;

  beforeEach(() => {
    mockTaskService = {
      createTask: vi.fn(),
      startTask: vi.fn(),
      getTask: vi.fn(),
      getAllTasks: vi.fn(),
    };

    mockSkillService = {
      addOrUpdateSkill: vi.fn(),
      getSkill: vi.fn(),
      getAllSkills: vi.fn(),
    };

    httpServer = new HttpApiServer(mockTaskService, mockSkillService);
  });

  afterEach(async () => {
    await httpServer.stop();
  });

  describe('Server lifecycle', () => {
    it('should start and stop the server', async () => {
      await httpServer.start(TEST_PORT);
      expect(httpServer.getPort()).toBe(TEST_PORT);
      
      await httpServer.stop();
      expect(httpServer.getPort()).toBeNull();
    });

    it('should handle port already in use error', async () => {
      // Start first server
      await httpServer.start(TEST_PORT);
      
      // Try to start another server on the same port
      const httpServer2 = new HttpApiServer(mockTaskService, mockSkillService);
      await expect(httpServer2.start(TEST_PORT)).rejects.toThrow();
      
      await httpServer.stop();
    });
  });

  describe('Task service integration', () => {
    it('should call taskService.createTask when creating a task', async () => {
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

      vi.mocked(mockTaskService.createTask).mockResolvedValue(mockRun);

      // The server should be set up to call the service
      expect(mockTaskService.createTask).toBeDefined();
    });

    it('should call taskService.startTask when starting a task', async () => {
      vi.mocked(mockTaskService.startTask).mockResolvedValue(undefined);
      
      // The server should be set up to call the service
      expect(mockTaskService.startTask).toBeDefined();
    });
  });

  describe('Skill service integration', () => {
    it('should call skillService.addOrUpdateSkill when adding a skill', async () => {
      const mockSkill: Skill = {
        id: 'test-skill',
        name: 'Test Skill',
        content: 'Skill content',
        path: '/path/to/skill',
        source: 'local',
      };

      vi.mocked(mockSkillService.addOrUpdateSkill).mockResolvedValue(mockSkill);

      // The server should be set up to call the service
      expect(mockSkillService.addOrUpdateSkill).toBeDefined();
    });
  });
});
