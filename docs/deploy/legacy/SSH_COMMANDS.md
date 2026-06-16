# SSH / Terminal Commands for cPanel Node.js App Deployment

These commands are still useful for recovery and inspection, but the canonical deploy path is:

- push `dev` or `main`
- let GitHub publish the matching `cpanel-*` branch
- use cPanel `Git Version Control` to apply the latest `HEAD`

## Restart Production

```bash
ssh distudio@di-studio.xyz
cd ~/serverXR
npm install --production
cloudlinux-selector restart --json --interpreter nodejs --user distudio --app-root serverXR
```

## Restart Staging

```bash
ssh distudio@di-studio.xyz
cd ~/serverXR-staging
npm install --production
cloudlinux-selector restart --json --interpreter nodejs --user distudio --app-root serverXR-staging
```

## Manual Backup Before Recovery

```bash
ssh distudio@di-studio.xyz
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p ~/deploy-backups/"$TIMESTAMP"-manual
tar -czf ~/deploy-backups/"$TIMESTAMP"-manual/public_html.tar.gz -C ~/public_html .
tar -czf ~/deploy-backups/"$TIMESTAMP"-manual/serverXR.tar.gz -C ~/serverXR .
```

## Quick Checks

```bash
curl https://di-studio.xyz/serverXR/api/health
curl https://di-studio.xyz/serverXR/api/events
curl https://staging.di-studio.xyz/serverXR/api/health
```

## If `cloudlinux-selector` Is Missing

Your host is not exposing the normal CloudLinux Node.js CLI. In that case restart from the cPanel `Setup Node.js App` screen instead of falling back to PM2.
