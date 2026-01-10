import React from 'react';
import { useApp } from '../context/AppContext.js';
import { TasksView } from '../views/TasksView.js';
import { SkillsView } from '../views/SkillsView.js';
import { CommandsView } from '../views/CommandsView.js';
import { HooksView } from '../views/HooksView.js';
import { ProfilesView } from '../views/ProfilesView.js';
import { AgentsView } from '../views/AgentsView.js';
import { NewTaskView } from '../views/NewTaskView.js';
import { TaskDetailView } from '../views/TaskDetailView.js';
import { SettingsView } from '../views/SettingsView.js';

export function ViewRouter() {
  const { state } = useApp();

  switch (state.currentView) {
    case 'tasks':
      return <TasksView />;
    case 'new-task':
      return <NewTaskView />;
    case 'task-detail':
      return <TaskDetailView />;
    case 'skills':
      return <SkillsView />;
    case 'commands':
      return <CommandsView />;
    case 'hooks':
      return <HooksView />;
    case 'profiles':
      return <ProfilesView />;
    case 'agents':
      return <AgentsView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <TasksView />;
  }
}
