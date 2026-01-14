# agmux - Agent Multiplexer TUI

A local, terminal-based orchestration interface for managing, running, and observing multiple AI agents concurrently.

Built with React Ink (TypeScript/React) for a modern CLI experience.

Inspired by [k9s](https://k9scli.io/) and designed for developers using local AI agents (Claude, Codex, Cursor, etc.).

![Main Interface](./docs/images/main-interface.png)

## Features

- **Vim-style navigation** - Keyboard-driven workflows
- **Pane-based UI** - Resource lists and detail views
- **Parallel execution** - Run multiple agents concurrently
- **Git worktree isolation** - Each run executes in its own isolated worktree
- **Real-time observability** - Progress tracking, logs, and interactive conversations
- **Customizable themes** - Matrix retro theme included

![Task List View](./docs/images/task-list.png)

## Installation

```bash
npm install -g agmux
```

## Usage

Navigate to a git repository where you want to run AI agents, then:

```bash
agmux
```

![Agent Running](./docs/images/agent-running.png)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j/k` | Navigate up/down |
| `Enter` | Select/Open |
| `Esc` | Back/Cancel |
| `q` | Quit |
| `?` | Help |

![Detail View](./docs/images/detail-view.png)

## MCP Server

When running, the application exposes an MCP server at `http://localhost:3000/mcp` that allows AI assistants to manage tasks and skills.

### Adding to Claude Code

```bash
claude mcp add --transport http amux http://localhost:3000/mcp
```

### Available Tools

- `list_tasks` - Get all tasks
- `get_task` - Get a specific task by run ID
- `create_task` - Create a new task
- `start_task` - Start a queued task
- `add_or_update_skill` - Add or update a skill

## Requirements

- Node.js >= 18.0.0
- Git (for worktree isolation)

## License

MIT
