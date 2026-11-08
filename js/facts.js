// Send Me Up — one random fact for each stop on the results card.
// Planets, Moon and Sun: hand-picked facts, worded from NASA's fact pages (science.nasa.gov/<planet>/facts/, read 4 Nov 2026).
//   Moon counts are left out on purpose: NASA's numbers keep changing as new moons are found.
// Stars and galaxies: facts worked out from the data itself (HYG: spectral type, light output; OpenNGC: type, size;
//   distances as on the card), so they are right for every one of them.
// Dinosaurs: the non-bird dinosaurs died out 66 million years ago (Natural History Museum, London).
// Satellites: worked out from the orbit data (time for one trip round the Earth, how many passed near your path);
//   the Space Station has been lived on without a break since November 2000 (NASA, Space Station facts and figures).

(function (root) {
  'use strict';

  const n = (x, d = 0) => x.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const sig2 = x => +x.toPrecision(2);
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

  const BODY_FACTS = {
    Mercury: [
      'Mercury is the smallest planet in our solar system, only a bit larger than our Moon.',
      'Mercury races around the Sun every 88 days, faster than any other planet.',
      'On Mercury, days reach 430 °C and nights drop to −180 °C.',
    ],
    Venus: [
      'Venus is the hottest planet: about 467 °C at the surface, even hotter than Mercury.',
      'A day on Venus (243 Earth days) is longer than its year (225 Earth days).',
      'Venus spins the opposite way to most planets, so there the Sun rises in the west.',
    ],
    Mars: [
      'Mars looks red because iron in its rocks and dust has rusted.',
      'Mars has the largest volcano in the solar system, Olympus Mons.',
      'Mars has two small moons, shaped like potatoes.',
    ],
    Jupiter: [
      'Jupiter is so big that about 1,000 Earths could fit inside it.',
      'Jupiter’s Great Red Spot, a giant storm, has been watched for more than 300 years.',
      'A day on Jupiter lasts only 9.9 hours.',
    ],
    Saturn: [
      'Saturn’s rings are made of billions of chunks of ice and rock.',
      'Saturn is the only planet that is, on average, less dense than water.',
      'One year on Saturn lasts about 29 Earth years.',
    ],
    Uranus: [
      'Uranus spins on its side, tilted almost 98 degrees.',
      'One year on Uranus lasts about 84 Earth years.',
      'Uranus gets its blue-green colour from methane gas.',
    ],
    Neptune: [
      'Neptune’s winds are about nine times stronger than Earth’s.',
      'One year on Neptune lasts about 165 Earth years.',
      'Neptune was found in 1846, on the very first night of searching.',
    ],
    Moon: [
      'The Moon is moving about an inch (2.5 cm) farther away from Earth every year.',
      'The same side of the Moon always faces Earth.',
      'In full sunlight the Moon’s surface reaches about 127 °C; in the dark it drops to −173 °C.',
    ],
    Sun: [
      'The Sun is about 100 times wider than Earth.',
      'It would take more than 330,000 Earths to match the mass of the Sun.',
      'The centre of the Sun is about 15 million °C.',
    ],
  };

  // Where the Moon is in its cycle (MoonPhase: 0 = new, 90 = first quarter, 180 = full, 270 = last quarter)
  function moonPhaseName(deg) {
    const names = ['a new Moon', 'a waxing crescent', 'at first quarter', 'a waxing gibbous Moon', 'a full Moon', 'a waning gibbous Moon', 'at last quarter', 'a waning crescent'];
    return names[Math.floor(((deg + 22.5) % 360) / 45)];
  }

  // "M94", "the Andromeda Galaxy", "NGC 6688": a galaxy's name for use inside a sentence
  function galaxyShortName(g) {
    if (g.common) return /^the /i.test(g.common) ? g.common : `the ${g.common}`;
    if (g.messier) return g.messier;
    const m = g.id.match(/^(NGC|IC)0*(\d+.*)$/);
    return m ? `${m[1]} ${m[2]}` : g.id.replace(/^ESO/, 'ESO ');
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // "A0Vvar" -> white star, "M0IIIvar" -> red giant, "M2Ib" -> red supergiant
  function starKind(spect) {
    const m = /^([OBAFGKM])[0-9.]*\s*(Iab|Ia|Ib|III|II|IV|V|I)?/.exec(spect || '');
    if (!m) return null;
    const colour = { O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'red' }[m[1]];
    const size = { Iab: 'supergiant', Ia: 'supergiant', Ib: 'supergiant', I: 'supergiant', III: 'giant', II: 'bright giant', IV: 'subgiant', V: 'star' }[m[2]] || 'star';
    return `${/^[aeiou]/.test(colour) ? 'an' : 'a'} ${colour} ${size}`;
  }

  function lightOutput(lum) {
    if (lum == null) return '';
    if (lum >= 1.5) return `gives off about ${n(sig2(lum))} times as much light as the Sun`;
    if (lum >= 0.7) return 'gives off about as much light as the Sun';
    return `gives off only about ${n(Math.max(1, Math.round(lum * 100)))}% as much light as the Sun`;
  }

  function starFacts(stop, star, now) {
    const s = star.star, facts = [];
    const kind = starKind(s.spect), out = lightOutput(s.lumSun);
    if (kind && out) facts.push(`${s.label} is ${kind} that ${out}.`);
    else if (out) facts.push(`${s.label} ${out}.`);
    if (s.distLy != null) {
      if (s.distLy < 2000) {
        const year = now.getFullYear() - s.distLy, rounded = s.distLy < 40 ? Math.round(year) : Math.round(year / 10) * 10;
        facts.push(`The light you see from ${s.label} left it around ${rounded}.`);
      } else {
        facts.push(`The light you see from ${s.label} left it about ${n(sig2(s.distLy / 1000))} thousand years ago.`);
      }
    }
    if (star.constellation) facts.push(`${s.label} is in the constellation ${star.constellation}.`);
    return facts;
  }

  function galaxyKind(hubble) {
    if (/^(E-S0|S0)/.test(hubble)) return 'a lens-shaped galaxy';
    if (/^SB/.test(hubble)) return 'a barred spiral galaxy';
    if (/^S/.test(hubble)) return 'a spiral galaxy';
    if (/^(E|cD)/.test(hubble)) return 'an elliptical galaxy';
    if (/^I/.test(hubble)) return 'an irregular galaxy';
    return null;
  }

  function galaxyFacts(g) {
    const facts = [], name = cap(galaxyShortName(g));
    const kind = galaxyKind(g.hubble);
    // (No width: catalogue sizes in the sky differ too much between sources to give a trustworthy number.)
    if (kind) facts.push(`${name} is ${kind}.`);
    if (g.distMly != null) {
      const about = g.distSource === 'redshift' ? 'about ' : '';
      const m = sig2(g.distMly);
      const ago = g.distMly >= 1000 ? `${n(g.distMly / 1000, 1)} billion` : `${n(m, m < 10 ? 1 : 0)} million`;
      facts.push(g.distMly >= 66
        ? `The light you see from it left ${about}${ago} years ago: even longer ago than the end of the dinosaurs, 66 million years ago.`
        : `The light you see from it left ${about}${ago} years ago.`);
    }
    return facts;
  }

  // The fact for one stop of the card. `rnd` gives numbers between 0 and 1 (Math.random in the app).
  function factFor(stop, result, rnd = Math.random, now = new Date()) {
    let facts = [];
    if (stop.kind === 'moon' || stop.kind === 'sun' || stop.kind === 'planet') {
      const name = stop.kind === 'moon' ? 'Moon' : stop.kind === 'sun' ? 'Sun' : stop.title;
      facts = (BODY_FACTS[name] || []).slice();
      if (stop.kind === 'moon') {
        const moon = result.solarSystem.find(b => b.name === 'Moon');
        if (moon && moon.litFraction != null) {
          facts.push(`Right now ${n(Math.round(moon.litFraction * 100))}% of the Moon is lit. It is ${moonPhaseName(moon.phaseDeg)}.`);
        }
      }
    } else if (stop.kind === 'star') {
      facts = starFacts(stop, result.stars.nearestNamed, now);
    } else if (stop.kind === 'galaxy' && stop.galaxy) {
      facts = galaxyFacts(stop.galaxy);
    } else if ((stop.kind === 'iss' || (stop.kind === 'satellite' && stop.status !== 'note')) && result.satellites && result.satellites.pass) {
      // Worked out from the orbit data itself; the one NASA fact is from NASA's Space Station facts page.
      const p = result.satellites.pass, s = stop.kind === 'iss' ? p.iss : p.closest;
      if (stop.kind === 'iss') facts.push('People have lived on board the Space Station without a break since November 2000.');
      if (s && s.periodMin) facts.push(`It goes once round the Earth every ${n(Math.round(s.periodMin))} minutes, about ${n(Math.round(1440 / s.periodMin))} times a day.`);
      if (stop.kind === 'satellite' && p.within[1000] > 1) facts.push(`${n(p.within[1000])} satellites passed within 1,000 km of your path.`);
    }
    return facts.length ? pick(facts, rnd) : '';
  }

  const api = { factFor, starKind, galaxyKind, moonPhaseName, BODY_FACTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SendMeUpFacts = api;
})(this);
