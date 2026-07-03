/* SVG hands, rendered as markup strings (drawn via v-html).
   Hand points up; `fingers` is the finger-equivalent (0..<5) — whole fingers
   rise index->pinky then thumb, and a fractional part (a "knub") raises the next
   finger part-way. `label` is the badge text (e.g. "2.5", "−3"); `negative` tints
   the hand (integers rule). mirror: left hands. flip: rotated for the top player. */
export function handSVG(fingers, { dead, mirror, flip, skin, skinDark, label, negative }) {
  const ext = dead ? 0 : fingers;
  const fill = dead ? "var(--dead)" : (negative ? "var(--neg)" : skin);
  const stroke = dead ? "#948c80" : (negative ? "var(--neg-dark)" : skinDark);
  // inline attributes, NOT an svg <style> block: styles in inline SVG are
  // document-global and would bleed across the four hands on the page
  const paint = `fill="${fill}" stroke="${stroke}" stroke-width="2.5"`;
  // finger slots left->right: pinky, ring, middle, index (index adjacent to thumb)
  const fingerOrder = [4, 3, 2, 1]; // extension rank of each slot
  const xs = [16, 34, 52, 70];
  let parts = "";
  for (let s = 0; s < 4; s++) {
    // how far this finger is raised: 0 (curled) .. 1 (full); fractions are knubs
    const raise = Math.max(0, Math.min(1, ext - (fingerOrder[s] - 1)));
    const y = 6 + (1 - raise) * 40, height = 66 - (1 - raise) * 40;
    parts += `<rect x="${xs[s]}" y="${y.toFixed(1)}" width="15" height="${height.toFixed(1)}" rx="7.5" ${paint}/>`;
  }
  const thumb = Math.max(0, Math.min(1, ext - 4)); // thumb is the 5th to rise
  parts += thumb >= 1
    ? `<rect x="86" y="74" width="34" height="15" rx="7.5" ${paint} transform="rotate(-38 88 82)"/>`
    : `<rect x="86" y="${(80 - thumb * 18).toFixed(1)}" width="12" height="${(30 + thumb * 18).toFixed(1)}" rx="6" ${paint}/>`;
  parts += `<rect x="12" y="64" width="80" height="58" rx="18" ${paint}/>`;

  const tf = [];
  if (flip) tf.push("rotate(180 55 65)");
  if (mirror) tf.push("scale(-1 1) translate(-110 0)");
  const badgeY = flip ? 37 : 93;
  const fs = label && label.length >= 4 ? 11 : label && label.length === 3 ? 13 : 16;
  const badge = dead
    ? `<circle cx="52" cy="${badgeY}" r="13" fill="#8d8478"/><text x="52" y="${badgeY + 5}" text-anchor="middle" font-size="15" fill="#fff" font-weight="bold">&#10005;</text>`
    : `<circle cx="52" cy="${badgeY}" r="13" fill="#fff" stroke="${negative ? "var(--neg-dark)" : skinDark}" stroke-width="2"/><text x="52" y="${badgeY + 5.5}" text-anchor="middle" font-size="${fs}" fill="#3a2f28" font-weight="bold">${label}</text>`;
  return `<svg viewBox="0 0 110 130" xmlns="http://www.w3.org/2000/svg">
    <g ${tf.length ? `transform="${tf.join(" ")}"` : ""}>${parts}</g>${badge}</svg>`;
}

export const SKINS = [
  { skin: "var(--skin1)", skinDark: "var(--skin1-dark)" },
  { skin: "var(--skin2)", skinDark: "var(--skin2-dark)" },
];
