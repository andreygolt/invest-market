import React from 'react';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApplicationNotes } from '@/components/manager/application-notes';
import type { ApplicationNote } from '@/types';
import { DELETE } from '@/app/api/manager/applications/[id]/notes/[note_id]/route';
import { GET, POST } from '@/app/api/manager/applications/[id]/notes/route';

type MockUser = { id: string } | null;
type MockAuthor = { id: string | null; email: string | null };

let mockUser: MockUser = { id: 'manager-1' };
let mockRole = 'manager';
let mockNotes: ApplicationNote[] = [];
let mockAuthors: MockAuthor[] = [];
let mockInsertedNote: ApplicationNote | null = null;
let mockDeleteNote: Pick<ApplicationNote, 'id' | 'author_id'> | null = null;
let mockDeleteError: { message: string } | null = null;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
      }),
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'users') {
        const usersQuery = {
          select: jest.fn(() => usersQuery),
          eq: jest.fn(() => usersQuery),
          in: jest.fn().mockResolvedValue({ data: mockAuthors, error: null }),
          single: jest.fn().mockResolvedValue({
            data: mockRole ? { role: mockRole, id: 'manager-1', email: 'mgr@test.com' } : null,
            error: null,
          }),
        };
        return usersQuery;
      }

      if (table === 'application_notes') {
        let inserting = false;
        const notesQuery = {
          select: jest.fn(() => notesQuery),
          eq: jest.fn(() => notesQuery),
          order: jest.fn().mockResolvedValue({ data: mockNotes, error: null }),
          insert: jest.fn(() => {
            inserting = true;
            return notesQuery;
          }),
          delete: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: mockDeleteError }),
          })),
          single: jest.fn(() =>
            Promise.resolve({
              data: inserting ? mockInsertedNote : mockDeleteNote,
              error: null,
            })
          ),
        };
        return notesQuery;
      }

      return {};
    }),
  })),
}));

const mockNote: ApplicationNote = {
  id: 'note-1',
  application_id: 'app-1',
  author_id: 'user-1',
  content: 'Тестовая заметка',
  created_at: '2026-06-01T10:00:00Z',
  author_email: 'author@test.com',
};

function params(id = 'app-1') {
  return { params: Promise.resolve({ id }) };
}

function deleteParams(id = 'app-1', noteId = 'note-1') {
  return { params: Promise.resolve({ id, note_id: noteId }) };
}

