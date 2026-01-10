# Agent Orchestration TUI

A local, terminal-based orchestration interface for managing, running, and observing multiple AI agents concurrently.

Built with React Ink (TypeScript/React) for a modern, testable CLI experience.

Inspired by [k9s](https://k9scli.io/) and designed for developers using local AI agents (Claude, Codex, Cursor, etc.).

## Features

- 🎯 **Vim-style navigation** - Keyboard-driven workflows
- 📊 **Pane-based UI** - Resource lists and detail views
- ⚡ **Parallel execution** - Run multiple agents concurrently
- 🔒 **Git worktree isolation** - Each run executes in its own isolated worktree
- 📈 **Real-time observability** - Progress tracking, logs, and interactive conversations
- 🎨 **Customizable themes** - Matrix retro theme included
- 🧪 **Fully testable** - Unit tests and E2E tests for reliable development

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm run dev
# or
npm start
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run E2E tests only
npm run test:e2e

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Project Structure

```
agent-orch/
├── src/
│   ├── app/           # Main application components
│   ├── components/     # Reusable UI components
│   ├── db/            # Database layer (SQLite)
│   ├── models/        # TypeScript types and models
│   └── test-utils/    # Testing utilities
├── e2e/               # End-to-end tests
├── dist/              # Compiled output
└── prd.md            # Product Requirements Document
```

## Testing Strategy

### Unit Tests
- Located in `src/**/*.test.ts` and `src/**/*.test.tsx`
- Test individual functions, components, and utilities in isolation
- Use Vitest for fast, reliable unit testing

### E2E Tests
- Located in `e2e/**/*.e2e.test.tsx`
- Test complete user flows and component integration
- Use `ink-testing-library` for React Ink component testing
- Verify database interactions and state management

### Example Test Commands

```bash
# Test database layer
npm test src/db/database.test.ts

# Test a specific component
npm test src/components/TopBar.test.tsx

# Run E2E tests
npm test e2e/app.e2e.test.tsx
```

## Technology Stack

- **React Ink** - React for CLI applications
- **TypeScript** - Type-safe development
- **Vitest** - Fast unit and integration testing
- **better-sqlite3** - SQLite database
- **ink-testing-library** - Testing utilities for React Ink

## Requirements

- Node.js >= 18.0.0
- npm or yarn

## See Also

See [prd.md](./prd.md) for detailed product requirements and specifications.
