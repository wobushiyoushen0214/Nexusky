import {
  ArrowRight,
  Bot,
  Boxes,
  Brain,
  Check,
  CircleDollarSign,
  Code2,
  Download,
  Files,
  GitBranch,
  HardDrive,
  LockKeyhole,
  Network,
  PanelRight,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const currentVersion = "0.8.2";
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
    title: "Local-first vault health",
    text: "Markdown files stay in your folder while Nexusky indexes links, tasks, properties and stale context into a practical health report.",
  },
  {
    icon: Brain,
    title: "Explainable long memory",
    text: "Hot, warm and cold context packs bring old work back into AI chat with relation types, evidence, reasons and feedback.",
  },
  {
    icon: Bot,
    title: "AI with review boundaries",
    text: "Chat, edit, batch writing and maintenance tools operate through typed IPC, source context and preview-first workflows.",
  },
  {
    icon: Network,
    title: "Readable knowledge graph",
    text: "Explicit links, inferred relations and folder structure are separated so the graph stays useful on real vaults.",
  },
];

const workflows = [
  "Open a real Markdown vault and get a health report before configuring any AI provider.",
  "Handle the top three maintenance actions with reasons, impact counts and preview-first writes.",
  "Ask the vault a question and see the notes, memories and reasons that shaped the answer.",
  "Start from Research, Writing, Developer or Learning sample vaults with templates and maintenance rules.",
];

const stack = [
  "Electron 39",
  "React 19",
  "TipTap",
  "better-sqlite3",
  "FTS5",
  "Vitest",
];

const healthActions = [
  {
    label: "Repair unresolved links",
    detail: "7 notes reference missing targets",
    tone: "accent",
  },
  {
    label: "Review orphan notes",
    detail: "14 notes are not connected to active themes",
    tone: "blue",
  },
  {
    label: "Refresh stale memories",
    detail: "2 memory entries need new evidence",
    tone: "amber",
  },
];

const workflowPacks = [
  {
    name: "Research",
    detail: "Sources, literature notes, digest tasks and weekly review prompts.",
  },
  {
    name: "Writing",
    detail: "Ideas, drafts, structure notes, publish-ready metadata and review rules.",
  },
  {
    name: "Developer",
    detail: "ADR, debug logs, API notes, release review and decision maintenance.",
  },
  {
    name: "Learning",
    detail: "Lessons, practice notes, exercises, summaries and spaced review context.",
  },
];

const boundaryItems = [
  {
    icon: HardDrive,
    title: "Free local workspace",
    text: "Local vaults, sample vaults, search, graph, health and BYO provider setup remain the default product path.",
  },
  {
    icon: ShieldCheck,
    title: "Bring-your-own sync",
    text: "iCloud, OneDrive, WebDAV, S3 and Supabase stay framed as user-controlled infrastructure.",
  },
  {
    icon: CircleDollarSign,
    title: "Future paid add-ons",
    text: "Managed sync, hosted backup and hosted publish are commercial candidates only after recovery and trust are strong.",
  },
];

export default function Home() {
  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Nexusky home">
          <img
            src="/product/icon.png"
            alt=""
            className="brand-mark"
            width={1024}
            height={1024}
            loading="eager"
          />
          <span>Nexusky</span>
        </a>
        <div className="nav-links">
          <a href="#workflows">Workflows</a>
          <a href="#boundary">Boundary</a>
          <a href="#download">Download</a>
          <a href={`https://github.com/${githubRepo}`}>GitHub</a>
        </div>
      </nav>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <div className="hero-asset" aria-hidden="true">
          <img
            src="/product/icon.png"
            alt=""
            width={1024}
            height={1024}
            loading="eager"
          />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Local Markdown. Vault health first.</p>
          <h1 id="hero-title">Nexusky</h1>
          <p className="hero-lede">
            A desktop knowledge base that opens a real Markdown vault, shows what needs care,
            and lets AI answer with sources only after the local structure is visible.
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
        <div className="hero-demo" aria-label="Vault health demo">
          <div className="demo-sidebar">
            <strong>research-vault</strong>
            <span className="sidebar-item active">Vault Health</span>
            <span className="sidebar-item">Files</span>
            <span className="sidebar-item">Search</span>
            <span className="sidebar-item">Graph</span>
            <span className="sidebar-item">AI Chat</span>
          </div>
          <div className="demo-main">
            <div className="demo-toolbar">
              <span>Vault Health</span>
              <small>Updated 2 min ago</small>
            </div>
            <div className="health-score">
              <span className="score-ring">82</span>
              <div>
                <strong>Today, fix these 3 things first</strong>
                <p>Sorted by impact, confidence and whether the write path has a preview.</p>
              </div>
            </div>
            <div className="action-list">
              {healthActions.map((action) => (
                <div className={`health-action ${action.tone}`} key={action.label}>
                  <span />
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </div>
                  <span className="demo-action-button">Preview</span>
                </div>
              ))}
            </div>
            <div className="source-answer">
              <div>
                <Sparkles aria-hidden="true" />
                <strong>Ask with sources</strong>
              </div>
              <p>
                “Which notes explain the synthesis workflow?” Nexusky searches the vault,
                attaches source snippets, and says when no relevant note is found.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section intro" aria-label="Product focus">
        <div>
          <p className="section-kicker">Built for serious personal knowledge work</p>
          <h2>Your notes stay portable. The AI gets context.</h2>
        </div>
        <p>
          Nexusky is not a cloud notebook and not a chat window bolted onto files. It treats the
          filesystem as the durable layer, then builds fast local indexes, health tasks, structured
          AI tools, proactive suggestions and visible evidence around it.
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
          <p className="section-kicker">Workflow packs</p>
          <h2>Start with a real sample vault, then keep it healthy.</h2>
          <ul className="check-list">
            {workflows.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="workflow-panel" aria-label="Nexusky workflow packs">
          {workflowPacks.map((pack, index) => (
            <div className={`workflow-node ${index === 0 ? "primary" : ""}`} key={pack.name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{pack.name}</strong>
              <small>{pack.detail}</small>
            </div>
          ))}
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

      <section id="boundary" className="section boundary-band" aria-labelledby="boundary-title">
        <div className="product-copy">
          <p className="section-kicker">Commercial boundary</p>
          <h2 id="boundary-title">The core vault loop stays local and usable.</h2>
          <p>
            Professional workflow packs should make the first ten minutes clearer, not hide the
            local-first product behind subscriptions. Paid infrastructure belongs to hosted sync,
            hosted backup and hosted publishing once recovery behavior is trustworthy.
          </p>
        </div>
        <div className="boundary-grid">
          {boundaryItems.map((item) => (
            <article key={item.title}>
              <item.icon aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
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
