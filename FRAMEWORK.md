# Framework Implementation

This document describes the base framework implementation for the Agent Orchestration TUI.

## Architecture Overview

The application is built with React Ink and follows a component-based architecture with centralized state management.

### Core Components

1. **App Context** (`src/context/AppContext.tsx`)
   - Centralized state management using React Context
   - Manages current view, selected index, runs, command mode
   - Provides methods for state updates and command execution

2. **Keyboard Handler** (`src/hooks/useKeyboard.ts`)
   - Handles all keyboard input
   - Supports vim-style navigation (j/k, arrow keys)
   - Command mode activation (`:`)
   - View switching shortcuts

3. **Command Mode** (`src/components/CommandMode.tsx`)
   - Command input interface
   - Activated by pressing `:`
   - Supports commands: `tasks`, `skills`, `commands`, `hooks`, `profiles`, `agents`, `refresh`, `quit`

4. **View Router** (`src/components/ViewRouter.tsx`)
   - Routes to appropriate view based on current state
   - Supports 6 views: tasks, skills, commands, hooks, profiles, agents

5. **Top Bar** (`src/components/TopBar.tsx`)
   - Displays project name, git branch, current view
   - Shows running task count
   - Auto-detects git branch from repository

6. **Task List** (`src/components/TaskList.tsx`)
   - Displays all runs/tasks
   - Shows status icons, progress, phase
   - Highlights selected item
   - Empty state messaging

## Views

Each view is a separate component in `src/views/`:

- **TasksView**: Main view showing all agent runs
- **SkillsView**: Placeholder for skills management
- **CommandsView**: Placeholder for commands management
- **HooksView**: Placeholder for hooks management
- **ProfilesView**: Placeholder for agent profiles
- **AgentsView**: Placeholder for active agents

## Keyboard Shortcuts

### Normal Mode
- `j` / `↓` - Move selection down
- `k` / `↑` - Move selection up
- `:` - Enter command mode
- `r` / `R` - Refresh runs
- `q` - Quit (when not on tasks view, goes back to tasks)
- `Ctrl+C` - Quit application

### Command Mode
- `Enter` - Execute command
- `Esc` - Cancel command mode
- `Backspace` - Delete character

### Commands
- `:tasks` - Switch to tasks view
- `:skills` - Switch to skills view
- `:commands` - Switch to commands view
- `:hooks` - Switch to hooks view
- `:profiles` - Switch to profiles view
- `:agents` - Switch to agents view
- `:refresh` / `:r` - Refresh runs list
- `:quit` / `:q` - Quit (handled by keyboard hook)

## State Management

State is managed through React Context (`AppContext`):

```typescript
interface AppState {
  currentView: ViewType;
  selectedIndex: number;
  runs: Run[];
  commandMode: boolean;
  commandInput: string;
  projectRoot: string;
  currentBranch?: string;
}
```

State updates are handled through context methods:
- `setCurrentView(view)` - Change active view
- `setSelectedIndex(index)` - Change selected item
- `refreshRuns()` - Reload runs from database
- `setCommandMode(enabled)` - Toggle command mode
- `setCommandInput(input)` - Update command input
- `executeCommand(command)` - Execute a command string

## Database Integration

The framework integrates with the SQLite database through `DatabaseManager`:

- Runs are automatically refreshed every 2 seconds
- Runs can be queried, created, updated through the database layer
- All database operations are synchronous (better-sqlite3)

## Testing

The framework includes comprehensive tests:

- **Unit Tests**: Test individual components in isolation
- **E2E Tests**: Test complete user flows
- **Context Tests**: Verify state management
- **Component Tests**: Verify UI rendering and interaction

All tests use Vitest and ink-testing-library for React Ink component testing.

## Usage Example

```typescript
import { App } from './app/App';
import { DatabaseManager } from './db/database';

const db = new DatabaseManager('/path/to/db.db');
render(<App database={db} projectRoot="/path/to/project" />);
```

## Next Steps

The framework provides a solid foundation for:

1. **Adding detail views** - Show run details when Enter is pressed
2. **Implementing skills/commands/hooks** - Load from project config files
3. **Agent execution** - Integrate with Claude Agent SDK
4. **Git worktree management** - Create and manage worktrees
5. **Real-time updates** - WebSocket or polling for agent progress
6. **Theming** - Customizable color schemes

## File Structure

```
src/
├── app/
│   └── App.tsx              # Main app component
├── components/
│   ├── TopBar.tsx           # Top status bar
│   ├── MainView.tsx         # Main content area
│   ├── ViewRouter.tsx       # View routing logic
│   ├── TaskList.tsx         # Task list component
│   └── CommandMode.tsx      # Command input UI
├── context/
│   └── AppContext.tsx        # State management
├── hooks/
│   └── useKeyboard.ts        # Keyboard input handling
├── views/
│   ├── TasksView.tsx        # Tasks view
│   ├── SkillsView.tsx       # Skills view (placeholder)
│   ├── CommandsView.tsx     # Commands view (placeholder)
│   ├── HooksView.tsx        # Hooks view (placeholder)
│   ├── ProfilesView.tsx     # Profiles view (placeholder)
│   └── AgentsView.tsx       # Agents view (placeholder)
├── db/
│   └── database.ts           # Database layer
└── models/
    └── types.ts              # TypeScript types
```
