"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
} from "lucide-react";

interface LogEntry {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  app_version: string | null;
  platform: string | null;
  device_id: string | null;
  created_at: string;
}

const levelIcons: Record<string, typeof AlertCircle> = {
  error: AlertCircle,
  warn: AlertTriangle,
  info: Info,
};

const levelColors: Record<string, string> = {
  error: "text-red-400",
  warn: "text-yellow-400",
  info: "text-blue-400",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();
  const limit = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      level,
    });
    if (search) params.set("search", search);

    const res = await fetch(`/api/logs?${params}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, level, search, router]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--bg)]/80 backdrop-blur-sm border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">错误日志</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchLogs}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => {
                document.cookie = "auth_token=; max-age=0; path=/";
                router.push("/login");
              }}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)]"
              title="退出"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-6xl mx-auto w-full px-6 py-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索错误信息..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">全部级别</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Logs list */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 pb-6">
        {loading ? (
          <div className="text-center py-20 text-[var(--text-muted)]">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-muted)]">暂无日志</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const Icon = levelIcons[log.level] || Info;
              const color = levelColors[log.level] || "text-[var(--text-muted)]";
              const isExpanded = expanded === log.id;

              return (
                <div
                  key={log.id}
                  className="rounded-lg bg-[var(--bg-card)] border border-[var(--border)] overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : log.id)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{log.message}</p>
                      <div className="flex gap-3 mt-1 text-xs text-[var(--text-muted)]">
                        <span>{new Date(log.created_at).toLocaleString("zh-CN")}</span>
                        {log.app_version && <span>v{log.app_version}</span>}
                        {log.platform && <span>{log.platform}</span>}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-3">
                      {log.stack && (
                        <div>
                          <div className="text-xs text-[var(--text-muted)] mb-1">Stack Trace</div>
                          <pre className="text-xs bg-[var(--bg)] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                            {log.stack}
                          </pre>
                        </div>
                      )}
                      {log.context && (
                        <div>
                          <div className="text-xs text-[var(--text-muted)] mb-1">Context</div>
                          <pre className="text-xs bg-[var(--bg)] p-3 rounded-lg overflow-x-auto">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.device_id && (
                        <div className="text-xs text-[var(--text-muted)]">
                          Device: {log.device_id}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
