import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcana Admin",
  description: "Панель сценариста Arcana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full bg-neutral-100 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
