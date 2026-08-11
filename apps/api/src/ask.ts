import { hybridSearch } from './search.js';
import { generateAnswer } from './ai.js';

interface Citation {
  id: string;
  path: string;
  title: string | null;
  snippet: string;
}

interface AskResult {
  answer: string;
  citations: Citation[];
  warning?: string;
}

export async function askWorkspace(workspaceId: string, question: string): Promise<AskResult> {
  const results = await hybridSearch(workspaceId, question, 5);
  if (results.length === 0) {
    return {
      answer: 'I do not have enough information in this workspace to answer that question.',
      citations: [],
      warning: 'No relevant notes were found.',
    };
  }

  const citations: Citation[] = results.map((r) => ({
    id: r.id,
    path: r.path,
    title: r.title,
    snippet: r.content.slice(0, 300),
  }));

  const context = results
    .map((r, i) => `Source [${i + 1}] ${r.path}: ${r.title ?? r.path}\n${r.content.slice(0, 800)}`)
    .join('\n\n');

  try {
    const data = await generateAnswer({ context, question });
    const warning = data.warning ?? (data.noLlm ? 'No configured language model.' : undefined);
    return { answer: data.answer, citations, warning };
  } catch (err) {
    // Fallback: return a grounded synthesis without an LLM call.
    const summary = `Based on ${results.length} relevant note(s):\n${results.map((r) => `- ${r.path}: ${r.title ?? r.path}`).join('\n')}`;
    return { answer: summary, citations, warning: 'AI service unavailable; showing note list only.' };
  }
}
