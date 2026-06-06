import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';

const GITHUB_USERNAME = 'riya5667';

async function getGithubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function fetchAllRepos() {
  const headers = await getGithubHeaders();
  const token = process.env.GITHUB_TOKEN;

  // Paginate through all pages (GitHub max 100 per page)
  async function paginate(baseUrl: string): Promise<any[]> {
    const allRepos: any[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(`${baseUrl}&page=${page}&per_page=100`, { headers });
      if (!res.ok) break;
      const batch: any[] = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allRepos.push(...batch);
      if (batch.length < 100) break; // last page
      page++;
    }
    return allRepos;
  }

  if (token) {
    const repos = await paginate(`https://api.github.com/user/repos?sort=updated&affiliation=owner`);
    if (repos.length > 0) return repos;
  }

  return paginate(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated`);
}

const STOP_WORDS = new Set(['tell','me','about','the','what','is','can','you','please','pls','her','his','their','this','that','for','and','with','how','show','give','more','details','project','projects','repo','repos','repository','repositories','work','app','application']);

function fuzzyMatchRepos(repos: any[], query: string) {
  if (!query) return repos;
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return repos;
  return repos
    .map(r => {
      const rwords = r.name.toLowerCase().split(/[^a-z0-9]+/);
      let score = 0;
      for (const w of words) {
        if (rwords.some((rw: string) => rw.includes(w) || w.includes(rw))) score += 2;
        if (r.description?.toLowerCase().includes(w)) score += 1;
      }
      return { r, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.r);
}

function formatRepo(r: any) {
  return {
    name: r.name,
    description: r.description || 'No description provided.',
    language: r.language || 'Unknown',
    stars: r.stargazers_count ?? 0,
    isPrivate: r.private,
    url: r.html_url,
    updatedAt: r.updated_at ? r.updated_at.split('T')[0] : 'Unknown',
  };
}

// ── GitHub Projects Tool ──────────────────────────────────────────────────────
// Simple schema: one optional string. Works with any model.
export const getGithubProjects = tool({
  description: "Fetch Lily's GitHub repositories. If the user asks about ALL projects, call with no filter. If the user asks about a SPECIFIC project, pass the project keyword as filter and the tool will automatically fetch the README too.",
  parameters: z.object({
    filter: z.string().optional().describe('Project keyword to search for, e.g. "fashion" or "tashi". Leave empty to list all repos.'),
  }),
  // @ts-ignore
  execute: async (args: any) => {
    const filter: string | undefined = args?.filter || undefined;
    try {
      const allRepos = await fetchAllRepos();
      const matched = fuzzyMatchRepos(allRepos, filter || '');
      const list = filter ? matched : allRepos;
      // Show all repos when listing, or just top match for specific search
      const limit = filter ? 1 : allRepos.length;
      const formatted = list.slice(0, limit).map(formatRepo);

      // If filter was specific and we found matches, auto-fetch README
      if (filter && formatted.length > 0) {
        const target = formatted[0];
        try {
          const headers = await getGithubHeaders();
          const readmeRes = await fetch(
            `https://api.github.com/repos/${GITHUB_USERNAME}/${target.name}/readme`,
            { headers: { ...headers, Accept: 'application/vnd.github.raw' } }
          );
          if (readmeRes.ok) {
            const readme = await readmeRes.text();
            return {
              repos: formatted,
              readme: readme.substring(0, 4000),
              focusRepo: target.name,
              message: `Found "${target.name}". README attached. Please summarize the project for the user based on the README.`,
            };
          }
        } catch { /* README fetch failed — fall through */ }
        return {
          repos: formatted,
          focusRepo: target.name,
          message: `Found "${target.name}" but no README available. Describe it based on repo info.`,
        };
      }

      return {
        repos: formatted,
        totalFound: allRepos.length,
        message: `Found ${allRepos.length} repositories for Lily. List them for the user.`,
      };
    } catch (e: any) {
      return { error: e.message, repos: [] };
    }
  },
});

