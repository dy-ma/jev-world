# Jev draws Earth

<img width="1019" height="514" alt="Screenshot 2026-09-17 at 5 34 24 PM" src="https://github.com/user-attachments/assets/dfcee8ce-0ca2-430e-8fd0-1e103124cc66" />

Ask Jev whether each coordinate is land or water, then replay the responses at their recorded arrival times. One codebase supports local benchmarks and a static, replay-only deployment.

The default recording is **64 × 32**, generated in **5.806 seconds** with `jev-1.13.0`, 32 coordinates per request, and two concurrent requests. The hosted resolution selector also offers saved 32 × 16, 128 × 64, 256 × 128, and 512 × 256 runs. Each resolution has one recording; larger recordings load only when selected.

## Results

Measured results from the five published recordings, all using `jev-1.13.0` with **32 coordinates per request**. Each row is one completed run, not an average across repeated trials. Resolution links open the recorded data.

| Resolution | Coordinates | Requests | Parallel requests | Elapsed (s) | Coordinates/s | Request p50 / p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [32 × 16](share/recordings/32.json) | 512 | 16 | 2 | 1.367 | 374.5 | 128 / 416 |
| [64 × 32](share/recording.json) | 2,048 | 64 | 2 | 5.806 | 352.7 | 156 / 308 |
| [128 × 64](share/recordings/128.json) | 8,192 | 256 | 2 | 23.485 | 348.8 | 159 / 307 |
| [256 × 128](share/recordings/256.json) | 32,768 | 1,024 | 2 | 96.822 | 338.4 | 159 / 312 |
| [512 × 256](share/recordings/512.json) | 131,072 | 4,096 | 8 | 104.776 | 1,251.0 | 169 / 354 |

Elapsed time includes scheduling and persistence, excluding explicit pauses; throughput is coordinates divided by that duration. Request latency includes network time and response parsing. The 512 × 256 run used eight parallel requests; the others used two, so its higher throughput reflects different concurrency settings.

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

- The same map component offers all five recorded resolutions and **Replay / Pause replay** controls.
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

The **Inside a request** inspector follows the latest recorded response: its coordinate matrix, measured round trip, and matching P(land) values. It sits beside the map on wide screens and below the progress bar on smaller screens. The white map outline locates that response's coordinates. Previous/next response pauses and seeks to that recorded arrival; responses sharing a timestamp remain separately inspectable. Select a matrix cell to read its full coordinate and probability precision. Matrix labels are rounded for display. Grid dimensions come from each response’s recorded coordinates, so 1-, 8-, 32-, and 64-point batches retain their own shapes and values. The inspector shows completed responses, not a simulated network animation or reconstructed dispatch times, and makes no API calls.

Only the curated public recordings in `share/recording.json` (the default 64 × 32 run) and `share/recordings/` are committed. Local runs, experiments, keys, and logs are ignored by Git. To refresh the catalog, keeping the chosen 64 × 32 run and selecting the latest completed run for every other resolution:

```sh
npm run prepare:replay
```

To also select a different completed 64 × 32 recording:

```sh
npm run prepare:replay -- <run-id>
npm run build:replay
```

This copies public recording fields without altering any source files. `share/catalog.json` lists the available resolutions; `share/provenance.json` identifies each source and its SHA-256 hash. Preparation rejects recordings without faithful replay data. **PNG** exports the currently displayed canvas; **JSON** exports the complete recording.

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

The local live harness is not a multi-user authenticated service. The supplied Vercel configuration hosts only the bundled replays.

## Whole-map request experiment

`scripts/whole-map.mjs` can make one explicitly requested 2,048-question call using an existing completed run's resolved model version and prompt. Without `--execute`, it only prints a dry-run summary. Attempts are saved under `.data/experiments/` and never replace the active run or curated replay.

The initial 2,048-question attempt was rejected with HTTP 400 `max_tokens_exceeded`. No probabilities were returned, so it produced no map-equivalence or generation-speed result. No automatic retry or shorter substitute prompt was used.
