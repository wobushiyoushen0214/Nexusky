import {
  ArrowRight,
  Bot,
  Boxes,
  Brain,
  Check,
  Code2,
  Download,
  Files,
  GitBranch,
  HardDrive,
  LockKeyhole,
  Network,
  PanelRight,
  Search,
  Sparkles,
} from "lucide-react";
import Image from "next/image";

const currentVersion = "0.5.0";
const githubRepo = "wobushiyoushen0214/Nexusky";
const releaseBase = `https://github.com/${githubRepo}/releases/latest/download`;

const downloads = [
  {
    platform: "Windows",
    file: `Nexusky-Setup-${currentVersion}.exe`,
    detail: "Windows 10+ x64 installer",
  },
  {
    platform: "macOS Apple Silicon",
    file: `Nexusky-${currentVersion}-arm64.dmg`,
    detail: "macOS 12+ for M-series Macs",
  },
  {
    platform: "macOS Intel",
    file: `Nexusky-${currentVersion}-x64.dmg`,
    detail: "macOS 12+ for Intel Macs",
  },
  {
    platform: "Linux",
    file: `Nexusky-${currentVersion}.AppImage`,
    detail: "Portable AppImage package",
  },
];

const pillars = [
  {
    icon: HardDrive,
    title: "Local-first vault",
    text: "Markdown files stay in your folder. SQLite indexes links, tasks, properties and search state without replacing your notes.",
  },
  {
    icon: Brain,
    title: "Long-term context",
    text: "Hot, warm and cold context packs bring old work back into AI chat with relation types, evidence and feedback.",
  },
  {
    icon: Bot,
    title: "AI tools with boundaries",
    text: "Chat, edit, batch writing and maintenance tools operate through typed IPC, source context and preview-first workflows.",
  },
  {
    icon: Network,
    title: "Readable knowledge graph",
    text: "Explicit links, inferred relations and folder structure are separated so the graph stays useful on real vaults.",
  },
];

const workflows = [
  "Write Markdown with TipTap, wikilinks, frontmatter, callouts, math and Mermaid.",
  "Ask AI across the vault with source citations and long-context explanations.",
  "Find orphan notes, unresolved links, stale tasks and bridge notes from the maintenance queue.",
  "Sync or publish with Supabase, iCloud, OneDrive, WebDAV, S3, HTML and PDF.",
];

const stack = [
  "Electron 39",
  "React 19",
  "TipTap",
  "better-sqlite3",
  "FTS5",
  "Vitest",
];

