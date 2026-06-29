import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invest Market",
  description: "Закрытый инвестиционный маркет с AI-андеррайтингом",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
