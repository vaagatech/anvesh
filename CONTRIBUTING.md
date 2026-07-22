# Contributing to Anvesh

Thanks for helping improve Anvesh — an open-source project by [VaagaTech](https://www.vaagatech.com).

## Principles

1. Keep the engine understandable — prefer clear code over clever abstractions.
2. API user messages and logs stay meaningful (extend `@vaagatech/vaakly` / plugins).
3. Hub remains optional; never require the UI for core features.
4. Storage adapters must honor the `StorageAdapter` contract.
5. Add tests for ranking, validation, and API envelopes.

## Setup

```bash
npm install
npm test
npm run lint
```

## Documentation

Edit Markdown under [`docs/`](./docs/). The site is GitHub Pages from the `/docs` folder — no Actions workflow required. See [`docs/github-pages.md`](./docs/github-pages.md).

## Pull requests

- Describe *why* the change helps serverless/lightweight deployments.
- Include a short test plan.
- Do not commit secrets or large binary indexes.
- Keep Hub optional; never require the UI for core features.
- Extend meaningful API/log messages in `packages/vaakly` (or add a messaging plugin) when adding user-facing outcomes.
- New plugins follow [Creating plugins](docs/guides/plugins.md) — tools are LLM-tool shaped (`name`, `description`, `parameters`, `execute`).

## Code of conduct

Be respectful. Harassment or discrimination is not tolerated. Report issues to info@vaagatech.com.
