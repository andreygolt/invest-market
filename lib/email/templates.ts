const PLATFORM_NAME = process.env.PLATFORM_NAME ?? 'Invest Market';

export function notificationEmailTemplate(params: {
  recipientName: string;
  subject: string;
  message: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const cta = params.ctaUrl
    ? `<p style="margin:24px 0;">
        <a href="${params.ctaUrl}"
           style="background:#111827;color:#fff;padding:10px 20px;
                  border-radius:6px;text-decoration:none;font-size:14px;">
          ${params.ctaLabel ?? 'Открыть'}
        </a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>${params.subject}</title></head>
<body style="font-family:sans-serif;color:#111827;background:#f9fafb;padding:40px 0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;
              border-radius:8px;border:1px solid #e5e7eb;padding:32px;">
    <h2 style="margin:0 0 16px;font-size:20px;">${PLATFORM_NAME}</h2>
    <p style="color:#6b7280;margin:0 0 16px;">Здравствуйте, ${params.recipientName}!</p>
    <p style="line-height:1.6;">${params.message}</p>
    ${cta}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      Автоматическое письмо от платформы ${PLATFORM_NAME}. Не отвечайте на него.
    </p>
  </div>
</body>
</html>`;
}
