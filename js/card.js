// Send Me Up — turns the sky calculations (sky.js) into the results card's story.
// Only words and choices live here; index.html does the drawing.
//
// Card rules:
// - Stops are listed in trip order: satellites and the Space Station, Moon, nearest planet, nearest named star, galaxy, "keep going".
// - A hit is gold. Everything else is an honest near miss, with how far and how long into the trip.
// - Angles are given in "Moon-widths" (the full Moon is about half a degree wide), not degrees.
// - The headline picks the most exciting moment: a hit first, then the closest famous near miss.

(function (root) {
  'use strict';

  const MOON_WIDTH_DEG = 0.52;
  const KM_PER_LY = 9.4607e12;
  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

  const n = (x, digits = 0) => x.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });

  function nice(x) {
    if (x >= 100) return n(x);
    if (x >= 10) return n(x, 0);
    return n(x, 1);
  }

  // How far off your path, in Moon-widths: "about 3 Moon-widths off"
  function moonWidths(deg) {
    const w = deg / MOON_WIDTH_DEG;
    if (w < 1) return 'less than one Moon-width off';
    if (w < 1.5) return 'about one Moon-width off';
    return `about ${n(w)} Moon-widths off`;
  }

  // "1 minute", "3 minutes", "1.0 second"
  const unit = (text, word) => `${text} ${text === '1' || text === '1.0' ? word : word + 's'}`;

  function tripTime(seconds) {
    if (seconds < 1) return 'a split second';
    if (seconds < 60) return unit(n(seconds, 1), 'second');
    if (seconds < 3600) return unit(n(seconds / 60), 'minute');
    if (seconds < 86400 * 2) return unit(n(seconds / 3600, 1), 'hour');
    return unit(n(seconds / 86400), 'day');
  }

  function years(y) {
    if (y >= 1e9) return `${nice(y / 1e9)} billion years`;
    if (y >= 1e6) return `${nice(y / 1e6)} million years`;
    return `${nice(y)} years`;
  }

  function bigKm(km) {
    if (km >= 1e12) return `${nice(km / 1e12)} trillion km`;
    if (km >= 1e9) return `${nice(km / 1e9)} billion km`;
    if (km >= 1e6) return `${nice(km / 1e6)} million km`;
    return `${n(Math.round(km / 1000) * 1000)} km`;
  }

  // "NGC0224" -> "NGC 224", "IC0342" -> "IC 342"
  function catalogueName(id) {
    const m = id.match(/^(NGC|IC)0*(\d+.*)$/);
    return m ? `${m[1]} ${m[2]}` : id.replace(/^ESO/, 'ESO ');
  }

  function galaxyName(g) {
    if (g.common) return (/^the /i.test(g.common) ? g.common : `the ${g.common}`) + (g.messier ? ` (${g.messier})` : '');
    if (g.messier) return `galaxy ${g.messier}`;
    return `galaxy ${catalogueName(g.id)}`;
  }

  function galaxyDistance(g) {
    if (g.distMly == null) return '';
    const far = g.distMly >= 1000 ? `${nice(g.distMly / 1000)} billion` : `${nice(g.distMly)} million`;
    return (g.distSource === 'redshift' ? 'about ' : '') + `${far} light years away`;
  }

  const famous = g => !!(g.messier || g.common);
  const YEAR_S = 3.15576e7;
  const AU_LIGHT_S = 499.005;          // light needs about 499 seconds to cross 1 AU (the Earth–Sun distance)

  // Leaving the solar system: the same landmarks on every trip (distances from the Sun, NASA; read 4 Nov 2026).
  // Neptune 30 AU and the Kuiper Belt beyond it; Voyager 1 entered interstellar space on 25 Aug 2012 at about 122 AU;
  // the Oort Cloud's outer edge is estimated at about 100,000 AU, and the solar system's boundary lies beyond it.
  const MILESTONES = [
    { id: 'neptune', au: 30, title: 'Past the last planet',
      line: 'You are now as far out as Neptune, 30 times farther from the Sun than Earth. Just beyond lies the Kuiper Belt, the icy home of Pluto.' },
    { id: 'heliopause', au: 122, title: 'Into interstellar space',
      line: 'You leave the Sun’s bubble of solar wind. Voyager 1 crossed here in 2012, 35 years after its launch. You took less than a day.' },
    { id: 'oort', au: 100000, title: 'You have left the solar system',
      line: 'You pass the outer edge of the Oort Cloud, a giant shell of icy comets around the Sun. From here on, you are among the stars.' },
  ];
  // Satellites: distances are rounded, because the orbit data is good to about a kilometre (checked against NASA on the
  // Space Station: within 1.1 km for a day). So the card never claims a satellite hit.
  const ISS = 25544;
  function aboutKm(km) {
    if (km < 1) return 'under 1 km';
    if (km < 100) return `about ${n(Math.round(km))} km`;
    if (km < 1000) return `about ${n(Math.round(km / 10) * 10)} km`;
    return `about ${n(Math.round(km / 100) * 100)} km`;
  }
  // '[DTC]' in CelesTrak's names marks Starlink's direct-to-phone satellites: left out of the name, said in words instead
  const satelliteName = name => name === 'CSS (TIANHE)' ? 'Tiangong, China’s space station'
    : name.replace(/\s*\[DTC\]$/, '').replace(/^STARLINK-/, 'Starlink-').replace(/^ONEWEB-/, 'OneWeb-');
  function satelliteKind(name) {
    if (/^STARLINK.*\[DTC\]$/.test(name)) return 'one of SpaceX’s Starlink satellites that connect straight to mobile phones';
    if (/^STARLINK/.test(name)) return 'one of SpaceX’s Starlink internet satellites';
    if (/^ONEWEB/.test(name)) return 'one of the OneWeb internet satellites';
    return '';
  }
  function dataAge(hours) {
    if (hours < 1) return 'under an hour old';
    if (hours < 48) return `${n(Math.round(hours))} hour${Math.round(hours) === 1 ? '' : 's'} old`;
    return `${n(Math.round(hours / 24))} days old`;
  }
  const galaxyTime = g => g.distMly == null ? 1e40 : g.distMly * 1e6 * YEAR_S;
  const shape = g => ({ ratio: g.b / g.a, pa: g.pa });     // for drawing the galaxy in the film

  function buildCard(result) {
    const stops = [];
    const sun = result.solarSystem.find(b => b.name === 'Sun');
    const moon = result.solarSystem.find(b => b.name === 'Moon');
    const planet = result.solarSystem.find(b => PLANETS.includes(b.name) && b.aboveHorizon);
    const star = result.stars.nearestNamed;
    const gal = result.galaxies;
    const galaxyHits = gal.hits.slice().sort((a, b) => (famous(b.galaxy) - famous(a.galaxy)) || (a.oval - b.oval));

    // The Sun (only ever matters if you hit it — tropics, around noon)
    // Each stop carries t = seconds into the trip, so the card can list them in trip order.
    if (sun.hit) {
      stops.push({ kind: 'sun', title: 'The Sun', status: 'hit', t: sun.lightSeconds, sepDeg: sun.sepDeg,
        line: 'You fly straight into the Sun.',
        when: `${tripTime(sun.lightSeconds)} into your trip` });
    }

    // Satellites (result.satellites is added by the page: { status: 'ok' | 'old' | 'missing', pass })
    const sat = result.satellites;
    const closest = sat && sat.status === 'ok' ? sat.pass.closest : null;
    const iss = sat && sat.status === 'ok' ? sat.pass.iss : null;
    if (sat && sat.status === 'ok') {
      // the age of that satellite's own orbit data at the moment of the trip: it sets how exact the distance can be
      const age = s => `orbit data ${dataAge(s.ageDays * 24)}`;
      if (closest && closest.norad !== ISS) {
        const kind = satelliteKind(closest.name);
        stops.push({ kind: 'satellite', title: satelliteName(closest.name), status: 'miss', t: closest.seconds, missKm: closest.missKm,
          line: `The closest satellite to your path${kind ? `, ${kind}` : ''}. It missed you by ${aboutKm(closest.missKm)}. It flies ${n(Math.round(closest.altitudeKm))} km above the ground.`,
          when: `${tripTime(closest.seconds)} into your trip · ${age(closest)}` });
      }
      if (iss && iss.aboveHorizon) {
        stops.push({ kind: 'iss', title: 'The Space Station', status: 'miss', t: iss.seconds, missKm: iss.missKm,
          line: `The International Space Station missed your path by ${aboutKm(iss.missKm)}. It flies ${n(Math.round(iss.altitudeKm))} km above the ground.${closest && closest.norad === ISS ? ' No satellite came closer.' : ''}`,
          when: `${tripTime(iss.seconds)} into your trip · ${age(iss)}` });
      } else if (iss) {
        stops.push({ kind: 'iss', title: 'The Space Station', status: 'note', t: 0,
          line: `Below your horizon right now, ${aboutKm(iss.rangeKm)} from you, so you fly away from it.`, when: '' });
      }
    } else if (sat) {
      stops.push({ kind: 'satellite', title: 'Satellites', status: 'note', t: 0, when: '',
        line: sat.status === 'old'
          ? 'Left out this time: our satellite data is too old to say how close they came.'
          : 'Left out this time: the satellite list could not be loaded.' });
    }

    // The Moon
    if (moon.hit) {
      stops.push({ kind: 'moon', title: 'The Moon', status: 'hit', t: moon.lightSeconds, sepDeg: moon.sepDeg,
        line: `You land on the Moon, ${bigKm(moon.distKm)} away.`,
        when: `${tripTime(moon.lightSeconds)} into your trip` });
    } else if (moon.aboveHorizon) {
      stops.push({ kind: 'moon', title: 'The Moon', status: 'miss', t: moon.lightSeconds, sepDeg: moon.sepDeg,
        line: `It was ${moonWidths(moon.sepDeg)} your path. Closest you get: ${bigKm(moon.missKm)}.`,
        when: `${tripTime(moon.lightSeconds)} into your trip` });
    } else {
      stops.push({ kind: 'moon', title: 'The Moon', status: 'note', t: 0, sepDeg: moon.sepDeg,
        line: 'Below your horizon right now, so you fly away from it.', when: '' });
    }

    // The planet closest to your path (if any is up)
    if (planet) {
      stops.push({ kind: 'planet', title: planet.name, status: 'miss', t: planet.lightSeconds, sepDeg: planet.sepDeg,
        line: `The closest planet to your path. You pass it ${bigKm(planet.missKm)} away.`,
        when: `${tripTime(planet.lightSeconds)} into your trip` });
    }

    // The nearest star that has a name
    if (star) {
      const miss = star.missLy == null ? '' :
        ` You miss it by ${nice(star.missLy)} light years (${bigKm(star.missLy * KM_PER_LY)}).`;
      stops.push({ kind: 'star', title: star.star.label, status: 'miss', sepDeg: star.sepDeg,
        t: star.arriveYears == null ? 1e30 : star.arriveYears * YEAR_S,
        line: `The nearest named star to your path, ${moonWidths(star.sepDeg)}.${miss}`,
        when: star.arriveYears == null ? '' : `${years(star.arriveYears)} into your trip` });
    }

    // Galaxies: hits first; otherwise the closest famous one (or the closest of all)
    for (const h of galaxyHits.slice(0, 2)) {
      const d = galaxyDistance(h.galaxy);
      stops.push({ kind: 'galaxy', title: cap(galaxyName(h.galaxy)), status: 'hit', t: galaxyTime(h.galaxy), sepDeg: h.sepDeg, shape: shape(h.galaxy), galaxy: h.galaxy,
        line: `You fly straight through it${d ? `, ${d}` : ''}.`,
        when: h.galaxy.distMly == null ? '' : `${years(h.galaxy.distMly * 1e6)} into your trip` });
    }
    if (!galaxyHits.length) {
      const g = gal.nearestFamous || gal.nearest;
      if (g) {
        const d = galaxyDistance(g.galaxy);
        stops.push({ kind: 'galaxy', title: cap(galaxyName(g.galaxy)), status: 'miss', t: galaxyTime(g.galaxy), sepDeg: g.sepDeg, shape: shape(g.galaxy), galaxy: g.galaxy,
          line: `The closest ${gal.nearestFamous ? 'famous ' : ''}galaxy to your path, ${moonWidths(g.sepDeg)}.${d ? ` It's ${d}.` : ''}`,
          when: '' });
      }
    }

    for (const m of MILESTONES) {
      const t = m.au * AU_LIGHT_S;
      stops.push({ kind: 'milestone', id: m.id, title: m.title, status: 'note', t, line: m.line,
        when: `about ${t < YEAR_S ? `${Math.round(t / 3600)} hours` : years(t / YEAR_S)} into your trip` });
    }

    stops.sort((a, b) => a.t - b.t);

    // Hitting the Sun or the Moon ends the trip; flying through a galaxy does not (galaxies are mostly empty space).
    const stopper = stops.findIndex(s => s.status === 'hit' && (s.kind === 'sun' || s.kind === 'moon'));
    if (stopper >= 0) {
      const what = stops[stopper].kind;
      stops.length = stopper + 1;
      stops.push({ kind: 'end', title: 'Trip over', status: 'note', t: Infinity, when: '',
        line: what === 'moon' ? 'You landed on the Moon. Not a bad place to stop!'
          : 'The Sun stopped you. Good thing this trip is only pretend.' });
    } else {
      stops.push({ kind: 'end', title: '…and you keep going', status: 'note', t: Infinity, when: '',
        line: 'Space is so empty that nothing stops you. You keep flying, forever.' });
    }

    return { headline: headline(), subline: `You set off towards ${result.zenith.constellation.name}`, stops };

    function headline() {
      const famousHit = galaxyHits.find(h => famous(h.galaxy));
      if (sun.hit) return 'You flew straight into the Sun!';
      if (moon.hit) return 'You hit the Moon!';
      if (famousHit) return `You flew straight through ${galaxyName(famousHit.galaxy)}!`;
      if (iss && iss.aboveHorizon && iss.missKm < 50) return 'You almost hit the Space Station!';
      if (galaxyHits.length) return `You flew straight through ${galaxyName(galaxyHits[0].galaxy)}!`;
      if (closest && closest.missKm < 1) return 'A satellite missed you by under 1 km!';
      if (star && star.sepDeg < 1) return `You almost hit ${star.star.label}!`;
      if (gal.nearestFamous && gal.nearestFamous.sepDeg < 3) return `You just missed ${galaxyName(gal.nearestFamous.galaxy)}!`;
      if (moon.aboveHorizon && moon.sepDeg < 5) return 'You nearly clipped the Moon!';
      return 'A clean miss — space is mostly empty!';
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  const api = { buildCard, moonWidths, tripTime, galaxyName, aboutKm, satelliteName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SendMeUpCard = api;
})(this);
