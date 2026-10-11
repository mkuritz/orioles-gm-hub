const U = {
  fm(x, opts = {}) { // $M formatter
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    const sign = x < 0 ? '−' : (opts.plus && x > 0 ? '+' : '');
    const v = Math.abs(x);
    const digits = opts.digits !== undefined ? opts.digits : (v >= 100 ? 1 : v >= 10 ? 1 : 2);
    return `${sign}$${v.toFixed(digits)}M`;
  },
  pct(x, d = 1) { return `${x.toFixed(d)}%`; },
  esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  cls(x) { return x > 0.0001 ? 'pos' : x < -0.0001 ? 'neg' : ''; },
  uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  prov(p) { const m = { V: ['v', 'Verified'], D: ['d', 'Derived'], E: ['e', 'Estimate'] }; const [c, l] = m[p] || ['e', 'Estimate']; return `<span class="tag ${c}" title="${l} — see Data & Sources">${p}</span>`; },
  tag(text, cls = '') { return `<span class="tag ${cls}">${U.esc(text)}</span>`; },
  download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  csv(rows) { return rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n'); },
};

/* ---------------- Charts (SVG, dependency-free) ---------------- */
const Charts = (() => {
  const C = { committed: '#2f6f73', roster: '#6c8d8f', ext: '#b88b2e', dead: '#c75450', push: '#8b5fbf', pos: '#5ed26a', neg: '#ff6b6b', accent: '#2cc1b0', band: 'rgba(44,193,176,0.18)', band2: 'rgba(44,193,176,0.32)', silver: '#a5acaf' };
  const ns = 'http://www.w3.org/2000/svg';
  const tipEl = () => document.getElementById('chartTip');
  function fmt(v) { return (v < 0 ? '−' : '') + '$' + Math.abs(v).toFixed(1) + 'M'; }
  function niceMax(v) { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10; return m * p; }
  function svg(w, h, label) { return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${U.esc(label)}" preserveAspectRatio="xMidYMid meet">`; }

  // Stacked bar with a cap marker per category and a value label on top
  function stacked({ categories, series, markers, labels, label, height = 300 }) {
    const w = 720, h = height, mL = 52, mR = 16, mT = 28, mB = 32;
    const iw = w - mL - mR, ih = h - mT - mB;
    const totals = categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i]), 0));
    const maxV = niceMax(Math.max(...totals, ...(markers ? markers.map((m) => m.value) : [0])) * 1.08);
    const y = (v) => mT + ih - (v / maxV) * ih;
    const bw = iw / categories.length; const barW = bw * 0.56;
    let out = svg(w, h, label);
    for (let i = 0; i <= 5; i++) { const v = (maxV / 5) * i; out += `<g class="grid"><line x1="${mL}" x2="${w - mR}" y1="${y(v)}" y2="${y(v)}"/><text x="${mL - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text></g>`; }
    categories.forEach((cat, i) => {
      const x = mL + bw * i + (bw - barW) / 2; let acc = 0;
      series.forEach((s) => {
        const v = Math.max(0, s.values[i]); if (v <= 0) return;
        const y1 = y(acc + v), hh = y(acc) - y(acc + v);
        out += `<rect class="bar" x="${x}" y="${y1}" width="${barW}" height="${hh}" fill="${s.color}" rx="1.5" data-tip="${U.esc(`${cat} · ${s.label}: ${fmt(v)}`)}"/>`;
        acc += v;
      });
      if (markers && markers[i]) { const m = markers[i]; out += `<line x1="${x - 8}" x2="${x + barW + 8}" y1="${y(m.value)}" y2="${y(m.value)}" stroke="${C.silver}" stroke-width="2" stroke-dasharray="4 3" data-tip="${U.esc(`${cat} · ${m.label}: ${fmt(m.value)}`)}"/>`; }
      if (labels && labels[i] !== undefined) { const lv = labels[i]; const top = Math.min(y(acc), markers && markers[i] ? y(markers[i].value) : y(acc)) - 8; out += `<text x="${x + barW / 2}" y="${top}" text-anchor="middle" fill="${lv < 0 ? C.neg : C.pos}" font-weight="600">${fmt(lv)}</text>`; }
      out += `<text class="label" x="${x + barW / 2}" y="${h - 10}" text-anchor="middle">${cat}</text>`;
    });
    out += '</svg>';
    return out;
  }

  // Horizontal grouped bars (e.g., dead money by player × year)
  function hGroup({ rows, keys, colors, label, rowH = 26 }) {
    const w = 720, mL = 150, mR = 70, mT = 22, mB = 8;
    const h = mT + mB + rows.length * rowH;
    const maxV = niceMax(Math.max(...rows.map((r) => keys.reduce((a, k) => a + (r.values[k] || 0), 0))) * 1.05);
    const iw = w - mL - mR; const x = (v) => mL + (v / maxV) * iw;
    let out = svg(w, h, label);
    for (let i = 0; i <= 4; i++) { const v = (maxV / 4) * i; out += `<g class="grid"><line y1="${mT - 6}" y2="${h - mB}" x1="${x(v)}" x2="${x(v)}"/><text x="${x(v)}" y="${mT - 10}" text-anchor="middle">${Math.round(v)}</text></g>`; }
    rows.forEach((r, i) => {
      const yy = mT + i * rowH; let acc = 0; const total = keys.reduce((a, k) => a + (r.values[k] || 0), 0);
      out += `<text class="label" x="${mL - 10}" y="${yy + rowH / 2 + 4}" text-anchor="end">${U.esc(r.label)}</text>`;
      keys.forEach((k, ki) => { const v = r.values[k] || 0; if (v <= 0) return; out += `<rect class="bar" x="${x(acc)}" y="${yy + 5}" width="${Math.max(0, x(acc + v) - x(acc))}" height="${rowH - 10}" fill="${colors[ki]}" rx="1.5" data-tip="${U.esc(`${r.label} · ${k}: ${fmt(v)}`)}"/>`; acc += v; });
      out += `<text x="${x(total) + 6}" y="${yy + rowH / 2 + 4}" fill="${C.silver}">${fmt(total)}</text>`;
    });
    out += '</svg>';
    return out;
  }

  // Band chart for Monte Carlo
  function band({ years, bands, target, label, height = 300 }) {
    const w = 720, h = height, mL = 52, mR = 16, mT = 20, mB = 32;
    const iw = w - mL - mR, ih = h - mT - mB;
    const all = years.flatMap((y) => [bands[y].p10, bands[y].p90]).concat([target, 0]);
    const lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.1;
    const rawStep = (hi - lo + 2 * pad) / 5; const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1)))); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawStep) || 10 * mag;
    const yMin = Math.floor((lo - pad) / step) * step, yMax = Math.ceil((hi + pad) / step) * step;
    const y = (v) => mT + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const x = (i) => mL + (iw / (years.length - 1)) * i;
    let out = svg(w, h, label);
    for (let v = yMin; v <= yMax + 1e-9; v += step) { out += `<g class="grid"><line x1="${mL}" x2="${w - mR}" y1="${y(v)}" y2="${y(v)}"/><text x="${mL - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text></g>`; }
    const poly = (k1, k2) => years.map((yr, i) => `${x(i)},${y(bands[yr][k1])}`).concat(years.slice().reverse().map((yr, i) => `${x(years.length - 1 - i)},${y(bands[yr][k2])}`)).join(' ');
    out += `<polygon points="${poly('p90', 'p10')}" fill="${C.band}"/>`;
    out += `<polygon points="${poly('p75', 'p25')}" fill="${C.band2}"/>`;
    out += `<line class="zero" x1="${mL}" x2="${w - mR}" y1="${y(0)}" y2="${y(0)}"/>`;
    out += `<line x1="${mL}" x2="${w - mR}" y1="${y(target)}" y2="${y(target)}" stroke="${C.ext}" stroke-dasharray="5 4"/><text x="${w - mR}" y="${y(target) - 5}" text-anchor="end" fill="${C.ext}">target $${target}M</text>`;
    out += `<polyline fill="none" stroke="${C.accent}" stroke-width="2.5" points="${years.map((yr, i) => `${x(i)},${y(bands[yr].p50)}`).join(' ')}"/>`;
    years.forEach((yr, i) => {
      out += `<circle cx="${x(i)}" cy="${y(bands[yr].p50)}" r="4" fill="${C.accent}" data-tip="${U.esc(`${yr} · P50 ${fmt(bands[yr].p50)} · P10 ${fmt(bands[yr].p10)} · P90 ${fmt(bands[yr].p90)}`)}"/>`;
      out += `<text class="label" x="${x(i)}" y="${h - 10}" text-anchor="middle">${yr}</text>`;
      out += `<text x="${x(i)}" y="${y(bands[yr].p50) - 10}" text-anchor="${i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle'}" fill="${C.accent}" font-weight="600">${fmt(bands[yr].p50)}</text>`;
    });
    out += '</svg>';
    return out;
  }

  // Simple vertical grouped bars (void exposure)
  function vGroup({ categories, series, label, height = 260 }) {
    const w = 720, h = height, mL = 52, mR = 16, mT = 20, mB = 46;
    const iw = w - mL - mR, ih = h - mT - mB;
    const maxV = niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.1);
    const y = (v) => mT + ih - (v / maxV) * ih; const bw = iw / categories.length; const gw = bw * 0.7 / series.length;
    let out = svg(w, h, label);
    for (let i = 0; i <= 4; i++) { const v = (maxV / 4) * i; out += `<g class="grid"><line x1="${mL}" x2="${w - mR}" y1="${y(v)}" y2="${y(v)}"/><text x="${mL - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(0)}</text></g>`; }
    categories.forEach((c, i) => {
      const x0 = mL + bw * i + bw * 0.15;
      series.forEach((s, si) => { const v = s.values[i]; if (!v) return; out += `<rect class="bar" x="${x0 + gw * si}" y="${y(v)}" width="${gw - 2}" height="${y(0) - y(v)}" fill="${s.color}" rx="1.5" data-tip="${U.esc(`${c} · ${s.label}: ${fmt(v)}`)}"/>`; });
      out += `<text class="label" x="${x0 + (gw * series.length) / 2}" y="${h - 26}" text-anchor="middle">${U.esc(c.split(' ')[0])}</text><text class="label" x="${x0 + (gw * series.length) / 2}" y="${h - 12}" text-anchor="middle">${U.esc(c.split(' ').slice(1).join(' '))}</text>`;
    });
    out += '</svg>';
    return out;
  }

  function legend(items) { return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${U.esc(i.label)}</span>`).join('')}</div>`; }

  function bindTips(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mouseenter', (e) => { const t = tipEl(); if (!t) return; t.textContent = el.getAttribute('data-tip'); t.style.display = 'block'; });
      el.addEventListener('mousemove', (e) => { const t = tipEl(); if (!t) return; t.style.left = Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 12) + 'px'; t.style.top = (e.clientY - 34) + 'px'; });
      el.addEventListener('mouseleave', () => { const t = tipEl(); if (t) t.style.display = 'none'; });
    });
  }
  return { C, stacked, hGroup, band, vGroup, legend, bindTips };
})();

