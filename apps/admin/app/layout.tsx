import type { Metadata } from "next";
import "./globals.css";

import { HydrateAuth } from "@/components/HydrateAuth";

export const metadata: Metadata = {
  title: "Arcana Admin",
  description: "Панель сценариста Arcana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full bg-canvas text-neutral-900 antialiased">
        <HydrateAuth />
        {children}
      </body>
    </html>
  );
}
