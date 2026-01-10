import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { DatabaseManager } from '../db/database.js';
import { AgentType, ThemeType, EditorType } from '../models/types.js';
import { logger } from '../utils/logger.js';

interface SettingsState {
  agent: AgentType;
  theme: ThemeType;
  editor: EditorType;
  customEditorPath: string;
  gitBranchPrefix: string;
  playSounds: boolean;
}

interface SettingsContextValue {
  settings: SettingsState;
  setAgent: (agent: AgentType) => void;
  setTheme: (theme: ThemeType) => void;
  setEditor: (editor: EditorType) => void;
  setCustomEditorPath: (path: string) => void;
  setGitBranchPrefix: (prefix: string) => void;
  setPlaySounds: (enabled: boolean) => void;
  loadSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
  database: DatabaseManager;
}

const DEFAULT_SETTINGS: SettingsState = {
  agent: 'claude',
  theme: 'default',
  editor: 'vscode',
  customEditorPath: '',
  gitBranchPrefix: 'agent-orch',
  playSounds: true,
};

export function SettingsProvider({ children, database }: SettingsProviderProps) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  const loadSettings = useCallback(() => {
    try {
      const agentPref = database.getPreference('agent');
      const agent = (agentPref === 'claude' || agentPref === 'cursor' ? agentPref : 'claude') as AgentType;
      
      const themePref = database.getPreference('theme');
      const theme = (themePref === 'default' || themePref === 'matrix' ? themePref : 'default') as ThemeType;
      
      const editorPref = database.getPreference('editor');
      const editor = (editorPref === 'vscode' || editorPref === 'custom' ? editorPref : 'vscode') as EditorType;
      
      const customEditorPath = database.getPreference('customEditorPath') || '';
      
      const gitBranchPrefix = database.getPreference('gitBranchPrefix') || 'agent-orch';
      
      const playSoundsPref = database.getPreference('playSounds');
      const playSounds = playSoundsPref !== 'false'; // Default to true
      
      setSettings({
        agent,
        theme,
        editor,
        customEditorPath,
        gitBranchPrefix,
        playSounds,
      });
      
      logger.debug('Settings loaded', 'Settings', { agent, theme, editor, gitBranchPrefix, playSounds });
    } catch (error) {
      logger.warn('Failed to load settings, using defaults', 'Settings', { error });
      setSettings(DEFAULT_SETTINGS);
    }
  }, [database]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const setAgent = useCallback(
    (agent: AgentType) => {
      try {
        database.setPreference('agent', agent);
        setSettings(prev => ({ ...prev, agent }));
        logger.info(`Agent setting changed to: ${agent}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save agent setting', 'Settings', { error });
      }
    },
    [database]
  );

  const setTheme = useCallback(
    (theme: ThemeType) => {
      try {
        database.setPreference('theme', theme);
        setSettings(prev => ({ ...prev, theme }));
        logger.info(`Theme setting changed to: ${theme}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save theme setting', 'Settings', { error });
      }
    },
    [database]
  );

  const setEditor = useCallback(
    (editor: EditorType) => {
      try {
        database.setPreference('editor', editor);
        setSettings(prev => ({ ...prev, editor }));
        logger.info(`Editor setting changed to: ${editor}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save editor setting', 'Settings', { error });
      }
    },
    [database]
  );

  const setCustomEditorPath = useCallback(
    (path: string) => {
      try {
        database.setPreference('customEditorPath', path);
        setSettings(prev => ({ ...prev, customEditorPath: path }));
        logger.info(`Custom editor path changed to: ${path}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save custom editor path', 'Settings', { error });
      }
    },
    [database]
  );

  const setGitBranchPrefix = useCallback(
    (prefix: string) => {
      try {
        database.setPreference('gitBranchPrefix', prefix);
        setSettings(prev => ({ ...prev, gitBranchPrefix: prefix }));
        logger.info(`Git branch prefix changed to: ${prefix}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save git branch prefix', 'Settings', { error });
      }
    },
    [database]
  );

  const setPlaySounds = useCallback(
    (enabled: boolean) => {
      try {
        database.setPreference('playSounds', enabled.toString());
        setSettings(prev => ({ ...prev, playSounds: enabled }));
        logger.info(`Play sounds setting changed to: ${enabled}`, 'Settings');
      } catch (error) {
        logger.error('Failed to save play sounds setting', 'Settings', { error });
      }
    },
    [database]
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        setAgent,
        setTheme,
        setEditor,
        setCustomEditorPath,
        setGitBranchPrefix,
        setPlaySounds,
        loadSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