const ICONS = {
  puzzle: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h5v2a1.5 1.5 0 1 0 3 0V4h4v5h-2a1.5 1.5 0 1 0 0 3h2v4H4z"/></svg>',
  hub: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/></svg>',
  depth: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M3 13h14M8 3v14"/></svg>',
  trademachine: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h10l-2.5-2.5M16 14H6l2.5 2.5"/><circle cx="10" cy="10" r="1.5"/></svg>',
  freeagency: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="7" r="3"/><path d="M4 17c0-3 2.7-5 6-5s6 2 6 5"/><path d="M14 4l1 1 2-2"/></svg>',
  league: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14"/></svg>',
  overview: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>',
  calculator: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 10h12M10 4v12"/><circle cx="10" cy="10" r="7.5"/></svg>',
  roster: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="3"/><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5"/><circle cx="14" cy="8" r="2.5"/><path d="M13 12.5c2.5 0 5 1.8 5 4.5"/></svg>',
  cuts: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="14" r="2.5"/><path d="M8 7.5 17 15M8 12.5 17 5"/></svg>',
  trades: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h12l-3-3M17 13H5l3 3"/></svg>',
  draft: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16V8M10 16V4M16 16v-6"/><path d="M2 17h16"/></svg>',
  montecarlo: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 14c3 0 3-8 6-8s3 8 6 8 3-6 4-6"/></svg>',
  scenarios: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h9l3 3v9H4z"/><path d="M7 4v4h5V4M7 16v-5h6v5"/></svg>',
  data: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="10" cy="5" rx="7" ry="2.5"/><path d="M3 5v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/><path d="M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></svg>',
  qa: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10l4 4 10-10"/></svg>',
};
