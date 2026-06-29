import type { PortfolioRow, PortfolioStats } from '@/types';

export function computePortfolioStats(entries: PortfolioRow[]): PortfolioStats {
  return {
    total_entries: entries.length,
    total_invested: entries.reduce((s, e) => s + e.amount_invested, 0),
    total_active: entries.filter((e) => e.deal_status === 'active').length,
    total_exited: entries.filter((e) => e.deal_status === 'exited').length,
    total_written_off: entries.filter((e) => e.deal_status === 'written_off').length,
    total_exit_amount: entries.reduce((s, e) => s + (e.exit_amount ?? 0), 0),
  };
}
