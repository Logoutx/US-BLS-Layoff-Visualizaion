# US BLS Layoff Visualizaion

A static dashboard for exploring U.S. layoff-related labor data from BLS.

## Data Coverage

- **1996-2013:** BLS Mass Layoff Statistics (MLS), including national monthly claimant/event series, selected industries, and state-level claimant totals.
- **2014-present:** BLS Job Openings and Labor Turnover Survey (JOLTS) layoffs and discharges. JOLTS is not methodologically equivalent to MLS, so the dashboard labels the source break.
- **Context series:** BLS unemployment rate, unemployed persons, total nonfarm payroll employment, and S&P 500 month-end close.
- **Yearly tracking:** annual totals across the full available dashboard span, with the MLS/JOLTS source break labeled.

## Run Locally

Open `index.html` directly in a browser, or run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Refresh Data

```bash
node scripts/build-data.js
```

The data builder writes `data.js`, which is loaded by the static dashboard.

## Automated Updates

GitHub Actions runs `node scripts/build-data.js` on the 15th day of each month and commits `data.js` when new source data is available. The workflow can also be run manually from the Actions tab.
