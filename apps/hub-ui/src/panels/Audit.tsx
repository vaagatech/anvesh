import { type AuditEntry } from "../api";
import { Pager } from "../components/Pager";

export function AuditPanel({
  entries,
  total,
  from,
  pageSize,
  onPage,
}: {
  entries: AuditEntry[];
  total: number;
  from: number;
  pageSize: number;
  onPage: (next: number) => void;
}) {
  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <h2>System Audit Trail ({total})</h2>
        </div>
        <p className="hint">Security log of all operations performed on Anvesh Hub.</p>
        {entries.length === 0 ? (
          <p className="hint">No audit records logged yet.</p>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Detail</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {new Date(e.at).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{e.actorName ?? "system"}</td>
                      <td>
                        <span className="badge" style={{ color: "var(--accent-cyan)", borderColor: "var(--border)" }}>
                          {e.action}
                        </span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{e.target ?? "—"}</td>
                      <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {typeof e.detail === "object" ? JSON.stringify(e.detail) : String(e.detail ?? "—")}
                      </td>
                      <td>
                        <span className={`badge ${e.ok ? "ok" : "err"}`}>
                          {e.ok ? "success" : "failed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <Pager from={from} size={pageSize} total={total} onChange={onPage} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
