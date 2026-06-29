import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectDashboardClient } from '@/app/(project)/dashboard/project-dashboard-client';

const mockProject = {
  id: 'proj-1',
  name: 'Test Project',
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  category: 'FinTech',
  short_description: 'Test desc',
};

const mockUpdates = [
  {
    id: 'upd-1',
    title: 'Первое обновление',
    created_at: '2026-01-15T00:00:00Z',
    ai_summary: 'AI summary текст',
  },
];

jest.mock('@/components/disclaimer', () => ({
  Disclaimer: () => React.createElement('div', { 'data-testid': 'disclaimer' }, 'Disclaimer'),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

function renderDashboard(
  props: Partial<React.ComponentProps<typeof ProjectDashboardClient>> = {}
) {
  return renderToStaticMarkup(
    React.createElement(ProjectDashboardClient, {
      project: props.project === undefined ? mockProject : props.project,
      viewsCount: props.viewsCount ?? 12,
      applicationsCount: props.applicationsCount ?? 3,
      recentUpdates: props.recentUpdates ?? [],
    })
  );
}

describe('T63 ProjectDashboardClient', () => {
  it('рендерится без проекта — показывает "Проект не найден" и ссылку на анкету', () => {
    const html = renderDashboard({ project: null });

    expect(html).toContain('Проект не найден');
    expect(html).toContain('href="/questionnaire"');
  });

  it('рендерится с проектом в статусе draft — показывает "Черновик"', () => {
    expect(renderDashboard()).toContain('Черновик');
  });

  it('рендерится с проектом в статусе submitted — показывает "На модерации"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'submitted' } })).toContain(
      'На модерации'
    );
  });

  it('рендерится с проектом в статусе approved — показывает "Опубликован"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'approved' } })).toContain(
      'Опубликован'
    );
  });

  it('рендерится с проектом в статусе rejected — показывает "Отклонён"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'rejected' } })).toContain(
      'Отклонён'
    );
  });

  it('отображает viewsCount в счётчике просмотров', () => {
    const html = renderDashboard({ viewsCount: 42 });

    expect(html).toContain('42');
    expect(html).toContain('Просмотров deal room');
  });

  it('отображает applicationsCount в счётчике заявок', () => {
    const html = renderDashboard({ applicationsCount: 9 });

    expect(html).toContain('9');
    expect(html).toContain('Заявок от инвесторов');
  });

  it('в статусе draft показывает кнопку "Отправить на модерацию"', () => {
    expect(renderDashboard()).toContain('Отправить на модерацию');
  });

  it('в статусе draft показывает кнопку "Редактировать анкету"', () => {
    expect(renderDashboard()).toContain('Редактировать анкету');
  });

  it('в статусе rejected показывает кнопку "Редактировать анкету"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'rejected' } })).toContain(
      'Редактировать анкету'
    );
  });

  it('в статусе approved показывает кнопку "Опубликовать обновление"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'approved' } })).toContain(
      'Опубликовать обновление'
    );
  });

  it('в статусе submitted НЕ показывает кнопку "Отправить на модерацию"', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'submitted' } })).not.toContain(
      'Отправить на модерацию'
    );
  });

  it('отображает список recentUpdates если они есть', () => {
    const html = renderDashboard({ recentUpdates: mockUpdates });

    expect(html).toContain('Последние обновления');
    expect(html).toContain('Первое обновление');
  });

  it('не рендерит секцию обновлений если recentUpdates пустой', () => {
    expect(renderDashboard({ recentUpdates: [] })).not.toContain('Последние обновления');
  });

  it('отображает ai_summary обновления если есть', () => {
    expect(renderDashboard({ recentUpdates: mockUpdates })).toContain('AI summary текст');
  });

  it('содержит ссылку на /documents в быстрых действиях для любого статуса', () => {
    expect(renderDashboard({ project: { ...mockProject, status: 'submitted' } })).toContain(
      'href="/documents"'
    );
  });
});
