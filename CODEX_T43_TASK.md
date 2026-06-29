# T43 — Документы проекта в Deal Room для инвестора

## Контекст

В T3 реализована загрузка документов владельцем проекта: файлы хранятся в Supabase Storage
(bucket `documents`), метаданные — в таблице `project_documents`.

В T9 создан Deal Room для инвестора (`/deals/[id]`): страница проекта с анкетными данными,
AI-анализом, калькулятором доходности и обновлениями проекта.

Однако инвестор **не видит и не может скачать документы** проекта. Это критический пробел:
основная цель Deal Room — предоставить инвестору полную информацию для due diligence,
включая первичные документы (презентации, финансовые модели, юридические документы и т.д.).

T43 добавляет в Deal Room раздел «Документы проекта» со списком файлов и подписанными
ссылками для скачивания (TTL 1 час).

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить интерфейс:

```typescript
export interface InvestorDocumentItem {
  id: string
  document_type: DocumentType
  file_name: string
  file_size: number | null
  created_at: string
  download_url: string  // подписанная ссылка Supabase Storage, TTL 3600 сек
}
```

> `DocumentType` уже определён в `types/index.ts` (из T3). Не дублировать.
> Не трогать остальные типы.

### 2. Создать `app/api/investor/deals/[id]/documents/route.ts`

**GET /api/investor/deals/[id]/documents**

- `[id]` — project_id
- 401 если пользователь не авторизован (`createServerClient()` + `getUser()`)
- Проверить проект через `createAdminClient()`: `status === 'approved'`
- 404 если проект не найден или `status !== 'approved'`
- Получить все документы проекта из `project_documents`:

```typescript
const { data: docs } = await adminSupabase
  .from('project_documents')
  .select('id, document_type, file_name, file_path, file_size, created_at')
  .eq('project_id', projectId)
  .order('created_at', { ascending: true })
```

- Для каждого документа создать подписанный URL через Storage:

```typescript
const items: InvestorDocumentItem[] = []
for (const doc of docs ?? []) {
  const { data: urlData } = await adminSupabase.storage
    .from('documents')
    .createSignedUrl(doc.file_path, 3600)
  if (urlData?.signedUrl) {
    items.push({
      id: doc.id,
      document_type: doc.document_type as DocumentType,
      file_name: doc.file_name,
      file_size: doc.file_size,
      created_at: doc.created_at,
      download_url: urlData.signedUrl,
    })
  }
  // Если signedUrl не создан — пропустить документ (не ломать список)
}

return NextResponse.json(items)
```

Пустой список `[]` — корректный ответ (200), если документов нет.

### 3. Обновить `app/(investor)/deals/[id]/page.tsx`

#### 3a. Загрузить документы параллельно с основными данными

Существующий код делает fetch к `/api/investor/deals/[id]`. Добавить параллельный
запрос к `/api/investor/deals/[id]/documents`:

```typescript
const [dealRes, docsRes] = await Promise.all([
  fetch(`${baseUrl}/api/investor/deals/${params.id}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  }),
  fetch(`${baseUrl}/api/investor/deals/${params.id}/documents`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  }),
])

