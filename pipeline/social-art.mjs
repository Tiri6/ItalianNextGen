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

// ---------------------------------------------------------------------------
// LAVAGNETTA DA ALLENATORE (Taccuino)
const FORMATIONS = {
  '4-3-3':   [[.07, .5], [.22, .15], [.22, .38], [.22, .62], [.22, .85], [.46, .25], [.46, .5], [.46, .75], [.74, .2], [.78, .5], [.74, .8]],
  '4-2-3-1': [[.07, .5], [.22, .15], [.22, .38], [.22, .62], [.22, .85], [.42, .35], [.42, .65], [.6, .2], [.62, .5], [.6, .8], [.8, .5]],
  '3-5-2':   [[.07, .5], [.22, .25], [.22, .5], [.22, .75], [.42, .1], [.45, .3], [.42, .5], [.45, .7], [.42, .9], [.76, .36], [.76, .64]],
  '4-4-2':   [[.07, .5], [.22, .15], [.22, .38], [.22, .62], [.22, .85], [.47, .12], [.47, .37], [.47, .63], [.47, .88], [.76, .36], [.76, .64]],
  '3-4-3':   [[.07, .5], [.22, .25], [.22, .5], [.22, .75], [.45, .15], [.45, .38], [.45, .62], [.45, .85], [.74, .2], [.78, .5], [.74, .8]],
};
export const formationNames = Object.keys(FORMATIONS);

export function tacticsBoardSvg(formation = '4-3-3', { x = 0, y = 0, w = 900, h = 420 } = {}) {
  const pts = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const px = 40, py = 34, iw = w - 80, ih = h - 68;           // area di gioco interna
  const P = (f) => [px + f[0] * iw, py + f[1] * ih];
  const chalk = '#f4f7f2';
  const lines = `<rect x="${px}" y="${py}" width="${iw}" height="${ih}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <line x1="${px + iw / 2}" y1="${py}" x2="${px + iw / 2}" y2="${py + ih}" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <circle cx="${px + iw / 2}" cy="${py + ih / 2}" r="${ih * 0.17}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <rect x="${px}" y="${py + ih * 0.22}" width="${iw * 0.15}" height="${ih * 0.56}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <rect x="${px + iw * 0.85}" y="${py + ih * 0.22}" width="${iw * 0.15}" height="${ih * 0.56}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <rect x="${px}" y="${py + ih * 0.38}" width="${iw * 0.05}" height="${ih * 0.24}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>
  <rect x="${px + iw * 0.95}" y="${py + ih * 0.38}" width="${iw * 0.05}" height="${ih * 0.24}" fill="none" stroke="${chalk}" stroke-width="3" opacity=".8"/>`;
  const dots = pts.map((f, i) => { const [cx, cy] = P(f); return i === 0
    ? `<circle cx="${cx}" cy="${cy}" r="17" fill="#f0c94a" stroke="${chalk}" stroke-width="3"/>`
    : `<circle cx="${cx}" cy="${cy}" r="17" fill="#0d2c50" stroke="${chalk}" stroke-width="4"/>`; }).join('');
  // frecce di gioco (3 movimenti tratteggiati)
  const arrow = (a, b, bend) => { const [x1, y1] = P(a), [x2, y2] = P(b); const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + bend;
    return `<path d="M${x1 + 22},${y1} Q${mx},${my} ${x2 - 22},${y2}" fill="none" stroke="#f0c94a" stroke-width="4" stroke-dasharray="12 9" stroke-linecap="round" marker-end="url(#ah)"/>`; };
  const n = pts.length;
  const arrows = arrow(pts[n - 4] ?? pts[8], pts[n - 1], -50) + arrow(pts[5], pts[n - 3], 45) + arrow(pts[2], pts[6], -35);
  return `<g transform="translate(${x},${y})">
  <defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#f0c94a"/></marker>
  <linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27704a"/><stop offset="1" stop-color="#1b5538"/></linearGradient></defs>
  <rect x="6" y="14" width="${w}" height="${h}" rx="22" fill="#000" opacity=".3"/>
  <rect width="${w}" height="${h}" rx="22" fill="#8a5a2c"/>
  <rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="16" fill="#a8733a"/>
  <rect x="22" y="22" width="${w - 44}" height="${h - 44}" rx="10" fill="url(#bd)"/>
  <g transform="translate(-0,0)">${lines}${arrows}${dots}</g>
  <text x="${w - 62}" y="${h - 44}" text-anchor="end" font-family="DejaVu Sans" font-size="64" font-weight="bold" fill="${chalk}" opacity=".92">${formation}</text>
  <rect x="${w * 0.42}" y="${h - 18}" width="${w * 0.16}" height="16" rx="6" fill="#6f4520"/>
</g>`;
}

