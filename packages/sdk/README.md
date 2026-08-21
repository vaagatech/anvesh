# @vaagatech/anvesh-sdk

Official TypeScript & JavaScript Client SDK for the **Anvesh Search & Vector Engine**.

## Features

- 🔐 **Automated Auth**: Handles AWS Cognito OAuth2 M2M client credentials token rotation and caching automatically.
- ⚡ **Full API Coverage**: Indexes, Documents, Bulk Ingest, Hybrid/Vector/Keyword Search, Crawler (Spider), and Declarative Config-as-Code.
- 🎨 **Visual & OCR Tools**: Integrated non-AI OCR and visual feature extraction.
- 🛡️ **Throttling & Retries**: Built-in exponential backoff and timeout handling.

## Installation

```bash
npm install @vaagatech/anvesh-sdk
```

## Quickstart

```typescript
import { AnveshClient } from "@vaagatech/anvesh-sdk";

const client = new AnveshClient({
  baseUrl: "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh",
  m2m: {
    clientId: process.env.ANVESH_CLIENT_ID!,
    clientSecret: process.env.ANVESH_CLIENT_SECRET!,
    tokenUrl: "https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token",
    scope: "https://api.vaagatech.com/apps.all",
  },
});

// 1. Create Index with Vector & Visual Settings
await client.indexes.create({
  name: "products",
  mappings: {
    name: { type: "text" },
    category: { type: "keyword" },
    price: { type: "number" },
    description: { type: "text" },
  },
  settings: {
    vectorDimensions: 384,
    autoEmbed: true,
    enableVisualExtraction: true,
  },
});

// 2. Index a Document
await client.documents.index("products", {
  id: "prod-101",
  fields: {
    name: "Kanjivaram Silk Saree",
    category: "sarees",
    price: 14999,
    description: "Pure handloom silk saree with gold zari border.",
  },
  meta: {
    slug: "kanjivaram-silk-saree",
    inStock: true,
  },
});

// 3. Search
const results = await client.search("products", {
  q: "festive silk wedding saree",
  mode: "hybrid",
  highlight: true,
});

console.log(`Found ${results.total} results:`, results.hits);
```

## License

Apache-2.0 © [VaagaTech](https://www.vaagatech.com)
