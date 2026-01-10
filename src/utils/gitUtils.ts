import { execSync } from 'child_process';
import { logger } from './logger.js';

export interface ChangedFile {
  path: string;
  status: 'A' | 'M' | 'D' | 'R'; // Added, Modified, Deleted, Renamed
}

/**
 * Get list of changed files in a worktree
 */
export function getChangedFiles(worktreePath: string): ChangedFile[] {
  try {
    const output = execSync(
      'git status --porcelain',
      { cwd: worktreePath, encoding: 'utf-8' }
    );

    const files: ChangedFile[] = [];
    const lines = output.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const status = line.substring(0, 2);
      const path = line.substring(3);

      // Parse git status format: XY path
      // X = index status, Y = working tree status
      let fileStatus: ChangedFile['status'] = 'M';
      if (status.includes('A')) {
        fileStatus = 'A';
      } else if (status.includes('D')) {
        fileStatus = 'D';
      } else if (status.includes('R')) {
        fileStatus = 'R';
      } else if (status.includes('M')) {
        fileStatus = 'M';
      }

      files.push({
        path,
        status: fileStatus,
      });
    }

    return files;
  } catch (error: any) {
    logger.error('Failed to get changed files', 'GitUtils', { error, worktreePath });
    return [];
  }
}

/**
 * Get diff for a specific file
 */
export function getFileDiff(worktreePath: string, filePath: string): string {
  try {
    const diff = execSync(
      `git diff ${filePath}`,
      { cwd: worktreePath, encoding: 'utf-8' }
    );
    return diff;
  } catch (error: any) {
    logger.error('Failed to get file diff', 'GitUtils', { error, worktreePath, filePath });
    return `Error getting diff: ${error.message}`;
  }
}

/**
 * Get the current branch name for a worktree
 */
export function getCurrentBranch(worktreePath: string): string | null {
  try {
    const branch = execSync(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: worktreePath, encoding: 'utf-8' }
    ).trim();
    return branch;
  } catch (error: any) {
    logger.error('Failed to get current branch', 'GitUtils', { error, worktreePath });
    return null;
  }
}

/**
 * Merge current branch into target branch
 */
export function mergeToBranch(worktreePath: string, targetBranch: string): { success: boolean; error?: string } {
  try {
    // Get current branch
    const currentBranch = getCurrentBranch(worktreePath);
    if (!currentBranch) {
      return { success: false, error: 'Could not determine current branch' };
    }

    // Switch to target branch
    execSync(`git checkout ${targetBranch}`, { cwd: worktreePath, stdio: 'inherit' });

    // Merge current branch
    execSync(`git merge ${currentBranch} --no-edit`, { cwd: worktreePath, stdio: 'inherit' });

    logger.info(`Merged ${currentBranch} into ${targetBranch}`, 'GitUtils');
    return { success: true };
  } catch (error: any) {
    logger.error('Failed to merge branch', 'GitUtils', { error, worktreePath, targetBranch });
    return { success: false, error: error.message };
  }
}

/**
 * Get PR URL for the current branch (GitHub/GitLab/etc)
 */
export function getPRUrl(worktreePath: string, baseBranch: string = 'main'): string | null {
  try {
    // Try to get remote URL
    const remoteUrl = execSync(
      'git config --get remote.origin.url',
      { cwd: worktreePath, encoding: 'utf-8' }
    ).trim();

    const currentBranch = getCurrentBranch(worktreePath);
    if (!currentBranch) {
      return null;
    }

    // Parse remote URL and construct PR URL
    // Handle both SSH and HTTPS formats
    let repoUrl = remoteUrl;
    if (remoteUrl.startsWith('git@')) {
      // git@github.com:user/repo.git -> https://github.com/user/repo
      repoUrl = remoteUrl
        .replace('git@', 'https://')
        .replace(':', '/')
        .replace(/\.git$/, '');
    } else if (remoteUrl.startsWith('https://')) {
      repoUrl = remoteUrl.replace(/\.git$/, '');
    }

    // Construct PR URL (GitHub format)
    const prUrl = `${repoUrl}/compare/${baseBranch}...${currentBranch}`;
    return prUrl;
  } catch (error: any) {
    logger.error('Failed to get PR URL', 'GitUtils', { error, worktreePath });
    return null;
  }
}
