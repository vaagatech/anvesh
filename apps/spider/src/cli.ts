#!/usr/bin/env node
/**
 * Anvesh Spider CLI — crawl a complete site, including role-based post-login pages.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { spiderConfigSchema } from "@vaagatech/anvesh-shared";
import { SiteSpider } from "./crawler.js";

const log = pino({
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
  base: { service: "anvesh-spider", vendor: "vaagatech" },
});

function usage(): never {
  console.log(`Anvesh Spider — full-site crawl with role-based auth — by VaagaTech

Usage:
  anvesh-spider serve                 HTTP worker for Hub (port 3851)
  anvesh-spider --config <file.json>
  anvesh-spider --seed <url> [--out crawl.jsonl] [--max-pages 200]

Example config: apps/spider/examples/spider.config.example.json
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") usage();
    if (a.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      out[a.slice(2)] = argv[++i]!;
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (process.argv[2] === "serve") {
    const { startSpiderServer } = await import("./serve.js");
    startSpiderServer();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  let raw: unknown;

  if (args.config) {
    raw = JSON.parse(await readFile(path.resolve(args.config), "utf8"));
  } else if (args.seed) {
    raw = {
      seeds: [args.seed],
      maxPages: args["max-pages"] ? Number(args["max-pages"]) : 200,
      outputPath: args.out ?? "crawl.jsonl",
      roles: [{ name: "guest", anonymous: true }],
    };
  } else {
    usage();
  }

  const config = spiderConfigSchema.parse(raw);
  const spider = new SiteSpider(config, log);
  const pages = await spider.crawl();

  const outPath = path.resolve(config.outputPath ?? args.out ?? "crawl.jsonl");
  await mkdir(path.dirname(outPath), { recursive: true });
  const jsonl = pages.map((p) => JSON.stringify(p)).join("\n") + (pages.length ? "\n" : "");
  await writeFile(outPath, jsonl, "utf8");

  const roleCounts = new Map<string, number>();
  for (const p of pages) {
    for (const r of p.roles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  }

  log.info(
    {
      pages: pages.length,
      output: outPath,
      roles: Object.fromEntries(roleCounts),
    },
    `Crawl complete. Wrote ${pages.length} page(s) to ${outPath}. Run the indexer next to load them into Anvesh.`,
  );
}

main().catch((err) => {
  log.error(err, "Spider failed");
  process.exit(1);
});
