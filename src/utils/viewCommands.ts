import { ViewType } from '../models/types.js';

export interface ViewCommand {
  key: string;
  description: string;
}

export function getViewCommands(view: ViewType): ViewCommand[] {
  switch (view) {
    case 'tasks':
      return [
        { key: 'T', description: 'Create a new task' },
        { key: 'Shift+D', description: 'Delete selected task' },
        { key: 'r', description: 'Refresh tasks' },
      ];
    case 'skills':
      return [
        { key: 'T', description: 'Create a new skill' },
        { key: 'r', description: 'Refresh skills' },
      ];
    case 'commands':
      return [
        { key: 'T', description: 'Create a new command' },
        { key: 'r', description: 'Refresh commands' },
      ];
    case 'hooks':
      return [
        { key: 'T', description: 'Create a new hook' },
        { key: 'r', description: 'Refresh hooks' },
      ];
    case 'profiles':
      return [
        { key: 'T', description: 'Create a new profile' },
        { key: 'r', description: 'Refresh profiles' },
      ];
    case 'agents':
      return [
        { key: 'r', description: 'Refresh agents' },
      ];
    default:
      return [];
  }
}
