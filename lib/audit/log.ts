import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditLogInsert } from '@/types';

export async function writeAuditLog(entry: AuditLogInsert): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('admin_audit_log').insert(entry);
  } catch {}
}
