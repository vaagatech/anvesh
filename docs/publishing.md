---
title: Publish to npm
section: Ship
description: Publish shared, engine, indexer, and spider under the @vaagatech scope.
permalink: /publishing/
---

The monorepo root and Hub are **private** and are not published.

## Packages

| Package | Name |
|---------|------|
| Shared | `@vaagatech/anvesh-shared` |
| Engine | `@vaagatech/anvesh-engine` |
| Indexer | `@vaagatech/anvesh-indexer` |
| Spider | `@vaagatech/anvesh-spider` |

Publish order: **shared → engine → indexer → spider**.

## Steps

```bash
npm login
npm install
npm test
npm run build

npm run publish:dry        # preview
npm run publish:packages   # real publish
```

Or per package:

```bash
npm publish -w @vaagatech/anvesh-shared --access public
npm publish -w @vaagatech/anvesh-engine --access public
npm publish -w @vaagatech/anvesh-indexer --access public
npm publish -w @vaagatech/anvesh-spider --access public
```

## Afterward

```bash
npm install @vaagatech/anvesh-engine
npm install -g @vaagatech/anvesh-spider @vaagatech/anvesh-indexer
```

Bump versions before republishing — npm rejects duplicate versions.

Recommended sequence for open source launch:

1. Enable [GitHub Pages]({{ '/github-pages/' | relative_url }}) (this site)
2. Publish npm packages
3. Point README badges at the Pages URL
