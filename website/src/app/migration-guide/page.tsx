import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FolderOpen,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Migration guide — Nexusky",
  description:
    "A practical guide for safely opening Markdown and Obsidian vaults in Nexusky, including backup, ignore rules and AI data boundaries.",
};

const migrationModes = [
  {
    title: "Open an existing vault",
    detail: "Best when your Markdown folder remains the source of truth. Nexusky adds local index and recovery state around it.",
  },
  {
    title: "Open a copied vault",
    detail: "Best for the first trial or a large archive. You can validate health, search and maintenance without touching the original.",
  },
  {
    title: "Import an Obsidian vault",
    detail: "Copies Markdown, attachments and Canvas into the current vault while skipping .obsidian, .git and .trash.",
  },
];

const firstRunSteps = [
  "Back up or copy the original folder before the first run.",
  "Open the folder and let Nexusky finish the Markdown index.",
  "Read Vault Health before configuring any AI provider.",
  "Handle only a few Maintenance items and verify preview, apply and undo.",
  "Use outbound preview before Chat or reviewable execution sends retrieved context to a provider.",
];

const ignoreRules = [
  [".nexusky/index.db", "Local SQLite index. Rebuildable, not the source of truth."],
  [".nexusky/memories/*.json", "Long-memory derived state. Allowed by Nexusky sync selection."],
  [".history/", "Markdown recovery snapshots. Keep locally or back up intentionally."],
  [".trash/", "Delete recovery area with original path metadata."],
  [".obsidian/", "Kept for Obsidian settings. Nexusky import and sync skip it by default."],
  [".attachments/", "Allowed hidden attachment folder for bring-your-own sync."],
];

const dataBoundaries = [
  "Vault Health, search, graph and Maintenance scans work without an AI provider.",
  "AI calls can include the user prompt, retrieved note snippets, selected attachment text, long-context snippets and Vault tools hints.",
  "The outbound preview shows a local summary before Chat or reviewable execution sends the request.",
  "Bring-your-own sync uploads only to the backend you configure; hosted backup is still a future add-on.",
];

export default function MigrationGuidePage() {
  return (
    <main className="guide-shell">
      <nav className="topbar guide-topbar" aria-label="Migration guide navigation">
        <Link className="brand" href="/" aria-label="Back to Nexusky home">
          <img
            src="/product/icon.png"
            alt=""
            className="brand-mark"
            width={1024}
            height={1024}
            loading="eager"
          />
          <span>Nexusky</span>
        </Link>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/#download">Download</Link>
          <a href="https://github.com/wobushiyoushen0214/Nexusky">GitHub</a>
        </div>
      </nav>

      <section className="guide-hero" aria-labelledby="guide-title">
        <Link className="guide-back" href="/">
          <ArrowLeft aria-hidden="true" />
          Back to product
        </Link>
        <div>
          <p className="eyebrow">Migration guide</p>
          <h1 id="guide-title">Move a Markdown or Obsidian vault without losing control.</h1>
          <p className="guide-lede">
            Nexusky treats files as the durable layer. This guide shows when to open,
            copy or import a vault, what to back up, which paths to ignore, and what can
            leave the machine when AI is enabled.
          </p>
        </div>
        <div className="guide-proof-grid" aria-label="Migration guardrails">
          <span>
            <FolderOpen aria-hidden="true" />
            Markdown remains portable
          </span>
          <span>
            <Database aria-hidden="true" />
            SQLite stays rebuildable
          </span>
          <span>
            <ShieldCheck aria-hidden="true" />
            Health works before AI
          </span>
        </div>
      </section>

      <section className="guide-section guide-modes" aria-labelledby="mode-title">
        <div className="guide-section-head">
          <p className="section-kicker">Choose the path</p>
          <h2 id="mode-title">Do not migrate more than you need.</h2>
          <p>
            Heavy Markdown users usually need validation before commitment. Start with the
            smallest move that lets you inspect health, search, graph and maintenance behavior.
          </p>
        </div>
        <div className="guide-mode-grid">
          {migrationModes.map((mode, index) => (
            <article key={mode.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{mode.title}</h3>
              <p>{mode.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section guide-runbook" aria-labelledby="runbook-title">
        <div className="guide-section-head">
          <p className="section-kicker">First run</p>
          <h2 id="runbook-title">A 30-minute safety pass.</h2>
        </div>
        <ol className="guide-steps">
          {firstRunSteps.map((step) => (
            <li key={step}>
              <CheckCircle2 aria-hidden="true" />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section guide-table-section" aria-labelledby="ignore-title">
        <div className="guide-section-head">
          <p className="section-kicker">Ignore rules</p>
          <h2 id="ignore-title">Keep indexes separate from your source files.</h2>
          <p>
            The key habit is simple: Markdown and attachments are the real vault;
            SQLite and recovery folders are local operating state.
          </p>
        </div>
        <div className="guide-table" role="table" aria-label="Recommended migration ignore rules">
          {ignoreRules.map(([path, reason]) => (
            <div className="guide-table-row" role="row" key={path}>
              <code>{path}</code>
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section guide-boundary" aria-labelledby="boundary-title">
        <div className="guide-boundary-card">
          <LockKeyhole aria-hidden="true" />
          <div>
            <p className="section-kicker">AI boundary</p>
            <h2 id="boundary-title">Know what can leave the machine.</h2>
          </div>
        </div>
        <ul className="guide-boundary-list">
          {dataBoundaries.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="guide-section guide-recovery" aria-labelledby="recovery-title">
        <div>
          <p className="section-kicker">Recovery</p>
          <h2 id="recovery-title">Preview first, recover locally.</h2>
          <p>
            Markdown writes save history snapshots. Deletes move files into a vault trash
            folder. Maintenance and reviewable execution writes keep previews and undo information so the
            first migration session can stay small and reversible.
          </p>
        </div>
        <div className="guide-recovery-panel">
          <span>
            <ClipboardCheck aria-hidden="true" />
            Preview apply paths
          </span>
          <span>
            <RotateCcw aria-hidden="true" />
            Undo maintenance writes
          </span>
          <span>
            <ShieldCheck aria-hidden="true" />
            Rebuild local indexes
          </span>
        </div>
      </section>
    </main>
  );
}
