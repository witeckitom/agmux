import React, { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useSettings } from '../context/SettingsContext.js';
import { AgentType, ThemeType, EditorType } from '../models/types.js';
import { useApp } from '../context/AppContext.js';
import { useInput } from 'ink';
import { MultiLineTextInput } from '../components/MultiLineTextInput.js';

type SettingsSection = 'agent' | 'appearance' | 'editor' | 'git' | 'notifications' | 'project';

export function SettingsView() {
  const { settings, setAgent, setTheme, setEditor, setCustomEditorPath, setGitBranchPrefix, setPlaySounds } = useSettings();
  const { state, database } = useApp();
  const terminalWidth = useMemo(() => process.stdout.columns || 80, []);

  const [currentSection, setCurrentSection] = useState<SettingsSection>('agent');
  const [sectionFocus, setSectionFocus] = useState(true); // true = sections focused, false = options focused
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingCustomPath, setEditingCustomPath] = useState(false);
  const [editingBranchPrefix, setEditingBranchPrefix] = useState(false);
  const [editingRunCommand, setEditingRunCommand] = useState(false);
  const [customPathInput, setCustomPathInput] = useState(settings.customEditorPath);
  const [branchPrefixInput, setBranchPrefixInput] = useState(settings.gitBranchPrefix);
  const [runCommandInput, setRunCommandInput] = useState(database.getPreference('runCommand') || '');

  const sections: SettingsSection[] = ['agent', 'appearance', 'editor', 'git', 'notifications', 'project'];

  // Reset selected index when section changes
  React.useEffect(() => {
    setSelectedIndex(0);
    setEditingCustomPath(false);
    setEditingBranchPrefix(false);
    setEditingRunCommand(false);
    setSectionFocus(true); // Return to section focus when changing sections
  }, [currentSection]);

  // Update input values when settings change
  React.useEffect(() => {
    setCustomPathInput(settings.customEditorPath);
    setBranchPrefixInput(settings.gitBranchPrefix);
    setRunCommandInput(database.getPreference('runCommand') || '');
  }, [settings.customEditorPath, settings.gitBranchPrefix, database]);

  useInput((input, key) => {
    // Escape always returns to section focus or cancels editing
    if (key.escape) {
      if (editingCustomPath || editingBranchPrefix) {
        setEditingCustomPath(false);
        setEditingBranchPrefix(false);
        setCustomPathInput(settings.customEditorPath);
        setBranchPrefixInput(settings.gitBranchPrefix);
        return;
      }
      if (!sectionFocus) {
        setSectionFocus(true);
        return;
      }
      return;
    }

    // Section navigation (when sections are focused)
    if (sectionFocus && !editingCustomPath && !editingBranchPrefix && !editingRunCommand) {
      if (key.upArrow || input === 'k') {
        const currentIdx = sections.indexOf(currentSection);
        if (currentIdx > 0) {
          setCurrentSection(sections[currentIdx - 1]);
        }
        return;
      }

      if (key.downArrow || input === 'j') {
        const currentIdx = sections.indexOf(currentSection);
        if (currentIdx < sections.length - 1) {
          setCurrentSection(sections[currentIdx + 1]);
        }
        return;
      }

      if (key.return) {
        // Enter on section focuses the options
        setSectionFocus(false);
        setSelectedIndex(0);
        return;
      }
      return;
    }

    // Option navigation (when options are focused)
    if (!sectionFocus && !editingCustomPath && !editingBranchPrefix && !editingRunCommand) {
      if (currentSection === 'agent') {
        const agentOptions: AgentType[] = ['claude', 'cursor'];
        
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(agentOptions.length - 1, prev + 1));
          return;
        }

        if (key.return) {
          const selectedAgent = agentOptions[selectedIndex];
          if (selectedAgent) {
            setAgent(selectedAgent);
          }
          return;
        }
      }

      if (currentSection === 'appearance') {
        const themeOptions: ThemeType[] = ['default', 'matrix'];
        
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(themeOptions.length - 1, prev + 1));
          return;
        }

        if (key.return) {
          const selectedTheme = themeOptions[selectedIndex];
          if (selectedTheme) {
            setTheme(selectedTheme);
          }
          return;
        }
      }

      if (currentSection === 'editor') {
        const editorOptions: EditorType[] = ['vscode', 'custom'];
        
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(editorOptions.length - 1, prev + 1));
          return;
        }

        if (key.return) {
          if (selectedIndex === 0) {
            setEditor('vscode');
          } else {
            setEditor('custom');
            setEditingCustomPath(true);
            setCustomPathInput(settings.customEditorPath);
          }
          return;
        }
      }

      if (currentSection === 'git') {
        if (key.return) {
          setEditingBranchPrefix(true);
          setBranchPrefixInput(settings.gitBranchPrefix);
          return;
        }
      }

      if (currentSection === 'notifications') {
        if (key.return || input === ' ' || input === 't' || input === 'T') {
          setPlaySounds(!settings.playSounds);
          return;
        }
      }

      if (currentSection === 'project') {
        if (key.return) {
          setEditingRunCommand(true);
          setRunCommandInput(database.getPreference('runCommand') || '');
          return;
        }
      }
    }

    // Text input handling
    if (editingCustomPath) {
      if (key.backspace || key.delete) {
        setCustomPathInput(prev => prev.slice(0, -1));
        return;
      }

      if (key.return) {
        setCustomEditorPath(customPathInput);
        setEditingCustomPath(false);
        return;
      }

      if (input && input.length === 1) {
        setCustomPathInput(prev => prev + input);
        return;
      }
    }

    if (editingBranchPrefix) {
      if (key.backspace || key.delete) {
        setBranchPrefixInput(prev => prev.slice(0, -1));
        return;
      }

      if (key.return) {
        setGitBranchPrefix(branchPrefixInput);
        setEditingBranchPrefix(false);
        return;
      }

      if (input && input.length > 0) {
        setBranchPrefixInput(prev => prev + input);
        return;
      }
    }

  }, { isActive: !editingRunCommand });

  const renderSection = () => {
    switch (currentSection) {
      case 'agent':
        return renderAgentSection();
      case 'appearance':
        return renderAppearanceSection();
      case 'editor':
        return renderEditorSection();
      case 'git':
        return renderGitSection();
      case 'notifications':
        return renderNotificationsSection();
      case 'project':
        return renderProjectSection();
    }
  };

  const renderAgentSection = () => {
    const agentOptions: AgentType[] = ['claude', 'cursor'];
    
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Agent</Text>
          <Text dimColor> - Select the AI agent to use</Text>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {agentOptions.map((agent, index) => {
            const isSelected = !sectionFocus && index === selectedIndex;
            const isCurrent = agent === settings.agent;
            
            return (
              <Box key={agent} marginBottom={0} paddingX={1}>
                <Text>
                  {isSelected ? (
                    <Text color="cyan" bold>{'▶ '}</Text>
                  ) : (
                    <Text>{'  '}</Text>
                  )}
                  {isCurrent ? (
                    <Text bold color="green">
                      {agent.charAt(0).toUpperCase() + agent.slice(1)}
                    </Text>
                  ) : (
                    <Text>{agent.charAt(0).toUpperCase() + agent.slice(1)}</Text>
                  )}
                  {isCurrent && (
                    <Text dimColor> (current)</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to select options</Text>
          </Box>
        )}
        {!sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Use ↑/↓ or j/k to navigate, Enter to select, Esc to return</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderAppearanceSection = () => {
    const themeOptions: ThemeType[] = ['default', 'matrix'];
    
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Theme</Text>
          <Text dimColor> - Choose your visual theme</Text>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {themeOptions.map((theme, index) => {
            const isSelected = !sectionFocus && index === selectedIndex;
            const isCurrent = theme === settings.theme;
            
            return (
              <Box key={theme} marginBottom={0} paddingX={1}>
                <Text>
                  {isSelected ? (
                    <Text color="cyan" bold>{'▶ '}</Text>
                  ) : (
                    <Text>{'  '}</Text>
                  )}
                  {isCurrent ? (
                    <Text bold color="green">
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </Text>
                  ) : (
                    <Text>{theme.charAt(0).toUpperCase() + theme.slice(1)}</Text>
                  )}
                  {isCurrent && (
                    <Text dimColor> (current)</Text>
                  )}
                  {theme === 'matrix' && (
                    <Text dimColor> - Matrix green style</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to select options</Text>
          </Box>
        )}
        {!sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Use ↑/↓ or j/k to navigate, Enter to select, Esc to return</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderEditorSection = () => {
    const editorOptions: EditorType[] = ['vscode', 'custom'];
    
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Editor</Text>
          <Text dimColor> - Configure your code editor</Text>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          {editorOptions.map((editor, index) => {
            const isSelected = !sectionFocus && index === selectedIndex;
            const isCurrent = editor === settings.editor;
            
            return (
              <Box key={editor} marginBottom={0} paddingX={1}>
                <Text>
                  {isSelected ? (
                    <Text color="cyan" bold>{'▶ '}</Text>
                  ) : (
                    <Text>{'  '}</Text>
                  )}
                  {isCurrent ? (
                    <Text bold color="green">
                      {editor === 'vscode' ? 'VS Code' : 'Custom'}
                    </Text>
                  ) : (
                    <Text>{editor === 'vscode' ? 'VS Code' : 'Custom'}</Text>
                  )}
                  {isCurrent && (
                    <Text dimColor> (current)</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
        {settings.editor === 'custom' && (
          <Box marginTop={1} paddingX={1} flexDirection="column">
            <Box marginBottom={0}>
              <Text bold>Custom Editor Path:</Text>
            </Box>
            <Box paddingX={2} marginTop={0}>
              {editingCustomPath ? (
                <Box borderStyle="single" borderColor="cyan" paddingX={1}>
                  <Text>
                    <Text color="cyan">{customPathInput}</Text>
                    <Text color="yellow">_</Text>
                  </Text>
                </Box>
              ) : (
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                  <Text>
                    {settings.customEditorPath || <Text dimColor>(not set)</Text>}
                  </Text>
                </Box>
              )}
            </Box>
            {editingCustomPath && (
              <Box marginTop={0} paddingX={2}>
                <Text dimColor>Type path, Enter to save, Esc to cancel</Text>
              </Box>
            )}
            {!editingCustomPath && !sectionFocus && (
              <Box marginTop={0} paddingX={2}>
                <Text dimColor>Press Enter to edit path</Text>
              </Box>
            )}
          </Box>
        )}
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to select options</Text>
          </Box>
        )}
        {!sectionFocus && !editingCustomPath && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Use ↑/↓ or j/k to navigate, Enter to select/edit, Esc to return</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderGitSection = () => {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Git Branch Prefix</Text>
          <Text dimColor> - Prefix for PR branch names</Text>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          <Box marginBottom={0}>
            <Text dimColor>Current prefix:</Text>
          </Box>
          <Box paddingX={2} marginTop={0}>
            {editingBranchPrefix ? (
              <Box borderStyle="single" borderColor="cyan" paddingX={1}>
                <Text>
                  <Text color="cyan">{branchPrefixInput}</Text>
                  <Text color="yellow">_</Text>
                </Text>
              </Box>
            ) : (
              <Box borderStyle="single" borderColor="gray" paddingX={1}>
                <Text bold>{settings.gitBranchPrefix}</Text>
              </Box>
            )}
          </Box>
        </Box>
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to edit</Text>
          </Box>
        )}
        {!sectionFocus && !editingBranchPrefix && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to edit, Esc to return</Text>
          </Box>
        )}
        {editingBranchPrefix && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Type prefix, Enter to save, Esc to cancel</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderProjectSection = () => {
    const currentRunCommand = database.getPreference('runCommand') || '';
    
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Run Command</Text>
          <Text dimColor> - Command that gets ran when testing out changes on a git worktree in a task</Text>
        </Box>
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          <Box marginBottom={0}>
            <Text dimColor>Current command:</Text>
          </Box>
          <Box paddingX={2} marginTop={0} flexGrow={1}>
            {editingRunCommand ? (
              <Box flexDirection="column" width="100%" flexGrow={1}>
                <MultiLineTextInput
                  value={runCommandInput}
                  onChange={(value) => {
                    setRunCommandInput(value);
                  }}
                  onSubmit={(value) => {
                    database.setPreference('runCommand', value);
                    setRunCommandInput(value);
                    setEditingRunCommand(false);
                  }}
                  onCancel={() => {
                    setEditingRunCommand(false);
                    setRunCommandInput(database.getPreference('runCommand') || '');
                  }}
                  placeholder="Enter your run command (multi-line supported)..."
                  height={Math.max(15, Math.floor((process.stdout.rows || 24) * 0.5))}
                />
              </Box>
            ) : (
              <Box 
                borderStyle="single" 
                borderColor="gray" 
                paddingX={1} 
                paddingY={0}
                flexDirection="column" 
                minHeight={5}
                flexGrow={1}
                width="100%"
              >
                {currentRunCommand ? (
                  <Text bold wrap="wrap">{currentRunCommand}</Text>
                ) : (
                  <Text bold dimColor>(not set)</Text>
                )}
              </Box>
            )}
          </Box>
        </Box>
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to edit</Text>
          </Box>
        )}
        {!sectionFocus && !editingRunCommand && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to edit, Esc to return</Text>
          </Box>
        )}
        {editingRunCommand && (
          <Box marginTop={1} paddingX={1} flexDirection="column">
            <Text dimColor>Enter = new line (press twice to save) | Esc = cancel</Text>
            <Text dimColor>Multi-line commands supported - paste your script here</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderNotificationsSection = () => {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} paddingX={1}>
          <Text bold color="yellow">Play Sounds</Text>
          <Text dimColor> - Enable sound notifications</Text>
        </Box>
        <Box flexDirection="column" paddingX={1}>
          <Box marginBottom={0} paddingX={2}>
            <Text>
              <Text bold>Status: </Text>
              <Text bold color={settings.playSounds ? 'green' : 'red'}>
                {settings.playSounds ? '✓ Enabled' : '✗ Disabled'}
              </Text>
            </Text>
          </Box>
        </Box>
        {sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter to toggle</Text>
          </Box>
        )}
        {!sectionFocus && (
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>Press Enter, Space, or T to toggle, Esc to return</Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width={terminalWidth} flexGrow={1}>
      <Box marginBottom={0} paddingX={2} paddingY={0} borderBottom={true} borderStyle="single">
        <Text bold color="cyan">
          Settings
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1} width={terminalWidth}>
        {/* Section navigation */}
        <Box 
          flexDirection="column" 
          width={Math.floor(terminalWidth * 0.25)} 
          borderRight={true} 
          borderStyle="single" 
          paddingX={0}
          paddingY={1}
        >
          {sections.map((section, index) => {
            const isActive = section === currentSection;
            const isFocused = isActive && sectionFocus;
            
            return (
              <Box 
                key={section} 
                marginBottom={0} 
                paddingX={1}
                paddingY={0}
              >
                <Text inverse={isFocused}>
                  {isFocused ? (
                    <Text bold color="white">{'▶ '}</Text>
                  ) : isActive ? (
                    <Text color="cyan">{'  '}</Text>
                  ) : (
                    <Text>{'  '}</Text>
                  )}
                  <Text color={isFocused ? 'white' : isActive ? 'cyan' : undefined} bold={isActive || isFocused}>
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </Text>
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1} paddingX={1}>
            <Text dimColor>
              {sectionFocus ? '↑/↓ to navigate, Enter to focus' : 'Esc to return'}
            </Text>
          </Box>
        </Box>

        {/* Section content */}
        <Box 
          flexDirection="column" 
          flexGrow={1} 
          borderStyle="single"
          paddingX={2} 
          paddingY={0}
        >
          {renderSection()}
        </Box>
      </Box>
    </Box>
  );
}
