# @vaagatech/anvesh-cli

Command-line interface and GitOps automation tool for the **Anvesh Search & Vector Engine**.

## Installation

```bash
npm install -g @vaagatech/anvesh-cli
```

## Commands

| Command | Description |
|---|---|
| `anvesh init` | Generates a starter `anvesh.config.json` |
| `anvesh plan -f <file>` | Computes schema and config drift vs live cluster |
| `anvesh apply -f <file>` | Applies declarative configuration to live cluster |
| `anvesh export` | Exports live cluster configuration to JSON |
| `anvesh index list` | Lists all indexes on the cluster |
| `anvesh index create <name>` | Creates a new search index |
| `anvesh index delete <name>` | Deletes an index |
| `anvesh search <index> -q <query>` | Runs hybrid search from terminal |
| `anvesh ocr <image_path_or_url>` | Runs pure-CPU local OCR on an image |
| `anvesh health` | Displays cluster uptime, node health, and memory stats |

## Configuration & Authentication

Provide credentials via flags or environment variables:
```bash
export ANVESH_URL="https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh"
export ANVESH_CLIENT_ID="..."
export ANVESH_CLIENT_SECRET="..."
export ANVESH_TOKEN_URL="https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token"
export ANVESH_SCOPE="https://api.vaagatech.com/apps.all"
```

## License

Apache-2.0 © [VaagaTech](https://www.vaagatech.com)
