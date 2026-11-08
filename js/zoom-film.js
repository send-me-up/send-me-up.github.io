// Send Me Up — the trip film as one continuous zoom-out, from your front door to the galaxies (8 Nov 2026).
// Arman's direction, over three test versions: start with our person, who becomes a beam of light as the camera pulls back;
// the Earth and the Moon should look like the Earth and the Moon; each place starts differently (landmarks, scenery);
// the zoom starts slowly. "Build the whole thing": so here the zoom carries on past the Moon to the planets, the stars and the galaxies.
//
// Everything is where it really was at the moment you leave. At light speed the sky hardly changes during the trip,
// so it is "frozen" at that moment. Positions are in km east / north / up from you:
// - satellites: CelesTrak data with satellite.js (js/satellites.js);
// - Sun, Moon, planets, their orbits: Astronomy Engine; stars: the HYG list (named stars); galaxies: the card's galaxy (OpenNGC)
//   and a few famous neighbours (Andromeda, Triangulum, the Magellanic Clouds), at their catalogue directions and distances;
// - our galaxy, the Milky Way, is a simple sketch (spiral arms round the real direction of its centre and its real tilt).
// Pictures: Earth map and planet pictures from Solar System Scope (CC BY 4.0), based on NASA data.
// Sizes are not to scale far out: small things get a minimum size so they stay visible (said in the captions).
(function (root) {
  'use strict';
  const DEG = Math.PI / 180, KM_AU = 149597870.7, KM_LY = 9.4607e12, LIGHT_KMS = 299792.458, MOON_R = 1737.4, GEO_KM = 35786;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unitRaDec = (ra, dec) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = (x, d = 0) => x.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const YOU = [127, 214, 255];

  // ---------- pictures (loaded once, in the background, when the page opens) ----------
  const assets = { earthMap: null, sprites: {}, ready: null };
  function loadAssets() {
    if (assets.ready) return assets.ready;
    const img = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
    assets.ready = (async () => {
      const names = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'saturn-rings', 'uranus', 'neptune'];
      const got = await Promise.allSettled(names.map(nm => img(`img/planets/${nm}.webp`)));
      got.forEach((r, i) => { if (r.status === 'fulfilled') assets.sprites[names[i]] = r.value; });
      try {
        const e = await img('img/maps/earth-2k.jpg'), c = document.createElement('canvas');
        c.width = e.width; c.height = e.height; const g = c.getContext('2d'); g.drawImage(e, 0, 0);
        assets.earthMap = g.getImageData(0, 0, c.width, c.height);
      } catch (err) { /* opened as a file, or no connection: the Earth is then drawn in plain colours */ }
      return assets;
    })();
    return assets.ready;
  }

  // ---------- one trip ----------
  // o: { lat, lon, placeName, population, when, card, starRows, cloud, pass }
  function create(o) {
    const A = assets, time = Astronomy.MakeTime(o.when), observer = new Astronomy.Observer(o.lat, o.lon, 0);
    const rot = Astronomy.Rotation_EQJ_HOR(time, observer);
    const toEnu = v => { const r = Astronomy.RotateVector(rot, new Astronomy.Vector(v[0], v[1], v[2], time)); return [-r.y, r.x, r.z]; };  // horizontal: x north, y west, z up
    function enuOf(body) {
      const eq = Astronomy.Equator(body, time, observer, true, true), h = Astronomy.Horizon(time, observer, eq.ra, eq.dec, null);
      const d = eq.dist * KM_AU, az = h.azimuth * DEG, al = h.altitude * DEG;
      return [d * Math.cos(al) * Math.sin(az), d * Math.cos(al) * Math.cos(az), d * Math.sin(al)];
    }
    const sunPos = enuOf('Sun'), sunDir = norm(sunPos), sunAlt = Math.asin(sunDir[2]) / DEG;
    const moon = enuOf('Moon'), moonDist = Math.hypot(...moon);
    const day = smooth(-8, 6, sunAlt), night = 1 - day;
    const cloud = o.cloud || null, pass = o.pass || null;
    const RHO = cloud ? Math.hypot(...cloud.earthCentre) : 6371, CENTRE = [0, 0, -RHO];
    const phi = o.lat * DEG, lam = o.lon * DEG;
    const AX_E = [-Math.sin(lam), Math.cos(lam), 0];
    const AX_N = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];
    const AX_U = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];

    // the Moon's path round the Earth, 15 days either side
    const moonPath = [];
    for (let d = -15; d <= 15.01; d += 0.25) {
      const g = Astronomy.GeoMoon(Astronomy.MakeTime(new Date(+o.when + d * 864e5)));
      const e = toEnu([g.x, g.y, g.z]); moonPath.push([e[0] * KM_AU, e[1] * KM_AU, e[2] * KM_AU - RHO]);
    }
    // the planets where they are, and their orbits (one full turn each), seen from the Earth
    const PLANETS = [['Mercury', 88, 3.5], ['Venus', 225, 5], ['Mars', 687, 4], ['Jupiter', 4333, 9], ['Saturn', 10759, 8], ['Uranus', 30687, 6.5], ['Neptune', 60190, 6.5]];
    const earthHelio = Astronomy.HelioVector('Earth', time);
    const helioToEnu = v => { const e = toEnu([v.x - earthHelio.x, v.y - earthHelio.y, v.z - earthHelio.z]); return e.map(x => x * KM_AU); };
    const planets = PLANETS.map(([name, period, minR]) => {
      const orbit = [];
      for (let k = 0; k <= 120; k++) orbit.push(helioToEnu(Astronomy.HelioVector(name, Astronomy.MakeTime(new Date(+o.when + (k / 120) * period * 864e5)))));
      return { name, pos: enuOf(name), orbit, minR };
    });
    const earthOrbit = [];
    for (let k = 0; k <= 120; k++) earthOrbit.push(helioToEnu(Astronomy.HelioVector('Earth', Astronomy.MakeTime(new Date(+o.when + (k / 120) * 365.25 * 864e5)))));
    // belts, in the plane of the planets (the ecliptic): asteroids 2.2–3.2 AU, the Kuiper Belt 30–50 AU; the Oort Cloud all round, 2,000–100,000 AU
    const ecl = Astronomy.Rotation_ECL_EQJ();
    const fromEcl = (x, y, z) => { const v = Astronomy.RotateVector(ecl, new Astronomy.Vector(x, y, z, time)); return helioToEnu(v); };
    const asteroids = Array.from({ length: 700 }, (_, i) => { const r = 2.2 + rnd(i, 1) * 1.0, a = rnd(i, 2) * 2 * Math.PI; return fromEcl(r * Math.cos(a), r * Math.sin(a), (rnd(i, 3) - 0.5) * 0.3); });
    const kuiper = Array.from({ length: 900 }, (_, i) => { const r = 30 + rnd(i, 4) * 20, a = rnd(i, 5) * 2 * Math.PI; return fromEcl(r * Math.cos(a), r * Math.sin(a), (rnd(i, 6) - 0.5) * 6); });
    const oort = Array.from({ length: 1400 }, (_, i) => { const r = 2000 + Math.pow(rnd(i, 7), 0.6) * 98000, z = rnd(i, 8) * 2 - 1, a = rnd(i, 9) * 2 * Math.PI, s = Math.sqrt(1 - z * z); return fromEcl(r * s * Math.cos(a), r * s * Math.sin(a), r * z); });
    // the named stars
    const stars = (o.starRows || []).map(r => ({ pos: toEnu(unitRaDec(r[0], r[1])).map(x => x * (r[3] || 1000) * KM_LY), mag: r[2], label: r[4], spect: r[7] || '', dist: r[3] }));
    const cardStar = o.card.stops.find(s => s.kind === 'star');
    // our galaxy: a sketch of spiral arms round its real centre (Sagittarius A*: RA 266.405°, Dec −28.936°, about 26,000 light years away)
    // in its real tilt (north galactic pole: RA 192.859°, Dec 27.128°)
    const gz = norm(unitRaDec(192.859, 27.128)), c0 = unitRaDec(266.405, -28.936);
    const gx = norm(c0.map((v, i) => v - dot3(c0, gz) * gz[i])), gy = cross(gz, gx);
    const MW_CENTRE_LY = 26000, mwCentre = toEnu(gx).map(v => v * MW_CENTRE_LY * KM_LY);
    const milkyWay = [];
    for (let i = 0; i < 5200; i++) {
      const bulge = i < 900, arm = i % 4, pitch = 12 * DEG;
      let r, a;
      if (bulge) { r = Math.pow(rnd(i, 11), 1.6) * 6000; a = rnd(i, 12) * 2 * Math.PI; }
      else { r = 3000 + Math.pow(rnd(i, 13), 0.8) * 47000; a = Math.log(r / 3000) / Math.tan(pitch) + arm * Math.PI / 2 + (rnd(i, 14) - 0.5) * 0.5; }
      const x = r * Math.cos(a) + (rnd(i, 15) - 0.5) * r * 0.08, y = r * Math.sin(a) + (rnd(i, 16) - 0.5) * r * 0.08, z = (rnd(i, 17) - 0.5) * (bulge ? 3000 : 700);
      // galactic frame (x towards the centre from the Sun): the Sun sits 26,000 light years from the centre
      const eq = [0, 1, 2].map(k => (-x) * gx[k] + y * gy[k] + z * gz[k]);
      milkyWay.push({ pos: toEnu(eq).map(v => v * KM_LY).map((v, k) => v + mwCentre[k]), bulge, b: 0.4 + rnd(i, 18) * 0.6 });
    }
    // galaxies: the card's galaxy and a few famous neighbours (directions and distances: catalogue values)
    const NEIGHBOURS = [
      { name: 'The Andromeda Galaxy', ra: 10.6847, dec: 41.2690, mly: 2.5, a: 1.6, b: 0.5, pa: 35, type: 'S' },
      { name: 'The Triangulum Galaxy', ra: 23.4621, dec: 30.6599, mly: 2.73, a: 0.6, b: 0.4, pa: 23, type: 'S' },
      { name: 'The Large Magellanic Cloud', ra: 80.894, dec: -69.756, mly: 0.16, a: 5.4, b: 4.6, pa: 170, type: 'I' },
      { name: 'The Small Magellanic Cloud', ra: 13.187, dec: -72.828, mly: 0.2, a: 2.6, b: 1.5, pa: 45, type: 'I' },
    ];
    const galStop = o.card.stops.find(s => s.kind === 'galaxy');
    const galaxies = NEIGHBOURS.map(g => ({ ...g, card: false }));
    if (galStop && galStop.galaxy && galStop.galaxy.distMly != null) {
      const g = galStop.galaxy;
      if (!(g.messier === 'M31' || g.messier === 'M33')) galaxies.push({ type: /^(S0|E)/.test(g.hubble || '') ? 'E' : /^S/.test(g.hubble || '') ? 'S' : /^I/.test(g.hubble || '') ? 'I' : 'S', name: galStop.title, ra: g.raDeg, dec: g.decDeg, mly: g.distMly, a: Math.max(g.a, 0.02), b: Math.max(g.b, 0.01), pa: g.pa, card: true, hit: galStop.status === 'hit' });
      else galaxies.find(x => x.name === (g.messier === 'M31' ? 'The Andromeda Galaxy' : 'The Triangulum Galaxy')).card = true;
    }
    for (const g of galaxies) { g.pos = toEnu(unitRaDec(g.ra, g.dec)).map(v => v * g.mly * 1e6 * KM_LY); g.dist = g.mly * 1e6 * KM_LY; g.size = g.dist * Math.tan(g.a * DEG); }

    // the scene on the ground (landmarks or scenery) and its colours
    const scene = ZoomScenery.make(o.lat, o.lon, o.population || 0, A.earthMap);
    const nearGround = ZoomScenery.palette(scene.style, night).ground;

    // ---------- the moments of the trip: the card's stops, in its own words, plus the layers of the air and a few views ----------
    const tropo = Math.round(Math.abs(o.lat) <= 50 ? 19 - (Math.abs(o.lat) / 50) * 10 : 9 - ((Math.abs(o.lat) - 50) / 40) * 3);
    const landmarkLine = scene.marks.length ? ` Next to you: ${scene.marks.map(m => m.name.replace(/^The /, 'the ')).join(' and ')}.` : '';
    const events = [
      { h: 0, title: `Lift-off from ${o.placeName}`, line: 'Straight up, at the speed of light. The camera pulls back as you go.' + landmarkLine },
      { h: 0.6, title: 'The troposphere', when: `up to about ${tropo} km here`, line: 'Almost all weather happens in this layer. It is thicker near the equator and thinner near the poles.' },
      { h: tropo, title: 'The stratosphere', when: `${tropo} to 50 km`, line: 'About 90% of all ozone is here: the ozone layer, which blocks most of the Sun’s harmful ultraviolet light.' },
      { h: 50, title: 'The mesosphere', when: '50 to 85 km', line: 'Shooting stars burn up here, leaving their bright trails.' },
      { h: 100, title: 'The edge of space', when: '100 km', line: 'This is where space is usually said to begin. Behind you, the air is a thin blue line around the Earth.' },
      { h: 140, title: 'The thermosphere', when: '85 to 600 km', line: 'The Space Station flies here, about 400 km up. Near the poles, auroras glow at these heights.' },
    ];
    const marks = new Map();
    const stops = o.card.stops.filter(s => s.kind !== 'end');
    for (const s of stops) {
      let h = s.t * LIGHT_KMS;
      if (s.status === 'note') h = (s.kind === 'iss' || s.kind === 'satellite') ? 450 : s.kind === 'moon' ? moonDist * 0.8 : h;
      if (s.kind === 'star' && !(s.t < 1e29)) h = 1000 * KM_LY;
      if (s.kind === 'galaxy' && !(s.t < 1e39)) h = 5e6 * KM_LY;
      events.push({ h, title: s.title, line: s.line, when: s.when, hit: s.status === 'hit', kind: s.kind, stop: s });
    }
    if (pass && cloud) {
      if (pass.closest && pass.closest.norad !== SendMeUpSatellites.ISS) marks.set(pass.closest.norad, { label: SendMeUpCard.satelliteName(pass.closest.name), colour: 'rgb(255,216,77)', h: Math.max(pass.closest.heightKm, 300) });
      if (pass.iss) marks.set(pass.iss.norad, { label: 'Space Station', colour: 'rgb(127,214,255)', h: Math.max(pass.iss.heightKm, 300), station: true });
      for (const e of events) if (e.kind === 'satellite') e.mark = pass.closest && pass.closest.norad; else if (e.kind === 'iss') e.mark = pass.iss && pass.iss.norad;
      events.push({ h: 3000, title: `${n(cloud.count)} satellites`, line: 'Each dot is a real satellite, where it was the moment you left.' });
      events.push({ h: GEO_KM, title: 'The ring of satellites', line: '35,786 km up, a satellite goes round exactly as fast as the Earth turns, so it seems to hang over one spot.' });
    }
    const endStop = o.card.stops[o.card.stops.length - 1];
    const stopped = endStop.title === 'Trip over';
    const lastH = Math.max(...events.map(e => e.h));
    const END = stopped ? lastH * 1.15 : Math.max(lastH * 1.8, 2e5 * KM_LY);
    if (!stopped) {
      events.push({ h: 4 * KM_AU, title: 'The Sun and its planets', line: 'Each planet where it really is right now, on its orbit. The planets are drawn much larger than real.' });
      events.push({ h: 6 * KM_LY, title: 'The nearest stars', line: 'Rigil Kentaurus and Toliman, the two bright stars of Alpha Centauri, are about 4.3 light years from the Sun: the nearest stars you can see.' });
      if (!galaxies.some(g => g.card && g.name === 'The Large Magellanic Cloud')) events.push({ h: 1.6e5 * KM_LY * 1.3, title: 'The Large Magellanic Cloud', line: 'A small galaxy that goes round ours, about 160,000 light years away. From here on, galaxies are drawn much larger than real.' });
      if (!galaxies.some(g => g.card && g.name === 'The Andromeda Galaxy')) events.push({ h: 2.5e6 * KM_LY * 1.3, title: 'The Andromeda Galaxy', line: 'Our big neighbour, about 2.5 million light years away, and slowly coming closer to the Milky Way.' });
      // between our neighbours and the card's galaxy, if that is far beyond them
      const farGal = galaxies.filter(g => g.card).map(g => g.dist)[0];
      if (farGal && farGal > 100 * 2.5e6 * KM_LY) events.push({ h: Math.sqrt(2.5e6 * KM_LY * 1.3 * farGal), title: 'Galaxies everywhere', line: 'Out here there are galaxies in every direction, millions of light years apart, most with billions of stars.' });
      events.push({ h: 9e4 * KM_LY, title: 'Our galaxy, the Milky Way', line: 'About 100,000 light years across; the Sun is one of its hundreds of billions of stars. This is a simple sketch of its spiral arms, in its real tilt.' });
    }
    events.push({ h: END * 0.93, title: endStop.title, line: endStop.line, end: true });
    const shown = events.filter(e => e.h <= END).sort((a, b) => a.h - b.h);

    // ---------- the view: from the side, tilting (up to 32°) from about 10 km up, so your region comes into view ----------
    // Past the Moon the camera also turns, slowly, until it looks at the planets' plane (the ecliptic) from 12° above
    // (Arman, 8 Nov: "on the solar system screen, tilt it about 10-15 degrees"), so the orbits show as flat ovals, not a line.
    // The beam always stays upright on the screen: the camera only turns round it (yaw) and tips forward or back (a).
    // Of all the ways to get exactly 12°, the one with the smallest real turn is used; the zoom slows while it turns (below).
    const TILT = 32 * DEG, ECL_VIEW = 12 * DEG, TURN_FROM = 6.1, TURN_TO = 8.7;   // the turn: from 1.3 million to 500 million km (powers of ten)
    const axes = (yaw, a) => {
      const F = [Math.sin(yaw), Math.cos(yaw), 0];
      return { R: [Math.cos(yaw), -Math.sin(yaw), 0], U: [Math.sin(a) * F[0], Math.sin(a) * F[1], Math.cos(a)], D: [-Math.cos(a) * F[0], -Math.cos(a) * F[1], Math.sin(a)] };
    };
    const poleV = Astronomy.RotateVector(ecl, new Astronomy.Vector(0, 0, 1, time));
    let eclN = toEnu([poleV.x, poleV.y, poleV.z]); if (eclN[2] < 0) eclN = eclN.map(v => -v);
    // D·n = sin a·n_z − cos a·m·cos(yaw − φn) = ±sin 12°, for each tip a from 8° to 60°
    let toPlanets = { yaw: 0, a: TILT, cost: Infinity };
    {
      const m = Math.hypot(eclN[0], eclN[1]), phiN = Math.atan2(eclN[0], eclN[1]), V0 = axes(0, TILT);
      const turn = (yaw, a) => { const V = axes(yaw, a); return Math.acos(Math.max(-1, Math.min(1, (dot3(V.R, V0.R) + dot3(V.U, V0.U) + dot3(V.D, V0.D) - 1) / 2))); };
      for (let deg = 8; deg <= 60.001; deg += 0.5) {
        const a = deg * DEG;
        for (const s of [Math.sin(ECL_VIEW), -Math.sin(ECL_VIEW)]) {
          const c = m < 1e-9 ? NaN : (Math.sin(a) * eclN[2] - s) / (Math.cos(a) * m);
          const yaws = m < 1e-9 ? (Math.abs(Math.sin(a) * eclN[2] - s) < 2e-3 ? [0] : []) : Math.abs(c) <= 1 ? [phiN + Math.acos(c), phiN - Math.acos(c)] : [];
          for (let yaw of yaws) {
            yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
            const cost = turn(yaw, a);
            if (cost < toPlanets.cost) toPlanets = { yaw, a, cost };
          }
        }
      }
      if (!(toPlanets.cost < Infinity)) toPlanets = { yaw: 0, a: TILT, cost: 0 };
    }
    function view(h) {
      const L = Math.log10(Math.max(h, 1e-4)), k = smooth(TURN_FROM, TURN_TO, L);
      return axes(toPlanets.yaw * k, TILT * smooth(1.0, 3.4, L) + (toPlanets.a - TILT) * k);
    }

    // time ↔ height: a steady zoom on a "powers of ten" scale from 1 metre; it slows round each moment; a slow start;
    // and up to 2 seconds slower while the camera turns towards the planets (more for a bigger turn), so the turn stays calm
    const H0 = 0.001, L0 = Math.log10(H0), L1 = Math.log10(END), PER_DECADE = 1.1, DWELL = 1.5, W = 0.08;
    const LANDMARK_H = ZoomScenery.bestHeight(scene);
    const bumps = shown.filter(e => e.h > 0).map(e => Math.log10(e.h)).concat(scene.marks.length ? [Math.log10(LANDMARK_H)] : []);
    const TURN_DWELL = 2.0 * Math.min(1, toPlanets.cost / (90 * DEG)), TURN_MID = (TURN_FROM + TURN_TO) / 2, TURN_W = 0.6;
    const cost = L => PER_DECADE + bumps.reduce((s, b) => s + DWELL / (W * Math.sqrt(Math.PI)) * Math.exp(-(((L - b) / W) ** 2)), 0)
      + TURN_DWELL / (TURN_W * Math.sqrt(Math.PI)) * Math.exp(-(((L - TURN_MID) / TURN_W) ** 2));
    const table = [[L0, 0]];
    for (let L = L0; L < L1; L += 0.003) table.push([L + 0.003, table[table.length - 1][1] + cost(L + 0.0015) * 0.003]);
    // WAIT_S: since 8 Nov the film waits for the Launch button before its clock starts, so only a short beat after the press
    const RUN_S = table[table.length - 1][1], WAIT_S = 0.4, EASE_S = 3.5, HOLD_S = 3.2;
    const warp = u => u <= 0 ? 0 : u < EASE_S ? u * u / (2 * EASE_S) : u - EASE_S / 2;
    const unwarp = tau => tau < EASE_S / 2 ? Math.sqrt(2 * EASE_S * tau) : tau + EASE_S / 2;
    function heightAt(t) {            // t: seconds from Launch (the first WAIT_S you still stand on the ground)
      const tau = warp(t - WAIT_S);
      if (tau <= 0) return 0;
      if (tau >= RUN_S) return END;
      let lo = 0, hi = table.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid][1] < tau) lo = mid; else hi = mid; }
      const [La, ta] = table[lo], [Lb, tb] = table[hi];
      return 10 ** (La + (Lb - La) * (tau - ta) / (tb - ta)) - H0;
    }
    function timeAt(h) {              // seconds from the start of the film when you reach height h (km)
      const L = Math.log10(Math.max(h + H0, H0));
      const row = table.find(r => r[0] >= L) || table[table.length - 1];
      return WAIT_S + unwarp(row[1]);
    }
    shown.forEach(e => { e.t = e.h <= 0 ? 0 : Math.max(0.5, timeAt(e.h) - 0.7); });
    const duration = WAIT_S + unwarp(RUN_S) + HOLD_S;

    // the things the camera brings into view as you near them: [distance, centre, half-size]
    const focus = [[moonDist, moon, MOON_R * 12], [KM_AU, sunPos, 0.05 * KM_AU]];
    const planetStop = o.card.stops.find(s => s.kind === 'planet');
    if (planetStop) { const p = planets.find(x => x.name === planetStop.title); if (p) focus.push([Math.hypot(...p.pos), p.pos, 0.3 * KM_AU]); }
    focus.push([30 * KM_AU, sunPos, 31 * KM_AU]);
    if (cardStar) { const s = stars.find(x => x.label === cardStar.title); if (s) focus.push([Math.hypot(...s.pos), s.pos, 2 * KM_LY]); }
    focus.push([MW_CENTRE_LY * KM_LY, mwCentre, 52000 * KM_LY]);
    for (const g of galaxies.filter(x => x.card)) focus.push([g.dist, g.pos, Math.max(g.size * 2, 2e4 * KM_LY)]);
    for (const g of galaxies) if (!g.card && shown.some(e => e.title === g.name)) focus.push([g.dist, g.pos, Math.max(g.size * 3, 3e4 * KM_LY)]);   // the neighbours that have a moment of their own
    const focusShown = focus.filter(f => f[0] < END * 1.2);
    // how big the Earth is drawn: real size, but from the Moon's distance never under about 40 pixels (radius), and in the
    // planets' part never under 5; the Moon is enlarged by the same amount (they stay true in size to each other)
    function earthPx(cam, h, Wpx) {
      const enlarge = Math.min(42, Wpx * 0.11) * smooth(4e4, 1.5e5, h) * (1 - smooth(4e6, 6e7, h)), planetsMin = 5 * smooth(3e7, 1e8, h) * (1 - smooth(3e10, 1e11, h));
      return Math.max(RHO * cam.s, enlarge, planetsMin);
    }
    function camera(h, Wpx, Hpx) {
      const V = view(h), hh = Math.max(h, 0.022), yYou = h * V.U[2];
      let box = [-0.3 * hh, 0.3 * hh, -0.45 * hh, yYou + 0.7 * hh];
      const grow = (b, p, w) => [b[0] + (Math.min(b[0], p[0]) - b[0]) * w, b[1] + (Math.max(b[1], p[1]) - b[1]) * w, b[2] + (Math.min(b[2], p[2]) - b[2]) * w, b[3] + (Math.max(b[3], p[3]) - b[3]) * w];
      const L = Math.log10(Math.max(h, 1e-4)), cy = dot3(CENTRE, V.U);
      box = grow(box, [-RHO, RHO, cy - RHO, cy + RHO], smooth(3.3, 3.9, L) * (1 - smooth(6, 7.5, L)));
      for (const [d, p, r] of focusShown) {
        const w = smooth(0.08, 0.35, h / d) * (1 - smooth(6, 30, h / d));
        if (w > 0) { const x = dot3(p, V.R), y = dot3(p, V.U); box = grow(box, [x - r, x + r, y - r, y + r], w); }
      }
      const topPad = 112, bottomPad = Wpx < 600 ? 160 : 90, avail = Math.max(120, Hpx - topPad - bottomPad);
      const bw = (box[1] - box[0]) * 1.12, bh = (box[3] - box[2]) * 1.12, s = Math.min(Wpx / bw, avail / bh);
      return { V, s, x0: (box[0] + box[1]) / 2, y0: (box[2] + box[3]) / 2 + (topPad + avail / 2 - Hpx / 2) / s };
    }

    // ---------- drawing ----------
    const bgStars = Array.from({ length: 260 }, (_, i) => [rnd(i, 1), rnd(i, 2), 0.4 + rnd(i, 3) * 1.2, 0.25 + rnd(i, 4) * 0.6]);
    const off = document.createElement('canvas'), offCtx = off.getContext('2d');
    function sampleMap(la, lo) {
      const M = A.earthMap; if (!M) return [70, 110, 160];
      const fx = (lo / (2 * Math.PI) + 0.5) * M.width - 0.5, fy = (0.5 - la / Math.PI) * M.height - 0.5;
      const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(M.height - 2, Math.floor(fy))), tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
      const xa = ((x0 % M.width) + M.width) % M.width, xb = (xa + 1) % M.width, d = M.data;
      const i00 = (y0 * M.width + xa) * 4, i10 = (y0 * M.width + xb) * 4, i01 = ((y0 + 1) * M.width + xa) * 4, i11 = ((y0 + 1) * M.width + xb) * 4;
      return [0, 1, 2].map(c => (d[i00 + c] * (1 - tx) + d[i10 + c] * tx) * (1 - ty) + (d[i01 + c] * (1 - tx) + d[i11 + c] * tx) * ty);
    }

    // The Space Station, drawn much larger than real (Arman, 8 Nov: "the space station can be bigger, out of proportion"),
    // seen from above: the long beam (truss) with four pairs of solar wings, the row of living modules across the middle, white radiators.
    function drawStation(c, x, y, span) {
      const u = span / 40;                               // the drawing is 40 units wide
      c.save(); c.translate(x, y);
      c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = 6;   // a soft shadow keeps it clear over the blue oceans
      c.fillStyle = 'rgb(44,86,160)'; c.strokeStyle = 'rgba(200,230,255,.95)'; c.lineWidth = Math.max(0.7, 0.35 * u);
      for (const sx of [-17.5, -12.5, 12.5, 17.5]) for (const up of [true, false]) {
        const x0 = (sx - 2) * u, y0 = up ? -13 * u : 1.2 * u;
        c.fillRect(x0, y0, 4 * u, 11.8 * u); c.strokeRect(x0, y0, 4 * u, 11.8 * u);
      }
      c.fillStyle = 'rgb(218,224,236)';
      c.fillRect(-20 * u, -0.9 * u, 40 * u, 1.8 * u);      // the beam
      c.shadowBlur = 0;
      c.fillRect(-1.5 * u, -8 * u, 3 * u, 16 * u);         // the living modules
      c.fillRect(-4 * u, 4.6 * u, 8 * u, 2.4 * u);
      c.fillStyle = 'rgb(248,250,253)';
      c.fillRect(-7.6 * u, -5.6 * u, 2.2 * u, 4.6 * u); c.fillRect(5.4 * u, 1 * u, 2.2 * u, 4.6 * u);   // radiators
      c.restore();
    }

    function draw(cx, Wpx, Hpx, t) {
      const h = heightAt(t), cam = camera(h, Wpx, Hpx), V = cam.V;
      const SX = p => Wpx / 2 + (dot3(p, V.R) - cam.x0) * cam.s, SY = p => Hpx / 2 - (dot3(p, V.U) - cam.y0) * cam.s;
      const onScreen = (x, y, m = 20) => x > -m && x < Wpx + m && y > -m && y < Hpx + m;
      const L = Math.log10(Math.max(h, 0.001));
      const names = [];
      const label = (text, x, y, a = 0.85, size = 12, pri = 1) => { if (a > 0.02) names.push({ text, x, y, a, size, pri }); };

      // the sky: blue (or dusk, or night) near the ground, black in space; faint background stars until the real ones take over
      const space = smooth(0.4, 2.0, L);
      const top = [8 + 44 * day, 12 + 90 * day, 30 + 150 * day], bottom = [20 + 150 * day, 32 + 170 * day, 60 + 170 * day];
      const g = cx.createLinearGradient(0, 0, 0, Hpx);
      const mixc = (c, a) => `rgb(${(c[0] * (1 - a) + 5 * a) | 0},${(c[1] * (1 - a) + 7 * a) | 0},${(c[2] * (1 - a) + 14 * a) | 0})`;
      g.addColorStop(0, mixc(top, space)); g.addColorStop(1, mixc(bottom, space));
      cx.fillStyle = g; cx.fillRect(0, 0, Wpx, Hpx);
      const bgA = Math.max(space, night) * (1 - 0.7 * smooth(11.5, 12.5, L));
      for (const [x, y, r, a] of bgStars) { cx.fillStyle = `rgba(255,255,255,${a * bgA})`; cx.fillRect(x * Wpx, y * Hpx, r, r); }

      // our galaxy (a sketch) and the other galaxies
      const mwA = smooth(16.4, 17.4, L);
      if (mwA > 0) {
        for (const p of milkyWay) {
          const x = SX(p.pos), y = SY(p.pos); if (!onScreen(x, y, 4)) continue;
          cx.fillStyle = p.bulge ? `rgba(255,226,170,${0.55 * p.b * mwA})` : `rgba(190,214,255,${0.45 * p.b * mwA})`;
          cx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
        }
        const cxp = SX(mwCentre), cyp = SY(mwCentre), rr = Math.max(8, 6000 * KM_LY * cam.s);
        const gl = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, rr); gl.addColorStop(0, `rgba(255,230,180,${0.5 * mwA})`); gl.addColorStop(1, 'rgba(255,230,180,0)');
        cx.fillStyle = gl; cx.beginPath(); cx.arc(cxp, cyp, rr, 0, Math.PI * 2); cx.fill();
        if (L > 17.2) label('The Milky Way', cxp, cyp + rr + 16, 0.8 * mwA, 12, 2);
      }
      const galA = smooth(17.8, 18.6, L);
      if (galA > 0) for (const gx2 of galaxies) {
        const x = SX(gx2.pos), y = SY(gx2.pos); if (!onScreen(x, y, 80)) continue;
        // drawn much larger than real (a far galaxy would be a dot): the card's galaxy biggest
        const rx = Math.max(gx2.card ? Math.min(52, Wpx * 0.13) : Math.min(30, Wpx * 0.08), gx2.size * cam.s), ry = rx * Math.max(0.3, gx2.b / gx2.a);
        cx.save(); cx.translate(x, y); cx.rotate(-gx2.pa * DEG); cx.scale(1, ry / rx);
        const gg = cx.createRadialGradient(0, 0, 0, 0, 0, rx); gg.addColorStop(0, `rgba(255,240,210,${0.95 * galA})`); gg.addColorStop(0.2, `rgba(230,220,255,${0.55 * galA})`); gg.addColorStop(0.6, `rgba(170,185,250,${0.22 * galA})`); gg.addColorStop(1, 'rgba(160,170,240,0)');
        cx.fillStyle = gg; cx.beginPath(); cx.arc(0, 0, rx, 0, Math.PI * 2); cx.fill();
        if (gx2.type === 'S') {                                  // two spiral arms
          cx.strokeStyle = `rgba(200,214,255,${0.35 * galA})`; cx.lineWidth = Math.max(1, rx * 0.09); cx.lineCap = 'round';
          for (const k of [0, Math.PI]) { cx.beginPath(); for (let f = 0.12; f <= 1; f += 0.04) { const a = k + f * 4.2, r = f * rx * 0.95; (f === 0.12 ? cx.moveTo : cx.lineTo).call(cx, r * Math.cos(a), r * Math.sin(a)); } cx.stroke(); }
        } else if (gx2.type === 'I') {                           // an irregular galaxy: a few bright clumps
          for (let k = 0; k < 6; k++) { const a = rnd(k, gx2.ra) * 6.28, r = rnd(k, gx2.dec) * rx * 0.6; cx.fillStyle = `rgba(210,220,255,${0.3 * galA})`; cx.beginPath(); cx.arc(r * Math.cos(a), r * Math.sin(a), rx * 0.18, 0, Math.PI * 2); cx.fill(); }
        }
        const core = cx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.2); core.addColorStop(0, `rgba(255,248,230,${galA})`); core.addColorStop(1, 'rgba(255,248,230,0)');
        cx.fillStyle = core; cx.beginPath(); cx.arc(0, 0, rx * 0.2, 0, Math.PI * 2); cx.fill();
        cx.restore();
        if (gx2.card) { cx.strokeStyle = `rgba(255,216,77,${0.8 * galA})`; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, rx + 8, 0, Math.PI * 2); cx.stroke(); }
        label(gx2.name, x, y + rx * 0.6 + 22, (gx2.card ? 0.95 : 0.6) * galA, gx2.card ? 13 : 11, gx2.card ? 5 : 1);
      }

      // the named stars (and the Sun among them)
      const starA = smooth(11.3, 12.3, L) * (1 - smooth(18.2, 18.8, L));
      if (starA > 0) {
        for (const s of stars) {
          const x = SX(s.pos), y = SY(s.pos); if (!onScreen(x, y, 4)) continue;
          const r = Math.max(0.7, 2.6 - 0.45 * s.mag);
          const col = /^[OB]/.test(s.spect) ? '190,210,255' : /^A/.test(s.spect) ? '230,236,255' : /^[FG]/.test(s.spect) ? '255,244,220' : /^K/.test(s.spect) ? '255,214,170' : /^M/.test(s.spect) ? '255,180,150' : '235,240,255';
          cx.fillStyle = `rgba(${col},${starA})`; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
          const isCard = cardStar && s.label === cardStar.title;
          if (isCard) { cx.strokeStyle = `rgba(255,216,77,${starA})`; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, r + 7, 0, Math.PI * 2); cx.stroke(); label(s.label, x, y + r + 22, starA, 13, 5); }
          else if ((s.label === 'Sirius' || s.label === 'Rigil Kentaurus' || s.label === 'Vega') && L < 15.5) label(s.label, x, y + r + 16, 0.6 * starA, 11);
        }
        const sx = SX(sunPos), sy = SY(sunPos);
        cx.fillStyle = `rgba(255,236,190,${starA})`; cx.beginPath(); cx.arc(sx, sy, 2.6, 0, Math.PI * 2); cx.fill();
        if (L < 16.5) label('The Sun', sx, sy + 18, 0.75 * starA, 11, 3);
      }

      // the Oort Cloud, the Kuiper Belt, the asteroid belt, the edge of the Sun's bubble
      const dots = (list, a, colour) => { if (a <= 0) return; cx.fillStyle = `rgba(${colour},${a})`; for (const p of list) { const x = SX(p), y = SY(p); if (onScreen(x, y, 2)) cx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); } };
      dots(oort, 0.4 * smooth(10.6, 11.4, L) * (1 - smooth(13.6, 14.4, L)), '190,225,255');
      dots(kuiper, 0.5 * smooth(9.1, 9.6, L) * (1 - smooth(11.2, 11.8, L)), '200,215,235');
      dots(asteroids, 0.5 * smooth(8.2, 8.6, L) * (1 - smooth(10.0, 10.6, L)), '200,190,170');
      const hpA = smooth(10.0, 10.5, L) * (1 - smooth(11.6, 12.2, L));
      if (hpA > 0) { cx.strokeStyle = `rgba(140,185,255,${0.35 * hpA})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(SX(sunPos), SY(sunPos), 122 * KM_AU * cam.s, 0, Math.PI * 2); cx.stroke(); }

      // the Sun and the planets, with their orbits (drawn much larger than real)
      const sysA = smooth(6.4, 7.2, L) * (1 - smooth(11.0, 11.6, L));
      if (sysA > 0) {
        cx.lineWidth = 1;
        const orbitLine = (pts, a) => { cx.strokeStyle = `rgba(170,190,230,${a})`; cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo : cx.moveTo).call(cx, SX(p), SY(p))); cx.stroke(); };
        orbitLine(earthOrbit, 0.35 * sysA * smooth(7.2, 7.8, L));
        for (const p of planets) orbitLine(p.orbit, 0.28 * sysA * smooth(7.2, 7.8, L));
        const sx = SX(sunPos), sy = SY(sunPos), sr = Math.max(696000 * cam.s, 15);
        const glow = cx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3); glow.addColorStop(0, `rgba(255,214,120,${0.5 * sysA})`); glow.addColorStop(1, 'rgba(255,214,120,0)');
        cx.fillStyle = glow; cx.beginPath(); cx.arc(sx, sy, sr * 3, 0, Math.PI * 2); cx.fill();
        cx.globalAlpha = sysA;
        if (A.sprites.sun) cx.drawImage(A.sprites.sun, sx - sr, sy - sr, sr * 2, sr * 2); else { cx.fillStyle = 'rgb(255,214,120)'; cx.beginPath(); cx.arc(sx, sy, sr, 0, Math.PI * 2); cx.fill(); }
        cx.globalAlpha = 1;
        label('The Sun', sx, sy + sr + 18, 0.85 * sysA, 12, 3);
        const plA = sysA * smooth(7.0, 7.6, L) * (1 - smooth(10.2, 10.8, L));     // far out the planets sit on top of the Sun: they fade
        for (const p of planets) {
          const x = SX(p.pos), y = SY(p.pos); if (!onScreen(x, y, 40)) continue;
          const r = p.minR, sp = A.sprites[p.name.toLowerCase()];
          cx.globalAlpha = plA;
          if (p.name === 'Saturn' && A.sprites['saturn-rings']) cx.drawImage(A.sprites['saturn-rings'], x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
          if (sp) cx.drawImage(sp, x - r, y - r, r * 2, r * 2); else { cx.fillStyle = 'rgb(200,200,200)'; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
          cx.globalAlpha = 1;
          const isCard = planetStop && planetStop.title === p.name;
          if (isCard) { cx.strokeStyle = `rgba(255,216,77,${plA})`; cx.beginPath(); cx.arc(x, y, r + 6, 0, Math.PI * 2); cx.stroke(); }
          if (L < 10.2) label(p.name, x, y + r + 15, (isCard ? 0.95 : 0.7) * plA, isCard ? 12 : 11, isCard ? 5 : 1);
        }
      }

      // the Moon and its path (drawn larger than real from the Moon's distance on, exactly as much as the Earth)
      const moonA = smooth(20000, 90000, h) * (1 - smooth(1e7, 3e7, h));
      if (moonA > 0) {
        cx.strokeStyle = `rgba(200,210,235,${0.28 * moonA})`; cx.lineWidth = 1; cx.setLineDash([3, 5]);
        cx.beginPath(); moonPath.forEach((p, i) => (i ? cx.lineTo : cx.moveTo).call(cx, SX(p), SY(p))); cx.stroke(); cx.setLineDash([]);
        const x = SX(moon), y = SY(moon), r = Math.max(MOON_R / RHO * earthPx(cam, h, Wpx), 3);
        cx.globalAlpha = moonA;
        if (A.sprites.moon) cx.drawImage(A.sprites.moon, x - r, y - r, r * 2, r * 2); else { cx.fillStyle = 'rgb(190,190,186)'; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
        cx.globalAlpha = 1;
        label('The Moon', x, y + r + 16, 0.85 * moonA, 13, 4);
      }

      // the Earth, drawn from its map (always fully lit; close to the ground it blends into your area's ground colour)
      const rp = earthPx(cam, h, Wpx), es = rp / RHO, ccx = SX(CENTRE), ccy = SY(CENTRE);
      if (rp >= 0.8) {
        const air = Math.max(3, 100 * es), airA = 0.4 * smooth(0.6, 2.2, L);
        if (airA > 0 && rp < 3e5) {
          const gr = cx.createRadialGradient(ccx, ccy, rp * 0.985, ccx, ccy, rp + air * 1.6);
          gr.addColorStop(0, `rgba(120,180,255,${airA * 1.3})`); gr.addColorStop(1, 'rgba(120,180,255,0)');
          cx.fillStyle = gr; cx.beginPath(); cx.arc(ccx, ccy, rp + air * 1.6, 0, Math.PI * 2); cx.fill();
        } else if (airA > 0) { cx.fillStyle = `rgba(110,170,255,${airA})`; cx.fillRect(0, SY([0, 0, 0]) - air, Wpx, air); }
        const topY = Math.max(0, Math.floor(ccy - rp)), left = Math.max(0, Math.floor(ccx - rp)), right = Math.min(Wpx, Math.ceil(ccx + rp)), bottomY = Math.min(Hpx, Math.ceil(ccy + rp));
        if (right > left && bottomY > topY) {
          const cell = rp > 150 ? 3 : rp > 12 ? 2 : 1, gw = Math.ceil((right - left) / cell), gh = Math.ceil((bottomY - topY) / cell);
          if (off.width !== gw || off.height !== gh) { off.width = gw; off.height = gh; }
          const img = offCtx.createImageData(gw, gh), od = img.data, near = 1 - smooth(5, 250, h);
          for (let j = 0; j < gh; j++) {
            const dy = (ccy - (topY + (j + 0.5) * cell)) / es;
            for (let i = 0; i < gw; i++) {
              const dx = ((left + (i + 0.5) * cell) - ccx) / es, r2 = (dx * dx + dy * dy) / (RHO * RHO);
              if (r2 > 1) continue;
              const z = Math.sqrt(1 - r2), ux = dx / RHO, uy = dy / RHO;
              const e = ux * V.R[0] + uy * V.U[0] + z * V.D[0], nn = ux * V.R[1] + uy * V.U[1] + z * V.D[1], u = ux * V.R[2] + uy * V.U[2] + z * V.D[2];
              const X = e * AX_E[0] + nn * AX_N[0] + u * AX_U[0], Y = e * AX_E[1] + nn * AX_N[1] + u * AX_U[1], Z = e * AX_E[2] + nn * AX_N[2] + u * AX_U[2];
              let c = sampleMap(Math.asin(Math.max(-1, Math.min(1, Z))), Math.atan2(Y, X));
              if (near > 0) c = c.map((v, k) => v * (1 - near) + nearGround[k] * near);
              const shade = 0.55 + 0.45 * Math.pow(z, 0.45), p = (j * gw + i) * 4;
              od[p] = c[0] * shade; od[p + 1] = c[1] * shade; od[p + 2] = c[2] * shade; od[p + 3] = 255;
            }
          }
          offCtx.putImageData(img, 0, 0);
          cx.imageSmoothingEnabled = true;
          cx.drawImage(off, left, topY, gw * cell, gh * cell);
          if (rp < 3e5) { cx.strokeStyle = 'rgba(150,195,255,.45)'; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(ccx, ccy, rp, 0, Math.PI * 2); cx.stroke(); }
        }
        if (h < 4000) label(o.placeName, SX([0, 0, 0]) + 30, SY([0, 0, 0]) + 18, (1 - smooth(800, 4000, h)) * smooth(0.02, 0.2, h), 13, 6);
        if (h > 15000 && h < 3e10) label('Earth', ccx, ccy + rp + air + 18, smooth(15000, 40000, h) * 0.8 * (1 - smooth(1e10, 3e10, h)), 13, 4);
      }

      // your street, landmarks and scenery (metres; only close to the ground)
      const groundFade = 1 - smooth(1.5, 4, h);
      if (groundFade > 0) ZoomScenery.draw({ ctx: cx, W: Wpx, H: Hpx, m: cam.s / 1000, x: e => SX([e / 1000, 0, 0]), y: u => SY([0, 0, u / 1000]), label }, scene, night, groundFade);

      // the satellites (only near the Earth)
      const satA = smooth(1.6, 2.3, L) * (1 - 0.5 * smooth(3.6, 4.6, L)) * (1 - smooth(2e5, 1e6, h));
      if (cloud && satA > 0) {
        const xyz = cloud.xyz, k = cloud.count, enlarged = rp > RHO * cam.s * 1.05, dotSize = Math.max(1.2, Math.min(2.2, 1.2 + 0.3 * (4 - L)));
        const special = [];
        for (let i = 0; i < k; i++) {
          const p = [xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]], x = SX(p), y = SY(p);
          const onDisk = (x - ccx) ** 2 + (y - ccy) ** 2 < rp * rp;
          if (onDisk && enlarged) continue;
          const behind = onDisk && dot3([p[0] - CENTRE[0], p[1] - CENTRE[1], p[2] - CENTRE[2]], V.D) < 0;
          if (marks.has(cloud.norads[i])) { special.push([x, y, cloud.norads[i], behind]); continue; }
          if (!onScreen(x, y, 4) || behind) continue;
          cx.fillStyle = `rgba(205,222,255,${(onDisk ? 0.35 : 0.8) * satA})`;
          cx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        }
        cx.font = '600 12px "Instrument Sans", system-ui, sans-serif';
        for (const [x, y, id, behind] of special) {
          // shown only where it fits whole: below the caption, above the distance counter (the station is drawn large)
          const m = marks.get(id), half = m.station ? Math.min(48, Wpx * 0.13) / 2 : 0, fade = 1 - smooth(20, 60, h / m.h);
          const vis = x > 8 + half && x < Wpx - 8 - half && y > 108 + half && y < Hpx - 78 - half;
          if (vis && !behind && fade > 0) {
            cx.globalAlpha = fade * satA;
            let gap = 14;
            if (m.station) { const span = Math.min(48, Wpx * 0.13); drawStation(cx, x, y, span); gap = span / 2 + 8; }
            else {
              cx.fillStyle = m.colour; cx.beginPath(); cx.arc(x, y, 4, 0, Math.PI * 2); cx.fill();
              cx.strokeStyle = m.colour; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, 9, 0, Math.PI * 2); cx.stroke();
            }
            cx.fillStyle = m.colour; cx.textAlign = x > Wpx * 0.6 ? 'right' : 'left'; cx.fillText(m.label, x + (x > Wpx * 0.6 ? -gap : gap), y + 4);
            cx.globalAlpha = 1;
          } else if (!vis && current && current.mark === id) {
            const mx = Wpx / 2, my = Hpx / 2, dx = x - mx, dy = y - my, k2 = Math.min((Wpx / 2 - 26) / Math.abs(dx || 1e-9), (Hpx / 2 - 90) / Math.abs(dy || 1e-9));
            const ax = mx + dx * k2, ay = my + dy * k2;
            cx.save(); cx.translate(ax, ay); cx.rotate(Math.atan2(dy, dx)); cx.fillStyle = m.colour; cx.beginPath(); cx.moveTo(10, 0); cx.lineTo(-4, -7); cx.lineTo(-4, 7); cx.closePath(); cx.fill(); cx.restore();
            cx.fillStyle = m.colour; cx.textAlign = ax > Wpx * 0.6 ? 'right' : 'left'; cx.fillText(m.label, ax + (ax > Wpx * 0.6 ? -16 : 16), ay + (ay > Hpx / 2 ? -12 : 20));
          }
        }
      }

      // you: the film's figure (head, body, arms up) at real size (1.8 m); once it is a few pixels tall, a bright point at the head of a beam of light
      const x = SX([0, 0, 0]), feet = SY([0, 0, h]), tall = 0.0018 * cam.s * V.U[2], beam = smooth(30, 6, tall);
      const kk = rp / (RHO * cam.s), y0 = ccy + (SY([0, 0, 0]) - ccy) * kk;           // the beam starts at your place on the Earth as drawn
      cx.strokeStyle = `rgba(127,214,255,${0.22 * smooth(0, 0.01, h)})`; cx.lineWidth = 1; cx.setLineDash([4, 6]);
      cx.beginPath(); cx.moveTo(x, feet - tall); cx.lineTo(x, -10); cx.stroke(); cx.setLineDash([]);
      if (h > 0.0002) {
        const gb = cx.createLinearGradient(0, Math.min(y0, Hpx + 10), 0, feet);
        gb.addColorStop(0, `rgba(127,214,255,${0.15 + 0.2 * beam})`); gb.addColorStop(1, `rgba(190,236,255,${0.6 + 0.4 * beam})`);
        cx.save(); cx.shadowColor = 'rgba(127,214,255,.9)'; cx.shadowBlur = 6 + 10 * beam;
        cx.strokeStyle = gb; cx.lineWidth = 1.5 + 2 * beam; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(x, Math.min(y0, Hpx + 10)); cx.lineTo(x, feet); cx.stroke(); cx.restore();
      }
      youNow = { x, feet };                                                            // where the Launch button goes (under your feet)
      const glowR = 12 + 10 * beam + tall * 0.7, gy0 = feet - tall * 0.55;
      const halo = cx.createRadialGradient(x, gy0, 0, x, gy0, glowR);
      halo.addColorStop(0, `rgba(${YOU.join(',')},${0.45 + 0.4 * beam})`); halo.addColorStop(1, `rgba(${YOU.join(',')},0)`);
      cx.fillStyle = halo; cx.beginPath(); cx.arc(x, gy0, glowR, 0, Math.PI * 2); cx.fill();
      if (beam < 1) {
        // the same figure as the film's (25 units tall: head at the top, body to the feet, arms up), drawn 1.8 m tall
        const u = tall / 25, yc = feet - 11 * u;
        cx.globalAlpha = 1 - beam;
        cx.fillStyle = 'rgb(200,236,255)';
        cx.beginPath(); cx.arc(x, yc - 9 * u, 5 * u, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.moveTo(x - 6 * u, yc - 2 * u); cx.lineTo(x + 6 * u, yc - 2 * u); cx.lineTo(x + 4 * u, yc + 11 * u); cx.lineTo(x - 4 * u, yc + 11 * u); cx.closePath(); cx.fill();
        cx.lineWidth = Math.max(1, 2.4 * u); cx.lineCap = 'round'; cx.strokeStyle = cx.fillStyle;
        cx.beginPath(); cx.moveTo(x - 5 * u, yc); cx.lineTo(x - 9 * u, yc - 9 * u); cx.moveTo(x + 5 * u, yc); cx.lineTo(x + 9 * u, yc - 9 * u); cx.stroke();
        cx.globalAlpha = 1;
      }
      // the names, most important first; one that would cover another (or the caption) is left out
      const placed = [{ x0: 0, x1: Wpx, y0: 0, y1: Wpx < 600 ? 150 : 120 }];            // the caption's part of the screen
      names.sort((p, q) => q.pri - p.pri);
      for (const nm of names) {
        cx.font = `600 ${nm.size}px "Instrument Sans", system-ui, sans-serif`;
        const w = cx.measureText(nm.text).width;
        nm.x = Math.max(w / 2 + 6, Math.min(Wpx - w / 2 - 6, nm.x));                   // kept inside the screen
        const b = { x0: nm.x - w / 2 - 9, x1: nm.x + w / 2 + 9, y0: nm.y - nm.size, y1: nm.y + 4 };   // a little room round each name
        if (placed.some(q => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) continue;
        placed.push(b);
        cx.textAlign = 'center'; cx.fillStyle = `rgba(233,237,246,${nm.a})`; cx.fillText(nm.text, nm.x, nm.y);
      }
      // the very end: a slow fade to the results card
      const fadeOut = smooth(duration - 1.6, duration, t);
      if (fadeOut > 0) { cx.fillStyle = `rgba(5,7,14,${fadeOut})`; cx.fillRect(0, 0, Wpx, Hpx); }
      return h;
    }

    let current = null, youNow = null;
    function captionAt(t) { const due = shown.filter(e => e.t <= t); current = due.length ? due[due.length - 1] : shown[0]; return current; }
    // the caption while you wait for Launch
    const ready = { title: 'Ready for lift-off', line: (o.placeName === 'where you stand' ? 'You are standing at your own location.' : `You are in ${o.placeName}.`) + ' Press Launch to shoot straight up, at the speed of light.' };
    return { duration, heightAt, timeAt, events: shown, draw, captionAt, scene, END, liftAt: WAIT_S, ready, youOnScreen: () => youNow,
      viewAt: view, eclipticPole: eclN, toPlanets };          // the last three: for the test tools
  }

  root.SendMeUpZoom = { loadAssets, create, assets };
})(this);
