import { execSync, spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { logger } from './logger.js';

export interface ChangedFile {
  path: string;
  status: 'A' | 'M' | 'D' | 'R'; // Added, Modified, Deleted, Renamed
}

/**
 * Get list of changed files in a worktree
 */
export function getChangedFiles(worktreePath: string, runId?: string): ChangedFile[] {
  // If worktreePath is empty or a temp path, try to find the actual worktree
  if (!worktreePath || worktreePath.startsWith('/tmp/')) {
    // Worktree hasn't been created yet or path is invalid - try to find it by run ID
    if (runId) {
      const projectRoot = process.cwd();
      const worktreesDir = join(projectRoot, '.worktrees');
      
      if (existsSync(worktreesDir)) {
        try {
          const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => join(worktreesDir, dirent.name));
          
          const runIdPrefix = runId.slice(0, 8);
          for (const dir of worktreeDirs) {
            const dirName = dir.split('/').pop() || '';
            if (dirName.includes(runIdPrefix)) {
              logger.info(`Found worktree by run ID: ${dir}`, 'GitUtils', { runId, runIdPrefix, dirName });
              worktreePath = dir; // Use the found worktree path
              break;
            }
          }
        } catch (error: any) {
          logger.warn(`Could not search for worktree by run ID: ${error.message}`, 'GitUtils');
        }
      }
    }
    
    // If still no valid path, return empty
    if (!worktreePath || worktreePath.startsWith('/tmp/')) {
      return [];
    }
  }
  
  // The worktreePath should already be absolute (stored as absolute in DB)
  // But handle both cases: if it starts with / it's absolute, otherwise resolve it
  let absolutePath: string;
  if (worktreePath.startsWith('/')) {
    absolutePath = worktreePath;
  } else {
    // If relative, resolve from current working directory
    absolutePath = resolve(process.cwd(), worktreePath);
  }
  
  // Verify the worktree path exists before trying to run git commands
  if (!existsSync(absolutePath)) {
    logger.warn(`Worktree path does not exist: ${absolutePath}`, 'GitUtils', { 
      worktreePath, 
      absolutePath,
      currentCwd: process.cwd(),
    });
    
    // Try to find the worktree by looking in .worktrees directory
    const projectRoot = process.cwd();
    const worktreesDir = join(projectRoot, '.worktrees');
    
    if (existsSync(worktreesDir)) {
      try {
        const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => join(worktreesDir, dirent.name));
        
        logger.info(`Found worktree directories`, 'GitUtils', {
          count: worktreeDirs.length,
          directories: worktreeDirs,
        });
        
        // Try to find a worktree that matches the expected branch name or run ID
        // Extract branch name from worktreePath if possible
        const pathParts = worktreePath.split('/');
        const branchName = pathParts[pathParts.length - 1];
        
        // Filter to only valid git worktrees
        const validWorktrees = worktreeDirs.filter(dir => {
          const gitFile = join(dir, '.git');
          return existsSync(gitFile);
        });
        
        logger.info(`Found ${validWorktrees.length} valid worktree(s)`, 'GitUtils', {
          validWorktrees,
          storedPath: worktreePath,
          branchName,
          runId,
        });
        
        // If there's only one worktree, use it (most common case)
        if (validWorktrees.length === 1) {
          logger.info(`Using only available worktree: ${validWorktrees[0]}`, 'GitUtils');
          absolutePath = validWorktrees[0];
        } else if (validWorktrees.length > 1) {
          // Multiple worktrees - try to match by run ID first (most reliable)
          if (runId) {
            // Worktree branch names are like: agent-orch-{first8charsOfRunId}
            const runIdPrefix = runId.slice(0, 8);
            for (const dir of validWorktrees) {
              const dirName = dir.split('/').pop() || '';
              // Check if worktree directory name contains the run ID prefix
              if (dirName.includes(runIdPrefix)) {
                logger.info(`Matched worktree by run ID: ${dir}`, 'GitUtils', {
                  dirName,
                  runIdPrefix,
                });
                absolutePath = dir;
                break;
              }
            }
          }
          
          // If no match by run ID, try to match by branch name pattern
          if (!existsSync(absolutePath)) {
            for (const dir of validWorktrees) {
              const dirName = dir.split('/').pop() || '';
              // Try to match by branch name pattern (agent-orch-XXXX)
              if (branchName && (dirName.includes(branchName) || branchName.includes(dirName))) {
                logger.info(`Matched worktree by name: ${dir}`, 'GitUtils', {
                  dirName,
                  branchName,
                });
                absolutePath = dir;
                break;
              }
            }
          }
          
          // If still no match and we have worktrees, use the most recent one
          if (!existsSync(absolutePath) && validWorktrees.length > 0) {
            // Sort by modification time and use the most recent
            const sortedWorktrees = validWorktrees.sort((a, b) => {
              try {
                const statA = statSync(a);
                const statB = statSync(b);
                return statB.mtimeMs - statA.mtimeMs;
              } catch {
                return 0;
              }
            });
            logger.info(`Using most recent worktree: ${sortedWorktrees[0]}`, 'GitUtils');
            absolutePath = sortedWorktrees[0];
          }
        }
      } catch (error: any) {
        logger.warn(`Could not search for worktrees: ${error.message}`, 'GitUtils');
      }
    }
    
    // Final check - if still doesn't exist, return empty
    if (!existsSync(absolutePath)) {
      logger.error(`Worktree path still does not exist after search: ${absolutePath}`, 'GitUtils', {
        worktreePath,
        absolutePath,
        currentCwd: process.cwd(),
      });
      return [];
    }
  }
  
  try {
    const output = execSync(
      'git status --porcelain',
      { 
        cwd: absolutePath, 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large repos
      }
    );

    const files: ChangedFile[] = [];
    const lines = output.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.length < 3) continue; // Skip malformed lines
      
      const status = line.substring(0, 2);
      // Git status format: XY path
      // For renamed files, format is: R  oldpath -> newpath
      // For other files, format is: XY path
      let path: string;
      let fileStatus: ChangedFile['status'] = 'M';
      
      if (status === 'R ') {
        // Renamed file: "R  oldpath -> newpath" (note: 2 spaces after R)
        fileStatus = 'R';
        const arrowIndex = line.indexOf(' -> ');
        if (arrowIndex !== -1) {
          // Extract the new path (after the arrow)
          path = line.substring(arrowIndex + 4).trim();
        } else {
          // Fallback: shouldn't happen, but be safe
          // For renamed files, skip "R  " (3 chars) to get the path part
          path = line.substring(3).trim();
        }
      } else if (status === '??') {
        // Untracked file - treat as Added
        fileStatus = 'A';
        path = line.substring(3).trim();
      } else {
        // Regular file: "XY path" where XY is status code
        // Format: "XY path" - status is 2 chars, then space, then path
        // But some statuses might have leading space like " M" (space + M)
        let pathStart = 3; // Default: skip 2-char status + space
        if (line[2] !== ' ') {
          // No space after status - shouldn't happen in porcelain format, but handle it
          pathStart = 2;
        }
        path = line.substring(pathStart).trim();
        
        // Parse git status format: XY path
        // X = index status, Y = working tree status
        if (status.includes('A')) {
          fileStatus = 'A';
        } else if (status.includes('D')) {
          fileStatus = 'D';
        } else if (status.includes('M')) {
          fileStatus = 'M';
        }
      }

      if (path) {
        files.push({
          path,
          status: fileStatus,
        });
      }
    }

    return files;
  } catch (error: any) {
    logger.error('Failed to get changed files', 'GitUtils', { error, worktreePath, absolutePath });
    return [];
  }
}

