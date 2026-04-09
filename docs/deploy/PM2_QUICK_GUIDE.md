# Quick PM2 Deployment for di-studio.xyz

Legacy emergency-only reference.

Do not use this as the normal future path for this repo.

If your cPanel account includes `Setup Node.js App`, use the cPanel Node.js App flow documented in [docs/deploy/CPANEL_DEPLOYMENT.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_DEPLOYMENT.md) instead.

## 🚀 Deploy/Update in 3 Steps

### 1. Build locally
```powershell
.\build-for-cpanel.ps1
```

### 2. Upload via FTP/cPanel File Manager
- Upload `dist/` contents → `public_html/`
- Upload `serverXR/` → `~/serverXR/`

### 3. Restart via SSH
```bash
ssh your-username@di-studio.xyz

cd ~/serverXR

# First time only:
npm install --production
pm2 start ecosystem.config.js
pm2 save

# Updates (every time after):
pm2 restart dii-control-server
```

## 📊 PM2 Commands

```bash
# Check status
pm2 list

# View logs
pm2 logs dii-control-server

# Tail logs in real-time
pm2 logs dii-control-server --lines 100

# Restart
pm2 restart dii-control-server

# Stop
pm2 stop dii-control-server

# Start again
pm2 start ecosystem.config.js

# Remove from PM2
pm2 delete dii-control-server
```

## ✅ Verify Deployment

Open in browser:
- **Editor:** https://di-studio.xyz/
- **API Health:** https://di-studio.xyz/serverXR/api/health
- **Server Status:** https://di-studio.xyz/serverXR/

Check logs:
```bash
pm2 logs dii-control-server --lines 50
```

Look for: `ServerXR listening on port 4000`

## 🔧 Troubleshooting

### App not starting
```bash
cd ~/serverXR
pm2 logs dii-control-server --err --lines 50
```

### Port already in use
Edit `~/serverXR/.env`:
```env
PORT=4001
```
Then: `pm2 restart dii-control-server`

### CORS errors
Edit `~/serverXR/.env`:
```env
CORS_ORIGINS=https://di-studio.xyz,https://www.di-studio.xyz
```
Then: `pm2 restart dii-control-server`

### Assets not loading
Check browser console for detailed logs:
```
Attempting to stream asset [id] from candidates: [...]
Trying asset URL: https://di-studio.xyz/serverXR/api/spaces/...
```

If URLs are wrong, rebuild frontend with correct `.env`:
```powershell
# Local machine
Get-Content .env
# Should show: VITE_API_BASE_URL=https://di-studio.xyz/serverXR

.\build-for-cpanel.ps1
# Then re-upload dist/
```

## 🎯 Common Workflow

**After making code changes:**

1. **Frontend changes** (React, CSS, etc):
   ```powershell
   .\build-for-cpanel.ps1
   # Upload dist/ → public_html/
   # Clear browser cache
   ```

2. **Backend changes** (Express, API, etc):
   ```bash
   # Upload serverXR files
   ssh your-username@di-studio.xyz
   cd ~/serverXR
   pm2 restart dii-control-server
   ```

3. **Both**:
   ```powershell
   .\build-for-cpanel.ps1
   ```
   Upload both folders, then:
   ```bash
   pm2 restart dii-control-server
   ```

## 🛡️ Production Best Practices

### Enable API authentication
```bash
# On server: ~/serverXR/.env
API_TOKEN=your-very-secure-random-token
REQUIRE_AUTH=true
```

### Rebuild frontend with token
```powershell
# Local machine: .env
VITE_API_BASE_URL=https://di-studio.xyz/serverXR
VITE_API_TOKEN=your-very-secure-random-token
```
Then rebuild and upload.

### Auto-start on server reboot
```bash
pm2 startup
# Copy/paste the command it gives you
pm2 save
```

### Monitor memory usage
```bash
pm2 monit
```

## 🎉 Success Checklist

- ✅ PM2 shows "online" status: `pm2 list`
- ✅ Logs show "listening on port 4000": `pm2 logs`
- ✅ Health endpoint works: https://di-studio.xyz/serverXR/api/health
- ✅ Editor loads: https://di-studio.xyz/
- ✅ Assets upload and appear in other browsers
- ✅ Console shows successful asset fetches from server URLs
