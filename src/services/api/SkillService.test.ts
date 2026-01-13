import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillService } from './SkillService.js';
import * as skillsLoader from '../../utils/skillsLoader.js';

describe('SkillService', () => {
  let skillService: SkillService;
  let testProjectRoot: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testProjectRoot = join(tmpdir(), `skill-test-${Date.now()}`);
    mkdirSync(testProjectRoot, { recursive: true });
    skillService = new SkillService(testProjectRoot);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testProjectRoot)) {
      rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  describe('addOrUpdateSkill', () => {
    it('should add a new skill to local directory', async () => {
      const skill = await skillService.addOrUpdateSkill({
        id: 'test-skill',
        name: 'Test Skill',
        content: '# Test Skill\n\nThis is a test skill.',
        source: 'local',
      });

      expect(skill.id).toBe('test-skill');
      expect(skill.name).toBe('Test Skill');
      expect(skill.content).toBe('# Test Skill\n\nThis is a test skill.');
      expect(skill.source).toBe('local');
      expect(skill.path).toContain('test-skill/Readme.md');

      // Verify file was created
      const readmePath = join(testProjectRoot, 'claude', 'skills', 'test-skill', 'Readme.md');
      expect(existsSync(readmePath)).toBe(true);
      
      // Verify file content
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toBe('# Test Skill\n\nThis is a test skill.');
    });

    it('should update an existing skill', async () => {
      const initialContent = '# Initial Content';
      const updatedContent = '# Updated Content';

      // Add initial skill
      await skillService.addOrUpdateSkill({
        id: 'update-skill',
        name: 'Update Skill',
        content: initialContent,
      });

      // Update the skill
      const skill = await skillService.addOrUpdateSkill({
        id: 'update-skill',
        name: 'Update Skill',
        content: updatedContent,
      });

      expect(skill.content).toBe(updatedContent);
    });

    it('should default to local source', async () => {
      const skill = await skillService.addOrUpdateSkill({
        id: 'default-skill',
        name: 'Default Skill',
        content: 'Content',
      });

      expect(skill.source).toBe('local');
    });
  });

  describe('getSkill', () => {
    it('should get a skill by ID', async () => {
      // Create a skill first
      await skillService.addOrUpdateSkill({
        id: 'get-skill',
        name: 'Get Skill',
        content: 'Skill content',
      });

      // Mock loadSkills to return our skill
      const mockSkill = {
        id: 'get-skill',
        name: 'Get Skill',
        content: 'Skill content',
        path: join(testProjectRoot, 'claude', 'skills', 'get-skill', 'Readme.md'),
        source: 'local' as const,
      };

      vi.spyOn(skillsLoader, 'loadSkills').mockReturnValue([mockSkill]);

      const skill = await skillService.getSkill('get-skill');

      expect(skill).toEqual(mockSkill);
    });

    it('should return null if skill not found', async () => {
      vi.spyOn(skillsLoader, 'loadSkills').mockReturnValue([]);

      const skill = await skillService.getSkill('non-existent');

      expect(skill).toBeNull();
    });
  });

  describe('getAllSkills', () => {
    it('should get all skills', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Skill 1',
          content: 'Content 1',
          path: '/path/to/skill-1',
          source: 'local' as const,
        },
        {
          id: 'skill-2',
          name: 'Skill 2',
          content: 'Content 2',
          path: '/path/to/skill-2',
          source: 'global' as const,
        },
      ];

      vi.spyOn(skillsLoader, 'loadSkills').mockReturnValue(mockSkills);

      const skills = await skillService.getAllSkills();

      expect(skills).toEqual(mockSkills);
      expect(skillsLoader.loadSkills).toHaveBeenCalledWith(testProjectRoot);
    });
  });
});
