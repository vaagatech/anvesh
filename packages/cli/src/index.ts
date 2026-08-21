#!/usr/bin/env node

/**
 * Anvesh CLI — Declarative Config-as-Code, Search & Fleet Management
 */

import fs from "node:fs";
import path from "node:path";
import { AnveshClient, type AnveshConfigSpec, type IndexDefinition, type SearchHit } from "@vaagatech/anvesh-sdk";

function printHelp() {
  console.log(`
Anvesh CLI — GitOps & Declarative Management for Anvesh Search Engine

Usage:
  anvesh <command> [options]

Commands:
  init                       Create a starter anvesh.config.json in the current directory
  plan [options]             Show changes required to reconcile live cluster with config file
  apply [options]            Apply declarative configuration file to live cluster
  export [options]           Export live cluster configuration to stdout/file
  index list                 List all search indexes on cluster
  index create <name>        Create a new search index
  index delete <name>        Delete a search index
  search <index> -q <query>  Execute keyword or hybrid search
  health                     Check search cluster health status

Options:
  -f, --file <path>          Path to anvesh.config.json (default: anvesh.config.json)
  --url <url>                Anvesh URL (or ANVESH_URL env)
  --api-key <key>            API Key (or ANVESH_API_KEY env)
  --m2m-client-id <id>       Cognito M2M Client ID (or ANVESH_CLIENT_ID env)
  --m2m-secret <secret>      Cognito M2M Client Secret (or ANVESH_CLIENT_SECRET env)
  --m2m-token-url <url>      Cognito OAuth Token URL (or ANVESH_TOKEN_URL env)
  --prune                    Prune indexes not defined in config during apply/plan
  -h, --help                 Show this help message
`);
}

function getClient(args: Record<string, string>): AnveshClient {
  const baseUrl =
    args["--url"] ||
    process.env.ANVESH_URL ||
    "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh";

  const apiKey = args["--api-key"] || process.env.ANVESH_API_KEY;
  const clientId = args["--m2m-client-id"] || process.env.ANVESH_CLIENT_ID;
  const clientSecret = args["--m2m-secret"] || process.env.ANVESH_CLIENT_SECRET;
  const tokenUrl = args["--m2m-token-url"] || process.env.ANVESH_TOKEN_URL;
  const scope = process.env.ANVESH_OAUTH_SCOPE || "https://api.vaagatech.com/apps.all";

  const m2m =
    clientId && clientSecret && tokenUrl
      ? { clientId, clientSecret, tokenUrl, scope }
      : undefined;

  return new AnveshClient({ baseUrl, apiKey, m2m });
}

