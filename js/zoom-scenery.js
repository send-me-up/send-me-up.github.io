// Send Me Up — the opening scene of the zoom test (8 Nov 2026, Arman: "everywhere else will have the same start up…
// we should somehow distinguish the starting points… maybe some monuments of the city?").
//
// Two parts:
// 1. Landmarks for famous places, drawn as simple silhouettes at about their real size. They stand a few hundred metres
//    to the side (not their real direction), so they come into view as the camera pulls back.
// 2. Everywhere else, the scene follows what really surrounds the place on the map (Solar System Scope, NASA data):
//    sea and boats near water, dunes and palms in desert, pines in snow, fields and trees otherwise;
//    Mediterranean white houses in the south, brick and red roofs in the north; taller buildings in big cities.
// Everything here is in metres: e along the ground (east +), u up from the ground.
(function (root) {
  'use strict';
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const DEG = Math.PI / 180;

  // Famous places: where the landmark is (lat, lon), how far from it a start still shows it (km), where it stands in the scene (m):
// close beside you (about 1.3 times its height away), so it is whole on a phone screen soon after lift-off.
  const LANDMARKS = [
    { id: 'acropolis', name: 'The Acropolis', lat: 37.9715, lon: 23.7257, r: 25, at: 205 },
    { id: 'hagia', name: 'Hagia Sophia', lat: 41.0086, lon: 28.9802, r: 30, at: -95 },
    { id: 'galata', name: 'Galata Tower', lat: 41.0256, lon: 28.9741, r: 30, at: 90 },
    { id: 'whitetower', name: 'The White Tower', lat: 40.6264, lon: 22.9484, r: 20, at: 50 },
    { id: 'eiffel', name: 'Eiffel Tower', lat: 48.8584, lon: 2.2945, r: 25, at: 300 },
    { id: 'bigben', name: 'Big Ben', lat: 51.5007, lon: -0.1246, r: 30, at: 140 },
    { id: 'colosseum', name: 'The Colosseum', lat: 41.8902, lon: 12.4922, r: 25, at: 125 },
    { id: 'pyramids', name: 'The Pyramids of Giza', lat: 29.9792, lon: 31.1342, r: 35, at: 180 },
    { id: 'liberty', name: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, r: 30, at: -125 },
    { id: 'belfry', name: 'Belfry of Ghent', lat: 51.0536, lon: 3.7253, r: 15, at: 118 },
    { id: 'brussels', name: 'Brussels Town Hall', lat: 50.8467, lon: 4.3524, r: 20, at: -125 },
  ];
  // width of each landmark's footprint (m), so houses keep clear of it
  const SPAN = { acropolis: [-180, 185], hagia: [-62, 62], galata: [-11, 11], whitetower: [-12, 12], eiffel: [-63, 63], bigben: [-240, 8], colosseum: [-95, 95], pyramids: [-115, 522], liberty: [-45, 45], belfry: [-70, 10], brussels: [-63, 63] };
  const FOOT = Object.fromEntries(Object.entries(SPAN).map(([k, [a, b]]) => [k, b - a]));
  const kmBetween = (a, b, c, d) => {
    const x = (d - b) * DEG * Math.cos((a + c) / 2 * DEG), y = (c - a) * DEG;
    return Math.hypot(x, y) * 6371;
  };

  // What surrounds the place, from the map: share of water, sand, snow and green within about 10–40 km, and which side the water is on.
  function surroundings(map, lat, lon) {
    if (!map) return { water: 0, side: 0, sand: 0, snow: 0, green: 1 };
    const W = map.width, H = map.height, d = map.data;
    let water = 0, sand = 0, snow = 0, green = 0, total = 0, east = 0, west = 0;
    for (const r of [0.1, 0.2, 0.35]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * 2 * Math.PI, la = lat + r * Math.sin(a), lo = lon + r * Math.cos(a) / Math.max(0.2, Math.cos(lat * DEG));
      const u = Math.floor(((lo / 360 + 0.5) % 1 + 1) % 1 * W), v = Math.max(0, Math.min(H - 1, Math.floor((0.5 - la / 180) * H)));
      const i = (v * W + u) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      total++;
      if (B > R + 15 && B >= G - 5) { water++; if (Math.cos(a) > 0.3) east++; else if (Math.cos(a) < -0.3) west++; }
      else if (R > 200 && G > 200 && B > 200) snow++;
      else if (R > 165 && G > 135 && B < 150 && R - B > 45) sand++;
      else if (G >= R - 5 && G > B) green++;
    }
    return { water: water / total, side: east > west ? 1 : west > east ? -1 : (rnd(lat, lon) < 0.5 ? -1 : 1), sand: sand / total, snow: snow / total, green: green / total };
  }

  // The scene for one place: style, landmarks, houses, trees, sea, far-off buildings.
  function make(lat, lon, pop, map) {
    const env = surroundings(map, lat, lon);
    const marks = LANDMARKS.filter(m => kmBetween(lat, lon, m.lat, m.lon) <= m.r).map(m => ({ ...m }));   // copies: their place in the scene may change below
    const style = env.snow > 0.35 || Math.abs(lat) > 63 ? 'snow' : env.sand > 0.35 ? 'desert' : Math.abs(lat) < 44 ? 'med' : 'north';
    const coast = env.water >= 0.2 || marks.some(m => m.id === 'liberty');
    const seaSide = coast ? (marks.some(m => m.id === 'liberty') ? Math.sign(marks.find(m => m.id === 'liberty').at) : env.side) : 0;   // the statue stands in the water
    const seaFrom = 110;                                                 // metres from you where the sea starts, on its side
    // By the sea, the landmarks stand on the land side, one after another (Arman, 8 Nov 2026: the Acropolis stood over the water).
    // The Statue of Liberty is the one that really stands in the water.
    if (coast && seaSide && !marks.some(m => m.id === 'liberty')) {
      const land = -seaSide; let reach = 6;
      for (const m of marks.sort((a, b) => Math.abs(a.at) - Math.abs(b.at))) {
        const inner = land > 0 ? -SPAN[m.id][0] : SPAN[m.id][1], outer = land > 0 ? SPAN[m.id][1] : -SPAN[m.id][0];
        const d = Math.max(Math.abs(m.at), reach + 20 + inner);
        m.at = land * d; reach = d + outer;
      }
    }
    const city = pop >= 700000 || (marks.length > 0 && !(pop > 0 && pop < 100000));
    const seed = Math.round((lat + 90) * 1000 + (lon + 180) * 7);
    // small places get a village tower: a church spire in the north and in snow, a bell tower in the south (not in desert or big cities)
    const towerKind = !marks.length && !city && (style === 'north' || style === 'snow') ? 'spire' : !marks.length && !city && style === 'med' ? 'bell' : null;
    const towerAt = towerKind ? (rnd(lat * 7, lon * 3) < 0.5 ? -1 : 1) * (55 + rnd(lat * 5, lon * 11) * 35) : 0;
    const blocked = e => (towerKind && Math.abs(e - towerAt) < 22) || marks.some(m => e > m.at + SPAN[m.id][0] - 6 && e < m.at + SPAN[m.id][1] + 6) || (coast && Math.sign(e) === seaSide && Math.abs(e) > seaFrom - 8);
    const near = [];
    // one house right behind you (unless a landmark stands there), so the first picture is a street; then the street goes on both ways
    const homeW = 9 + rnd(seed, 9) * 3;
    if (!blocked(0)) near.push({ home: true, tree: false, e: 0, w: homeW, h: 6 + rnd(seed, 10) * (city ? 7 : 3), roof: rnd(seed, 11), lit: Array.from({ length: 9 }, (_, j) => rnd(seed, 20 + j) < 0.55), tone: rnd(seed, 12) });
    for (const side of [-1, 1]) {
      let x = homeW / 2 + 1;
      for (let i = 0; x < 260; i++) {
        const k = seed + side * 1000 + i, tree = rnd(k, 1) < (style === 'desert' ? 0.3 : 0.35);
        const w = tree ? 3 + rnd(k, 2) * 3 : (style === 'med' || style === 'desert' ? 6 : 7) + rnd(k, 3) * 6;
        const h = tree ? (style === 'snow' ? 7 : 4) + rnd(k, 4) * 5 : 5 + rnd(k, 5) * (city ? 9 : 5);
        const e = side * (x + w / 2);
        if (!blocked(e)) near.push({ tree, e, w, h, roof: rnd(k, 6), lit: Array.from({ length: 9 }, (_, j) => rnd(k, 10 + j) < 0.55), tone: rnd(k, 8) });
        x += w + 1 + rnd(k, 7) * (city ? 2 : 5);
      }
    }
    // further out: a skyline in big cities, scattered houses and trees elsewhere (to about 2 km)
    const far = [];
    for (const side of [-1, 1]) {
      let x = 270 + rnd(seed + side, 30) * 40;
      for (let i = 0; x < 2200; i++) {
        const k = seed + side * 5000 + i, w = city ? 18 + rnd(k, 1) * 30 : 8 + rnd(k, 1) * 8;
        const h = city ? 25 + rnd(k, 2) * rnd(k, 3) * 110 : 5 + rnd(k, 2) * 6;
        const e = side * (x + w / 2);
        if (!blocked(e)) far.push({ e, w, h, tree: !city && rnd(k, 4) < 0.4, lit: rnd(k, 5) });
        x += w + (city ? 4 + rnd(k, 6) * 14 : 25 + rnd(k, 6) * 60);
      }
    }
    const boats = coast ? Array.from({ length: 5 }, (_, i) => ({ e: seaSide * (seaFrom + 60 + i * 140 + rnd(seed, 40 + i) * 90), size: 8 + rnd(seed, 50 + i) * 10, sail: rnd(seed, 60 + i) < 0.6 })) : [];
    return { env, style, coast, seaSide, seaFrom, city, marks, near, far, boats, tower: towerKind ? { kind: towerKind, e: towerAt } : null };
  }

  // ---------- colours ----------
  const GROUND = { med: [150, 138, 108], north: [92, 124, 70], snow: [228, 232, 238], desert: [214, 186, 130] };
  function palette(style, night) {
    const n = night > 0.5;
    return {
      ground: n ? [30, 36, 52] : GROUND[style],
      wall: n ? 'rgb(30,36,54)' : style === 'med' ? 'rgb(238,234,224)' : style === 'desert' ? 'rgb(214,190,150)' : style === 'snow' ? 'rgb(96,70,52)' : 'rgb(170,98,74)',
      wall2: n ? 'rgb(26,30,46)' : style === 'med' ? 'rgb(224,218,204)' : style === 'desert' ? 'rgb(200,172,128)' : style === 'snow' ? 'rgb(78,58,44)' : 'rgb(150,86,66)',
      roof: n ? 'rgb(36,32,44)' : style === 'snow' ? 'rgb(240,244,248)' : style === 'north' ? 'rgb(120,58,48)' : 'rgb(170,88,64)',
      window: n ? 'rgb(255,214,140)' : 'rgb(110,140,170)', windowOff: n ? 'rgb(20,24,36)' : 'rgb(110,140,170)',
      leaf: n ? 'rgb(18,30,30)' : style === 'med' ? 'rgb(92,110,74)' : style === 'snow' ? 'rgb(36,70,52)' : 'rgb(58,104,64)',
      trunk: n ? 'rgb(16,22,28)' : 'rgb(86,66,48)',
      sea: n ? 'rgb(14,26,48)' : 'rgb(46,98,150)', seaLine: n ? 'rgba(120,150,200,.25)' : 'rgba(220,236,255,.45)',
      stone: n ? 'rgb(214,170,110)' : 'rgb(226,216,194)',            // monuments are lit at night
      stoneDark: n ? 'rgb(150,112,70)' : 'rgb(186,172,146)',
      rock: n ? 'rgb(40,40,48)' : 'rgb(172,150,118)',
      far: n ? 'rgb(24,30,46)' : 'rgb(150,160,176)',
      night: n,
    };
  }

  // ---------- drawing helpers (v: { x(e), y(u), m: pixels per metre, W, H, ctx }) ----------
  function poly(v, pts, fill) { const c = v.ctx; c.beginPath(); pts.forEach(([e, u], i) => (i ? c.lineTo : c.moveTo).call(c, v.x(e), v.y(u))); c.closePath(); c.fillStyle = fill; c.fill(); }
  function rect(v, e0, u0, e1, u1, fill) { v.ctx.fillStyle = fill; v.ctx.fillRect(v.x(e0), v.y(u1), v.x(e1) - v.x(e0), v.y(u0) - v.y(u1)); }
  function ellipse(v, e, u, rx, ry, fill, start = 0, end = Math.PI * 2) { const c = v.ctx; c.beginPath(); c.ellipse(v.x(e), v.y(u), Math.max(0.3, rx * v.m), Math.max(0.3, ry * v.m), 0, start, end); c.fillStyle = fill; c.fill(); }
  const visible = (v, e, w) => v.x(e + w / 2) > -40 && v.x(e - w / 2) < v.W + 40 && w * v.m > 0.6;

  function tree(v, t, style, p) {
    const e = t.e, w = t.w, h = t.h;
    if (style === 'desert') {                                   // a palm: thin curved trunk, a crown of fronds
      const c = v.ctx; c.strokeStyle = p.trunk; c.lineWidth = Math.max(0.8, w * 0.12 * v.m);
      c.beginPath(); c.moveTo(v.x(e), v.y(0)); c.quadraticCurveTo(v.x(e + w * 0.3), v.y(h * 0.5), v.x(e + w * 0.15), v.y(h)); c.stroke();
      c.strokeStyle = p.leaf; c.lineWidth = Math.max(0.8, w * 0.1 * v.m);
      for (let k = 0; k < 6; k++) { const a = Math.PI * (0.1 + k * 0.16); c.beginPath(); c.moveTo(v.x(e + w * 0.15), v.y(h)); c.quadraticCurveTo(v.x(e + w * 0.15 + Math.cos(a) * w * 0.6), v.y(h + Math.sin(a) * w * 0.4), v.x(e + w * 0.15 + Math.cos(a) * w), v.y(h - w * 0.25)); c.stroke(); }
      return;
    }
    if (style === 'snow' || (style === 'north' && t.tone > 0.6)) {   // a pine: stacked triangles (white tips in snow)
      rect(v, e - w * 0.06, 0, e + w * 0.06, h * 0.2, p.trunk);
      for (let k = 0; k < 3; k++) {
        const b = h * (0.15 + k * 0.25), top = h * (0.55 + k * 0.22), half = w * (0.5 - k * 0.12);
        poly(v, [[e - half, b], [e, top], [e + half, b]], p.leaf);
        if (style === 'snow' && !p.night) poly(v, [[e - half * 0.35, top - (top - b) * 0.35], [e, top], [e + half * 0.35, top - (top - b) * 0.35]], 'rgb(240,244,248)');
      }
      return;
    }
    if (style === 'med' && t.tone > 0.55) {                       // a cypress: tall and narrow
      rect(v, e - w * 0.05, 0, e + w * 0.05, h * 0.15, p.trunk);
      ellipse(v, e, h * 0.58, w * 0.22, h * 0.46, p.leaf);
      return;
    }
    rect(v, e - w * 0.08, 0, e + w * 0.08, h * 0.45, p.trunk);       // a round tree (an olive in the south: greyer)
    ellipse(v, e, h * 0.66, w * 0.5, h * 0.36, p.leaf);
  }

  function house(v, b, style, p) {
    const e0 = b.e - b.w / 2, e1 = b.e + b.w / 2;
    rect(v, e0, 0, e1, b.h, b.tone > 0.5 ? p.wall : p.wall2);
    const pitched = style === 'north' || style === 'snow' || (style === 'med' && b.roof > 0.75);
    if (pitched) poly(v, [[e0 - 0.4, b.h], [b.e, b.h + b.w * (style === 'snow' ? 0.45 : 0.32)], [e1 + 0.4, b.h]], p.roof);
    else rect(v, e0 - 0.2, b.h, e1 + 0.2, b.h + 0.35, p.wall2);                         // a flat roof's edge
    // windows: floors of three (only once they are a few pixels across)
    const floors = Math.max(1, Math.floor(b.h / 3.2)), ww = b.w / 7;
    if (ww * v.m > 1.4) {
      for (let f = 0; f < floors && f < 3; f++) for (let c = 0; c < 3; c++) {
        const on = b.lit[(f * 3 + c) % 9];
        const u0 = 1 + f * 3.1, e = e0 + ww * (1 + c * 2);
        if (b.home && f === 0 && c === 1) continue;                                      // the front door is here
        rect(v, e, u0, e + ww, u0 + 1.3, p.night ? (on ? p.window : p.windowOff) : style === 'med' && c === 1 && f === 0 ? 'rgb(64,110,170)' : p.window);
      }
    }
    // the house behind you has a front door, and you stand in front of it (lit at night)
    if (b.home) rect(v, b.e - 0.6, 0, b.e + 0.6, 2.2, p.night ? 'rgb(255,200,120)' : style === 'north' || style === 'snow' ? 'rgb(70,52,40)' : 'rgb(64,96,140)');
  }

  // ---------- the landmarks (metres; e0 = where it stands; u = 0 the ground) ----------
  const DRAW = {
    acropolis(v, e0, p) {
      poly(v, [[-180, 0], [-130, 38], [-96, 62], [100, 66], [126, 46], [185, 0]].map(([e, u]) => [e0 + e, u]), p.rock);
      const t = e0 + 10, base = 66;
      rect(v, t - 37, base, t + 37, base + 3, p.stoneDark);
      for (let k = 0; k < 8; k++) { const c = t - 33 + k * (66 / 7); rect(v, c - 1.1, base + 3, c + 1.1, base + 13.4, p.stone); }
      rect(v, t - 36, base + 13.4, t + 36, base + 16.2, p.stone);
      poly(v, [[t - 37, base + 16.2], [t, base + 21], [t + 37, base + 16.2]], p.stone);
    },
    hagia(v, e0, p) {
      rect(v, e0 - 42, 0, e0 + 42, 30, p.stone);
      ellipse(v, e0 - 22, 30, 16, 11, p.stone, Math.PI, 2 * Math.PI); ellipse(v, e0 + 22, 30, 16, 11, p.stone, Math.PI, 2 * Math.PI);
      rect(v, e0 - 16, 30, e0 + 16, 42, p.stoneDark);
      ellipse(v, e0, 42, 16, 13, p.stoneDark, Math.PI, 2 * Math.PI);
      for (const m of [-60, -48, 48, 60]) {
        rect(v, e0 + m - 1.3, 0, e0 + m + 1.3, 52, p.stone);
        rect(v, e0 + m - 2, 38, e0 + m + 2, 39.5, p.stone);
        poly(v, [[e0 + m - 1.6, 52], [e0 + m, 62], [e0 + m + 1.6, 52]], p.stoneDark);
      }
    },
    galata(v, e0, p) {
      rect(v, e0 - 9, 0, e0 + 9, 51, p.stone);
      rect(v, e0 - 10.5, 51, e0 + 10.5, 56, p.stoneDark);
      poly(v, [[e0 - 10, 56], [e0, 67], [e0 + 10, 56]], p.stoneDark);
      for (let f = 0; f < 4; f++) rect(v, e0 - 1.2, 10 + f * 10, e0 + 1.2, 14 + f * 10, p.night ? p.window : 'rgb(120,110,96)');
    },
    whitetower(v, e0, p) {
      rect(v, e0 - 11.5, 0, e0 + 11.5, 30, p.stone);
      for (let k = 0; k < 6; k++) rect(v, e0 - 11.5 + k * 4.2, 30, e0 - 9.5 + k * 4.2, 32, p.stone);
      rect(v, e0 - 4, 30, e0 + 4, 34, p.stoneDark);
    },
    eiffel(v, e0, p) {
      const col = p.night ? 'rgb(214,160,90)' : 'rgb(122,96,74)';
      poly(v, [[-62, 0], [-38, 0], [-16, 57], [-30, 57]].map(([e, u]) => [e0 + e, u]), col);
      poly(v, [[62, 0], [38, 0], [16, 57], [30, 57]].map(([e, u]) => [e0 + e, u]), col);
      rect(v, e0 - 33, 55, e0 + 33, 60, col);
      poly(v, [[-28, 60], [28, 60], [17, 113], [9, 190], [3, 274], [1, 300], [-1, 300], [-3, 274], [-9, 190], [-17, 113]].map(([e, u]) => [e0 + e, u]), col);
      rect(v, e0 - 18, 112, e0 + 18, 117, col); rect(v, e0 - 4.5, 273, e0 + 4.5, 278, col);
      const c = v.ctx; c.strokeStyle = col; c.lineWidth = Math.max(0.8, 1.6 * v.m);
      c.beginPath(); c.moveTo(v.x(e0), v.y(300)); c.lineTo(v.x(e0), v.y(330)); c.stroke();
      c.beginPath(); c.moveTo(v.x(e0 - 36), v.y(0)); c.quadraticCurveTo(v.x(e0), v.y(78), v.x(e0 + 36), v.y(0)); c.stroke();
    },
    bigben(v, e0, p) {
      rect(v, e0 - 240, 0, e0 - 14, 26, p.stoneDark);                          // the Houses of Parliament, beside it
      for (let k = 0; k < 9; k++) poly(v, [[e0 - 236 + k * 25, 26], [e0 - 234 + k * 25, 33], [e0 - 232 + k * 25, 26]], p.stoneDark);
      rect(v, e0 - 6, 0, e0 + 6, 55, p.stone);
      rect(v, e0 - 7.5, 55, e0 + 7.5, 69, p.stone);
      ellipse(v, e0, 62, 4, 4, p.night ? 'rgb(255,236,170)' : 'rgb(244,240,226)');
      rect(v, e0 - 5.5, 69, e0 + 5.5, 78, p.stoneDark);
      poly(v, [[e0 - 6, 78], [e0, 96], [e0 + 6, 78]], p.stoneDark);
    },
    colosseum(v, e0, p) {
      poly(v, [[-95, 0], [95, 0], [95, 48], [10, 48], [-20, 40], [-50, 30], [-75, 34], [-95, 26]].map(([e, u]) => [e0 + e, u]), p.stone);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 16; k++) {
        const e = e0 - 90 + k * 11.6, u = 3 + row * 14;
        if (u + 9 > (e < e0 + 10 ? 26 + (e - e0 + 95) * 0.15 : 46)) continue;
        rect(v, e, u, e + 6, u + 8, p.night ? 'rgb(120,80,50)' : 'rgb(150,130,104)');
      }
    },
    pyramids(v, e0, p) {
      const side = (cx, base, h) => { poly(v, [[cx - base / 2, 0], [cx, h], [cx + base / 2, 0]], p.night ? 'rgb(150,112,70)' : 'rgb(214,182,122)'); poly(v, [[cx, h], [cx + base / 2, 0], [cx + base * 0.15, 0]], p.night ? 'rgb(110,82,52)' : 'rgb(184,150,96)'); };
      side(e0 + 470, 103, 65); side(e0 + 250, 215, 136); side(e0, 230, 139);
    },
    liberty(v, e0, p) {
      const col = p.night ? 'rgb(150,200,170)' : 'rgb(108,168,148)';
      poly(v, [[-44, 0], [44, 0], [34, 12], [-34, 12]].map(([e, u]) => [e0 + e, u]), p.stoneDark);
      poly(v, [[-15, 12], [15, 12], [12, 47], [-12, 47]].map(([e, u]) => [e0 + e, u]), p.stone);
      poly(v, [[-6, 47], [6, 47], [4, 78], [-4, 78]].map(([e, u]) => [e0 + e, u]), col);
      ellipse(v, e0, 81, 2.4, 2.8, col);
      for (let k = -3; k <= 3; k++) poly(v, [[e0 + k * 0.9 - 0.4, 82.5], [e0 + k * 1.6, 86], [e0 + k * 0.9 + 0.4, 82.5]], col);
      poly(v, [[2.5, 76], [4.5, 76], [7, 91], [5.5, 91]].map(([e, u]) => [e0 + e, u]), col);
      ellipse(v, e0 + 6.3, 93, 1.4, 2.2, p.night ? 'rgb(255,214,120)' : 'rgb(232,180,80)');
      rect(v, e0 - 5.5, 66, e0 - 3, 72, col);
    },
    belfry(v, e0, p) {
      rect(v, e0 - 70, 0, e0 - 10, 18, p.stoneDark);                          // the Cloth Hall beside it
      poly(v, [[e0 - 70, 18], [e0 - 40, 26], [e0 - 10, 18]], p.roof);
      rect(v, e0 - 8, 0, e0 + 8, 60, p.stone);
      for (const t of [-8, 8]) { rect(v, e0 + t - 2, 60, e0 + t + 2, 70, p.stone); poly(v, [[e0 + t - 2.2, 70], [e0 + t, 76], [e0 + t + 2.2, 70]], p.stoneDark); }
      rect(v, e0 - 5, 60, e0 + 5, 72, p.stone);
      poly(v, [[e0 - 5.5, 72], [e0, 91], [e0 + 5.5, 72]], p.night ? 'rgb(90,120,110)' : 'rgb(80,112,100)');
    },
    brussels(v, e0, p) {
      rect(v, e0 - 62, 0, e0 + 62, 30, p.stone);
      poly(v, [[e0 - 62, 30], [e0 - 50, 40], [e0 + 50, 40], [e0 + 62, 30]], p.stoneDark);
      for (let k = 0; k < 12; k++) rect(v, e0 - 58 + k * 10, 8, e0 - 55 + k * 10, 22, p.night ? p.window : 'rgb(150,140,120)');
      rect(v, e0 - 5, 30, e0 + 5, 66, p.stone);
      poly(v, [[e0 - 4.5, 66], [e0 - 2.5, 84], [e0, 96], [e0 + 2.5, 84], [e0 + 4.5, 66]], p.stoneDark);
    },
  };
  const HEIGHT = { acropolis: 87, hagia: 62, galata: 67, whitetower: 34, eiffel: 330, bigben: 96, colosseum: 48, pyramids: 139, liberty: 93, belfry: 91, brussels: 96 };

  // Draws everything on the ground. fade: 0..1 (it fades out as the camera pulls far back).
  function draw(v, scene, night, fade) {
    if (fade <= 0) return;
    const p = palette(scene.style, night), c = v.ctx;
    c.save(); c.globalAlpha = fade;
    // the sea, on its side, out to the horizon
    if (scene.coast) {
      const a = v.x(scene.seaSide * scene.seaFrom), b = scene.seaSide > 0 ? v.W + 50 : -50;
      c.fillStyle = p.sea; c.fillRect(Math.min(a, b), v.y(0) - 0.5, Math.abs(b - a), v.H);
      c.strokeStyle = p.seaLine; c.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const y = v.y(0) + 4 + k * 9; c.beginPath(); c.moveTo(Math.min(a, b), y); c.lineTo(Math.max(a, b), y); c.stroke(); }
      for (const bt of scene.boats) {
        if (!visible(v, bt.e, bt.size)) continue;
        poly(v, [[bt.e - bt.size / 2, 0.6], [bt.e + bt.size / 2, 0.6], [bt.e + bt.size * 0.35, -0.6], [bt.e - bt.size * 0.35, -0.6]], p.night ? 'rgb(40,44,60)' : 'rgb(236,236,232)');
        if (bt.sail) poly(v, [[bt.e - bt.size * 0.05, 0.6], [bt.e - bt.size * 0.05, bt.size * 0.9], [bt.e + bt.size * 0.4, 0.8]], p.night ? 'rgb(60,66,84)' : 'rgb(250,250,246)');
      }
    }
    // far off: skyline or scattered houses and trees
    for (const f of scene.far) {
      if (!visible(v, f.e, f.w)) continue;
      if (f.tree) { tree(v, { e: f.e, w: f.w * 0.6, h: f.h * 1.2, tone: f.lit }, scene.style, p); continue; }
      rect(v, f.e - f.w / 2, 0, f.e + f.w / 2, f.h, p.far);
      if (p.night && scene.city && f.w * v.m > 2) for (let k = 0; k < 6; k++) if (rnd(f.e, k) < 0.5) rect(v, f.e - f.w / 2 + f.w * rnd(f.e, k + 9) * 0.8, f.h * rnd(f.e, k + 19) * 0.9, f.e - f.w / 2 + f.w * rnd(f.e, k + 9) * 0.8 + f.w * 0.08, f.h * rnd(f.e, k + 19) * 0.9 + 1.5, p.window);
    }
    // the landmarks, with their names while they are big enough to see
    for (const m of scene.marks) {
      const h = HEIGHT[m.id], w = FOOT[m.id];
      if (!visible(v, m.at, w)) continue;
      DRAW[m.id](v, m.at, p);
      if (h * v.m > 12) {
        c.font = '600 12px "Instrument Sans", system-ui, sans-serif'; c.textAlign = 'center';
        if (v.label) v.label(m.name, v.x(m.at), v.y(0) + 34, 0.9 * fade, 12, 5);           // the film places names so none covers another
        else { c.fillStyle = 'rgba(233,237,246,.9)'; c.fillText(m.name, v.x(m.at), v.y(0) + 34); }    // a line below the town's name
      }
    }
    // the village tower
    if (scene.tower && visible(v, scene.tower.e, 30)) {
      const e0 = scene.tower.e, t = scene.tower.kind;
      rect(v, e0 + 3, 0, e0 + 25, 9, p.wall2); poly(v, [[e0 + 2.5, 9], [e0 + 14, 14], [e0 + 25.5, 9]], p.roof);    // the hall or nave beside it
      if (t === 'spire') { rect(v, e0 - 3, 0, e0 + 3, 26, p.wall); poly(v, [[e0 - 3.5, 26], [e0, 44], [e0 + 3.5, 26]], p.night ? 'rgb(40,46,60)' : 'rgb(70,78,92)'); }
      else { rect(v, e0 - 3, 0, e0 + 3, 17, p.wall); rect(v, e0 - 2, 12, e0 + 2, 15.5, p.night ? 'rgb(20,24,36)' : 'rgb(90,80,70)'); poly(v, [[e0 - 3.5, 17], [e0, 21], [e0 + 3.5, 17]], p.roof); }
    }
    // your street
    for (const b of scene.near) {
      if (!visible(v, b.e, b.w)) continue;
      if (b.tree) tree(v, b, scene.style, p); else house(v, b, scene.style, p);
    }
    c.restore();
  }

  // How high the camera should be for the landmarks to be whole on a phone screen (km), for a short pause there
  const bestHeight = scene => scene.marks.length ? Math.max(...scene.marks.map(m => (Math.max(Math.abs(m.at + SPAN[m.id][0]), Math.abs(m.at + SPAN[m.id][1])) + 10) / 0.8, ...scene.marks.map(m => HEIGHT[m.id] * 2.2))) / 1000 : 0;
  root.ZoomScenery = { make, draw, palette, bestHeight, LANDMARKS, GROUND, surroundings };
})(this);
