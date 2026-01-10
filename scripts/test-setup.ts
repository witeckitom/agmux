#!/usr/bin/env tsx

/**
 * Test script to verify the project setup is correct
 * Run with: npm run test:setup (add to package.json) or tsx scripts/test-setup.ts
 */

import { DatabaseManager } from '../src/db/database.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

const testDbPath = join(process.cwd(), 'test-setup.db');

console.log('🧪 Testing project setup...\n');

try {
  // Test database creation
  console.log('1. Testing database creation...');
  const db = new DatabaseManager(testDbPath);
  console.log('   ✅ Database created successfully');

  // Test run creation
  console.log('2. Testing run creation...');
  const run = db.createRun({
    status: 'queued',
    phase: 'worktree_creation',
    worktreePath: '/tmp/test',
    baseBranch: 'main',
    agentProfileId: 'test-profile',
    conversationId: null,
    skillId: null,
    prompt: 'Test setup run',
    progressPercent: 0,
    totalSubtasks: 0,
    completedSubtasks: 0,
    readyToAct: false,
    completedAt: null,
    retainWorktree: false,
  });
  console.log(`   ✅ Run created with ID: ${run.id}`);

  // Test run retrieval
  console.log('3. Testing run retrieval...');
  const retrieved = db.getRun(run.id);
  if (retrieved && retrieved.id === run.id) {
    console.log('   ✅ Run retrieved successfully');
  } else {
    throw new Error('Failed to retrieve run');
  }

  // Test preferences
  console.log('4. Testing preferences...');
  db.setPreference('test_key', 'test_value');
  const pref = db.getPreference('test_key');
  if (pref === 'test_value') {
    console.log('   ✅ Preferences working');
  } else {
    throw new Error('Preferences not working');
  }

  db.close();
  unlinkSync(testDbPath);

  console.log('\n✅ All setup tests passed!');
  console.log('\nNext steps:');
  console.log('  - Run unit tests: npm run test:unit');
  console.log('  - Run E2E tests: npm run test:e2e');
  console.log('  - Start dev server: npm run dev');
} catch (error) {
  console.error('\n❌ Setup test failed:', error);
  process.exit(1);
}
