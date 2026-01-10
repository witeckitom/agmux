-- Runs/Tasks table
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    phase TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    agent_profile_id TEXT NOT NULL,
    conversation_id TEXT,
    skill_id TEXT,
    prompt TEXT,
    progress_percent INTEGER DEFAULT 0,
    total_subtasks INTEGER DEFAULT 0,
    completed_subtasks INTEGER DEFAULT 0,
    ready_to_act INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    completed_at DATETIME,
    duration_ms INTEGER,
    retain_worktree INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_conversation_id ON runs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

-- Worktree registry
CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    base_branch TEXT NOT NULL,
    run_id TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    cleanup_at DATETIME,
    retained INTEGER DEFAULT 0,
    FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_worktrees_run_id ON worktrees(run_id);
CREATE INDEX IF NOT EXISTS idx_worktrees_path ON worktrees(path);

-- User preferences
CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Conversation messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_run_id ON messages(run_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
