import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
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
  
  // Get absolute path to ensure we're working in the right directory
  const absoluteWorktreePath = resolve(process.cwd(), worktreePath);

  try {
    // Create worktree directory if it doesn't exist
    execSync(`mkdir -p .worktrees`, { stdio: 'inherit', cwd: process.cwd() });

    // Create the worktree (this creates a new branch and checks it out in the worktree)
    // Note: git worktree add creates the directory and checks out the branch there
    // Use --force to overwrite if it already exists (shouldn't happen, but be safe)
    try {
      execSync(`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`, {
        stdio: 'pipe', // Don't inherit to avoid cluttering output
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
    } catch (error: any) {
      // If worktree already exists, try to remove it first, then recreate
      if (error.message.includes('already exists') || error.message.includes('already checked out')) {
        logger.warn(`Worktree ${worktreePath} already exists, removing and recreating`, 'GitWorktree');
        try {
          execSync(`git worktree remove --force ${worktreePath}`, {
            stdio: 'pipe',
            cwd: process.cwd(),
          });
        } catch (removeError: any) {
          // Ignore errors removing non-existent worktree
        }
        // Try again
        execSync(`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`, {
          stdio: 'pipe',
          cwd: process.cwd(),
          encoding: 'utf-8',
        });
      } else {
        throw error;
      }
    }
    
    // Verify the worktree directory was actually created
    if (!existsSync(absoluteWorktreePath)) {
      throw new Error(`Worktree directory was not created at ${absoluteWorktreePath}`);
    }

    // Verify the worktree was created and is on the correct branch
    const worktreeBranch = execSync(
      `git rev-parse --abbrev-ref HEAD`,
      { cwd: absoluteWorktreePath, encoding: 'utf-8' }
    ).trim();
    
    // Verify git top-level - in worktrees, this should return the worktree path
    const gitTopLevel = execSync(
      `git rev-parse --show-toplevel`,
      { cwd: absoluteWorktreePath, encoding: 'utf-8' }
    ).trim();
    
    // Also check git-dir to verify we're in a worktree
    const gitDir = execSync(
      `git rev-parse --git-dir`,
      { cwd: absoluteWorktreePath, encoding: 'utf-8' }
    ).trim();
    
    if (worktreeBranch !== branchName) {
      logger.warn(`Worktree branch mismatch: expected ${branchName}, got ${worktreeBranch}`, 'GitWorktree');
    }
    
    // Log git context for debugging
    logger.info(`Worktree git context`, 'GitWorktree', {
      gitTopLevel,
      gitDir,
      worktreePath: absoluteWorktreePath,
      branchName,
      worktreeBranch,
      isWorktree: gitDir.includes('worktrees'),
    });
    
    // Note: git rev-parse --show-toplevel in a worktree should return the worktree path
    // If it returns the main repo path, that's a problem and cursor will work on main
    if (gitTopLevel !== absoluteWorktreePath) {
      logger.warn(`Git top-level (${gitTopLevel}) differs from worktree path (${absoluteWorktreePath}). This may cause cursor to work on main branch.`, 'GitWorktree', {
        gitTopLevel,
        expectedWorktree: absoluteWorktreePath,
        branchName,
        worktreeBranch,
        gitDir,
      });
      // Don't throw - just warn, as this might be expected behavior in some git setups
    }

    logger.info(`Created worktree: ${absoluteWorktreePath} on branch ${branchName}`, 'GitWorktree', {
      branchName,
      baseBranch,
      worktreePath: absoluteWorktreePath,
      verifiedBranch: worktreeBranch,
    });

    return {
      path: absoluteWorktreePath, // Return absolute path
      branch: branchName,
    };
  } catch (error: any) {
    logger.error('Failed to create worktree', 'GitWorktree', { error, baseBranch, branchName, worktreePath });
    throw new Error(`Failed to create worktree: ${error.message}`);
  }
}

/**
 * Remove a git worktree
 */
export function removeWorktree(worktreePath: string): void {
  try {
    logger.info(`Attempting to remove worktree: ${worktreePath}`, 'GitWorktree');
    
    // Git worktree remove expects the path relative to repo root (same format as when created)
    // Don't convert to absolute - git handles relative paths correctly
    // Use --force to remove even if there are uncommitted changes or if locked
    execSync(`git worktree remove --force "${worktreePath}"`, {
      stdio: 'pipe', // Suppress output for cleaner deletion
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    logger.info(`Successfully removed worktree: ${worktreePath}`, 'GitWorktree');
  } catch (error: any) {
    // Don't throw - worktree might already be removed or not exist
    logger.error('Failed to remove worktree', 'GitWorktree', { 
      worktreePath,
      error: error.message || String(error),
      code: (error as any).code,
      stderr: (error as any).stderr?.toString(),
      stdout: (error as any).stdout?.toString(),
    });
    throw error; // Re-throw so caller knows it failed
  }
}
