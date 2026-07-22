import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import type { HubInstance, HubState, HubUser } from "./types.js";
import { decryptSecret, encryptSecret } from "./secrets.js";

const emptyState = (): HubState => ({
  users: [],
  instances: [],
  spiderConfigs: [],
  indexerConfigs: [],
  sessions: [],
  jobs: [],
  auditLog: [],
});

export class HubStore {
  private state: HubState = emptyState();
  private ready: Promise<void>;
  private secretsKey: Buffer | null = null;

  constructor(
    private readonly root: string,
    options?: { secretsKey?: Buffer },
  ) {
    if (options?.secretsKey) this.secretsKey = options.secretsKey;
    this.ready = this.load();
  }

  hasSecretsKey(): boolean {
    return this.secretsKey !== null;
  }

  /** Decrypt instance API key in-memory for proxying only. */
  resolveApiKey(inst: HubInstance): string | undefined {
    if (inst.apiKey) return inst.apiKey;
    if (inst.apiKeyEnc && this.secretsKey) {
      return decryptSecret(inst.apiKeyEnc, this.secretsKey);
    }
    return undefined;
  }

  private file(): string {
    return path.join(this.root, "hub-state.json");
  }

  private persistInstance(inst: HubInstance): HubInstance {
    const row = { ...inst };
    if (this.secretsKey) {
      const plain = row.apiKey;
      if (plain) {
        row.apiKeyEnc = encryptSecret(plain, this.secretsKey);
      }
      delete row.apiKey;
    }
    return row;
  }

  private migrateInstances(): boolean {
    if (!this.secretsKey) return false;
    let changed = false;
    for (const inst of this.state.instances) {
      if (inst.apiKey) {
        inst.apiKeyEnc = encryptSecret(inst.apiKey, this.secretsKey);
        delete inst.apiKey;
        changed = true;
      }
    }
    return changed;
  }

  private async load(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      const raw = await readFile(this.file(), "utf8");
      this.state = { ...emptyState(), ...JSON.parse(raw) };
      if (!Array.isArray(this.state.jobs)) this.state.jobs = [];
      if (!Array.isArray(this.state.auditLog)) this.state.auditLog = [];
      const migrated = this.migrateInstances();
      if (migrated) await this.save();
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.state = emptyState();
      await this.save();
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const snapshot: HubState = {
      ...this.state,
      instances: this.state.instances.map((i) => this.persistInstance(i)),
    };
    const body = JSON.stringify(snapshot, null, 2);
    const tmp = `${this.file()}.tmp-${process.pid}`;
    await writeFile(tmp, body, { mode: 0o600 });
    await rename(tmp, this.file()).catch(async () => {
      await writeFile(this.file(), body, { mode: 0o600 });
    });
    try {
      await chmod(this.file(), 0o600);
    } catch {
      /* best effort on platforms that ignore mode */
    }
  }

  /** Persist a new or updated instance credential (encrypt when secrets key is set). */
  applyInstanceCredential(inst: HubInstance, apiKey: string | undefined): void {
    if (!apiKey) return;
    if (this.secretsKey) {
      inst.apiKeyEnc = encryptSecret(apiKey, this.secretsKey);
      delete inst.apiKey;
    } else {
      inst.apiKey = apiKey;
      delete inst.apiKeyEnc;
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
