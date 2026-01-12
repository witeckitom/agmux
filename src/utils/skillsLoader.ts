import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { logger } from './logger.js';

export interface Skill {
  id: string;
  name: string;
  content: string;
  path: string;
  source: 'global' | 'local';
}

/**
 * Load skills from both ~/.claude/skills and ./claude/skills directories
 * Returns a combined list with duplicates removed (local takes precedence)
 */
export function loadSkills(projectRoot?: string): Skill[] {
  const skills: Map<string, Skill> = new Map();
  
  // Load from global directory: ~/.claude/skills
  const globalSkillsDir = join(homedir(), '.claude', 'skills');
  if (existsSync(globalSkillsDir)) {
    try {
      const globalSkills = loadSkillsFromDirectory(globalSkillsDir, 'global');
      for (const skill of globalSkills) {
        if (!skills.has(skill.id)) {
          skills.set(skill.id, skill);
        }
      }
      logger.debug(`Loaded ${globalSkills.length} skills from global directory`, 'SkillsLoader');
    } catch (error) {
      logger.warn('Failed to load global skills', 'SkillsLoader', { error });
    }
  }

  // Load from local directory: ./claude/skills
  const localSkillsDir = projectRoot 
    ? resolve(projectRoot, 'claude', 'skills')
    : resolve(process.cwd(), 'claude', 'skills');
  
  if (existsSync(localSkillsDir)) {
    try {
      const localSkills = loadSkillsFromDirectory(localSkillsDir, 'local');
      // Local skills override global ones with the same ID
      for (const skill of localSkills) {
        skills.set(skill.id, skill);
      }
      logger.debug(`Loaded ${localSkills.length} skills from local directory`, 'SkillsLoader');
    } catch (error) {
      logger.warn('Failed to load local skills', 'SkillsLoader', { error });
    }
  }

  const skillsList = Array.from(skills.values());
  logger.info(`Loaded ${skillsList.length} total skills`, 'SkillsLoader');
  return skillsList;
}

/**
 * Load skills from a specific directory
 * Each skill is in a subdirectory with a Readme.md file
 */
function loadSkillsFromDirectory(directory: string, source: 'global' | 'local'): Skill[] {
  const skills: Skill[] = [];
  
  if (!existsSync(directory)) {
    return skills;
  }

  try {
    const entries = readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      // Only process directories
      if (!entry.isDirectory()) {
        continue;
      }

      // Skip hidden directories
      if (entry.name.startsWith('.')) {
        continue;
      }

      const skillDir = join(directory, entry.name);
      const readmePath = join(skillDir, 'Readme.md');
      
      // Check if Readme.md exists
      if (!existsSync(readmePath)) {
        logger.debug(`No Readme.md found in skill directory: ${skillDir}`, 'SkillsLoader');
        continue;
      }

      try {
        const content = readFileSync(readmePath, 'utf-8');
        const skillId = entry.name;
        const skillName = skillId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        skills.push({
          id: skillId,
          name: skillName,
          content: content.trim(),
          path: readmePath,
          source,
        });
      } catch (error) {
        logger.warn(`Failed to load skill Readme.md: ${readmePath}`, 'SkillsLoader', { error });
      }
    }
  } catch (error) {
    logger.error(`Failed to read skills directory: ${directory}`, 'SkillsLoader', { error });
  }

  return skills;
}

/**
 * Get a skill by ID
 */
export function getSkillById(skills: Skill[], skillId: string): Skill | undefined {
  return skills.find(skill => skill.id === skillId);
}
