import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../context/AppContext.js';
import { loadSkills, Skill } from '../utils/skillsLoader.js';
import { logger } from '../utils/logger.js';

export function SkillsView() {
  const { state } = useApp();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSkillsList = () => {
      try {
        setLoading(true);
        const loadedSkills = loadSkills(state.projectRoot);
        setSkills(loadedSkills);
        logger.info(`Loaded ${loadedSkills.length} skills`, 'SkillsView');
      } catch (error) {
        logger.error('Failed to load skills', 'SkillsView', { error });
      } finally {
        setLoading(false);
      }
    };

    loadSkillsList();
  }, [state.projectRoot]);

  useInput((input, key) => {
    if (key.escape) {
      // Could navigate back, but for now just handle escape
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(skills.length - 1, prev + 1));
      return;
    }

    // Jump to top/bottom
    if (input === 'g' && !key.shift) {
      setSelectedIndex(0);
      return;
    }

    if (input === 'G' || (input === 'g' && key.shift)) {
      setSelectedIndex(skills.length - 1);
      return;
    }
  });

  const selectedSkill = skills[selectedIndex];
  const maxListWidth = 40;
  const contentWidth = 60;

  if (loading) {
    return (
      <Box padding={2}>
        <Text>Loading skills...</Text>
      </Box>
    );
  }

  if (skills.length === 0) {
    return (
      <Box padding={2} flexDirection="column">
        <Text bold>Skills View</Text>
        <Text dimColor>No skills found.</Text>
        <Text dimColor>Skills should be placed in:</Text>
        <Text dimColor>  - ~/.claude/skills (global)</Text>
        <Text dimColor>  - ./claude/skills (local)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" padding={1} flexGrow={1}>
      {/* Skills List */}
      <Box flexDirection="column" width={maxListWidth} borderStyle="single" borderColor="gray" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Skills ({skills.length})</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {skills.map((skill, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={skill.id} marginBottom={0} paddingX={1}>
                <Text>
                  {isSelected ? (
                    <Text color="cyan">{'> '}</Text>
                  ) : (
                    <Text>{'  '}</Text>
                  )}
                  <Text
                    bold={isSelected}
                    color={isSelected ? 'cyan' : skill.source === 'local' ? 'white' : 'gray'}
                  >
                    {skill.name}
                  </Text>
                  {skill.source === 'local' && (
                    <Text dimColor> (local)</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            <Text bold>Navigation:</Text> ↑↓ or j/k to navigate, g/G to jump to top/bottom
          </Text>
        </Box>
      </Box>

      {/* Skill Content */}
      <Box flexDirection="column" width={contentWidth} borderStyle="single" borderColor="cyan" paddingX={1} marginLeft={1}>
        {selectedSkill ? (
          <>
            <Box marginBottom={1}>
              <Text bold color="cyan">{selectedSkill.name}</Text>
              <Text dimColor> ({selectedSkill.source})</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <Text wrap="wrap">{selectedSkill.content}</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Path: {selectedSkill.path}</Text>
            </Box>
          </>
        ) : (
          <Text dimColor>Select a skill to view its content</Text>
        )}
      </Box>
    </Box>
  );
}
