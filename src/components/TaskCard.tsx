import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Run } from '../models/types.js';
import { Spinner } from './Spinner.js';
import { useApp } from '../context/AppContext.js';
import { loadSkills, getSkillById } from '../utils/skillsLoader.js';

interface TaskCardProps {
  run: Run;
  selected?: boolean;
  width?: number;
}

function formatPhase(phase: Run['phase']): string {
  const phaseMap: Record<Run['phase'], string> = {
    worktree_creation: 'Creating worktree',
    setup_hooks: 'Setup hooks',
    agent_execution: 'Agent running',
    cleanup_hooks: 'Cleanup',
    finalization: 'Finalizing',
  };
  return phaseMap[phase] || phase;
}

function renderProgressBar(percent: number, width: number): string {
  const barWidth = Math.max(10, width - 2); // Minimum 10 chars
  const filled = Math.floor((percent / 100) * barWidth);
  const empty = barWidth - filled;
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
}


function formatDuration(ms: number, showSeconds: boolean = false): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    if (showSeconds) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${minutes} min`;
  }
  if (showSeconds) {
    return `${seconds}s`;
  }
  return '< 1 min';
}

// Isolated timer component - only this component re-renders on interval,
// not the entire TaskCard. This prevents screen flashing.
function IsolatedCardTimer({ startTime, showSeconds = false }: { startTime: Date; showSeconds?: boolean }) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    // Update every minute since we only show minutes on kanban cards
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  
  const elapsed = now - startTime.getTime();
  return <Text>{formatDuration(elapsed, showSeconds)}</Text>;
}

export const TaskCard = React.memo(function TaskCard({ run, selected = false, width = 45 }: TaskCardProps) {
  const { state } = useApp();
  const [skillName, setSkillName] = useState<string | null>(null);

  // Load skill name if skillId is present
  useEffect(() => {
    if (run.skillId) {
      try {
        const skills = loadSkills(state.projectRoot);
        const skill = getSkillById(skills, run.skillId);
        setSkillName(skill?.name || null);
      } catch {
        setSkillName(null);
      }
    } else {
      setSkillName(null);
    }
  }, [run.skillId, state.projectRoot]);

  // Use name if available, otherwise fall back to prompt
  const displayText = run.name || run.prompt || 'Untitled Task';
  const maxDisplayLength = Math.max(10, width - 4);
  const truncatedDisplay =
    displayText.length > maxDisplayLength
      ? displayText.slice(0, maxDisplayLength - 3) + '...'
      : displayText;

  // Calculate progress bar width: account for padding (2), percentage (~5 chars), spinner (1 char), margins (2)
  // Use flexbox to auto-fit, but ensure minimum width
  const progressBarWidth = Math.max(12, width - 12); // Account for percentage, spinner, and spacing
  const progressBar = renderProgressBar(run.progressPercent, progressBarWidth);

  const isRunning = run.status === 'running';
  const isCompleted = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const showCompletedDuration = isCompleted && run.durationMs && run.durationMs > 0;

  return (
    <Box
      width={width}
      minHeight={8}
      borderStyle="single"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      borderColor={selected ? 'cyan' : 'gray'}
      justifyContent="space-between"
    >
      {/* Top content */}
      <Box flexDirection="column">
        {/* First row: Name (left) | Agent (right) */}
        <Box marginBottom={0} height={1} flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexGrow={1}>
            <Text bold color={selected ? 'cyan' : 'white'}>
              {truncatedDisplay}
            </Text>
          </Box>
          {(run.agentProfileId === 'claude' || run.agentProfileId === 'cursor') && (
            <Box marginLeft={1}>
              <Text color="green">
                {run.agentProfileId.charAt(0).toUpperCase() + run.agentProfileId.slice(1)}
              </Text>
            </Box>
          )}
        </Box>
        {/* Second row: Tasks info (left) | Persona (right) */}
        <Box marginTop={0} height={1} flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexGrow={1}>
            <Text dimColor>
              {run.completedSubtasks}/{run.totalSubtasks} tasks
              {run.readyToAct && ' | ⚠'}
              {run.status === 'running' && (
                <>
                  {' | '}
                  <IsolatedCardTimer startTime={run.createdAt} showSeconds={false} />
                </>
              )}
              {showCompletedDuration && (
                <>
                  {' | '}
                  <Text>{formatDuration(run.durationMs!, true)}</Text>
                </>
              )}
            </Text>
          </Box>
          {skillName && (
            <Box marginLeft={1}>
              <Text color="yellow">
                {skillName}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
      {/* Progress bar at bottom - always at bottom using flexbox */}
      {isRunning && (
        <Box marginTop={0} marginBottom={1} height={1} flexDirection="row" alignItems="center" width="100%">
          {/* Spinner on left - fixed width */}
          <Box marginRight={1} flexShrink={0}>
            <Text bold>
              <Spinner 
                active={isRunning}
              />
            </Text>
          </Box>
          {/* Progress bar - grows to fill available space */}
          <Box flexGrow={1} marginRight={1}>
            <Text>
              {progressBar}
            </Text>
          </Box>
          {/* Percentage on right - fixed width */}
          <Box flexShrink={0}>
            <Text bold color="cyan">
              {run.progressPercent}%
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if run data actually changed or selection changed
  return (
    prevProps.run.id === nextProps.run.id &&
    prevProps.run.status === nextProps.run.status &&
    prevProps.run.progressPercent === nextProps.run.progressPercent &&
    prevProps.run.phase === nextProps.run.phase &&
    prevProps.run.readyToAct === nextProps.run.readyToAct &&
    prevProps.run.durationMs === nextProps.run.durationMs &&
    prevProps.run.skillId === nextProps.run.skillId &&
    prevProps.run.name === nextProps.run.name &&
    prevProps.run.agentProfileId === nextProps.run.agentProfileId &&
    prevProps.selected === nextProps.selected &&
    prevProps.width === nextProps.width
  );
});
