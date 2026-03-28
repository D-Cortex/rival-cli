# Rival CLI

Push function code and manage your Rival workspace from the terminal.

## Installation

```bash
npm install -g @rival/cli
```

Or run locally after cloning:

```bash
npm install
npm run build
npm link
```

---

## Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```env
DESCOPE_PROJECT_ID=your-descope-project-id
RIVAL_API_URL=https://cortexone-api-dev.rival.io
RIVAL_TOKEN=        # set automatically after `rival login`
RIVAL_ORG_ID=       # set automatically after `rival login`
```

---

## Commands

### `rival login`

Log in to Rival using your email via OTP (Descope).

```bash
rival login
```

**Flow:**
1. Enter your Rival email
2. Enter the OTP code sent to your inbox
3. Select your organization from the list
4. Credentials are saved to `~/.rival/config.json`

**Options:**

| Flag | Description |
|------|-------------|
| `-e, --email <email>` | Skip the email prompt |
| `-u, --api-url <url>` | Override the API base URL |

**Examples:**

```bash
rival login
rival login --email aryan@rival.io
rival login --email aryan@rival.io --api-url https://cortexone-api-dev.rival.io
```

---

### `rival push`

Push local code files to a Rival function.

```bash
rival push [files...] --function-id <id>
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-f, --function-id <id>` | Function ID to push to | required (or from `rival.json`) |
| `-v, --version <version>` | Version name | `Draft` |
| `-a, --asset-id <id>` | Digital asset ID (Storm functions only) | — |
| `-u, --api-url <url>` | Override API base URL | from `.env` |
| `--cwd <dir>` | Run from a different directory | current directory |

**Examples:**

```bash
# Push a single file
rival push handler.py --function-id abc-123

# Push multiple files
rival push handler.py utils.py requirements.txt --function-id abc-123

# Push a specific version
rival push handler.py --function-id abc-123 --version v1.0

# Push from a different directory
rival push --function-id abc-123 --cwd ./my-function

# Push using rival.json (no flags needed)
rival push
```

**Using `rival.json`:**

Create a `rival.json` in your project directory:

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

Then just run:

```bash
rival push
```

**Supported file types:**

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

---

### `rival whoami`

Show your current login state and saved config.

```bash
rival whoami
```

**Output:**

```
Logged in
  Email:  aryan@rival.io
  Org ID: 48edf337-1adf-4cb4-a073-2a02b4d10341
  API:    https://cortexone-api-dev.rival.io
```

If not logged in:

```
Not logged in. Run `rival login` to authenticate.
```

---

### `rival logout`

Clear saved credentials from `~/.rival/config.json`.

```bash
rival logout
```

**Output:**

```
✓ Logged out. Credentials cleared.
```

---

## Environment Variables

All commands respect these environment variables. They take priority over `~/.rival/config.json`.

| Variable | Description |
|----------|-------------|
| `RIVAL_API_URL` | API base URL |
| `RIVAL_TOKEN` | Descope session token |
| `RIVAL_ORG_ID` | Organization ID |
| `DESCOPE_PROJECT_ID` | Descope project ID (required for login) |

**Using env vars instead of login:**

```bash
export RIVAL_TOKEN=your-session-token
export RIVAL_ORG_ID=48edf337-1adf-4cb4-a073-2a02b4d10341
export RIVAL_API_URL=https://cortexone-api-dev.rival.io

rival push handler.py --function-id abc-123
```

---

## Config File

Credentials are stored at `~/.rival/config.json` after running `rival login`:

```json
{
  "token": "...",
  "orgId": "48edf337-1adf-4cb4-a073-2a02b4d10341",
  "email": "aryan@rival.io",
  "apiUrl": "https://cortexone-api-dev.rival.io"
}
```

---

## Typical Workflow

```bash
# 1. Login once
rival login

# 2. Go to your function directory
cd my-function

# 3. Create rival.json
echo '{
  "functionId": "your-function-id",
  "version": "Draft",
  "files": ["handler.py"]
}' > rival.json

# 4. Push code
rival push

# 5. Check who you are logged in as
rival whoami

# 6. Logout when done
rival logout
```
