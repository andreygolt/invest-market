import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InvestorCatalogItem } from '@/types';

interface CatalogCardProps {
  item: InvestorCatalogItem;
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a_plus: 'Series A+',
};

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  equity: 'Equity',
  convertible_note: 'Conv. Note',
  safe: 'SAFE',
  debt: 'Долг',
};

export function CatalogCard({ item }: CatalogCardProps) {
  return (
    <Link href={`/deals/${item.id}`} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight line-clamp-2">
              {item.name}
            </CardTitle>
            {item.ai_score !== null && (
              <Badge variant="outline" className="shrink-0 text-xs">
                AI {item.ai_score}/10
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {item.stage && (
              <Badge variant="secondary" className="text-xs">
                {STAGE_LABELS[item.stage] ?? item.stage}
              </Badge>
            )}
            {item.investment_type && (
              <Badge variant="outline" className="text-xs">
                {INVESTMENT_TYPE_LABELS[item.investment_type] ?? item.investment_type}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {item.description}
            </p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            {item.industry && (
              <p>
                <span className="font-medium">Отрасль:</span> {item.industry}
              </p>
            )}
            {(item.country || item.city) && (
              <p>
                <span className="font-medium">Локация:</span>{' '}
                {[item.city, item.country].filter(Boolean).join(', ')}
              </p>
            )}
            {item.investment_ask && (
              <p>
                <span className="font-medium">Запрос:</span> {item.investment_ask}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
