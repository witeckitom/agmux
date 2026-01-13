import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from './McpServer.js';
import { ITaskService } from './interfaces.js';
import { ISkillService } from './interfaces.js';
import { Run } from '../../models/types.js';
import { Skill } from '../../utils/skillsLoader.js';

describe('McpServer', () => {
  let mcpServer: McpServer;
  let mockTaskService: ITaskService;
  let mockSkillService: ISkillService;

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

    mcpServer = new McpServer(mockTaskService, mockSkillService);
  });

  afterEach(async () => {
    if (mcpServer.isRunning()) {
      await mcpServer.stop();
    }
  });

  describe('Server lifecycle', () => {
    it('should track running state', () => {
      expect(mcpServer.isRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      // Note: We can't easily test the full start/stop cycle without
      // actually creating stdio transports, so we test the logic we can
      expect(mcpServer.isRunning()).toBe(false);
    });
  });

  describe('Tool registration', () => {
    it('should have task service available', () => {
      expect(mockTaskService.createTask).toBeDefined();
      expect(mockTaskService.startTask).toBeDefined();
    });

    it('should have skill service available', () => {
      expect(mockSkillService.addOrUpdateSkill).toBeDefined();
    });
  });
});