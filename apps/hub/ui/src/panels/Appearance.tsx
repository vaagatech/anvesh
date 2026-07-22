import { useState } from "react";
import { api } from "../api";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  loadAppearance,
  resetAppearance,
  saveAppearance,
  type AppearanceState,
  type DensityId,
  type FontPackId,
  type MotionId,
  type ThemeId,
} from "../appearance";

const THEMES: Array<{ id: ThemeId; label: string; hint: string }> = [
  { id: "vaagatech", label: "VaagaTech", hint: "Brand default — void & cobalt" },
  { id: "slate", label: "Slate", hint: "Cool navy ops" },
  { id: "ink", label: "Ink", hint: "High-contrast light" },
  { id: "midnight", label: "Midnight", hint: "Void dark ops" },
];

const FONTS: Array<{ id: FontPackId; label: string; hint: string }> = [
  { id: "vaagatech", label: "VaagaTech", hint: "IBM Plex Sans + Mono" },
  { id: "editorial", label: "Editorial", hint: "Fraunces + Source Sans 3" },
  { id: "technical", label: "Technical", hint: "Space Grotesk + Plex Sans" },
];

export function AppearancePanel({
  flash,
}: {
  flash?: (m: string, t?: "ok" | "err") => void;
}) {
  const [state, setState] = useState<AppearanceState>(() => loadAppearance());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<AppearanceState>) => {
    const next = { ...state, ...patch };
    setState(next);
    saveAppearance(next);
    applyAppearance(next);
  };

  return (
    <section className="panel appearance-panel">
      <div className="panel-head">
        <h2>Appearance</h2>
      </div>
      <p className="hint">
        Theme, fonts, and density for this browser. Choices stay in localStorage — no server
        round-trip.
      </p>

      <fieldset className="appearance-group">
        <legend>Theme preset</legend>
        <div className="appearance-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`appearance-card ${state.theme === t.id ? "active" : ""}`}
              onClick={() => update({ theme: t.id })}
            >
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="appearance-group">
        <legend>Font pack</legend>
        <div className="appearance-grid">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`appearance-card ${state.fontPack === f.id ? "active" : ""}`}
              onClick={() => update({ fontPack: f.id })}
            >
              <strong>{f.label}</strong>
              <span>{f.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row">
        <label className="field">
          <span>Accent color</span>
          <input
            type="color"
            value={state.accent}
            onChange={(e) => update({ accent: e.target.value })}
            aria-label="Accent color"
          />
        </label>
        <label className="field">
          <span>Density</span>
          <select
            value={state.density}
            onChange={(e) => update({ density: e.target.value as DensityId })}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="field">
          <span>Motion</span>
          <select
            value={state.motion}
            onChange={(e) => update({ motion: e.target.value as MotionId })}
          >
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const next = resetAppearance();
            setState(next);
          }}
        >
          Reset to defaults
        </button>
        <span className="hint" style={{ margin: 0 }}>
          Default: {DEFAULT_APPEARANCE.theme} / {DEFAULT_APPEARANCE.fontPack}
        </span>
      </div>

      <fieldset className="appearance-group" style={{ marginTop: "1.5rem" }}>
        <legend>Change password</legend>
        <p className="hint">
          Updates your Hub login. Secure mode requires at least 12 characters.
        </p>
        <div className="grid-3">
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !currentPassword || !newPassword}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await api.changePassword(currentPassword, newPassword);
                  flash?.(res.message ?? "Password updated.", "ok");
                  setCurrentPassword("");
                  setNewPassword("");
                } catch (err) {
                  flash?.(err instanceof Error ? err.message : "Password change failed", "err");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Update password
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
