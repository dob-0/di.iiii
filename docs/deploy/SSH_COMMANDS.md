# SSH Commands for di-studio.xyz PM2 Deployment

## First Time Setup

```bash
# SSH into your server
ssh your-username@di-studio.xyz

# Navigate to serverXR directory
cd ~/serverXR

# Install Node dependencies
npm install --production

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Optional: Auto-start on server reboot
pm2 startup
# Run the command it outputs, then:
pm2 save
```

## Regular Updates (After Uploading Files)

```bash
# SSH into your server
ssh your-username@di-studio.xyz

# Restart the application
cd ~/serverXR
pm2 restart dii-control-server
```

## Quick Check

```bash
# Check if running
pm2 list

# View recent logs
pm2 logs dii-control-server --lines 50

# View errors only
pm2 logs dii-control-server --err --lines 20
```

## One-Liner for Quick Restart

```bash
ssh your-username@di-studio.xyz "cd ~/serverXR && pm2 restart dii-control-server"
```

## Testing via curl

```bash
# Test health endpoint
curl https://di-studio.xyz/serverXR/api/health

# Expected response:
# {"status":"ok"}
```
