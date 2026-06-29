import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>404 — Страница не найдена</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Запрашиваемая страница не существует или была перемещена
          </p>
          <Button asChild>
            <Link href="/">На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
