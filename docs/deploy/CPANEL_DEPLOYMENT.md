# cPanel Deployment Guide for di-studio.xyz

## 🚀 Quick Deployment Steps

### 1. Build the Frontend
```bash
# Make sure you're in the project root
npm run build
```

This creates the `dist/` folder with your compiled React app, configured to use `https://di-studio.xyz/serverXR` as the API endpoint.

### 2. Upload Files to cPanel

#### A. Upload Frontend (dist/ folder)
1. Go to cPanel → **File Manager**
2. Navigate to `public_html/` (or your domain's root folder)
3. Upload **ALL contents** of the `dist/` folder (not the dist folder itself)
   - index.html
   - assets/
   - default-scene/
   - serverXR/ (with serve-asset.php and .htaccess)
   - .htaccess
   - etc.

#### B. Upload Backend (serverXR/ folder)
1. In cPanel File Manager, navigate to your **home directory** (not public_html)
2. Create a folder named `serverXR` (if it doesn't exist)
3. Upload the contents of your local `serverXR/` folder to this directory:
   - src/
   - .env (the one we created)
   - ecosystem.config.js
   - package.json
   - package-lock.json

### 3. Setup PM2 via SSH

1. **Connect via SSH** to your cPanel account

2. **Install dependencies and start with PM2:**
   ```bash
   cd ~/serverXR
   npm install --production
   
   # Start the app with PM2
   pm2 start ecosystem.config.js
   
   # Save PM2 process list (keeps running after logout)
   pm2 save
   
   # Setup PM2 to start on server reboot (optional)
   pm2 startup
   ```

3. **Verify it's running:**
   ```bash
   pm2 list
   pm2 logs dii-control-server
   ```
   
   You should see "ServerXR listening on port 4000" in the logs.

### 4. Verify Deployment

Open these URLs in your browser:

1. **Frontend:** https://di-studio.xyz/
   - Should show the 3D editor

2. **Server Status:** https://di-studio.xyz/serverXR/
   - Should show "ServerXR is running" with status info

3. **API Health:** https://di-studio.xyz/serverXR/api/health
   - Should return JSON: `{"status":"ok"}`

## 🧪 Test Asset Loading

1. Open https://di-studio.xyz/ in **Firefox**
2. Create a new scene
3. Press **Shift+D** then **Shift+I** to enable admin mode
4. Drag an image onto the canvas
5. Click **Save to Server** (make the space permanent if needed)
6. Copy the URL and open it in **Chrome**
7. The image should load correctly! ✅

Check the browser console for logs like:
```
Attempting to stream asset [id] from candidates: [...]
Trying asset URL: https://di-studio.xyz/serverXR/api/spaces/[space]/assets/[id]
Successfully fetched asset from: [url]
```

## 📁 File Structure on cPanel

```
/home/YOUR_USERNAME/
├── public_html/                    # Web root (served at https://di-studio.xyz/)
│   ├── index.html                  # React app entry
│   ├── assets/                     # React app JS/CSS bundles
│   ├── default-scene/              # Default assets
│   ├── serverXR/                   # Proxy fallback
│   │   ├── .htaccess              # Proxies to Node.js + PHP fallback
│   │   └── serve-asset.php        # PHP fallback for assets
│   └── .htaccess                   # SPA routing
│
└── serverXR/                       # Node.js app (served at /serverXR via cPanel)
    ├── src/
    │   ├── index.js               # Express server
    │   └── config.js
    ├── data/                       # Created automatically
    │   └── spaces/                # User spaces & assets
    ├── .env                        # Configuration
    ├── package.json
    └── ecosystem.config.js
```

## 🔧 Troubleshooting

### Assets return HTML instead of image data

**Symptom:** Console shows "Asset [id] unsupported MIME: text/html"

**Causes & Fixes:**
1. **Node.js app not running:**
   - Go to cPanel → Setup Node.js App → Restart
   - Check Application Log for errors

2. **Wrong data directory path:**
   - The `.env` file should have `DATA_ROOT=./data`
   - If using absolute path: `DATA_ROOT=/home/YOUR_USERNAME/serverXR/data`

3. **Assets not on server:**
   - Make sure you clicked "Save to Server" after uploading
   - Space must be permanent or have publishing enabled

### Node.js app won't start

**Check PM2 logs:**
```bash
# SSH into cPanel
cd ~/serverXR
pm2 logs dii-control-server --lines 50
```

**Common issues:**
- **Port already in use:** Change PORT in `.env` (default 4000)
- **Missing modules:** Run `npm install --production`
- **Permission issues:** Ensure `data/` folder is writable: `chmod 755 data`

**PM2 Management Commands:**
```bash
# Restart the app
pm2 restart dii-control-server

# Stop the app
pm2 stop dii-control-server

# View status
pm2 list

# View logs in real-time
pm2 logs dii-control-server

# Delete from PM2
pm2 delete dii-control-server
```

### CORS errors from API

**Update serverXR/.env:**
```env
CORS_ORIGINS=https://di-studio.xyz,https://www.di-studio.xyz
```

Then restart the Node.js app in cPanel.

### Changes not appearing

1. **Frontend changes:** Rebuild with `npm run build` and re-upload `dist/` contents
2. **Backend changes:** 
   ```bash
   # SSH to cPanel
   cd ~/serverXR
   # Upload your changed files, then:
   pm2 restart dii-control-server
   ```
3. **Clear browser cache:** Ctrl+Shift+R (Chrome/Firefox)

## 🛡️ Optional: Secure with API Token

1. Edit `serverXR/.env`:
   ```env
   API_TOKEN=your-very-secure-random-token-here
   REQUIRE_AUTH=true
   ```

2. Rebuild frontend with token:
   ```bashPM2:
   ```bash
   pm2 restart dii-control-server
   ```
   # On local machine
   $env:VITE_API_TOKEN="your-very-secure-random-token-here"
   npm run build
   ```

3. Re-upload `dist/` and restart Node.js app

## 🎉 Success!

When everything works:
- ✅ https://di-studio.xyz/ loads the editor
- ✅ https://di-studio.xyz/serverXR/api/health returns OK
- ✅ Assets uploaded in one browser appear in another browser
- ✅ Console shows: "Successfully fetched asset from: https://di-studio.xyz/serverXR/api/spaces/..."

## 📞 Need Help?

- Check Node.js app logs in cPanel
- Check browser console for asset loading details
- Verify .htaccess files are uploaded correctly
- Ensure Node.js app is running in cPanel
