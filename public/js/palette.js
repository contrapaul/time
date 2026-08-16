/* Ten swatches plus a custom picker. Deliberately not subject-specific:
   nothing here assumes what anyone teaches or studies. */

export const PALETTE = [
  '#3d3d3d',
  '#16257d',
  '#3d6b4a',
  '#6b4570',
  '#bf5450',
  '#c08a2e',
  '#29b6e8',
  '#a8a8d0',
  '#7a6a58',
  '#f2f2f4',
];

export function defaultColour(i = 0) {
  return PALETTE[i % PALETTE.length];
}

function rgbOf(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function readableOn(hex) {
  const [r, g, b] = rgbOf(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}

/** What a colour looks like once time has passed it. */
export function greyOf(hex, opacity = 0.38) {
  const [r, g, b] = rgbOf(hex);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mix = (c) => Math.round(c * opacity + 255 * (1 - opacity));
  return `rgb(${mix(lum)}, ${mix(lum)}, ${mix(lum)})`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