// ── Availability Tool ─────────────────────────────────────────────────────────
export const getAvailability = tool({
  description: 'Get available interview time slots for Lily. Always call this when the user wants to schedule or book an interview.',
  parameters: z.object({
    dateFrom: z.string().optional().describe('Optional start date in YYYY-MM-DD format.'),
    dateTo: z.string().optional().describe('Optional end date in YYYY-MM-DD format.'),
  }),
  // @ts-ignore
  execute: async (args: any) => {
    const { dateFrom, dateTo } = args || {};
    const apiKey = process.env.CAL_API_KEY;
    const eventTypeId = process.env.CAL_EVENT_TYPE_ID;
    const username = process.env.CAL_USERNAME;

    // Generate realistic fallback slots (next 7 days, 10am-5pm)
    function generateFallbackSlots(): string[] {
      const slots: string[] = [];
      const now = new Date();
      for (let d = 1; d <= 7; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);
        if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
        for (const hour of [10, 12, 14, 16]) {
          const slot = new Date(day);
          slot.setHours(hour, 0, 0, 0);
          slots.push(slot.toISOString());
        }
      }
      return slots.slice(0, 8);
    }

    if (!apiKey || !eventTypeId) {
      return {
        availableSlots: generateFallbackSlots(),
        message: 'Here are available slots. Ask the user which one they prefer.',
        note: 'Showing suggested slots (Cal.com key missing)',
      };
    }

    try {
      const start = dateFrom || new Date().toISOString().split('T')[0];
      const endObj = new Date(start);
      endObj.setDate(endObj.getDate() + 7);
      const end = dateTo || endObj.toISOString().split('T')[0];

      // Cal.com v2 slots API
      const res = await fetch(
        `https://api.cal.com/v2/slots/available?eventTypeId=${eventTypeId}&start=${start}&end=${end}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'cal-api-version': '2024-09-04',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        // v2 response: { data: { slots: { "2024-06-10": [{ time: "..."}] } } }
        const slotsMap = data?.data?.slots || {};
        const allSlots: string[] = [];
        for (const day of Object.values(slotsMap) as any[]) {
          for (const s of day) {
            allSlots.push(s.time || s.startTime || s);
          }
        }
        if (allSlots.length > 0) {
          return {
            availableSlots: allSlots.slice(0, 10),
            message: 'Here are available slots. Ask the user which one they prefer.',
          };
        }
      }

      // Fallback to v1 availability
      const v1Res = await fetch(
        `https://api.cal.com/v1/availability?apiKey=${apiKey}&username=${username}&dateFrom=${start}&dateTo=${end}`
      );
      if (v1Res.ok) {
        const v1Data = await v1Res.json();
        // v1 returns workingHours / dateOverrides, not individual slots — use fallback
        console.log('[Cal] v1 availability data:', JSON.stringify(v1Data).substring(0, 200));
      }

      // Always return something usable
      return {
        availableSlots: generateFallbackSlots(),
        message: 'Here are suggested available slots. Ask the user which one they prefer.',
        note: 'Showing suggested slots',
      };
    } catch (e: any) {
      console.error('[Cal] availability error:', e.message);
      return {
        availableSlots: generateFallbackSlots(),
        message: 'Here are suggested available slots. Ask the user which one they prefer.',
      };
    }
  },
});

// ── Booking Tool ──────────────────────────────────────────────────────────────
export const createBooking = tool({
  description: 'Create a real interview booking at a specific time slot on Cal.com.',
  parameters: z.object({
    interviewerName: z.string().describe('The name of the interviewer or recruiter.'),
    email: z.string().email().describe('The email address of the interviewer.'),
    scheduledTime: z.string().describe('The selected ISO datetime string for the interview.'),
  }),
  // @ts-ignore
  execute: async ({ interviewerName, email, scheduledTime }) => {
    await supabaseAdmin.from('bookings').insert({
      interviewer_name: interviewerName,
      email,
      scheduled_time: scheduledTime,
      status: 'confirmed',
    });

    const apiKey = process.env.CAL_API_KEY;
    const eventTypeId = process.env.CAL_EVENT_TYPE_ID;

    if (!apiKey || !eventTypeId) {
      return {
        success: true,
        message: `Saved booking for ${interviewerName} at ${scheduledTime}. (Cal.com skipped — missing keys)`,
      };
    }

    try {
      const res = await fetch(`https://api.cal.com/v1/bookings?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: parseInt(eventTypeId, 10),
          start: scheduledTime,
          responses: { name: interviewerName, email, location: 'Google Meet' },
          timeZone: 'America/New_York',
          language: 'en',
          status: 'ACCEPTED',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create booking on Cal.com');
      }

      return {
        success: true,
        message: `Successfully booked interview for ${interviewerName} at ${new Date(scheduledTime).toLocaleString()} via Cal.com.`,
      };
    } catch (error: any) {
      console.error('Booking error:', error);
      return { success: false, error: error.message };
    }
  },
});
