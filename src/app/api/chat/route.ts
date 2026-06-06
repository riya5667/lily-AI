import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { groq } from '@ai-sdk/groq';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/embeddings';
import { getAvailability, createBooking, getGithubProjects } from '@/lib/tools';
import fs from 'fs';
import path from 'path';

// ── Load candidate_profile.md once at module level ───────────────────────────
function loadCandidateProfile(): string {
  try {
    const profilePath = path.join(process.cwd(), 'candidate_profile.md');
    if (fs.existsSync(profilePath)) {
      return fs.readFileSync(profilePath, 'utf8');
    }
  } catch (e) {
    console.error('[Profile] Error reading candidate_profile.md:', e);
  }
  return '';
}
const CANDIDATE_PROFILE = loadCandidateProfile();

const GITHUB_USERNAME = 'riya5667';

// ── Fetch ALL repos from GitHub with pagination ───────────────────────────────
async function fetchAllRepos() {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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

  // Try authenticated (gets private repos too)
  if (token) {
    const repos = await paginate(`https://api.github.com/user/repos?sort=updated&affiliation=owner`);
    if (repos.length > 0) return { repos, headers };
  }

  // Fallback: public repos
  const repos = await paginate(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated`);
  return { repos, headers };
}

const STOP_WORDS = new Set(['tell','me','about','the','what','is','can','you','please','pls','her','his','their','this','that','for','and','with','how','show','give','more','details','project','projects','repo','repos','repository','repositories','work','app','application']);

// ── Fuzzy match a query against repo list ────────────────────────────────────
function fuzzyMatch(repos: any[], query: string) {
  const words = query.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  
  if (words.length === 0) return [];
  
  return repos
    .map(r => {
      // Filter empty tokens (e.g. trailing dash in "poppii-voice-assistant-")
      const rwords = r.name.toLowerCase().split(/[^a-z0-9]+/).filter((rw: string) => rw.length > 0);
      let score = 0;
      for (const w of words) {
        for (const rw of rwords) {
          if (rw === w) { score += 4; break; }            // exact match
          if (rw.startsWith(w) || w.startsWith(rw)) { score += 2; break; } // prefix
          if (rw.includes(w) && w.length >= 4) { score += 1; break; }       // substring (only for long words)
        }
        if (r.description?.toLowerCase().includes(w)) score += 1;
      }
      return { r, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.r);
}

// ── Detect intent: 'list all' vs 'specific project' ─────────────────────────
// Only trigger the "dump all repos" path when user EXPLICITLY asks for a full list.
// Questions like "tell me about her projects" or "what has she built?" should
// be answered conversationally using the profile, NOT by listing every repo.
function isListAllReposQuery(text: string): boolean {
  // Must have an explicit list/show/all trigger word
  const hasListTrigger = /\b(show all|list all|all (her |my )?(repos?|repositories|projects)|show (her |my )?(repos?|repositories|projects)|view repos|see repos)\b/i.test(text);
  // AND must NOT be a conversational question about a specific project
  const isConversational = /(tell me about|explain|describe|what is|what are|how does|talk about|details? (of|about)|more about)/i.test(text);
  return hasListTrigger && !isConversational;
}

function detectProjectQuery(text: string): string | null {
  if (isListAllReposQuery(text)) return null;
  return text;
}

// ── Extract project information from candidate_profile.md fallback ───────────
function getProjectFromProfile(repoName: string): string | null {
  try {
    const profilePath = path.join(process.cwd(), 'candidate_profile.md');
    if (!fs.existsSync(profilePath)) return null;
    const content = fs.readFileSync(profilePath, 'utf8');
    
    // Split the profile content by headings (e.g. ## or #)
    const sections = content.split(/(?=^##\s+|^#\s+)/m);
    
    const queryWords = repoName.toLowerCase().split(/[^a-z0-9]+/);
    let bestSection = null;
    let maxOverlap = 0;
    
    // Special manual mappings for known repos/aliases to be 100% accurate
    const aliases: Record<string, string[]> = {
      'ai-interview-scheduler': ['recruiter', 'interview', 'scheduler', 'booking'],
      'alzheimer': ['alzheimer'],
      'sehatsaathi': ['alzheimer', 'healthcare'],
      'smart': ['iot', 'environment', 'monitor', 'water'],
      'water': ['water'],
      'adhd': ['adhd', 'learning'],
      'mentor': ['mentor', 'mentee'],
      'artisan': ['artisan', 'marketplace'],
      'ocean': ['ocean', 'conservation', 'gamification']
    };
    
    for (const section of sections) {
      const sectionLower = section.toLowerCase();
      const firstLine = section.split('\n')[0].toLowerCase();
      let overlap = 0;
      
      // Check query words
      for (const w of queryWords) {
        if (w.length < 2) continue;
        if (firstLine.includes(w)) overlap += 5;
        if (sectionLower.includes(w)) overlap += 2;
      }
      
      // Check alias mappings
      for (const [key, keywords] of Object.entries(aliases)) {
        if (repoName.toLowerCase().includes(key)) {
          for (const kw of keywords) {
            if (firstLine.includes(kw)) overlap += 5;
            if (sectionLower.includes(kw)) overlap += 2;
          }
        }
      }
      
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSection = section;
      }
    }
    
    if (maxOverlap >= 3 && bestSection) {
      return bestSection.trim();
    }
  } catch (e) {
    console.error('[Profile] Error reading candidate_profile.md:', e);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { messages: rawMessages } = await req.json();
    const messages: any[] = rawMessages ?? [];
    const lastMessage = messages[messages.length - 1];

    // Extract user text
    const userText: string =
      lastMessage?.parts?.find((p: any) => p.type === 'text')?.text ||
      (typeof lastMessage?.content === 'string' ? lastMessage.content : '') ||
      '';

    // ── 1. RAG context ───────────────────────────────────────────────────────
    let contextText = '';
    let confidenceScore = 'Low';
    let githubContext = '';

    if (userText) {
      // RAG
      try {
        const queryEmbedding = await generateEmbedding(userText);
        const { data: documents, error } = await supabaseAdmin.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.5,
          match_count: 5,
        });
        if (!error && documents && documents.length > 0) {
          contextText = documents
            .map((doc: any) => `Source: ${doc.source} (${doc.source_type})\nContent: ${doc.chunk_text}\n---`)
            .join('\n');
          const avg = documents.reduce((a: number, b: any) => a + b.similarity, 0) / documents.length;
          confidenceScore = avg > 0.75 && documents.length >= 2 ? 'High' : avg > 0.6 ? 'Medium' : 'Low';
        }
      } catch { /* RAG failure is non-fatal */ }

      // ── 2. Server-side GitHub data injection ────────────────────────────
      try {
        const { repos, headers } = await fetchAllRepos();
        console.log('[GitHub] repos fetched:', repos.length, '| isListAll:', isListAllReposQuery(userText));

        if (isListAllReposQuery(userText)) {
          const list = repos.map((r: any) =>
            `- ${r.name} (${r.language || 'Unknown'}) — ${r.description || 'No description'} [${r.html_url}]`
          ).join('\n');
          githubContext = `\nGITHUB REPOSITORIES (${repos.length} total):\n${list}\n`;
          confidenceScore = 'High';
        } else {
          const projectQuery = detectProjectQuery(userText);
          console.log('[GitHub] projectQuery:', projectQuery);
          if (projectQuery) {
            const matches = fuzzyMatch(repos, projectQuery);
            console.log('[GitHub] matches:', matches.slice(0, 3).map((r: any) => r.name));
            if (matches.length > 0) {
              const repo = matches[0];
              console.log('[GitHub] fetching README for:', repo.name);
              // Use JSON endpoint (not .raw) so the Authorization header is preserved
              // for private repos. GitHub returns base64-encoded content in JSON.
              const readmeRes = await fetch(
                `https://api.github.com/repos/${GITHUB_USERNAME}/${repo.name}/readme`,
                { headers: { ...headers, Accept: 'application/vnd.github+json' } }
              );
              console.log('[GitHub] README status:', readmeRes.status);
              let readme = '';
              if (readmeRes.ok) {
                const readmeJson = await readmeRes.json();
                // GitHub returns content as base64 with line breaks
                const raw = readmeJson.content?.replace(/\n/g, '') ?? '';
                readme = Buffer.from(raw, 'base64').toString('utf8');
                console.log('[GitHub] README length:', readme.length);
              } else {
                const fallbackInfo = getProjectFromProfile(repo.name);
                if (fallbackInfo) {
                  console.log('[GitHub] README not found, loaded fallback from candidate_profile.md, length:', fallbackInfo.length);
                  readme = `(From Candidate Profile):\n${fallbackInfo}`;
                }
              }

              if (readme) {
                githubContext = `\nGITHUB PROJECT DATA:\nRepository: ${repo.name}\nURL: ${repo.html_url}\nLanguage: ${repo.language || 'Unknown'}\nDescription: ${repo.description || 'No description'}\nREADME:\n${readme.substring(0, 1200)}\n`;
              } else {
                githubContext = `\nGITHUB PROJECT DATA:\nRepository: ${repo.name}\nURL: ${repo.html_url}\nLanguage: ${repo.language || 'Unknown'}\nDescription: ${repo.description || 'No description'}\nNote: This repo has no README or profile description.\n`;
              }
              confidenceScore = 'High';
            }
          }
        }
      } catch (e) { console.error('[GitHub] injection error:', e); }
    }

    // ── 3. System prompt ─────────────────────────────────────────────────────
    const hasGithubData = githubContext.length > 0;
    const profileSnippet = CANDIDATE_PROFILE ? CANDIDATE_PROFILE.substring(0, 2000) : '';
    const systemPrompt = `You are Lily's AI representative. CRITICAL: Reply in EXACTLY 1 short paragraph (3-4 sentences max). Always end with a complete sentence. Never trail off.

${profileSnippet ? `=== LILY'S PROFILE ===\n${profileSnippet}\n=== END ===` : ''}

