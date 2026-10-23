// ILLUSTRAZIONI STILIZZATE PER LE CARD SOCIAL
// Silhouette di calciatore in maglia (colori del club), stadio stilizzato, maglia.
// Nessun volto, nessuno stemma: solo colori e forme. Usato da pipeline/social.mjs.

const NEUTRAL = '#c9d3df';   // tinta unica "silhouette": nessuna caratteristica fisica
const SHOE = '#0b1220';

function uid(p) { return p + Math.random().toString(36).slice(2, 7); }

// Pattern della maglia (id univoco per evitare collisioni)
function shirtDefs(club, id) {
  const { c1, c2, pattern } = club;
  if (pattern === 'stripes') return `<pattern id="${id}" width="44" height="10" patternUnits="userSpaceOnUse"><rect width="22" height="10" fill="${c1}"/><rect x="22" width="22" height="10" fill="${c2}"/></pattern>`;
  if (pattern === 'halves') return `<pattern id="${id}" width="200" height="10" patternUnits="userSpaceOnUse"><rect width="100" height="10" fill="${c1}"/><rect x="100" width="100" height="10" fill="${c2}"/></pattern>`;
  return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c1}"/></pattern>`;
}

const limb = (pts, w, color) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Calciatore stilizzato in tiro, ~420x560. Origine in alto a sinistra. */
export function figureSvg(club, { scale = 1, x = 0, y = 0, pose = 'kick' } = {}) {
  const id = uid('sh');
  const shirt = club.c1, shorts = club.c2 === '#f2f2f2' || club.c2 === '#f2f6fa' ? club.c2 : club.c2;
  const sock = club.c1;
  // joint: spalle (L/R), anca, braccia, gambe
  const P = pose === 'run'
    ? { head: [214, 78], neck: [214, 128], sL: [168, 152], sR: [262, 152], hip: [212, 300], lArm: [[168, 158], [118, 210], [96, 158]], rArm: [[262, 158], [310, 205], [338, 252]], lLeg: [[198, 300], [140, 382], [78, 432], [52, 428]], rLeg: [[226, 300], [262, 385], [250, 482], [276, 500]], ball: [350, 505] }
    : { head: [226, 80], neck: [222, 128], sL: [176, 154], sR: [270, 150], hip: [214, 300], lArm: [[176, 160], [118, 210], [66, 188]], rArm: [[270, 156], [330, 205], [372, 258]], lLeg: [[200, 300], [190, 402], [184, 494], [150, 508]], rLeg: [[228, 300], [300, 360], [356, 420], [392, 408]], ball: [430, 452] };
  const torso = `${P.sL[0] - 6},${P.sL[1] - 14} ${P.sR[0] + 6},${P.sR[1] - 14} ${P.hip[0] + 40},${P.hip[1] + 8} ${P.hip[0] - 40},${P.hip[1] + 8}`;
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const leg = (l) => {
    const [h, k, a, f] = l;
    const th = mid(h, k, 0.0);
    return limb([h, mid(h, k, 0.82)], 62, shorts) + limb([mid(h, k, 0.82), k], 40, NEUTRAL) + limb([k, a], 36, sock) +
      `<ellipse cx="${f[0]}" cy="${f[1]}" rx="32" ry="14" fill="${SHOE}" transform="rotate(${f[0] > a[0] ? -14 : 14} ${f[0]} ${f[1]})"/>`;
  };
  const arm = (a) => limb([a[0], mid(a[0], a[1], 0.6)], 40, shirt === '#f2f2f2' ? club.c2 : shirt) + limb([mid(a[0], a[1], 0.6), a[1], a[2]], 28, NEUTRAL);
  return `<g transform="translate(${x},${y}) scale(${scale})">
  <defs>${shirtDefs(club, id)}</defs>
  <ellipse cx="230" cy="548" rx="200" ry="14" fill="#000" opacity=".28"/>
  ${leg(P.lLeg)}
  ${arm(P.lArm)}
  <polygon points="${torso}" fill="url(#${id})" stroke="url(#${id})" stroke-width="18" stroke-linejoin="round"/>
  <rect x="${P.hip[0] - 46}" y="${P.hip[1] - 4}" width="92" height="46" rx="20" fill="${shorts}"/>
  ${leg(P.rLeg)}
  ${arm(P.rArm)}
  <rect x="${P.neck[0] - 13}" y="${P.neck[1] - 30}" width="26" height="42" rx="11" fill="${NEUTRAL}"/>
  <circle cx="${P.head[0]}" cy="${P.head[1]}" r="38" fill="${NEUTRAL}"/>
  <g transform="translate(${P.ball[0]},${P.ball[1]})"><circle r="26" fill="#f4f6fa"/><polygon points="0,-12 11,-4 7,10 -7,10 -11,-4" fill="#1b2433"/><circle r="26" fill="none" stroke="#1b2433" stroke-width="2"/></g>
</g>`;
}

