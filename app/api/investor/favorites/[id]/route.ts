import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorPersonalStatus } from '@/types';

// PATCH /api/investor/favorites/[id]
// Body: { investor_id, notes?, personal_status? }
// Обновляет notes и/или personal_status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: favoriteId } = await params;

  const body = (await request.json()) as {
    investor_id?: string;
    notes?: string | null;
    personal_status?: InvestorPersonalStatus | null;
  };

  const { investor_id, notes, personal_status } = body;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_favorites')
    .select('id, investor_id')
    .eq('id', favoriteId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  if (existing.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (notes !== undefined) updatePayload.notes = notes;
  if (personal_status !== undefined) updatePayload.personal_status = personal_status;

  const { data, error } = await supabase
    .from('investor_favorites')
    .update(updatePayload)
    .eq('id', favoriteId)
    .select('id, investor_id, project_id, notes, personal_status, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/investor/favorites/[id]?investor_id=xxx
// Удаляет запись из избранного
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: favoriteId } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_favorites')
    .select('id, investor_id')
    .eq('id', favoriteId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  if (existing.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const { error } = await supabase.from('investor_favorites').delete().eq('id', favoriteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