/**
 * Get diff for a specific file
 */
export function getFileDiff(worktreePath: string, filePath: string, runId?: string): string {
  // Handle empty or temp paths by finding the worktree (same logic as getChangedFiles)
  if (!worktreePath || worktreePath.startsWith('/tmp/') || worktreePath.trim() === '') {
    if (runId) {
      const projectRoot = process.cwd();
      const worktreesDir = join(projectRoot, '.worktrees');
      
      if (existsSync(worktreesDir)) {
        try {
          const worktreeDirs = readdirSync(worktreesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => join(worktreesDir, dirent.name));
          
          const runIdPrefix = runId.slice(0, 8);
          for (const dir of worktreeDirs) {
            const dirName = dir.split('/').pop() || '';
            if (dirName.includes(runIdPrefix)) {
              worktreePath = dir;
              break;
            }
          }
        } catch (error: any) {
          logger.warn(`Could not search for worktree by run ID in getFileDiff: ${error.message}`, 'GitUtils');
        }
      }
    }
    
    if (!worktreePath || worktreePath.startsWith('/tmp/') || worktreePath.trim() === '') {
      return `Error: Worktree path not found`;
    }
  }
  
  // Resolve to absolute path
  const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
  
  // Verify the worktree path exists
  if (!existsSync(absolutePath)) {
    logger.warn(`Worktree path does not exist: ${absolutePath}`, 'GitUtils', { worktreePath, absolutePath, filePath });
    return `Error: Worktree path does not exist`;
  }
  
  try {
    // Use git diff with proper escaping - use -- to separate paths from revisions
    // This handles files with spaces, special characters, and prevents ambiguity
    const diff = execSync(
      `git diff -- "${filePath}"`,
      { 
        cwd: absolutePath, 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      }
    );
    return diff;
  } catch (error: any) {
    logger.error('Failed to get file diff', 'GitUtils', { 
      error: error.message || String(error), 
      worktreePath, 
      absolutePath,
      filePath,
      code: (error as any).code,
    });
    return `Error getting diff: ${error.message || String(error)}`;
  }
}

