# Docker & Deployment Rules

## Docker
- Two-stage build: deps stage (with native build tools) → production stage (alpine)
- Base image: `node:20-alpine`
- Native deps need `python3 make g++` in build stage for `better-sqlite3`
- Use `npm ci --production` for deterministic installs
- Health check: `GET /health` returns `{ status: 'ok' }`
- Expose port 3000

## Environment Variables
| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | Server port (default: 3000) |
| `DATA_DIR` | Yes | Path for SQLite DBs and uploads |
| `SESSION_SECRET` | Yes | Session cookie signing key |
| `ENCRYPTION_KEY` | Yes | AES-256 key for SMTP passwords (32 hex chars) |
| `ADMIN_EMAIL` | Yes | Seed admin account email |
| `ADMIN_PASSWORD` | Yes | Seed admin account password |

## Data Persistence
- `DATA_DIR` must be a mounted volume in Docker — contains SQLite DBs and uploaded files
- Session DB (`sessions.db`) also lives in `DATA_DIR`
- Uploaded files are temporary — cleaned up after processing

## Deployment Targets
- **Render**: Dockerized deployment with persistent disk
- **Self-hosted**: WSL2 + Caddy as reverse proxy
- Services started with `sudo service <name> start` (not systemctl) on WSL2