export default function Home() {
  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Nexusky home">
          <Image
            src="/product/icon.png"
            alt=""
            className="brand-mark"
            width={1024}
            height={1024}
            priority
          />
          <span>Nexusky</span>
        </a>
        <div className="nav-links">
          <a href="#workflows">Workflows</a>
          <a href="#download">Download</a>
          <a href={`https://github.com/${githubRepo}`}>GitHub</a>
        </div>
      </nav>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <div className="hero-veil" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">Local Markdown. Long memory. Inspectable AI.</p>
          <h1 id="hero-title">Nexusky</h1>
          <p className="hero-lede">
            A desktop knowledge base where your Markdown vault remains the source of truth, while AI
            helps search, connect, maintain and explain the thinking inside it.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <a className="button primary" href="#download">
              <Download aria-hidden="true" />
              Download v{currentVersion}
            </a>
            <a className="button secondary" href={`https://github.com/${githubRepo}`}>
              <Code2 aria-hidden="true" />
              View source
            </a>
          </div>
        </div>
        <div className="hero-strip" aria-label="Product highlights">
          <span>Markdown vault</span>
          <span>SQLite index</span>
          <span>Reviewable actions</span>
          <span>Long-context graph</span>
        </div>
      </section>

      <section className="section intro" aria-label="Product focus">
        <div>
          <p className="section-kicker">Built for serious personal knowledge work</p>
          <h2>Your notes stay portable. The AI gets context.</h2>
        </div>
        <p>
          Nexusky is not a cloud notebook and not a chat window bolted onto files. It treats the
          filesystem as the durable layer, then builds fast local indexes, structured AI tools,
          proactive suggestions and visible evidence around it.
        </p>
      </section>

      <section className="pillar-grid" aria-label="Core pillars">
        {pillars.map((pillar) => (
          <article className="pillar-card" key={pillar.title}>
            <pillar.icon aria-hidden="true" />
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
          </article>
        ))}
      </section>

      <section id="workflows" className="section product-band">
        <div className="product-copy">
          <p className="section-kicker">Daily surface</p>
          <h2>One workspace for notes, graph, AI and maintenance.</h2>
          <ul className="check-list">
            {workflows.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="workflow-panel" aria-label="Nexusky workflow map">
          <div className="workflow-node primary">
            <span>01</span>
            <strong>Vault</strong>
            <small>Markdown files stay portable on disk.</small>
          </div>
          <div className="workflow-node">
            <span>02</span>
            <strong>Index</strong>
            <small>SQLite tracks links, properties, tasks and FTS.</small>
          </div>
          <div className="workflow-node">
            <span>03</span>
            <strong>Context</strong>
            <small>Relations and themes become AI context packs.</small>
          </div>
          <div className="workflow-node">
            <span>04</span>
            <strong>Action</strong>
            <small>Tools, previews and maintenance queues stay reviewable.</small>
          </div>
        </aside>
      </section>

      <section className="system-grid" aria-label="System capabilities">
        <article>
          <PanelRight aria-hidden="true" />
          <h3>Tool Surface</h3>
          <p>Direct commands expose high-value vault tools without spending tokens or entering chat.</p>
        </article>
        <article>
          <GitBranch aria-hidden="true" />
          <h3>Reviewable execution</h3>
          <p>Advanced runs keep plans, steps, status, evidence and rollback data in local SQLite tables.</p>
        </article>
        <article>
          <Search aria-hidden="true" />
          <h3>Semantic search</h3>
          <p>FTS and local semantic ranking keep weak matches discoverable while avoiding cloud lock-in.</p>
        </article>
        <article>
          <LockKeyhole aria-hidden="true" />
          <h3>Private by default</h3>
          <p>Secrets use Electron safeStorage when available; AI and sync only talk to providers you configure.</p>
        </article>
      </section>

      <section className="section graph-band">
        <div className="context-panel" aria-label="Long-context evidence flow">
          <div className="context-layer hot">
            <span>Hot</span>
            <strong>Recent notes, tasks and chat</strong>
          </div>
          <div className="context-layer warm">
            <span>Warm</span>
            <strong>Recurring themes and active relations</strong>
          </div>
          <div className="context-layer cold">
            <span>Cold</span>
            <strong>Long-running goals and resurfaced context</strong>
          </div>
          <div className="context-evidence">
            <span>Reason</span>
            <span>Confidence</span>
            <span>Evidence</span>
            <span>Feedback</span>
          </div>
        </div>
        <div className="product-copy">
          <p className="section-kicker">Cognitive partner direction</p>
          <h2>Designed to show why AI brought something back.</h2>
          <p>
            Long-context relations carry reason, confidence, evidence and feedback. Proactive suggestions
            can be opened, snoozed or dismissed, and the observability panel shows what entered the context pack.
          </p>
          <div className="signal-row">
            <span>
              <Sparkles aria-hidden="true" />
              Proactive suggestions
            </span>
            <span>
              <Boxes aria-hidden="true" />
              Maintenance queue
            </span>
            <span>
              <Files aria-hidden="true" />
              Portable Markdown
            </span>
          </div>
        </div>
      </section>

      <section className="stack-strip" aria-label="Technology stack">
        {stack.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </section>

      <section id="download" className="download-section" aria-labelledby="download-title">
        <div className="download-head">
          <p className="section-kicker">Install</p>
          <h2 id="download-title">Download the desktop app.</h2>
          <p>
            Packages are published through GitHub Releases. For development builds, clone the repository
            and run the Electron app locally with pnpm.
          </p>
        </div>
        <div className="download-list">
          {downloads.map((download) => (
            <a
              key={download.platform}
              className="download-row"
              href={`${releaseBase}/${download.file}`}
              aria-label={`Download Nexusky for ${download.platform}`}
            >
              <span>
                <strong>{download.platform}</strong>
                <small>{download.detail}</small>
              </span>
              <Download aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>Nexusky v{currentVersion}</span>
        <a href={`https://github.com/${githubRepo}/releases`}>
          Releases <ArrowRight aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
