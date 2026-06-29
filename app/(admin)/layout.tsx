import { NavLink } from '@/components/nav-link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-4 py-1">
            <span className="text-slate-900 font-semibold shrink-0">Invest Market — Администратор</span>
            <nav className="flex gap-3 text-sm flex-wrap">
              <NavLink href="/admin/dashboard" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Dashboard
              </NavLink>
              <NavLink href="/moderation" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Модерация
              </NavLink>
              <NavLink href="/admin/applications" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Заявки
              </NavLink>
              <NavLink href="/users" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Пользователи
              </NavLink>
              <NavLink href="/admin/invites" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Инвайты
              </NavLink>
              <NavLink href="/settings" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Настройки
              </NavLink>
              <NavLink href="/profile" className="text-slate-700 hover:text-slate-900 font-medium transition-colors" activeClassName="text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5">
                Профиль
              </NavLink>
            </nav>
            <div className="ml-auto shrink-0">
              {userId && <NotificationBell initialUnread={unread} userId={userId} />}
            </div>
          </div>
          <div className="flex gap-3 text-xs pb-1 flex-wrap border-t border-slate-100 pt-1">
            <span className="text-slate-400 shrink-0">Отчёты:</span>
            <NavLink href="/admin/analytics" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Аналитика
            </NavLink>
            <NavLink href="/admin/funnel" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Воронка
            </NavLink>
            <NavLink href="/admin/investors-activity" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Инвесторы
            </NavLink>
            <NavLink href="/admin/export" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Экспорт
            </NavLink>
            <NavLink href="/admin/audit-log" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Журнал
            </NavLink>
            <NavLink href="/admin/notifications" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Объявления
            </NavLink>
            <NavLink href="/admin/referral-rewards" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Реферальные вознаграждения
            </NavLink>
            <NavLink href="/admin/search" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Поиск
            </NavLink>
            <NavLink href="/admin/commercial-terms" exact className="text-slate-500 hover:text-slate-800 transition-colors" activeClassName="text-slate-800 font-medium">
              Коммерческие условия
            </NavLink>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
