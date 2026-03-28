# How to Push Code with Rival CLI

## Prerequisites

Make sure you are logged in:

```bash
rival login
```

This saves your token and org to `~/.rival/config.json` automatically.

---

## Option A — Flags (quick)

```bash
rival push handler.py --function-id <your-function-id> --version Draft
```

Multiple files:

```bash
rival push handler.py utils.py requirements.txt --function-id abc-123 --version Draft
```

---

## Option B — `rival.json` (recommended)

Create a `rival.json` in your function's root directory:

```json
{
  "functionId": "48edf337-1adf-4cb4-a073-2a02b4d10341",
  "version": "Draft",
  "files": [
    "handler.py",
    "utils.py",
    "requirements.txt"
  ]
}
```

Then run from that directory:

```bash
rival push
```

---

## Finding Your Function ID

Go to your function on [cortexone.rival.io](https://cortexone.rival.io) → open the function → copy the ID from the URL or the function settings page (UUID format).

---

## Example Project Layout

```
my-function/
├── rival.json
├── handler.py
└── requirements.txt
```

```bash
cd my-function
rival push
```

Output:

```
✔ Loaded 2 file(s)

Function:  48edf337-1adf-4cb4-a073-2a02b4d10341
Version:   Draft
Files:
  /handler.py        (text/x-python)
  /requirements.txt  (text/plain)

✔ Code pushed successfully!
```

---

## Full Flag Reference

| Flag | Description | Default |
|------|-------------|---------|
| `-f, --function-id <id>` | Function ID to push to | required (or from `rival.json`) |
| `-v, --version <version>` | Version name | `Draft` |
| `-a, --asset-id <id>` | Digital asset ID (Storm functions only) | — |
| `-u, --api-url <url>` | Override API base URL | from `.env` |
| `--cwd <dir>` | Run from a different directory | current directory |

---

## Environment Variables (no login required)

```bash
export RIVAL_TOKEN=your-session-token
export RIVAL_ORG_ID=48edf337-1adf-4cb4-a073-2a02b4d10341
export RIVAL_API_URL=https://cortexone-api-dev.rival.io

rival push handler.py --function-id abc-123
```

---

## Supported File Types

| Extension | MIME Type |
|-----------|-----------|
| `.py` | `text/x-python` |
| `.js` / `.jsx` | `text/javascript` |
| `.ts` / `.tsx` | `text/x-typescript` |
| `.json` | `application/json` |
| `.yaml` / `.yml` | `text/yaml` |
| `.sh` | `text/x-sh` |
| `.md` | `text/markdown` |
| `.html` | `text/html` |
| `.css` | `text/css` |
| everything else | `text/plain` |
