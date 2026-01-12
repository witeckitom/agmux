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

    // Also look for standalone JSON objects - be more flexible with whitespace
    // Try multiple patterns to catch different formats
    const jsonPatterns = [
      /\{[\s\S]*?"(?:totalTasks|completedTasks|tasks)"[\s\S]*?\}/g,
      /\{[\s\S]*?"totalTasks"[\s\S]*?\}/g,
      /\{[\s\S]*?"completedTasks"[\s\S]*?\}/g,
      /\{[\s\S]*?"tasks"[\s\S]*?\}/g,
    ];
    
    const standaloneMatches: string[] = [];
    for (const pattern of jsonPatterns) {
      const matches = content.match(pattern) || [];
      standaloneMatches.push(...matches);
    }
    
    // Combine all potential JSON strings
    const allMatches = [...codeBlockJsons, ...standaloneMatches];
    
    if (allMatches.length === 0) {
      // Log when no progress JSON found (but only occasionally to avoid spam)
      if (Math.random() < 0.05) { // 5% of the time
        logger.debug('No progress JSON found in content', 'ProgressParser', {
          runId,
          contentLength: content.length,
          contentPreview: content.substring(Math.max(0, content.length - 500)),
        });
      }
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
      
      // Get current run to check if update is needed
      const currentRun = database.getRun(runId);
      const needsUpdate = !currentRun || 
        currentRun.progressPercent !== progressPercent ||
        currentRun.totalSubtasks !== bestTotalTasks ||
        currentRun.completedSubtasks !== bestCompletedTasks;
      
      if (needsUpdate) {
        // Update the run with progress
        database.updateRun(runId, {
          totalSubtasks: bestTotalTasks,
          completedSubtasks: bestCompletedTasks,
          progressPercent: progressPercent,
        });
        
        logger.info('Updated progress from agent response', 'ProgressParser', {
          runId,
          totalTasks: bestTotalTasks,
          completedTasks: bestCompletedTasks,
          progressPercent,
          previousProgress: currentRun?.progressPercent,
        });
      }
    } else if (allMatches.length > 0) {
      // Found JSON but couldn't parse it properly
      logger.debug('Found progress JSON but could not parse', 'ProgressParser', {
        runId,
        matchCount: allMatches.length,
        firstMatchPreview: allMatches[0]?.substring(0, 200),
      });
    }
  } catch (error) {
    // Log error but don't interrupt agent execution
    logger.debug('Error parsing progress JSON', 'ProgressParser', { 
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
