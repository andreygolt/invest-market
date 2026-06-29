import type { SupabaseClient } from '@supabase/supabase-js';

type ParentLink = {
  referrer_id: string;
};

type LinkInsert = {
  referrer_id: string;
  referee_id: string;
  level: 1 | 2 | 3;
};

async function findDirectReferrer(
  supabaseAdmin: SupabaseClient,
  refereeId: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('referral_links')
    .select('referrer_id')
    .eq('referee_id', refereeId)
    .eq('level', 1)
    .maybeSingle();

  return ((data as ParentLink | null) ?? null)?.referrer_id ?? null;
}

// Строит реферальные связи 2-го и 3-го уровня при регистрации нового пользователя
export async function buildReferralLinks(
  supabaseAdmin: SupabaseClient,
  refereeId: string,
  directReferrerId: string
): Promise<void> {
  const links: LinkInsert[] = [
    {
      referrer_id: directReferrerId,
      referee_id: refereeId,
      level: 1,
    },
  ];

  const level2ReferrerId = await findDirectReferrer(supabaseAdmin, directReferrerId);
  if (level2ReferrerId) {
    links.push({
      referrer_id: level2ReferrerId,
      referee_id: refereeId,
      level: 2,
    });

    const level3ReferrerId = await findDirectReferrer(supabaseAdmin, level2ReferrerId);
    if (level3ReferrerId) {
      links.push({
        referrer_id: level3ReferrerId,
        referee_id: refereeId,
        level: 3,
      });
    }
  }

  const { error } = await supabaseAdmin
    .from('referral_links')
    .upsert(links, { onConflict: 'referrer_id,referee_id', ignoreDuplicates: true });

  if (error) {
    throw new Error(error.message);
  }
}
