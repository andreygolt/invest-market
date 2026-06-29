'use client';

import { useState } from 'react';

import type { ApplicationNote } from '@/types';

interface Props {
  applicationId: string;
  initialNotes: ApplicationNote[];
  currentUserId: string;
  currentUserRole: string;
}

export function ApplicationNotes({
  applicationId,
  initialNotes,
  currentUserId,
  currentUserRole,
}: Props) {
  const [notes, setNotes] = useState<ApplicationNote[]>(initialNotes);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/manager/applications/${applicationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      const json = (await res.json()) as { error?: string; note?: ApplicationNote };

      if (!res.ok || !json.note) {
        setError(json.error ?? 'Ошибка');
        return;
      }

      setNotes((prev) => [...prev, json.note as ApplicationNote]);
      setContent('');
    } catch {
      setError('Ошибка сети');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    const res = await fetch(`/api/manager/applications/${applicationId}/notes/${noteId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Внутренние заметки</h2>

      {notes.length === 0 && <p className="text-sm text-gray-400">Заметок пока нет.</p>}

      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border bg-gray-50 p-3 text-sm">
            <p className="whitespace-pre-wrap">{note.content}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
              <span>
                {note.author_email ?? '-'} · {new Date(note.created_at).toLocaleString('ru-RU')}
              </span>
              {(note.author_id === currentUserId || currentUserRole === 'superadmin') && (
                <button
                  onClick={() => handleDelete(note.id)}
                  className="ml-2 text-red-400 hover:text-red-600"
                >
                  Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Добавить заметку..."
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{content.length}/2000</span>
          <button
            onClick={handleAdd}
            disabled={submitting || !content.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-40"
          >
            {submitting ? 'Сохраняю...' : 'Добавить заметку'}
          </button>
        </div>
      </div>
    </div>
  );
}
