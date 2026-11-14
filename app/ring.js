// Progress ring (style A): a colored arc on a dark track, with a label in the middle and an optional caption under it.
export const ring = (share, color, size = 64, label = `${Math.round(share * 100)}%`, caption = '') => {
  const w = size > 60 ? 7 : 6, r = (size - w) / 2, c = 2 * Math.PI * r;
  return `<span class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" aria-hidden="true">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--color-paper-3)" stroke-width="${w}"/>`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${share ? 'round' : 'butt'}" stroke-dasharray="${(c * share).toFixed(1)} ${c.toFixed(1)}"/></svg>`
    + `<b>${label}${caption ? `<small>${caption}</small>` : ''}</b></span>`;
};
