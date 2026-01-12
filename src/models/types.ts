export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RunPhase =
  | 'worktree_creation'
  | 'setup_hooks'
  | 'agent_execution'
  | 'cleanup_hooks'
  | 'finalization';

export interface Run {
  id: string;
  name: string | null;
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
  durationMs: number | null; // Duration in milliseconds (null if not completed)
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

export interface Message {
  id: string;
  runId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export type ViewType = 'tasks' | 'skills' | 'commands' | 'hooks' | 'profiles' | 'agents' | 'new-task' | 'task-detail' | 'settings' | 'merge-prompt';

export type AgentType = 'claude' | 'cursor';
export type ThemeType = 'default' | 'matrix';
export type EditorType = 'vscode' | 'custom';
