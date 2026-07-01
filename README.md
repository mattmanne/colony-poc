# Colony

A turn-based ant-colony logistics strategy game, built for short phone sessions. Play it live at **https://mattmanne.github.io/colony-poc/**.

## Concept

You run an ant colony competing with two AI rival colonies for the same ground and food on a shared hex map. The core tension is logistics, not combat: resources don't teleport into your nest, they travel along pheromone trails you lay, with real capacity limits and delivery latency. Chambers you dig double as territory claims, so expansion and infrastructure are the same decision. Contested trails (where your territory overlaps a rival's) leak resources unless you garrison them with soldiers — in which case a raid instead drops you into a small interactive tactical battle. There's no fixed win condition; milestones unlock permanent colony-wide bonuses to give a persistent campaign a sense of progression.

Turns ("cycles") only advance on an explicit "Advance Cycle" tap, with a 3 Action Point budget per cycle — so a session is "open app, spend up to 3 AP, advance, close" and comfortably fits in a couple of minutes.

## Running it locally

No build step, no dependencies — it's a static site.

```bash
cd colony
python3 -m http.server 8080   # or any static file server
```

Then open `http://localhost:8080` in a browser. A plain `file://` open won't work reliably because the app uses ES modules and a service worker, both of which require serving over HTTP(S).

## Deploying

The live site is served via GitHub Pages from this repo's `master` branch root. To publish changes:

```bash
git add -A && git commit -m "..."
git push origin master
```

GitHub Pages rebuilds automatically (usually within a minute or two). **If you change any cached file, bump `CACHE_NAME` in `service-worker.js`** — the service worker caches the app shell aggressively for offline/PWA use, and players who've already installed it won't see updates until the cache name changes.

## Architecture

Vanilla HTML/CSS/JS, ES modules, no framework or bundler. State is plain JSON, serialized to `localStorage` after every action.

```
index.html              Single page; map, battle overlay, and help modal all live here
manifest.json           PWA manifest (installable "Add to Home Screen")
service-worker.js       Cache-first app shell for offline use
css/
  base.css, map.css, ui.css, battle.css
js/
  constants.js           Tunable numbers: AP budget, costs, milestones, unit stats
  rng.js, hexgrid.js      Seeded PRNG, axial hex-grid math (neighbors/distance/pathing)
  mapgen.js               Deterministic map + nest-site generation from a seed
  state.js                Canonical GameState shape, fog-of-war reveal, territory claiming
  colony.js               Chamber digging, caste reassignment
  trails.js               Trail creation/capacity/garrison, per-cycle resource delivery
  resources.js            Production (farms), population upkeep, growth, starvation
  battle.js               Tactical 5x5 battle engine (pure logic, no DOM)
  ai.js                   Rival heuristic — reuses the same action functions/AP budget as the player
  cycle.js                Orchestrates one cycle: production → trails → AI → (battles) → milestones
  milestones.js           Checks/applies permanent unlocks
  save.js                 localStorage read/write, versioned
  render.js, render_battle.js   State → DOM (one-way; no state mutation from render code)
  input.js                DOM events → action functions → save → re-render
  main.js                 Bootstraps the app, registers the service worker
```

All game logic (`state.js` through `milestones.js`) is pure and DOM-free — it can be exercised directly in Node for testing without a browser. `render*.js`/`input.js` are the only DOM-touching modules.

## Current scope (v1)

Implemented: hex map with fog of war, pheromone trail logistics (capacity, latency, contested leaking), chamber digging (storage/farm/nursery), population castes (worker/forager/soldier) with sugar/fungus upkeep, two AI rivals, garrisoned-trail tactical battles, four milestone unlocks, PWA installability.

Not implemented / known gaps:
- No manual trail path drawing — trails auto-route via shortest path from the nest.
- Scouts exist in the data model but are unused (no way to train one, fog of war instead auto-reveals around chambers).
- AI rivals never garrison trails or fight back in tactical battles — they only ever lose resources to the probabilistic leak, never a battle. Battles only ever have the player as defender.
- No cross-device save sync — a save is local to one browser's `localStorage`.
- Economy balance is untuned past "does it function correctly" — long unattended play can lead to colony-wide starvation/extinction for all three colonies. Worth a dedicated balance pass before relying on long play sessions.

The fuller design rationale and a running list of proposed follow-ups (including security review notes) live in this project's Claude Code plan document, tracked outside this repo.
