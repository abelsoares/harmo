# @harmo/dashboard

Web dashboard for the harmo v1 query API. Vite + React + TypeScript + recharts, consuming `@harmo/api-client`.

## Running it

From the repo root:

```bash
# Terminal 1 — start the API server (Koa on :4001)
npm run api

# Terminal 2 — start the dashboard dev server (Vite on :5173)
npm run dashboard
```

Open <http://localhost:5173>.

## What's in it

A single-page, scrollable layout with a date-range picker + timezone selector at the top. Every section reacts live to the selected range.

- **Overview cards**: total steps + avg/day, distance, active energy, exercise minutes, avg HR, latest resting HR, latest body mass, workouts count + total duration.
- **GitHub-style calendar heatmap** of steps over the last 365 days.
- **Daily bar charts**: steps, active energy, stand time, exercise time.
- **Heart rate area chart** with adaptive bucket (hourly for short ranges, daily/weekly for longer).
- **Trend charts**: resting heart rate, body mass, VO₂ max.
- **Workouts**: pie chart of all-time activity breakdown + table of recent workouts in range.
- **Metric explorer**: pick any of the 75 canonical metrics + bucket (hour/day/week/month) and see a chart, using the metric's registry-defined default aggregation.
- **Sources**: top contributing devices/apps with sample counts.

## Production build

```bash
npm run dashboard:build
# → packages/dashboard/dist/  (~590 KB JS, gzip 167 KB)
```

Static files can be served by anything — nginx, S3+CloudFront, GitHub Pages, or just `npx serve dist`.

## Configuration

Set `VITE_API_BASE_URL` to point at a non-localhost API:

```bash
VITE_API_BASE_URL=https://harmo.example.com npm run dashboard
```

Defaults to `http://localhost:4001`.
