'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminApplicationItem, ApplicationFilterStatus } from '@/types';

interface ApplicationsClientProps {
  applications: AdminApplicationItem[];
}

const STATUS_LABELS: Record<AdminApplicationItem['status'], string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  cancelled: 'Отменено',
};

const STATUS_BADGES: Record<AdminApplicationItem['status'], string> = {
  pending: 'border-yellow-200 bg-yellow-100 text-yellow-900',
  approved: 'border-green-200 bg-green-100 text-green-900',
  rejected: 'border-red-200 bg-red-100 text-red-900',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-900',
};

function formatAmount(amount: number | null) {
  if (amount === null) return 'Не указана';
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function getInvestorLabel(application: AdminApplicationItem) {
  return application.investor_email ?? application.investor_id;
}

export function ApplicationsClient({ applications }: ApplicationsClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState('all');
  const [status, setStatus] = useState<ApplicationFilterStatus>('all');
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    applications.forEach((application) => {
      map.set(application.project_id, application.project_name ?? application.project_id);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, 'ru')
    );
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesProject = projectId === 'all' || application.project_id === projectId;
      const matchesStatus = status === 'all' || application.status === status;
      const investor = getInvestorLabel(application).toLowerCase();
      const matchesSearch = !normalizedSearch || investor.includes(normalizedSearch);

      return matchesProject && matchesStatus && matchesSearch;
    });
  }, [applications, projectId, search, status]);

  const counters = useMemo(
    () => ({
      total: filteredApplications.length,
      pending: filteredApplications.filter((application) => application.status === 'pending').length,
      approved: filteredApplications.filter((application) => application.status === 'approved').length,
      rejected: filteredApplications.filter((application) => application.status === 'rejected').length,
      cancelled: filteredApplications.filter((application) => application.status === 'cancelled').length,
    }),
    [filteredApplications]
  );

  function updateStatus(id: string, nextStatus: 'approved' | 'rejected') {
    setPendingId(id);
    startTransition(async () => {
      await fetch(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Заявки инвесторов</h1>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_260px]">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue placeholder="Проект" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все проекты</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ApplicationFilterStatus)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидают</SelectItem>
            <SelectItem value="approved">Одобрено</SelectItem>
            <SelectItem value="rejected">Отклонено</SelectItem>
            <SelectItem value="cancelled">Отменено</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Имя или email инвестора"
        />
      </div>

      <div className="mb-4 text-sm text-slate-600">
        Всего: {counters.total} | Ожидают: {counters.pending} | Одобрено: {counters.approved} |{' '}
        Отклонено: {counters.rejected} | Отменено: {counters.cancelled}
      </div>

      {filteredApplications.length === 0 ? (
        <div className="rounded-md border py-12 text-center text-sm text-slate-500">
          Нет заявок по выбранным фильтрам
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Инвестор</TableHead>
              <TableHead>Проект</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredApplications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>{getInvestorLabel(application)}</TableCell>
                <TableCell>{application.project_name ?? application.project_id}</TableCell>
                <TableCell>{formatAmount(application.amount)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_BADGES[application.status]}>
                    {STATUS_LABELS[application.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(application.created_at).toLocaleDateString('ru-RU')}
                </TableCell>
                <TableCell>
                  {application.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isPending && pendingId === application.id}
                        onClick={() => updateStatus(application.id, 'approved')}
                      >
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending && pendingId === application.id}
                        onClick={() => updateStatus(application.id, 'rejected')}
                      >
                        Отклонить
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
