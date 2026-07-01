const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// GameState round-trips through localStorage, which a user (or, if a save
// import/share feature is ever added, another party) can edit directly. Any
// state-derived string reaching innerHTML — log text, trait ids, tile/owner
// fields — should go through this before interpolation so a tampered save
// can't inject markup.
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