${hasGithubData ? `=== GITHUB PROJECT ===\n${githubContext}\n=== END ===` : ''}

${(!hasGithubData && contextText) ? `=== EXTRA CONTEXT ===\n${contextText.substring(0, 600)}\n=== END ===` : ''}

RULES:
- Use profile for experience/skills/background questions.
- If GITHUB PROJECT is present, tell a story about it: problem, tech, impact. Be enthusiastic!
- ONLY call getGithubProjects when user explicitly wants to browse/see all repos as cards.
- NEVER say you lack info about topics in the profile.
- End every reply with: Confidence: ${confidenceScore}
- Use getAvailability/createBooking for scheduling only.`;

    // ── 4. Stream ────────────────────────────────────────────────────────────
    const modelMessages = await convertToModelMessages(messages ?? []);
    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      system: systemPrompt,
      messages: modelMessages,
      tools: { getAvailability, createBooking, getGithubProjects },
      maxTokens: 300,
      stopWhen: stepCountIs(3),
      onFinish: async (event) => {
        try {
          if (lastMessage?.role === 'user' && userText) {
            await supabaseAdmin.from('evaluation_logs').insert({
              query: userText,
              answer: event.text,
              grounded: true,
            });
          }
        } catch { /* log failure is non-fatal */ }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error('Chat API Error:', error);
    const isRateLimit =
      error?.message?.toLowerCase().includes('rate limit') ||
      error?.message?.toLowerCase().includes('rate_limit') ||
      error?.statusCode === 429 ||
      error?.status === 429;
    if (isRateLimit) {
      return new Response(
        JSON.stringify({ error: 'rate_limit', message: "Groq rate limit reached. Please wait a moment and try again." }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
