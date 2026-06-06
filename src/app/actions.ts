'use server';

import { getGithubProjects, getAvailability } from '@/lib/tools';

export async function fetchGithubProjectsAction(args: any) {
  try {
    // @ts-ignore
    const result = await getGithubProjects.execute(args, { toolCallId: 'voice-call', messages: [] });
    return result;
  } catch (error: any) {
    console.error('[Action] getGithubProjects failed:', error);
    return { error: error.message };
  }
}

export async function fetchAvailabilityAction(args: any) {
  try {
    // @ts-ignore
    const result = await getAvailability.execute(args, { toolCallId: 'voice-call', messages: [] });
    return result;
  } catch (error: any) {
    console.error('[Action] getAvailability failed:', error);
    return { error: error.message };
  }
}
