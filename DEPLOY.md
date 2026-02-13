# Deployment Guide

SendReed runs on either Render (cloud) or a self-hosted Windows 11 machine via WSL2. The same Docker image works on both — only environment variables differ.

---

## Option 1: Render (Cloud)

### Setup

1. Create a **Web Service** on [Render](https://render.com)
2. Connect your Git repository
3. Configure:
   - **Environment**: Docker
   - **Plan**: Starter ($7/mo)
   - **Disk**: Add a 1GB persistent disk mounted at `/data`
   - **Health Check Path**: `/health`

### Environment Variables

Set these in the Render dashboard:

```
NODE_ENV=production
PORT=3000
DATA_DIR=/data
BASE_URL=https://your-app.onrender.com
SESSION_SECRET=<random-64-chars>
ENCRYPTION_KEY=<random-64-hex-chars>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong-password>
```

### Deploy

Render auto-deploys on `git push` to your connected branch. The health check at `/health` ensures zero-downtime deploys.

### Notes

- Render handles SSL/TLS automatically
- The persistent disk at `/data` stores the SQLite database and session store
- Free-tier Render services spin down after inactivity — use Starter plan for always-on

---

## Option 2: Self-Hosted (WSL2 on Windows 11)

This setup runs Docker inside WSL2 with Caddy handling HTTPS via automatic Let's Encrypt certificates. Your router forwards ports 80/443 to the Windows host, which proxies them into WSL2.

### Prerequisites

- Windows 11 Pro
- WSL2 with Ubuntu 22.04 installed
- Docker Engine installed in WSL2 (not Docker Desktop)
- A router with DDNS support (e.g., TP-Link Archer with built-in DDNS)
- A DDNS hostname pointing to your public IP

### 1. Configure DDNS

Set up DDNS on your router so your public IP stays reachable by hostname. For a TP-Link Archer:

1. Router admin > Advanced > Network > Dynamic DNS
2. Register a hostname (e.g., `yourname.ddns.net`)
3. Enable auto-refresh

### 2. Port Forwarding

On your router, forward ports **80** and **443** to your Windows host's local IP:

| External Port | Internal Port | Protocol | Destination |
|---------------|---------------|----------|-------------|
| 80 | 80 | TCP | 192.168.x.x (Windows IP) |
| 443 | 443 | TCP | 192.168.x.x (Windows IP) |

### 3. WSL2 Port Proxy

WSL2 gets a dynamic IP on each boot. Windows needs to forward incoming traffic to that IP. Create a PowerShell script that runs on Windows startup.

**Create `C:\Scripts\wsl-portproxy.ps1`:**

```powershell
# Get WSL2 IP address
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]

# Remove old rules
netsh interface portproxy reset

# Forward ports 80 and 443 to WSL2
netsh interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=80 connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp

# Verify
netsh interface portproxy show all
```

### 4. Windows Scheduled Task

Run the port proxy script on every login (since WSL2 IP changes on reboot):

1. Open **Task Scheduler**
2. Create Task (not Basic Task):
   - **General**: Run with highest privileges, configure for Windows 10/11
   - **Trigger**: At log on (any user)
   - **Action**: Start a program
     - Program: `powershell.exe`
     - Arguments: `-ExecutionPolicy Bypass -File C:\Scripts\wsl-portproxy.ps1`
3. Also add a trigger for "At startup" so it runs even without login

### 5. Windows Firewall

Allow inbound traffic on ports 80 and 443:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "HTTP Inbound" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "HTTPS Inbound" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

### 6. Update Caddyfile

Edit `Caddyfile` with your DDNS hostname:

```
yourname.ddns.net {
  reverse_proxy app:3000
}
```

Caddy automatically obtains and renews Let's Encrypt certificates.

### 7. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
NODE_ENV=production
PORT=3000
DATA_DIR=/data
BASE_URL=https://yourname.ddns.net
SESSION_SECRET=<random-64-chars>
ENCRYPTION_KEY=<random-64-hex-chars>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong-password>
```

### 8. Start the Application

```bash
docker compose up -d
```

Verify:
- `docker compose ps` — both `caddy` and `app` should be running
- `docker compose logs app` — should show "SendReed running on http://localhost:3000"
- Visit `https://yourname.ddns.net` — should load the login page with a valid SSL certificate

### 9. Prevent Laptop Sleep

If running on a laptop:

1. **Settings > System > Power** — set "When plugged in, put my device to sleep" to **Never**
2. **Settings > System > Power** — set lid close action to **Do nothing** (when plugged in)
3. **BIOS** — enable "Restore on AC Power Loss" (auto-restart after power outage)
4. Consider a UPS for power stability

---

## Migrating Between Targets

The SQLite database file is the only stateful data. To migrate:

1. Stop the app on the source: `docker compose down`
2. Copy the database from the Docker volume:
   ```bash
   docker cp $(docker compose ps -q app):/data/sendreed.db ./sendreed.db
   ```
3. Transfer `sendreed.db` to the new host
4. Import into the new Docker volume:
   ```bash
   docker cp ./sendreed.db $(docker compose ps -q app):/data/sendreed.db
   ```
5. Update `BASE_URL` in `.env` for the new domain
6. Start the app: `docker compose up -d`

---

## Troubleshooting

**Port proxy not working after WSL2 reboot:**
```powershell
# Check current rules
netsh interface portproxy show all
# Re-run the script
powershell -ExecutionPolicy Bypass -File C:\Scripts\wsl-portproxy.ps1
```

**Caddy can't get SSL certificate:**
- Ensure ports 80 and 443 are forwarded and reachable from the internet
- Check Caddy logs: `docker compose logs caddy`
- Verify DDNS resolves: `nslookup yourname.ddns.net`

**App not starting:**
- Check logs: `docker compose logs app`
- Verify `.env` has all required variables
- Ensure the data volume is mounted: `docker compose exec app ls /data`

**WSL2 IP changed:**
- Re-run the portproxy script or reboot to trigger the scheduled task
- Check current WSL2 IP: `wsl hostname -I`
