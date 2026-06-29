'use client';
import { useState, useEffect, useRef } from 'react';

interface ProjectData {
  status: string;
  video_path: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'На модерации',
  under_review: 'Рассматривается',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function SubmitPage() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/project/my')
      .then(r => r.json())
      .then((d: { project?: ProjectData }) => {
        setProject(d.project ?? null);
        setLoading(false);
      });
  }, []);

  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    const r = await fetch('/api/project/video', { method: 'POST', body: formData });
    const d = await r.json() as { video_path?: string; error?: string };

    if (!r.ok) {
      setError(d.error ?? 'Ошибка загрузки видео');
    } else {
      setProject(prev => prev ? { ...prev, video_path: d.video_path ?? null } : null);
      setSuccess('Видео загружено успешно');
    }
    setUploading(false);
  }

  async function deleteVideo() {
    setError('');
    const r = await fetch('/api/project/video', { method: 'DELETE' });
    if (r.ok) {
      setProject(prev => prev ? { ...prev, video_path: null } : null);
      setSuccess('Видео удалено');
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setSuccess('');

    const r = await fetch('/api/project/submit', { method: 'POST' });
    const d = await r.json() as { status?: string; error?: string };

    if (!r.ok) {
      setError(d.error ?? 'Ошибка отправки');
    } else {
      setProject(prev => prev ? { ...prev, status: 'submitted' } : null);
      setSuccess('Проект отправлен на модерацию');
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Загрузка...</p></div>;
  }

  if (!project) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Проект не найден</p></div>;
  }

  const isDraft = project.status === 'draft';
  const statusLabel = STATUS_LABELS[project.status] ?? project.status;
  const statusColor = STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-700';

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Статус */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-semibold mb-4">Статус заявки</h1>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          {!isDraft && (
            <p className="text-sm text-gray-500 mt-3">
              Ваш проект передан на проверку. Мы свяжемся с вами по результатам модерации.
            </p>
          )}
        </div>

        {/* Видео-питч */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-2">Видео-питч</h2>
          <p className="text-sm text-gray-500 mb-4">
            Короткое вертикальное видео до 2 минут (формат MP4 или MOV, до 200 МБ).
            Расскажите о проекте своими словами.
          </p>

          {project.video_path ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-green-800 flex-1 truncate">Видео загружено</span>
              {isDraft && (
                <button onClick={deleteVideo} className="text-red-500 text-xs hover:underline shrink-0">
                  Удалить
                </button>
              )}
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
                className="hidden"
                onChange={handleVideoChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !isDraft}
                className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 disabled:opacity-50 w-full text-center"
              >
                {uploading ? 'Загружаем...' : '+ Загрузить видео-питч'}
              </button>
            </div>
          )}
        </div>

        {/* Сообщения */}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">{success}</p>}

        {/* Отправка */}
        {isDraft && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-2">Отправить на модерацию</h2>
            <p className="text-sm text-gray-500 mb-4">
              После отправки редактирование анкеты будет недоступно. Убедитесь, что все данные заполнены корректно.
            </p>
            <p className="text-xs text-gray-400 bg-gray-50 border rounded p-3 mb-4">
              Платформа не принимает денежные средства. Все переговоры и оформление сделки происходят напрямую между проектом и инвестором вне платформы.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Отправляем...' : 'Отправить проект на модерацию'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