/**
 * Get the current branch name for a worktree
 */
export function getCurrentBranch(worktreePath: string): string | null {
  // Resolve to absolute path
  const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
  
  // Verify the worktree path exists
  if (!existsSync(absolutePath)) {
    logger.warn(`Worktree path does not exist: ${absolutePath}`, 'GitUtils', { worktreePath, absolutePath });
    return null;
  }
  
  try {
    const branch = execSync(
      'git rev-parse --abbrev-ref HEAD',
      { 
        cwd: absolutePath, 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024, // 1MB buffer
      }
    ).trim();
    return branch;
  } catch (error: any) {
    logger.error('Failed to get current branch', 'GitUtils', { 
      error: error.message || String(error), 
      worktreePath, 
      absolutePath,
      code: (error as any).code,
    });
    return null;
  }
}

/**
 * Stage all changes and create a commit
 */
export function createCommit(worktreePath: string, commitMessage: string): { success: boolean; error?: string } {
  try {
    // Resolve to absolute path
    const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
    
    // Verify the worktree path exists
    if (!existsSync(absolutePath)) {
      return { success: false, error: 'Worktree path does not exist' };
    }

    // Stage all changes
    execSync('git add -A', { 
      cwd: absolutePath, 
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Create commit with the message
    // Use a temporary file to handle multi-line messages and special characters safely
    const tempFile = join(absolutePath, '.commit-msg-temp');
    try {
      writeFileSync(tempFile, commitMessage, 'utf-8');
      execSync(`git commit -F .commit-msg-temp`, { 
        cwd: absolutePath, 
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      // Clean up temp file
      unlinkSync(tempFile);
    } catch (error) {
      // Clean up temp file even on error
      if (existsSync(tempFile)) {
        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }

    logger.info(`Created commit in worktree`, 'GitUtils', {
      worktreePath: absolutePath,
      commitMessage: commitMessage.substring(0, 50),
    });
    return { success: true };
  } catch (error: any) {
    logger.error('Failed to create commit', 'GitUtils', { error, worktreePath });
    return { success: false, error: error.message };
  }
}

/**
 * Merge current branch into target branch
 */
export function mergeToBranch(worktreePath: string, targetBranch: string): { success: boolean; error?: string } {
  try {
    // Resolve to absolute path
    const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
    
    // Get current branch
    const currentBranch = getCurrentBranch(absolutePath);
    if (!currentBranch) {
      return { success: false, error: 'Could not determine current branch' };
    }

    // Switch to target branch in the main repo (not the worktree)
    // We need to merge FROM the worktree branch TO the target branch in main repo
    const mainRepoPath = process.cwd();
    execSync(`git checkout ${targetBranch}`, { cwd: mainRepoPath, stdio: 'inherit' });

    // Merge current branch from worktree into target branch
    execSync(`git merge ${currentBranch} --no-edit`, { cwd: mainRepoPath, stdio: 'inherit' });

    logger.info(`Merged ${currentBranch} into ${targetBranch}`, 'GitUtils', {
      currentBranch,
      targetBranch,
      worktreePath: absolutePath,
      mainRepoPath,
    });
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
    // Resolve to absolute path
    const absolutePath = worktreePath.startsWith('/') ? worktreePath : resolve(process.cwd(), worktreePath);
    
    // Try to get remote URL (can use worktree or main repo)
    const remoteUrl = execSync(
      'git config --get remote.origin.url',
      { cwd: absolutePath, encoding: 'utf-8' }
    ).trim();

    const currentBranch = getCurrentBranch(absolutePath);
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
