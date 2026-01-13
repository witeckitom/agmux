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

// Enter alternate screen buffer for fullscreen app
const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';

// Clear scrollback buffer and screen, then enter alternate screen
// \x1b[3J - Clear scrollback buffer (works on most modern terminals)
// \x1b[2J - Clear entire screen
// \x1b[H - Move cursor to top-left
// \x1b[?1049h - Enter alternate screen buffer
process.stdout.write('\x1b[3J\x1b[2J\x1b[H' + enterAltScreenCommand);

// Also clear stderr to prevent any error messages from appearing in scrollback
process.stderr.write('\x1b[3J\x1b[2J\x1b[H');

process.on('exit', () => {
  process.stdout.write(leaveAltScreenCommand);
});

const database = new DatabaseManager(dbPath);

render(<App database={database} projectRoot={projectRoot} />);
