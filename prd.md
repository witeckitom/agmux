Product Requirements Document

Product Name (Working): Agent Orchestration TUI
Type: Local terminal application
Audience: Developers using local AI agents (Claude, Codex, Cursor, etc.)
Inspiration: k9s (Kubernetes TUI), Vibekanban (agent + task workflow)

1. Purpose & Goals

The goal of this product is to provide a local, terminal-based orchestration interface for managing, running, and observing multiple AI agents concurrently.

The application should feel like k9s for AI agents:

Vim-style navigation

Pane-based UI

Fast, keyboard-driven workflows

Real-time observability into agent execution

The system must support parallel agent execution, isolated code environments, and interactive agent conversations, while remaining entirely local-first.

2. Core Concepts & Domain Model
2.1 Projects

A project represents a local repository or workspace.

All agent runs occur within the context of a project.

Projects may define:

Skills

Commands

Hooks

Agent profiles

Default base branch for worktrees

2.2 Skills

A Skill is a reusable, named capability an agent can perform.

Skills include:

A prompt template

Optional input variables

Optional constraints or instructions

Skills are discoverable and runnable from the TUI.

Users must be able to:

List skills

View skill definitions

Run a skill with a prompt or parameters

2.3 Commands

A Command is an executable action exposed in the TUI command layer.

Commands may:

Trigger skills

Run hooks

Start or manage agent runs

Navigate the UI

Commands must be invokable via:

: command mode

Keybindings (optional)

2.4 Hooks

Hooks are lifecycle scripts or functions.

Hooks may run:

Before a run starts

After a run completes

On cancellation

On error

Hooks can execute shell scripts or programmatic handlers.

Hooks must be:

Viewable

Enableable / disableable

Associated with run lifecycle stages

2.5 Agent Profiles

Agent profiles define how an agent is executed.

A profile includes:

Executor (Claude CLI, Codex CLI, etc.)

Variant or mode (e.g. default, plan, review)

Configuration options

Users must be able to:

List profiles

Select which profile is used for a run

Override profile options at runtime

2.6 Runs (Agent Attempts)

A Run represents a single execution of an agent.

Runs are immutable historical records once completed.

Each run has:

A unique ID

A status (queued, running, completed, failed, cancelled)

A lifecycle phase

A progress indicator

Logs and streamed output

An associated git worktree

3. Git Worktree Isolation

Every run must execute inside its own git worktree.

Worktrees must:

Be created from a configurable base branch

Be isolated from other runs

Be cleaned up automatically unless explicitly retained

Users must be able to:

View the worktree path for a run

Opt to keep or delete a worktree after completion

Inspect git status and diffs for a run

4. Agent Execution & Concurrency

The system must support multiple concurrent agent runs.

Runs must execute independently and not block each other.

Users must be able to:

Start multiple runs simultaneously

Cancel a running agent

Restart a completed run

Execution must support:

Streaming logs

Interactive input (when supported by the executor)

5. Progress & Observability
5.1 Progress Tracking

Each run must display a progress bar based on sub-task completion.

**Sub-task Based Progress**

- Agents create sub-tasks (todos) as they plan and execute work
- Each sub-task represents a discrete unit of work
- Progress percentage = completed sub-tasks / total sub-tasks
- Sub-tasks can be added dynamically as the agent discovers more work
- Progress updates in real-time as sub-tasks complete

**Orchestration Phases**

In addition to sub-task progress, runs track orchestration phases:

Worktree creation

Setup hooks

Agent execution (where sub-task progress applies)

Cleanup hooks

Finalization

**"Ready to Act" State**

A run enters "ready to act" state when:

- The agent is waiting for user input
- The agent has completed and is awaiting review
- The agent needs approval to proceed

This state must be clearly indicated in the tasks view with a visual indicator.

5.2 Logs & Events

Agent output must stream in real time.

Logs must be:

Scrollable

Persisted for completed runs

Users must be able to:

Attach to a running agent

View historical logs

