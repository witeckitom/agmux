import { execSync } from 'child_process';
import { logger } from './logger.js';

export interface WorktreeInfo {
  path: string;
  branch: string;
}

/**
 * Create a git worktree for a task
 */
export function createWorktree(baseBranch: string, branchPrefix: string, runId: string): WorktreeInfo {
  const branchName = `${branchPrefix}-${runId.slice(0, 8)}`;
  const worktreePath = `.worktrees/${branchName}`;

  try {
    // Create worktree directory if it doesn't exist
    execSync(`mkdir -p .worktrees`, { stdio: 'inherit' });

    // Create the worktree
    execSync(`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    logger.info(`Created worktree: ${worktreePath} on branch ${branchName}`, 'GitWorktree');

    return {
      path: worktreePath,
      branch: branchName,
    };
  } catch (error: any) {
    logger.error('Failed to create worktree', 'GitWorktree', { error });
    throw new Error(`Failed to create worktree: ${error.message}`);
  }
}

/**
 * Remove a git worktree
 */
export function removeWorktree(worktreePath: string): void {
  try {
    execSync(`git worktree remove ${worktreePath}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    logger.info(`Removed worktree: ${worktreePath}`, 'GitWorktree');
  } catch (error: any) {
    logger.error('Failed to remove worktree', 'GitWorktree', { error });
    // Don't throw - worktree might already be removed
  }
}