function parseArgs(rawArgs: string[]) {
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]!;
    if (arg === "--prune" || arg === "-h" || arg === "--help") {
      booleans.add(arg);
    } else if (arg.startsWith("-")) {
      const next = rawArgs[i + 1];
      if (next && !next.startsWith("-")) {
        flags[arg] = next;
        i++;
      } else {
        booleans.add(arg);
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, booleans, positional };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes("-h") || rawArgs.includes("--help")) {
    printHelp();
    return;
  }

  const { flags, booleans, positional } = parseArgs(rawArgs);
  const command = positional[0];

  const client = getClient(flags);

  switch (command) {
    case "init": {
      const target = path.resolve(process.cwd(), "anvesh.config.json");
      const starterConfig: AnveshConfigSpec = {
        version: "1.0",
        indexes: [
          {
            name: "products",
            mappings: {
              name: { type: "text" },
              category: { type: "keyword" },
              price: { type: "number" },
              description: { type: "text" },
            },
            settings: {
              vectorDimensions: 256,
              autoEmbed: true,
              dynamicMapping: true,
            },
          },
        ],
        spiderTargets: [
          {
            name: "main-site-crawler",
            targetUrl: "https://www.example.com",
            indexName: "products",
            maxDepth: 2,
            scheduleCron: "0 0 * * *",
          },
        ],
        circuits: {
          maxConcurrentSearch: 32,
          maxResultWindow: 10000,
        },
      };
      fs.writeFileSync(target, JSON.stringify(starterConfig, null, 2), "utf-8");
      console.log(`✅ Created starter configuration: ${target}`);
      break;
    }

    case "plan": {
      const filePath = flags["-f"] || flags["--file"] || "anvesh.config.json";
      const fullPath = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Config file not found: ${fullPath}`);
        process.exit(1);
      }
      const spec = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as AnveshConfigSpec;
      console.log(`🔍 Comparing ${filePath} against live cluster state...`);

      const plan = await client.config.plan(spec, { prune: booleans.has("--prune") });
      if (!plan.hasChanges) {
        console.log("✨ No changes. Live cluster matches your configuration.");
      } else {
        console.log(`📋 Found ${plan.actions.length} action(s) to apply:\n`);
        plan.actions.forEach((act: { type: string; target: string; details: Record<string, unknown> }, idx: number) => {
          console.log(`  ${idx + 1}. [${act.type.toUpperCase()}] target: ${act.target}`);
          console.log(`     ${JSON.stringify(act.details)}`);
        });
      }
      break;
    }

    case "apply": {
      const filePath = flags["-f"] || flags["--file"] || "anvesh.config.json";
      const fullPath = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Config file not found: ${fullPath}`);
        process.exit(1);
      }
      const spec = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as AnveshConfigSpec;
      console.log(`🚀 Applying ${filePath} to live cluster...`);

      const result = await client.config.apply(spec, { prune: booleans.has("--prune") });
      if (result.success) {
        console.log(`🎉 Successfully applied ${result.applied.length} change(s).`);
      } else {
        console.error(`⚠️ Applied with ${result.errors.length} error(s):`);
        result.errors.forEach((e: { target: string; error: string }) => console.error(`  - ${e.target}: ${e.error}`));
        process.exit(1);
      }
      break;
    }

    case "export": {
      const exported = await client.config.export();
      const json = JSON.stringify(exported, null, 2);
      const outPath = flags["-o"] || flags["--out"];
      if (outPath) {
        fs.writeFileSync(path.resolve(process.cwd(), outPath), json, "utf-8");
        console.log(`✅ Exported cluster config to ${outPath}`);
      } else {
        console.log(json);
      }
      break;
    }

    case "health": {
      const h = await client.health();
      console.log(`Cluster Status: ${h.status.toUpperCase()}`);
      console.log(`Storage:        ${h.storage}`);
      console.log(`Uptime:         ${Math.round(h.uptimeMs / 1000)}s`);
      console.log(`Indexes:        ${h.indexes}`);
      console.log(`Documents:      ${h.documents}`);
      break;
    }

    case "index": {
      const sub = positional[1];
      if (sub === "list") {
        const indexes = await client.indexes.list();
        console.log(`\nRegistered Indexes (${indexes.length}):`);
        indexes.forEach((idx: IndexDefinition) => {
          console.log(`  • ${idx.name.padEnd(24)} (Docs: ${idx.docCount}, Created: ${idx.createdAt.slice(0, 10)})`);
        });
      } else if (sub === "create") {
        const name = positional[2];
        if (!name) throw new Error("Index name required: anvesh index create <name>");
        await client.indexes.create({ name });
        console.log(`✅ Index '${name}' created.`);
      } else if (sub === "delete") {
        const name = positional[2];
        if (!name) throw new Error("Index name required: anvesh index delete <name>");
        await client.indexes.delete(name);
        console.log(`🗑️ Index '${name}' deleted.`);
      } else {
        console.error("Unknown index subcommand. Use 'list', 'create', or 'delete'.");
      }
      break;
    }

    case "search": {
      const index = positional[1];
      const q = flags["-q"] || flags["--query"];
      if (!index || !q) {
        console.error("Usage: anvesh search <index> -q <query>");
        process.exit(1);
      }
      const res = await client.search(index, { q, mode: "hybrid", highlight: true });
      console.log(`\nFound ${res.total} result(s) in ${res.tookMs}ms:\n`);
      res.hits.forEach((h: SearchHit, i: number) => {
        console.log(`  ${i + 1}. [Score: ${h.score}] ${h.source?.meta?.name || h.id}`);
        if (h.highlight) {
          const firstHl = Object.values(h.highlight)[0];
          if (Array.isArray(firstHl) && firstHl[0]) console.log(`     ${firstHl[0]}`);
        }
      });
      break;
    }

    case "ocr": {
      const imgPath = positional[1];
      if (!imgPath) {
        console.error("Usage: anvesh ocr <image_url_or_path>");
        process.exit(1);
      }
      console.log(`🔍 Running local OCR on ${imgPath}...`);
      const ocrRes = await client.tools.ocr(imgPath);
      console.log(`\nConfidence: ${ocrRes.confidence}%`);
      console.log(`Extracted Text:\n${ocrRes.text || "(no text detected)"}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
