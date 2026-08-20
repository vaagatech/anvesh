const fs = require("fs");
const path = "/Users/karthiksp/projects/searchengine/apps/hub/ui/src/App.tsx";
let content = fs.readFileSync(path, "utf8");

// 1. Add cognito imports
if (!content.includes('from "./cognito"')) {
  content = `import {
  cognitoLogin,
  cognitoRegister,
  cognitoConfirmRegister,
  cognitoForgotPassword,
  cognitoConfirmForgotPassword,
  cognitoChangePassword,
  isCognitoConfigured,
  extractUserClaims,
} from "./cognito";\n` + content;
}

// 2. Add auth state variables inside App()
const stateHookTarget = 'const [password, setPassword] = useState("anvesh-admin-change-me");';
const newStates = `const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "confirm-register" | "forgot" | "confirm-forgot">("login");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);`;

if (content.includes(stateHookTarget)) {
  content = content.replace(stateHookTarget, newStates);
}

// 3. Replace the login card render block
const loginCardStart = "// ── Login Card ─────────────────────────────────────────────────────────────";
const leftNavStart = "// ── Left Sidebar Navigation Groups ──────────────────────────────────────────";

const startIdx = content.indexOf(loginCardStart);
const endIdx = content.indexOf(leftNavStart);

if (startIdx !== -1 && endIdx !== -1) {
  const newAuthCard = `// ── Cognito Authentication Card ─────────────────────────────────────────────

  if (!user) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p className="eyebrow">VaagaTech Identity</p>
          <h1>Anvesh Hub</h1>
          <p className="hint">
            {authMode === "login" && "Sign in with your Cognito account."}
            {authMode === "register" && "Create a new account on Anvesh platform."}
            {authMode === "confirm-register" && "Enter the verification code sent to your email."}
            {authMode === "forgot" && "Reset your password via verified email."}
            {authMode === "confirm-forgot" && "Set a new password using your reset code."}
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={\`auth-tab \${authMode === "login" ? "active" : ""}\`}
              onClick={() => { setAuthMode("login"); setStatus(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={\`auth-tab \${authMode === "register" || authMode === "confirm-register" ? "active" : ""}\`}
              onClick={() => { setAuthMode("register"); setStatus(null); }}
            >
              Register
            </button>
            <button
              type="button"
              className={\`auth-tab \${authMode === "forgot" || authMode === "confirm-forgot" ? "active" : ""}\`}
              onClick={() => { setAuthMode("forgot"); setStatus(null); }}
            >
              Reset
            </button>
          </div>

          {/* 1. SIGN IN FORM */}
          {authMode === "login" && (
            <form
              id="login"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    if (isCognitoConfigured()) {
                      const tokens = await cognitoLogin(username, password);
                      setToken(tokens.accessToken);
                      localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                      const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                      setUser({
                        id: claims.sub,
                        username: claims.username,
                        role: claims.role,
                        createdAt: new Date().toISOString(),
                      });
                      flash(\`Welcome back, \${claims.username}! Role: \${claims.role}\`);
                    } else {
                      const res = await api.login(username, password);
                      setToken(res.token);
                      setUser(res.user);
                      flash(res.message);
                    }
                    await refreshAll();
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Login failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="hub-user">Username or Email</label>
                <input
                  id="hub-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="admin@vaagatech.com"
                />
              </div>
              <div className="field">
                <label htmlFor="hub-pass">Password</label>
                <input
                  id="hub-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Authenticating…" : "Sign In"}
              </button>
              <div className="auth-switch">
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("forgot"); setStatus(null); }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("register"); setStatus(null); }}
                >
                  Create account
                </button>
              </div>
            </form>
          )}

          {/* 2. REGISTER FORM */}
          {authMode === "register" && (
            <form
              id="register"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    const res = await cognitoRegister(username, password, email);
                    if (res.userConfirmed) {
                      const tokens = await cognitoLogin(username, password);
                      setToken(tokens.accessToken);
                      localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                      const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                      setUser({
                        id: claims.sub,
                        username: claims.username,
                        role: claims.role,
                        createdAt: new Date().toISOString(),
                      });
                      flash(\`Account created! Welcome, \${claims.username}\`);
                      await refreshAll();
                    } else {
                      setAuthMode("confirm-register");
                      flash("Verification code sent to your email! Please enter it below.");
                    }
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Registration failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="reg-user">Username</label>
                <input
                  id="reg-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="Choose a username"
                />
              </div>
              <div className="field">
                <label htmlFor="reg-email">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                />
              </div>
              <div className="field">
                <label htmlFor="reg-pass">Password (Min 8 chars, 1 uppercase, 1 number)</label>
                <input
                  id="reg-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Creating Account…" : "Register Account"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <span className="hint" style={{ marginRight: "0.5rem" }}>Already registered?</span>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* 3. CONFIRM REGISTRATION FORM */}
          {authMode === "confirm-register" && (
            <form
              id="confirm-register"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoConfirmRegister(username, confirmCode);
                    flash("Email verified successfully! Signing you in…");
                    const tokens = await cognitoLogin(username, password);
                    setToken(tokens.accessToken);
                    localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                    const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                    setUser({
                      id: claims.sub,
                      username: claims.username,
                      role: claims.role,
                      createdAt: new Date().toISOString(),
                    });
                    await refreshAll();
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Verification failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="conf-code">Verification Code</label>
                <input
                  id="conf-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="6-digit code from email"
                  required
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Verifying…" : "Confirm & Sign In"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* 4. FORGOT PASSWORD (REQUEST CODE) */}
          {authMode === "forgot" && (
            <form
              id="forgot"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoForgotPassword(username);
                    setAuthMode("confirm-forgot");
                    flash("Password reset code sent to your email!");
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Request failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="forgot-user">Username or Email</label>
                <input
                  id="forgot-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Enter your username"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Sending Code…" : "Send Reset Code"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* 5. CONFIRM FORGOT PASSWORD (SET NEW PASSWORD) */}
          {authMode === "confirm-forgot" && (
            <form
              id="confirm-forgot"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoConfirmForgotPassword(username, confirmCode, newPassword);
                    setAuthMode("login");
                    setPassword(newPassword);
                    flash("Password reset successfully! Please sign in with your new password.");
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Password reset failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="reset-code">Reset Code</label>
                <input
                  id="reset-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="Code from email"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="reset-new-pass">New Password</label>
                <input
                  id="reset-new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Resetting Password…" : "Update Password"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {status && (
            <p className={\`banner \${tone}\`} style={{ marginTop: "1rem" }}>
              {status}
            </p>
          )}
        </div>
      </div>
    );
  }

  `;

  content = content.slice(0, startIdx) + newAuthCard + content.slice(endIdx);
}

