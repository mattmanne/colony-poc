# Colony

A turn-based ant-colony logistics strategy game, built for short phone sessions. Play it live at **https://mattmanne.github.io/colony-poc/**.

## Concept

You run an ant colony competing with two AI rival colonies for the same ground and food on a shared hex map. The core tension is logistics, not combat: resources don't teleport into your nest, they travel along pheromone trails you lay, with real capacity limits and delivery latency. Chambers you dig double as territory claims, so expansion and infrastructure are the same decision. Contested trails (where your territory overlaps a rival's) leak resources unless you garrison them with soldiers — in which case a raid instead drops you into a small interactive tactical battle. There's no fixed win condition; milestones unlock permanent colony-wide bonuses to give a persistent campaign a sense of progression.

Turns ("cycles") only advance on an explicit "Advance Cycle" tap, with a 3 Action Point budget per cycle — so a session is "open app, spend up to 3 AP, advance, close" and comfortably fits in a couple of minutes.

## How to play

The in-app "?" button has the full rules and a tips list; this is the short version.

- **Dig chambers** on pulsing-green tiles next to ones you own (Storage raises capacity, Fungus Farm converts sugar to fungus, Nursery raises population cap).
- **Lay trails** to pulsing-blue resource nodes — tap "Auto-Route" for the fastest path, or "Draw Path Manually" to tap out the route yourself (useful for avoiding a rival's territory, at the cost of a longer, slower path).
- **Reassign population castes** (Worker/Forager/Soldier) in the Colony panel. Foragers run trails, soldiers defend them; both cost upkeep (foragers eat sugar, soldiers eat fungus).
- **Garrison a contested trail** with soldiers to defend it — an undefended contested trail just leaks resources, but a garrisoned one turns a raid into a tactical battle you play out directly.
- Everything (digging, laying trails, garrisoning, reassigning) costs 1 of your 3 Action Points per cycle. Tap **Advance Cycle** when you're done to resolve the turn.

Quick tips:
1. Secure a sugar trail before chasing richer-looking protein/mineral nodes — sugar feeds every ant, and protein/mineral do nothing for a starving colony.
2. Population only grows with a healthy sugar buffer — watch the trend, not just the current number, or you can out-grow your own income.
3. A trail's capacity is capped by how many foragers you actually have free — upgrading capacity does nothing without foragers to staff it.
4. Garrison your most valuable contested trail, not every one — soldiers are a limited, upkeep-costing resource.
5. Build a Fungus Farm before training soldiers, or they'll desert for lack of food almost immediately.

## Running it locally

No build step and no installed dependencies — it's a static site. The one exception is a display font loaded from Google Fonts at runtime (see Architecture below); everything else is self-contained.

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

## Testing

All game logic is pure and DOM-free, so it's covered by an automated suite using Node's built-in test runner — no dependencies, no build step:

```bash
cd colony
npm test        # or: node --test
```

`package.json` exists solely to give `npm test` a home; it declares no runtime dependencies and has no effect on how the game itself loads in a browser. Tests live in `tests/` (one file per module, plus explicit regression tests for bugs found during review — see the file names for what each one guards against). `render.js`/`render_battle.js`/`input.js` aren't covered here since they touch the DOM; those were verified with a one-off Playwright-driven browser session instead (not checked into the repo).

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
  trails.js               Trail creation (auto-routed and manually-drawn)/capacity/garrison, per-cycle resource delivery
  resources.js            Production (farms), population upkeep, growth (sugar-gated), starvation
  battle.js               Tactical 5x5 battle engine (pure logic, no DOM) — interactive and auto-resolved
  ai.js                   Rival heuristic — reuses the same action functions/AP budget as the player
  cycle.js                Orchestrates one cycle: production → trails → AI → (battles) → milestones
  milestones.js           Checks/applies permanent unlocks
  save.js                 localStorage read/write, versioned
  htmlEscape.js           XSS-hardening helper for save-derived strings reaching innerHTML
  icons.js                Hand-drawn SVG icon set (resources/chambers/units) — no emoji, see note below
  render.js, render_battle.js   State → DOM (one-way; no state mutation from render code)
  input.js                DOM events → action functions → save → re-render
  main.js                 Bootstraps the app, registers the service worker
tests/                    node --test suite — see Testing section above
```

All game logic (`state.js` through `milestones.js`) is pure and DOM-free — it can be exercised directly in Node for testing without a browser. `render*.js`/`input.js` are the only DOM-touching modules.

**Why no emoji for game icons**: the app icon originally used an emoji glyph and it silently rendered as a near-invisible fallback in a headless-Chromium test environment — color-emoji font support isn't guaranteed everywhere. `js/icons.js` holds a small hand-drawn SVG set instead, so every glyph the player actually needs to read looks the same (and looks intentional) regardless of platform.

**External dependency**: `index.html` loads "Alfa Slab One" from Google Fonts for headers/buttons — the one deliberate exception to "no dependencies," made for a distinct display-font look. It degrades gracefully to the system font stack if the font host is unreachable (verified with the font domains blocked: zero JS errors, fully playable).

**Motion**: resource counters animate count-up/down instead of snapping (`animateNumber` in `render.js`), in-transit resource pips visibly flow along their trail between cycles (a persistent DOM element per pip, keyed by a stable id from `trails.js`, so a CSS transition can actually animate it — a full rebuild-every-render approach, used everywhere else in this codebase, can't animate anything), a newly-dug chamber gets a one-shot "pop," and battle hits get a shake/flash. A few render-only caches back these animations (which tiles have already popped, current displayed resource values, live pip elements) — they're cleared by `resetRenderState()` on "New Colony," since they're keyed by things like tile coordinates that a fresh map can reuse.

## Current scope (v1)

Implemented: hex map with fog of war, pheromone trail logistics (capacity, latency, contested leaking, auto-routed or manually drawn), chamber digging (storage/farm/nursery), population castes (worker/forager/soldier) with sugar/fungus upkeep, two AI rivals that expand, defend, and raid, garrisoned-trail tactical battles (interactive for the player, auto-resolved for everyone else — including rival-vs-rival and the player raiding a rival), four milestone unlocks, PWA installability with generated icons, a custom SVG icon set + CSS design system, and animation/feedback (counters, flowing trail pips, dig/hit effects — see Architecture below).

Not implemented / known gaps:
- Scouts exist in the data model but are unused (no way to train one, fog of war instead auto-reveals around chambers).
- No cross-device save sync — a save is local to one browser's `localStorage`. A JSON export/import ("save code") would be a cheap fix, deliberately deferred for now.
- Economy balance has been tuned to avoid systemic collapse (verified via simulation — see `tests/balance.test.mjs`) but isn't fine-tuned for a specific difficulty curve; worst-case outcome is a subsistence-level colony (as few as 1 forager), not extinction.

The fuller design rationale and a running list of proposed follow-ups (including security review notes) live in this project's Claude Code plan document, tracked outside this repo.
