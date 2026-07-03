/* Text/formatting helpers shared by the game store and its components. */

export const SIDEWORD = ["left", "right"];

// Opponents (any seat other than your seat 0) are drawn flipped — hand index 1
// sits on the viewer's left — so name a hand's side by its on-screen position.
export const sideWord = (p, h) => SIDEWORD[p !== 0 ? 1 - h : h];

export const fmtFingers = (v, fraction) =>
  (!fraction || fraction === 1) ? String(v) : String(Math.round((v / fraction) * 100) / 100);

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* Jargon only as an informational aside, never on buttons. */
export const SPLIT_ASIDE = {
  "Transfer": "a transfer", "Division": "a division", "Suicide split": "a suicide split",
  "Swap": "a swap", "One-point switch": "the one-point switch", "Pass": "a pass",
};
