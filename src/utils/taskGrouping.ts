import { Run, RunStatus } from '../models/types.js';

export type DisplayStatus = 'Queued' | 'In Progress' | 'Needs Input' | 'Done';

export interface TaskGroup {
  status: DisplayStatus;
  runs: Run[];
}

export function groupTasksByStatus(runs: Run[]): TaskGroup[] {
  const groups: Record<DisplayStatus, Run[]> = {
    Queued: [],
    'In Progress': [],
    'Needs Input': [],
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
  if (groups['Needs Input'].length > 0) {
    result.push({ status: 'Needs Input' as DisplayStatus, runs: groups['Needs Input'] });
  }
  if (groups.Done.length > 0) {
    result.push({ status: 'Done' as DisplayStatus, runs: groups.Done });
  }
  return result;
}

function mapRunStatusToDisplayStatus(status: RunStatus, readyToAct: boolean): DisplayStatus {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'In Progress';
    case 'paused':
      return 'Needs Input';
    case 'completed':
      return 'Done';
    case 'failed':
    case 'cancelled':
      return 'Done';
    default:
      return 'Queued';
  }
}