// 4. Add Change Password button in header
const headerActionsOld = `<span className="user-profile-badge">
                {user.username}
                <span className={\`role-pill \${user.role}\`}>{user.role}</span>
              </span>

              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() =>
                  start(async () => {
                    await api.logout().catch(() => undefined);
                    setToken(null);
                    setUser(null);
                  })
                }
              >
                Sign Out
              </button>`;

const headerActionsNew = `<span className="user-profile-badge">
                👤 {user.username}
                <span className={\`role-pill \${user.role}\`}>{user.role}</span>
              </span>

              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() => setChangePasswordOpen(true)}
                title="Change Cognito Password"
              >
                🔑 Password
              </button>

              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() =>
                  start(async () => {
                    await api.logout().catch(() => undefined);
                    setToken(null);
                    localStorage.removeItem("anvesh.hub.id_token");
                    setUser(null);
                  })
                }
              >
                Sign Out
              </button>`;

if (content.includes(headerActionsOld)) {
  content = content.replace(headerActionsOld, headerActionsNew);
}

// 5. Append Change Password modal before closing tag </main>
const modalCode = `
          {/* Change Password Dialog */}
          {changePasswordOpen && (
            <>
              <div className="modal-backdrop" onClick={() => setChangePasswordOpen(false)} />
              <div className="modal-dialog" role="dialog" aria-modal="true" style={{ maxWidth: "450px" }}>
                <h2>Change Password</h2>
                <p className="hint">Update your AWS Cognito account password.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      try {
                        const token = getToken();
                        if (isCognitoConfigured() && token) {
                          await cognitoChangePassword(token, oldPassword, newPassword);
                          flash("Password changed successfully in Cognito!");
                        } else {
                          const res = await api.changePassword(oldPassword, newPassword);
                          flash(res.message);
                        }
                        setChangePasswordOpen(false);
                        setOldPassword("");
                        setNewPassword("");
                      } catch (err) {
                        flash(err instanceof Error ? err.message : "Password change failed", "err");
                      }
                    });
                  }}
                >
                  <div className="field">
                    <label htmlFor="modal-old-pass">Current Password</label>
                    <input
                      id="modal-old-pass"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="modal-new-pass">New Password</label>
                    <input
                      id="modal-new-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                    <button className="btn" type="submit" disabled={pending} style={{ flex: 1 }}>
                      {pending ? "Updating…" : "Update Password"}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setChangePasswordOpen(false)}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
`;

if (!content.includes("Change Password Dialog") && content.includes("</main>")) {
  content = content.replace("</main>", modalCode + "\n        </main>");
}

fs.writeFileSync(path, content, "utf8");
console.log("App.tsx successfully updated with full Cognito Auth UI");
