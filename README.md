# Semiconductor Industry News Dashboard

A static website that tracks semiconductor and related industry news. A scheduled GitHub Actions workflow refreshes `data/news.json` every hour from curated RSS feeds, and the site reads that saved JSON file for a fast dashboard experience.

## What it tracks

- Semiconductors and chipmakers
- Foundries and manufacturing
- Memory, packaging, and EDA
- AI hardware and datacenter silicon
- Supply chain, trade, and policy news

## Local preview

Open `index.html` in a browser, or run a simple static server from the repository root.

```bash
npx serve .
```

## Hourly updates

The workflow in `.github/workflows/update-news.yml` runs hourly and commits updated news data when new articles are found. You can also run it manually from the GitHub Actions tab.

## Data source configuration

Edit `scripts/fetch-news.js` to add, remove, or tune RSS sources and keywords.
