# Curated replay data

This directory is a static entry point into `components/earth-app.tsx`, the same map UI used by the local benchmark app. It is not a second application implementation.

The selected recording is `b9144b61-f849-4bd0-979b-080ccf41b4a8`: 64 × 32, 32 points per request, two concurrent requests, 5.806 seconds, `jev-1.13.0`. All probabilities, batch indices, and arrival timestamps are preserved. `provenance.json` contains its source hash.

Build from the repository root using `REPLAY_ONLY=true npm run build`. Deploy only `dist/replay/`, or import the repo into Vercel and set `REPLAY_ONLY=true` for Preview and Production. See the root README for setup.
