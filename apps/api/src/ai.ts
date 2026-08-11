const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const aiKey = process.env.AI_SERVICE_API_KEY;

if (process.env.NODE_ENV === 'production' && !aiKey) {
  throw new Error('AI_SERVICE_API_KEY is required in production');
}

function aiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (aiKey) headers['X-API-Key'] = aiKey;
  return headers;
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${aiUrl}/embed`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`AI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function generateAnswer(params: { context: string; question: string }): Promise<{ answer: string }> {
  const res = await fetch(`${aiUrl}/ask`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ context: params.context, question: params.question }),
  });
  if (!res.ok) {
    throw new Error(`AI ask failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { answer: string };
  return data;
}
