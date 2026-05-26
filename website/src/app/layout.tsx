import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexusky — Local-first AI knowledge base",
  description:
    "A local-first desktop knowledge base for Markdown vaults, long-context AI, graphs, Agent runs and maintenance workflows.",
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
