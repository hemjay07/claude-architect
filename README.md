# AKINDO Linera Buildathon Scraper v2.0

Scrapes all 210 submissions from the Linera Buildathon (Waves 3-6) on AKINDO.

## What's New in v2

Based on actual page structure observed Jan 2026:
- **Pagination handling** (21 pages, not infinite scroll)
- **Extracts 5 scoring categories** with individual scores
- **Captures Submission Comments** (shows iteration history - GOLD for analysis!)
- **Voter Reviews** extraction
- **Grant amounts in USDC**
- **Progress saving** (won't lose data on crash)

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
npm install
npm run scrape
```

## Output Files

| File | Description |
|------|-------------|
| `linera_submissions_full.json` | Complete data for all submissions |
| `linera_submissions.csv` | Tab-separated spreadsheet format |
| `linera_comments_analysis.json` | Only submissions with technical comments |
| `linera_top_projects.json` | Top 50 by points |
| `linera_list_only.json` | Just list page data (Phase 1) |

## Data Extracted

### From List Pages:
- Title, Tagline
- Total Points
- Grant (USDC)
- 5 Score Categories:
  1. Working Demo & Functionality
  2. Linera Tech Stack Integration  
  3. Creativity & User Experience
  4. Real Use Case & Scalability
  5. Vision & Roadmap
- Tags (#Linera, #Rust, etc.)

### From Detail Pages:
- Full description
- **Submission Comments** ← Technical iteration details!
- Voter Reviews
- GitHub links
- Category

## Configuration

Edit `scrape_v2.js` CONFIG section:

```javascript
const CONFIG = {
    headless: false,        // true = background, false = watch it work
    delayBetweenPages: 2000,
    delayBetweenDetails: 1500,
    saveProgressEvery: 20
};
```

## Tips

- Run with `headless: false` first to verify it works
- Takes ~30-45 minutes for all 210 submissions
- Progress is saved every 20 submissions
- If it crashes, check `linera_progress.json`

## Wave Breakdown (as of Jan 2026)

- Wave 6: 3 submissions
- Wave 5: 76 submissions  
- Wave 4: 64 submissions
- Wave 3: 68 submissions
- **Total: 210**
