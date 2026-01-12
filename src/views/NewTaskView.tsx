import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { useInput } from 'ink';
import { logger } from '../utils/logger.js';
import { MultiLineTextInput } from '../components/MultiLineTextInput.js';
import { loadSkills, Skill } from '../utils/skillsLoader.js';
import { removeWorktree } from '../utils/gitWorktree.js';
import { resolve } from 'path';
import { existsSync } from 'fs';

type Field = 'name' | 'prompt' | 'skill';

export function NewTaskView() {
  const { database, setCurrentView, refreshRuns, state } = useApp();
  const [currentField, setCurrentField] = useState<Field>('name');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    logger.info('Entered new task creation view', 'NewTaskView');
    // Load skills
    try {
      const loadedSkills = loadSkills(state.projectRoot);
      setSkills(loadedSkills);
      logger.info(`Loaded ${loadedSkills.length} skills for task creation`, 'NewTaskView');
    } catch (error) {
      logger.error('Failed to load skills', 'NewTaskView', { error });
    }
  }, [state.projectRoot]);

  const selectedSkill = skills[selectedSkillIndex];

  useInput((input, key) => {
    if (key.escape) {
      // Cancel and go back to tasks view
      logger.info('Cancelled task creation', 'NewTaskView');
      setCurrentView('tasks');
      return;
    }

    // Handle name input
    if (currentField === 'name') {
      if (key.backspace || key.delete) {
        setName(prev => prev.slice(0, -1));
        return;
      }
      if (key.return) {
        // Move to prompt field
        setCurrentField('prompt');
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setName(prev => prev + input);
        return;
      }
    }

    // Navigation between fields
    if (key.tab) {
      const fields: Field[] = ['name', 'prompt', 'skill'];
      const currentIndex = fields.indexOf(currentField);
      const nextIndex = (currentIndex + 1) % fields.length;
      setCurrentField(fields[nextIndex]);
      return;
    }

    if (key.shift && key.tab) {
      const fields: Field[] = ['name', 'prompt', 'skill'];
      const currentIndex = fields.indexOf(currentField);
      const prevIndex = (currentIndex - 1 + fields.length) % fields.length;
      setCurrentField(fields[prevIndex]);
      return;
    }

    // Skill selection (only when skill field is active)
    if (currentField === 'skill') {
      if (key.upArrow || input === 'k') {
        setSelectedSkillIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setSelectedSkillIndex(prev => Math.min(skills.length - 1, prev + 1));
        return;
      }
    }

    // Submit (Ctrl+Enter or Enter when on skill field)
    if (key.return && (key.ctrl || currentField === 'skill')) {
      if (canSubmit()) {
        createTask();
      }
      return;
    }
  });

  const canSubmit = (): boolean => {
    return name.trim().length > 0 && prompt.trim().length > 0;
  };

  const createTask = () => {
    const taskName = name.trim();
    const taskPrompt = prompt.trim();
    
    if (!canSubmit()) {
      logger.warn('Cannot create task: name or prompt is empty', 'NewTaskView');
      return;
    }

    logger.info('Starting task creation', 'NewTaskView', { 
      name: taskName, 
      prompt: taskPrompt,
      skillId: selectedSkill?.id || null
    });

    try {
      // Create the full prompt with system instructions
      const systemPrompt = `You are an AI assistant helping with a development task. Your goal is to break down the work into a plan of tasks and execute them in order.

CRITICAL REQUIREMENT - PROGRESS JSON UPDATES:
The application controlling this agent requires progress updates in a specific JSON format to track your work. You MUST return this JSON format in your responses, NO MATTER WHAT THE QUERY IS, and ANYTIME you are thinking about or working on tasks.

The required JSON format is:
{
  "totalTasks": <number>,
  "completedTasks": <number>,
  "tasks": [
    {"id": 1, "description": "...", "status": "completed|in_progress|pending"}
  ]
}

You MUST include this JSON:
- When you create your initial plan (with all tasks as "pending")
- When you start working on a task (mark it as "in_progress")
- When you complete a task (mark it as "completed")
- When you add new tasks to your plan
- ANYTIME you are thinking about the task breakdown or progress
- In EVERY response where you mention tasks, planning, or progress
- Even if the user asks a simple question, include the current progress JSON

This is required for the application to understand your progress updates in chat responses. Without this JSON, the application cannot track your work properly.

The user's task is:
${taskPrompt}`;

      // Clear completed tasks before creating a new one (silently, without confirmation)
      const allRuns = database.getAllRuns();
      const completedRuns = allRuns.filter(r => 
        r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled'
      );
      
      if (completedRuns.length > 0) {
        logger.info(`Clearing ${completedRuns.length} completed task(s) before creating new task`, 'NewTaskView');
        
        const projectRoot = process.cwd();
        
        for (const completedRun of completedRuns) {
          // Delete worktree if it exists and task is not set to retain it
          if (completedRun.worktreePath && completedRun.worktreePath.trim() !== '' && !completedRun.retainWorktree) {
            try {
              let worktreePathForRemoval: string;
              
              if (completedRun.worktreePath.startsWith('/')) {
                const normalizedProjectRoot = projectRoot.replace(/\/$/, '');
                const normalizedWorktreePath = completedRun.worktreePath.replace(/\/$/, '');
                
                if (normalizedWorktreePath.startsWith(normalizedProjectRoot + '/')) {
                  worktreePathForRemoval = normalizedWorktreePath.substring(normalizedProjectRoot.length + 1);
                } else {
                  const worktreesMatch = normalizedWorktreePath.match(/\.worktrees\/[^/]+/);
                  if (worktreesMatch) {
                    worktreePathForRemoval = worktreesMatch[0];
                  } else {
                    worktreePathForRemoval = completedRun.worktreePath;
                  }
                }
              } else {
                worktreePathForRemoval = completedRun.worktreePath;
              }
              
              const absolutePath = resolve(projectRoot, worktreePathForRemoval);
              if (existsSync(absolutePath)) {
                removeWorktree(worktreePathForRemoval);
                logger.debug(`Removed worktree for completed task: ${completedRun.id}`, 'NewTaskView');
              }
            } catch (error: any) {
              logger.debug(`Failed to remove worktree for completed task ${completedRun.id}`, 'NewTaskView', { error });
            }
          }
          
          // Delete the run from database
          database.deleteRun(completedRun.id);
        }
        
        // Refresh runs after deletion
        refreshRuns();
      }

      // Create a new run/task
      const run = database.createRun({
        name: taskName,
        status: 'queued',
        phase: 'worktree_creation',
        worktreePath: '', // Empty until worktree is created
        baseBranch: 'main',
        agentProfileId: 'default', // Will use default agent from settings
        conversationId: null,
        skillId: selectedSkill?.id || null,
        prompt: systemPrompt, // Store the full prompt with system instructions
        progressPercent: 0,
        totalSubtasks: 0,
        completedSubtasks: 0,
        readyToAct: false,
        completedAt: null,
        durationMs: null,
        retainWorktree: false,
      });

      logger.info('Task created successfully', 'NewTaskView', {
        runId: run.id,
        name: taskName,
        prompt: taskPrompt,
        skillId: selectedSkill?.id || null,
        status: run.status,
      });

      // Refresh the runs list to show the new task
      refreshRuns();

      // Go back to tasks view
      setCurrentView('tasks');
    } catch (error) {
      logger.error('Failed to create task', 'NewTaskView', {
        error: error instanceof Error ? error.message : String(error),
        name: taskName,
        prompt: taskPrompt,
      });
    }
  };

  return (
    <Box flexDirection="column" padding={2} flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Create New Task</Text>
      </Box>
      
      <Box flexDirection="column" marginBottom={1}>
        {/* Name Field */}
        <Box marginBottom={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text>
              <Text bold color={currentField === 'name' ? 'cyan' : 'white'}>
                Name:
              </Text>
            </Text>
          </Box>
          <Box paddingX={1} borderStyle="single" borderColor={currentField === 'name' ? 'cyan' : 'gray'}>
            <Text color={currentField === 'name' ? 'cyan' : 'gray'}>
              {name || <Text dimColor>(Enter task name)</Text>}
              {currentField === 'name' && <Text color="cyan">█</Text>}
            </Text>
          </Box>
        </Box>

        {/* Prompt Field */}
        <Box marginBottom={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text>
              <Text bold color={currentField === 'prompt' ? 'cyan' : 'white'}>
                Prompt:
              </Text>
            </Text>
          </Box>
          {currentField === 'prompt' ? (
            <MultiLineTextInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={() => {
                // Move to next field or submit
                if (canSubmit()) {
                  createTask();
                } else {
                  setCurrentField('skill');
                }
              }}
              onCancel={() => setCurrentField('name')}
              placeholder="Enter your task prompt..."
              height={10}
            />
          ) : (
            <Box paddingX={1} minHeight={10} borderStyle="single" borderColor="gray">
              {prompt ? (
                <Text color="gray">{prompt.split('\n').slice(0, 10).join('\n')}</Text>
              ) : (
                <Text dimColor>(Click to edit prompt)</Text>
              )}
            </Box>
          )}
        </Box>

        {/* Skill Field */}
        <Box marginBottom={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text>
              <Text bold color={currentField === 'skill' ? 'cyan' : 'white'}>
                Skill:
              </Text>
            </Text>
          </Box>
          {skills.length === 0 ? (
            <Box paddingX={1}>
              <Text dimColor>(No skills available)</Text>
            </Box>
          ) : (
            <Box paddingX={1} flexDirection="column" maxHeight={10} borderStyle="single" borderColor={currentField === 'skill' ? 'cyan' : 'gray'}>
              {skills.map((skill, index) => {
                const isSelected = index === selectedSkillIndex;
                const isCurrent = currentField === 'skill';
                
                return (
                  <Box key={skill.id} marginBottom={0} paddingX={1}>
                    <Text>
                      {isSelected && isCurrent ? (
                        <Text color="cyan">{'> '}</Text>
                      ) : (
                        <Text>{'  '}</Text>
                      )}
                      {isSelected ? (
                        <Text bold color={isCurrent ? 'cyan' : 'white'}>
                          {skill.name}
                        </Text>
                      ) : (
                        <Text color="gray">
                          {skill.name}
                        </Text>
                      )}
                      {skill.source === 'local' && (
                        <Text dimColor> (local)</Text>
                      )}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            <Text bold>Navigation:</Text> Tab to move between fields, ↑↓ or j/k to select skill, Ctrl+Enter to submit, Esc to cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
