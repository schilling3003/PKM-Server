const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${aiUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`AI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}
