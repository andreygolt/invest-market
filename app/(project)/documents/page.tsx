'use client';
import { useState, useEffect, useRef } from 'react';
import type { ProjectDocument, DocumentType } from '@/types';

const DOC_TYPES: { value: DocumentType; label: string; required: boolean }[] = [
  { value: 'pitch_deck', label: 'Pitch Deck', required: true },
  { value: 'financial_model', label: 'Финансовая модель', required: false },
  { value: 'charter', label: 'Устав / учредительные документы', required: false },
  { value: 'team_cv', label: 'CV команды', required: false },
  { value: 'legal_docs', label: 'Юридические документы', required: false },
  { value: 'other', label: 'Прочее', required: false },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<DocumentType | null>(null);

  useEffect(() => {
    fetch('/api/project/documents')
      .then(r => r.json())
      .then((d: { documents: ProjectDocument[] }) => {
        setDocuments(d.documents);
        setLoading(false);
      });
  }, []);

  function triggerUpload(docType: DocumentType) {
    setPendingDocType(docType);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingDocType) return;
    e.target.value = '';

    setUploading(pendingDocType);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', pendingDocType);

    const r = await fetch('/api/project/documents/upload', { method: 'POST', body: formData });
    const d = await r.json() as { document?: ProjectDocument; error?: string };

    if (!r.ok || !d.document) {
      setError(d.error ?? 'Ошибка загрузки');
    } else {
      setDocuments(prev => [d.document!, ...prev]);
    }
    setUploading(null);
    setPendingDocType(null);
  }

  async function deleteDoc(id: string) {
    const r = await fetch(`/api/project/documents/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setDocuments(prev => prev.filter(d => d.id !== id));
    }
  }

  const byType = (type: DocumentType) => documents.filter(d => d.doc_type === type);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]"><p className="text-slate-500">Загрузка...</p></div>;
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Документы проекта</h1>
          <p className="text-sm text-slate-500 mt-1">Загрузите необходимые документы для андеррайтинга. Максимальный размер файла — 20 МБ.</p>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xls,.xlsx,.ppt,.pptx,.doc,.docx"
          onChange={handleFileChange}
        />

        <div className="space-y-4">
          {DOC_TYPES.map(dt => {
            const docs = byType(dt.value);
            return (
              <div key={dt.value} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-sm text-slate-300">{dt.label}</span>
                    {dt.required && <span className="ml-2 text-xs text-red-400">обязательно</span>}
                  </div>
                  <button
                    onClick={() => triggerUpload(dt.value)}
                    disabled={uploading === dt.value}
                    className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
                  >
                    {uploading === dt.value ? 'Загружаем...' : '+ Загрузить'}
                  </button>
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-slate-600">Файлы не загружены</p>
                ) : (
                  <ul className="space-y-1">
                    {docs.map(doc => (
                      <li key={doc.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400 truncate max-w-xs">{doc.filename}</span>
                        <button
                          onClick={() => deleteDoc(doc.id)}
                          className="text-red-400 hover:text-red-300 text-xs ml-2 shrink-0"
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-4 rounded-xl border border-slate-800 bg-slate-900">
          <p className="text-xs text-slate-500">
            Все загруженные документы будут использованы исключительно для AI-анализа и проверки модератором.
            Платформа не передаёт документы третьим лицам без вашего согласия.
          </p>
        </div>
      </div>
    </main>
  );
}
