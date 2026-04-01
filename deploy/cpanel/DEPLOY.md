# cPanel Release Bundle

This folder is the template source for the staged cPanel release built by:

```bash
npm run deploy:cpanel
```

That command creates:

```text
.deploy/cpanel/
├── public_html/
├── serverXR/
├── shared/
├── frontend.env.production.example
└── DEPLOY.md
```

## Upload Targets

- Upload `.deploy/cpanel/public_html/*` to your domain web root such as `public_html/`
- Upload `.deploy/cpanel/serverXR/` to your home directory such as `~/serverXR/`
- Upload `.deploy/cpanel/shared/` to your home directory such as `~/shared/`

The `shared/` folder is required because `serverXR/src` imports the shared schemas from `../../shared`.

## First-Time Server Setup

```bash
cd ~/serverXR
cp .env.production.example .env
npm install --production
pm2 start ecosystem.config.js
pm2 save
```

## Verify

- Frontend: `https://your-domain/`
- Server status: `https://your-domain/serverXR/`
- Health: `https://your-domain/serverXR/api/health`

