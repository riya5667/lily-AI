import { createClient } from '@supabase/supabase-js';
import { HfInference } from '@huggingface/inference';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await hf.featureExtraction({
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text.replace(/\n/g, ' '),
  });
  return response as number[];
}

function chunkText(text: string, maxChunkSize = 800, overlap = 150): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      const overlapWords = currentChunk.slice(-Math.floor(overlap / 5)); 
      currentChunk = [...overlapWords];
      currentLength = currentChunk.join(' ').length;
    }
    currentChunk.push(word);
    currentLength += word.length + 1;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
  return chunks;
}

async function ingestProfile() {
  const filePath = path.resolve(process.cwd(), 'candidate_profile.md');
  const text = fs.readFileSync(filePath, 'utf-8');
  
  const chunks = chunkText(text);
  const documents = [];

  for (const chunk of chunks) {
    if (chunk.trim() === '') continue;
    const embedding = await generateEmbedding(chunk);
    documents.push({
      source: 'candidate_profile.md',
      source_type: 'custom_doc',
      chunk_text: chunk,
      embedding,
      metadata: { description: 'Detailed project and internship experience' }
    });
  }

  const { error } = await supabaseAdmin.from('documents').insert(documents);
  if (error) {
    console.error('Failed to ingest profile:', error);
  } else {
    console.log(`Successfully ingested ${documents.length} chunks from candidate_profile.md`);
  }
}

ingestProfile();
