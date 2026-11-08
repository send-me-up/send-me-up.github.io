// Send Me Up — town search from our own built-in list (GeoNames, CC BY 4.0). No search service:
// typing "ol" loads only data/places/<file for "ol">, and matching happens on the phone.
// Also used by tools/make-places.mjs, so the folding of names is the same in both places.

(function (root) {
  'use strict';

  // Lower case, no accents: "Kifisiá" -> "kifisia", "İstanbul" -> "istanbul", "Αθήνα" -> "αθηνα"
  function fold(s) {
    return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/ı/g, 'i').replace(/ß/g, 'ss').replace(/[øœ]/g, 'o').replace(/æ/g, 'ae')
      .replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ς/g, 'σ')
      .replace(/[’'`]/g, '').replace(/[\s\-‐.,()]+/g, ' ').trim();
  }

  // File name for a group of first letters, safe for any script
  const chunkFile = key => Array.from(key).map(c => c.codePointAt(0).toString(36)).join('-') + '.json';

  function makeSearch(baseUrl) {
    let meta = null, metaLoading = null;
    const cache = new Map();

    function ready() {
      if (!metaLoading) {
        metaLoading = fetch(baseUrl + 'meta.json').then(r => { if (!r.ok) throw new Error('meta.json'); return r.json(); }).then(m => {
          m.splitSet = new Set(m.split);
          m.groupSet = new Set(m.groups);
          meta = m;
          return m;
        }).catch(e => { metaLoading = null; throw e; });   // a failed read is not kept, so trying again can work
      }
      return metaLoading;
    }

    // Which file holds names starting with q? Busy groups are split letter by letter.
    function groupFor(chars) {
      let len = 2;
      while (meta.splitSet.has(chars.slice(0, len).join('')) && chars.length > len) len++;
      return chars.slice(0, len).join('');
    }

    async function load(group) {
      if (!meta.groupSet.has(group)) return [];          // no town names start like this
      if (!cache.has(group)) {
        const list = fetch(baseUrl + chunkFile(group)).then(r => { if (!r.ok) throw new Error(group); return r.json(); });
        list.catch(() => cache.delete(group));
        cache.set(group, list);
      }
      return cache.get(group);
    }

    // Returns up to `limit` places. Order: exact names first, then names that start with what you typed,
    // then places found by one of their other-language names; most people first inside each group.
    async function find(text, limit = 8) {
      const q = fold(text);
      const chars = Array.from(q);
      if (chars.length < 2) return [];
      await ready();
      const list = await load(groupFor(chars));
      const seen = new Set(), exact = [], starts = [], other = [];
      for (const e of list) {
        const key = fold(e.length > 8 ? e[8] : e[0]);
        if (!key.startsWith(q) || seen.has(e[7])) continue;
        seen.add(e[7]);
        (key === q ? exact : e.length > 8 ? other : starts).push({ e, key });
      }
      return exact.concat(starts, other).slice(0, limit).map(({ e }) => ({
        name: e[0],
        region: meta.regions[e[1]],
        country: meta.countries[e[2]] || e[2],
        lat: e[3], lon: e[4],
        tz: meta.zones[e[5]],
        population: e[6],
        otherName: e.length > 8 ? e[8] : '',
      }));
    }

    // True when the first letters typed belong to a busy group and one more letter is needed
    function needsMore(text) {
      const chars = Array.from(fold(text));
      return !!meta && chars.length >= 2 && meta.splitSet.has(chars.join(''));
    }

    return { find, ready, needsMore };
  }

  const api = { fold, chunkFile, makeSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SendMeUpPlaces = api;
})(this);
