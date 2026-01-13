import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ISkillService, AddOrUpdateSkillParams } from './interfaces.js';
import { Skill, loadSkills } from '../../utils/skillsLoader.js';
import { logger } from '../../utils/logger.js';

/**
 * Service for managing skills
 */
export class SkillService implements ISkillService {
  constructor(private projectRoot?: string) {}

  async addOrUpdateSkill(params: AddOrUpdateSkillParams): Promise<Skill> {
    const source = params.source || 'local';
    const skillsDir = source === 'local' 
      ? join(this.projectRoot || process.cwd(), 'claude', 'skills', params.id)
      : join(homedir(), '.claude', 'skills', params.id);

    // Ensure directory exists
    mkdirSync(skillsDir, { recursive: true });

    // Write Readme.md file
    const readmePath = join(skillsDir, 'Readme.md');
    writeFileSync(readmePath, params.content, 'utf-8');

    logger.info(`Added/updated skill ${params.id} at ${readmePath}`, 'SkillService');

    // Return the skill object
    return {
      id: params.id,
      name: params.name,
      content: params.content,
      path: readmePath,
      source,
    };
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    const skills = loadSkills(this.projectRoot);
    return skills.find(s => s.id === skillId) || null;
  }

  async getAllSkills(): Promise<Skill[]> {
    return loadSkills(this.projectRoot);
  }
}
