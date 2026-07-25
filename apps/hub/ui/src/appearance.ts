/** Hub Appearance — VaagaTech brand defaults + optional presets. */

export type ThemeId = "vaagatech" | "slate" | "ink" | "midnight";
export type FontPackId = "vaagatech" | "editorial" | "technical";
export type DensityId = "comfortable" | "compact";
export type MotionId = "full" | "reduced";

export interface AppearanceState {
  theme: ThemeId;
  fontPack: FontPackId;
  accent: string;
  density: DensityId;
  motion: MotionId;
}

export const STORAGE_KEY = "anvesh.hub.appearance";

/** Matches https://www.vaagatech.com — cobalt accent on paper/ink. */
export const DEFAULT_APPEARANCE: AppearanceState = {
  theme: "vaagatech",
  fontPack: "vaagatech",
  accent: "#38bdf8",
  density: "comfortable",
  motion: "full",
};

const FONT_HREF: Record<FontPackId, string> = {
  vaagatech:
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  editorial:
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
  technical:
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
};

const FONT_VARS: Record<FontPackId, { font: string; display: string; mono: string }> = {
  vaagatech: {
    font: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
    display: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  editorial: {
    font: '"Plus Jakarta Sans", system-ui, sans-serif',
    display: '"Fraunces", serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  technical: {
    font: '"Plus Jakarta Sans", system-ui, sans-serif',
    display: '"Space Grotesk", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
};

function deepHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * 0.72));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * 0.72));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * 0.72));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function softHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "rgba(29, 78, 216, 0.12)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

let fontLink: HTMLLinkElement | null = null;

function ensureFontLink(pack: FontPackId): void {
  if (typeof document === "undefined") return;
  if (!fontLink) {
    fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.id = "anvesh-font-pack";
    document.head.appendChild(fontLink);
  }
  fontLink.href = FONT_HREF[pack];
}

function normalizeTheme(theme: string | undefined): ThemeId {
  if (theme === "coastal" || theme === "ocean" || theme === "anvesh") return "vaagatech";
  if (theme === "slate" || theme === "ink" || theme === "midnight" || theme === "vaagatech") {
    return theme;
  }
  return DEFAULT_APPEARANCE.theme;
}

function normalizeFontPack(pack: string | undefined): FontPackId {
  if (pack === "anvesh") return "vaagatech";
  if (pack === "vaagatech" || pack === "editorial" || pack === "technical") return pack;
  return DEFAULT_APPEARANCE.fontPack;
}

export function loadAppearance(): AppearanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const theme = localStorage.getItem("anvesh.hub.theme") ?? undefined;
      const density = localStorage.getItem("anvesh.hub.density") as DensityId | null;
      return {
        ...DEFAULT_APPEARANCE,
        theme: normalizeTheme(theme),
        ...(density ? { density } : {}),
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppearanceState>;
    return {
      ...DEFAULT_APPEARANCE,
      ...parsed,
      theme: normalizeTheme(parsed.theme),
      fontPack: normalizeFontPack(parsed.fontPack),
      accent: parsed.accent ?? DEFAULT_APPEARANCE.accent,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(state: AppearanceState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function applyAppearance(state: AppearanceState): void {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.density = state.density;
  root.dataset.motion = state.motion;
  ensureFontLink(state.fontPack);
  const fonts = FONT_VARS[state.fontPack];
  root.style.setProperty("--font", fonts.font);
  root.style.setProperty("--display", fonts.display);
  root.style.setProperty("--mono", fonts.mono);
  root.style.setProperty("--accent", state.accent);
  root.style.setProperty("--accent-deep", deepHex(state.accent));
  root.style.setProperty("--accent-soft", softHex(state.accent));
}

export function resetAppearance(): AppearanceState {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("anvesh.hub.theme");
  localStorage.removeItem("anvesh.hub.density");
  applyAppearance(DEFAULT_APPEARANCE);
  return { ...DEFAULT_APPEARANCE };
}
