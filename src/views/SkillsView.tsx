import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useApp } from '../context/AppContext.js';
import { loadSkills, Skill } from '../utils/skillsLoader.js';
import { logger } from '../utils/logger.js';

// Helper function to wrap text into lines
function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    
    let remaining = paragraph;
    while (remaining.length > 0) {
      if (remaining.length <= width) {
        lines.push(remaining);
        break;
      }
      
      // Try to break at a space
      let breakPoint = width;
      const lastSpace = remaining.lastIndexOf(' ', width);
      if (lastSpace > width * 0.7) { // Only break at space if it's not too early
        breakPoint = lastSpace;
      }
      
      lines.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trimStart();
    }
  }
  
  return lines;
}

export function SkillsView() {
  const { state } = useApp();
  const { stdout } = useStdout();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contentScrollOffset, setContentScrollOffset] = useState(0);

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

  const selectedSkill = skills[selectedIndex];
  const maxListWidth = 40;

  // Reset scroll when skill changes
  useEffect(() => {
    setContentScrollOffset(0);
  }, [selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      // Could navigate back, but for now just handle escape
      return;
    }

    // Content scrolling (when content is long)
    if (selectedSkill) {
      const terminalWidth = stdout?.columns || 80;
      const contentWidth = terminalWidth - maxListWidth - 6; // Account for borders and padding
      const contentLines = wrapText(selectedSkill.content, contentWidth);
      const terminalHeight = stdout?.rows || 24;
      // Reserve: TopBar(6) + padding(2) + header(1) + footer(1) = 10
      const availableHeight = terminalHeight - 10;
      const maxScroll = Math.max(0, contentLines.length - availableHeight);

      if (key.pageDown || (key.shift && (input === 'j' || key.downArrow))) {
        setContentScrollOffset(prev => Math.min(maxScroll, prev + Math.floor(availableHeight / 2)));
        return;
      }
      if (key.pageUp || (key.shift && (input === 'k' || key.upArrow))) {
        setContentScrollOffset(prev => Math.max(0, prev - Math.floor(availableHeight / 2)));
        return;
      }
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

  // Calculate visible content lines
  const visibleContentLines = useMemo(() => {
    if (!selectedSkill) return [];
    
    const terminalWidth = stdout?.columns || 80;
    const terminalHeight = stdout?.rows || 24;
    const contentWidth = terminalWidth - maxListWidth - 6; // Account for borders and padding
    const contentLines = wrapText(selectedSkill.content, contentWidth);
    
    // Reserve: TopBar(6) + padding(2) + header(1) + footer(1) = 10
    const availableHeight = Math.max(1, terminalHeight - 10);
    
    const start = contentScrollOffset;
    const end = Math.min(contentLines.length, start + availableHeight);
    
    return contentLines.slice(start, end);
  }, [selectedSkill, contentScrollOffset, stdout?.columns, stdout?.rows]);

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
      <Box flexDirection="column" flexGrow={1} minWidth={0} borderStyle="single" borderColor="cyan" paddingX={1} marginLeft={1}>
        {selectedSkill ? (
          <>
            <Box marginBottom={1}>
              <Text bold color="cyan">{selectedSkill.name}</Text>
              <Text dimColor> ({selectedSkill.source})</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} minWidth={0} width="100%">
              {visibleContentLines.map((line, index) => (
                <Text key={index} wrap="wrap">{line || ' '}</Text>
              ))}
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
