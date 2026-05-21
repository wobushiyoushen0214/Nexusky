import {
  Download,
  Brain,
  Network,
  Search,
  Shield,
  Monitor,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI 驱动",
    desc: "多模型支持（OpenAI / Claude / Ollama / 国产模型），AI 编辑、语义搜索、自动标签",
  },
  {
    icon: Network,
    title: "知识图谱",
    desc: "D3 力导向图可视化笔记关联，毛玻璃节点、涟漪动画、语义关联推断",
  },
  {
    icon: Search,
    title: "语义搜索",
    desc: "TF-IDF + AI rerank，中文 bigram 分词，毫秒级响应",
  },
  {
    icon: Shield,
    title: "本地优先",
    desc: "数据存储在本地 SQLite，API Key 加密存储，笔记可单独加密",
  },
  {
    icon: Monitor,
    title: "跨平台",
    desc: "Windows / macOS / Linux 全平台支持，Electron 原生体验",
  },
  {
    icon: Download,
    title: "多端同步",
    desc: "Supabase / iCloud / OneDrive 多后端，离线队列自动恢复",
  },
];

const currentVersion = "0.4.0";
const githubRepo = "wobushiyoushen0214/Nexusky";

const downloads = [
  {
    platform: "Windows",
    file: `Nexusky-Setup-${currentVersion}.exe`,
    desc: "Windows 10+ (x64)",
  },
  {
    platform: "macOS (Apple Silicon)",
    file: `Nexusky-${currentVersion}-arm64.dmg`,
    desc: "macOS 12+ (M1/M2/M3)",
  },
  {
    platform: "macOS (Intel)",
    file: `Nexusky-${currentVersion}-x64.dmg`,
    desc: "macOS 12+ (Intel)",
  },
  {
    platform: "Linux",
    file: `Nexusky-${currentVersion}.AppImage`,
    desc: "AppImage 便携版",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-20">
        <h1 className="text-5xl font-bold tracking-tight text-center animate-fade-in">
          Nexusky
        </h1>
        <p className="mt-4 text-xl text-[var(--text-muted)] text-center max-w-xl animate-fade-in">
          AI 驱动的知识库笔记应用 — 本地优先、双向链接、语义搜索、知识图谱
        </p>
        <div className="mt-8 flex gap-4 animate-fade-in">
          <a
            href="#download"
            className="px-6 py-3 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            下载
          </a>
          <a
            href={`https://github.com/${githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors"
          >
            GitHub
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-5xl mx-auto w-full">
        <h2 className="text-2xl font-semibold text-center mb-12">核心特性</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
            >
              <f.icon className="w-8 h-8 text-[var(--accent)] mb-3" />
              <h3 className="text-lg font-medium mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Download */}
      <section id="download" className="px-6 py-20 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-semibold text-center mb-12">下载安装</h2>
        <div className="grid gap-4">
          {downloads.map((d) => (
            <a
              key={d.platform}
              href={`https://github.com/${githubRepo}/releases/latest/download/${d.file}`}
              className="flex items-center justify-between p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors group"
            >
              <div>
                <div className="font-medium group-hover:text-[var(--accent)] transition-colors">
                  {d.platform}
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-1">
                  {d.desc}
                </div>
              </div>
              <Download className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
            </a>
          ))}
        </div>
        <p className="text-center text-sm text-[var(--text-muted)] mt-6">
          当前版本 v{currentVersion} ·{" "}
          <a
            href={`https://github.com/${githubRepo}/releases`}
            className="underline hover:text-[var(--text)]"
          >
            查看所有版本
          </a>
        </p>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-sm text-[var(--text-muted)] border-t border-[var(--border)]">
        Nexusky &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
