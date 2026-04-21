# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public issue.
Instead, report it privately by emailing the maintainers or using
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

We aim to acknowledge reports within **48 hours** and provide a resolution timeline within **7 days**.

---

## Sensitive Data & Secret Management

### Never Commit Secrets

The following must **never** be committed to the repository:

| Type | Examples |
|------|---------|
| API tokens / bearer tokens | `VITE_API_TOKEN`, `API_TOKEN` |
| Passwords & passphrases | Database, SSH, admin passwords |
| Private keys & certificates | `*.pem`, `*.key`, `*.p12` |
| Cloud credentials | AWS access keys, GCP service account JSON |
| Deployment config with real values | cPanel deploy env files |

### Using `.env` Files Safely

1. **Copy the template** — never edit the example file directly:
   ```bash
   cp .env.example .env
   cp serverXR/.env.example serverXR/.env
   ```
2. **Fill in your local values** in the copied files.
3. **Verify git status** before committing — `.env` and `serverXR/.env` are listed in
   `.gitignore` and should never appear as staged files.

### Generating Strong Tokens

```bash
# 32-byte URL-safe base64 token (recommended for API_TOKEN / VITE_API_TOKEN)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## Environment Configuration Guidelines

### Frontend (Vite)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Full URL (or relative path) to the ServerXR API |
| `VITE_API_TOKEN` | Bearer token sent with authenticated requests |

- Local development: set `VITE_API_BASE_URL=/serverXR` so Vite's dev proxy forwards requests.
- Production: set `VITE_API_BASE_URL` to the deployed backend URL.
- `VITE_API_TOKEN` must match the `API_TOKEN` in `serverXR/.env`.

### Backend (ServerXR)

| Variable | Description |
|----------|-------------|
| `PORT` | Port the server listens on (default `4000`) |
| `APP_BASE_PATH` | Base path behind a reverse proxy (default `/serverXR`) |
| `DATA_ROOT` | Directory for persisted scene & asset data |
| `API_TOKEN` | Secret token required for write requests |
| `REQUIRE_AUTH` | Enforce bearer-token auth (`true` / `false`) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `MAX_UPLOAD_MB` | Maximum asset upload size in MB |

See `serverXR/.env.example` for the full list of optional overrides.

---

## What To Do If a Secret Is Accidentally Committed

1. **Revoke / rotate the secret immediately** — treat the exposed value as compromised.
2. **Remove the secret from git history** using
   [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or
   `git filter-repo`.
3. **Force-push the cleaned history** and notify all collaborators to re-clone.
4. **Update `.gitignore`** to prevent a recurrence.

---

## Automated Secret Detection

This repository runs a GitHub Actions workflow (`.github/workflows/secret-scanning.yml`)
that scans every push and pull request for common secret patterns.

GitHub's built-in **Secret Scanning** and **Push Protection** can also be enabled in
repository settings under *Security & analysis*:

- **Secret scanning** — alerts on known secret patterns already in the repo.
- **Push protection** — blocks pushes that contain detected secrets before they land.
