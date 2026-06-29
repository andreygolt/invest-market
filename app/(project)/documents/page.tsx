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
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Загрузка...</p></div>;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Документы проекта</h1>
          <p className="text-sm text-gray-500 mt-1">Загрузите необходимые документы для андеррайтинга. Максимальный размер файла — 20 МБ.</p>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

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
              <div key={dt.value} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-sm">{dt.label}</span>
                    {dt.required && <span className="ml-2 text-xs text-red-500">обязательно</span>}
                  </div>
                  <button
                    onClick={() => triggerUpload(dt.value)}
                    disabled={uploading === dt.value}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {uploading === dt.value ? 'Загружаем...' : '+ Загрузить'}
                  </button>
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-gray-400">Файлы не загружены</p>
                ) : (
                  <ul className="space-y-1">
                    {docs.map(doc => (
                      <li key={doc.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate max-w-xs">{doc.filename}</span>
                        <button
                          onClick={() => deleteDoc(doc.id)}
                          className="text-red-500 hover:underline text-xs ml-2 shrink-0"
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

        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            Все загруженные документы будут использованы исключительно для AI-анализа и проверки модератором.
            Платформа не передаёт документы третьим лицам без вашего согласия.
          </p>
        </div>
      </div>
    </main>
  );
}
