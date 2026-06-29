import type { DisclaimerVariant } from '@/types';
import { Card } from '@/components/ui/card';

export const DISCLAIMER_TEXT =
  'Платформа не является брокером, инвестиционным советником или ' +
  'организатором торгов. Размещённая информация носит ознакомительный ' +
  'характер и не является офертой, гарантией доходности или инвестиционной ' +
  'рекомендацией. Все сделки заключаются вне платформы. Инвестирование ' +
  'связано с риском потери вложенных средств.';

interface Props {
  variant?: DisclaimerVariant;
}

export function Disclaimer({ variant = 'default' }: Props) {
  if (variant === 'compact') {
    return <p className="text-xs text-muted-foreground">{DISCLAIMER_TEXT}</p>;
  }

  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{DISCLAIMER_TEXT}</p>
    </Card>
  );
}
