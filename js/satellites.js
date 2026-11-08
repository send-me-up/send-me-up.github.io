// Send Me Up — satellites: which one came closest to your straight-up path, and where the Space Station was.
//
// At the speed of light you pass every satellite in under 1/8 of a second, so each satellite is taken where it was
// at the moment you set off. Positions come from satellite.js (MIT; SGP4, the standard model for this orbit data),
// with orbit data from CelesTrak (data/satellites.json, made by tools/fetch-satellites.mjs).
//
// Works in the browser and in Node: the satellite.js functions are passed in, like Astronomy Engine in sky.js.

(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const LIGHT_KMS = 299792.458;
  const ISS = 25544;                     // the International Space Station's catalogue number (its first module, Zarya)
  // The space stations: CelesTrak also lists their other modules and docked spacecraft (Soyuz, Progress, Dragon…)
  // as separate objects with the same orbit. Anything within 1 km of a station counts as part of it, not as a satellite of its own.
  const STATIONS = [ISS, 48274];         // 48274: Tianhe, the core of China's Tiangong station
  const ATTACHED_KM = 1;
  // Two limits, so "the closest satellite" stays true:
  // - the copy as a whole: more than 3 days from the moment of the trip, and no satellite is offered at all
  //   (if only some satellites counted, a nearer one could be missing from the comparison);
  // - each satellite: orbit data more than 7 days from the moment is left out, because its position could be far off
  //   (about 1% of the list when it was first downloaded: objects not tracked recently).
  const MAX_AGE_DAYS = 3, MAX_SAT_AGE_DAYS = 7;

  // lib: { json2satrec, propagate, gstime, eciToEcf, geodeticToEcf } from satellite.js
  function makeSatellites(lib, data) {
    const base = Date.parse(data.fetched);
    const sats = [];
    let unusable = 0;
    for (const r of data.rows) {
      const epochMs = base + r[2] * 864e5;
      const omm = { OBJECT_NAME: r[0], NORAD_CAT_ID: r[1], EPOCH: new Date(epochMs).toISOString(),
        MEAN_MOTION: r[3], ECCENTRICITY: r[4], INCLINATION: r[5], RA_OF_ASC_NODE: r[6], ARG_OF_PERICENTER: r[7], MEAN_ANOMALY: r[8], BSTAR: r[9],
        MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 };     // not used by the SGP4 calculation (see tools/fetch-satellites.mjs)
      try {
        const rec = lib.json2satrec(omm);
        if (rec.error) { unusable++; continue; }
        sats.push({ name: r[0], norad: r[1], epochMs, inclination: r[5], periodMin: 1440 / r[3], rec });
      } catch (e) { unusable++; }
    }

    // Everything at once for one place and moment.
    // missKm: how close the satellite came to your path; heightKm: how far up your path that was.
    function pass(lat, lon, date) {
      const gmst = lib.gstime(date);
      const phi = lat * DEG, lam = lon * DEG;
      const here = lib.geodeticToEcf({ latitude: phi, longitude: lam, height: 0 });
      // "Straight up" here is the direction away from the ground, square to the Earth's surface at your place.
      const up = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
      const fetchedAgeDays = (date - base) / 864e5;
      let closest = null, iss = null, used = 0, tooOld = 0, failed = 0;
      const within = { 10: 0, 100: 0, 1000: 0 };
      if (Math.abs(fetchedAgeDays) > MAX_AGE_DAYS) {
        return { closest, iss, within, used, tooOld: sats.length, failed, unusable, fetchedAgeDays, fetched: data.fetched, stale: true };
      }
      const where = s => {
        const pv = lib.propagate(s.rec, date);
        return pv && pv.position && typeof pv.position === 'object' && Number.isFinite(pv.position.x) ? lib.eciToEcf(pv.position, gmst) : null;
      };
      const stations = sats.filter(s => STATIONS.includes(s.norad)).map(where).filter(Boolean);
      let attached = 0;
      for (const s of sats) {
        const ageDays = Math.abs(date - s.epochMs) / 864e5;
        if (ageDays > MAX_SAT_AGE_DAYS) { tooOld++; continue; }
        const p = where(s);
        if (!p) { failed++; continue; }
        if (!STATIONS.includes(s.norad) && stations.some(q => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < ATTACHED_KM)) { attached++; continue; }
        const d = [p.x - here.x, p.y - here.y, p.z - here.z];
        const along = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
        const rangeKm = Math.hypot(d[0], d[1], d[2]);
        used++;
        // Below your horizon plane: you fly away from it, so the closest it gets is where it is from you now.
        const missKm = along > 0 ? Math.hypot(d[0] - along * up[0], d[1] - along * up[1], d[2] - along * up[2]) : rangeKm;
        // heightKm: how far up YOUR path you are when it comes closest (sets the moment in the film);
        // altitudeKm (filled in below for the ones shown): how high the satellite itself flies above the ground.
        const item = { name: s.name, norad: s.norad, missKm, heightKm: Math.max(0, along), rangeKm, aboveHorizon: along > 0,
          seconds: Math.max(0, along) / LIGHT_KMS, ageDays, periodMin: s.periodMin, ecf: p };
        if (s.norad === ISS) iss = item;
        if (along > 0) {
          for (const k of [10, 100, 1000]) if (missKm < k) within[k]++;
          if (!closest || missKm < closest.missKm) closest = item;
        }
      }
      // the height above the ground (on the Earth's real, slightly flattened shape); satellite.js turns an Earth-fixed
      // position into latitude, longitude and height when the Earth's turn angle is given as 0
      for (const it of [closest, iss]) if (it && it.altitudeKm == null) it.altitudeKm = lib.eciToGeodetic(it.ecf, 0).height;
      return { closest, iss, within, used, tooOld, failed, attached, unusable, fetchedAgeDays, fetched: data.fetched };
    }

    // For drawing (the zoom test): every usable satellite's position at that moment, in km from you,
    // along east, north and up. Same age limits as pass(); null if the copy is too old.
    function cloud(lat, lon, date) {
      if (Math.abs(date - base) / 864e5 > MAX_AGE_DAYS) return null;
      const gmst = lib.gstime(date);
      const phi = lat * DEG, lam = lon * DEG;
      const here = lib.geodeticToEcf({ latitude: phi, longitude: lam, height: 0 });
      const E = [-Math.sin(lam), Math.cos(lam), 0];
      const N = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];
      const U = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
      const xyz = new Float32Array(sats.length * 3), norads = new Int32Array(sats.length);
      let k = 0;
      for (const s of sats) {
        if (Math.abs(date - s.epochMs) / 864e5 > MAX_SAT_AGE_DAYS) continue;
        const pv = lib.propagate(s.rec, date);
        if (!pv || !pv.position || typeof pv.position !== 'object' || !Number.isFinite(pv.position.x)) continue;
        const p = lib.eciToEcf(pv.position, gmst), d = [p.x - here.x, p.y - here.y, p.z - here.z];
        xyz[k * 3] = d[0] * E[0] + d[1] * E[1] + d[2] * E[2];
        xyz[k * 3 + 1] = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
        xyz[k * 3 + 2] = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
        norads[k] = s.norad; k++;
      }
      // where the Earth's centre is, in the same km east / north / up from you
      const c = [-here.x, -here.y, -here.z];
      return { xyz: xyz.subarray(0, k * 3), norads: norads.subarray(0, k), count: k,
        earthCentre: [c[0] * E[0] + c[1] * E[1] + c[2] * E[2], c[0] * N[0] + c[1] * N[1] + c[2] * N[2], c[0] * U[0] + c[1] * U[1] + c[2] * U[2]] };
    }

    return { pass, cloud, count: sats.length, unusable };
  }

  const api = { makeSatellites, ISS, STATIONS, MAX_AGE_DAYS, MAX_SAT_AGE_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SendMeUpSatellites = api;
})(this);
