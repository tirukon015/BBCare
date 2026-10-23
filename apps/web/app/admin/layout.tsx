import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../globals.css";

export const metadata: Metadata = { title: { default: "BBCare Admin", template: "%s | BBCare Admin" }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper">{children}</body>
    </html>
  );
}
