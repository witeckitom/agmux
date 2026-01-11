# Agent Orchestration TUI - Project Rules

## Project Overview

This is a **local terminal-based orchestration interface** for managing, running, and observing multiple AI agents concurrently. It's inspired by k9s (Kubernetes TUI) and designed for developers using local AI agents (Claude, Codex, Cursor, etc.).

### Tech Stack

- **React + Ink** - Terminal UI framework (React renderer for CLI)
- **TypeScript** - Primary language
- **SQLite** - Local persistence for orchestration data
- **Claude Agent SDK** - Agent execution and lifecycle management

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Projects** | Local repo/workspace containing skills, commands, hooks, profiles |
| **Skills** | Reusable prompt templates with variables |
| **Commands** | Executable TUI actions (triggered via `:command` mode) |
| **Hooks** | Lifecycle scripts (before/after run, on error, etc.) |
| **Agent Profiles** | Execution config (executor type, mode, options) |
| **Runs/Tasks** | Agent executions with status, progress, logs, and worktree |

### Key Features

- **Git Worktree Isolation** - Each agent run executes in its own git worktree
- **Concurrent Execution** - Multiple agents run independently
- **Progress Tracking** - Sub-task based progress bars
- **"Ready to Act" State** - Visual indicator when agent needs user input
- **Interactive Chat** - Send prompts mid-run, view transcripts
- **Theming** - Matrix-inspired default theme, customizable

### UI Structure

- **Top Bar** - Always visible: project name, git branch, hotkeys, current view
- **Views** - Accessed via `:tasks`, `:skills`, `:commands`, `:hooks`, `:agents`, `:profiles`
- **Task Detail View** - Split pane with chat log (left) and file changes (right)
- **Vim keybindings** - `j/k` navigate, `:` command mode, `v` open VSCode, `q` quit/back

---

## Ink Framework Limitations

### ⚠️ Explicit Height Causes Repaint Issues

**Problem**: Ink has a limitation where adding an explicit `height` to a component affects screen repaints. If you use an isolated timer component (or any component that updates frequently) inside a component with a full-screen height, it will cause the **entire screen to repaint** every time the timer/state updates.

**Symptoms**:
- Screen flickers on every state update
- Performance degradation with frequent updates
- Visual artifacts or full redraws

**Workarounds**:
1. Avoid setting explicit `height` on parent containers when possible
2. Use `flexGrow` and `flexShrink` instead of fixed heights
3. Isolate frequently-updating components away from height-constrained parents
4. Consider using `useStdout` dimensions sparingly and avoid passing them to deeply nested components that have their own state updates

**Example of problematic pattern**:
```tsx
// ❌ BAD: Timer inside height-constrained parent causes full repaints
const App = () => {
  const { rows } = useStdout();
  return (
    <Box height={rows} flexDirection="column">
      <Timer /> {/* Updates every second, causes full screen repaint */}
      <Content />
    </Box>
  );
};
```

**Correct approach - Explicit heights only in timer-free views**:

When any component in the tree has a timer or frequently-updating state, you cannot use explicit heights anywhere in the ancestor chain without causing full repaints.

```tsx
// ❌ BAD: Timer + explicit height = flashing
const TaskDetailView = () => {
  const height = process.stdout.rows;
  return (
    <Box height={height}> {/* Explicit height */}
      <StatusBar /> {/* Contains timer - WILL CAUSE FLASHING */}
      <Columns />
    </Box>
  );
};

// ✅ GOOD: Timer view uses flexGrow, no explicit height
const TaskDetailView = () => {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <StatusBar /> {/* Contains isolated timer */}
      <Box flexDirection="row" flexGrow={1}>
        <ChatColumn />
        <FilesColumn />
        <DiffColumn />
      </Box>
    </Box>
  );
};

// ✅ GOOD: Views WITHOUT timers CAN use explicit heights
const TaskList = () => {
  const height = process.stdout.rows - 7; // Subtract TopBar etc.
  return (
    <Box height={height}> {/* Safe - no timers in this tree */}
      <TaskColumn height={height} />
      <TaskColumn height={height} />
    </Box>
  );
};
```

**Key rules**:
- NEVER use explicit `height` when the component tree contains timers or frequent updates
- Views WITHOUT timers (like TasksView/TaskList) CAN safely use explicit heights for full-screen layouts
- Use `flexGrow={1}` for views that have timers
- Compute available height by subtracting known heights (TopBar ~5 lines, CommandMode ~3 lines when active)

---

## Code Conventions

### File Structure

```
src/
├── agents/        # Agent implementations (Claude, Cursor, etc.)
├── app/           # Main App component
├── components/    # Reusable UI components
├── context/       # React contexts (App, Input, Settings)
├── db/            # SQLite database and schema
├── hooks/         # Custom React hooks
├── models/        # TypeScript types and interfaces
├── services/      # Business logic services
├── utils/         # Utility functions
└── views/         # Full-screen view components
```

### Naming Conventions

- **Components**: PascalCase (`TaskCard.tsx`, `TopBar.tsx`)
- **Hooks**: camelCase with `use` prefix (`useKeyboard.ts`)
- **Utilities**: camelCase (`gitUtils.ts`, `logger.ts`)
- **Views**: PascalCase with `View` suffix (`TasksView.tsx`, `SettingsView.tsx`)
- **Tests**: Same name as source file with `.test.tsx` suffix

### Component Guidelines

1. Views are full-screen components accessed via command mode
2. Components should be keyboard-navigable (vim-style)
3. Use the existing context providers (`AppContext`, `InputContext`, `SettingsContext`)
4. Use `flexGrow={1}` for layouts - avoid explicit heights due to Ink repaint issues
5. Follow the k9s-style UI patterns established in the codebase

---

## Data Architecture

### What to Store in SQLite

- Run/Task metadata (ID, worktree path, status, timestamps, conversation ID)
- Worktree registry (paths, base branches, cleanup status)
- User preferences and UI state

### What NOT to Store (Retrieve from External Sources)

- Chat messages → Retrieve from Claude API via conversation ID
- Skill/command/hook definitions → Read from project filesystem
- File changes/diffs → Query git in the worktree
- Agent progress/todos → Query from active agent session via SDK

---

## Testing

- Unit tests use Vitest
- Component tests use `@testing-library/react` with custom test utilities in `src/test-utils/`
- E2E tests are in the `e2e/` directory
