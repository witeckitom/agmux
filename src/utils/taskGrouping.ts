import { Run, RunStatus } from '../models/types.js';

export type DisplayStatus = 'Queued' | 'In Progress' | 'In Review' | 'Done';

export interface TaskGroup {
  status: DisplayStatus;
  runs: Run[];
}

export function groupTasksByStatus(runs: Run[]): TaskGroup[] {
  const groups: Record<DisplayStatus, Run[]> = {
    Queued: [],
    'In Progress': [],
    'In Review': [],
    Done: [],
  };

  for (const run of runs) {
    const displayStatus = mapRunStatusToDisplayStatus(run.status, run.readyToAct);
    groups[displayStatus].push(run);
  }

  // Return groups in order, filtering out empty ones
  const result: TaskGroup[] = [];
  if (groups.Queued.length > 0) {
    result.push({ status: 'Queued' as DisplayStatus, runs: groups.Queued });
  }
  if (groups['In Progress'].length > 0) {
    result.push({ status: 'In Progress' as DisplayStatus, runs: groups['In Progress'] });
  }
  if (groups['In Review'].length > 0) {
    result.push({ status: 'In Review' as DisplayStatus, runs: groups['In Review'] });
  }
  if (groups.Done.length > 0) {
    result.push({ status: 'Done' as DisplayStatus, runs: groups.Done });
  }
  return result;
}

function mapRunStatusToDisplayStatus(status: RunStatus, readyToAct: boolean): DisplayStatus {
  if (readyToAct && status === 'running') {
    return 'In Review';
  }
  
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'In Progress';
    case 'completed':
      return 'Done';
    case 'failed':
    case 'cancelled':
      return 'Done';
    default:
      return 'Queued';
  }
}
