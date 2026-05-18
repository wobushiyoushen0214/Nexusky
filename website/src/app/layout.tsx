import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexusky — AI 驱动的知识库笔记应用",
  description: "本地优先、双向链接、AI 语义搜索、知识图谱可视化的桌面笔记应用",
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
