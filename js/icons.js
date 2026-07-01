// A small hand-drawn icon set, used instead of emoji for every in-game glyph
// (resources, chambers, units). Emoji rendering depends on the platform
// having a color-emoji font installed — we already hit this as a real bug
// with the PWA app icon (some environments silently substitute a
// near-invisible fallback glyph) — so anything the player actually needs to
// read gets a real, consistent, on-brand SVG instead.
//
// Every icon shares a 0 0 24 24 viewBox so they can be sized uniformly by
// their container. Returned strings are static/authored (never touched by
// user or save data) — safe to insert via innerHTML.

const ANT_BODY = `
  <circle cx="12" cy="6" r="2.6" fill="currentColor"/>
  <circle cx="12" cy="11" r="3" fill="currentColor"/>
  <circle cx="12" cy="17.5" r="4.5" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <line x1="9" y1="10" x2="4" y2="8"/>
    <line x1="15" y1="10" x2="20" y2="8"/>
    <line x1="8.5" y1="12" x2="3" y2="12"/>
    <line x1="15.5" y1="12" x2="21" y2="12"/>
    <line x1="9" y1="14" x2="4" y2="16"/>
    <line x1="15" y1="14" x2="20" y2="16"/>
  </g>`;

const MUSHROOM_BODY = `
  <rect x="10" y="13" width="4" height="8" rx="1.5" fill="#e8d9c0"/>
  <path d="M4 13 Q4 4 12 4 Q20 4 20 13 Z" fill="currentColor"/>
  <circle cx="8" cy="9" r="1.2" fill="rgba(0,0,0,0.25)"/>
  <circle cx="14" cy="7" r="1" fill="rgba(0,0,0,0.25)"/>
  <circle cx="16" cy="10" r="1.3" fill="rgba(0,0,0,0.25)"/>`;

const ICON_PATHS = {
  sugar: `<polygon points="12,3 19,9 15,21 9,21 5,9" fill="#ffd1e8"/>`,
  protein: `<ellipse cx="12" cy="13" rx="8" ry="7" fill="#e0684f"/><ellipse cx="12" cy="7" rx="3" ry="2.5" fill="#c9503a"/>`,
  fungus: `<g style="color:#b073d9">${MUSHROOM_BODY}</g>`,
  mineral: `<polygon points="12,2 21,9 12,22 3,9" fill="#6bc6ff"/><polygon points="12,2 21,9 12,9" fill="#9adcff"/><polygon points="3,9 12,9 12,22" fill="#4fa8e0"/>`,
  ant: `<g style="color:#c98a2b">${ANT_BODY}</g>`,
  storage: `<rect x="3" y="9" width="18" height="12" rx="1.5" fill="#a9793f"/><rect x="3" y="9" width="18" height="4" fill="#c9944f"/><line x1="12" y1="9" x2="12" y2="21" stroke="#7a5626" stroke-width="1.2"/>`,
  farm: `<g style="color:#c98a2b">${MUSHROOM_BODY}</g>`,
  nursery: `<ellipse cx="12" cy="13" rx="7" ry="9" fill="#f3e6c8"/><ellipse cx="9.3" cy="9" rx="2" ry="1.4" fill="#ffffff" opacity="0.6"/>`,
  soldier: `<path d="M12 2 L20 5 V11 C20 17 16.5 21 12 22 C7.5 21 4 17 4 11 V5 Z" fill="#c9432b"/>`,
};

export function iconSvg(name, extraClass) {
  const inner = ICON_PATHS[name] || '';
  const cls = `icon-svg${extraClass ? ` ${extraClass}` : ''}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
