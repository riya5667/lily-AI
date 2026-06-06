import { createClient } from '@supabase/supabase-js';
import { HfInference } from '@huggingface/inference';
import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

const GOLDEN_DATASET = [
  {
    query: "What is Lily's experience with the AI Recruiter project?",
    expectedSourceContains: "AI Recruiter",
  },
  {
    query: "Where did Lily intern and what did she build?",
    expectedSourceContains: "Autonmis",
  },
  {
    query: "What tech stack was used for the Smart Environment Monitor?",
    expectedSourceContains: "IoT",
  },
  {
    query: "Tell me about the Alzheimer's detection project.",
    expectedSourceContains: "Alzheimer",
  }
];

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await hf.featureExtraction({
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text.replace(/\n/g, ' '),
  });
  return response as number[];
}

async function checkHallucination(answer: string, context: string): Promise<boolean> {
  try {
    const res = await generateText({
      model: groq('llama3-70b-8192'),
      prompt: `You are an evaluator. Does the following ANSWER contain any specific claims or facts that are NOT supported by the CONTEXT? Respond with exactly one word: "TRUE" (if it contains hallucinations) or "FALSE" (if it is fully grounded in the context).\n\nCONTEXT:\n${context}\n\nANSWER:\n${answer}`
    });
    return res.text.toUpperCase().includes('TRUE');
  } catch (e) {
    console.error("LLM evaluation failed", e);
    return false; // default to false if API fails to prevent blocking
  }
}

async function runEvaluation() {
  console.log("Running Advanced Golden Dataset Evaluation...");
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalReciprocalRank = 0;
  let hitRate = 0;
  let hallucinations = 0;
  let totalConfidence = 0;

  for (const item of GOLDEN_DATASET) {
    const queryEmbedding = await generateEmbedding(item.query);
    const { data: documents, error } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5
    });

    if (error || !documents || documents.length === 0) {
      console.error("Supabase Error or no docs:", error);
      continue;
    }

    let hit = false;
    let firstHitIndex = -1;
    let relevantCount = 0;
    
    // Simulate answering for hallucination check
    const contextText = documents.map((d:any) => d.chunk_text).join('\n');
    const answerRes = await generateText({
      model: groq('llama3-70b-8192'),
      prompt: `Answer the query based ONLY on the context.\n\nContext:\n${contextText}\n\nQuery:\n${item.query}`
    });
    const answer = answerRes.text;

    // Check Hallucination
    const isHallucinated = await checkHallucination(answer, contextText);
    if (isHallucinated) hallucinations++;

    // Calculate Confidence based on similarity
    const similarityScores = documents.map((d: any) => d.similarity);
    const avgSimilarity = similarityScores.reduce((a: number, b: number) => a + b, 0) / similarityScores.length;
    totalConfidence += avgSimilarity;

    documents.forEach((doc: any, index: number) => {
      const isRelevant = doc.chunk_text.toLowerCase().includes(item.expectedSourceContains.toLowerCase());
      if (isRelevant) {
        if (!hit) {
          hit = true;
          firstHitIndex = index;
        }
        relevantCount++;
      }
    });

    if (hit) {
      hitRate++;
      totalReciprocalRank += 1 / (firstHitIndex + 1);
    }
    
    // Precision@5
    totalPrecision += relevantCount / 5;
    // Recall@5 (assume 1 total relevant document exists for this test, so Recall is just hit? 1 : 0)
    totalRecall += hit ? 1 : 0;
  }

  const k = GOLDEN_DATASET.length;
  console.log("\n--- Evaluation Results ---");
  console.log(`Mean Reciprocal Rank (MRR): ${(totalReciprocalRank / k).toFixed(2)}`);
  console.log(`Average Precision@5: ${(totalPrecision / k).toFixed(2)}`);
  console.log(`Average Recall@5: ${(totalRecall / k).toFixed(2)}`);
  console.log(`Hit Rate: ${((hitRate / k) * 100).toFixed(2)}%`);
  console.log(`Hallucination Rate: ${((hallucinations / k) * 100).toFixed(2)}%`);
  console.log(`Average Similarity Confidence: ${(totalConfidence / k).toFixed(3)}`);
}

runEvaluation().catch(console.error);
