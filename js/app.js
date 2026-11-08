// Send Me Up — page logic: where you start from, the button, and drawing the results card.
// Test links: index.html?lat=41.0082&lon=28.9784&name=Istanbul&tz=Europe/Istanbul&t=2026-11-03T19:55:00Z

(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let mode = 'gps';        // where you start from: 'gps' (your device's position) or 'town'
  let place = null;        // the starting point of the current trip: { lat, lon, name, country?, tz? }
  let town = null;         // the town picked in the box, kept while you switch back and forth
  let fixedTime = null;    // only for test links (?t=…); normally "now"

  const params = new URLSearchParams(location.search);
  if (params.has('lat') && params.has('lon')) {
    town = place = { lat: +params.get('lat'), lon: +params.get('lon'), name: params.get('name') || '', tz: params.get('tz') || '' };
    mode = 'town';
  }
  if (params.has('t') && !isNaN(new Date(params.get('t')))) fixedTime = new Date(params.get('t'));

  const towns = SendMeUpPlaces.makeSearch('data/places/');
  let starData = null;     // the named stars, loaded at the very end of this file ("start-up")

  // Reads a list from this site. A failed read throws, so the caller can explain it to the person.
  const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

  // Galaxies come in bands of 10° of declination. Only galaxies within 13° of your latitude can be
  // near straight up, so a phone loads just those few bands (about 55 KB instead of 216 KB).
  const bandCache = new Map();
  const loadBand = b => {
    if (!bandCache.has(b)) {
      const p = getJson(`data/galaxies/band${b}.json`).then(d => d.rows);
      p.catch(() => bandCache.delete(b));               // a failed read is not kept, so trying again can work
      bandCache.set(b, p);
    }
    return bandCache.get(b);
  };
  // Satellites: the list (data/satellites.json, refreshed from CelesTrak) and satellite.js are loaded in the background
  // as soon as the page opens, so they are usually ready by the time you press the button. The list is the same for
  // every visitor. If it can't be loaded, trips still work and the card says satellites were left out.
  let satellitesP = null;
  function loadSatellites() {
    if (!satellitesP) {
      satellitesP = Promise.all([
        import('../vendor/satellite-js/io.js'), import('../vendor/satellite-js/propagation.js'), import('../vendor/satellite-js/transforms.js'),
        getJson('data/satellites.json'),
      ]).then(([io, prop, tr, data]) => SendMeUpSatellites.makeSatellites({ ...io, ...prop, ...tr }, data));
      satellitesP.catch(() => { satellitesP = null; });   // a failed load is not kept, so the next trip tries again
    }
    return satellitesP;
  }
  // Waits at most `ms` for the satellites; null if they are not there by then (the trip goes ahead without them).
  function satellitesWithin(ms) {
    return Promise.race([loadSatellites().catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);
  }

  let skyFor = { key: '', engine: null };
  async function skyEngine(lat) {
    const lo = Math.max(-9, Math.floor((lat - 13) / 10)), hi = Math.min(8, Math.floor((lat + 13) / 10));
    const key = `${lo}:${hi}`;
    if (skyFor.key !== key) {
      const rows = [];
      for (let b = lo; b <= hi; b++) rows.push(...await loadBand(b));
      skyFor = { key, engine: SkySendMeUp.makeEngine(Astronomy, starData, { rows }) };
    }
    return skyFor.engine;
  }

  function placeText(p) {
    if (p.name) return p.country ? `${p.name}, ${p.country}` : p.name;
    const lat = `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? 'E' : 'W'}`;
    return `your location (${lat}, ${lon})`;
  }

  function showFrom() {
    if (mode === 'gps') {
      $('from').textContent = place && !place.name ? `From ${placeText(place)}` : 'Your position is used only on this device.';
    } else {
      $('from').textContent = town ? `From ${placeText(town)}` : 'Type a town in the box below.';
    }
  }

  // The two choices under the button. Choosing "My location" sends you up straight away;
  // choosing "Type a town" opens the box, and picking a town sends you up.
  function setMode(m, focusBox) {
    mode = m;
    for (const [id, on] of [['srcGps', m === 'gps'], ['srcTown', m === 'town']]) {
      $(id).setAttribute('aria-checked', String(on));
      $(id).tabIndex = on ? 0 : -1;                 // one stop for the Tab key, like any radio group
    }
    $('places').hidden = m !== 'town';
    if (m === 'town') { towns.ready().catch(() => {}); if (focusBox) $('town').focus(); }
    showFrom();
  }

  function say(text) { $('msg').textContent = text; $('msg').hidden = !text; }

  function askLocation() {
    if (!navigator.geolocation) { say('This browser cannot share your location. Type a town instead.'); setMode('town', true); return; }
    say('Asking for your location…');
    // maximumAge 0: always a fresh position, never one the browser kept from earlier
    navigator.geolocation.getCurrentPosition(
      pos => { say(''); place = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: '' }; showFrom(); launch(); },
      () => { say('No location, no problem: type a town instead.'); setMode('town', true); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
  }

  $('srcGps').onclick = () => { SendMeUpFilm.primeSound(); setMode('gps', false); askLocation(); };
  $('srcTown').onclick = () => setMode('town', true);
  $('srcGps').parentElement.addEventListener('keydown', e => {       // arrow keys switch between the two
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = mode === 'gps' ? 'town' : 'gps';
    setMode(next, false);
    $(next === 'gps' ? 'srcGps' : 'srcTown').focus();
  });
  $('go').onclick = () => {
    SendMeUpFilm.primeSound();          // a tap: browsers now allow the rocket sound
    if (mode === 'gps') askLocation();
    else if (town) { place = town; launch(); }
    else { say('Type a town first, or choose My location.'); $('town').focus(); }
  };

  // ---------- town search box ----------
  let results = [], active = -1, typingTimer = 0, searchNo = 0;

  function closeSuggest() {
    results = []; active = -1;
    $('suggest').hidden = true; $('suggest').innerHTML = '';
    $('town').setAttribute('aria-expanded', 'false');
    $('town').removeAttribute('aria-activedescendant');
  }

  function drawSuggest(info) {
    const ul = $('suggest');
    if (info) {
      ul.innerHTML = `<li class="info" role="presentation">${esc(info)}</li>`;
    } else {
      ul.innerHTML = results.map((p, i) => {
        const where = [p.region && p.region !== p.name ? p.region : '', p.country].filter(Boolean).join(', ');
        const also = p.otherName ? ` · also called ${p.otherName}` : '';
        return `<li role="option" id="opt${i}" aria-selected="${i === active}" data-i="${i}">
          <b>${esc(p.name)}</b> <span class="where">${esc(where + also)}</span></li>`;
      }).join('');
    }
    ul.hidden = false;
    $('town').setAttribute('aria-expanded', 'true');
    if (active >= 0) $('town').setAttribute('aria-activedescendant', 'opt' + active);
  }

  async function runSearch() {
    const text = $('town').value;
    const mine = ++searchNo;
    if (SendMeUpPlaces.fold(text).length < 2) { closeSuggest(); return; }
    let found;
    try {
      found = await towns.find(text, 8);
    } catch (e) {
      if (mine === searchNo) { results = []; active = -1; drawSuggest('Could not load the town list. Please check your internet connection.'); }
      return;
    }
    if (mine !== searchNo) return;                 // a newer search has started
    results = found; active = found.length ? 0 : -1;
    if (found.length) drawSuggest();
    else drawSuggest(towns.needsMore(text) ? 'Keep typing…' : 'No town with that name in our list. Try the nearest bigger town.');
  }

  $('town').addEventListener('input', () => { clearTimeout(typingTimer); typingTimer = setTimeout(runSearch, 120); });
  $('town').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { active = (active + 1) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && results.length) { active = (active - 1 + results.length) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { pick(results[active]); e.preventDefault(); }
    else if (e.key === 'Escape') closeSuggest();
  });
  // pointerdown (not click) so the choice lands before the box loses focus
  $('suggest').addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(results[+li.dataset.i]); }
  });
  $('town').addEventListener('blur', () => setTimeout(closeSuggest, 150));

  function pick(p) {
    SendMeUpFilm.primeSound();
    town = place = { lat: p.lat, lon: p.lon, name: p.name, country: p.country, tz: p.tz, population: p.population };
    $('town').value = '';
    closeSuggest();
    say('');
    showFrom();
    launch();
  }

  // ---------- the card ----------
  function timeText(when, p) {
    const opts = { dateStyle: 'medium', timeStyle: 'short' };
    if (p.tz) {
      try { return `${when.toLocaleString('en-GB', { ...opts, timeZone: p.tz })} local time`; } catch (e) { /* unknown zone: fall through */ }
    }
    return when.toLocaleString('en-GB', opts);
  }

  let filmOpts = null, busy = false, listsFailed = false;

  async function launch() {
    if (busy) return;
    if (!starData) { say(starData === null && !listsFailed ? 'One moment: still getting the stars ready…' : 'The star lists could not be loaded, so the trip cannot start.'); return; }
    busy = true;
    $('go').disabled = true;
    let engine, sats;
    const slow = setTimeout(() => say('One moment: getting the satellites ready…'), 600);
    try {
      [engine, sats] = await Promise.all([skyEngine(place.lat), satellitesWithin(8000)]);
      say('');
    } catch (e) {
      say('Could not load the sky for this place. Please check your internet connection and try again.');
      return;
    } finally {
      clearTimeout(slow);         // so the waiting message can never cover an error message
      busy = false;
      $('go').disabled = false;
    }
    const when = fixedTime || new Date();
    const result = engine.sendMeUp(place.lat, place.lon, when);
    if (sats) {
      const p = sats.pass(place.lat, place.lon, when);
      result.satellites = { status: p.used ? 'ok' : 'old', pass: p };     // 'old': every satellite's orbit data is too old for that moment
    } else {
      result.satellites = { status: 'missing' };
    }
    const card = SendMeUpCard.buildCard(result);
    $('headline').textContent = card.headline;
    $('subline').textContent = card.subline;
    $('stamp').textContent = `${placeText(place)} · ${timeText(when, place)}`;
    $('trip').innerHTML = card.stops.map(s => {
      const fact = s.kind === 'end' ? '' : SendMeUpFacts.factFor(s, result, Math.random, when);   // a random fact for each stop
      return `
      <li class="stop ${s.status} ${s.kind}">
        <span class="dot" aria-hidden="true"></span>
        <h3>${esc(s.title)}${s.status === 'hit' ? ' <span class="badge">Hit</span>' : ''}</h3>
        <p>${esc(s.line)}</p>
        ${s.when ? `<div class="when">${esc(s.when)}</div>` : ''}
        ${fact ? `<p class="fact">${esc(fact)}</p>` : ''}
      </li>`;
    }).join('');
    const sun = result.solarSystem.find(b => b.name === 'Sun');
    filmOpts = { card, sunAltitude: 90 - sun.sepDeg, placeName: place.name || 'where you stand', lat: place.lat };
    // the zoom film: everything it shows is from this trip (place, moment, card, stars, satellites)
    if (window.SendMeUpZoom) {
      await Promise.race([SendMeUpZoom.loadAssets(), new Promise(r => setTimeout(r, 4000))]);   // the maps and planet pictures, usually loaded long ago
      const ok = sats && result.satellites.status === 'ok';
      filmOpts.zoom = { lat: place.lat, lon: place.lon, placeName: place.name || 'where you stand', population: place.population || 0, when, card,
        starRows: starData.rows, cloud: ok ? sats.cloud(place.lat, place.lon, when) : null, pass: ok ? result.satellites.pass : null };
    }
    playFilm();
  }

  // The film first, then the card. People who turn animations off on their device get the card straight away.
  async function playFilm() {
    if (!SendMeUpFilm.reduceMotion) $('card').hidden = true;
    await SendMeUpFilm.play(filmOpts);
    document.body.classList.add('has-result');      // the homepage extras step aside; the title leads back home
    $('card').hidden = false;
    $('go').textContent = 'Send me up again';
    $('card').scrollIntoView({ behavior: SendMeUpFilm.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    $('headline').focus({ preventScroll: true });
  }
  $('replay').onclick = () => { SendMeUpFilm.primeSound(); playFilm(); };

  // ---------- homepage: the night-sky picture ----------
  // Redrawn about 15 times a second for a gentle twinkle; only while it is on screen and nothing else is moving.
  const hero = $('hero');
  function heroFrame(t) {
    const visible = !document.body.classList.contains('has-result') && !document.hidden;
    if (visible) SendMeUpFilm.drawHero(hero, SendMeUpFilm.reduceMotion ? 0 : t);
    if (!SendMeUpFilm.reduceMotion) setTimeout(() => requestAnimationFrame(heroFrame), 66);
  }
  requestAnimationFrame(heroFrame);
  window.addEventListener('resize', () => SendMeUpFilm.drawHero(hero, 0));

  // ---------- homepage: "Did you know?" ----------
  // Facts already checked for this app: our own engine (Andromeda, Vega, Moon), NASA and NOAA (sources in PLAN.md).
  const HOME_FACTS = [
    'From Istanbul, once a day, you would fly straight through the Andromeda Galaxy, 2.5 million light years away.',
    'From Athens, once a day, your path passes within two Moon-widths of the bright star Vega.',
    'The Moon is never straight above Athens, Istanbul or Olsene. It only gets that high closer to the equator.',
    'The Sun is only ever straight overhead in the tropics.',
    'At the speed of light, you would pass the Moon’s distance in about 1.3 seconds.',
    'Space is usually said to begin just 100 km above your head.',
    'Almost all weather happens in the lowest layer of the air, only about 6 to 19 km thick.',
    'Shooting stars burn up between 50 and 85 km above you.',
    'A day on Venus is longer than its year.',
    'Jupiter is so big that about 1,000 Earths could fit inside it.',
  ];
  let factOrder = HOME_FACTS.map((_, i) => i).sort(() => Math.random() - 0.5), factAt = 0;
  function showHomeFact(first) {
    const p = $('dykText');
    const next = () => { p.textContent = HOME_FACTS[factOrder[factAt]]; factAt = (factAt + 1) % factOrder.length; p.classList.remove('fading'); };
    if (first || SendMeUpFilm.reduceMotion) { next(); return; }
    p.classList.add('fading');
    setTimeout(next, 350);
  }
  showHomeFact(true);
  $('dykNext').onclick = () => showHomeFact(false);

  // ---------- start-up ----------
  // Everything above is set up before anything is downloaded, so the page works, and can explain itself, even if a list fails.
  setMode(mode, false);
  $('from').textContent = 'Getting the stars ready…';
  if (location.protocol !== 'file:') loadSatellites().catch(() => {});     // in the background; the trip waits for it only if needed
  if (location.protocol !== 'file:' && window.SendMeUpZoom) SendMeUpZoom.loadAssets();   // the Earth map and planet pictures for the film, in the background
  try {
    starData = await getJson('data/stars-named.json');
    $('go').disabled = false;
    showFrom();
  } catch (e) {
    listsFailed = true;
    $('go').classList.add('broken');
    if (location.protocol === 'file:') {
      // Opened by double-clicking index.html: browsers do not let a page read its own lists that way.
      $('from').innerHTML = 'This page was opened directly as a file, so the browser blocks its star lists. '
        + 'Please start it with <b>Start Send Me Up.bat</b> in the same folder, or open '
        + '<a href="http://localhost:8768/">localhost:8768</a> if that is already running.';
    } else {
      $('from').textContent = 'Could not load the star lists. Please check your internet connection, then reload the page.';
    }
  }
})();
