/**
 * Fire-and-forget: отправить email для уведомления с данным ID.
 * Не блокирует основной запрос. Ошибки игнорируются — email не критичен.
 */
export function dispatchNotificationEmail(notificationId: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const secret = process.env.INTERNAL_API_SECRET ?? '';

  fetch(`${appUrl}/api/notifications/dispatch-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ notification_id: notificationId }),
  }).catch(() => {
    // intentionally silent
  });
}
