import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ManagerDashboardClient } from '@/app/(manager)/manager/dashboard/manager-dashboard-client';
import type { ManagerDashboardData } from '@/types';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

const emptyData: ManagerDashboardData = {
  stats: { pending: 0, approved: 0, rejected: 0, cancelled: 0 },
  recentApplications: [],
};

const filledData: ManagerDashboardData = {
  stats: { pending: 3, approved: 10, rejected: 2, cancelled: 1 },
  recentApplications: [
    {
      id: 'app-1',
      status: 'pending',
      amount: 500000,
      instrument: 'equity',
      created_at: '2026-06-01T10:00:00Z',
      project_name: 'Alpha Project',
      investor_email: 'investor@example.com',
    },
  ],
};

function renderDashboard(data: ManagerDashboardData) {
  return renderToStaticMarkup(React.createElement(ManagerDashboardClient, { data }));
}

describe('T64 ManagerDashboardClient', () => {
  it('рендерится с нулевой статистикой без ошибок', () => {
    expect(renderDashboard(emptyData)).toContain('Кабинет менеджера');
  });

  it('отображает счётчик pending', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('3');
    expect(html).toContain('Ожидают');
  });

  it('отображает счётчик approved', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('10');
    expect(html).toContain('Одобрены');
  });

  it('отображает счётчик rejected', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('2');
    expect(html).toContain('Отклонены');
  });

  it('отображает счётчик cancelled', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('1');
    expect(html).toContain('Отменены');
  });

  it('содержит ссылку "Обработать заявки" ведущую на /manager/applications?status=pending', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('Обработать заявки');
    expect(html).toContain('href="/manager/applications?status=pending"');
  });

  it('содержит ссылку "Все заявки" ведущую на /manager/applications', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('Все заявки');
    expect(html).toContain('href="/manager/applications"');
  });

  it('отображает список recentApplications если они есть', () => {
    expect(renderDashboard(filledData)).toContain('Последние заявки');
  });

  it('не рендерит секцию "Последние заявки" если recentApplications пустой', () => {
    expect(renderDashboard(emptyData)).not.toContain('Последние заявки');
  });

  it('отображает project_name в списке последних заявок', () => {
    expect(renderDashboard(filledData)).toContain('Alpha Project');
  });

  it('отображает investor_email в списке последних заявок', () => {
    expect(renderDashboard(filledData)).toContain('investor@example.com');
  });

  it('форматирует amount с разрядами', () => {
    expect(renderDashboard(filledData)).toContain('500 000 ₽');
  });

  it('отображает метку статуса для каждой заявки в списке', () => {
    expect(renderDashboard(filledData)).toContain('Ожидают');
  });

  it('ссылки на счётчиках ведут на /manager/applications?status=<status>', () => {
    const html = renderDashboard(filledData);

    expect(html).toContain('href="/manager/applications?status=pending"');
    expect(html).toContain('href="/manager/applications?status=approved"');
    expect(html).toContain('href="/manager/applications?status=rejected"');
    expect(html).toContain('href="/manager/applications?status=cancelled"');
  });

  it('отображает заголовок "Кабинет менеджера"', () => {
    expect(renderDashboard(filledData)).toContain('Кабинет менеджера');
  });
});
