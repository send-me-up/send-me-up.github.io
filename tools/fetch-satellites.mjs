// Fetches CelesTrak's "active satellites" list once and makes the app's small copy, data/satellites.json.
//
//   node tools/fetch-satellites.mjs                 download (only if our last copy is at least 8 hours old), then make the app's copy
//   node tools/fetch-satellites.mjs --from <file>   no download: make the app's copy from a list already saved in raw/celestrak
//
// CelesTrak's rules (Dr. T.S. Kelso's email, 7 Nov 2026, and celestrak.org/NORAD/documentation/gp-data-formats.php):
// - at most one download every 8 hours, as CSV (a third of the size of JSON);
// - a second request in the same update window is refused (HTTP 403), and 50 refusals or errors in 2 hours
//   put an internet address behind CelesTrak's firewall. So this tool never retries: on any refusal it says why,
//   keeps the copy we already have, and stops.
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv';
const RAW = 'raw/celestrak', OUT = 'data/satellites.json';
const MIN_HOURS = 8;
// MEAN_MOTION_DOT and MEAN_MOTION_DDOT are left out: satellite.js stores them, but its SGP4 calculation never uses them.
const NEEDED = ['OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];

const args = process.argv.slice(2);
fs.mkdirSync(RAW, { recursive: true });

let csv, fetchedAt, rawFile;
if (args[0] === '--from') {
  rawFile = args[1];
  csv = fs.readFileSync(rawFile, 'utf8');
  fetchedAt = new Date(fs.statSync(rawFile).mtime);
  const m = path.basename(rawFile).match(/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z/);
  if (m) fetchedAt = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  console.log(`No download: using ${rawFile}, fetched ${fetchedAt.toISOString()}`);
} else {
  // Our newest copy: a saved list in raw/celestrak (on this computer), or the time written inside data/satellites.json.
  // GitHub's scheduled job has no raw folder: it first puts the live site's data/satellites.json in place, so that time counts too.
  const last = fs.readdirSync(RAW).filter(f => /^active-.*\.csv$/.test(f)).sort().pop();
  const newest = [];
  if (last) {
    const m = last.match(/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z/);
    if (m) newest.push({ ms: Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`), what: `${RAW}/${last}` });
  }
  try { const f = Date.parse(JSON.parse(fs.readFileSync(OUT, 'utf8')).fetched); if (Number.isFinite(f)) newest.push({ ms: f, what: OUT }); } catch {}
  if (newest.length) {
    const n = newest.sort((a, b) => b.ms - a.ms)[0], hours = (Date.now() - n.ms) / 3.6e6;
    if (hours < MIN_HOURS) {
      console.log(`Not downloading: our last copy (${n.what}, ${new Date(n.ms).toISOString()}) is only ${hours.toFixed(1)} hours old; CelesTrak asks for at most one every ${MIN_HOURS} hours.`);
      if (last) console.log(`To rebuild the app's copy from it: node tools/fetch-satellites.mjs --from ${RAW}/${last}`);
      process.exit(0);
    }
  }
  const r = await fetch(URL, { headers: { 'User-Agent': 'SendMeUp-data/1.0', 'Accept-Encoding': 'gzip' } });
  const body = await r.text();
  if (!r.ok) {
    console.log(`CelesTrak answered ${r.status}. Not retrying (their rules); keeping the copy we have.`);
    console.log(body.slice(0, 400));
    process.exit(2);
  }
  fetchedAt = new Date();
  const stamp = fetchedAt.toISOString().slice(0, 16).replace(':', '') + 'Z';
  rawFile = `${RAW}/active-${stamp}.csv`;
  fs.writeFileSync(rawFile, body);
  csv = body;
  console.log(`Downloaded ${(body.length / 1048576).toFixed(2)} MB from CelesTrak, saved as ${rawFile}`);
}

// ---------- read the CSV ----------
const lines = csv.trim().split(/\r?\n/);
const head = lines[0].split(',').map(s => s.trim());
const missing = NEEDED.filter(k => !head.includes(k));
if (missing.length) { console.log('The list does not have the expected columns, so nothing was changed. Missing:', missing.join(', ')); console.log('First line:', lines[0].slice(0, 300)); process.exit(3); }
// Names never contain commas in this list, but be safe: a quoted field is read as one
function cells(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const at = Object.fromEntries(NEEDED.map(k => [k, head.indexOf(k)]));
const rows = [];
let skipped = 0;
for (const line of lines.slice(1)) {
  const c = cells(line);
  const get = k => c[at[k]];
  const nums = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map(k => Number(get(k)));
  if (nums.some(x => !Number.isFinite(x)) || !get('EPOCH') || !get('NORAD_CAT_ID')) { skipped++; continue; }
  // The epoch (CelesTrak's UTC time) is stored as days from the fetch time, to 8 decimals (under 1 ms; satellite.js itself reads epochs
  // to the millisecond). The numbers stay as CelesTrak wrote them.
  const epochMs = Date.parse(get('EPOCH').trim().endsWith('Z') ? get('EPOCH').trim() : get('EPOCH').trim() + 'Z');
  if (!Number.isFinite(epochMs)) { skipped++; continue; }
  rows.push([get('OBJECT_NAME').trim(), Number(get('NORAD_CAT_ID')), +((epochMs - fetchedAt) / 864e5).toFixed(8), ...nums]);
}
const out = {
  source: 'CelesTrak, https://celestrak.org (GP data, group "active"); orbit data from the US Space Force 18 SDS via Space-Track',
  fetched: fetchedAt.toISOString(),
  // epochDays: the orbit data's own time, in days after 'fetched' (negative = before)
  fields: ['name', 'norad', 'epochDays', 'meanMotion', 'eccentricity', 'inclination', 'raan', 'argPericenter', 'meanAnomaly', 'bstar'],
  rows,
};
fs.writeFileSync(OUT, JSON.stringify(out));
const epochs = rows.map(r => r[2]).sort((a, b) => a - b);
const ageDays = d => (-d).toFixed(1);
console.log(`${rows.length} satellites written to ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)${skipped ? `, ${skipped} unreadable rows left out` : ''}.`);
console.log(`Orbit data ages at fetch time: newest ${ageDays(epochs.at(-1))} days, middle ${ageDays(epochs[Math.floor(epochs.length / 2)])} days, oldest ${ageDays(epochs[0])} days.`);
