# Testing Guide

This project uses a comprehensive testing strategy to ensure reliability and provide feedback loops for AI-assisted development.

## Test Structure

### Unit Tests (`src/**/*.test.ts`, `src/**/*.test.tsx`)

Unit tests focus on testing individual functions, components, and utilities in isolation.

**Example: Database Layer**
```typescript
// src/db/database.test.ts
describe('DatabaseManager', () => {
  it('should create a new run', () => {
    const run = db.createRun({...});
    expect(run.id).toBeDefined();
  });
});
```

**Example: Component Testing**
```typescript
// src/components/TopBar.test.tsx
describe('TopBar', () => {
  it('should display project info', () => {
    const { lastFrame } = render(
      <TopBar projectRoot="/path/to/project" />
    );
    expect(lastFrame()).toContain('Project:');
  });
});
```

### E2E Tests (`e2e/**/*.e2e.test.tsx`)

End-to-end tests verify complete user flows and component integration. These are especially useful for AI feedback loops.

**Example: Full App Flow**
```typescript
// e2e/app.e2e.test.tsx
describe('App E2E', () => {
  it('should display runs when they exist', () => {
    db.createRun({...});
    const { lastFrame } = render(<App database={db} />);
    expect(lastFrame()).toContain('running');
  });
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only E2E tests
npm run test:e2e

# Watch mode (re-runs on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Verify setup
npm run test:setup
```

## Using Tests for AI Feedback Loops

### For AI Assistants

When implementing features, use the test suite to verify correctness:

1. **Write tests first** (TDD approach)
   - Define expected behavior in tests
   - Implement feature to pass tests
   - Refactor while keeping tests green

2. **Run tests after changes**
   ```bash
   npm test
   ```
   - Unit tests verify individual components work
   - E2E tests verify integration works

3. **Use test output for feedback**
   - ✅ Green tests = feature works correctly
   - ❌ Red tests = identify what broke
   - Coverage reports show untested code paths

### Example Workflow

```bash
# 1. Make a change to a component
# Edit src/components/TaskList.tsx

# 2. Run tests to see current state
npm test

# 3. If tests fail, read error messages
# Fix issues based on test output

# 4. Re-run tests until all pass
npm test

# 5. Check coverage
npm run test:coverage
```

## Test Utilities

### `createMockRun()`

Helper function to create mock Run objects for testing:

```typescript
import { createMockRun } from '../src/test-utils';

const run = createMockRun({
  status: 'running',
  progressPercent: 50,
});
```

### `ink-testing-library`

For testing React Ink components:

```typescript
import { render } from 'ink-testing-library';

const { lastFrame, rerender } = render(<MyComponent />);
expect(lastFrame()).toContain('expected text');
```

## Best Practices

1. **Test behavior, not implementation**
   - Focus on what the code does, not how
   - Tests should survive refactoring

2. **Keep tests isolated**
   - Each test should be independent
   - Use `beforeEach`/`afterEach` for setup/cleanup

3. **Use descriptive test names**
   - `it('should create a run with all required fields')`
   - Not: `it('works')`

4. **Test edge cases**
   - Empty states
   - Error conditions
   - Boundary values

5. **Keep E2E tests focused**
   - Test complete user flows
   - Don't duplicate unit test coverage
   - Use E2E for integration verification

## Continuous Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- run: npm install
- run: npm run test:unit
- run: npm run test:e2e
- run: npm run test:coverage
```

## Debugging Tests

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### Run Specific Test

```bash
npm test -- src/db/database.test.ts
npm test -- -t "should create a new run"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/vitest
```

## Coverage Goals

- **Unit Tests**: Aim for >80% coverage of business logic
- **E2E Tests**: Cover all major user flows
- **Critical Paths**: 100% coverage (database, core components)