Resume viewing a run after navigating away

6. Interactive Agent Conversations

For agents that support it, users must be able to:

View the live chat transcript

Send additional prompts mid-run

Continue a completed conversation

The UI must clearly indicate:

Whether a run supports interactive chat

Whether the agent is currently waiting for input

7. Terminal UI Requirements
7.1 Layout

The UI must use a pane-based layout, similar to k9s:

**Top Bar (Always Visible)**

The top bar must always be visible and display:

- Current project/repository name
- Current git branch
- Available hotkeys with descriptions (e.g., `<v> VSCode`, `<e> Edit`, `<q> Quit`)
- Current context/view indicator

**Main Content Area**

- Resource list pane (left/center) - displays entities in a scrollable list
- Detail pane (right) - shows selected resource details in a vim-style editor view

**Command/Search Bar**

- Appears at the top when `:` is pressed
- Supports autocomplete and fuzzy matching
- Shows typed command/search in real-time

7.2 Navigation Model (k9s-style)

**Context Switching via Commands**

Users can type context commands from anywhere to switch views:

- `:agents` - Switch to agents list view
- `:skills` - Switch to skills list view
- `:commands` - Switch to commands list view
- `:hooks` - Switch to hooks list view
- `:tasks` - Switch to tasks/runs list view
- `:profiles` - Switch to agent profiles list view

When a command is typed, the search bar appears at the top bar with the typed value, filtering/navigating to that context.

**Resource Selection Flow**

1. User types `:skills` → Skills list appears
2. User navigates list with j/k → Selects a skill
3. Pressing Enter → Opens skill markdown in vim-style editor pane on right
4. User can scroll/read the skill definition
5. Pressing Escape or `q` → Returns to list view

7.3 Vim-style Keybindings

Global keybindings:

- `j/k` - Navigate up/down in lists
- `h/l` - Switch focus between panes
- `gg/G` - Jump to top/bottom
- `/` - Search within current view
- `:` - Open command bar
- `Enter` - Select/open resource
- `Escape` - Close detail pane / cancel command
- `q` - Quit current view / go back
- `v` - Open VS Code in current worktree (when applicable)
- `e` - Edit selected resource
- `r` - Refresh current view

Mouse support is optional but not required.

7.4 Theming

**Theme Support**

The UI must support customizable color themes:

- Themes defined in configuration files (JSON or TOML)
- Users can switch themes via `:theme <name>` command
- Theme changes apply immediately without restart

**Default Theme: Retro Terminal (Matrix)**

The default theme evokes classic terminal aesthetics with a Matrix-inspired palette:

- **Background**: Deep black (`#0D0D0D`)
- **Primary text**: Phosphor green (`#00FF41`)
- **Secondary text**: Dim green (`#008F11`)
- **Accent/highlights**: Bright green (`#00FF41`) with glow effect
- **Selection/cursor**: Inverted green on black
- **Borders**: Dark green (`#003B00`)
- **Error states**: Amber (`#FF9900`)
- **Success states**: Bright green (`#00FF41`)
- **Progress bars**: Green gradient (`#003B00` → `#00FF41`)
- **"Ready to act" indicator**: Pulsing bright green

**Typography**

