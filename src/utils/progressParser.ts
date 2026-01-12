import { DatabaseManager } from '../db/database.js';
import { logger } from './logger.js';

interface TaskProgress {
  totalTasks?: number;
  completedTasks?: number;
  tasks?: Array<{
    id: number;
    description: string;
    status: 'completed' | 'in_progress' | 'pending';
  }>;
}

/**
 * Parse progress JSON from agent response and update the run
 * Looks for JSON objects in the format:
 * {
 *   "totalTasks": <number>,
 *   "completedTasks": <number>,
 *   "tasks": [...]
 * }
 * 
 * Also supports code blocks with JSON:
 * ```json
 * { ... }
 * ```
 */
export function parseAndUpdateProgress(
  database: DatabaseManager,
  runId: string,
  content: string
): void {
  try {
    // First, try to extract JSON from code blocks
    const codeBlockPattern = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    let codeBlockMatch;
    const codeBlockJsons: string[] = [];
    while ((codeBlockMatch = codeBlockPattern.exec(content)) !== null) {
      codeBlockJsons.push(codeBlockMatch[1]);
    }

    // Also look for standalone JSON objects
    const jsonPattern = /\{[\s\S]*?"(?:totalTasks|completedTasks|tasks)"[\s\S]*?\}/g;
    const standaloneMatches = content.match(jsonPattern) || [];
    
    // Combine all potential JSON strings
    const allMatches = [...codeBlockJsons, ...standaloneMatches];
    
    if (allMatches.length === 0) {
      return;
    }

    // Try to parse each match, use the most recent/complete one
    let bestMatch: TaskProgress | null = null;
    let bestTotalTasks = 0;
    let bestCompletedTasks = 0;

    for (const match of allMatches) {
      try {
        const parsed = JSON.parse(match) as TaskProgress;
        
        // Validate it has the expected structure
        if (parsed.totalTasks !== undefined || parsed.completedTasks !== undefined || parsed.tasks) {
          const totalTasks = parsed.totalTasks ?? parsed.tasks?.length ?? 0;
          const completedTasks = parsed.completedTasks ?? 
            parsed.tasks?.filter(t => t.status === 'completed').length ?? 0;
          
          // Use the match with the most tasks or highest completion
          if (totalTasks > bestTotalTasks || 
              (totalTasks === bestTotalTasks && completedTasks > bestCompletedTasks)) {
            bestMatch = parsed;
            bestTotalTasks = totalTasks;
            bestCompletedTasks = completedTasks;
          }
        }
      } catch (parseError) {
        // Not valid JSON or not our format, continue
        continue;
      }
    }

    // Update with the best match found
    if (bestMatch && bestTotalTasks > 0) {
      const progressPercent = Math.min(100, Math.round((bestCompletedTasks / bestTotalTasks) * 100));
      
      // Update the run with progress
      database.updateRun(runId, {
        totalSubtasks: bestTotalTasks,
        completedSubtasks: bestCompletedTasks,
        progressPercent: progressPercent,
      });
      
      logger.debug('Updated progress from agent response', 'ProgressParser', {
        runId,
        totalTasks: bestTotalTasks,
        completedTasks: bestCompletedTasks,
        progressPercent,
      });
    }
  } catch (error) {
    // Silently fail - don't interrupt agent execution
    logger.debug('Error parsing progress JSON', 'ProgressParser', { error });
  }
}
