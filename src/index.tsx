#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { App } from './app/App.js';
import { DatabaseManager } from './db/database.js';

const projectRoot = process.cwd();
const dbPath = join(homedir(), '.agent-orch', 'database.db');

// Ensure database directory exists
try {
  mkdirSync(join(homedir(), '.agent-orch'), { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Clear screen and move cursor to top-left (like k9s)
process.stdout.write('\x1b[2J\x1b[H');
process.stdout.write('\x1b[?1049h'); // Enable alternate screen buffer

const database = new DatabaseManager(dbPath);

const { waitUntilExit } = render(<App database={database} projectRoot={projectRoot} />);

// Cleanup on exit
waitUntilExit().then(() => {
  process.stdout.write('\x1b[?1049l'); // Disable alternate screen buffer
  process.stdout.write('\x1b[2J\x1b[H'); // Clear screen
}).catch(() => {
  process.stdout.write('\x1b[?1049l');
  process.stdout.write('\x1b[2J\x1b[H');
});
