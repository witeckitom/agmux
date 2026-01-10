import React from 'react';
import { useApp } from '../context/AppContext.js';
import { TasksView } from '../views/TasksView.js';
import { SkillsView } from '../views/SkillsView.js';
import { CommandsView } from '../views/CommandsView.js';
import { HooksView } from '../views/HooksView.js';
import { ProfilesView } from '../views/ProfilesView.js';
import { AgentsView } from '../views/AgentsView.js';

export function ViewRouter() {
  const { state } = useApp();

  switch (state.currentView) {
    case 'tasks':
      return <TasksView />;
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
    default:
      return <TasksView />;
  }
}
