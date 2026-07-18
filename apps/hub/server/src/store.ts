import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HubState, HubUser } from "./types.js";

const emptyState = (): HubState => ({
  users: [],
  instances: [],
  spiderConfigs: [],
  indexerConfigs: [],
  sessions: [],
});

export class HubStore {
  private state: HubState = emptyState();
  private ready: Promise<void>;

  constructor(private readonly root: string) {
    this.ready = this.load();
  }

  private file(): string {
    return path.join(this.root, "hub-state.json");
  }

  private async load(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      const raw = await readFile(this.file(), "utf8");
      this.state = { ...emptyState(), ...JSON.parse(raw) };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.state = emptyState();
      await this.save();
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const tmp = `${this.file()}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2), "utf8");
    await writeFile(this.file(), JSON.stringify(this.state, null, 2), "utf8");
    try {
      await import("node:fs/promises").then((fs) => fs.unlink(tmp));
    } catch {
      /* ignore */
    }
  }

  async getState(): Promise<HubState> {
    await this.ready;
    return this.state;
  }

  async update(mutator: (s: HubState) => void): Promise<HubState> {
    await this.ready;
    mutator(this.state);
    await this.save();
    return this.state;
  }

  static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt ?? randomBytes(16).toString("hex");
    const hash = scryptSync(password, s, 64).toString("hex");
    return { hash, salt: s };
  }

  static verifyPassword(user: HubUser, password: string): boolean {
    const { hash } = HubStore.hashPassword(password, user.salt);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(user.passwordHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  static newToken(): string {
    return createHash("sha256").update(randomBytes(32)).digest("hex");
  }
}
