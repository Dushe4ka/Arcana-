import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Личный кабинет — Arcana",
  description: "Баланс, статистика и покупка кристаллов Arcana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${playfair.variable} h-full`}>
      <body className="min-h-full bg-background text-text antialiased">{children}</body>
    </html>
  );
}