/** Stadio stilizzato (panorama) con riflettori: larghezza w, altezza h, in colori del club. */
export function stadiumSvg(club, { w = 1080, h = 340, x = 0, y = 0 } = {}) {
  const id = uid('st');
  const mast = (mx, side) => `<g><rect x="${mx - 5}" y="${h * 0.02}" width="10" height="${h * 0.78}" fill="#0a1626"/><rect x="${mx - 38}" y="${h * 0.0}" width="76" height="30" rx="5" fill="#0a1626"/>${[-24, -8, 8, 24].map((d) => `<circle cx="${mx + d}" cy="${h * 0.0 + 15}" r="5.5" fill="#fff6c9"/>`).join('')}<polygon points="${mx - 36},${h * 0.0 + 30} ${mx + 36},${h * 0.0 + 30} ${mx + 150 * side},${h * 0.8} ${mx - 40 * side},${h * 0.8}" fill="url(#${id}g)" opacity=".5"/></g>`;
  const tiers = [0, 1, 2].map((i) => {
    const top = h * (0.34 + i * 0.12);
    return `<path d="M${w * (0.05 - i * 0.015)},${h * 0.82} L${w * (0.1 - i * 0.012)},${top} L${w * (0.9 + i * 0.012)},${top} L${w * (0.95 + i * 0.015)},${h * 0.82} Z" fill="${i === 1 ? club.c1 : '#13253f'}" opacity="${i === 1 ? 0.9 : 1}"/>`;
  }).join('');
  const crowd = Array.from({ length: 220 }, (_, i) => {
    const cx = w * 0.12 + ((i * 97) % (w * 0.76));
    const cy = h * 0.4 + ((i * 53) % (h * 0.32));
    const c = [club.c1, club.c2, '#f2f6fa', '#f0c94a'][i % 4];
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="3" fill="${c}" opacity=".75"/>`;
  }).join('');
  return `<g transform="translate(${x},${y})">
  <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c9" stop-opacity=".8"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></linearGradient>
  <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f7a3f"/><stop offset="1" stop-color="#145a2d"/></linearGradient></defs>
  ${tiers}${crowd}
  <rect x="${w * 0.04}" y="${h * 0.28}" width="${w * 0.92}" height="${h * 0.05}" fill="#0a1626"/>
  <path d="M0,${h * 0.8} L${w},${h * 0.8} L${w},${h} L0,${h} Z" fill="url(#${id}p)"/>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * w / 8}" y="${h * 0.8}" width="${w / 16}" height="${h * 0.2}" fill="#fff" opacity=".06"/>`).join('')}
  <line x1="0" y1="${h * 0.8}" x2="${w}" y2="${h * 0.8}" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
  ${mast(w * 0.07, 1)}${mast(w * 0.93, -1)}
</g>`;
}

/** Maglia (flat) ~400x400. */
export function jerseySvg(club, { scale = 1, x = 0, y = 0, rot = 0 } = {}) {
  const id = uid('jr');
  const body = 'M110,60 L160,36 Q200,78 240,36 L290,60 L356,134 L310,172 L282,146 L282,360 L118,360 L118,146 L90,172 L44,134 Z';
  return `<g transform="translate(${x},${y}) rotate(${rot} 200 200) scale(${scale})">
  <defs>${shirtDefs(club, id)}<clipPath id="${id}c"><path d="${body}"/></clipPath></defs>
  <path d="${body}" fill="#000" opacity=".25" transform="translate(8,12)"/>
  <path d="${body}" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)"><rect x="30" y="120" width="60" height="60" fill="${club.c2}" opacity=".0"/>
  <path d="M44,134 L90,172 L110,150 L66,106 Z" fill="${club.c2}" opacity=".9"/><path d="M356,134 L310,172 L290,150 L334,106 Z" fill="${club.c2}" opacity=".9"/></g>
  <path d="M160,36 Q200,78 240,36 L226,30 Q200,56 174,30 Z" fill="${club.c2}"/>
  <path d="${body}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
</g>`;
}