// ---------------------------------------------------------------------------
// COPPE STILIZZATE (Europei / Mondiali): ~300x520
function sparkles(cx, cy, r, n = 6) {
  const pos = [[-1.1, -.9, 1], [1.15, -.5, .8], [-1.0, .3, .7], [1.0, .6, 1], [-.5, 1.0, .6], [.4, -1.2, .7]].slice(0, n);
  return pos.map(([dx, dy, k]) => { const x = cx + dx * r, y = cy + dy * r, s = 16 * k;
    return `<path d="M${x},${y - s} L${x + s * .28},${y - s * .28} L${x + s},${y} L${x + s * .28},${y + s * .28} L${x},${y + s} L${x - s * .28},${y + s * .28} L${x - s},${y} L${x - s * .28},${y - s * .28} Z" fill="#fff6c9" opacity=".9"/>`; }).join('');
}

export function trophySvg(kind = 'europei', { scale = 1, x = 0, y = 0 } = {}) {
  const id = uid('tr');
  if (kind === 'mondiali') {
    return `<g transform="translate(${x},${y}) scale(${scale})">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8861f"/><stop offset=".35" stop-color="#ffe27a"/><stop offset=".6" stop-color="#e0aa2b"/><stop offset="1" stop-color="#9c6d12"/></linearGradient></defs>
  ${sparkles(150, 230, 190)}
  <ellipse cx="150" cy="500" rx="130" ry="14" fill="#000" opacity=".3"/>
  <path d="M92,170 C60,250 112,290 108,360 L192,360 C188,290 240,250 208,170 Z" fill="url(#${id})"/>
  <path d="M104,200 C118,240 112,300 120,350 M196,200 C182,240 188,300 180,350" stroke="#9c6d12" stroke-width="5" fill="none" opacity=".6"/>
  <circle cx="150" cy="120" r="78" fill="url(#${id})"/>
  <path d="M82,100 Q150,60 218,100 M76,140 Q150,176 224,140 M150,42 Q108,120 150,198 M150,42 Q192,120 150,198" stroke="#9c6d12" stroke-width="4" fill="none" opacity=".55"/>
  <rect x="98" y="356" width="104" height="30" fill="url(#${id})"/>
  <rect x="86" y="384" width="128" height="44" rx="6" fill="#1f8a4c"/><rect x="86" y="396" width="128" height="8" fill="#0d5a2c" opacity=".6"/>
  <rect x="76" y="426" width="148" height="46" rx="8" fill="url(#${id})"/>
</g>`;
  }
  // europei: coppa d'argento a due anse
  return `<g transform="translate(${x},${y}) scale(${scale})">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d9db0"/><stop offset=".35" stop-color="#f4f8fc"/><stop offset=".62" stop-color="#c3cfdc"/><stop offset="1" stop-color="#7a8ba0"/></linearGradient></defs>
  ${sparkles(150, 230, 190)}
  <ellipse cx="150" cy="500" rx="130" ry="14" fill="#000" opacity=".3"/>
  <path d="M62,104 C26,100 18,170 74,196" stroke="url(#${id})" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M238,104 C274,100 282,170 226,196" stroke="url(#${id})" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M56,58 H244 C244,158 210,204 166,226 L166,330 H134 L134,226 C90,204 56,158 56,58 Z" fill="url(#${id})"/>
  <ellipse cx="150" cy="58" rx="94" ry="16" fill="#e9eff6"/><ellipse cx="150" cy="60" rx="78" ry="10" fill="#6a7b90"/>
  <rect x="104" y="326" width="92" height="26" fill="url(#${id})"/>
  <rect x="84" y="350" width="132" height="46" rx="6" fill="#12437a"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M${104 + i * 23},${365} l3,8 8,1 -6,6 2,8 -7,-4 -7,4 2,-8 -6,-6 8,-1 z" fill="#f0c94a"/>`).join('')}
  <rect x="72" y="394" width="156" height="50" rx="8" fill="url(#${id})"/>
</g>`;
}
