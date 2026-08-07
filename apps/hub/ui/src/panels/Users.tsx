import { useState } from "react";
import { api, type HubUser } from "../api";
import { Pager } from "../components/Pager";

export function UsersPanel({
  users,
  total,
  from,
  pageSize,
  onPage,
  onRefresh,
  flash,
}: {
  users: HubUser[];
  total: number;
  from: number;
  pageSize: number;
  onPage: (next: number) => void;
  onRefresh: () => Promise<void>;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");

  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <h2>Create Hub Account</h2>
        </div>
        <p className="hint">Register role-based access control (RBAC) credentials for Anvesh Hub.</p>
        <div className="grid-3">
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. dev-admin" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Secure password"
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="admin">admin (full control)</option>
              <option value="editor">editor (read & write)</option>
              <option value="viewer">viewer (read-only)</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!username.trim() || !password.trim()}
          onClick={() =>
            void api
              .createUser({ username, password, role })
              .then(async (r) => {
                flash((r as { message?: string }).message ?? "User created!", "ok");
                setUsername("");
                setPassword("");
                await onRefresh();
              })
              .catch((e) => flash(e.message, "err"))
          }
        >
          Create User Account
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Registered Users ({total})</h2>
        </div>
        {users.length === 0 ? (
          <p className="hint">No users registered.</p>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>{u.id}</td>
                      <td style={{ fontWeight: 600 }}>{u.username}</td>
                      <td>
                        <span className={`role-pill ${u.role}`}>{u.role}</span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn danger"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}
                          onClick={() => {
                            if (!confirm(`Delete user "${u.username}"?`)) return;
                            void api
                              .deleteUser(u.id)
                              .then(async () => {
                                flash(`User "${u.username}" removed.`);
                                await onRefresh();
                              })
                              .catch((e) => flash(e.message, "err"));
                          }}
                        >
                          Delete Account
                        </button>
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
