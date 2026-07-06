# Colony Backlog — 2026-07-06 Full Project Review

Compiled from a full read of the codebase (README, `index.html`, every module in `js/`, `service-worker.js`, `manifest.json`, `css/*`, and `tests/`), a repo-wide grep for `TODO`/`FIXME`/`XXX`/`HACK` (zero hits — this codebase doesn't use marker comments), a fresh run of the test suite (91/91 passing), and a read against the README's own "Not implemented / known gaps" section to check which of those claims still hold up in the current code.

This is the project's first backlog file — nothing is "already in progress" to exclude.

---

## Priority Tiers

- **P0 — Save/Progress Risk**: the player's colony state could be silently lost or discarded with no recourse.
- **P1 — Broken-as-Designed**: built but silently wrong, or contradicts something the game itself (README or in-app help text) explicitly claims.
- **P2 — Missing Value**: spec'd, self-acknowledged, or clearly valuable gaps that aren't built yet.
- **P3 — Polish**: visual/UX/cosmetic — doesn't change what the game does, only how it feels.

---

## P0 — Save/Progress Risk

### 1. Incompatible save is silently discarded with no message to the player
- **Source**: code read, `js/main.js` lines 7–17.
- **Rationale**: `SAVE_VERSION` (`constants.js`) is already at 3 — it's been bumped before ("A prior save from an older shape (e.g. the pre-battle POC) can't be safely reused" per the code comment) and will be bumped again. When `loaded.version !== SAVE_VERSION`, the code falls straight through to `getInitialState(Date.now())` with zero indication to the player that their old colony existed and was dropped — it's indistinguishable from a first-ever launch. Someone returning to a multi-week campaign would just see a brand-new colony and have no idea why.
- **Scope**: **Small.** The mismatch case (`loaded` exists but wrong version) is already distinguishable from "no save at all" in the code — `main.js` line 10 just needs to branch on it and surface a message (the existing toast pattern in `input.js`'s `showMessage`, or the help-modal-on-first-load path, both already exist to reuse).

### 2. No save export/import — a single browser's `localStorage` is the only copy of a colony ever
- **Source**: `js/save.js` (only reads/writes `localStorage`, confirmed no other persistence path anywhere in the repo); also called out in README's "Not implemented" list as "a cheap fix, deliberately deferred for now."
- **Rationale**: Escalated from README's original "deferred" framing because item 1 above shows this single-copy model has already caused (or will cause) silent total data loss once. For a game explicitly designed around a persistent, no-fixed-end campaign (milestones accrue over real play sessions), the save being un-backed-up and un-transferable is a real risk, not just a convenience gap — a cleared cache, an iOS PWA storage eviction, or switching phones loses the colony permanently.
- **Scope**: **Medium.** A copy-paste/download "save code" JSON export+import (the version README already sketches) is the cheap option; a proper sync mechanism would be considerably larger. See Open Questions.
- **Decision (2026-07-06)**: Phased. Start with the simple copy-paste/download JSON "save code" now; a more automatic sync mechanism is a later phase, not v1.

---

## P1 — Broken-as-Designed

### 3. The tactical-battle "retreat" mechanic is dead code — the game's own help text describes a consequence that can't happen
- **Source**: code read, `js/battle.js`; repo-wide grep for `escaped`.
- **Rationale**: Every battle unit is created with `escaped: false` (`battle.js` line 15) and that flag is checked in four places to decide who's still active in a fight — but nothing anywhere in the codebase ever sets it to `true` (confirmed by grep). It's a mechanic whose data shape exists but was never wired to an action. Separately, `resolveBattleOutcome` (`battle.js` lines 285–308) only ever converts **soldier** deaths into a `population.soldier` reduction; if the forager unit reaches 0 HP in the grid, that only flips `battle.outcome` to `'attacker'` (shipment lost) — `population.forager` is never touched. Put together, the in-app help modal's explicit claim — *"Retreating your forager (hold position away from raiders) can save the ant even if the cargo is lost"* (`index.html` line 77) — promises stakes that don't exist in code: the forager ant itself can never actually be removed from the colony, whether the battle is won or lost. This is a real documented-vs-actual mismatch, not a missing nice-to-have.
- **Scope**: **Medium.** Either (a) implement the promised mechanic — a real "escaped" outcome when the forager gets clear of attackers, versus an actual `population.forager` loss on defeat — touching `battle.js`'s outcome logic and `resolveBattleOutcome`; or (b) tone down the help text to match what actually happens (cargo-only risk, ant never lost), a one-line text fix. Which one is right is a game-feel call — see Open Questions.
- **Decision (2026-07-06)**: Not yet — defer implementing the real mechanic. Left in P1 as future work rather than closed outright, since "not yet" doesn't rule it in or out permanently. The help-text-vs-code mismatch remains live in the meantime (worth a cheap interim wording fix if that's wanted before the mechanic itself is built, but that wasn't explicitly decided — flagging rather than assuming).

### 4. README's "Scouts exist in the data model but are unused" claim doesn't match the current code
- **Source**: `README.md` line 105 vs. a repo-wide, case-insensitive grep for "scout" across `js/`, which returns zero hits. `colony.js`'s `CASTES` array is `['worker', 'forager', 'soldier']` — no scout caste, chamber type, or field exists anywhere in `constants.js` or `state.js` either.
- **Rationale**: Either a scout mechanic was fully removed from the model at some point and this README line is now stale, or it describes something that was planned but never actually landed. Either way, the "known gaps" section — precisely the place a reader (or this backlog-compiling process) goes to find deferred work — is currently inaccurate, which undermines trust in the rest of that section.
- **Scope**: **Small** to confirm and fix the README either way; larger only if the intent turns out to be "actually build it" (see Open Questions).
- **Decision (2026-07-06)**: Planned future mechanic — not dropped. README's "unused" framing is stale and should say "planned, not yet built" instead. Reclassify as a real future feature rather than pure doc cleanup.

---

## P2 — Missing Value

### 5. The entire UI layer (`render.js`, `render_battle.js`, `input.js`) has zero automated regression coverage
- **Source**: README's own Testing section ("`render.js`/`render_battle.js`/`input.js` aren't covered here since they touch the DOM; those were verified with a one-off Playwright-driven browser session instead (not checked into the repo)"); confirmed by running `node --test` (91/91 passing, all in the DOM-free modules only).
- **Rationale**: This is the entire player-facing surface — map rendering, tile selection, trail drawing, battle interaction, resource-bar animation — protected by nothing that runs in CI or on demand; the one verification pass that was done wasn't preserved. Recent commit history ("Full sanity/security review: fix render-state leak and animation race," "Fix UX/UI review findings: fog leak, small-phone map crush, and panel layout") shows this is exactly where real regressions have actually occurred before.
- **Scope**: **Large.** The existing suite is deliberately zero-dependency (`node --test` on pure logic); a DOM harness (jsdom or a checked-in Playwright script) is a bigger structural addition, likely why it was skipped the first time around.

### 6. No accessibility support — hex tiles and battle-grid cells are unlabeled, click-only `<div>`s
- **Source**: code read, `render.js`'s `renderMap`, `render_battle.js`'s `renderGrid`, `css/map.css`, `css/battle.css`.
- **Rationale**: every interactive tile/cell is a plain `<div>` with a click listener — no `role`, `tabindex`, keyboard handler, or `aria-label`. The `#message` toast and `#log` panel have no `aria-live` region, so a screen-reader user gets no feedback on actions or outcomes at all. As-is the game is entirely unusable via assistive tech. Ranked P2 rather than P1 because urgency here is genuinely a product-scope question (see Open Questions), not a code defect.
- **Scope**: **Medium** for the baseline (semantic roles/labels plus an `aria-live` region for the message/log); full keyboard operability of the hex grid would be a larger, more speculative addition on top.
- **Decision (2026-07-06)**: Not a goal for now. Deprioritized — "touch-first, sighted, single local player" is an accepted constraint at present.

### 7. Economy balance is verified against collapse, not tuned to a deliberate difficulty curve
- **Source**: README's own "Current scope (v1)" section ("Economy balance has been tuned to avoid systemic collapse ... but isn't fine-tuned for a specific difficulty curve"); `tests/balance.test.mjs`, whose assertions are "nobody goes extinct across 100–300 unattended cycles," not "reaches any particular difficulty target."
- **Rationale**: This matches README's own framing exactly — a known, self-acknowledged gap rather than a bug. Included here so it lives in the same tracked place as everything else instead of only in README prose.
- **Scope**: **Medium–Large**, and genuinely open-ended — depends entirely on what kind of difficulty curve (if any) is actually wanted. See Open Questions.

---

## P3 — Polish

### 8. PWA manifest has no dedicated "maskable" PNG with safe-zone padding
- **Source**: `manifest.json`, `assets/icons/icon.svg`.
- **Rationale**: only `icon.svg` is marked `purpose: "maskable"`; the two PNGs (192px/512px) are `purpose: "any"` only. Android's adaptive-icon mask can crop maskable art that wasn't drawn to the conventional ~80%-safe-zone circle, and the SVG's ant-leg lines extend fairly close to that boundary. Flagged as **speculative/low-confidence** — this wasn't tested against an actual Android install, just read from the source; worth a 30-second real-device check before spending any effort here.
- **Scope**: **Small**, if it turns out to be a real problem — pad the art and export a dedicated maskable PNG pair.

### 9. "New Colony" confirmation uses a native `confirm()` dialog
- **Source**: `js/input.js`, `new-colony-btn` click handler.
- **Rationale**: `confirm('Start a brand new colony? ...')` is a native browser dialog — functionally fine, but visually jarring against the game's otherwise fully custom, themed UI (dedicated `.modal`/`.modal-content` styling already exists and is used for the help and battle overlays).
- **Scope**: **Small.** Swap for a themed confirmation modal reusing the existing `.modal` pattern.

---

## Resolved Decisions (2026-07-06)

1. **Forager retreat mechanic** (item 3): Not yet — deferred, not closed.
2. **Scouts** (item 4): Planned future mechanic, not dropped.
3. **Accessibility priority** (item 6): Not a goal for now.
4. **Save export/import scope** (item 2): Phased — simple copy-paste code first, more automatic later.

## Open Questions (need Matthew's judgment, not guessed)

1. **Difficulty/balance pass** (item 7): Still unresolved as of 2026-07-06 ("not sure"). What does "done" look like here — is there a specific win/loss feel wanted (e.g., a rival colony should occasionally actually beat the player to a resource, or the player should be able to meaningfully lose ground), or is "nobody goes extinct" genuinely sufficient indefinitely? This needs a design opinion, not more simulation data — revisit once there's a clearer sense of the intended difficulty feel.
