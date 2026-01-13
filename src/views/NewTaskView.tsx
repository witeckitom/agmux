import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/AppContext.js';
import { useSettings } from '../context/SettingsContext.js';
import { useInput } from 'ink';
import { logger } from '../utils/logger.js';
import { MultiLineTextInput } from '../components/MultiLineTextInput.js';
import { loadSkills, Skill } from '../utils/skillsLoader.js';
import { removeWorktree } from '../utils/gitWorktree.js';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { AgentType } from '../models/types.js';

type Field = 'name' | 'prompt' | 'skill' | 'agent' | 'autoRun' | 'submit';
type AgentOption = 'claude' | 'cursor' | 'both';

export function NewTaskView() {
  const { database, setCurrentView, refreshRuns, state, taskExecutor } = useApp();
  const { settings } = useSettings();
  const [currentField, setCurrentField] = useState<Field>('name');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentOption>(settings.agent === 'claude' || settings.agent === 'cursor' ? settings.agent : 'claude');
  const [autoRun, setAutoRun] = useState(false);
  const agents: AgentOption[] = ['claude', 'cursor', 'both'];
  const selectedAgentIndex = agents.indexOf(selectedAgent);

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
    // Sync selected agent with global setting (only if it's a valid single agent)
    if (settings.agent === 'claude' || settings.agent === 'cursor') {
      setSelectedAgent(settings.agent);
    }
  }, [state.projectRoot, settings.agent]);

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
    if (key.tab && !key.shift) {
      const fields: Field[] = ['name', 'prompt', 'skill', 'agent', 'autoRun', 'submit'];
      const currentIndex = fields.indexOf(currentField);
      const nextIndex = (currentIndex + 1) % fields.length;
      setCurrentField(fields[nextIndex]);
      return;
    }

    if (key.shift && key.tab) {
      const fields: Field[] = ['name', 'prompt', 'skill', 'agent', 'autoRun', 'submit'];
      const currentIndex = fields.indexOf(currentField);
      const prevIndex = (currentIndex - 1 + fields.length) % fields.length;
      setCurrentField(fields[prevIndex]);
      return;
    }

    // Auto-run toggle (only when autoRun field is active)
    if (currentField === 'autoRun') {
      if (key.return || input === ' ' || input === 'x') {
        setAutoRun(prev => !prev);
        return;
      }
    }

    // Agent selection (only when agent field is active)
    if (currentField === 'agent') {
      if (key.upArrow || input === 'k') {
        setSelectedAgent(agents[Math.max(0, selectedAgentIndex - 1)]);
        return;
      }
      if (key.downArrow || input === 'j') {
        setSelectedAgent(agents[Math.min(agents.length - 1, selectedAgentIndex + 1)]);
        return;
      }
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

    // Submit (Enter when on submit button)
    if (key.return && currentField === 'submit') {
      if (canSubmit()) {
        createTask().catch((error) => {
          logger.error('Error creating task', 'NewTaskView', { error });
        });
      }
      return;
    }
  });

  const canSubmit = (): boolean => {
    return name.trim().length > 0 && prompt.trim().length > 0;
  };

  const createTask = async () => {
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

      // Create run(s) - if "both" is selected, create two tasks
      const agentsToCreate: AgentType[] = selectedAgent === 'both' 
        ? ['claude', 'cursor'] 
        : [selectedAgent as AgentType];

      const createdRuns = [];
      for (const agent of agentsToCreate) {
        const runName = agentsToCreate.length > 1 
          ? `${taskName} (${agent})`
          : taskName;

        const run = database.createRun({
          name: runName,
          status: 'queued',
          phase: 'worktree_creation',
          worktreePath: '', // Empty until worktree is created
          baseBranch: 'main',
          agentProfileId: agent,
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

        createdRuns.push(run);

        logger.info('Task created successfully', 'NewTaskView', {
          runId: run.id,
          name: runName,
          prompt: taskPrompt,
          agent,
          skillId: selectedSkill?.id || null,
          status: run.status,
        });

        // Auto-start if enabled
        if (autoRun) {
          try {
            await taskExecutor.startTask(run.id);
            logger.info(`Auto-started task: ${run.id}`, 'NewTaskView');
          } catch (error) {
            logger.error(`Failed to auto-start task ${run.id}`, 'NewTaskView', { error });
          }
        }
      }

      // Refresh the runs list to show the new task(s)
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
                // Move to next field
                setCurrentField('skill');
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
            <Box paddingX={1} flexDirection="column" height={10} borderStyle="single" borderColor={currentField === 'skill' ? 'cyan' : 'gray'}>
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

        {/* Agent Field */}
        <Box marginBottom={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text>
              <Text bold color={currentField === 'agent' ? 'cyan' : 'white'}>
                Agent:
              </Text>
            </Text>
          </Box>
          <Box paddingX={1} flexDirection="column" borderStyle="single" borderColor={currentField === 'agent' ? 'cyan' : 'gray'}>
            {agents.map((agent, index) => {
              const isSelected = index === selectedAgentIndex;
              const isCurrent = currentField === 'agent';
              
              return (
                <Box key={agent} marginBottom={0} paddingX={1}>
                  <Text>
                    {isSelected && isCurrent ? (
                      <Text color="cyan">{'> '}</Text>
                    ) : (
                      <Text>{'  '}</Text>
                    )}
                    {isSelected ? (
                      <Text bold color={isCurrent ? 'cyan' : 'white'}>
                        {agent.charAt(0).toUpperCase() + agent.slice(1)}
                        {agent === 'both' && (
                          <Text dimColor> (runs with each agent to compare results)</Text>
                        )}
                      </Text>
                    ) : (
                      <Text color="gray">
                        {agent.charAt(0).toUpperCase() + agent.slice(1)}
                        {agent === 'both' && (
                          <Text dimColor> (runs with each agent to compare results)</Text>
                        )}
                      </Text>
                    )}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Auto-Run Field */}
        <Box marginBottom={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text>
              <Text bold color={currentField === 'autoRun' ? 'cyan' : 'white'}>
                Auto-Run:
              </Text>
            </Text>
          </Box>
          <Box 
            paddingX={1} 
            borderStyle="single" 
            borderColor={currentField === 'autoRun' ? 'cyan' : 'gray'}
            justifyContent="flex-start"
          >
            <Text>
              {currentField === 'autoRun' ? (
                <Text color="cyan">
                  [{autoRun ? 'x' : ' '}] Auto-start task when created
                </Text>
              ) : (
                <Text color={autoRun ? 'green' : 'gray'}>
                  [{autoRun ? 'x' : ' '}] Auto-start task when created
                </Text>
              )}
            </Text>
          </Box>
        </Box>

        {/* Submit Button */}
        <Box marginTop={1} marginBottom={1}>
          <Box 
            paddingX={2} 
            paddingY={1} 
            borderStyle="single" 
            borderColor={currentField === 'submit' ? 'cyan' : canSubmit() ? 'green' : 'gray'}
            justifyContent="center"
          >
            <Text>
              {currentField === 'submit' ? (
                <Text bold color="cyan">
                  Submit Task
                </Text>
              ) : (
                <Text color={canSubmit() ? 'green' : 'gray'}>
                  Submit Task
                </Text>
              )}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
            <Text dimColor>
            <Text bold>Navigation:</Text> Tab to move forward, Shift+Tab to move backward, ↑↓ or j/k to select skill/agent, Space/Enter to toggle auto-run, Enter on submit button to create task, Esc to cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