function request(method = 'GET', body?: unknown) {
  return new NextRequest('http://localhost/api/manager/applications/app-1/notes', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function renderNotes(
  initialNotes: ApplicationNote[],
  currentUserId = 'user-1',
  currentUserRole = 'manager'
) {
  return renderToStaticMarkup(
    React.createElement(ApplicationNotes, {
      applicationId: 'app-1',
      initialNotes,
      currentUserId,
      currentUserRole,
    })
  );
}

beforeEach(() => {
  mockUser = { id: 'manager-1' };
  mockRole = 'manager';
  mockNotes = [mockNote];
  mockAuthors = [{ id: 'user-1', email: 'author@test.com' }];
  mockInsertedNote = {
    id: 'note-2',
    application_id: 'app-1',
    author_id: 'manager-1',
    content: 'Новая заметка',
    created_at: '2026-06-02T10:00:00Z',
  };
  mockDeleteNote = { id: 'note-1', author_id: 'manager-1' };
  mockDeleteError = null;
});

describe('T65 GET /api/manager/applications/[id]/notes', () => {
  it('возвращает 401 без авторизации', async () => {
    mockUser = null;

    const res = await GET(request(), params());

    expect(res.status).toBe(401);
  });

  it('возвращает 403 для роли investor', async () => {
    mockRole = 'investor';

    const res = await GET(request(), params());

    expect(res.status).toBe(403);
  });

  it('возвращает 200 и массив notes для роли manager', async () => {
    const res = await GET(request(), params());
    const json = (await res.json()) as { notes: ApplicationNote[] };

    expect(res.status).toBe(200);
    expect(Array.isArray(json.notes)).toBe(true);
    expect(json.notes[0].content).toBe('Тестовая заметка');
  });

  it('добавляет поле author_email к notes', async () => {
    const res = await GET(request(), params());
    const json = (await res.json()) as { notes: ApplicationNote[] };

    expect(json.notes[0].author_email).toBe('author@test.com');
  });
});

describe('T65 POST /api/manager/applications/[id]/notes', () => {
  it('возвращает 401 без авторизации', async () => {
    mockUser = null;

    const res = await POST(request('POST', { content: 'Новая заметка' }), params());

    expect(res.status).toBe(401);
  });

  it('возвращает 403 для роли investor', async () => {
    mockRole = 'investor';

    const res = await POST(request('POST', { content: 'Новая заметка' }), params());

    expect(res.status).toBe(403);
  });

  it('возвращает 400 если content пустой', async () => {
    const res = await POST(request('POST', { content: '   ' }), params());

    expect(res.status).toBe(400);
  });

  it('возвращает 400 если content длиннее 2000 символов', async () => {
    const res = await POST(request('POST', { content: 'x'.repeat(2001) }), params());

    expect(res.status).toBe(400);
  });

  it('возвращает 201 и созданную заметку при корректных данных', async () => {
    const res = await POST(request('POST', { content: 'Новая заметка' }), params());
    const json = (await res.json()) as { note: ApplicationNote };

    expect(res.status).toBe(201);
    expect(json.note.content).toBe('Новая заметка');
  });
});

describe('T65 DELETE /api/manager/applications/[id]/notes/[note_id]', () => {
  it('возвращает 401 без авторизации', async () => {
    mockUser = null;

    const res = await DELETE(request('DELETE'), deleteParams());

    expect(res.status).toBe(401);
  });

  it('возвращает 404 если заметка не найдена', async () => {
    mockDeleteNote = null;

    const res = await DELETE(request('DELETE'), deleteParams());

    expect(res.status).toBe(404);
  });

  it('возвращает 403 если автор не текущий user и роль не superadmin', async () => {
    mockDeleteNote = { id: 'note-1', author_id: 'other-user' };

    const res = await DELETE(request('DELETE'), deleteParams());

    expect(res.status).toBe(403);
  });

  it('возвращает 200 если автор текущий user', async () => {
    mockDeleteNote = { id: 'note-1', author_id: 'manager-1' };

    const res = await DELETE(request('DELETE'), deleteParams());
    const json = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('возвращает 200 если роль superadmin удаляет чужую заметку', async () => {
    mockRole = 'superadmin';
    mockDeleteNote = { id: 'note-1', author_id: 'other-user' };

    const res = await DELETE(request('DELETE'), deleteParams());

    expect(res.status).toBe(200);
  });
});

describe('T65 ApplicationNotes', () => {
  it('рендерится с пустым списком и показывает "Заметок пока нет."', () => {
    expect(renderNotes([])).toContain('Заметок пока нет.');
  });

  it('рендерится с одной заметкой и показывает content заметки', () => {
    expect(renderNotes([mockNote])).toContain('Тестовая заметка');
  });

  it('показывает author_email заметки', () => {
    expect(renderNotes([mockNote])).toContain('author@test.com');
  });

  it('показывает кнопку "Удалить" для своей заметки', () => {
    expect(renderNotes([mockNote], 'user-1')).toContain('Удалить');
  });

  it('не показывает кнопку "Удалить" для чужой заметки обычному manager', () => {
    expect(renderNotes([mockNote], 'other-user', 'manager')).not.toContain('Удалить');
  });

  it('показывает кнопку "Удалить" для чужой заметки superadmin', () => {
    expect(renderNotes([mockNote], 'other-user', 'superadmin')).toContain('Удалить');
  });
});
