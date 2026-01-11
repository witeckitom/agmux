import React, { useMemo, useSyncExternalStore } from 'react';
import { TasksView } from '../views/TasksView.js';
import { SkillsView } from '../views/SkillsView.js';
import { CommandsView } from '../views/CommandsView.js';
import { HooksView } from '../views/HooksView.js';
import { ProfilesView } from '../views/ProfilesView.js';
import { AgentsView } from '../views/AgentsView.js';
import { NewTaskView } from '../views/NewTaskView.js';
import { TaskDetailView } from '../views/TaskDetailView.js';
import { SettingsView } from '../views/SettingsView.js';

// Memoized view components to prevent re-renders when parent re-renders
const MemoizedTasksView = React.memo(TasksView);
// Fixed: Removed width/height from root Box to prevent full screen repaints
const MemoizedTaskDetailView = React.memo(TaskDetailView);
const MemoizedNewTaskView = React.memo(NewTaskView);
const MemoizedSkillsView = React.memo(SkillsView);
const MemoizedCommandsView = React.memo(CommandsView);
const MemoizedHooksView = React.memo(HooksView);
const MemoizedProfilesView = React.memo(ProfilesView);
const MemoizedAgentsView = React.memo(AgentsView);
const MemoizedSettingsView = React.memo(SettingsView);

// External store for currentView - allows ViewRouter to avoid re-renders
// when unrelated context properties change
let currentViewStore: {
  view: string;
  listeners: Set<() => void>;
} = {
  view: 'tasks',
  listeners: new Set(),
};

export function setCurrentViewExternal(view: string) {
  if (currentViewStore.view !== view) {
    currentViewStore.view = view;
    currentViewStore.listeners.forEach(listener => listener());
  }
}

function subscribeToView(callback: () => void) {
  currentViewStore.listeners.add(callback);
  return () => currentViewStore.listeners.delete(callback);
}

function getViewSnapshot() {
  return currentViewStore.view;
}

export function ViewRouter() {
  // Use external store instead of context to avoid re-renders when unrelated context changes
  const currentView = useSyncExternalStore(subscribeToView, getViewSnapshot);

  // Memoize the view component to prevent recreation on every render
  const viewComponent = useMemo(() => {
    switch (currentView) {
      case 'tasks':
        return <MemoizedTasksView />;
      case 'new-task':
        return <MemoizedNewTaskView />;
      case 'task-detail':
        return <MemoizedTaskDetailView />;
      case 'skills':
        return <MemoizedSkillsView />;
      case 'commands':
        return <MemoizedCommandsView />;
      case 'hooks':
        return <MemoizedHooksView />;
      case 'profiles':
        return <MemoizedProfilesView />;
      case 'agents':
        return <MemoizedAgentsView />;
      case 'settings':
        return <MemoizedSettingsView />;
      default:
        return <MemoizedTasksView />;
    }
  }, [currentView]);

  return viewComponent;
}
