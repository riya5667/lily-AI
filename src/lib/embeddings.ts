import { HfInference } from '@huggingface/inference';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await hf.featureExtraction({
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text.replace(/\n/g, ' '),
  });

  return response as number[];
}

export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      // Calculate overlap backstep
      const overlapWords = currentChunk.slice(-Math.floor(overlap / 5)); // rough word estimate for overlap
      currentChunk = [...overlapWords];
      currentLength = currentChunk.join(' ').length;
    }
    currentChunk.push(word);
    currentLength += word.length + 1; // +1 for space
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}
