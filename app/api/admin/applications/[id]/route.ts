import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit/log';
import { createNotification } from '@/lib/notifications/create';
import { notifyOwnerApplicationStatus } from '@/lib/notifications/notify-owner-application-status';
import type { AdminApplicationItem } from '@/types';
import { requireApplicationsAdmin } from '../route';

type ApplicationStatus = AdminApplicationItem['status'];

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

function isApplicationStatus(value: string | undefined): value is ApplicationStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'cancelled';
}

// GET /api/admin/applications/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApplicationsAdmin();
  if (auth.error) return auth.error;

  const supabase = createAdminClient();
  const { id: applicationId } = await params;

  const { data: application, error } = await supabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, instrument, status, message, created_at, updated_at, projects(id, name), users(email, full_name)'
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!application) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  return NextResponse.json({ application });
}

// PATCH /api/admin/applications/[id]
// Body: { status: ApplicationStatus, rejection_reason?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApplicationsAdmin();
  if (auth.error) return auth.error;

  const supabase = createAdminClient();
  const { id: applicationId } = await params;
  const body = (await request.json()) as { status?: string; rejection_reason?: string };
  const newStatus = body.status;
  const rejectionReason =
    typeof body.rejection_reason === 'string' ? body.rejection_reason.trim() : null;

  if (!isApplicationStatus(newStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, status, investor_id, project_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  const currentStatus = app.status as ApplicationStatus;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Нельзя перевести заявку из ${currentStatus} в ${newStatus}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('applications')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      rejection_reason: newStatus === 'rejected' ? (rejectionReason ?? null) : null,
    })
    .eq('id', applicationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (newStatus === 'approved' || newStatus === 'rejected') {
    void writeAuditLog({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: newStatus === 'approved' ? 'application_approved' : 'application_rejected',
      entity_type: 'application',
      entity_id: applicationId,
      meta: { status: newStatus, rejection_reason: rejectionReason },
    });
  }

  if (newStatus === 'approved' || newStatus === 'rejected') {
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', app.project_id)
      .maybeSingle();

    const projectName = project?.name ?? 'проект';

    void createNotification({
      user_id: app.investor_id,
      type: newStatus === 'approved' ? 'application_approved' : 'application_rejected',
      title: newStatus === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена',
      body:
        newStatus === 'approved'
          ? `Ваша заявка на участие в проекте «${projectName}» одобрена.`
          : rejectionReason
            ? `Ваша заявка на участие в проекте «${projectName}» отклонена. Причина: ${rejectionReason}`
            : `Ваша заявка на участие в проекте «${projectName}» отклонена.`,
      link: '/applications',
    });

    void notifyOwnerApplicationStatus({
      applicationId,
      projectId: app.project_id,
      newStatus,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
