import { embed } from './ai.js';

const MAX_CHUNK_LENGTH = 512;

function splitLongChunk(chunk: string): string[] {
  if (chunk.length <= MAX_CHUNK_LENGTH) return [chunk];
  const sentences = chunk.split(/(?<=\.\s)/);
  const result: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_LENGTH && current.length > 0) {
      result.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) result.push(current.trim());
  return result.length ? result : [chunk.slice(0, MAX_CHUNK_LENGTH)];
}

export function generateChunks(body: string): string[] {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    chunks.push(...splitLongChunk(paragraph));
  }
  return chunks;
}

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  return Promise.all(chunks.map((chunk) => embed(chunk)));
}
