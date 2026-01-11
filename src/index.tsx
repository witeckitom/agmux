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
// Enter alt screen, clear it, and move cursor to top-left
process.stdout.write(enterAltScreenCommand + '\x1b[2J\x1b[H');
process.on('exit', () => {
  process.stdout.write(leaveAltScreenCommand);
});

const database = new DatabaseManager(dbPath);

render(<App database={database} projectRoot={projectRoot} />);
