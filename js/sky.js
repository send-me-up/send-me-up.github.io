// Send Me Up — sky calculations (no drawing here).
// Answers: if you were sent straight up from (lat, lon) at this moment,
// what would you hit, and what would you only just miss?
//
// Works in the browser (uses window.Astronomy) and in Node (pass the module in).
// Astronomy Engine (MIT) does the hard astronomy; this file only measures angles.

(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const KM_PER_AU = 149597870.7;
  const LIGHT_KMS = 299792.458;
  const SUN_RADIUS_KM = 695700;
  const MOON_RADIUS_KM = 1737.4;
  const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

  // Unit vector for a direction given in degrees (J2000 right ascension / declination)
  function unit(raDeg, decDeg) {
    const ra = raDeg * DEG, dec = decDeg * DEG;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }

  // Angle in degrees between two unit vectors
  function angle(a, b) {
    const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    return Math.acos(d) / DEG;
  }

  function makeEngine(Astronomy, starData, galaxyData) {
    const stars = starData.rows.map(r => ({
      v: unit(r[0], r[1]), raDeg: r[0], decDeg: r[1], mag: r[2], distLy: r[3], label: r[4], con: r[5], named: !!r[6],
      spect: r[7] || '', lumSun: r[8] == null ? null : r[8],        // for the card's facts (colour, light output)
    }));
    const galaxies = galaxyData.rows.map(r => ({
      raDeg: r[0], decDeg: r[1], v: unit(r[0], r[1]),
      a: (r[2] / 2) / 60, b: (r[3] / 2) / 60, pa: r[4],          // half-axes in degrees
      id: r[5], messier: r[6], common: r[7], distMly: r[8], distSource: r[9], hubble: r[10] || '',
    }));

    // The direction "straight up", as a point among the stars (J2000)
    function zenith(time, observer) {
      const rot = Astronomy.Rotation_HOR_EQJ(time, observer);
      const up = Astronomy.RotateVector(rot, new Astronomy.Vector(0, 0, 1, time));
      const eq = Astronomy.EquatorFromVector(up);
      return { v: unit(eq.ra * 15, eq.dec), raDeg: eq.ra * 15, decDeg: eq.dec };
    }

    // Sun, Moon and planets: how close does the straight-up path pass?
    function solarSystem(time, observer, up) {
      return BODIES.map(name => {
        const eq = Astronomy.Equator(name, time, observer, false, true);
        const sep = angle(up.v, unit(eq.ra * 15, eq.dec));
        const distKm = eq.dist * KM_PER_AU;
        const radiusKm = name === 'Sun' ? SUN_RADIUS_KM : name === 'Moon' ? MOON_RADIUS_KM : 0;
        const angRadius = radiusKm ? Math.asin(radiusKm / distKm) / DEG : 0;
        const aboveHorizon = sep < 90;
        return {
          name,
          sepDeg: sep,
          aboveHorizon,
          hit: aboveHorizon && sep <= angRadius,
          // closest the path gets to the body's centre (if it is below the horizon, you fly away from it)
          missKm: aboveHorizon ? distKm * Math.sin(sep * DEG) : distKm,
          distKm,
          lightSeconds: (aboveHorizon ? distKm * Math.cos(sep * DEG) : distKm) / LIGHT_KMS,
          // for the Moon: how much of it is lit right now, and where it is in its cycle (0 new, 180 full)
          ...(name === 'Moon' ? { litFraction: Astronomy.Illumination('Moon', time).phase_fraction, phaseDeg: Astronomy.MoonPhase(time) } : {}),
        };
      }).sort((a, b) => a.sepDeg - b.sepDeg);
    }

    function nearestStars(up) {
      let best = null, bestNamed = null;
      for (const s of stars) {
        const sep = angle(up.v, s.v);
        if (!best || sep < best.sepDeg) best = { star: s, sepDeg: sep };
        if (s.named && (!bestNamed || sep < bestNamed.sepDeg)) bestNamed = { star: s, sepDeg: sep };
      }
      const describe = x => x && Object.assign(x, {
        constellation: Astronomy.Constellation(x.star.raDeg / 15, x.star.decDeg).name,
        missLy: x.star.distLy == null ? null : x.star.distLy * Math.sin(x.sepDeg * DEG),
        arriveYears: x.star.distLy == null ? null : x.star.distLy * Math.cos(x.sepDeg * DEG),
      });
      return { nearest: describe(best), nearestNamed: describe(bestNamed) };
    }

    // Is the straight-up point inside a galaxy's oval outline? Returns a size-relative distance:
    // below 1 = inside (a hit), 1 = exactly on the edge.
    function ovalDistance(up, g) {
      const a0 = g.raDeg * DEG, d0 = g.decDeg * DEG;
      const a = up.raDeg * DEG, d = up.decDeg * DEG;
      const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
      if (cosc <= 0) return Infinity;
      const xi = Math.cos(d) * Math.sin(a - a0) / cosc / DEG;                                   // east, degrees
      const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc / DEG; // north
      const pa = g.pa * DEG;                                      // measured from north towards east
      const along = xi * Math.sin(pa) + eta * Math.cos(pa);
      const across = xi * Math.cos(pa) - eta * Math.sin(pa);
      return Math.hypot(along / g.a, across / g.b);
    }

    function galaxyHits(up) {
      const hits = [];
      let nearest = null, nearestFamous = null;
      for (const g of galaxies) {
        const sep = angle(up.v, g.v);
        if (sep > 12) continue;                 // the largest galaxy outline is ~11 degrees
        const oval = ovalDistance(up, g);
        const item = { galaxy: g, sepDeg: sep, oval };
        if (oval <= 1) hits.push(item);
        if (!nearest || sep < nearest.sepDeg) nearest = item;
        if ((g.messier || g.common) && (!nearestFamous || sep < nearestFamous.sepDeg)) nearestFamous = item;
      }
      hits.sort((x, y) => x.oval - y.oval);
      return { hits, nearest, nearestFamous };
    }

    // Everything at once for one place and moment
    function sendMeUp(lat, lon, date) {
      const time = Astronomy.MakeTime(date);
      const observer = new Astronomy.Observer(lat, lon, 0);
      const up = zenith(time, observer);
      return {
        when: date,
        lat, lon,
        zenith: { raDeg: up.raDeg, decDeg: up.decDeg, constellation: Astronomy.Constellation(up.raDeg / 15, up.decDeg) },
        solarSystem: solarSystem(time, observer, up),
        stars: nearestStars(up),
        galaxies: galaxyHits(up),
      };
    }

    // Times in the next `hours` when the straight-up path goes through a galaxy (for testing and fun facts)
    function findGalaxyPasses(lat, lon, startDate, hours, stepMinutes, filter) {
      const passes = [];
      const observer = new Astronomy.Observer(lat, lon, 0);
      const list = galaxies.filter(filter || (() => true)).filter(g => Math.abs(g.decDeg - lat) < 13);
      let open = new Map();
      for (let m = 0; m <= hours * 60; m += stepMinutes) {
        const date = new Date(startDate.getTime() + m * 60000);
        const up = zenith(Astronomy.MakeTime(date), observer);
        const now = new Set();
        for (const g of list) {
          if (angle(up.v, g.v) > 12) continue;
          const oval = ovalDistance(up, g);
          if (oval <= 1) {
            now.add(g);
            const p = open.get(g);
            if (p) { p.end = date; if (oval < p.bestOval) { p.bestOval = oval; p.best = date; } }
            else open.set(g, { galaxy: g, start: date, end: date, best: date, bestOval: oval });
          }
        }
        for (const [g, p] of open) if (!now.has(g)) { passes.push(p); open.delete(g); }
      }
      for (const p of open.values()) passes.push(p);
      return passes.sort((x, y) => x.start - y.start);
    }

    return { sendMeUp, findGalaxyPasses, zenith, counts: { stars: stars.length, galaxies: galaxies.length } };
  }

  const api = { makeEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SkySendMeUp = api;
})(this);
