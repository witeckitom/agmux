import { Run } from '../models/types.js';
import { DatabaseManager } from '../db/database.js';
import { loadSkills, getSkillById } from './skillsLoader.js';
import { logger } from './logger.js';

/**
 * Inject skill persona into prompt if this is the first run
 * Returns the prompt with skill persona injected, or original prompt if:
 * - No skillId on the run
 * - Already has messages (continuing conversation)
 * - Skill not found
 */
export function injectSkillPersona(
  database: DatabaseManager,
  run: Run,
  projectRoot?: string
): string {
  // If no skillId, return original prompt
  if (!run.skillId) {
    return run.prompt || '';
  }

  // Check if this is the first run (no existing messages)
  const existingMessages = database.getMessagesByRunId(run.id);
  if (existingMessages.length > 0) {
    // Already has messages, don't inject skill (continuing conversation)
    logger.debug('Task has existing messages, skipping skill injection', 'SkillInjector', {
      runId: run.id,
      skillId: run.skillId,
    });
    return run.prompt || '';
  }

  // Load skills and find the one for this task
  try {
    const skills = loadSkills(projectRoot);
    const skill = getSkillById(skills, run.skillId);
    
    if (!skill) {
      logger.warn('Skill not found, using original prompt', 'SkillInjector', {
        runId: run.id,
        skillId: run.skillId,
      });
      return run.prompt || '';
    }

    // Inject skill persona at the beginning of the prompt
    // The skill persona should come first, then the system instructions and user prompt
    const skillPersona = `You are operating as: ${skill.name}

${skill.content}

---`;
    
    const originalPrompt = run.prompt || '';
    const injectedPrompt = `${skillPersona}\n\n${originalPrompt}`;

    logger.info('Injected skill persona into prompt', 'SkillInjector', {
      runId: run.id,
      skillId: run.skillId,
      skillName: skill.name,
    });

    return injectedPrompt;
  } catch (error) {
    logger.error('Failed to inject skill persona', 'SkillInjector', {
      error,
      runId: run.id,
      skillId: run.skillId,
    });
    // Return original prompt on error
    return run.prompt || '';
  }
}
