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

// Let Ink handle screen management - don't manually clear/restore
// Ink will handle alternate screen buffer and cursor management
const database = new DatabaseManager(dbPath);

const { waitUntilExit } = render(<App database={database} projectRoot={projectRoot} />);

// Cleanup on exit - only restore terminal, don't clear (Ink handles it)
waitUntilExit().then(() => {
  // Ink handles cleanup, just exit
}).catch(() => {
  // Ink handles cleanup, just exit
});
