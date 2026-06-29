import { createAdminClient } from '@/lib/supabase/admin';

type ProjectDocumentRow = {
  id: string;
  storage_path: string;
  filename: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

/**
 * Загружает файл из Supabase Storage и возвращает base64-строку с MIME-типом.
 */
async function downloadFileAsBase64(
  bucket: string,
  path: string
): Promise<{ base64: string; mimeType: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);

  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const mimeType = mimeMap[ext] ?? 'application/octet-stream';

  return { base64, mimeType };
}

async function createChatCompletion(body: object): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Извлекает текст из документа через GPT-4o.
 * Поддерживает PDF (как изображение) и текстовые форматы.
 */
async function extractTextFromFile(
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  const isVisual = ['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType);

  if (isVisual) {
    return createChatCompletion({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Извлеки весь текст из документа "${fileName}" и верни его как есть, без изменений. Если документ содержит таблицы — сохрани структуру через табуляцию. Не добавляй комментариев.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });
  }

  return createChatCompletion({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Ниже находится base64-закодированный файл "${fileName}" (${mimeType}). Декодируй и извлеки весь текстовый контент. Верни только текст документа.\n\n${base64.slice(0, 8000)}`,
      },
    ],
    max_tokens: 4096,
  });
}

async function markProcessing(document: ProjectDocumentRow, projectId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('document_extractions')
    .select('id')
    .eq('document_id', document.id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('document_extractions')
      .update({
        status: 'processing',
        extracted_text: null,
        error_message: null,
        updated_at: now,
      })
      .eq('id', existing.id);

    return error ? null : existing.id;
  }

  const { data: created, error } = await supabase
    .from('document_extractions')
    .insert({
      document_id: document.id,
      project_id: projectId,
      status: 'processing',
      extracted_text: null,
      error_message: null,
      updated_at: now,
    })
    .select('id')
    .single();

  return error ? null : created.id;
}

/**
 * Pipeline: обрабатывает все документы проекта.
 * Создаёт/обновляет записи в document_extractions.
 */
export async function runExtractionPipeline(projectId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: documents, error: docsError } = await supabase
    .from('project_documents')
    .select('id, storage_path, filename')
    .eq('project_id', projectId);

  if (docsError || !documents || documents.length === 0) return;

  for (const doc of documents as ProjectDocumentRow[]) {
    const extractionId = await markProcessing(doc, projectId);
    if (!extractionId) continue;

    try {
      const { base64, mimeType } = await downloadFileAsBase64('project-docs', doc.storage_path);
      const text = await extractTextFromFile(base64, mimeType, doc.filename || 'document');

      await supabase
        .from('document_extractions')
        .update({ status: 'done', extracted_text: text, updated_at: new Date().toISOString() })
        .eq('id', extractionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('document_extractions')
        .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', extractionId);
    }
  }

  // Запускаем AI-анализ асинхронно после извлечения всех текстов
  const { runAnalysisPipeline } = await import('@/lib/ai/analyze');
  runAnalysisPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Extract] analysis trigger error:', err);
  });
}
