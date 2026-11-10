// Layered SVG character rig. Everything is always fully clothed: there is no code path that removes clothing.
// Animation states are CSS classes on the root .av element (see styles.css): idle / walking / happy / sad / talking.

let uid = 0;
const OUT = 'stroke="rgba(0,0,0,.22)" stroke-width="1.6" stroke-linejoin="round"';

function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- hair
function hairBack(style, col) {
  if (style === 'long') return `<path d="M56 72 Q46 28 100 22 Q154 28 144 72 L150 132 Q100 146 50 132 Z" fill="${col}" ${OUT}/>`;
  if (style === 'curly') return `<ellipse cx="100" cy="52" rx="46" ry="30" fill="${col}"/>`;
  return '';
}
function hairFront(style, col) {
  const f = (d) => `<path d="${d}" fill="${col}" ${OUT}/>`;
  switch (style) {
    case 'side': return f('M60 72 Q54 26 100 22 Q146 26 140 72 Q134 50 112 44 Q88 40 70 52 Q64 58 62 72Z') + `<path d="M84 43 Q96 40 104 46" stroke="rgba(255,255,255,.18)" stroke-width="2" fill="none"/>`;
    case 'swept': return f('M60 74 Q48 20 104 15 Q152 18 140 74 Q138 44 108 36 Q80 34 66 58Z');
    case 'wavy': return f('M58 78 Q46 22 100 18 Q154 22 142 78 Q142 52 124 44 Q112 54 98 44 Q82 54 70 46 Q60 56 58 78Z');
    case 'curly': return [[70, 40], [86, 32], [102, 30], [118, 32], [132, 40], [64, 54], [138, 54]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${col}" ${OUT}/>`).join('');
    case 'long': return f('M60 74 Q56 28 100 24 Q144 28 140 74 Q132 46 100 44 Q68 46 60 74Z');
    case 'buzz': return `<path d="M64 66 Q62 36 100 34 Q138 36 136 66 Q128 50 100 48 Q72 50 64 66Z" fill="${col}" opacity=".78"/>`;
    case 'bald': return f('M62 60 Q58 74 63 88 L67 70Z') + f('M138 60 Q142 74 137 88 L133 70Z') + `<path d="M76 44 Q100 34 124 44" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default: return f('M62 70 Q58 28 100 26 Q142 28 138 70 Q130 48 100 46 Q70 48 62 70Z'); // crop
  }
}

// ---------------------------------------------------------------- face pieces
function beardSvg(kind, col) {
  const f = (d, o = 1) => `<path d="${d}" fill="${col}" opacity="${o}"/>`;
  switch (kind) {
    case 'stubble': return f('M64 80 Q66 118 100 122 Q134 118 136 80 Q128 100 100 102 Q72 100 64 80Z', 0.3);
    case 'short': return f('M62 80 Q64 124 100 127 Q136 124 138 80 Q130 99 118 96 Q100 92 82 96 Q70 99 62 80Z', 0.88);
    case 'full': return f('M60 76 Q58 134 100 142 Q142 134 140 76 Q132 99 116 95 Q100 90 84 95 Q68 99 60 76Z', 0.95);
    case 'goatee': return f('M88 104 Q100 98 112 104 Q113 126 100 129 Q87 126 88 104Z', 0.92);
    default: return '';
  }
}
function mustacheSvg(kind, col) {
  switch (kind) {
    case 'thin': return `<path d="M85 95 Q100 90 115 95 Q100 98 85 95Z" fill="${col}"/>`;
    case 'thick': return `<path d="M78 98 Q88 87 100 93 Q112 87 122 98 Q112 103 100 98 Q88 103 78 98Z" fill="${col}"/><path d="M78 98 Q74 94 76 90 M122 98 Q126 94 124 90" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default: return '';
  }
}
function glassesSvg(kind) {
  const s = 'stroke="#222" stroke-width="2.2" fill="rgba(255,255,255,.12)"';
  if (kind === 'round') return `<g><circle cx="84" cy="75" r="11" ${s}/><circle cx="116" cy="75" r="11" ${s}/><path d="M95 75 H105" stroke="#222" stroke-width="2"/></g>`;
  if (kind === 'square') return `<g><rect x="72" y="66" width="24" height="18" rx="4" ${s}/><rect x="104" y="66" width="24" height="18" rx="4" ${s}/><path d="M96 74 H104" stroke="#222" stroke-width="2"/></g>`;
  return '';
}

function faceFeatures(hero, hairCol) {
  const brow = hairCol;
  const eye = (cx) => `
    <g class="eye-open" style="transform-origin:${cx}px 75px">
      <ellipse cx="${cx}" cy="75" rx="7.5" ry="8.5" fill="#fff" ${OUT}/>
      <circle cx="${cx + 1}" cy="76" r="4.6" fill="#2a1a12"/><circle cx="${cx + 2.6}" cy="73.6" r="1.6" fill="#fff"/>
    </g>
    <path class="eye-happy" d="M${cx - 8} 77 Q${cx} 66 ${cx + 8} 77" stroke="#2a1a12" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  return `
  ${eye(84)}${eye(116)}
  <g class="brows" stroke="${brow}" stroke-width="4" fill="none" stroke-linecap="round">
    <g class="b b-neutral"><path d="M75 63 Q84 59 93 63"/><path d="M107 63 Q116 59 125 63"/></g>
    <g class="b b-happy"><path d="M75 59 Q84 52 93 58"/><path d="M107 58 Q116 52 125 59"/></g>
    <g class="b b-sad"><path d="M75 67 L93 58"/><path d="M107 58 L125 67"/></g>
  </g>
  <path d="M98 84 Q101 91 104 90" stroke="rgba(0,0,0,.28)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <ellipse class="blush" cx="72" cy="92" rx="8" ry="4.5" fill="#ff6b81" opacity="0"/><ellipse class="blush" cx="128" cy="92" rx="8" ry="4.5" fill="#ff6b81" opacity="0"/>`;
}
const mouths = `
  <g class="m m-neutral"><path d="M91 104 Q100 109 109 104" stroke="#5a2a2a" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>
  <g class="m m-happy"><path d="M86 99 Q100 122 114 99 Z" fill="#7a1f2c" stroke="#5a1520" stroke-width="1.5" stroke-linejoin="round"/><path d="M89 100 Q100 106 111 100 Z" fill="#fff"/><path d="M93 112 Q100 107 107 112 Q100 117 93 112Z" fill="#e8607a"/></g>
  <g class="m m-sad"><path d="M91 109 Q100 100 109 109" stroke="#5a2a2a" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>
  <g class="m m-talk"><ellipse class="talk-mouth" cx="100" cy="105" rx="7" ry="5.5" fill="#6b1f2a" stroke="#4a1018" stroke-width="1.4"/><ellipse cx="100" cy="108" rx="4" ry="2" fill="#e8607a"/></g>`;

// ---------------------------------------------------------------- head
function headSvg(hero, costume, photo, id) {
  const hs = costume.hair || hero.hs;
  const hairCol = costume.hairColor || hero.hair;
  const acc = costume.acc || [];
  const skin = hero.skin, skinD = shade(skin, -0.12);
  const jaw = hero.face === 'round' ? { rx: 40, ry: 43 } : hero.face === 'square' ? { rx: 38, ry: 42 } : { rx: 36, ry: 44 };

  if (photo) {
    return `
    <g class="head"><g class="head-inner photo">
      <clipPath id="cp${id}"><ellipse cx="100" cy="76" rx="40" ry="47"/></clipPath>
      <ellipse cx="100" cy="76" rx="44" ry="51" fill="${shade(hero.accent, -0.2)}"/>
      <image href="${photo}" x="58" y="22" width="84" height="108" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp${id})"/>
      <ellipse cx="100" cy="76" rx="40" ry="47" fill="none" stroke="#fff" stroke-width="3"/>
      <text class="pe pe-happy" x="140" y="34" font-size="26">😄</text>
      <text class="pe pe-sad" x="140" y="34" font-size="26">😢</text>
      <text class="pe pe-talk" x="140" y="34" font-size="26">💬</text>
    </g></g>`;
  }

  const cap = acc.includes('cap')
    ? `<path d="M58 60 Q60 20 100 18 Q140 20 142 60 Z" fill="${hero.accent}" ${OUT}/><path d="M60 60 Q104 70 150 58 L156 65 Q104 78 54 66Z" fill="${shade(hero.accent, -0.25)}" ${OUT}/>` : '';
  const sun = acc.includes('sunglasses')
    ? `<g class="sunnies"><rect x="70" y="65" width="26" height="17" rx="7" fill="#111" ${OUT}/><rect x="104" y="65" width="26" height="17" rx="7" fill="#111" ${OUT}/><path d="M96 71 H104" stroke="#111" stroke-width="3"/><path d="M74 69 L82 69" stroke="rgba(255,255,255,.4)" stroke-width="2"/></g>` : '';
  return `
  <g class="head"><g class="head-inner">
    ${hairBack(hs, hairCol)}
    <ellipse cx="63" cy="80" rx="6.5" ry="9.5" fill="${skin}" ${OUT}/><ellipse cx="137" cy="80" rx="6.5" ry="9.5" fill="${skin}" ${OUT}/>
    <ellipse cx="100" cy="77" rx="${jaw.rx}" ry="${jaw.ry}" fill="${skin}" ${OUT}/>
    ${hero.face === 'square' ? `<path d="M68 96 Q70 118 100 121 Q130 118 132 96" fill="${skinD}" opacity=".18"/>` : ''}
    ${beardSvg(hero.beard, hairCol)}
    ${faceFeatures(hero, hairCol)}
    ${mouths}
    ${mustacheSvg(hero.must, hairCol)}
    ${glassesSvg(hero.glasses)}
    ${sun}
    ${hairFront(hs, hairCol)}
    ${cap}
  </g></g>`;
}

// ---------------------------------------------------------------- clothing
const HEM = { tee: 240, polo: 240, shirt: 248, hoodie: 250, kurta: 298, sherwani: 316 };
const JHEM = { denim: 246, leather: 248, bomber: 244, blazer: 266, bandhgala: 292, waistcoat: 246 };
const LONG_SLEEVE = new Set(['shirt', 'hoodie', 'kurta', 'sherwani']);
const JACKET_SLEEVES = new Set(['denim', 'leather', 'bomber', 'blazer', 'bandhgala']);

function torsoPath(hem, flare = 0) {
  return `M64 140 Q64 126 82 124 L118 124 Q136 126 136 140 L${134 + flare} ${hem} Q100 ${hem + 8} ${66 - flare} ${hem} Z`;
}

function topSvg(top, hero) {
  const c = top.color, d = shade(c, -0.18), hem = HEM[top.style] || 240;
  const flare = hem > 280 ? 5 : 0;
  let s = `<path d="${torsoPath(hem, flare)}" fill="${c}" ${OUT}/>`;
  switch (top.style) {
    case 'polo': s += `<path d="M86 124 L100 140 L114 124 L110 120 L100 130 L90 120Z" fill="${d}" ${OUT}/><path d="M100 140 V160" stroke="${d}" stroke-width="2"/><circle cx="100" cy="148" r="1.6" fill="#fff"/><circle cx="100" cy="156" r="1.6" fill="#fff"/>`; break;
    case 'shirt': s += `<path d="M84 122 L100 146 L116 122 L110 118 L100 132 L90 118Z" fill="${shade(c, 0.35)}" ${OUT}/><path d="M100 146 V${hem}" stroke="${d}" stroke-width="1.6"/>${[158, 176, 194, 212, 230].map((y) => `<circle cx="100" cy="${y}" r="1.7" fill="${d}"/>`).join('')}`; break;
    case 'hoodie': s += `<path d="M78 124 Q100 156 122 124 Q122 112 100 110 Q78 112 78 124Z" fill="${d}" ${OUT}/><path d="M94 140 L94 160 M106 140 L106 160" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M76 214 Q100 224 124 214 L128 244 Q100 252 72 244Z" fill="${d}" opacity=".55"/>`; break;
    case 'kurta': s += `<path d="M92 122 L92 120 L108 120 L108 122 L104 146 L96 146Z" fill="${d}" ${OUT}/><path d="M100 146 V190" stroke="${d}" stroke-width="2"/>${[154, 166, 178].map((y) => `<circle cx="100" cy="${y}" r="1.9" fill="${shade(c, 0.5)}"/>`).join('')}<path d="M66 ${hem} L70 ${hem - 40} M134 ${hem} L130 ${hem - 40}" stroke="${d}" stroke-width="1.4" opacity=".5"/>`; break;
    case 'sherwani': s += `<path d="M90 122 L90 118 L110 118 L110 122 L106 150 L94 150Z" fill="#d4a017" ${OUT}/><path d="M100 150 V${hem}" stroke="#d4a017" stroke-width="2"/>${[158, 174, 190, 206, 222, 238, 254].map((y) => `<circle cx="100" cy="${y}" r="2.4" fill="#d4a017" stroke="#8a6a00" stroke-width=".8"/>`).join('')}<path d="M66 ${hem - 6} Q100 ${hem + 4} 134 ${hem - 6}" stroke="#d4a017" stroke-width="3" fill="none"/>`; break;
    default: s += `<path d="M84 124 Q100 140 116 124" fill="none" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`; // tee crew
  }
  return s;
}

function jacketSvg(j) {
  if (!j || j.style === 'none') return '';
  const c = j.color, d = shade(c, -0.22), l = shade(c, 0.12), hem = JHEM[j.style] || 246;
  const panelL = `M64 140 Q64 126 82 124 L90 124 L93 ${hem} L66 ${hem} Z`;
  const panelR = `M136 140 Q136 126 118 124 L110 124 L107 ${hem} L134 ${hem} Z`;
  switch (j.style) {
    case 'bandhgala': return `<path d="${torsoPath(hem, 4)}" fill="${c}" ${OUT}/><path d="M90 124 L90 116 L110 116 L110 124 L104 138 L96 138Z" fill="${d}" ${OUT}/><path d="M100 138 V${hem}" stroke="${d}" stroke-width="1.8"/>${[152, 170, 188, 206, 224].map((y) => `<circle cx="100" cy="${y}" r="2.4" fill="#d4a017"/>`).join('')}`;
    case 'waistcoat': return `<path d="${panelL}" fill="${c}" ${OUT}/><path d="${panelR}" fill="${c}" ${OUT}/><path d="M82 124 L91 124 L98 150 L88 140Z M118 124 L109 124 L102 150 L112 140Z" fill="${d}"/>${[160, 180, 200, 220].map((y) => `<circle cx="96" cy="${y}" r="1.8" fill="#bbb"/>`).join('')}`;
    case 'blazer': return `<path d="${panelL}" fill="${c}" ${OUT}/><path d="${panelR}" fill="${c}" ${OUT}/><path d="M80 124 L91 124 L99 170 L84 150Z" fill="${l}" ${OUT}/><path d="M120 124 L109 124 L101 170 L116 150Z" fill="${l}" ${OUT}/><circle cx="93" cy="200" r="2.4" fill="${d}"/><circle cx="107" cy="200" r="2.4" fill="${d}"/><path d="M70 ${hem - 22} h12" stroke="${d}" stroke-width="2"/>`;
    case 'leather': return `<path d="${panelL}" fill="${c}" ${OUT}/><path d="${panelR}" fill="${c}" ${OUT}/><path d="M80 124 L91 124 L95 156 L84 144Z M120 124 L109 124 L105 156 L116 144Z" fill="${l}" ${OUT}/><path d="M93 130 V${hem}M107 130 V${hem}" stroke="#bbb" stroke-width="2" stroke-dasharray="3 3"/><path d="M68 190 H86" stroke="${d}" stroke-width="2"/>`;
    case 'bomber': return `<path d="${panelL}" fill="${c}" ${OUT}/><path d="${panelR}" fill="${c}" ${OUT}/><path d="M64 ${hem - 8} Q66 ${hem + 4} 93 ${hem + 4} L93 ${hem - 8}Z M136 ${hem - 8} Q134 ${hem + 4} 107 ${hem + 4} L107 ${hem - 8}Z" fill="${d}"/><path d="M80 122 Q85 130 92 130 L92 124Z M120 122 Q115 130 108 130 L108 124Z" fill="${d}"/>`;
    default: return `<path d="${panelL}" fill="${c}" ${OUT}/><path d="${panelR}" fill="${c}" ${OUT}/><path d="M80 124 L91 124 L95 150 L84 140Z M120 124 L109 124 L105 150 L116 140Z" fill="${d}" ${OUT}/><path d="M70 150 h14 M116 150 h14" stroke="${l}" stroke-width="1.6" stroke-dasharray="2 2"/>`; // denim
  }
}

function legSvg(side, costume, hero) {
  const cx = side === 'l' ? 86 : 114;
  const b = costume.bottom, c = b.color, d = shade(c, -0.2);
  const sh = costume.shoes;
  const toe = side === 'l' ? -1 : 1;
  let pants;
  switch (b.style) {
    case 'dhoti': pants = `<path d="M${cx - 18} 226 L${cx - 20} 338 L${cx + 20} 338 L${cx + 18} 226 Z" fill="${c}" ${OUT}/><rect x="${cx - 20}" y="322" width="40" height="16" fill="#d4a017" opacity=".9"/><path d="M${cx - 20} 328 H${cx + 20}" stroke="#8a6a00" stroke-width="1.5"/>`; break;
    case 'pyjama': pants = `<path d="M${cx - 15} 226 L${cx - 16} 346 L${cx + 16} 346 L${cx + 15} 226 Z" fill="${c}" ${OUT}/><path d="M${cx} 240 V340" stroke="${d}" stroke-width="1.2" opacity=".4"/>`; break;
    case 'trousers': pants = `<path d="M${cx - 14} 226 L${cx - 14} 348 L${cx + 14} 348 L${cx + 14} 226 Z" fill="${c}" ${OUT}/><path d="M${cx} 244 V346" stroke="${d}" stroke-width="1.6" opacity=".6"/>`; break;
    default: pants = `<path d="M${cx - 14} 226 L${cx - 14} 348 L${cx + 14} 348 L${cx + 14} 226 Z" fill="${c}" ${OUT}/><path d="M${cx + 8} 232 V344" stroke="#e9d28a" stroke-width="1.2" stroke-dasharray="3 2" opacity=".7"/><path d="M${cx - 14} 340 H${cx + 14}" stroke="${d}" stroke-width="3" opacity=".5"/>`; // jeans
  }
  const dhotiFeet = b.style === 'dhoti' || sh.style === 'sandal';
  let shoe;
  if (sh.style === 'sandal') shoe = `<ellipse cx="${cx + toe * 3}" cy="346" rx="12" ry="7" fill="${hero.skin}" ${OUT}/><path d="M${cx - 13 + toe * 3} 352 Q${cx + toe * 3} 358 ${cx + 13 + toe * 3} 352" stroke="${sh.color}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  else if (sh.style === 'formal') shoe = `<path d="M${cx - 15} 344 L${cx + 15} 344 L${cx + 15 + toe * 8} 354 Q${cx + 15 + toe * 8} 362 ${cx + toe * 6} 362 L${cx - 15} 362 Z" fill="${sh.color}" ${OUT}/><path d="M${cx - 8} 349 Q${cx} 346 ${cx + 8} 349" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none"/>`;
  else shoe = `<path d="M${cx - 15} 342 L${cx + 15} 342 L${cx + 17 + toe * 8} 354 Q${cx + 17 + toe * 8} 363 ${cx + toe * 6} 363 L${cx - 15} 363 Z" fill="${sh.color}" ${OUT}/><path d="M${cx - 15} 360 H${cx + 17 + toe * 6}" stroke="#bbb" stroke-width="3"/><path d="M${cx - 6} 348 H${cx + 6}" stroke="${shade(sh.color, -0.25)}" stroke-width="2"/>`;
  void dhotiFeet;
  return `<g class="leg leg-${side}">${pants}${shoe}</g>`;
}

function armSvg(side, costume, hero) {
  const sx = side === 'l' ? 66 : 134;
  const top = costume.top, jk = costume.jacket;
  const jacketSleeves = jk && JACKET_SLEEVES.has(jk.style);
  const sleeveColor = jacketSleeves ? jk.color : top.color;
  const long = jacketSleeves || LONG_SLEEVE.has(top.style);
  const dark = shade(sleeveColor, -0.2);
  const x = sx - 11, handY = 232;
  let a = '';
  if (long) a += `<rect x="${x}" y="126" width="22" height="94" rx="11" fill="${sleeveColor}" ${OUT}/><rect x="${x}" y="206" width="22" height="14" rx="6" fill="${dark}" opacity=".55"/>`;
  else a += `<rect x="${x + 2}" y="150" width="18" height="76" rx="9" fill="${hero.skin}" ${OUT}/><rect x="${x}" y="126" width="22" height="50" rx="11" fill="${sleeveColor}" ${OUT}/>`;
  a += `<circle cx="${sx}" cy="${handY}" r="10" fill="${hero.skin}" ${OUT}/>`;
  if (side === 'l' && costume.acc.includes('watch')) a += `<rect x="${x + 1}" y="212" width="20" height="8" rx="3" fill="#2b2b33" ${OUT}/><circle cx="${sx}" cy="216" r="3" fill="#cfd8dc"/>`;
  return `<g class="arm arm-${side}">${a}</g>`;
}

function accSvg(costume, hero) {
  const acc = costume.acc || [];
  let s = '';
  if (acc.includes('chain')) s += `<path d="M86 128 Q100 160 114 128" stroke="#e5b422" stroke-width="3" fill="none"/><circle cx="100" cy="153" r="4" fill="#e5b422" ${OUT}/>`;
  if (acc.includes('scarf')) s += `<path d="M78 120 Q100 138 122 120 L126 132 Q100 150 74 132Z" fill="${hero.accent}" ${OUT}/><path d="M108 138 L118 176 L106 174 L98 142Z" fill="${shade(hero.accent, -0.2)}" ${OUT}/>`;
  if (acc.includes('shawl')) s += `<path d="M70 128 Q92 124 108 134 L136 200 L124 206 L100 156 L72 150Z" fill="#c9a227" opacity=".95" ${OUT}/><path d="M118 190 L136 200 L124 206 L108 172Z" fill="#8c1c13"/><path d="M76 146 L100 152 L124 204" stroke="#8c1c13" stroke-width="3" fill="none"/>`;
  if (acc.includes('tie')) s += `<path d="M95 132 L105 132 L108 142 L100 146 L92 142Z M96 146 L104 146 L108 200 L100 208 L92 200Z" fill="${hero.accent}" ${OUT}/>`;
  return s;
}

// ---------------------------------------------------------------- public
const FX = `
  <g class="fx fx-happy" pointer-events="none">
    <path class="spark s1" d="M44 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ffd60a"/>
    <path class="spark s2" d="M158 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ff9ecd"/>
    <path class="spark s3" d="M160 96 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill="#7bdff2"/>
  </g>
  <g class="fx fx-sad" pointer-events="none">
    <path class="tear" d="M76 88 q-5 9 0 12 q5 -3 0 -12z" fill="#6ec1ff"/>
    <path class="tear t2" d="M124 88 q-5 9 0 12 q5 -3 0 -12z" fill="#6ec1ff"/>
    <path d="M70 34 v12 M82 28 v14 M94 24 v14 M106 24 v14 M118 28 v14 M130 34 v12" stroke="#5b6b8c" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
  </g>`;

/**
 * @param {{hero:object, costume:object, photo?:string, bust?:boolean, cls?:string}} o
 */
export function renderAvatar({ hero, costume, photo = null, bust = false, cls = '' }) {
  const id = ++uid;
  const vb = bust ? '36 12 128 150' : '0 0 200 390';
  const body = `
  ${bust ? '' : '<ellipse class="shadow" cx="100" cy="368" rx="54" ry="8" fill="rgba(0,0,0,.28)"/>'}
  <g class="bob">
    ${legSvg('l', costume, hero)}${legSvg('r', costume, hero)}
    <g class="torso">
      ${topSvg(costume.top, hero)}
      <rect x="90" y="108" width="20" height="22" rx="6" fill="${hero.skin}" ${OUT}/>
      ${costume.top.style === 'tee' ? `<path d="M84 124 Q100 140 116 124 Q100 132 84 124Z" fill="${hero.skin}" ${OUT}/>` : ''}
      ${jacketSvg(costume.jacket)}
      ${accSvg(costume, hero)}
    </g>
    ${armSvg('l', costume, hero)}${armSvg('r', costume, hero)}
    ${headSvg(hero, costume, photo, id)}
    ${FX}
  </g>`;
  return `<div class="av expr-neutral idle ${cls}" data-hero="${hero.id}"><div class="av-flip"><svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${hero.name} avatar">${body}</svg></div></div>`;
}
