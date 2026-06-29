import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ApplyDonePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center">
        <Card className="w-full">
          <CardContent className="p-8 text-center">
            <h1 className="text-3xl font-semibold">Заявка отправлена</h1>
            <p className="mt-3 text-slate-600">
              Мы изучим ваш проект и свяжемся с вами в ближайшее время.
            </p>
            <Button asChild className="mt-6">
              <Link href="/">На главную</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
