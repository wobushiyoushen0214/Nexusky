import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexusky - Local Markdown vault workbench",
  description:
    "A local-first desktop workbench for Markdown vault health, sourced AI, graphs and reviewable maintenance workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
