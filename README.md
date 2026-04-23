# Versance Dashboard

Daily-refreshed static dashboard for sequence 303463253 — built for client share.

## How it works

1. **`build.js`** runs on Vercel during each deploy. It:
   - Fetches the 75 contacts in the HubSpot sequence
   - Calls the WF-D webhook for n8n workflow stats
   - Renders `dist/index.html` with all data baked in
2. **GitHub Action (`.github/workflows/refresh.yml`)** runs daily at 13:00 UTC and pings the Vercel deploy hook to trigger a fresh build
3. **Vercel** serves `dist/index.html` at the deployment URL

The HubSpot Private App token only ever lives in Vercel env vars — never in the browser, never in the repo, never in Cowork.

## One-time setup

### 1. Push to GitHub

```bash
cd versance-dashboard
git init
git add .
git commit -m "Initial commit"
git branch -M main
gh repo create versance-dashboard --private --source=. --push
```

(Or create the repo via the GitHub UI and push manually.)

### 2. Import to Vercel

- Go to https://vercel.com/new
- Import the GitHub repo
- Framework preset: **Other** (Vercel will detect `vercel.json`)
- Build command: `node build.js` (already in `vercel.json`)
- Output directory: `dist` (already in `vercel.json`)
- Click **Deploy** — first build will fail because env var is missing, that's expected

### 3. Add HubSpot token to Vercel

- In the Vercel project: **Settings → Environment Variables**
- Add: `HUBSPOT_TOKEN` = your existing HubSpot Private App Bearer token (the same one your n8n WF-C/WF-E use, **without** the word "Bearer" — just the raw token)
- Optional: `WFD_WEBHOOK` if your n8n URL ever changes (default: `https://mfunston.app.n8n.cloud/webhook/versance-reporting`)
- Redeploy from the Deployments tab — should succeed now

### 4. Wire up the daily refresh

- In Vercel project: **Settings → Git → Deploy Hooks**
- Create a hook called "Daily Refresh", branch `main`
- Copy the URL
- In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `VERCEL_DEPLOY_HOOK`, Value: the URL from above
- Test it: GitHub repo → **Actions tab → Daily Refresh → Run workflow**. Should trigger a fresh Vercel build.

### 5. Add auth (REQUIRED before sharing with George)

The dashboard exposes contact PII. **Do not share the URL until you've added auth.**

Recommended: **Cloudflare Access** (free tier supports up to 50 users)

- Sign up at cloudflare.com (free)
- Add your Vercel domain as a Cloudflare site (or use Cloudflare Pages instead of Vercel — same setup)
- Cloudflare Zero Trust → Access → Applications → Add an application
- Self-hosted, your domain, restrict to specific email addresses (you + George)
- Cloudflare prompts for Google/email login before serving the page

Alternative if you don't want Cloudflare: Vercel Password Protection (Pro plan, $20/mo) — single shared password.

## Local dev

```bash
HUBSPOT_TOKEN=pat-na1-xxxxxxxx node build.js
open dist/index.html
```

## Adjusting refresh cadence

Edit `.github/workflows/refresh.yml`:

- Daily at 9am ET (current): `'0 13 * * *'`
- Twice daily (9am + 5pm ET): `'0 13,21 * * *'`
- Hourly during business hours: `'0 13-22 * * 1-5'`

GitHub Actions free tier comfortably handles hourly.

## File map

```
versance-dashboard/
├── build.js              ← Node script: fetch + render
├── template.html         ← HTML with __PLACEHOLDERS__ for data
├── vercel.json           ← Vercel build config
├── package.json          ← Node 20+ (uses built-in fetch)
├── .gitignore
├── README.md
└── .github/
    └── workflows/
        └── refresh.yml   ← Daily cron
```