- Monospace font throughout (user's terminal font)
- Support for Unicode box-drawing characters
- Scanline or CRT effect optional (configurable)

**Built-in Themes**

Ship with additional themes:

- `matrix` (default) - Green phosphor on black
- `amber` - Amber CRT monitor style
- `blue` - Classic blue terminal
- `dracula` - Popular dark theme
- `solarized-dark` - Solarized color scheme
- `light` - High contrast light theme for accessibility

**Custom Themes**

Users can define custom themes in `~/.config/agent-orch/themes/`:

```toml
[theme]
name = "my-theme"

[colors]
background = "#0D0D0D"
foreground = "#00FF41"
accent = "#00FF41"
border = "#003B00"
error = "#FF9900"
success = "#00FF41"
selection_bg = "#00FF41"
selection_fg = "#0D0D0D"

[effects]
scanlines = false
glow = true
```

7.5 Views

**Resource List Views**

All resource views (Skills, Commands, Hooks, Agents, Profiles) must:

- Display resources in a scrollable table/list format
- Show key metadata columns (name, status, description preview)
- Support filtering via `/` search
- Highlight the currently selected row

**Skill/Command Detail View**

When a skill or command is selected:

- Right pane opens with a vim-style editor view
- Displays the full markdown definition of the skill/command
- Supports scrolling with j/k
- Read-only by default, `e` to edit

**Tasks View (`:tasks`)**

The tasks view is the primary operational view showing all running agent work:

- Displays all tasks/agent runs as visual blocks
- Each task block shows:
  - Task ID and name
  - Current status (queued, running, waiting for input, completed, failed)
  - Progress bar showing completion percentage
  - "Ready to act" indicator if agent is waiting for user input
- Progress is updated in real-time as agents complete sub-tasks
- Tasks are sortable by status, progress, or creation time

**Task Detail View**

When a task is selected from the tasks view:

- Screen splits into two main panes:

**Left Pane - Chat Window**
- Shows the latest conversation/chat log with the agent
- Displays agent messages and user inputs
- Scrollable with j/k
- If agent is waiting for input, shows input prompt at bottom

**Right Pane - File Editor View**
- Shows files that have been modified by the agent
- Displays file tree of changes in the worktree
- Selecting a file shows diff view (what changed)
- Vim-style navigation within the file view

**Task View Hotkeys**

- `v` - Open VS Code in the task's git worktree
- `c` - Continue/send message to agent (if waiting for input)
- `d` - Show full diff of all changes
- `l` - Show full logs
- `x` - Cancel the running task

The `v` hotkey and other available actions must be displayed in the top bar.

7.6 UI Mockups

**Top Bar (Always Visible)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ agent-orch │ main │ :tasks │  <v>VSCode <e>Edit <d>Diff <c>Chat <q>Quit    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Skills List View**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ agent-orch │ main │ :skills │           <e>Edit <q>Back                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ SKILLS                           │                                          │
│ ────────────────────────────────│                                          │
│ > implement    Run implementation│  # implement                             │
│   review       Code review       │                                          │
│   test         Run tests         │  Implements a feature based on a         │
│   refactor     Refactor code     │  specification or user request.          │
│   document     Generate docs     │                                          │
│                                  │  ## Usage                                │
│                                  │  :implement <description>                │
│                                  │                                          │
│                                  │  ## Variables                            │
│                                  │  - description: What to implement        │
│                                  │  - scope: File or directory scope        │
├─────────────────────────────────────────────────────────────────────────────┤
│ :                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tasks List View**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ agent-orch │ feature-auth │ :tasks │    <v>VSCode <x>Cancel <q>Back         │
├─────────────────────────────────────────────────────────────────────────────┤
│ TASKS                                                                       │
│ ─────────────────────────────────────────────────────────────────────────── │
│ > #12 implement auth flow          [████████░░░░] 67%  ⚡ RUNNING           │
│   #11 fix login bug                [████████████] 100% ✓ COMPLETED          │
│   #10 add user model               [████████████] 100% ✓ COMPLETED          │
│   #09 review PR #234               [██░░░░░░░░░░] 15%  ⏸ WAITING FOR INPUT  │
├─────────────────────────────────────────────────────────────────────────────┤
│ :                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Task Detail View (Selected Task)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ agent-orch │ feature-auth │ Task #12 │  <v>VSCode <d>Diff <c>Chat <q>Back   │
├──────────────────────────────────┬──────────────────────────────────────────┤
│ CHAT                             │ FILES CHANGED                            │
│ ─────────────────────────────────│ ─────────────────────────────────────────│
│ 🤖 I'll implement the auth flow. │ > src/auth/login.ts        +45 -12       │
│    Let me start by creating the  │   src/auth/session.ts      +120 -0       │
│    login handler...              │   src/middleware/auth.ts   +34 -5        │
│                                  │   tests/auth.test.ts       +89 -0        │
│ 🤖 Created login.ts with basic   │ ─────────────────────────────────────────│
│    password validation.          │ src/auth/login.ts                        │
│                                  │ ─────────────────────────────────────────│
│ 🤖 Now adding session management │ + export async function login(           │
│    ...                           │ +   email: string,                       │
│                                  │ +   password: string                     │
│ █                                │ + ): Promise<Session> {                  │
│                                  │ +   const user = await findUser(email);  │
├──────────────────────────────────┴──────────────────────────────────────────┤
│ :                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

8. Command Mode

A command mode must exist, activated by :

Commands must support:

Autocomplete

Validation

Context-aware suggestions

Command examples:

Run a skill

Attach to a run

Cancel a run

Switch agent profile

Clean up worktrees

9. Agent Execution via Claude Agent SDK

The system must use the **Claude Agent SDK** for all agent orchestration.

**SDK Responsibilities**

The Claude Agent SDK handles:

- Agent execution and lifecycle management
- Chat message history and conversation state
- Tool definitions and execution
- Streaming responses
- Sub-task/todo tracking (agents report progress via SDK)

**Data Retrieved from SDK/API (not stored locally)**

- Chat messages and conversation history (via conversation ID)
- Agent progress and todo state
- Logs and streamed output

**Data Retrieved from Filesystem (not stored in DB)**

- Skills, commands, hooks definitions (read from project files)
- Agent profiles and configurations
- File changes and diffs (query git in the worktree)

10. Persistence & Storage

**Database: SQLite**

SQLite stores **orchestration-specific data only** - information that Claude/the SDK doesn't inherently know.

**Schema Requirements**

The database must store:

- **Runs/Tasks** - Task ID, associated worktree path, agent profile used, status, timestamps, Claude conversation ID
- **Worktree registry** - Tracks created worktrees, their base branches, and cleanup status
- **User preferences** - UI state, default settings

**What NOT to Store**

Do not duplicate data available from Claude API or the filesystem:

- Chat messages (retrieve from Claude via conversation ID)
- Skill/command/hook definitions (read from project files)
- File changes (query git in the worktree)
- Progress/todos (query from active agent session via SDK)

**Data Lifecycle**

- Run metadata persists for historical reference
- Conversation IDs allow retrieval of chat history from Claude
- Worktree paths stored but worktrees may be cleaned up independently

Runs remain viewable after restart via stored conversation IDs.

11. Non-Goals

The following are explicitly out of scope:

Cloud-hosted execution

Centralized user accounts

Automatic PR merging

Proprietary agent hosting

Web UI (terminal-first only)

12. Design Principles

Local-first

Deterministic orchestration

Observable by default

Keyboard-driven

Minimal abstraction leakage

13. Success Criteria

The product is successful if a user can:

**Core Functionality**

- Define skills, commands, hooks, and agent profiles locally
- Launch multiple AI agents concurrently
- Observe real-time progress and logs
- Interact with running agents
- Safely isolate all code changes via git worktrees
- Navigate the entire experience without leaving the terminal

**UI/UX Requirements**

- Always see the current project and git branch in the top bar
- Switch between views using `:commands` (`:tasks`, `:skills`, `:agents`, etc.)
- View any resource (skill, command, hook) in a vim-style markdown editor pane
- See all running tasks with progress bars that update in real-time
- Clearly identify tasks that are "ready to act" (waiting for input)
- View the chat history and file changes for any task in a split view
- Press `v` to open VS Code in the task's git worktree from the task detail view
- Use consistent vim-style keybindings throughout the application
- Switch themes via `:theme <name>` with retro Matrix theme as default
- Customize themes via config files

**Data & Integration**

- Run metadata persists in SQLite, chat history retrieved from Claude API
- Re-open the application and continue where you left off
- Query historical runs via stored conversation IDs
- Leverage Claude Agent SDK for all agent orchestration