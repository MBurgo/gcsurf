# GCSurf — Gold Coast Beach & Surf Conditions

A free, open-source surf conditions dashboard for the Gold Coast, Australia. Built on Cloudflare Pages with live data from Queensland Government wave buoys, Bureau of Meteorology weather stations, and Maritime Safety Queensland tide predictions.

## Live Data Sources

| Data | Source | Update Frequency | Cost |
|------|--------|-----------------|------|
| Swell (Hs, Hmax, Tp, direction, SST) | [QLD Gov Wave Buoy CSV](https://apps.des.qld.gov.au/data-sets/waves/wave-7dayopdata.csv) | ~30 min | Free (open data) |
| Wind, air temp, humidity, gusts | [BOM Gold Coast Seaway JSON](http://www.bom.gov.au/fwo/IDQ60801/IDQ60801.94580.json) | ~30 min | Free (personal use) |
| Tide predictions | [MSQ Open Data](https://www.msq.qld.gov.au/tides/open-data) | Predicted (static) | Free (open data) |
| Tide (next high/low) | [BOM getNextTides](http://www.bom.gov.au/australia/tides/scripts/getNextTides.php?aac=QLD_TP011&offset=false&tz=Australia/Brisbane) | On demand | Free |

## Project Structure

```
gcsurf/
├── public/                  # Static frontend (served by Cloudflare Pages)
│   ├── index.html           # Main dashboard
│   ├── style.css            # Styles
│   ├── app.js               # Frontend logic
│   └── beaches.js           # Beach guide data (static, editorial)
├── functions/               # Cloudflare Pages Functions (serverless)
│   └── api/
│       └── conditions.js    # API endpoint: GET /api/conditions
├── scripts/
│   └── fetch-conditions.js  # Cron worker: fetches data, writes to KV
├── wrangler.toml            # Cloudflare config
├── package.json
└── README.md
```

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/gcsurf.git
cd gcsurf
npm install
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create SURF_DATA
npx wrangler kv namespace create SURF_DATA --preview
```

Copy the IDs output by those commands into `wrangler.toml` (replacing the placeholder IDs).

### 3. Local development

```bash
npx wrangler pages dev public --kv=SURF_DATA
```

This starts a local server at `http://localhost:8788` with KV available.

### 4. Seed initial data

To populate KV with live data for the first time:

```bash
npx wrangler kv key put --namespace-id=YOUR_KV_ID conditions "$(node scripts/fetch-conditions.js)"
```

Or trigger it via the deployed cron (see below).

### 5. Deploy

**Option A: GitHub integration (recommended)**

1. Push to GitHub
2. In Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. Set build output directory to `public`
4. Add KV binding: Settings → Functions → KV namespace bindings → `SURF_DATA`

**Option B: Manual deploy**

```bash
npx wrangler pages deploy public
```

### 6. Set up the cron trigger

The data fetcher needs to run every 15–30 minutes. Create a separate Worker for this:

```bash
npx wrangler deploy scripts/fetch-conditions.js --name gcsurf-cron
```

Then in Cloudflare Dashboard → Workers → gcsurf-cron → Triggers → Add Cron Trigger:
- Schedule: `*/15 * * * *` (every 15 minutes)
- Add KV binding: `SURF_DATA` → your namespace

## Architecture

```
┌─────────────────┐     every 15 min      ┌──────────────────┐
│  QLD Gov CSV     │◄─────────────────────│  Cron Worker      │
│  BOM JSON        │      fetch & parse    │  (fetch-conditions│
│  BOM Tides       │                       │   .js)            │
└─────────────────┘                       └────────┬─────────┘
                                                    │ write
                                                    ▼
                                          ┌──────────────────┐
                                          │  Cloudflare KV    │
                                          │  (SURF_DATA)      │
                                          └────────┬─────────┘
                                                    │ read
                                                    ▼
┌─────────────────┐     GET /api/         ┌──────────────────┐
│  Browser         │◄────conditions───────│  Pages Function   │
│  (index.html)    │                       │  (conditions.js)  │
└─────────────────┘                       └──────────────────┘
```

## Licence

MIT. Beach guide content is original editorial work. Data sourced from Australian Government open data portals under their respective terms.

## Attribution

- Wave data: Queensland Government Department of Environment, Science and Innovation
- Weather data: Australian Bureau of Meteorology
- Tide predictions: Maritime Safety Queensland
