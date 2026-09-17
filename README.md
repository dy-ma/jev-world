# Jev draws Earth

Ask Jev whether each coordinate is land or water, then replay the responses at their recorded arrival times. One codebase supports local benchmarks and a static, replay-only deployment.

The bundled recording is **64 × 32**, generated in **5.806 seconds** with `jev-1.13.0`, 32 coordinates per request, and two concurrent requests.

## Run your own benchmarks

Requires Node.js 22.23+ and npm.

```sh
git clone https://github.com/dy-ma/jev-world.git
cd jev-world
npm ci
cp .env.example .env
```

Set `TYPESAFE_API_KEY` in `.env` and keep `REPLAY_ONLY=false`. Then:

```sh
npm run dev
```

Open http://localhost:5173. Select a resolution and click **Run benchmark** or **New benchmark**. Generation settings control points per request and concurrency. Your API key stays in the local harness; it is never sent to the browser. No inference happens on startup.

## Deploy the replay to Vercel

Import this GitHub repository into Vercel and set the environment variable below for **Production and Preview**:

```text
REPLAY_ONLY=true
```

Deploy. `vercel.json` sets the build command to `npm run build` and the output directory to `dist/replay`. Do not add a TypeSafe API key to Vercel; the replay does not need one.

`REPLAY_ONLY` is a **build-time setting** for the deployment. Rebuild after changing it. The build deliberately fails on Vercel if the flag is missing or false, instead of publishing live generation by accident.

With the flag enabled:

- The same map component shows the bundled recording and **Replay / Pause replay** control.
- Benchmark controls and harness polling are disabled.
- The deployment contains static files only, with no generation backend or API routes.
- The local API proxy and harness also reject live generation in replay-only mode.
- The page's Content Security Policy blocks outgoing connections. Fonts and recording data are bundled.

To review the deployment locally without an API key:

```sh
REPLAY_ONLY=true npm run build
npm run preview:replay -- --host 127.0.0.1 --port 5174
```

Open http://localhost:5174. Alternatively, set `REPLAY_ONLY=true` in `.env` and run `npm run dev`; it builds and serves only the replay, without starting the live harness.

## Recording and replay

Each run is saved in `.data/runs/<uuid>.json`, after every completed response, using atomic file replacement. **New benchmark** creates a separate file. Selecting a resolution loads its cached completed recording; earlier files remain on disk. Model, prompt version, execution settings, probabilities, token usage, request durations, batch membership, and arrival timestamps are retained.

Replay reveals only the blocks in each recorded response at its actual timestamp relative to run creation. It never invents, sorts spatially, or reshuffles arrival order. At 1× it preserves wall-clock gaps, including pauses; browser display precision is limited by frame scheduling. Recordings without complete batch membership cannot be replayed, though their answers and measured statistics remain available.

The bundled recording's last response arrived at 5.805 seconds; its measured run duration including final processing was 5.806 seconds. Timing metrics show the original measurements, not browser playback speed.

Only the explicitly selected recording in `share/recording.json` is committed. Local runs, experiments, keys, and logs are ignored by Git. To curate a different completed 64 × 32 recording:

```sh
npm run prepare:replay -- <run-id>
npm run build:replay
```

This copies public recording fields without altering the source file. `share/provenance.json` identifies the source and its SHA-256 hash. **PNG** exports the currently displayed canvas; **JSON** exports the complete recording.

## What the experiment measures

Each block samples its center on a 2:1 equirectangular latitude/longitude grid. Jev receives an independent Noul question for each point and returns P(land), bounded from 0 to 1. A probability of at least 0.5 is colored as land. No reference map or neighboring answers are provided. The probability view shows the raw values.

Live requests cover compact tiles: 32 coordinates form an 8 × 4 tile; 64 form an 8 × 8 square. Tile dispatch order is deterministically shuffled. Concurrent responses can arrive in a different order; the actual arrivals are what gets recorded and replayed.

Request p50/p95 measure client-to-TypeSafe round trips, including network and response parsing—not pure model inference time. Blocks/second includes scheduling and persistence, excluding explicit pauses. Errors pause generation without automatic retries. Aborted work may still be billed by the provider, and absent responses cannot contribute to reported token usage.

This visualizes model predictions; it is not a geographic accuracy benchmark. The prompt is in `server/grid.mjs`.

## Architecture and checks

- `components/earth-app.tsx`: shared interactive map and replay UI, using shadcn primitives and canvas.
- `app/`: local Vinext UI and same-origin proxy to the Node harness.
- `server/`: bounded workers and local file persistence; loopback port 8787.
- `share/`: static entry point, fonts, and curated recording; no separate UI implementation.
- `scripts/build.mjs`: chooses the live build or static replay build using `REPLAY_ONLY`.
- `lib/replay.ts`: validates provenance and maps recorded arrivals to displayed cells.

```sh
npm test
npx tsc --noEmit
npm run build
npm run build:replay
```

Tests use a fake provider, never your key. They cover request membership and arrival order, replay fidelity, caching, pause/resume, saved-run preservation, and replay-only generation guards.

The local live harness is not a multi-user authenticated service. The supplied Vercel configuration hosts only the bundled replay.

## Whole-map request experiment

`scripts/whole-map.mjs` can make one explicitly requested 2,048-question call using an existing completed run's resolved model version and prompt. Without `--execute`, it only prints a dry-run summary. Attempts are saved under `.data/experiments/` and never replace the active run or curated replay.

The initial 2,048-question attempt was rejected with HTTP 400 `max_tokens_exceeded`. No probabilities were returned, so it produced no map-equivalence or generation-speed result. No automatic retry or shorter substitute prompt was used.
