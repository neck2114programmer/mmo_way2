import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Эльдория: Клинки Рассвета",
  description: "Браузерная MMORPG: герои, классы, умения, карта событий.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e0b16" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