const deal = dealRes.ok ? await dealRes.json() : null
const documents: InvestorDocumentItem[] = docsRes.ok ? await docsRes.json() : []
```

> Ошибка загрузки документов (`!docsRes.ok`) не должна ломать страницу — просто показать
> пустой список (graceful degradation).

#### 3b. Добавить раздел «Документы проекта» в JSX

Разместить после обновлений проекта (или в конце страницы, перед дисклеймером):

```tsx
{documents.length > 0 && (
  <section className="mt-6">
    <h2 className="text-lg font-semibold mb-3">Документы проекта</h2>
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between rounded-md border px-4 py-3"
        >
          <div>
            <div className="text-sm font-medium">{doc.file_name}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {doc.document_type}
              {doc.file_size
                ? ` · ${Math.round(doc.file_size / 1024)} КБ`
                : ''}
            </div>
          </div>
          <a
            href={doc.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-4 shrink-0 text-sm text-blue-600 hover:underline"
          >
            Скачать
          </a>
        </li>
      ))}
    </ul>
  </section>
)}
```

> Если `documents` пуст — раздел не отображается (нет пустого блока).

### 4. Тесты — `__tests__/t43.test.ts`

```typescript
// 1. GET /api/investor/deals/[id]/documents — 401 без авторизации
// 2. GET /api/investor/deals/[id]/documents — 404 если проект не найден
// 3. GET /api/investor/deals/[id]/documents — 404 если project.status !== 'approved'
// 4. GET /api/investor/deals/[id]/documents — 200 возвращает массив InvestorDocumentItem
// 5. GET /api/investor/deals/[id]/documents — каждый элемент содержит id, document_type, file_name, file_size, created_at, download_url
// 6. GET /api/investor/deals/[id]/documents — вызывает createSignedUrl для каждого документа
// 7. GET /api/investor/deals/[id]/documents — документы без signedUrl пропускаются (не включаются в ответ)
// 8. GET /api/investor/deals/[id]/documents — пустой массив [] если нет документов (200, не 404)
// 9. GET /api/investor/deals/[id]/documents — download_url равен результату createSignedUrl
// 10. GET /api/investor/deals/[id]/documents — документы упорядочены по created_at ascending
// 11. InvestorDocumentItem тип содержит поле download_url: string
// 12. GET /api/investor/deals/[id]/documents — file_size может быть null (не ломает ответ)
```

### Структура моков для тестов

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  })),
}))

const mockCreateSignedUrl = jest.fn().mockResolvedValue({
  data: { signedUrl: 'https://storage.example.com/signed?token=abc' },
  error: null,
})

const mockDocs = [
  {
    id: 'doc-1',
    document_type: 'pitch_deck',
    file_name: 'pitch.pdf',
    file_path: 'proj-1/pitch.pdf',
    file_size: 102400,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'doc-2',
    document_type: 'financial_model',
    file_name: 'model.xlsx',
    file_path: 'proj-1/model.xlsx',
    file_size: null,
    created_at: '2026-01-02T00:00:00Z',
  },
]

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'proj-1', status: 'approved' },
            error: null,
          }),
        }
      }
      if (table === 'project_documents') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockDocs, error: null }),
        }
      }
      return { select: jest.fn().mockReturnThis() }
    }),
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}))
```

> Подсказка: для теста «документы без signedUrl пропускаются» — сделать
> `mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'error' } })`
> для первого вызова. В ответе должен быть только второй документ.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не добавлять новые миграции — `project_documents` уже существует (из T3)
- Использовать `createAdminClient()` для чтения документов и Storage (обходит RLS)
- Signed URL с TTL 3600 секунд — ссылка работает 1 час после запроса
- Документы показываются ТОЛЬКО для проектов со статусом `approved`
- Ошибка подписанного URL для одного файла не должна ломать список остальных
- Ошибка загрузки документов не должна ломать Deal Room страницу (graceful degradation)
- Не трогать файлы кроме указанных: `types/index.ts`, `app/api/investor/deals/[id]/documents/route.ts`, `app/(investor)/deals/[id]/page.tsx`, `__tests__/t43.test.ts`

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t43.test.ts)
4. `GET /api/investor/deals/[id]/documents` — 401 без auth, 404 если не approved, 200 со списком
5. Каждый документ в ответе содержит `download_url` — подписанную Storage ссылку
6. Deal Room страница инвестора показывает раздел «Документы проекта» при наличии файлов
7. Каждый файл — строка с именем, типом, размером и ссылкой «Скачать»
8. При отсутствии документов раздел не отображается (не пустой блок)
9. Записать в `progress.md`: `DONE: T43 + что создано/изменено`
