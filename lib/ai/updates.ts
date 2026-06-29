import { createAdminClient } from '@/lib/supabase/admin';

type ProjectUpdateSummaryRow = {
  title: string;
  body: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

async function createUpdateSummary(title: string, body: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Ты ассистент инвестиционной платформы. Создай краткое резюме обновления проекта в 1-2 предложениях для инвестора.',
        },
        {
          role: 'user',
          content: `Заголовок: ${title}\n\nТекст: ${body}`,
        },
      ],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function generateUpdateSummary(updateId: string): Promise<void> {
  const supabase = createAdminClient();

  try {
    const { data: update, error: loadError } = await supabase
      .from('project_updates')
      .select('title, body')
      .eq('id', updateId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!update) return;

    const { title, body } = update as ProjectUpdateSummaryRow;
    const summary = await createUpdateSummary(title, body);

    await supabase
      .from('project_updates')
      .update({ ai_summary: summary, updated_at: new Date().toISOString() })
      .eq('id', updateId);
  } catch (err) {
    console.error('[AI Updates] summary error:', err);
  }
}
