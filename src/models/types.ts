export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RunPhase =
  | 'worktree_creation'
  | 'setup_hooks'
  | 'agent_execution'
  | 'cleanup_hooks'
  | 'finalization';

export interface Run {
  id: string;
  status: RunStatus;
  phase: RunPhase;
  worktreePath: string;
  baseBranch: string;
  agentProfileId: string;
  conversationId: string | null;
  skillId: string | null;
  prompt: string | null;
  progressPercent: number; // 0-100
  totalSubtasks: number;
  completedSubtasks: number;
  readyToAct: boolean; // Waiting for user input
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  retainWorktree: boolean; // Don't auto-cleanup
}

export interface Worktree {
  id: string;
  path: string;
  baseBranch: string;
  runId: string;
  createdAt: Date;
  cleanupAt: Date | null;
  retained: boolean;
}

export interface Preference {
  key: string;
  value: string;
}

export type ViewType = 'tasks' | 'skills' | 'commands' | 'hooks' | 'profiles' | 'agents';
