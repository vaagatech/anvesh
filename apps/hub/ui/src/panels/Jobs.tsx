import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type HubJob } from "../api";
import { Pager } from "../components/Pager";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" || status === "done"
      ? "ok"
      : status === "running" || status === "queued" || status === "pending"
        ? "warn"
        : status === "cancelled"
          ? "muted"
          : status === "failed" || status === "error"
            ? "err"
            : "muted";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function JobsPanel({
  flash,
  canManage,
}: {
  flash: (m: string, t?: "ok" | "err") => void;
  canManage: boolean;
}) {
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(0);
  const pageSize = 20;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "spider" | "indexer">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "completed" | "failed" | "cancelled"
  >("all");

  const serverStatus =
    statusFilter === "running"
      ? "running"
      : statusFilter !== "all"
        ? statusFilter
        : undefined;

  async function load(nextFrom = from) {
    const r = await api.listJobs(nextFrom, pageSize, serverStatus);
    setJobs(r.jobs);
    setTotal(r.total);
    setFrom(nextFrom);
  }

  useEffect(() => {
    void load(0).catch((e) => flash(e instanceof Error ? e.message : "Could not load jobs", "err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (kindFilter !== "all" && j.kind !== kindFilter) return false;
      if (statusFilter === "running") {
        return j.status === "running" || j.status === "queued";
      }
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      return true;
    });
  }, [jobs, kindFilter, statusFilter]);

  useEffect(() => {
    const running = jobs.filter((j) => j.status === "running" || j.status === "queued");
    if (!running.length) return;
    const t = setInterval(() => {
      void Promise.all(running.map((j) => api.refreshJob(j.id).catch(() => null))).then(() =>
        load(from),
      );
    }, 2000);
    return () => clearInterval(t);
  }, [jobs, from]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Pipeline jobs</h2>
          <p className="hint">
            Live crawl and index activity. Open Logs for spider output. Running jobs refresh
            automatically.
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn secondary"
            onClick={() => void load(from).catch((e) => flash(e.message, "err"))}
          >
            ↻ Refresh
          </button>
          {canManage && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (!confirm("Clear completed and failed jobs from Hub history?")) return;
                void api
                  .clearFinishedJobs()
                  .then(async (r) => {
                    flash(r.message);
                    await load(0);
                  })
                  .catch((e) => flash(e.message, "err"));
              }}
            >
              Clear finished
            </button>
          )}
        </div>
      </div>

      <div className="row" style={{ marginBottom: "0.85rem" }}>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          aria-label="Filter by kind"
        >
          <option value="all">All kinds</option>
          <option value="spider">Spider</option>
          <option value="indexer">Indexer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setFrom(0);
          }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="hint">No jobs match. Run a crawl from Spider to see logs here.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Config</th>
              <th>Index</th>
              <th>Status</th>
              <th>Message</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <Fragment key={j.id}>
                <tr>
                  <td>
                    <span className="badge accent">{j.kind}</span>
                  </td>
                  <td>{j.configName ?? "—"}</td>
                  <td>{j.indexName ? <code>{j.indexName}</code> : "—"}</td>
                  <td>
                    <StatusBadge status={j.status} />
                  </td>
                  <td>{j.message}</td>
                  <td>{new Date(j.updatedAt).toLocaleString()}</td>
                  <td className="row">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        void api
                          .refreshJob(j.id)
                          .then(async () => {
                            setExpanded(j.id);
                            await load(from);
                          })
                          .catch((e) => flash(e.message, "err"))
                      }
                    >
                      ↻
                    </button>
                    {canManage &&
                      (j.status === "running" || j.status === "queued") && (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() =>
                            void api
                              .cancelJob(j.id)
                              .then(async (r) => {
                                flash(r.message);
                                await load(from);
                              })
                              .catch((e) => flash(e.message, "err"))
                          }
                        >
                          Cancel
                        </button>
                      )}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                    >
                      Logs
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => {
                          if (!confirm("Remove this job from history?")) return;
                          void api
                            .deleteJob(j.id)
                            .then(async () => {
                              flash("Job removed.");
                              await load(from);
                            })
                            .catch((e) => flash(e.message, "err"));
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === j.id && (
                  <tr>
                    <td colSpan={7}>
                      <pre className="job-logs" tabIndex={0}>
                        {(j.logs?.length
                          ? j.logs
                          : ["No logs yet — refresh while the job is running."]
                        ).join("\n")}
                      </pre>
                      {j.output && (
                        <p className="hint">
                          Output: <code>{j.output}</code>
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <Pager
        from={from}
        size={pageSize}
        total={total}
        onChange={(next) => void load(next).catch((e) => flash(e.message, "err"))}
      />
    </section>
  );
}
