// Send Me Up — the full-screen trip film. Calm by rule: no shaking, no cracks, no sudden flashes.
// Scenes: lift-off from the ground (sky colour from the real Sun height) -> up through the sky to the edge of space ->
// one scene per stop on the results card (satellites, Space Station, Moon, planet, star, galaxy) -> "…and you keep going"
// (or the trip ends calmly at the Moon or the Sun after a hit).
// Words live in the page (captions), pictures on the canvas. Same pattern as Dig Straight Through's film.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const film = $('film'), canvas = $('filmCanvas');
  let cx = canvas.getContext('2d');     // the canvas being drawn on (the film, or the homepage picture)
  const capBox = $('filmCaption'), capTitle = $('filmCapTitle'), capLine = $('filmCapLine'), capWhen = $('filmCapWhen');
  const odoDist = $('filmOdoDist'), odoTime = $('filmOdoTime'), skipBtn = $('filmSkip');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LIGHT_KMS = 299792.458, KM_PER_LY = 9.4607e12, YEAR_S = 3.15576e7;
  const YOU = [127, 214, 255], GOLD = [255, 216, 77];

  let W = 0, H = 0, run = null;
  let sunAlt = -20;    // height of the Sun at the start (°), sets the sky colours
  let twinkle = 0;     // homepage only: time for the stars' gentle twinkle (0 = no twinkle)

  // ---------- small helpers ----------
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const n = (x, d = 0) => x.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const nice = x => (x >= 10 ? n(x) : n(x, 1));
  function stepped(list, x) {       // colour stops: [[x, [r,g,b]], ...]
    if (x <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) if (x <= list[i][0]) return mix(list[i - 1][1], list[i][1], (x - list[i - 1][0]) / (list[i][0] - list[i - 1][0]));
    return list[list.length - 1][1];
  }

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- the distance counter at the bottom ----------
  function distanceText(t) {
    const km = t * LIGHT_KMS;
    if (km < 1) return `${n(Math.round(km * 1000))} m`;
    if (km < 1e6) return `${n(km)} km`;
    if (km < 1e9) return `${nice(km / 1e6)} million km`;
    if (km < 0.05 * KM_PER_LY) return `${nice(km / 1e9)} billion km`;
    const ly = km / KM_PER_LY;
    if (ly < 1e6) return unit(nice(ly), 'light year');
    return ly < 1e9 ? `${nice(ly / 1e6)} million light years` : `${nice(ly / 1e9)} billion light years`;
  }
  // "1 minute", "3 minutes"
  const unit = (text, word) => `${text} ${text === '1' || text === '1.0' ? word : word + 's'}`;
  function timeText(t) {
    if (t < 0.01) return 'a blink';
    if (t < 60) return unit(n(t, t < 10 ? 1 : 0), 'second');
    if (t < 3600) return unit(n(t / 60), 'minute');
    if (t < 172800) return unit(nice(t / 3600), 'hour');
    if (t < YEAR_S) return unit(n(t / 86400), 'day');
    const y = t / YEAR_S;
    if (y < 1e6) return unit(nice(y), 'year');
    return y < 1e9 ? `${nice(y / 1e6)} million years` : `${nice(y / 1e9)} billion years`;
  }
  // smooth "log" travel between two trip times, so tiny and huge distances both get fair screen time
  function tripTimeAt(from, to, k) {
    if (!(to > from)) return from;
    if (from <= 0) return to * ease(k);
    return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * ease(k));
  }

  // ---------- background: sky, stars, ground ----------
  const stars = Array.from({ length: 240 }, (_, i) => [hash(i), hash(i + 500), 0.4 + hash(i + 900) * 1.4, 0.3 + hash(i + 1300) * 0.7]);
  let scroll = 0;   // how far the stars have drifted down (px), grows at a steady, calm speed

  function skyColours(sunAlt) {
    const top = stepped([[-12, [8, 12, 28]], [-4, [26, 36, 78]], [4, [52, 98, 170]], [12, [70, 132, 205]]], sunAlt);
    const bottom = stepped([[-12, [22, 34, 62]], [-4, [196, 120, 92]], [4, [168, 196, 228]], [12, [176, 214, 242]]], sunAlt);
    return [top, bottom];
  }
  const SPACE = [5, 7, 14];

  function drawBackground(space, starsShown) {
    const [top, bottom] = skyColours(sunAlt);
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(mix(top, SPACE, space)));
    g.addColorStop(1, rgb(mix(bottom, SPACE, Math.min(1, space * 1.15))));
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
    const night = clamp01((-sunAlt + 2) / 10);
    const shown = clamp01(Math.max(starsShown, night * 0.7));
    if (shown <= 0) return;
    for (const [sx, sy, r, depth] of stars) {
      const y = ((sy * H + scroll * depth) % (H + 20)) - 10;
      const tw = twinkle ? 0.7 + 0.3 * Math.sin(twinkle / 900 + sx * 47) : 1;
      cx.fillStyle = `rgba(235,240,255,${(0.35 + depth * 0.6) * shown * tw})`;
      cx.beginPath(); cx.arc(sx * W, y, r, 0, Math.PI * 2); cx.fill();
    }
  }

  function drawGround(groundY) {
    if (groundY > H + 40) return;
    const night = clamp01((-sunAlt + 2) / 10);
    const land = mix([46, 74, 58], [12, 17, 30], night);
    cx.fillStyle = rgb(land);
    cx.beginPath();
    cx.moveTo(0, H + 400);
    for (let x = 0; x <= W; x += 8) cx.lineTo(x, groundY + Math.sin(x / 90) * 6 + Math.sin(x / 37 + 1) * 3);
    cx.lineTo(W, H + 400); cx.closePath(); cx.fill();
    // a few houses and trees along the horizon, the same every time
    for (let i = 0; i < 14; i++) {
      const x = hash(i + 40) * W, base = groundY + Math.sin(x / 90) * 6 + Math.sin(x / 37 + 1) * 3 + 2;
      if (Math.abs(x - W / 2) < 34) continue;               // keep the launch spot clear
      if (hash(i + 70) < 0.55) {
        const w = 18 + hash(i + 80) * 16, h = 14 + hash(i + 90) * 14;
        cx.fillStyle = rgb(mix(land, [0, 0, 0], 0.25));
        cx.fillRect(x - w / 2, base - h, w, h);
        cx.beginPath(); cx.moveTo(x - w / 2 - 3, base - h); cx.lineTo(x, base - h - w * 0.45); cx.lineTo(x + w / 2 + 3, base - h); cx.fill();
        if (night > 0.3) { cx.fillStyle = `rgba(255,210,120,${0.75 * night})`; cx.fillRect(x - 3, base - h * 0.62, 5, 5); }
      } else {
        const h = 16 + hash(i + 100) * 14;
        cx.fillStyle = rgb(mix(land, [0, 0, 0], 0.35));
        cx.fillRect(x - 1.5, base - h * 0.45, 3, h * 0.45);
        cx.beginPath(); cx.arc(x, base - h * 0.62, h * 0.32, 0, Math.PI * 2); cx.fill();
      }
    }
  }

  // ---------- you ----------
  function drawYou(x, y, glow, trailTo) {
    // the straight line back down to where you started
    if (trailTo > y) {
      const g = cx.createLinearGradient(0, y, 0, trailTo);
      g.addColorStop(0, rgba(YOU, 0.55)); g.addColorStop(1, rgba(YOU, 0));
      cx.strokeStyle = g; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(x, y + 12); cx.lineTo(x, trailTo); cx.stroke();
    }
    const colour = mix(YOU, GOLD, glow);
    const halo = cx.createRadialGradient(x, y, 2, x, y, 30 + glow * 16);
    halo.addColorStop(0, rgba(colour, 0.45)); halo.addColorStop(1, rgba(colour, 0));
    cx.fillStyle = halo; cx.beginPath(); cx.arc(x, y, 30 + glow * 16, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = rgb(mix([240, 248, 255], colour, 0.35));
    cx.beginPath(); cx.arc(x, y - 9, 5, 0, Math.PI * 2); cx.fill();                       // head
    cx.beginPath(); cx.moveTo(x - 6, y - 2); cx.lineTo(x + 6, y - 2); cx.lineTo(x + 4, y + 11); cx.lineTo(x - 4, y + 11); cx.closePath(); cx.fill(); // body
    cx.lineWidth = 2.4; cx.lineCap = 'round'; cx.strokeStyle = cx.fillStyle;
    cx.beginPath(); cx.moveTo(x - 5, y); cx.lineTo(x - 9, y - 9); cx.moveTo(x + 5, y); cx.lineTo(x + 9, y - 9); cx.stroke();  // arms up
  }

  // ---------- things you pass ----------
  const PLANET = {
    Mercury: [169, 163, 155], Venus: [232, 215, 168], Mars: [212, 106, 67], Jupiter: [217, 179, 140],
    Saturn: [227, 207, 154], Uranus: [159, 216, 224], Neptune: [91, 127, 224],
  };
  function glowDisc(x, y, r, inner, outer, glowR) {
    const halo = cx.createRadialGradient(x, y, r * 0.8, x, y, glowR);
    halo.addColorStop(0, rgba(outer, 0.35)); halo.addColorStop(1, rgba(outer, 0));
    cx.fillStyle = halo; cx.beginPath(); cx.arc(x, y, glowR, 0, Math.PI * 2); cx.fill();
    const body = cx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    body.addColorStop(0, rgb(inner)); body.addColorStop(1, rgb(outer));
    cx.fillStyle = body; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  function drawMoon(x, y, r) {
    glowDisc(x, y, r, [236, 236, 230], [150, 150, 146], r * 1.6);
    cx.fillStyle = 'rgba(90,90,96,.28)';
    for (const [dx, dy, s] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.38, 0.12], [0.3, -0.35, 0.1]]) {
      cx.beginPath(); cx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); cx.fill();
    }
  }
  function drawSun(x, y, r) { glowDisc(x, y, r, [255, 250, 225], [255, 196, 90], r * 2.6); }
  function drawPlanet(name, x, y, r) {
    const c = PLANET[name] || [200, 200, 200];
    glowDisc(x, y, r, mix(c, [255, 255, 255], 0.35), c, r * 1.8);
    if (name === 'Jupiter') {
      cx.strokeStyle = 'rgba(150,100,70,.35)'; cx.lineWidth = r * 0.12;
      for (const dy of [-0.35, 0, 0.3]) { cx.beginPath(); cx.moveTo(x - r * 0.95, y + dy * r); cx.lineTo(x + r * 0.95, y + dy * r); cx.stroke(); }
    }
    if (name === 'Saturn') {
      cx.strokeStyle = 'rgba(235,220,170,.8)'; cx.lineWidth = r * 0.16;
      cx.beginPath(); cx.ellipse(x, y, r * 2, r * 0.55, -0.25, 0, Math.PI * 2); cx.stroke();
    }
  }
  function drawStar(x, y) {
    const halo = cx.createRadialGradient(x, y, 0, x, y, 26);
    halo.addColorStop(0, 'rgba(255,255,255,.95)'); halo.addColorStop(0.2, 'rgba(190,215,255,.5)'); halo.addColorStop(1, 'rgba(190,215,255,0)');
    cx.fillStyle = halo; cx.beginPath(); cx.arc(x, y, 26, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = 'rgba(220,235,255,.45)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(x - 20, y); cx.lineTo(x + 20, y); cx.moveTo(x, y - 20); cx.lineTo(x, y + 20); cx.stroke();
  }
  function drawGalaxy(x, y, w, shape, hit) {
    const ratio = Math.max(0.2, Math.min(1, shape ? shape.ratio : 0.5));
    cx.save();
    cx.translate(x, y); cx.rotate(((shape ? shape.pa : 30) - 90) * Math.PI / 180); cx.scale(1, ratio);
    const g = cx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255,246,216,.95)'); g.addColorStop(0.12, 'rgba(255,230,190,.6)');
    g.addColorStop(0.45, hit ? 'rgba(190,170,255,.28)' : 'rgba(170,185,255,.3)'); g.addColorStop(1, 'rgba(150,170,255,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, w / 2, 0, Math.PI * 2); cx.fill();
    cx.restore();
  }

  // ---------- the layers of the air ----------
  // How high the troposphere reaches at this latitude, from NOAA's figures: about 19 km at the equator,
  // 9 km at 50° north or south, 6 km at the poles (straight lines in between, so "about").
  function tropopauseKm(lat) {
    const a = Math.abs(lat || 0);
    return Math.round(a <= 50 ? 19 - (a / 50) * 10 : 9 - ((a - 50) / 40) * 3);
  }
  function drawClouds(k) {           // a few soft, thin clouds sliding away below you
    for (let i = 0; i < 6; i++) {
      const x = hash(i + 7) * W, y = (hash(i + 17) * H * 0.55) + k * H * 0.9, w = 70 + hash(i + 27) * 60;
      cx.save(); cx.translate(x, y); cx.scale(1, 0.18);
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, `rgba(255,255,255,${0.18 * (1 - k * 0.6)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, w, 0, Math.PI * 2); cx.fill();
      cx.restore();
    }
  }
  function drawMeteors(k) {          // two faint shooting stars, slow and soft (no flashes)
    for (const [start, sx, sy] of [[0.15, 0.2, 0.25], [0.5, 0.75, 0.15]]) {
      const t = (k - start) / 0.35;
      if (t < 0 || t > 1) continue;
      const x = sx * W + t * W * 0.18, y = sy * H + t * H * 0.12, len = 46;
      const fade = Math.sin(t * Math.PI);
      const g = cx.createLinearGradient(x - len, y - len * 0.66, x, y);
      g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(1, `rgba(255,240,210,${0.7 * fade})`);
      cx.strokeStyle = g; cx.lineWidth = 1.6; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(x - len, y - len * 0.66); cx.lineTo(x, y); cx.stroke();
    }
  }
  function drawBlueEdge(k) {         // the thin blue glow of the air, dropping away below you
    const top = H * (0.78 + 0.3 * ease(k));
    const g = cx.createLinearGradient(0, top - 40, 0, top + 60);
    g.addColorStop(0, 'rgba(90,160,255,0)'); g.addColorStop(0.45, 'rgba(110,175,255,.32)'); g.addColorStop(1, 'rgba(40,80,160,0)');
    cx.fillStyle = g; cx.fillRect(0, top - 40, W, 100);
  }

  // ---------- leaving the solar system (calm, faint pictures under the captions) ----------
  function drawMilestone(id, k) {
    if (id === 'neptune') {
      // a few small icy bodies of the Kuiper Belt drifting past
      for (let i = 0; i < 9; i++) {
        const x = hash(i + 300) * W, y = ((hash(i + 320) * H * 1.2) + k * H * 0.8) % (H * 1.2) - H * 0.1, r = 1.4 + hash(i + 340) * 2.2;
        cx.fillStyle = `rgba(200,215,235,${0.55 * Math.sin(Math.PI * clamp01(k * 1.2))})`;
        cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
      }
    } else if (id === 'heliopause') {
      // the edge of the Sun's bubble: a huge, faint curved glow that you pass through
      const y = H * (1.15 - 0.9 * ease(k)) + H * 0.35;
      const g = cx.createRadialGradient(W / 2, y + W * 1.4, W * 1.35, W / 2, y + W * 1.4, W * 1.45);
      g.addColorStop(0, 'rgba(120,170,255,0)'); g.addColorStop(0.5, `rgba(140,185,255,${0.32 * Math.sin(Math.PI * k)})`); g.addColorStop(1, 'rgba(120,170,255,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    } else if (id === 'oort') {
      // far-off icy comets of the Oort Cloud drifting past
      for (let i = 0; i < 6; i++) {
        const x = hash(i + 400) * W, y = hash(i + 420) * H * 0.8 + k * H * 0.25;
        cx.strokeStyle = `rgba(190,225,255,${0.35 * Math.sin(Math.PI * k)})`; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 10, y - 6); cx.stroke();
        cx.fillStyle = `rgba(230,245,255,${0.6 * Math.sin(Math.PI * k)})`;
        cx.beginPath(); cx.arc(x, y, 1.4, 0, Math.PI * 2); cx.fill();
      }
    }
  }

  // A satellite: a small body with two solar panels; the Space Station: a long frame with four pairs of panels.
  // Drawn small and still, with a soft glow (calm rules).
  function drawSatellite(x, y, station) {
    cx.save();
    cx.translate(x, y); cx.rotate(-0.3);
    const glowR = station ? 46 : 24;
    const g = cx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    g.addColorStop(0, 'rgba(200,225,255,.22)'); g.addColorStop(1, 'rgba(200,225,255,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, glowR, 0, Math.PI * 2); cx.fill();
    cx.lineWidth = 1; cx.strokeStyle = 'rgba(190,215,255,.75)';
    const panel = (px, py, w, h) => { cx.fillStyle = 'rgb(58,98,176)'; cx.fillRect(px, py, w, h); cx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1); };
    if (station) {
      cx.fillStyle = 'rgb(205,210,222)'; cx.fillRect(-38, -1.5, 76, 3);                 // the long frame
      for (const px of [-36, -24, 14, 26]) { panel(px, -15, 10, 12); panel(px, 3, 10, 12); }
      cx.fillStyle = 'rgb(232,234,240)'; cx.fillRect(-8, -5, 16, 10);                  // the living modules in the middle
      cx.fillRect(-3, -9, 6, 18);
    } else {
      panel(-21, -4, 14, 8); panel(7, -4, 14, 8);
      cx.fillStyle = 'rgb(225,228,236)'; cx.fillRect(-6, -5, 12, 10);
    }
    cx.restore();
  }

  // How far to the side a near miss passes on screen: closer misses pass closer (not to scale).
  function sideOffset(stop) {
    if (stop.status === 'hit') return 0;
    if (stop.missKm != null) return Math.min(W * 0.34, 34 + 36 * Math.log10(1 + stop.missKm));     // satellites: by distance
    const widths = (stop.sepDeg || 0) / 0.52;
    return Math.min(W * 0.34, 46 + 52 * Math.log10(1 + widths));
  }

  // ---------- scenes ----------
  // Each scene: { dur (ms), draw(k), caption: {title, line, when, hit}, from, to (trip seconds for the counter) }
  function buildScenes(o) {
    const scenes = [];
    const youY = () => H * 0.62;
    scenes.push({
      dur: 3200, from: 0, to: 1 / LIGHT_KMS,
      caption: { title: `Lift-off from ${o.placeName}`, line: 'Straight up, at the speed of light.' },
      draw(k) {
        // stand on the ground for a moment, then rise; the ground drops away below
        const rise = ease(clamp01((k - 0.2) / 0.8));
        const groundY = H * 0.84 + rise * H * 0.75;
        const y = (H * 0.84 - 14) + (youY() - (H * 0.84 - 14)) * ease(clamp01((k - 0.2) / 0.5));
        drawBackground(0, 0);
        drawGround(groundY);
        drawYou(W / 2, y, 0, groundY);
      },
    });
    // Up through the layers of the air. Heights and facts: NOAA (layers, ozone, meteors, aurora) and NASA (100 km, Space Station).
    const tropo = tropopauseKm(o.lat);
    const km = x => x / LIGHT_KMS;
    // The satellites you pass are in the thermosphere or above: that scene ends a little below the first one,
    // so the counter reaches each satellite's real height as it passes you.
    const satStops = o.card.stops.filter(s => (s.kind === 'satellite' || s.kind === 'iss') && s.status !== 'note');
    const firstSatKm = satStops.length ? Math.min(...satStops.map(s => s.t * LIGHT_KMS)) : Infinity;
    const thermoKm = Math.max(110, Math.min(600, firstSatKm * 0.9));
    const layers = [
      { to: tropo, space: [0, 0.25], stars: [0, 0], clouds: true,
        caption: { title: 'The troposphere', when: `up to about ${tropo} km here`,
          line: 'Almost all weather happens in this layer. It is thicker near the equator and thinner near the poles.' } },
      { to: 50, space: [0.25, 0.6], stars: [0, 0.35],
        caption: { title: 'The stratosphere', when: `${tropo} to 50 km`,
          line: 'About 90% of all ozone is here: the ozone layer, which blocks most of the Sun’s harmful ultraviolet light.' } },
      { to: 85, space: [0.6, 0.9], stars: [0.35, 0.8], meteors: true,
        caption: { title: 'The mesosphere', when: '50 to 85 km',
          line: 'Shooting stars burn up here, leaving their bright trails.' } },
      { to: 100, space: [0.9, 1], stars: [0.8, 1], blueEdge: true,
        caption: { title: 'The edge of space', when: '100 km',
          line: 'This is where space is usually said to begin. Below you, the air is a thin blue glow.' } },
      { to: thermoKm, space: [1, 1], stars: [1, 1], dur: 3000,
        caption: { title: 'The thermosphere', when: '85 to 600 km',
          line: 'The Space Station flies here, about 400 km up. Near the poles, auroras glow at these heights.' } },
    ];
    let lastKm = 1;
    for (const L of layers) {
      const fromKm = lastKm; lastKm = L.to;
      scenes.push({
        dur: L.dur || 2600, from: km(fromKm), to: km(L.to), caption: L.caption,
        draw(k) {
          drawBackground(L.space[0] + (L.space[1] - L.space[0]) * ease(k), L.stars[0] + (L.stars[1] - L.stars[0]) * ease(k));
          if (L.clouds) drawClouds(k);
          if (L.meteors) drawMeteors(k);
          if (L.blueEdge) drawBlueEdge(k);
          drawYou(W / 2, youY(), 0, H + 10);
        },
      });
    }

    let last = km(thermoKm), side = 1;
    for (const stop of o.card.stops) {
      if (stop.kind === 'end') continue;
      const caption = { title: stop.title, line: stop.line, when: stop.when, hit: stop.status === 'hit' };
      const to = stop.t > 1e30 ? last : Math.max(last, stop.t);
      const from = last; last = to;
      if (stop.kind === 'milestone') {        // leaving the solar system: Neptune's distance, the Sun's bubble, the Oort Cloud
        scenes.push({
          dur: 2800, from, to, caption,
          draw(k) { drawBackground(1, 1); drawMilestone(stop.id, k); drawYou(W / 2, youY(), 0, H + 10); },
        });
        continue;
      }
      if (stop.status === 'note') {           // e.g. the Moon is below your horizon: words only
        scenes.push({ dur: 2400, from, to, caption, draw() { drawBackground(1, 1); drawYou(W / 2, youY(), 0, H + 10); } });
        continue;
      }
      const stopper = stop.status === 'hit' && (stop.kind === 'moon' || stop.kind === 'sun');
      const thisSide = side; side = -side;
      scenes.push({
        dur: 3300, from, to, caption, arrive: 0.5,    // the counter reaches this stop as it passes you
        draw(k) {
          drawBackground(1, 1);
          const off = sideOffset(stop) * thisSide;
          const R = stop.kind === 'moon' ? 46 : stop.kind === 'sun' ? 64 : stop.kind === 'planet' ? 24 : stop.kind === 'galaxy' ? (stop.status === 'hit' ? W * 0.55 : 70) : stop.kind === 'iss' ? 40 : 20;
          // comes in from the top, slows down as it passes you, then drifts away below
          const u = 2 * k - 1, pass = 0.5 + 0.2 * u + 0.3 * u * u * u;
          let y = youY() + (pass - 0.5) * (H * 1.4 + 3 * R);
          let x = W / 2 + off;
          let glow = 0, scale = 1;
          if (stopper) {
            // the trip ends here: the Moon (or the Sun) comes down to meet you, slowly growing, then everything rests
            const a = ease(clamp01(k / 0.7));
            scale = 1 + a * 1.6;
            y = -R * 2 + (youY() - R * scale - 6 + R * 2) * a;
            x = W / 2;
            glow = a;
          } else if (stop.status === 'hit') {
            glow = clamp01(1 - Math.abs(pass - 0.5) * 3);    // you glow gold while you are inside it
          }
          if (stop.kind === 'moon') drawMoon(x, y, R * scale);
          else if (stop.kind === 'sun') drawSun(x, y, R * scale);
          else if (stop.kind === 'planet') drawPlanet(stop.title, x, y, R);
          else if (stop.kind === 'star') drawStar(x, y);
          else if (stop.kind === 'galaxy') drawGalaxy(x, y, R * 2, stop.shape, stop.status === 'hit');
          else if (stop.kind === 'satellite') drawSatellite(x, y, false);
          else if (stop.kind === 'iss') drawSatellite(x, y, true);
          if (stopper && stop.kind === 'sun') {     // a gentle warm wash, faded in over seconds (no flash)
            cx.fillStyle = `rgba(255,214,140,${0.55 * ease(clamp01((k - 0.4) / 0.6))})`;
            cx.fillRect(0, 0, W, H);
          }
          drawYou(W / 2, youY(), glow, H + 10);
        },
        hold: stopper,
      });
      if (stopper) break;
    }

    const end = o.card.stops[o.card.stops.length - 1];
    const stopped = scenes[scenes.length - 1].hold;
    scenes.push({
      // the counter keeps running a little (x10) to show you keep going, but never past 13.8 billion years
      dur: 3400, from: last, to: stopped ? last : Math.min(last * 10, 13.8e9 * YEAR_S),
      caption: { title: end.title, line: end.line },
      draw(k) {
        if (stopped) { scenes[scenes.length - 2].draw(1); }
        else { drawBackground(1, 1); drawYou(W / 2, youY() - ease(k) * H * 0.1, 0, H + 10); }
        cx.fillStyle = `rgba(5,7,14,${ease(clamp01((k - 0.6) / 0.4))})`;    // slow fade to the results card
        cx.fillRect(0, 0, W, H);
      },
    });
    return scenes;
  }

  function showCaption(c) {
    capBox.classList.remove('show');
    capBox.classList.toggle('hit', !!c.hit);
    capTitle.innerHTML = '';
    capTitle.append(document.createTextNode(c.title || ''));
    if (c.hit) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'Hit'; capTitle.append(' ', b); }
    capLine.textContent = c.line || '';
    capWhen.textContent = c.when || '';
    capWhen.hidden = !c.when;
    void capBox.offsetWidth;      // restart the fade-in
    capBox.classList.add('show');
  }

  // ---------- runner ----------
  function tick(now) {
    if (!run) return;
    if (run.paused) { run.last = now; requestAnimationFrame(tick); return; }      // paused: the film's clock stands still
    const dt = Math.max(0, Math.min(50, now - run.last));   // the first frame can be stamped a hair before play() started
    run.last = now;
    run.elapsed += dt;
    scroll += dt * 0.045;        // steady star drift: about 45 px a second
    followFilm();                // the rocket sound follows the film's clock
    let t = run.elapsed;
    for (let i = 0; i < run.scenes.length; i++) {
      const s = run.scenes[i];
      if (t < s.dur || i === run.scenes.length - 1) {
        const k = clamp01(t / s.dur);
        if (run.current !== i) { run.current = i; showCaption(s.caption); }
        s.draw(k);
        const tt = tripTimeAt(s.from, s.to, clamp01(k / (s.arrive || 1)));
        odoDist.textContent = distanceText(tt);
        odoTime.textContent = `${timeText(tt)} at light speed`;
        if (i === run.scenes.length - 1 && t >= s.dur) { finish(); return; }
        break;
      }
      t -= s.dur;
    }
    requestAnimationFrame(tick);
  }

  // ---------- the zoom film (js/zoom-film.js, 8 Nov 2026): one continuous zoom-out from your front door to the galaxies ----------
  // Same captions, counter, sound and Skip as the scenes above; the pictures come from the zoom.
  function zoomTick(now) {
    if (!run) return;
    if (run.waiting) {               // standing on the ground until Launch is pressed: the film's clock has not started yet
      run.last = now;
      run.zoom.draw(cx, W, H, 0);
      placeLaunch(run.zoom.youOnScreen());
      odoDist.textContent = distanceText(0); odoTime.textContent = `${timeText(0)} at light speed`;
      requestAnimationFrame(zoomTick); return;
    }
    if (run.paused) { run.last = now; requestAnimationFrame(zoomTick); return; }  // paused: the film's clock stands still
    const dt = Math.max(0, Math.min(50, now - run.last));   // on a very slow device the film plays slower rather than jumping
    run.last = now;
    run.elapsed += dt;
    followFilm();
    const t = run.elapsed / 1000, z = run.zoom;
    const e = z.captionAt(t);
    if (run.event !== e) { run.event = e; showCaption({ title: e.title, line: e.line, when: e.when, hit: e.hit }); }
    const km = z.draw(cx, W, H, t);
    const tt = km / LIGHT_KMS;
    odoDist.textContent = distanceText(tt);
    odoTime.textContent = `${timeText(tt)} at light speed`;
    if (t >= z.duration) { finish(); return; }
    requestAnimationFrame(zoomTick);
  }

  // ---------- sound: the rocket at lift-off, fading out as the air thins (no air, no sound) ----------
  // "Large Rocket Engine" by Zovex (Freesound), via Pixabay, Pixabay Content License. 11 seconds long.
  // Web Audio is used (not an <audio> volume), because iPhones ignore volume changes on <audio>.
  const sound = { ctx: null, buffer: null, loading: null, on: true, src: null, gain: null };
  const soundBtn = $('filmSound');

  // Browsers only allow sound after the person has tapped the page, so app.js calls this from each tap that can start a trip.
  function primeSound() {
    try {
      if (!sound.ctx) sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (sound.ctx.state === 'suspended') sound.ctx.resume();
      if (!sound.loading) {
        sound.loading = fetch('sounds/rocket-liftoff.mp3?v=2026-11-04c').then(r => r.arrayBuffer())
          .then(b => new Promise((ok, bad) => sound.ctx.decodeAudioData(b, ok, bad)))
          .then(buf => { sound.buffer = buf; return buf; })
          .catch(() => null);                          // no sound on this browser: the film simply stays silent
      }
    } catch (e) { /* no Web Audio: silent film */ }
  }

  // How loud the rocket should be `e` seconds into the film: full until the stratosphere, then fading, silent at the edge of space.
  const LOUD = 0.75;
  function loudnessAt(e) {
    const { startAt = 0, fadeFrom, silentAt } = run.soundTimes;
    if (e < startAt) return 0;                             // still standing at the door: no rocket yet
    if (e < fadeFrom) return LOUD;
    if (e >= silentAt) return 0;
    return LOUD * (silentAt - e) / (silentAt - fadeFrom);
  }
  // Starts the rumble from `offset` seconds in. After that, followFilm() sets the loudness from the film's own clock
  // every picture, so sound and pictures stay together even if the phone is slow or the sound starts late.
  function startSound(offset) {
    stopSound(0);
    if (!run || !sound.on || !sound.ctx || !sound.buffer || loudnessAt(offset) === 0) return;
    const t0 = sound.ctx.currentTime, g = sound.ctx.createGain(), s = sound.ctx.createBufferSource();
    s.buffer = sound.buffer; s.loop = true;              // loops only if a slow film needs longer than the 11 s recording
    s.connect(g); g.connect(sound.ctx.destination);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(loudnessAt(offset), t0 + 0.3);
    s.start(t0, Math.max(0, offset - (run.soundTimes.startAt || 0)) % sound.buffer.duration);   // the recording starts at lift-off
    sound.src = s; sound.gain = g; sound.startedAt = t0;
  }
  function followFilm() {
    if (!run) return;
    // not playing yet but due (lift-off has come): start it, unless it was switched off
    if (!sound.src) { if (sound.on && sound.buffer && sound.ctx && sound.ctx.state === 'running' && !run.paused && loudnessAt(run.elapsed / 1000) > 0) startSound(run.elapsed / 1000); return; }
    const t = sound.ctx.currentTime;
    if (t < sound.startedAt + 0.32) return;               // let the gentle start finish
    if (run.paused) return;
    const v = loudnessAt(run.elapsed / 1000);
    if (v === 0) { stopSound(0.15); return; }
    sound.gain.gain.setTargetAtTime(v, t, 0.06);
  }
  function stopSound(fade = 0.3) {
    if (!sound.src) return;
    try {
      const t = sound.ctx.currentTime;
      sound.gain.gain.cancelScheduledValues(t);
      sound.gain.gain.setValueAtTime(sound.gain.gain.value, t);
      sound.gain.gain.linearRampToValueAtTime(0, t + fade);
      sound.src.stop(t + fade + 0.05);
    } catch (e) { /* already stopped */ }
    sound.src = null;
  }
  // Where the sound belongs in this film: loud through lift-off and the troposphere, fading through the
  // stratosphere and mesosphere, silent when you reach the edge of space.
  function soundTimes(scenes) {
    let t = 0, fadeFrom = null, silentAt = null;
    for (const s of scenes) {
      if (s.caption && s.caption.title === 'The stratosphere') fadeFrom = t;
      if (s.caption && s.caption.title === 'The edge of space') silentAt = t;
      t += s.dur;
    }
    return { fadeFrom: (fadeFrom || 5800) / 1000, silentAt: (silentAt || 11000) / 1000 };
  }
  function soundNow() {           // (re)start the sound from wherever the film is now, once the sound system is running
    if (!run || !sound.ctx) return;
    const go = () => { if (run) startSound(run.elapsed / 1000); };
    if (sound.ctx.state === 'running') go();
    else sound.ctx.resume().then(go).catch(() => {});
  }
  function showSoundButton() {
    soundBtn.setAttribute('aria-pressed', String(sound.on));
    soundBtn.textContent = sound.on ? 'Sound on' : 'Sound off';
  }
  soundBtn.onclick = () => {
    primeSound();
    sound.on = !sound.on;
    showSoundButton();
    if (sound.on) { if (sound.buffer) soundNow(); else if (sound.loading) sound.loading.then(soundNow); }
    else stopSound(0.2);
  };

  // ---------- Launch (8 Nov 2026, Arman: "let's put a launch button under the character, so the user starts the launch") ----------
  // The zoom film opens with you standing at the start; nothing moves until Launch is pressed (or the space bar).
  const launchBtn = $('filmLaunch');
  function placeLaunch(p) {        // just under your feet, never down on the distance counter
    if (!p) return;
    launchBtn.style.left = `${Math.round(Math.max(70, Math.min(W - 70, p.x)))}px`;
    launchBtn.style.top = `${Math.round(Math.min(p.feet + 26, H - 140))}px`;
  }
  function liftOff() {
    if (!run || !run.waiting) return;
    primeSound();                  // this tap also lets the browser play the rocket sound
    run.waiting = false; run.last = performance.now(); run.event = null;
    launchBtn.hidden = true; pauseBtn.hidden = false;
    pauseBtn.focus({ preventScroll: true });
  }
  launchBtn.onclick = liftOff;

  function finish() {
    if (!run) return;
    launchBtn.hidden = true; pauseBtn.hidden = false;
    stopSound(0.3);
    const done = run.done;
    run = null;
    film.classList.add('leaving');
    setTimeout(() => { film.hidden = true; film.classList.remove('leaving'); document.body.style.overflow = ''; }, 400);
    done();
  }

  const Film = {
    reduceMotion,
    // Plays the film for one trip. Resolves when it ends or is skipped.
    play(o) {
      return new Promise(resolve => {
        if (reduceMotion) { resolve(); return; }
        cx = canvas.getContext('2d');
        size();
        scroll = 0; twinkle = 0; sunAlt = o.sunAltitude;
        run = { scenes: null, elapsed: 0, last: performance.now(), current: -1, done: resolve, paused: false };
        $('filmPause').textContent = 'Pause'; $('filmPause').setAttribute('aria-pressed', 'false');
        // the zoom film when it can be made; otherwise the scenes as before
        let zoom = null;
        if (o.zoom && window.SendMeUpZoom) { try { zoom = window.SendMeUpZoom.create(o.zoom); } catch (e) { console.warn('zoom film not possible, the classic film plays', e); } }
        if (zoom) {
          run.zoom = zoom;
          run.waiting = true;          // until Launch is pressed
          run.event = zoom.ready;
          showCaption(zoom.ready);
          // loud through lift-off and the troposphere, fading through the stratosphere and mesosphere, silent at the edge of space
          // (the captions show 0.7 s before each height, so the sound follows the captions)
          run.soundTimes = { startAt: zoom.liftAt, fadeFrom: zoom.timeAt(tropopauseKm(o.lat)) - 0.7, silentAt: zoom.timeAt(100) - 0.7 };
        } else {
          run.scenes = buildScenes(o);
          run.soundTimes = soundTimes(run.scenes);
        }
        film.hidden = false;
        document.body.style.overflow = 'hidden';
        showSoundButton();
        launchBtn.hidden = !run.waiting; pauseBtn.hidden = !!run.waiting;   // no Pause before lift-off
        (run.waiting ? launchBtn : skipBtn).focus({ preventScroll: true });
        requestAnimationFrame(zoom ? zoomTick : tick);
        // the rocket sound: at once if it is ready, otherwise as soon as it has loaded (if still in the air)
        if (sound.buffer) soundNow();
        else if (sound.loading) sound.loading.then(soundNow);
      });
    },
    primeSound,
    // for the test tools: what the sound is doing right now
    soundInfo: () => ({ on: sound.on, loaded: !!sound.buffer, playing: !!sound.src, gain: sound.gain ? +sound.gain.gain.value.toFixed(2) : 0, ctx: sound.ctx ? sound.ctx.state : 'none' }),
    isPlaying: () => !!run,
    // The homepage picture: a calm night sky, you standing at the launch spot, a dotted path straight up
    // to a glowing galaxy. `ms` makes the stars twinkle and your glow breathe gently (0 = still picture).
    drawHero(heroCanvas, ms) {
      if (run) return;                                    // never while the film is playing
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = heroCanvas.clientWidth, h = heroCanvas.clientHeight;
      if (!w || !h) return;
      if (heroCanvas.width !== Math.round(w * dpr) || heroCanvas.height !== Math.round(h * dpr)) {
        heroCanvas.width = Math.round(w * dpr); heroCanvas.height = Math.round(h * dpr);
      }
      cx = heroCanvas.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h; sunAlt = -20; scroll = 0; twinkle = ms || 0;
      drawBackground(0, 1);
      const gx = W / 2, gy = H * 0.2, groundY = H * 0.86, youY = groundY - 14;
      drawGalaxy(gx, gy, Math.min(W * 0.75, 320), { ratio: 0.36, pa: 122 }, false);
      const glowA = 0.5 + 0.12 * Math.sin((ms || 0) / 1100);
      const halo = cx.createRadialGradient(gx, gy, 0, gx, gy, 46);
      halo.addColorStop(0, rgba(GOLD, glowA)); halo.addColorStop(1, rgba(GOLD, 0));
      cx.fillStyle = halo; cx.beginPath(); cx.arc(gx, gy, 46, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = rgba(YOU, 0.45); cx.lineWidth = 1.5; cx.setLineDash([4, 7]);
      cx.beginPath(); cx.moveTo(gx, youY - 22); cx.lineTo(gx, gy + 14); cx.stroke(); cx.setLineDash([]);
      drawGround(groundY);
      drawYou(W / 2, youY, 0.15 + 0.1 * Math.sin((ms || 0) / 900), groundY);
      cx = canvas.getContext('2d');                       // back to the film canvas
    },
  };
  skipBtn.onclick = finish;
  // Pause: the picture, the counter and the sound stop together; Resume carries on from the same moment. The space bar does the same.
  const pauseBtn = $('filmPause');
  function setPause(on) {
    if (!run) return;
    run.paused = on;
    pauseBtn.textContent = on ? 'Resume' : 'Pause'; pauseBtn.setAttribute('aria-pressed', String(on));
    if (on) stopSound(0.15); else soundNow();
  }
  pauseBtn.onclick = () => setPause(!(run && run.paused));
  window.addEventListener('keydown', e => {
    if (!run) return;
    if (e.key === 'Escape') finish();
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (run.waiting) liftOff(); else setPause(!run.paused); } }
  });
  window.addEventListener('keyup', e => { if (run && (e.key === ' ' || e.code === 'Space')) e.preventDefault(); });   // so the space bar never also presses Skip
  window.addEventListener('resize', () => { if (run) size(); });
  window.SendMeUpFilm = Film;
})();
