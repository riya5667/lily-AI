import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding, chunkText } from '@/lib/embeddings';
import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';

export async function POST(req: Request) {
  try {
    const { username, token } = await req.json();
    if (!username) return NextResponse.json({ error: 'GitHub username required' }, { status: 400 });

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Lily-AI-Persona',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`, { headers });
    if (!reposRes.ok) return NextResponse.json({ error: `Fetch failed` }, { status: reposRes.status });

    const repos = await reposRes.json();
    let totalChunks = 0;

    for (const repo of repos) {
      await supabaseAdmin.from('repositories').upsert({
        repo_name: repo.name, repo_url: repo.html_url, description: repo.description || '', language: repo.language || '',
      }, { onConflict: 'repo_name' });

      const repoDocuments = [];
      let readmeText = '';

      // Fetch README
      const readmeRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/readme`, { headers });
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        readmeText = Buffer.from(readmeData.content, 'base64').toString('utf-8');
        const chunks = chunkText(`Repository: ${repo.name}\nREADME:\n${readmeText}`, 800, 150);
        
        for (const chunk of chunks) {
          if (chunk.trim() === '') continue;
          const embedding = await generateEmbedding(chunk);
          repoDocuments.push({
            source: `${repo.name}/README.md`, source_type: 'github_readme', chunk_text: chunk, embedding, metadata: { repo: repo.name },
          });
        }
      }

      // Generate & Cache LLM Summary if not exists
      if (readmeText) {
         const { data: existingSummary } = await supabaseAdmin.from('documents')
            .select('id')
            .eq('source_type', 'github_summary')
            .contains('metadata', { repo: repo.name })
            .limit(1);

         if (!existingSummary || existingSummary.length === 0) {
            try {
               const summaryRes = await generateText({
                 model: groq('llama3-70b-8192'),
                 prompt: `Based on this README for repository "${repo.name}", generate a concise summary. Output only the content under these headers: Project Purpose, Tech Stack, Architecture Overview, Key Tradeoffs, Future Improvements.\n\nREADME:\n${readmeText.substring(0, 5000)}`
               });
               const embedding = await generateEmbedding(summaryRes.text);
               repoDocuments.push({
                  source: `${repo.name}/Summary`, source_type: 'github_summary', chunk_text: summaryRes.text, embedding, metadata: { repo: repo.name }
               });
            } catch (err) {
               console.error("Summary generation failed for", repo.name, err);
            }
         }
      }

      // Fetch Commits (last 100)
      const commitsRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/commits?per_page=100`, { headers });
      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        for (const commitObj of commits) {
          const commitMsg = commitObj.commit.message;
          const commitDate = commitObj.commit.author.date;
          const author = commitObj.commit.author.name;
          const hash = commitObj.sha;
          
          const chunk = `Repository: ${repo.name}\nCommit Hash: ${hash}\nAuthor: ${author}\nDate: ${commitDate}\nMessage: ${commitMsg}`;
          const embedding = await generateEmbedding(chunk);
          repoDocuments.push({
            source: `${repo.name}/commit/${hash.substring(0,7)}`, source_type: 'commit', chunk_text: chunk, embedding, metadata: { repo: repo.name, commit_hash: hash, commit_date: commitDate, author: author },
          });
        }
      }

      if (repoDocuments.length > 0) {
        const { error } = await supabaseAdmin.from('documents').insert(repoDocuments);
        if (!error) totalChunks += repoDocuments.length;
      }
    }
    return NextResponse.json({ success: true, message: `Processed ${repos.length} repos, saved ${totalChunks} chunks.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
