/* =====================================================================
   MLB GM LAB — Sports Labs. Same shell, interaction patterns and module
   layout as the Eagles GM Lab · Live, adapted to MLB (payroll/CBT, 40-man,
   arbitration, options, Pipeline, international pool). Team = window.TEAM.
   Data = ./data/*.json written by scripts/fetch_data.py (twice daily).
   Provenance: V = verified from a cited source, D = derived from verified
   inputs, E = model estimate / user assumption.
   ===================================================================== */
const T = window.TEAM; Object.assign(T.colors, T.lab || {});
const SEASON = 2026, YEARS = [2026, 2027, 2028, 2029, 2030];
const M = (x) => x / 1e6;
const fm = (x, o) => U.fm(x, o);
const esc = (s) => U.esc(s == null ? '' : s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
const r1 = (x) => Math.round(x * 10) / 10;
Object.assign(Charts.C, { committed: T.colors.brand, roster: T.colors.silver, ext: '#c9a227', accent: T.colors.accent, band: `rgba(${T.colors.accentRgb},0.18)`, band2: `rgba(${T.colors.accentRgb},0.32)`, silver: T.colors.silver });

/* ---------------- Raw data ---------------- */
const RAW = {};
const FILES = ['meta', 'roster', 'standings', 'team_stats', 'schedule', 'transactions', 'injuries', 'news', 'rumors', 'farm', 'draft', 'prospects', 'free_agents', 'trade_market', 'international', 'performance', 'arbitration', 'contracts_manual', 'calendar_manual', 'franchise_manual'];
async function loadData() {
  await Promise.all(FILES.map(async (f) => { try { const r = await fetch(`data/${f}.json?v=${Date.now() >> 16}`); const j = await r.json(); RAW[f] = j && j.data !== undefined && j.updated ? j.data : j; RAW['_upd_' + f] = j && j.updated; } catch (e) { RAW[f] = null; } }));
  try { RAW.credits = await (await fetch('assets/credits.json')).json(); } catch (e) { RAW.credits = []; }
}

/* ---------------- League model (built once from data) ---------------- */
const L = {};
function buildLeague() {
  const st = RAW.standings || [];
  L.teams = []; st.forEach((d) => d.teams.forEach((t, i) => L.teams.push({ ...t, division: d.division, league: d.league, divRank: i + 1 })));
  L.me = L.teams.find((t) => t.id === T.id) || { w: 0, l: 0, name: T.name, abbr: T.abbr };
  L.teamByName = Object.fromEntries(L.teams.map((t) => [t.name, t]));
  L.status = (t) => { const p = t.w / Math.max(1, t.w + t.l); return t.clinch ? 'Contender' : p >= 0.52 ? 'Contender' : p < 0.46 ? 'Seller' : 'Bubble'; };
  const perf = (RAW.performance && RAW.performance.players) || [];
  L.perfById = Object.fromEntries(perf.map((p) => [p.id, p])); L.perfByName = {}; perf.forEach((p) => { L.perfByName[norm(p.name)] = p; });
  L.perfMeta = RAW.performance ? { method: RAW.performance.method, pool: RAW.performance.pool, updated: RAW._upd_performance } : null;
  const arb = (RAW.arbitration && RAW.arbitration.teams) || {};
  L.arbByName = {}; Object.entries(arb).forEach(([tm, list]) => list.forEach((a) => { L.arbByName[norm(a.name)] = { ...a, team: tm }; }));
  L.arbMine = (arb[T.name] || []).map((a) => ({ ...a, id: 'arb_' + norm(a.name).replace(/ /g, '_') }));
  const pr = RAW.prospects || {}; L.t30 = pr.team30 || []; L.t100 = pr.top100 || [];
  const cm = RAW.contracts_manual || { contracts: [], team_payroll: {}, cbt: {} };
  L.payroll = cm.team_payroll || {}; L.cbt = cm.cbt || {};
  L.contracts = (cm.contracts || []).map((c) => ({ ...c, id: 'c_' + norm(c.name).replace(/ /g, '_'), opt: parseOption(c.options) }));
  L.fa = ((RAW.free_agents && RAW.free_agents.players) || []).map((p) => ({ ...p, opt: parseOption(p.option) }));
  L.injuries = RAW.injuries || [];
  L.cal = ((RAW.calendar_manual && (RAW.calendar_manual.events || RAW.calendar_manual)) || []);
  L.cands = (RAW.trade_market && RAW.trade_market.candidates) || [];
}
function parseOption(txt) {
  if (!txt) return null; const t = String(txt);
  let m = t.match(/\$([\d.]+)MM (club|mutual|vesting) option(?: with a \$([\d.]+)(MM|K) buyout)?/i);
  if (m) return { kind: m[2].toLowerCase(), amount: +m[1] * 1e6, buyout: m[3] ? +m[3] * (m[4] === 'MM' ? 1e6 : 1e3) : 0, text: t };
  m = t.match(/opt out of remaining (\w+) years?, \$([\d.]+)MM/i);
  if (m) { const n = { one: 1, two: 2, three: 3, four: 4, five: 5 }[m[1].toLowerCase()] || 1; return { kind: 'optout', years: n, amount: +m[2] * 1e6 / n, text: t }; }
  if (/club option/i.test(t)) return { kind: 'club', amount: null, text: t };
  return { kind: 'other', text: t };
}
const perfOf = (p) => (p && (L.perfById[p.id] || L.perfByName[norm(p.name)])) || null;

/* ---------------- Position groups ---------------- */
const GROUPS = [
  { id: 'C', label: 'Catcher', side: 'POS', starters: 1, depth: 2 }, { id: '1B', label: 'First base', side: 'POS', starters: 1, depth: 2 },
  { id: '2B', label: 'Second base', side: 'POS', starters: 1, depth: 2 }, { id: '3B', label: 'Third base', side: 'POS', starters: 1, depth: 2 },
  { id: 'SS', label: 'Shortstop', side: 'POS', starters: 1, depth: 2 }, { id: 'LF', label: 'Left field', side: 'POS', starters: 1, depth: 2 },
  { id: 'CF', label: 'Center field', side: 'POS', starters: 1, depth: 2 }, { id: 'RF', label: 'Right field', side: 'POS', starters: 1, depth: 2 },
  { id: 'DH', label: 'Designated hitter', side: 'POS', starters: 1, depth: 1 },
  { id: 'SP', label: 'Starting rotation', side: 'PIT', starters: 5, depth: 8 }, { id: 'RP', label: 'Bullpen', side: 'PIT', starters: 8, depth: 13 },
];
function grpOfPlayer(p) {
  if (p.posType === 'Pitcher' || p.pos === 'P' || /HP$/.test(p.pos || '')) { const pf = perfOf(p); if (pf && pf.role === 'SP') return 'SP'; if (pf && pf.role === 'RP') return 'RP'; const gs = p.pit && p.pit.gamesStarted; return gs >= 5 ? 'SP' : 'RP'; }
  if (p.pos === 'OF') return 'CF'; if (p.pos === 'TWP') return 'DH';
  return GROUPS.some((g) => g.id === p.pos) ? p.pos : 'DH';
}
const ipNum = (s) => { const [a, b] = String(s || '0').split('.'); return +a + (+b || 0) / 3; };

/* ---------------- Scenarios ---------------- */
const SCEN = {
  base: { label: 'Base', desc: 'MLBTR arbitration projections as published; 2027 CBT thresholds held at 2026 levels; club options exercised when the player\'s Performance Score is 50+; ceiling = 1st CBT threshold.', arbScale: 1.0, thrGrowth: 0, benefits: 17, prearb: 0.80, optPolicy: 'perf', ceilingIdx: 0, ceilingBuffer: 0, inSeason: 5 },
  conservative: { label: 'Conservative', desc: 'Arbitration 10% above projections, all club options exercised, $10M in-season adds, $5M buffer below the 1st threshold.', arbScale: 1.10, thrGrowth: 0, benefits: 18, prearb: 0.85, optPolicy: 'all', ceilingIdx: 0, ceilingBuffer: 5, inSeason: 10 },
  aggressive: { label: 'Aggressive', desc: 'Arbitration at projections, options exercised only for 60+ scores, ceiling = 2nd CBT threshold (pay first-tier tax).', arbScale: 1.0, thrGrowth: 0, benefits: 17, prearb: 0.80, optPolicy: 'strong', ceilingIdx: 1, ceilingBuffer: 0, inSeason: 3 },
  custom: { label: 'Custom', desc: 'Your own assumptions (Scenarios & Risk → Assumptions).' },
};
const SCHEMA = 1;
function defaultState() {
  return { schema: SCHEMA, scenario: 'base', custom: { arbScale: 1.0, thrGrowth: 0, benefits: 17, prearb: 0.80, optPolicy: 'perf', ceilingIdx: 0, ceilingBuffer: 0, inSeason: 5 },
    options: {}, tenders: {}, releases: {}, resigns: {}, signings: {}, trades: [], dumps: {}, extra: [], notes: '',
    ui: { module: 'hub', depthSide: 'POS', tm: { partner: '', give: [], get: [], salaries: {} }, draftTab: 'pipeline', faTab: 'own', scenTab: 'saved', leagueTab: 'standings', sort: { key: 'aav', dir: -1 }, faFilter: '', mc: null, heritageTab: 'history' } };
}
const P = (s) => (s.scenario === 'custom' ? { ...SCEN.base, ...s.custom } : SCEN[s.scenario]);

/* ---------------- Franchise model ---------------- */
const Fz = {
  thresholds(s, y) { const base = (L.cbt.thresholds || []).map(Number); if (y <= 2026) return base; const g = P(s).thrGrowth || 0; return base.map((v) => v * Math.pow(1 + g, y - 2026)); },
  ceiling(s, y = 2027) { const th = Fz.thresholds(s, y); const p = P(s); return (th[p.ceilingIdx] || th[0] || 0) - (p.ceilingBuffer || 0) * 1e6; },
  tradedOut(s) { const ids = new Set(); s.trades.forEach((t) => t.give.forEach((a) => ids.add(a.id))); return ids; },
  roster(s) {
    const out = Fz.tradedOut(s);
    const base = (RAW.roster || []).map((p) => ({ ...p, pid: 'p' + p.id, grp: grpOfPlayer(p) }));
    const added = []; s.trades.forEach((t) => t.get.forEach((a) => { if (a.kind === 'player') added.push({ id: a.pid, pid: 'p' + a.pid, name: a.name, pos: a.pos, age: a.age, grp: a.grp, acquiredFrom: t.partnerAbbr, posType: a.grp === 'SP' || a.grp === 'RP' ? 'Pitcher' : 'Hitter' }); }));
    Object.entries(s.signings).forEach(([k, v]) => { if (v.on) { const f = L.fa.find((x) => String(x.id) === k); if (f) added.push({ id: f.id, pid: 'p' + f.id, name: f.name, age: f.age2027 - 1, pos: (f.sections || [''])[0], grp: faGroup(f), signed: true, posType: f.pit && !f.hit ? 'Pitcher' : 'Hitter' }); } });
    return base.filter((p) => !out.has('p' + p.id) && !s.releases[p.id]).concat(added).map((p) => ({ ...p, perf: perfOf(p), contract: Fz.contractOf(p.name), arb: L.arbByName[norm(p.name)] && L.arbByName[norm(p.name)].team === T.name ? L.arbByName[norm(p.name)] : null, inj: L.injuries.find((i) => norm(i.name) === norm(p.name)) }));
  },
  contractOf(name) { return L.contracts.find((c) => norm(c.name) === norm(name)) || null; },
  controlThru(p) { const c = p.contract || Fz.contractOf(p.name); if (c && c.ends) return c.ends; const a = p.arb || L.arbByName[norm(p.name)]; if (a) { const sv = parseFloat(a.service); return 2026 + Math.max(1, 6 - Math.floor(sv)); } if (p.signed) return 2027; return p.debut ? Math.max(2027, +String(p.debut).slice(0, 4) + 6) : 2031; },
  depthChart(s) {
    const rs = Fz.roster(s).filter((p) => p.status !== '60-Day IL');
    const prospects = L.t30.filter((x) => x.pos);
    return GROUPS.map((g) => {
      const players = rs.filter((p) => p.grp === g.id).sort((a, b) => ((b.perf || {}).score || 0) - ((a.perf || {}).score || 0));
      const starters = players.slice(0, g.starters), backups = players.slice(g.starters);
      const pipe = prospects.filter((x) => primaryPos(x.pos) === g.id).slice(0, 2);
      return { group: g, players, starters, backups, pipe };
    });
  },
  needs(s) {
    const dc = Fz.depthChart(s);
    return dc.map(({ group: g, starters, pipe }) => {
      const why = []; let score;
      const sc = starters.map((p) => (p.perf ? p.perf.score : 35));
      if (!starters.length) { score = 90; why.push('No rostered starter'); }
      else { const avg = sc.reduce((a, b) => a + b, 0) / g.starters; score = 100 - avg; if (starters.length < g.starters) why.push(`${g.starters - starters.length} open slot(s)`); }
      starters.forEach((p) => { if (Fz.controlThru(p) <= 2026) { score += 8; why.push(`${p.name} FA after 2026`); } if (p.inj && /60/.test(p.inj.status)) { score += 6; why.push(`${p.name} ${p.inj.status}`); } if (p.perf && p.perf.score >= 75) why.push(`${p.name} ${p.perf.score} PS`); });
      const near = pipe.filter((x) => (x.eta || 9999) <= 2027); if (near.length) { score -= 6; why.push(`Pipeline: ${near.map((x) => x.name).join(', ')} (ETA ${near[0].eta})`); }
      score = Math.round(clamp(score, 0, 100));
      const urgency = score >= 70 ? 'Critical' : score >= 55 ? 'High' : score >= 35 ? 'Medium' : 'Low';
      return { group: g, score, urgency, why };
    }).sort((a, b) => b.score - a.score);
  },
  optionDecision(s, c) {
    const key = c.id; if (s.options[key]) return s.options[key];
    const o = c.opt; if (!o) return null; const pf = perfOf(c); const sc = pf ? pf.score : 0; const pol = P(s).optPolicy;
    if (o.kind === 'optout') return sc >= 60 ? 'out' : 'stay';
    if (o.kind === 'mutual') return 'decline';
    if (o.kind === 'club' || o.kind === 'vesting') return pol === 'all' ? 'exercise' : pol === 'strong' ? (sc >= 60 ? 'exercise' : 'decline') : (sc >= 50 ? 'exercise' : 'decline');
    return null;
  },
  tender(s, a) { if (s.tenders[a.id] !== undefined) return s.tenders[a.id]; const r = (RAW.roster || []).find((x) => norm(x.name) === norm(a.name)); if (r && s.releases[r.id]) return false; return !Fz.tradedOut(s).has('p' + ((L.perfByName[norm(a.name)] || {}).id)); },
  playerSalary(name) { const c = Fz.contractOf(name); if (c && c.aav_cbt) return { v: c.aav_cbt, src: 'Contract AAV', prov: 'V' }; const a = L.arbByName[norm(name)]; if (a) return { v: a.proj, src: 'MLBTR arb projection', prov: 'E' }; return null; },
  // CBT payroll by year
  payroll(s) {
    const p = P(s); const out = {}; const outIds = Fz.tradedOut(s);
    YEARS.forEach((y) => {
      const lines = { guaranteed: 0, options: 0, arb: 0, prearb: 0, benefits: 0, resigns: 0, signings: 0, tradesIn: 0, tradesOut: 0, dumps: 0, extra: 0, inSeason: 0 };
      const det = [];
      L.contracts.forEach((c) => {
        const traded = outIds.has('p' + ((perfOf(c) || {}).id)) || outIds.has(c.id);
        if (c.aav_cbt && c.ends && y <= c.ends) {
          let v = c.aav_cbt; if (c.opt && c.opt.kind === 'optout' && Fz.optionDecision(s, c) === 'out' && y > 2026) v = 0;
          if (traded) { lines.tradesOut -= v; } else if (s.dumps[c.id]) { lines.dumps -= v * (1 - s.dumps[c.id] / 100); }
          lines.guaranteed += v; if (v) det.push({ name: c.name, v, kind: 'Guaranteed', prov: 'V' });
        }
        if (y === (c.ends || 2026) + 1 && c.opt && (c.opt.kind === 'club' || c.opt.kind === 'mutual' || c.opt.kind === 'vesting') && c.opt.amount && Fz.optionDecision(s, c) === 'exercise' && !traded) { lines.options += c.opt.amount; det.push({ name: c.name, v: c.opt.amount, kind: 'Option', prov: 'D' }); }
      });
      if (y === 2027) {
        L.arbMine.forEach((a) => { if (Fz.tender(s, a) && !outIds.has('p' + ((L.perfByName[norm(a.name)] || {}).id))) { const v = a.proj * p.arbScale; lines.arb += v; det.push({ name: a.name, v, kind: 'Arbitration', prov: 'E' }); } });
        const known = new Set([...L.contracts.map((c) => norm(c.name)), ...L.arbMine.map((a) => norm(a.name))]);
        const pre = Fz.roster(s).filter((r) => !known.has(norm(r.name)) && !r.signed && !r.acquiredFrom).length;
        lines.prearb = pre * p.prearb * 1e6; lines.prearbN = pre;
        lines.benefits = p.benefits * 1e6; lines.inSeason = p.inSeason * 1e6;
      }
      Object.entries(s.resigns).forEach(([k, r]) => { if (r.on && r.aav && y >= 2027 && y < 2027 + (r.years || 1)) lines.resigns += r.aav * 1e6; });
      Object.entries(s.signings).forEach(([k, r]) => { if (r.on && r.aav && y >= 2027 && y < 2027 + (r.years || 1)) lines.signings += r.aav * 1e6; });
      s.trades.forEach((t) => t.get.forEach((a) => { if (a.kind === 'player' && a.salary && y >= 2027 && y <= (a.thru || 2027)) lines.tradesIn += a.salary; }));
      s.trades.forEach((t) => t.give.forEach((a) => { if (y >= 2027 && a.salary && !Fz.contractOf(a.name) && !L.arbMine.some((x) => norm(x.name) === norm(a.name))) lines.tradesOut -= 0; }));
      s.extra.forEach((e) => { if (y >= e.from && y <= e.to) lines.extra += e.aav * 1e6; });
      const total = y === 2026 ? (L.payroll.cbt_payroll || 0) : lines.guaranteed + lines.options + lines.arb + lines.prearb + lines.benefits + lines.resigns + lines.signings + lines.tradesIn + lines.tradesOut + lines.dumps + lines.extra + lines.inSeason;
      const th = Fz.thresholds(s, y);
      out[y] = { lines, total, det, th, room: Fz.ceiling(s, y) - total, tax: taxOf(total, th, L.cbt, y), guaranteedOnly: y >= 2028 };
    });
    return out;
  },
  pendingFA(s) {
    const list = [];
    L.contracts.forEach((c) => { const pf = perfOf(c); const d = Fz.optionDecision(s, c); const leaving = (c.ends || 2026) <= 2026 && !(d === 'exercise') || d === 'out'; if (leaving && !Fz.tradedOut(s).has('p' + ((pf || {}).id))) list.push({ id: c.id, name: c.name, pf, opt: c.opt, decision: d, priority: pf && pf.score >= 70 ? 'Priority' : pf && pf.score >= 50 ? 'Starter' : 'Depth' }); });
    return list.sort((a, b) => ((b.pf || {}).score || 0) - ((a.pf || {}).score || 0));
  },
  pVal(p) { // trade value points (stat-based, estimate)
    if (p.kind === 'prospect') { const r100 = p.rank100; if (r100) return Math.round(260 - r100 * 1.8); return Math.round(Math.max(15, 110 - (p.rank30 || 30) * 3)); }
    const pf = perfOf(p); const sc = pf ? pf.score : 30; const age = p.age || 29; const yrs = Math.max(0.5, Fz.controlThru(p) - 2026);
    const ageF = age <= 26 ? 1.15 : age <= 30 ? 1 : age <= 33 ? 0.8 : 0.6; const ctl = Math.min(1.7, 0.55 + 0.22 * yrs);
    const sal = Fz.playerSalary(p.name); const salPen = sal ? Math.min(60, M(sal.v) * 1.4) : 0;
    return Math.max(5, Math.round(Math.max(4, sc - 30) * 3.2 * ageF * ctl - salPen * (sc < 60 ? 1 : 0.5)));
  },
  partnerAssets(abbr) {
    const t = L.teams.find((x) => x.abbr === abbr); if (!t) return [];
    const players = Object.values(L.perfById).filter((p) => p.team === t.name).map((p) => ({ kind: 'player', id: 'p' + p.id, pid: p.id, name: p.name, pos: p.pos, age: p.age, grp: p.role === 'SP' ? 'SP' : p.role === 'RP' ? 'RP' : (GROUPS.some((g) => g.id === p.pos) ? p.pos : 'DH') }));
    const pros = L.t100.filter((x) => x.team === t.name).map((x) => ({ kind: 'prospect', id: 'pr' + (x.id || norm(x.name)), name: x.name, pos: x.pos, age: x.age, rank100: x.rank, grp: primaryPos(x.pos) }));
    return players.concat(pros).map((a) => ({ ...a, value: Fz.pVal(a), sal: a.kind === 'player' ? Fz.playerSalary(a.name) : null })).sort((a, b) => b.value - a.value);
  },
  myAssets(s) {
    const used = new Set(s.ui.tm.give.map((a) => a.id));
    const players = Fz.roster(s).filter((p) => !p.signed).map((p) => ({ kind: 'player', id: 'p' + p.id, pid: p.id, name: p.name, pos: p.pos, age: p.age, grp: p.grp }));
    const traded = Fz.tradedOut(s);
    const pros = L.t30.map((x) => { const r100 = (L.t100.find((y) => norm(y.name) === norm(x.name)) || {}).rank; return { kind: 'prospect', id: 'pr' + (x.id || norm(x.name)), name: x.name, pos: x.pos, age: x.age, rank30: x.rank, rank100: r100, grp: primaryPos(x.pos) }; }).filter((x) => !traded.has(x.id));
    return players.concat(pros).filter((a) => !used.has(a.id)).map((a) => ({ ...a, value: Fz.pVal(a), sal: a.kind === 'player' ? Fz.playerSalary(a.name) : null }));
  },
  evaluateTrade(s, partnerAbbr, give, get) {
    const t = L.teams.find((x) => x.abbr === partnerAbbr) || {}; const status = L.status(t);
    const w = (a) => a.value * (status === 'Seller' && a.kind === 'prospect' ? 1.2 : status === 'Contender' && a.kind === 'player' ? 1.15 : 1);
    const giveValue = give.reduce((x, a) => x + a.value, 0), getValue = get.reduce((x, a) => x + a.value, 0);
    if (!give.length || !get.length) return { giveValue, getValue, verdict: 'Incomplete', accept: 0, status, ratio: 0, needHits: [] };
    const ratio = give.reduce((x, a) => x + w(a), 0) / Math.max(1, getValue);
    const accept = Math.round(clamp(50 + (ratio - 1) * 110, 1, 99));
    const ns = Fz.needs(s); const needHits = get.map((a) => ns.find((n) => n.group.id === a.grp)).filter((n) => n && n.score >= 55).map((n) => ({ grp: n.group.id, score: n.score }));
    const salIn = get.reduce((x, a) => x + (a.salary || 0), 0), salOut = give.reduce((x, a) => x + ((a.sal && a.sal.v) || 0), 0);
    return { giveValue, getValue, ratio: r1(ratio), accept, verdict: accept >= 75 ? 'Accept' : accept >= 50 ? 'Likely' : accept >= 25 ? 'Lean no' : 'Reject', status, needHits, salIn, salOut, unknownSal: get.some((a) => a.kind === 'player' && !a.salary) };
  },
  alerts(s, pay) {
    const a = []; const p26 = pay[2026], p27 = pay[2027]; const th = p26.th;
    if (p26.total > th[0]) a.push({ level: 'critical', title: `Over the ${fm(M(th[0]), { digits: 0 })} CBT threshold in 2026`, msg: `CBT payroll ${fm(M(p26.total))} (MLBTR, ${L.payroll.as_of}). Est. tax ${fm(M(L.payroll.est_tax || 0))}. ${L.cbt.payor_status || ''}` });
    else a.push({ level: 'ok', title: `Under the 2026 CBT threshold by ${fm(M(th[0] - p26.total))}`, msg: `CBT payroll ${fm(M(p26.total))} per MLBTR (as of ${L.payroll.as_of}).` });
    a.push({ level: p27.room < 0 ? 'critical' : p27.room < 15e6 ? 'warn' : 'ok', title: `2027 projected room vs ${P(s).label} ceiling: ${fm(M(p27.room), { plus: true })}`, msg: `Projected CBT payroll ${fm(M(p27.total))} vs ceiling ${fm(M(Fz.ceiling(s)))}. 2027 thresholds are unknown until a new CBA — 2026 levels assumed${P(s).thrGrowth ? ` +${(P(s).thrGrowth * 100).toFixed(1)}%/yr` : ''}.` });
    a.push({ level: 'warn', title: 'Data gap: partial contract list', msg: `2027 guaranteed money counts ${L.contracts.filter((c) => c.aav_cbt && c.ends >= 2027).length} multi-year deals from free sources (MLBTR shows only its top contracts free). Other guaranteed deals are not included until added under Contracts.` });
    const opts = L.contracts.filter((c) => c.opt && (c.ends || 2026) <= 2027);
    if (opts.length) a.push({ level: 'warn', title: `${opts.length} option / opt-out decisions`, msg: opts.map((c) => `${c.name}: ${c.opt.kind === 'optout' ? 'opt-out' : c.opt.kind + ' option'} → ${Fz.optionDecision(s, c)}`).join(' · ') });
    if (L.arbMine.length) a.push({ level: 'warn', title: `${L.arbMine.length} arbitration-eligible — tender decisions`, msg: `${L.arbMine.filter((x) => Fz.tender(s, x)).length} tendered in this plan · projected ${fm(M(p27.lines.arb))} (MLBTR/Swartz).` });
    Fz.needs(s).filter((n) => n.urgency === 'Critical').slice(0, 3).forEach((n) => a.push({ level: 'critical', title: `Critical need: ${n.group.label}`, msg: n.why.join(' · ') || 'Below-average production' }));
    L.injuries.filter((i) => /60/.test(i.status || '')).slice(0, 3).forEach((i) => a.push({ level: 'warn', title: `${i.name} — ${i.status}`, msg: (i.detail || '').slice(0, 160) }));
    const cba = L.cal.find((e) => /CBA/i.test(e.title || '')); if (cba) a.push({ level: 'warn', title: 'CBA expires Dec 1, 2026', msg: cba.title });
    return a;
  },
  summary(s) {
    const me = L.me; const pay = Fz.payroll(s); const needs = Fz.needs(s);
    const rs = Fz.roster(s);
    return { me, pay, needs, rosterCount: rs.length, status: L.status(me), record: `${me.w}-${me.l}`, top100: L.t100.filter((x) => x.team === T.name).length };
  },
};
function taxOf(total, th, cbt, y) { if (y === 2026 && L.payroll.est_tax != null) return L.payroll.est_tax; if (!th || !th.length || total <= th[0]) return 0; const r = /repeat/i.test(cbt.payor_status || '') ? (cbt.rates_second || [30, 42, 75, 90]) : (cbt.rates_first || [20, 32, 62.5, 80]); let tax = 0; for (let i = 0; i < th.length; i++) { const lo = th[i], hi = th[i + 1] || Infinity; if (total > lo) tax += (Math.min(total, hi) - lo) * r[i] / 100; } return tax; }
function primaryPos(pos) { const p = String(pos || '').split('/')[0].trim(); if (/HP$/.test(p) || p === 'P') return 'SP'; if (p === 'OF') return 'CF'; return GROUPS.some((g) => g.id === p) ? p : 'DH'; }
function faGroup(f) { const s = (f.sections || [''])[0]; const m = { Catchers: 'C', 'First Basemen': '1B', 'Second Basemen': '2B', Shortstops: 'SS', 'Third Basemen': '3B', 'Left Fielders': 'LF', 'Center Fielders': 'CF', 'Right Fielders': 'RF', 'Designated Hitters': 'DH', 'Starting Pitchers': 'SP', 'Right-Handed Relievers': 'RP', 'Left-Handed Relievers': 'RP' }; return m[s] || 'DH'; }

/* ---------------- Monte Carlo ---------------- */
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function monteCarlo(s, n = 5000) {
  const pay = Fz.payroll(s)[2027]; const l = pay.lines; const rng = mulberry32(20261011); const res = [];
  const th = Fz.thresholds(s, 2027);
  for (let i = 0; i < n; i++) {
    const arb = l.arb * (1 + 0.12 * gauss(rng)); const ben = l.benefits * (1 + 0.05 * gauss(rng)); const ins = Math.max(0, l.inSeason * (1 + 0.8 * gauss(rng)));
    let opt = 0; L.contracts.forEach((c) => { if (c.opt && c.opt.amount && (c.opt.kind === 'club' || c.opt.kind === 'vesting')) { const pf = perfOf(c); const pr = Fz.optionDecision(s, c) === 'exercise' ? 0.85 : 0.15; if (rng() < pr) opt += c.opt.amount; } });
    let outs = 0; L.contracts.forEach((c) => { if (c.opt && c.opt.kind === 'optout' && c.aav_cbt) { const pr = Fz.optionDecision(s, c) === 'out' ? 0.8 : 0.2; if (rng() < pr) outs += c.aav_cbt; } });
    const optBase = L.contracts.filter((c) => c.opt && c.opt.kind === 'optout' && c.aav_cbt && Fz.optionDecision(s, c) === 'out').reduce((a, c) => a + c.aav_cbt, 0);
    const total = pay.total - l.arb - l.benefits - l.inSeason - l.options + arb + ben + ins + opt - outs + optBase;
    res.push(total);
  }
  res.sort((a, b) => a - b); const q = (p) => res[Math.floor(p * (res.length - 1))];
  return { n, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), over: th.map((t) => res.filter((x) => x > t).length / n), th, hist: hist(res, 24) };
}
function hist(arr, bins) { const lo = arr[0], hi = arr[arr.length - 1]; const w = (hi - lo) / bins || 1; const h = Array(bins).fill(0); arr.forEach((v) => { h[Math.min(bins - 1, Math.floor((v - lo) / w))]++; }); return { lo, w, h }; }

/* ---------------- Persistence ---------------- */
const Store = (() => { const KEY = T.lsPrefix + 'lab:v1:state', SAVED = T.lsPrefix + 'lab:v1:saved'; const mem = {};
  const get = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : mem[k] || null; } catch (e) { return mem[k] || null; } };
  const set = (k, v) => { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  return { KEY, SAVED, get, set, remove: (k) => { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} } }; })();
function migrate(raw) { const d = defaultState(); if (!raw || typeof raw !== 'object') return d; const s = { ...d, ...raw, ui: { ...d.ui, ...(raw.ui || {}), tm: { ...d.ui.tm, ...((raw.ui || {}).tm || {}) } }, custom: { ...d.custom, ...(raw.custom || {}) } }; if (!SCEN[s.scenario]) s.scenario = 'base'; ['options', 'tenders', 'releases', 'resigns', 'signings', 'dumps'].forEach((k) => { if (typeof s[k] !== 'object' || !s[k]) s[k] = {}; }); if (!Array.isArray(s.trades)) s.trades = []; if (!Array.isArray(s.extra)) s.extra = []; return s; }

/* =====================================================================
   UI
   ===================================================================== */
const MODULES = [
  { id: 'hub', label: 'Franchise Hub', title: 'Franchise Hub', group: 'Franchise' },
  { id: 'puzzle', label: 'World Series Puzzle', title: 'Core Pieces of the World Series Puzzle', group: 'Franchise' },
  { id: 'depth', label: 'Depth Chart', title: 'Depth Chart & Positional Needs', group: 'Franchise' },
  { id: 'trademachine', label: 'Trade Machine', title: 'Trade Machine', group: 'Franchise' },
  { id: 'freeagency', label: 'Free Agency', title: 'Free Agency — 2026-27 Class', group: 'Franchise' },
  { id: 'draft', label: 'Draft Central', title: 'Draft Central — Pipeline, Draft & International', group: 'Franchise' },
  { id: 'league', label: 'League', title: 'League — AL/NL Standings, Buyers & Sellers', group: 'Franchise' },
  { id: 'overview', label: 'Payroll Overview', title: 'Payroll & CBT Overview', group: 'Payroll office' },
  { id: 'calculator', label: '2027 Payroll Engine', title: '2027 Payroll Engine', group: 'Payroll office' },
  { id: 'roster', label: 'Contracts', title: '40-Man Roster & Contracts', group: 'Payroll office' },
  { id: 'cuts', label: 'Release Simulator', title: 'Release / Non-Tender / DFA Simulator', group: 'Payroll office' },
  { id: 'trades', label: 'Payroll Trade Desk', title: 'Payroll Trade Desk (cash retention)', group: 'Payroll office' },
  { id: 'montecarlo', label: 'Monte Carlo', title: 'Monte Carlo — 2027 CBT Payroll', group: 'Payroll office' },
  { id: 'scenarios', label: 'Scenarios & Risk', title: 'Scenario Manager & Risk Register', group: 'Payroll office' },
  { id: 'heritage', label: 'Club Heritage', title: `${T.short} History, Uniforms & ${T.park}`, group: 'Club' },
  { id: 'data', label: 'Data & Sources', title: 'Data Provenance & Sources', group: 'System' },
];
ICONS.puzzle = ICONS.puzzle || ICONS.hub; ICONS.heritage = '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17h14M4 17V9l6-5 6 5v8M8 17v-4h4v4"/></svg>';
const LOGO = `<svg width="34" height="34" viewBox="0 0 34 34" role="img" aria-label="${esc(T.hubTitle)}"><rect x="1" y="1" width="32" height="32" rx="8" fill="${T.colors.logoBg}"/><text x="17" y="24" text-anchor="middle" font-family="Barlow Condensed, Impact, sans-serif" font-weight="800" font-size="21" fill="${T.colors.logoFg}">${esc(T.logoText)}</text></svg>`;
const SL_MARK = `<a class="sl-mark" href="${T.sportsLabs}" target="_blank" rel="noopener" title="Sports Labs — all suites"><svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0b1220"/><path d="M9 21c2 2 4.5 3 7 3 3.3 0 6-1.6 6-4.4 0-5.6-12-3.4-12-8.6C10 8.6 12.6 7 15.6 7c2.2 0 4.2.8 5.6 2.2" stroke="#22d3ee" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>A Sports Labs product</a>`;

let state = defaultState(); let saved = []; let saveStatus = 'saved'; const els = {};
const S = () => state;
const urgCls = (u) => u === 'Critical' ? 'crit' : u === 'High' ? 'med' : u === 'Medium' ? 'hi' : 'low';
const statusCls = (s) => s === 'Contender' ? 'hi' : s === 'Seller' ? 'crit' : 'med';
const initials = (n) => String(n).split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fmtD = (d) => { try { return new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }); } catch (e) { return d; } };
const fmtET = (iso) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (e) { return iso || '—'; } };
const tierOf = (p) => { const r = p.perf; const age = p.age || 30; const thru = Fz.controlThru(p);
  if (!r) return { k: 'Depth', why: 'No qualifying 2026 MLB sample (200 PA / 60 IP SP / 30 IP RP)' };
  const pct = Math.round(100 * (1 - (r.rank - 1) / Math.max(1, r.of)));
  if (pct >= 85 && age <= 30 && thru >= 2027) return { k: 'Cornerstone', why: `Top-15% ${r.grp}, age ${age}, controlled thru ${thru}`, pct };
  if (pct >= 65 || (pct >= 50 && age <= 26)) return { k: 'Core', why: `${pct}th pct ${r.grp}${age <= 26 ? ', young' : ''}${thru <= 2026 ? ', expiring' : ''}`, pct };
  if (pct >= 35) return { k: 'Contributor', why: `${pct}th pct ${r.grp}`, pct };
  return { k: 'Depth', why: `${pct}th pct ${r.grp}`, pct }; };
const scoreBadge = (p) => { const r = p.perf || perfOf(p); if (!r) return `<span class="ps na" title="No qualifying 2026 MLB sample">—<small>no data</small></span>`; const t = tierOf({ ...p, perf: r }); return `<span class="ps ${t.k === 'Cornerstone' ? 't1' : t.k === 'Core' ? 't2' : ''}" title="Performance Score ${r.score} (stat-based) · #${r.rank} of ${r.of} ${r.grp} · ${esc(r.line)}">${r.score}<small>#${r.rank} ${r.grp}</small></span>`; };
const ptags = (p) => [p.contract && (p.contract.ends || 2026) <= 2026 ? '<span class="tag med">Expiring</span>' : '', p.arb ? '<span class="tag">Arb</span>' : '', p.inj ? `<span class="tag crit">${esc(p.inj.status)}</span>` : '', p.acquiredFrom ? `<span class="tag">via ${p.acquiredFrom}</span>` : '', p.signed ? '<span class="tag hi">Signed</span>' : ''].filter(Boolean).join(' ');
const salTxt = (p) => { const s = Fz.playerSalary(p.name); return s ? ` · ${fm(M(s.v))}${s.prov === 'E' ? ' arb' : ''}` : ''; };
const pcard = (p, { compact = false } = {}) => `<button class="pcard2 ${p.inj ? 'inj' : ''} ${compact ? 'compact' : ''}" data-action="player" data-id="${esc(p.name)}" aria-label="${esc(p.name)} details"><span class="avatar">${initials(p.name)}</span><span class="pinfo"><span class="pname">${esc(p.name)}</span><span class="pmeta">${esc(p.pos || '')} · ${p.age || '?'} · thru ${Fz.controlThru(p)}${salTxt(p)}</span>${compact ? '' : `<span class="ptags">${ptags(p)}</span>`}</span>${scoreBadge(p)}</button>`;
const needBar = (n) => `<div class="need-row"><span class="need-pos">${n.group.id}</span><div class="need-bar"><div class="need-fill ${urgCls(n.urgency)}" style="width:${n.score}%"></div></div><span class="need-score num">${n.score}</span><span class="tag ${urgCls(n.urgency)}">${n.urgency}</span><span class="need-why small muted">${esc(n.why.join(' · ') || 'Settled')}</span></div>`;
const meter = (pct, verdict) => `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="meter-fill ${pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : pct >= 25 ? 'low' : 'bad'}" style="width:${pct}%"></div><span class="meter-txt">${verdict} · ${pct}%</span></div>`;
const stat = (label, val, cls = '', sub = '') => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
const card = (title, sub, body, extra = '') => `<div class="card"><div class="card-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}${extra}</div>${body}</div>`;
const tabs = (action, cur, list) => `<div class="tabs" role="tablist">${list.map(([id, l]) => `<button role="tab" aria-selected="${cur === id}" data-action="${action}" data-id="${id}">${l}</button>`).join('')}</div>`;
const newsTag = (t) => /trade/i.test(t) ? 'hi' : /injur|IL\b/i.test(t) ? 'crit' : '';
const Views = {};
Views.hub = () => {
  const s = S(); const sum = Fz.summary(s); const me = sum.me; const y = sum.pay;
  const tile = (id, title, kpi, sub) => `<button class="tile" data-action="module" data-id="${id}"><span class="tile-ico">${ICONS[id] || ''}</span><span class="tile-title">${title}</span><span class="tile-kpi">${kpi}</span><span class="tile-sub">${sub}</span></button>`;
  const al = Fz.alerts(s, y); const fa = Fz.pendingFA(s);
  const post = (RAW.schedule && RAW.schedule.postseason) || []; const nxt = RAW.schedule && RAW.schedule.next;
  const tx = (RAW.transactions || []).slice(0, 8); const rum = ((RAW.rumors && RAW.rumors.items) || []).slice(0, 6);
  const ord = ['1st', '2nd', '3rd', '4th', '5th']; const pool = ((RAW.international || {}).pool || {}).amount || 0;
  return `
  <section class="fm-hero" style="--team:${T.colors.brand}">
    <div class="fm-hero-main"><div class="fm-crest">${LOGO.replace('width="34" height="34"', 'width="64" height="64"')}</div>
      <div><div class="fm-kicker">Franchise Mode · 2026-27 offseason · data ${esc(fmtET((RAW.meta || {}).lastRun))}</div>
        <h2 class="fm-team">${esc(T.city)} <span>${esc(T.short)}</span></h2>
        <div class="fm-line"><span class="num">${sum.record}</span> · ${ord[(me.divRank || 1) - 1]} ${esc(me.division || '')} · GB ${esc(me.gb || '-')} · RS ${me.rs ?? '?'} / RA ${me.ra ?? '?'} (${me.diff > 0 ? '+' : ''}${me.diff ?? ''}) <span class="tag ${statusCls(sum.status)}">${me.clinch ? 'Postseason' : sum.status}</span></div>
        <div class="fm-line small muted">${me.clinch ? 'Postseason club · ' : 'Missed postseason · '}${nxt && nxt.openingDay ? `2027 Opening Day ${esc(fmtD(nxt.openingDay))} · ` : ''}CBA expires Dec 1, 2026</div></div></div>
    <div class="fm-hero-stats">
      <div class="hstat"><span>CBT payroll 2026</span><b class="num">${fm(M(y[2026].total), { digits: 1 })}</b></div>
      <div class="hstat"><span>vs 1st threshold</span><b class="num ${y[2026].th[0] - y[2026].total < 0 ? 'neg' : 'pos'}">${fm(M(y[2026].th[0] - y[2026].total), { plus: true, digits: 1 })}</b></div>
      <div class="hstat"><span>2027 projected</span><b class="num">${fm(M(y[2027].total), { digits: 1 })}</b></div>
      <div class="hstat"><span>2027 room</span><b class="num ${y[2027].room < 0 ? 'neg' : y[2027].room < 15e6 ? 'warn' : 'pos'}">${fm(M(y[2027].room), { plus: true, digits: 1 })}</b></div>
      <div class="hstat"><span>40-man</span><b class="num">${sum.rosterCount}<small>/40</small></b></div>
      <div class="hstat"><span>Top-100 prospects</span><b class="num">${sum.top100}</b></div>
      <div class="hstat"><span>Intl pool</span><b class="num">${pool ? fm(M(pool), { digits: 2 }) : '—'}</b></div>
    </div>
  </section>
  <div class="fm-tiles">
    ${tile('depth', 'Depth Chart', `${sum.needs.filter((n) => n.urgency === 'Critical').length} critical`, `Top need: ${sum.needs[0].group.label}`)}
    ${tile('trademachine', 'Trade Machine', `${s.trades.length} executed`, `29 partners · ${L.teams.filter((t) => L.status(t) === 'Seller').length} sellers`)}
    ${tile('freeagency', 'Free Agency', `${fa.length} leaving`, `${L.fa.length} on the 2026-27 FA list`)}
    ${tile('draft', 'Draft Central', `${L.t30.length} Pipeline`, `${sum.top100} in MLB Top 100 · intl pool ${pool ? fm(M(pool), { digits: 1 }) : 'n/a'}`)}
    ${tile('league', 'League', `${L.teams.filter((t) => t.clinch).length} clinched`, 'AL/NL standings · buyers & sellers')}
    ${tile('calculator', 'Payroll Office', fm(M(y[2027].room), { plus: true, digits: 1 }), `2027 room vs ${esc(P(s).label)} ceiling · ${al.filter((a) => a.level === 'critical').length} critical alerts`)}
  </div>
  <div class="grid sidebar-right"><div class="stack">
    ${card('Positional needs', 'Stat-based starter quality, contract status, injuries, Pipeline ETA → 0–100', `<div class="needs">${sum.needs.map(needBar).join('')}</div>`)}
    ${card('Transaction wire', 'MLB Stats API', `<div class="wire">${tx.map((t) => `<div class="wire-row"><span class="wire-date num">${esc(String(t.date).slice(5))}</span><span class="tag ${newsTag(t.type + ' ' + t.desc)}">${esc((t.type || '').replace('Signed as Free Agent', 'Signed').replace('Status Change', 'Status'))}</span><span>${esc(t.desc)}</span></div>`).join('') || '<div class="empty small">No transactions</div>'}</div>`)}
    ${card('Rumor mill', `MLB Trade Rumors · ${esc(T.short)} feed`, `<div class="wire">${rum.map((r) => `<div class="wire-row"><span class="wire-date num">${esc(String(r.date || '').slice(5, 10))}</span><span class="tag">Rumor</span><span><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a></span></div>`).join('') || '<div class="empty small">Feed unavailable</div>'}</div>`)}
  </div><div class="stack">
    ${card('GM inbox', `${al.length} alerts`, `<div class="alerts">${al.map((a) => `<div class="alert ${a.level}"><div class="bar"></div><div><b>${esc(a.title)}</b><span>${esc(a.msg)}</span></div></div>`).join('')}</div>`)}
    ${card('Injury report', 'ESPN', L.injuries.slice(0, 8).map((i) => `<div class="wire-row"><span class="tag crit">${esc(i.status)}</span><span><b>${esc(i.name)}</b> — ${esc(i.type || '')}<div class="small muted">${esc((i.detail || '').slice(0, 140))}</div></span><span></span></div>`).join('') || '<div class="empty small">No injuries listed</div>')}
    ${card('Leaving after 2026', '', fa.slice(0, 6).map((f) => `<div class="wire-row"><span class="tag ${f.priority === 'Priority' ? 'crit' : f.priority === 'Starter' ? 'med' : ''}">${f.priority}</span><span><b>${esc(f.name)}</b> <span class="muted small">${f.pf ? `PS ${f.pf.score}` : 'no sample'}${f.opt ? ' · ' + esc(f.opt.text) : ''}</span></span><span></span></div>`).join('') || '<div class="empty small">None</div>', '<button class="btn sm" data-action="module" data-id="freeagency">Open</button>')}
  </div></div>`;
};

Views.puzzle = () => {
  const rs = Fz.roster(S()); const order = ['Cornerstone', 'Core', 'Contributor', 'Depth'];
  const desc = { Cornerstone: 'Top-15% in position group, ≤30, controlled 2027+', Core: '65th+ percentile, or 50th+ and ≤26', Contributor: '35th+ percentile', Depth: 'Below 35th percentile or no qualifying sample' };
  const tiers = Object.fromEntries(order.map((k) => [k, []])); rs.forEach((p) => tiers[tierOf(p).k].push(p));
  order.forEach((k) => tiers[k].sort((a, b) => ((b.perf || {}).score || 0) - ((a.perf || {}).score || 0)));
  const row = (p) => { const r = p.perf; const t = tierOf(p); return `<button class="pz-row" data-action="player" data-id="${esc(p.name)}" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;color:inherit;text-align:left;cursor:pointer">${scoreBadge(p)}<span class="grow"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.pos)} · ${p.age} · thru ${Fz.controlThru(p)}</span>${r ? `<div class="pz-bar"><i style="width:${t.pct || 0}%"></i></div>` : ''}<div class="small muted">${esc(t.why)}${r ? ' · ' + esc(r.line) : ''}</div></span></button>`; };
  const m = L.perfMeta; const leaders = {}; Object.values(L.perfById).forEach((p) => { (leaders[p.grp] = leaders[p.grp] || []).push(p); });
  return `${card('Core pieces of the World Series puzzle', 'Tiers from stat-based Performance Score + age + control · no subjective ratings', `<p class="small" style="margin:0;color:var(--text-2);line-height:1.6">${m ? esc(m.method) : 'Performance data not loaded.'} Percentiles are vs all qualified MLB players in the same group (C, 1B, MI, 3B, OF, DH, SP, RP). Data: MLB Stats API 2026 regular season · updated ${esc(fmtET(m && m.updated))}. Defense, framing and baserunning are not in this free feed, so they are not scored.</p>`)}
    <div class="tier-grid" style="margin-top:14px">${order.map((k) => `<div class="card tier-col"><h3>${k} <span class="muted small">${tiers[k].length}</span></h3><div class="small muted" style="margin-bottom:6px">${desc[k]}</div>${tiers[k].map(row).join('') || '<div class="small muted">None</div>'}</div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h2>League leaders by group</h2><span class="sub">Top 5 Performance Scores · context for the ranks above</span></div><div class="tier-grid">${Object.entries(leaders).sort().map(([g, l]) => `<div><b>${g}</b> <span class="muted small">(${l.length} ranked)</span>${l.sort((a, b) => a.rank - b.rank).slice(0, 5).map((x) => `<div class="small" style="padding:3px 0">#${x.rank} ${esc(x.name)} <span class="muted">${esc((L.teamByName[x.team] || {}).abbr || x.team || '')}</span> <b class="num">${x.score}</b></div>`).join('')}</div>`).join('')}</div></div>`;
};

Views.depth = () => {
  const s = S(); const side = s.ui.depthSide; const dc = Fz.depthChart(s).filter((d) => d.group.side === side); const ns = Fz.needs(s);
  return `<div class="row between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px"><div class="seg" role="tablist">${[['POS', 'Position players'], ['PIT', 'Pitching staff']].map(([id, l]) => `<button role="tab" data-action="depthSide" data-id="${id}" aria-pressed="${side === id}">${l}</button>`).join('')}</div>
    <span class="small muted">${Fz.roster(s).length}/40 on the 40-man · Badge = stat-based <b>Performance Score</b> &amp; MLB rank in group · ⭐ = MLB Pipeline ${esc(T.short)} Top 30 at that primary position</span></div>
  <div class="depth-grid">${dc.map(({ group: g, players, starters, backups, pipe }) => { const n = ns.find((x) => x.group.id === g.id); return `<div class="card depth-col"><div class="depth-head"><div><div class="depth-pos">${g.id}</div><div class="small muted">${esc(g.label)} · ${players.length}</div></div><span class="tag ${urgCls(n.urgency)}" title="${esc(n.why.join(' · '))}">Need ${n.score}</span></div>
    <div class="depth-label">${g.starters > 1 ? 'Top ' + g.starters : 'Starter'}</div>${starters.map((p) => pcard(p)).join('') || '<div class="empty small">Open slot</div>'}
    <div class="depth-label">Depth</div>${backups.slice(0, g.side === 'PIT' ? 6 : 3).map((p) => pcard(p, { compact: true })).join('') || '<div class="empty small">No depth</div>'}
    ${pipe.length ? `<div class="depth-label">Pipeline</div>${pipe.map((x) => `<div class="small" style="padding:4px 2px">⭐ <b>${esc(x.name)}</b> <span class="muted">#${x.rank} · ${esc(x.pos)} · age ${x.age ?? '?'} · ETA ${x.eta ?? '—'}</span></div>`).join('')}` : ''}</div>`; }).join('')}</div>`;
};
Views.trademachine = () => {
  const s = S(); const tm = s.ui.tm; const others = L.teams.filter((t) => t.id !== T.id).sort((a, b) => a.name.localeCompare(b.name));
  if (!tm.partner) tm.partner = (others.find((t) => L.status(t) === 'Seller') || others[0] || {}).abbr;
  const partner = L.teams.find((t) => t.abbr === tm.partner) || {};
  const give = tm.give, get = tm.get.map((a) => ({ ...a, salary: tm.salaries[a.id] != null && tm.salaries[a.id] !== '' ? tm.salaries[a.id] * 1e6 : (a.sal ? a.sal.v : null) }));
  const ev = Fz.evaluateTrade(s, tm.partner, give, get); const room = Fz.payroll(s)[2027].room;
  const mine = Fz.myAssets(s).sort((a, b) => b.value - a.value); const theirs = Fz.partnerAssets(tm.partner).filter((a) => !tm.get.some((g) => g.id === a.id));
  const lbl = (a) => `<b>${esc(a.name)}</b> <span class="muted small">${esc(a.pos || '')} · ${a.age ?? '?'}${a.kind === 'prospect' ? ` · ${a.rank100 ? 'Top100 #' + a.rank100 : 'Org #' + a.rank30}` : ''}${a.sal ? ' · ' + fm(M(a.sal.v)) : ''}</span>`;
  const assetRow = (a, side) => `<div class="asset"><span>${lbl(a)}${side === 'get' && a.kind === 'player' ? `<br><label class="small muted">2027 salary $M <input type="number" step="0.1" min="0" style="width:72px" data-action="tmSalary" data-id="${a.id}" value="${tm.salaries[a.id] ?? (a.sal ? r1(M(a.sal.v)) : '')}" placeholder="unknown"></label>` : ''}</span><span class="num small">${a.value} pts</span><button class="btn sm ghost" data-action="tmRemove" data-side="${side}" data-id="${a.id}" aria-label="Remove">✕</button></div>`;
  const addRow = (a, side) => `<button class="asset add" data-action="tmAdd" data-side="${side}" data-id="${a.id}"><span>${lbl(a)}</span>${a.kind === 'player' ? scoreBadge(a) : '<span class="tag hi">Prospect</span>'}<span class="num small">${a.value} pts</span></button>`;
  const total = Math.max(ev.giveValue, ev.getValue, 1); const after = room + (ev.salOut || 0) - (ev.salIn || 0);
  return `<div class="tm-grid">
    <div class="card tm-col"><div class="card-head"><h2>${esc(T.short)} send</h2><span class="num small">${ev.giveValue} pts</span></div>
      <div class="asset-list">${give.length ? give.map((a) => assetRow(a, 'give')).join('') : '<div class="empty small">Add players or prospects below</div>'}</div>
      <div class="depth-label">40-man &amp; Pipeline Top 30</div><div class="asset-scroll">${mine.map((a) => addRow(a, 'give')).join('')}</div></div>
    <div class="card tm-col tm-center"><div class="card-head"><h2>Proposal</h2><span class="sub">${esc(partner.name || '')} · ${partner.w}-${partner.l} · <span class="tag ${statusCls(ev.status)}">${ev.status}</span></span></div>
      <div class="vbars"><div class="vbar"><span>${T.abbr} sends</span><div class="vtrack"><div class="vfill" style="width:${ev.giveValue / total * 100}%"></div></div><span class="num">${ev.giveValue}</span></div><div class="vbar"><span>${esc(partner.abbr)} sends</span><div class="vtrack"><div class="vfill alt" style="width:${ev.getValue / total * 100}%"></div></div><span class="num">${ev.getValue}</span></div></div>
      ${meter(ev.accept, ev.verdict)}
      <p class="small muted" style="margin:8px 0 12px">${ev.verdict === 'Incomplete' ? 'Add assets on both sides to evaluate.' : `${esc(partner.abbr)} sees ${ev.ratio}× value${ev.status === 'Seller' ? ' (sellers weight prospects +20%)' : ev.status === 'Contender' ? ' (contenders weight MLB players +15%)' : ''}${ev.needHits.length ? ` · fills ${T.abbr} ${ev.needHits.map((n) => `${n.grp} (need ${n.score})`).join(', ')}` : ''}.`} Value points are a model estimate from Performance Score, age, control and salary (prospects: Pipeline rank) — not a scouting grade.</p>
      <div class="stats">${stat('Salary out (2027)', fm(M(ev.salOut || 0)), 'pos')}${stat('Salary in (2027)', fm(M(ev.salIn || 0)), 'neg', ev.unknownSal ? 'Some incoming salaries unknown — enter them' : '')}${stat('2027 room after', fm(M(after), { plus: true }), U.cls(after))}</div>
      <div class="row between" style="margin-top:14px"><button class="btn sm ghost" data-action="tmClear">Clear</button><button class="btn primary" data-action="tmExecute" ${ev.verdict === 'Incomplete' || ev.verdict === 'Reject' ? 'disabled' : ''}>Execute trade</button></div></div>
    <div class="card tm-col"><div class="card-head"><h2>${esc(partner.abbr || '')} send</h2><span class="num small">${ev.getValue} pts</span></div>
      <div class="field" style="margin-bottom:10px"><span>Trade partner</span><select data-action="tmPartner">${others.map((t) => `<option value="${t.abbr}" ${t.abbr === tm.partner ? 'selected' : ''}>${esc(t.name)} · ${t.w}-${t.l} · ${L.status(t)}</option>`).join('')}</select></div>
      <div class="asset-list">${get.length ? get.map((a) => assetRow(a, 'get')).join('') : '<div class="empty small">Add qualified MLB players or Top-100 prospects below</div>'}</div>
      <div class="depth-label">Qualified 2026 MLB players &amp; Top-100 prospects</div><div class="asset-scroll">${theirs.map((a) => addRow(a, 'get')).join('') || '<div class="empty small">No assets</div>'}</div></div>
  </div>
  <div style="margin-top:16px">${card('Executed trades', `${s.trades.length} · flow into payroll, depth chart and needs`, s.trades.length ? `<div class="table-wrap"><table><thead><tr><th>Partner</th><th>${T.abbr} send</th><th>${T.abbr} receive</th><th class="num">Value</th><th>Verdict</th><th></th></tr></thead><tbody>${s.trades.map((t, i) => `<tr><td>${esc(t.partnerAbbr)}</td><td class="small">${t.give.map((a) => esc(a.name)).join(', ')}</td><td class="small">${t.get.map((a) => esc(a.name) + (a.salary ? ` (${fm(M(a.salary))})` : '')).join(', ')}</td><td class="num">${t.giveValue}/${t.getValue}</td><td>${t.verdict}</td><td><button class="btn sm danger" data-action="tradeUndo" data-id="${i}">Undo</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">No trades executed in this plan.</div>')}</div>`;
};

Views.freeagency = () => {
  const s = S(); const tab = s.ui.faTab; const ns = Fz.needs(s); let body;
  if (tab === 'own') {
    const list = Fz.pendingFA(s);
    body = `<p class="section-sub">Players whose guaranteed deals end after 2026 (or who opt out / have options declined in this plan). Re-sign terms are <b>your inputs</b> — no salary is guessed.</p><div class="table-wrap"><table><thead><tr><th>Player</th><th class="num">PS</th><th>Option / opt-out (MLBTR)</th><th>Decision</th><th>Re-sign</th><th class="num">AAV $M</th><th class="num">Years</th></tr></thead><tbody>${list.map((f) => { const r = s.resigns[f.id] || {}; return `<tr><td><b>${esc(f.name)}</b> <span class="tag ${f.priority === 'Priority' ? 'crit' : f.priority === 'Starter' ? 'med' : ''}">${f.priority}</span></td><td class="num">${f.pf ? f.pf.score : '—'}</td><td class="small">${esc(f.opt ? f.opt.text : '—')}</td><td>${f.opt ? `<select data-action="optDecision" data-id="${f.id}">${(f.opt.kind === 'optout' ? ['stay', 'out'] : ['exercise', 'decline']).map((o) => `<option ${f.decision === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : '<span class="muted small">FA</span>'}</td><td><input type="checkbox" data-action="resignOn" data-id="${f.id}" ${r.on ? 'checked' : ''}></td><td class="num"><input type="number" min="0" step="0.5" style="width:80px" data-action="resignAav" data-id="${f.id}" value="${r.aav ?? ''}"></td><td class="num"><input type="number" min="1" max="10" style="width:56px" data-action="resignYears" data-id="${f.id}" value="${r.years ?? 1}"></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">None</td></tr>'}</tbody></table></div>`;
  } else {
    const f = s.ui.faFilter; const list = L.fa.filter((p) => p.team !== T.name && (!f || faGroup(p) === f)).map((p) => { const pf = perfOf(p); const need = (ns.find((n) => n.group.id === faGroup(p)) || {}).score || 0; const fit = Math.round((pf ? pf.score : 25) * 0.6 + need * 0.4 - Math.max(0, (p.age2027 || 30) - 32) * 3); return { ...p, pf, need, fit }; }).sort((a, b) => b.fit - a.fit);
    body = `<p class="section-sub">2026-27 free-agent list from <a href="${esc((RAW.free_agents || {}).url)}" target="_blank" rel="noopener">MLB Trade Rumors</a> (updated ${esc((RAW.free_agents || {}).list_updated || '?')}). <b>Fit</b> = 60% Performance Score + 40% ${esc(T.short)} need at his position − age penalty past 32 (estimate). Contract terms are your inputs; no market price is invented.</p>
    <div class="row" style="margin-bottom:10px"><select data-action="faFilter"><option value="">All positions</option>${GROUPS.map((g) => `<option value="${g.id}" ${f === g.id ? 'selected' : ''}>${g.id}</option>`).join('')}</select><span class="small muted">${list.length} players</span></div>
    <div class="table-wrap"><table><thead><tr><th class="num">Fit</th><th>Player</th><th>Pos</th><th class="num">Age '27</th><th>2026 team</th><th class="num">PS</th><th>2026 line</th><th>Option</th><th>Sign</th><th class="num">AAV $M</th><th class="num">Yrs</th></tr></thead><tbody>${list.slice(0, 150).map((p) => { const r = s.signings[p.id] || {}; return `<tr><td class="num"><b>${p.fit}</b></td><td><b>${esc(p.name)}</b></td><td>${faGroup(p)}</td><td class="num">${p.age2027 ?? ''}</td><td class="small">${esc((L.teamByName[p.team] || {}).abbr || p.team || '')}</td><td class="num">${p.pf ? p.pf.score : '—'}</td><td class="small">${esc(p.pf ? p.pf.line : '')}</td><td class="small">${esc(p.option || '')}</td><td><input type="checkbox" data-action="signOn" data-id="${p.id}" ${r.on ? 'checked' : ''}></td><td class="num"><input type="number" min="0" step="0.5" style="width:72px" data-action="signAav" data-id="${p.id}" value="${r.aav ?? ''}"></td><td class="num"><input type="number" min="1" max="10" style="width:52px" data-action="signYears" data-id="${p.id}" value="${r.years ?? 1}"></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const pay = Fz.payroll(s)[2027];
  return `<div class="grid kpis" style="margin-bottom:14px">${stat('Re-signed AAV', fm(M(pay.lines.resigns)))}${stat('FA signings AAV', fm(M(pay.lines.signings)))}${stat('2027 projected CBT', fm(M(pay.total)))}${stat('2027 room', fm(M(pay.room), { plus: true }), U.cls(pay.room))}</div><div class="card">${tabs('faTab', tab, [['own', `Own free agents (${Fz.pendingFA(s).length})`], ['market', `League FA class (${L.fa.length})`]])}${body}</div>`;
};
Views.draft = () => {
  const s = S(); const tab = s.ui.draftTab; const ns = Fz.needs(s); const I = RAW.international || {}; const pool = I.pool || {}; let body;
  const hl = (on) => on ? 'background:rgba(var(--accent-rgb),.12)' : '';
  if (tab === 'pipeline') {
    body = `<p class="section-sub">MLB Pipeline ${esc(T.short)} Top 30, scraped from <a href="${esc((RAW.prospects || {}).team30_url)}" target="_blank" rel="noopener">MLB.com</a>. <b>Fills</b> = big-league need at the prospect's primary position (Depth Chart model) — where the pipe is stocked vs thin. Scouting grades are MLB Pipeline's, not ours.</p>
    <div class="grid kpis" style="margin-bottom:14px">${GROUPS.map((g) => { const n = L.t30.filter((x) => primaryPos(x.pos) === g.id).length; const nd = ns.find((k) => k.group.id === g.id); return stat(g.id, n, n === 0 && nd.score >= 55 ? 'neg' : n >= 3 ? 'pos' : '', `need ${nd.score}`); }).join('')}</div>
    <div class="cards">${L.t30.map((x) => { const g = primaryPos(x.pos); const n = ns.find((k) => k.group.id === g) || { score: 0, urgency: 'Low' }; const r100 = (L.t100.find((y) => norm(y.name) === norm(x.name)) || {}).rank; return `<div class="pcard"><div class="row between"><span><span class="rank">${x.rank}</span><span class="name">${esc(x.name)}</span></span>${r100 ? `<span class="tag hi">Top100 #${r100}</span>` : ''}</div><div class="meta">${esc(x.pos)} · age ${x.age ?? '?'} · ETA ${x.eta ?? '—'}${x.level ? ' · ' + esc(x.level) : ''}</div><div class="need">Fills ${g} · <span class="tag ${urgCls(n.urgency)}">need ${n.score}</span></div>${x.grades ? `<div class="small muted">${esc(x.grades)}</div>` : ''}</div>`; }).join('')}</div>`;
  } else if (tab === 'top100') {
    body = `<p class="section-sub">MLB Pipeline Top 100 — ${esc(T.short)} rows highlighted. Use the Trade Machine to target other clubs' prospects.</p><div class="table-wrap"><table><thead><tr><th class="num">#</th><th>Player</th><th>Pos</th><th>Team</th><th class="num">Age</th><th class="num">ETA</th><th>Level</th></tr></thead><tbody>${L.t100.map((x) => `<tr style="${hl(x.team === T.name)}"><td class="num">${x.rank}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.pos)}</td><td class="small">${esc(x.team)}</td><td class="num">${x.age ?? ''}</td><td class="num">${x.eta ?? ''}</td><td class="small">${esc(x.level || '')}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (tab === 'class') {
    const cls = (Array.isArray(RAW.draft) ? RAW.draft : []);
    body = `<p class="section-sub">${esc(T.short)} 2026 draft class (MLB Stats API draft endpoint). Signing bonus vs slot value as published; blank = not reported.</p><div class="table-wrap"><table><thead><tr><th>Rd</th><th class="num">Pick</th><th>Player</th><th>Pos</th><th>School</th><th class="num">Bonus</th><th class="num">Slot</th><th class="num">Pre-draft rank</th></tr></thead><tbody>${cls.map((p) => `<tr><td>${esc(p.round)}</td><td class="num">${p.pick ?? ''}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.pos)}</td><td class="small">${esc(p.school || '')}</td><td class="num">${p.bonus ? fm(M(+p.bonus), { digits: 2 }) : '—'}</td><td class="num">${p.slot ? fm(M(+p.slot), { digits: 2 }) : '—'}</td><td class="num">${p.rank ?? '—'}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (tab === 'order') {
    const pct = (t) => t.w / Math.max(1, t.w + t.l);
    const ord = L.teams.filter((t) => !t.clinch).sort((a, b) => pct(a) - pct(b)).concat(L.teams.filter((t) => t.clinch).sort((a, b) => pct(a) - pct(b)));
    const mine = ord.findIndex((t) => t.id === T.id) + 1;
    body = `<p class="section-sub"><b>Reverse-record order, pre-lottery (estimate).</b> The 2027 Draft Lottery sets the top six among non-playoff clubs, and postseason results reorder playoff teams; competitive-balance and compensation picks are not shown. ${esc(T.short)}: <b>#${mine}</b> in this view — not an official slot.</p><div class="table-wrap"><table><thead><tr><th class="num">#</th><th>Team</th><th class="num">W-L</th><th>Status</th></tr></thead><tbody>${ord.map((t, i) => `<tr style="${hl(t.id === T.id)}"><td class="num">${i + 1}</td><td>${esc(t.name)}</td><td class="num">${t.w}-${t.l}</td><td>${t.clinch ? '<span class="tag hi">Playoff team</span>' : '<span class="tag">Lottery-eligible</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const sig = I.signings || [];
    body = `<div class="grid kpis" style="margin-bottom:14px">${stat('2026-27 bonus pool', pool.amount ? fm(M(pool.amount), { digits: 2 }) : '<span class="muted">unknown</span>', '', 'Baseball America')}${stat('Spent', pool.spent == null ? '<span class="muted">not public</span>' : fm(M(pool.spent), { digits: 2 }))}${stat('Available', pool.available == null ? '<span class="muted">not public</span>' : fm(M(pool.available), { digits: 2 }))}${stat('Signings found', sig.length)}</div>
    <p class="section-sub">${esc(pool.note || '')} Signings: <a href="${esc(I.url)}" target="_blank" rel="noopener">${esc(I.source || '')}</a>. ${sig.some((x) => x.bonus) ? '' : '<b>Individual bonuses are blank</b> — no free public source lists them for this club, so none are shown or guessed.'} ${(pool.corroboration || []).map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`).join(' · ')}</p>
    <div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th>Country</th><th class="num">Bonus</th><th>Signed</th></tr></thead><tbody>${sig.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.pos || '')}</td><td class="num">${x.age ?? ''}</td><td>${esc(x.country || '')}</td><td class="num">${x.bonus ? fm(M(x.bonus), { digits: 2 }) : '<span class="muted">—</span>'}</td><td class="small">${esc(x.month || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">None found</td></tr>'}</tbody></table></div>`;
  }
  return `<div class="card">${tabs('draftTab', tab, [['pipeline', 'Pipeline Top 30'], ['top100', 'MLB Top 100'], ['class', '2026 Draft class'], ['order', '2027 order'], ['intl', 'International']])}${body}</div>`;
};

Views.league = () => {
  const s = S(); const tab = s.ui.leagueTab; const st = RAW.standings || []; const ts = RAW.team_stats || {}; let body;
  const hl = (on) => on ? 'background:rgba(var(--accent-rgb),.12)' : '';
  if (tab === 'standings') body = ['AL', 'NL'].map((lg) => `<h3 class="section-title" style="margin:6px 0 10px">${lg === 'AL' ? 'American League' : 'National League'}</h3><div class="div-grid" style="margin-bottom:14px">${st.filter((d) => d.league === lg).map((d) => `<div class="card tight"><div class="card-head"><h2>${esc(d.division)}</h2></div><div class="table-wrap"><table class="tight"><thead><tr><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">GB</th><th class="num">Diff</th><th>Status</th></tr></thead><tbody>${d.teams.map((t) => `<tr style="${hl(t.id === T.id)}"><td><b>${esc(t.abbr)}</b> ${t.clinch ? `<span class="tag hi">${esc(t.clinch)}</span>` : ''}</td><td class="num">${t.w}</td><td class="num">${t.l}</td><td class="num">${esc(t.gb)}</td><td class="num ${U.cls(t.diff)}">${t.diff > 0 ? '+' : ''}${t.diff}</td><td><span class="tag ${statusCls(L.status(t))}">${L.status(t)}</span></td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`).join('') + '<p class="small muted">Clinch codes from MLB Stats API (z = best record, y = division, w = wild card). Buyer/seller status is this lab\'s estimate from win%.</p>';
  else if (tab === 'stats') body = `<div class="table-wrap"><table><thead><tr><th>Team</th><th class="num">R</th><th class="num">HR</th><th class="num">OBP</th><th class="num">OPS</th><th class="num">SB</th><th class="num">ERA</th><th class="num">WHIP</th></tr></thead><tbody>${(ts.hitting || []).map((h) => { const p = (ts.pitching || []).find((x) => x.id === h.id) || {}; return `<tr style="${hl(h.id === T.id)}"><td>${esc(h.name)}</td><td class="num">${h.runs}</td><td class="num">${h.homeRuns}</td><td class="num">${h.obp}</td><td class="num">${h.ops}</td><td class="num">${h.stolenBases}</td><td class="num">${p.era ?? ''}</td><td class="num">${p.whip ?? ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  else { const arb = (RAW.arbitration || {}).teams || {}; body = `<p class="section-sub">Projected 2027 arbitration cost by club (<a href="${esc((RAW.arbitration || {}).url)}" target="_blank" rel="noopener">MLBTR / Matt Swartz</a>) — a proxy for payroll pressure on trade partners.</p><div class="table-wrap"><table><thead><tr><th>Team</th><th class="num">Arb-eligible</th><th class="num">Projected total</th><th>Status</th></tr></thead><tbody>${Object.entries(arb).filter(([k]) => L.teamByName[k]).map(([k, v]) => ({ k, n: v.length, tot: v.reduce((a, x) => a + x.proj, 0) })).sort((a, b) => b.tot - a.tot).map((r) => `<tr style="${hl(r.k === T.name)}"><td>${esc(r.k)}</td><td class="num">${r.n}</td><td class="num">${fm(M(r.tot))}</td><td><span class="tag ${statusCls(L.status(L.teamByName[r.k]))}">${L.status(L.teamByName[r.k])}</span></td></tr>`).join('')}</tbody></table></div>`; }
  return `<div class="card">${tabs('leagueTab', tab, [['standings', 'AL / NL standings'], ['stats', 'Team stats'], ['arb', 'Arbitration pressure']])}${body}</div>`;
};
Views.overview = () => {
  const s = S(); const pay = Fz.payroll(s); const th = pay[2026].th; const tp = L.payroll;
  const ser = [{ label: 'Guaranteed (AAV, net of moves)', color: Charts.C.committed, values: YEARS.map((y) => y === 2026 ? M(pay[2026].total) : M(pay[y].lines.guaranteed + pay[y].lines.tradesOut + pay[y].lines.dumps)) },
    { label: 'Options exercised', color: Charts.C.ext, values: YEARS.map((y) => y === 2026 ? 0 : M(pay[y].lines.options)) },
    { label: 'Arb + pre-arb + benefits + reserve', color: Charts.C.roster, values: YEARS.map((y) => y === 2026 ? 0 : M(pay[y].lines.arb + pay[y].lines.prearb + pay[y].lines.benefits + pay[y].lines.inSeason)) },
    { label: 'Plan moves (FA, trades in, added)', color: Charts.C.push, values: YEARS.map((y) => y === 2026 ? 0 : M(pay[y].lines.resigns + pay[y].lines.signings + pay[y].lines.tradesIn + pay[y].lines.extra)) }];
  return `<div class="grid kpis" style="margin-bottom:14px">${stat('2026 CBT payroll', fm(M(tp.cbt_payroll || 0)), '', `MLBTR as of ${esc(tp.as_of)} ${U.prov('V')}`)}${stat('2026 LRD payroll', fm(M(tp.lrd_payroll || 0)), '', 'Actual salaries paid')}${stat('2026 est. CBT tax', fm(M(tp.est_tax || 0)), tp.est_tax ? 'neg' : 'pos', esc(L.cbt.payor_status || ''))}${stat('2025 CBT payroll', tp.prev_cbt_2025 ? fm(M(tp.prev_cbt_2025)) : '—')}${stat('2027 projected', fm(M(pay[2027].total)), '', `${esc(P(s).label)} scenario ${U.prov('E')}`)}</div>
  ${card('CBT payroll by year', '2026 = MLBTR actual · 2027 = full projection · 2028+ = guaranteed commitments only', Charts.stacked({ categories: YEARS.map(String), series: ser, markers: YEARS.map((y) => ({ value: M(pay[y].th[0]), label: '1st CBT threshold' })), labels: YEARS.map((y) => M(pay[y].th[0] - pay[y].total)), label: 'CBT payroll by year' }) + Charts.legend(ser.map((x) => ({ color: x.color, label: x.label })).concat([{ color: Charts.C.silver, label: 'Dashed = 1st threshold (2027+ assumed)' }])))}
  <div class="grid two" style="margin-top:14px">${card(`CBT ladder ${L.cbt.season || 2026}`, 'Thresholds & marginal rates', `<div class="table-wrap"><table><thead><tr><th>Tier</th><th class="num">Threshold</th><th class="num">1st-time</th><th class="num">2nd</th><th class="num">3rd+</th><th class="num">${T.abbr} gap</th></tr></thead><tbody>${th.map((t, i) => `<tr><td>Tier ${i + 1}</td><td class="num">${fm(M(t), { digits: 0 })}</td><td class="num">${(L.cbt.rates_first || [])[i]}%</td><td class="num">${(L.cbt.rates_second || [])[i]}%</td><td class="num">${(L.cbt.rates_third_plus || [])[i]}%</td><td class="num ${U.cls(t - pay[2026].total)}">${fm(M(t - pay[2026].total), { plus: true })}</td></tr>`).join('')}</tbody></table></div><p class="small muted">${esc(L.cbt.note || '')}</p>`)}
    ${card('Biggest commitments', 'CBT AAV (MLBTR)', `<div class="table-wrap"><table class="tight"><thead><tr><th>Player</th><th class="num">AAV</th><th class="num">Thru</th><th class="num">% of 2026 CBT</th></tr></thead><tbody>${L.contracts.filter((c) => c.aav_cbt).sort((a, b) => b.aav_cbt - a.aav_cbt).map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${fm(M(c.aav_cbt))}</td><td class="num">${c.ends ?? '—'}</td><td class="num">${(100 * c.aav_cbt / (tp.cbt_payroll || 1)).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div><p class="small muted">The free MLBTR tracker view lists only the top contracts; smaller multi-year deals are not included (see Data &amp; Sources).</p>`)}</div>`;
};

Views.calculator = () => {
  const s = S(); const y = Fz.payroll(s)[2027]; const l = y.lines; const ceil = Fz.ceiling(s);
  const wf = [['Guaranteed contracts (AAV)', l.guaranteed, 'V'], ['Traded away', l.tradesOut, 'D'], ['Cash-retention dumps', l.dumps, 'D'], ['Options exercised', l.options, 'D'], ['Arbitration (tendered)', l.arb, 'E'], [`Pre-arb fill (${l.prearbN} × ${fm(P(s).prearb, { digits: 2 })})`, l.prearb, 'E'], ['Player benefits (CBT)', l.benefits, 'E'], ['Re-signings', l.resigns, 'E'], ['FA signings', l.signings, 'E'], ['Trades in', l.tradesIn, 'E'], ['Added contracts', l.extra, 'V'], ['In-season additions reserve', l.inSeason, 'E']];
  const opts = L.contracts.filter((c) => c.opt && (c.opt.kind !== 'other'));
  return `<div class="grid sidebar-right"><div class="stack">
    <div class="card"><div class="card-head"><h2>2027 CBT payroll build</h2><span class="sub">${esc(P(s).label)} scenario · ceiling ${fm(M(ceil))}</span></div>
      ${wf.map(([k, v, p]) => `<div class="waterfall-row"><span class="lbl">${esc(k)} ${U.prov(p)}</span><span class="num ${v < 0 ? 'pos' : ''}">${fm(M(v))}</span></div>`).join('')}
      <div class="waterfall-row total"><span class="lbl">Projected 2027 CBT payroll</span><span class="num">${fm(M(y.total))}</span></div>
      <div class="waterfall-row total"><span class="lbl">Room vs ceiling</span><span class="num ${U.cls(y.room)}">${fm(M(y.room), { plus: true })}</span></div>
      <div class="waterfall-row"><span class="lbl">Projected CBT tax (if over)</span><span class="num ${y.tax ? 'neg' : ''}">${fm(M(y.tax))}</span></div>
      <p class="small muted" style="margin-top:10px">2027 thresholds are unknown until a new CBA — ${fm(M(y.th[0]), { digits: 0 })} assumed for tier 1. Smaller multi-year contracts missing from the free MLBTR view would add to this total; add them under Contracts.</p></div>
    ${card('2027 projection by scenario', 'Same plan, different assumptions', `<div class="table-wrap"><table><thead><tr><th>Scenario</th><th class="num">Payroll</th><th class="num">Ceiling</th><th class="num">Room</th></tr></thead><tbody>${['base', 'conservative', 'aggressive'].map((k) => { const st = { ...s, scenario: k }; const p = Fz.payroll(st)[2027]; return `<tr><td>${SCEN[k].label}</td><td class="num">${fm(M(p.total))}</td><td class="num">${fm(M(Fz.ceiling(st)))}</td><td class="num ${U.cls(p.room)}">${fm(M(p.room), { plus: true })}</td></tr>`; }).join('')}</tbody></table></div>`)}
  </div><div class="stack">
    ${card('Option & opt-out levers', 'Default from scenario policy · override here', opts.map((c) => { const d = Fz.optionDecision(s, c); return `<div class="control"><label>${esc(c.name)}<br><span class="muted small">${esc(c.opt.text)}</span></label><select data-action="optDecision" data-id="${c.id}">${(c.opt.kind === 'optout' ? ['stay', 'out'] : ['exercise', 'decline']).map((o) => `<option ${d === o ? 'selected' : ''}>${o}</option>`).join('')}</select><span class="hint">PS ${(perfOf(c) || {}).score ?? '—'}${c.opt.amount ? ' · ' + fm(M(c.opt.amount)) + (c.opt.kind === 'optout' ? '/yr remaining' : '') : ''}</span></div>`; }).join('') || '<div class="empty small">No options listed</div>')}
    ${card('Arbitration tenders', `MLBTR projections × ${P(s).arbScale.toFixed(2)}`, L.arbMine.map((a) => `<div class="control"><label class="check"><input type="checkbox" data-action="tender" data-id="${a.id}" ${Fz.tender(s, a) ? 'checked' : ''}> ${esc(a.name)} <span class="muted small">svc ${a.service}</span></label><span class="val">${fm(M(a.proj * P(s).arbScale))}</span><span class="hint">PS ${(L.perfByName[norm(a.name)] || {}).score ?? '—'}${a.note ? ' · ' + esc(a.note) : ''}</span></div>`).join('') || '<div class="empty small">No arbitration-eligible players listed</div>')}
  </div></div>`;
};

Views.roster = () => {
  const s = S(); const rs = Fz.roster(s); const { key, dir } = s.ui.sort;
  const rows = rs.map((p) => { const c = p.contract; const a = p.arb; return { name: p.name, pos: p.pos, age: p.age, ps: p.perf ? p.perf.score : null, aav: c && c.aav_cbt ? c.aav_cbt : a ? a.proj : null, kind: c && c.aav_cbt ? 'Contract' : a ? 'Arb (proj.)' : c ? 'Option / FA list' : 'Pre-arb / unlisted', thru: Fz.controlThru(p), prov: c && c.aav_cbt ? 'V' : a ? 'E' : '', opt: c && (c.options || c.notes), src: c && c.source_url }; });
  rows.sort((a, b) => { const x = a[key], y = b[key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : (x - y)) * dir; });
  const th = (k, l, num) => `<th class="sortable ${num ? 'num' : ''}" data-action="sort" data-id="${k}">${l}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  return `${card('40-man roster & contracts', `${rs.length} players · click headers to sort`, `<div class="table-wrap"><table><thead><tr>${th('name', 'Player')}${th('pos', 'Pos')}${th('age', 'Age', 1)}${th('ps', 'PS', 1)}${th('kind', 'Status')}${th('aav', 'CBT AAV / 2027 arb', 1)}${th('thru', 'Control thru', 1)}<th>Options / notes</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.pos)}</td><td class="num">${r.age ?? ''}</td><td class="num">${r.ps ?? '—'}</td><td class="small">${r.kind}</td><td class="num">${r.aav ? fm(M(r.aav)) : '<span class="muted">—</span>'} ${r.prov ? U.prov(r.prov) : ''}</td><td class="num">${r.thru}</td><td class="small" style="white-space:normal;max-width:320px">${esc(r.opt || '')}${r.src ? ` <a href="${esc(r.src)}" target="_blank" rel="noopener">src</a>` : ''}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Pre-arb salaries are not in a free source; the engine uses ${fm(P(s).prearb, { digits: 2 })} each (estimate). "Control thru" for pre-arb players is estimated from MLB debut year + 6.</p>`)}
  <div class="card" style="margin-top:14px"><div class="card-head"><h2>Add a verified contract</h2><span class="sub">For deals missing from the free MLBTR view — enter from a source you trust</span></div>
    <div class="row"><input id="xName" placeholder="Player"><input id="xAav" type="number" step="0.1" placeholder="CBT AAV $M" style="width:120px"><input id="xFrom" type="number" value="2027" style="width:90px" aria-label="From"><input id="xTo" type="number" value="2028" style="width:90px" aria-label="Through"><input id="xSrc" placeholder="Source URL" style="min-width:220px"><button class="btn sm primary" data-action="extraAdd">Add</button></div>
    ${s.extra.length ? `<div class="table-wrap" style="margin-top:10px"><table class="tight"><tbody>${s.extra.map((e, i) => `<tr><td>${esc(e.name)}</td><td class="num">${fm(e.aav)}</td><td>${e.from}–${e.to}</td><td class="small">${esc(e.src || 'no source given')}</td><td><button class="btn sm danger" data-action="extraDel" data-id="${i}">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
};

Views.cuts = () => {
  const s = S(); const all = (RAW.roster || []).map((p) => ({ ...p, perf: perfOf(p), contract: Fz.contractOf(p.name), arb: L.arbMine.find((a) => norm(a.name) === norm(p.name)) }));
  const rows = all.map((p) => { const c = p.contract; const remaining = c && c.aav_cbt && c.ends ? YEARS.filter((y) => y >= 2027 && y <= c.ends).reduce((x, y) => x + (c['y' + y] || c.aav_cbt), 0) : 0; return { p, c, a: p.arb, remaining, save27: p.arb ? p.arb.proj * P(s).arbScale : 0, on: !!s.releases[p.id] }; }).sort((x, y) => ((y.c && y.c.aav_cbt) || 0) + y.save27 - (((x.c && x.c.aav_cbt) || 0) + x.save27));
  const savedTot = rows.filter((r) => r.on).reduce((a, r) => a + r.save27, 0);
  return `<p class="section-sub">MLB rules: a released player's remaining guaranteed salary is still owed and stays on the CBT payroll, so releasing a guaranteed contract saves <b>nothing</b> unless another club claims him. Non-tendering an arbitration-eligible player saves his projected arb salary. Releasing a pre-arb player saves ~nothing (replaced at the minimum).</p>
  <div class="grid kpis" style="margin-bottom:14px">${stat('Released / non-tendered', rows.filter((r) => r.on).length)}${stat('2027 CBT saving', fm(M(savedTot)), 'pos')}${stat('2027 room now', fm(M(Fz.payroll(s)[2027].room), { plus: true }), U.cls(Fz.payroll(s)[2027].room))}</div>
  ${card('Release / non-tender candidates', 'Sorted by 2027 cost', `<div class="table-wrap"><table><thead><tr><th>Player</th><th class="num">PS</th><th>Type</th><th class="num">Remaining guaranteed (2027+)</th><th class="num">2027 CBT saving</th><th>Release</th></tr></thead><tbody>${rows.slice(0, 60).map((r) => `<tr><td><b>${esc(r.p.name)}</b> <span class="muted small">${esc(r.p.pos)} · ${r.p.age}</span></td><td class="num">${r.p.perf ? r.p.perf.score : '—'}</td><td class="small">${r.c && r.c.aav_cbt ? 'Guaranteed' : r.a ? 'Arb-eligible → non-tender' : 'Pre-arb / minor deal'}</td><td class="num">${r.remaining ? fm(M(r.remaining)) : '—'}</td><td class="num ${r.save27 ? 'pos' : 'muted'}">${r.c && r.c.aav_cbt ? '$0 unless claimed' : r.a ? fm(M(r.save27)) : '~$0'}</td><td><input type="checkbox" data-action="release" data-id="${r.p.id}" ${r.on ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>`)}`;
};

Views.trades = () => {
  const s = S(); const list = L.contracts.filter((c) => c.aav_cbt && c.ends >= 2027);
  return `<p class="section-sub">Salary-dump desk: model trading a guaranteed contract while retaining cash. The retained share stays on your CBT payroll. Talent return is not modelled here — use the Trade Machine for that.</p>
  ${card('Contracts with 2027+ money', 'Slider = % of salary retained', list.map((c) => { const r = s.dumps[c.id]; const on = r !== undefined; const relief = on ? c.aav_cbt * (1 - r / 100) : 0; return `<div class="control"><label class="check"><input type="checkbox" data-action="dumpOn" data-id="${c.id}" ${on ? 'checked' : ''}> ${esc(c.name)} <span class="muted small">${fm(M(c.aav_cbt))} AAV thru ${c.ends} · PS ${(perfOf(c) || {}).score ?? '—'}</span></label><span class="val">${on ? fm(M(relief), { plus: true }) + '/yr' : '—'}</span><input type="range" min="0" max="90" step="5" value="${on ? r : 0}" data-action="dumpPct" data-id="${c.id}" ${on ? '' : 'disabled'} aria-label="Cash retained"><span class="hint">${on ? r + '% retained · relief through ' + c.ends : 'Not traded'}</span></div>`; }).join('') || '<div class="empty small">No multi-year contracts listed</div>')}`;
};
Views.montecarlo = () => {
  const s = S(); const mc = s.ui.mc;
  const body = mc ? (() => { const h = mc.hist; const max = Math.max(...h.h); const w = 720, hh = 220; const bw = w / h.h.length;
    let g = `<svg class="chart" viewBox="0 0 ${w} ${hh + 30}" role="img" aria-label="2027 payroll distribution">`; h.h.forEach((v, i) => { const x0 = h.lo + h.w * i; const bh = v / max * hh; g += `<rect class="bar" x="${i * bw + 1}" y="${hh - bh}" width="${bw - 2}" height="${bh}" fill="${x0 + h.w / 2 > mc.th[0] ? Charts.C.neg : Charts.C.accent}" data-tip="${esc(fm(M(x0)) + '–' + fm(M(x0 + h.w)) + ': ' + v + ' runs')}"/>`; }); g += `<text class="label" x="0" y="${hh + 20}">${fm(M(h.lo))}</text><text class="label" x="${w}" y="${hh + 20}" text-anchor="end">${fm(M(h.lo + h.w * h.h.length))}</text></svg>`;
    return `<div class="grid kpis" style="margin-bottom:14px">${stat('P10', fm(M(mc.p10)))}${stat('Median', fm(M(mc.p50)))}${stat('P90', fm(M(mc.p90)))}${mc.th.slice(0, 2).map((t, i) => stat(`P(over tier ${i + 1})`, (mc.over[i] * 100).toFixed(1) + '%', mc.over[i] > 0.5 ? 'neg' : mc.over[i] > 0.2 ? 'warn' : 'pos', fm(M(t), { digits: 0 }) + ' assumed')).join('')}</div>${card('Distribution of 2027 CBT payroll', `${mc.n.toLocaleString()} runs · ${esc(mc.scen)} scenario · red = above tier-1 threshold`, g)}`; })() : '<div class="empty"><b>No simulation yet</b>Run the simulation to see the distribution.</div>';
  return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>Simulation</h2><button class="btn primary" data-action="runMC">Run 5,000 simulations</button></div><p class="small muted" style="margin:0">Draws: arbitration ±12% (σ) around the plan, benefits ±5%, in-season additions ±80%, club options exercised with 85% probability if the plan exercises them (15% if declined), opt-outs 80%/20%. Thresholds held at assumed 2027 levels. All draws are estimates layered on the verified contract base.</p></div>${body}`;
};

Views.scenarios = () => {
  const s = S(); const tab = s.ui.scenTab; let body;
  if (tab === 'saved') body = saved.length ? saved.map((x) => `<div class="scenario-card"><div><div class="nm">${esc(x.name)}</div><div class="dt">${esc(fmtET(x.at))} · ${SCEN[x.state.scenario] ? SCEN[x.state.scenario].label : ''}</div></div><div class="acts"><button class="btn sm" data-action="loadScenario" data-id="${x.id}">Load</button><button class="btn sm" data-action="exportSaved" data-id="${x.id}">Export</button><button class="btn sm danger" data-action="deleteScenario" data-id="${x.id}">Delete</button></div></div>`).join('') : '<div class="empty"><b>No saved scenarios</b>Use Save in the header to store this plan.</div>';
  else if (tab === 'compare') { const cols = [{ name: 'Current plan', st: s }].concat(saved.map((x) => ({ name: x.name, st: migrate(x.state) }))); body = cols.length > 1 ? `<div class="table-wrap"><table><thead><tr><th>Metric</th>${cols.map((c) => `<th class="num">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${[['Scenario', (c) => SCEN[c.st.scenario].label], ['2027 CBT payroll', (c) => fm(M(Fz.payroll(c.st)[2027].total))], ['2027 room', (c) => fm(M(Fz.payroll(c.st)[2027].room), { plus: true })], ['Trades', (c) => c.st.trades.length], ['FA signings', (c) => Object.values(c.st.signings).filter((x) => x.on).length], ['Releases', (c) => Object.values(c.st.releases).filter(Boolean).length]].map(([k, f]) => `<tr><td>${k}</td>${cols.map((c) => `<td class="num">${f(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Nothing to compare yet</b>Save at least one scenario.</div>'; }
  else if (tab === 'assumptions') { const cu = s.custom; const dis = s.scenario === 'custom' ? '' : 'disabled';
    const rng = (id, l, min, max, step, v, fv, hint) => `<div class="control"><label>${l}</label><span class="val">${fv}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-action="custom" data-id="${id}" ${dis}><span class="hint">${hint}</span></div>`;
    body = `<p class="section-sub">Applies when <b>Custom</b> is selected. ${s.scenario === 'custom' ? '' : '<button class="btn sm" data-action="scenario" data-id="custom">Switch to Custom</button>'}</p><div class="grid two"><div>
      ${rng('arbScale', 'Arbitration vs MLBTR projections', 0.8, 1.3, 0.05, cu.arbScale, Math.round(cu.arbScale * 100) + '%', '100% = published projections')}
      ${rng('thrGrowth', '2027+ CBT threshold growth / yr', -0.02, 0.08, 0.005, cu.thrGrowth, (cu.thrGrowth * 100).toFixed(1) + '%', 'Unknown until a new CBA')}
      ${rng('benefits', 'Player benefits on CBT ($M)', 10, 25, 0.5, cu.benefits, fm(+cu.benefits), 'Estimate')}
      ${rng('prearb', 'Pre-arb salary each ($M)', 0.74, 1.2, 0.01, cu.prearb, fm(+cu.prearb, { digits: 2 }), '2026 minimum was $780K')}
      ${rng('inSeason', 'In-season additions reserve ($M)', 0, 30, 1, cu.inSeason, fm(+cu.inSeason), 'Deadline adds, call-ups')}</div><div>
      <div class="control"><label>Spending ceiling</label><select data-action="customSel" data-id="ceilingIdx" ${dis}>${[0, 1, 2, 3].map((i) => `<option value="${i}" ${+cu.ceilingIdx === i ? 'selected' : ''}>CBT tier ${i + 1}</option>`).join('')}</select></div>
      ${rng('ceilingBuffer', 'Buffer below ceiling ($M)', 0, 30, 1, cu.ceilingBuffer, fm(+cu.ceilingBuffer), 'Room kept for flexibility')}
      <div class="control"><label>Club option policy</label><select data-action="customSel" data-id="optPolicy" ${dis}>${[['perf', 'Exercise if PS ≥ 50'], ['strong', 'Exercise if PS ≥ 60'], ['all', 'Exercise all']].map(([k, l]) => `<option value="${k}" ${cu.optPolicy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>`; }
  else if (tab === 'risk') { const risks = [['CBA expires Dec 1, 2026 — a lockout would freeze MLB transactions', 'High', 'Offseason calendar slips; 2027 thresholds and tax rates unknown', 'Make option/tender decisions before Dec 1; keep plans threshold-agnostic'], ['Arbitration awards above projections', 'Medium', `~${fm(M(Fz.payroll(s)[2027].lines.arb * 0.15))} if 15% over plan`, 'Settle early; file-and-trial only on clear cases'], ['Contracts missing from free data', 'Medium', 'Projected payroll understated', 'Add verified deals under Contracts']].concat(L.injuries.filter((i) => /60/.test(i.status || '')).map((i) => [`${i.name} (${i.type || 'injury'}) recovery`, 'Medium', 'Starter availability for 2027', 'Depth, waiver claims, Pipeline call-ups'])).concat(L.contracts.filter((c) => c.opt && c.opt.kind === 'optout').map((c) => [`${c.name} opt-out`, 'Medium', `${fm(M(c.aav_cbt || 0))} AAV leaves or stays`, 'Plan both branches']));
    body = `<div class="table-wrap"><table><thead><tr><th>Risk</th><th>Likelihood (judgement)</th><th>Impact</th><th>Mitigation</th></tr></thead><tbody>${risks.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td><span class="tag ${r[1] === 'High' ? 'crit' : 'med'}">${r[1]}</span></td><td class="small">${esc(r[2])}</td><td class="small muted">${esc(r[3])}</td></tr>`).join('')}</tbody></table></div>`; }
  else body = `<p class="section-sub">Notes travel with saved scenarios and exports.</p><textarea data-action="notes" style="width:100%;min-height:200px" placeholder="e.g. Decline mutual option; tender all arb-eligible starters; target LHP reliever.">${esc(s.notes)}</textarea><div class="row between" style="margin-top:8px"><span class="small muted">${s.notes.length}/5000</span><button class="btn sm" data-action="exportMemo">Export memo (Markdown)</button></div>`;
  return `<div class="card">${tabs('scenTab', tab, [['saved', `Saved (${saved.length})`], ['compare', 'Compare'], ['assumptions', 'Assumptions'], ['risk', 'Risk register'], ['notes', 'Notes']])}${body}</div>`;
};

Views.heritage = () => {
  const s = S(); const tab = s.ui.heritageTab; const F = RAW.franchise_manual || {}; const G = T.gallery || {};
  const fig = (k, h) => { const c = (RAW.credits || []).find((x) => x.key === k); if (!c) return ''; return `<figure class="card tight" style="margin:0"><img src="${esc(c.file)}" alt="${esc(c.caption)}" loading="lazy" style="width:100%;height:${h}px;object-fit:${/^uni_/.test(k) ? 'contain' : 'cover'};border-radius:6px;background:var(--bg-2)"><figcaption class="small" style="margin-top:6px">${esc(c.caption)}<div class="muted" style="font-size:10.5px">${esc(c.author)} · <a href="${esc(c.license_url || c.source)}" target="_blank" rel="noopener">${esc(c.license)}</a> · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></div></figcaption></figure>`; };
  const tl = (arr) => `<div class="wire">${(arr || []).map(([y, t]) => `<div class="wire-row"><span class="tag">${esc(y)}</span><span>${esc(t)}</span><span></span></div>`).join('')}</div>`;
  let body;
  if (tab === 'history') { const h = F.history || {}; body = `<div class="grid kpis" style="margin-bottom:14px">${stat('World Series titles', (h.championships || []).length, '', esc((h.championships || []).join(', ')))}${stat('Retired numbers', (h.retired || []).length)}</div><div class="grid two">${card('Timeline', '', tl(h.timeline))}<div class="stack">${card('Retired numbers', '', `<div class="cards">${(h.retired || []).map(([n, nm, pos, dt]) => `<div class="pcard"><div class="big-number">${esc(n)}</div><div class="name">${esc(nm)}</div><div class="meta">${esc(pos)} · ${esc(dt)}</div></div>`).join('')}</div>`)}${card('Rivalries', '', `<p class="small" style="margin:0">${esc(typeof h.rivalry === 'string' ? h.rivalry : (h.rivalry || []).map((r) => Array.isArray(r) ? r.join(': ') : r).join(' · '))}</p>`)}</div></div><p class="small muted">Source: <a href="${esc(h.source)}" target="_blank" rel="noopener">${esc(h.source_name || 'Wikipedia')}</a>. ${esc(F._label || '')}</p>`; }
  else if (tab === 'uniforms') { const u = F.uniforms || {}; body = `<div class="grid two">${(G.uniTop || []).map((k) => fig(k, 260)).join('')}</div><div class="cards" style="margin:14px 0">${(G.uniHist || []).map((k) => fig(k, 220)).join('')}</div><p class="small muted">${esc(G.uniNote || '')}</p>${card('Evolution', '', tl(u.timeline))}<p class="small muted">Source: <a href="${esc(u.source)}" target="_blank" rel="noopener">${esc(u.source_name || 'Wikipedia')}</a></p>`; }
  else { const k = F.park || {}; body = `<div class="grid two">${(G.parkTop || []).map((x) => fig(x, 280)).join('')}</div><div class="grid two" style="margin-top:14px">${card('Field dimensions', esc(k.dims_note || ''), `<table>${Object.entries(k.dims || {}).map(([a, b]) => `<tr><td>${esc(a)}</td><td class="num"><b>${esc(b)}</b></td></tr>`).join('')}</table>`)}${card(`${esc(T.park)} facts`, '', `<table>${(k.facts || []).map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td style="white-space:normal" class="small">${esc(b)}</td></tr>`).join('')}</table>`)}</div><div class="cards" style="margin-top:14px">${(G.parkLand || []).concat(G.parkThen || []).map((x) => fig(x, 200)).join('')}</div><p class="small muted">Sources: ${(k.sources || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(decodeURIComponent(u.split('/').pop()).replace(/_/g, ' '))}</a>`).join(' · ')}. Photos: Wikimedia Commons under the licenses shown, stored locally.</p>`; }
  return `<div class="card">${tabs('heritageTab', tab, [['history', 'History'], ['uniforms', 'Uniforms'], ['park', esc(T.park)]])}${body}</div>`;
};

Views.data = () => {
  const meta = RAW.meta || {}; const tp = L.payroll;
  const src = [[`MLB Stats API — roster, stats, standings, schedule, transactions, draft, affiliates (${T.affiliates.map((a) => a[3]).join(', ')})`, 'https://statsapi.mlb.com/api/v1/', 'V'], ['MLB Trade Rumors payroll tracker (2026 CBT/LRD payroll, top contracts)', tp.source_url, 'V'], ['MLB Trade Rumors 2026-27 free-agent list (options, opt-outs)', (RAW.free_agents || {}).url, 'V'], ['MLBTR / Matt Swartz 2027 arbitration projections', (RAW.arbitration || {}).url, 'E'], [`MLB Trade Rumors ${T.short} RSS (rumors)`, `https://www.mlbtraderumors.com/${T.mlbtr}/feed`, 'V'], [`MLB.com ${T.short} news RSS · ESPN news & injuries`, `https://www.mlb.com/${T.mlbcom}/news`, 'V'], ['MLB Pipeline Top 30 / Top 100', (RAW.prospects || {}).team30_url, 'V'], ['International signings (MLB Stats API transactions)', (RAW.international || {}).url, 'V'], ['Baseball America 2026 international bonus pools', 'https://www.baseballamerica.com/stories/2026-international-signing-bonus-pools-for-each-mlb-team/', 'V'], ['CBT thresholds & rates', ((L.cbt.sources || [])[0] || {}).url, 'V'], ['Wikipedia (history, uniforms, ballpark) & Wikimedia Commons images', 'https://commons.wikimedia.org/', 'V']];
  return `<div class="grid sidebar-right"><div class="stack">
    ${card('Refresh status', `Last run ${esc(fmtET(meta.lastRun))} (${esc(meta.mode || '')}) · last full ${esc(fmtET(meta.lastFull))}`, `<div class="table-wrap"><table class="tight"><tbody>${Object.entries(meta.status || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="${/FAIL/.test(v) ? 'neg' : ''}">${esc(v)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">GitHub Actions refresh twice daily (full morning run; news, rumors, injuries and transactions in the evening). Each source is independent — a failed source keeps its previous file.</p>`)}
    ${card('Sources', '', `<ul style="margin:0;padding-left:18px;line-height:1.9;font-size:var(--t-sm)">${src.map(([l, u, p]) => `<li>${U.prov(p)} ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)}</li>`).join('')}</ul>`)}
  </div><div class="stack">
    ${card('Provenance legend', '', `<div class="stack" style="gap:8px;font-size:var(--t-sm)"><div>${U.prov('V')} <b>Verified</b> — directly from the cited source.</div><div>${U.prov('D')} <b>Derived</b> — computed from verified terms (e.g. an option salary landing in 2027).</div><div>${U.prov('E')} <b>Estimate</b> — projection or your assumption (arbitration, pre-arb fill, benefits, value points).</div></div>`)}
    ${card('Known gaps', '', `<ul class="small" style="margin:0;padding-left:18px;color:var(--text-2);line-height:1.7"><li>The free MLBTR tracker shows only the top contracts; smaller multi-year deals are missing — add them under Contracts.</li><li>2027 CBT thresholds/rates are unknown until a new CBA.</li><li>Individual international bonuses are not in a free source for this club.</li><li>Other clubs' salaries are only known when they appear in MLBTR's arbitration projections; enter others in the Trade Machine.</li><li>Defense, framing and baserunning are not scored (no free per-player feed in this pipeline).</li></ul>`)}
    ${card('Export data', '', `<div class="row"><button class="btn sm" data-action="exportCsv" data-id="contracts">Contracts CSV</button><button class="btn sm" data-action="exportCsv" data-id="payroll">2027 build CSV</button><button class="btn sm" data-action="exportCsv" data-id="needs">Needs CSV</button></div>`)}
  </div></div>`;
};

/* ---------------- App controller ---------------- */
function mountShell() {
  document.getElementById('app').innerHTML = `
    <aside class="sidebar" id="sidebar" aria-label="Modules">
      <div class="brand">${LOGO}<div><div class="brand-name">${esc(T.hubTitle)}</div><div class="brand-sub">Franchise Mode · Live</div></div></div>
      <nav class="nav" id="nav"></nav>
      <div class="sidebar-foot">Data <b>${esc(fmtET((RAW.meta || {}).lastRun))}</b><br>MLB Stats API · MLBTR · MLB Pipeline · ESPN<br>Payroll per MLBTR (${esc(L.payroll.as_of || '')}); 2027 = projection.<br>${SL_MARK}<br><span class="muted">v1.0 · <a href="#" data-action="shortcuts">Shortcuts</a></span></div>
    </aside>
    <div class="scrim" data-action="closeSidebar"></div>
    <header class="header">
      <button class="btn ghost menu-btn" data-action="toggleSidebar" aria-label="Open navigation"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button>
      <div><h1 id="pageTitle"></h1><div class="crumb" id="crumb"></div></div>
      <div class="header-actions">
        <div class="seg" id="scenarioSeg" role="group" aria-label="Payroll scenario"></div><select class="scenario-select" id="scenarioSelect" data-action="scenarioSelect" aria-label="Payroll scenario"></select>
        <span class="save-state" id="saveState"></span>
        <button class="btn sm hide-m" data-action="exportJson" title="Export scenario (⌘E)">Export</button>
        <button class="btn sm hide-m" data-action="importJson" title="Import scenario JSON">Import</button>
        <button class="btn sm primary" data-action="saveScenario" title="Save scenario (⌘S)">Save</button>
      </div>
    </header>
    <main class="main" id="main" tabindex="-1"></main>
    <div class="toasts" id="toasts" aria-live="polite"></div>
    <div class="chart-tip" id="chartTip"></div>
    <div class="modal-bg" id="modal" role="dialog" aria-modal="true"><div class="modal" id="modalBox"></div></div>
    <input type="file" id="fileInput" accept="application/json,.json" class="hidden" aria-hidden="true">`;
  ['main', 'saveState', 'nav', 'pageTitle', 'crumb', 'scenarioSeg'].forEach((k) => { els[k] = document.getElementById(k); });
}
function renderNav() {
  const pay = Fz.payroll(state); const room = pay[2027].room;
  const groups = [...new Set(MODULES.map((m) => m.group))];
  els.nav.innerHTML = groups.map((g) => `<div class="nav-label">${g}</div>` + MODULES.filter((m) => m.group === g).map((m) => {
    let badge = '';
    if (m.id === 'calculator') badge = `<span class="badge ${room < 0 ? 'bad' : room > 15e6 ? 'ok' : ''}">${fm(M(room), { digits: 0 })}</span>`;
    if (m.id === 'trademachine' && state.trades.length) badge = `<span class="badge">${state.trades.length}</span>`;
    if (m.id === 'cuts') { const n = Object.values(state.releases).filter(Boolean).length; if (n) badge = `<span class="badge">${n}</span>`; }
    if (m.id === 'depth') { const n = Fz.needs(state).filter((x) => x.urgency === 'Critical').length; if (n) badge = `<span class="badge bad">${n}</span>`; }
    if (m.id === 'scenarios' && saved.length) badge = `<span class="badge">${saved.length}</span>`;
    return `<button class="nav-btn" data-action="module" data-id="${m.id}" ${state.ui.module === m.id ? 'aria-current="page"' : ''}>${ICONS[m.id] || ICONS.hub}<span>${m.label}</span>${badge}</button>`;
  }).join('')).join('');
  els.scenarioSeg.innerHTML = Object.keys(SCEN).map((k) => `<button data-action="scenario" data-id="${k}" aria-pressed="${state.scenario === k}" title="${esc(SCEN[k].desc)}">${SCEN[k].label}</button>`).join('');
  const sel = document.getElementById('scenarioSelect'); if (sel) sel.innerHTML = Object.keys(SCEN).map((k) => `<option value="${k}" ${state.scenario === k ? 'selected' : ''}>${SCEN[k].label}</option>`).join('');
}
function render() {
  const m = MODULES.find((x) => x.id === state.ui.module) || MODULES[0];
  els.pageTitle.textContent = m.title;
  const pay = Fz.payroll(state);
  els.crumb.textContent = `${P(state).label} scenario · 2027 room ${fm(M(pay[2027].room), { plus: true })} · ${Fz.alerts(state, pay).filter((a) => a.level === 'critical').length} critical alerts`;
  renderNav();
  try { els.main.innerHTML = Views[m.id](); } catch (e) { console.error(e); els.main.innerHTML = `<div class="card"><h2>Something went wrong rendering this module</h2><p class="muted">${esc(e.message)}</p><button class="btn" data-action="module" data-id="hub">Back to hub</button> <button class="btn danger" data-action="resetAll">Reset plan</button></div>`; }
  Charts.bindTips(els.main); renderSaveState();
  document.title = `${m.title} · ${T.hubTitle}`;
}
function renderSaveState() { els.saveState.className = 'save-state ' + (saveStatus === 'dirty' ? 'dirty' : ''); els.saveState.innerHTML = `<span class="dot"></span><span class="txt">${saveStatus === 'dirty' ? 'Saving…' : 'Autosaved'}</span>`; }
const persist = U.debounce(() => { Store.set(Store.KEY, state); saveStatus = 'saved'; renderSaveState(); }, 400);
function markDirty() { saveStatus = 'dirty'; renderSaveState(); persist(); }
function toast(msg, kind = '', ms = 3200) { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
function set(fn, { rerender = true } = {}) { fn(state); markDirty(); if (rerender) { const y = els.main.scrollTop; render(); els.main.scrollTop = y; } }
function modal(html) { document.getElementById('modalBox').innerHTML = html; document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }
function promptModal(title, text, def, ok, onOk) { modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><input id="pmIn" style="width:100%" value="${esc(def)}"><div class="actions"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" id="pmOk">${esc(ok)}</button></div>`); const i = document.getElementById('pmIn'); i.focus(); i.select(); document.getElementById('pmOk').onclick = () => { const v = i.value.trim(); if (!v) return; closeModal(); onOk(v); }; }
function playerModal(name) {
  const p = Fz.roster(state).find((x) => x.name === name) || (RAW.roster || []).find((x) => x.name === name) || { name }; const pf = perfOf(p); const c = Fz.contractOf(name); const a = L.arbByName[norm(name)]; const inj = L.injuries.find((i) => norm(i.name) === norm(name));
  const st = p.hit || p.pit; const news = [].concat(((RAW.news || {}).items) || [], ((RAW.rumors || {}).items) || []).filter((n) => (n.players || []).includes(name)).slice(0, 4);
  modal(`<div class="row between"><h3 style="margin:0">${esc(name)}</h3>${scoreBadge({ ...p, perf: pf })}</div><div class="small muted" style="margin:4px 0 12px">${esc(p.pos || '')} · age ${p.age ?? '?'}${p.bats ? ` · B/T ${p.bats}/${p.throws}` : ''}${p.country ? ' · ' + esc(p.country) : ''} · control thru ${Fz.controlThru(p)}</div>
    ${pf ? `<p class="small"><b>2026:</b> ${esc(pf.line)} · Performance Score ${pf.score} (#${pf.rank} of ${pf.of} ${pf.grp})</p>` : '<p class="small muted">No qualifying 2026 MLB sample.</p>'}
    ${c ? `<p class="small"><b>Contract:</b> ${c.years ? c.years + 'y / ' + fm(M(c.total || 0)) : ''} ${c.aav_cbt ? '· CBT AAV ' + fm(M(c.aav_cbt)) : ''} ${c.ends ? '· thru ' + c.ends : ''} ${c.options ? '· ' + esc(c.options) : ''} ${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</p>` : ''}
    ${a ? `<p class="small"><b>Arbitration:</b> service ${a.service} · 2027 projection ${fm(M(a.proj))} (MLBTR) ${a.note ? '· ' + esc(a.note) : ''}</p>` : ''}
    ${inj ? `<p class="small"><b class="neg">${esc(inj.status)}</b> — ${esc(inj.detail || '')}</p>` : ''}
    ${news.length ? `<div class="depth-label">In the news</div>${news.map((n) => `<div class="small" style="padding:3px 0"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted">${esc(n.source)}</span></div>`).join('')}` : ''}
    <div class="actions"><button class="btn" data-action="closeModal">Close</button></div>`);
}
function exportJson(name, st = state) { U.download(`${T.repo}-${(name || 'plan').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`, JSON.stringify({ app: T.repo, schema: SCHEMA, name: name || 'Current plan', exported: new Date().toISOString(), state: { ...st, ui: undefined } }, null, 2)); toast('Scenario exported', 'ok'); }
function importText(text) { try { const o = JSON.parse(text); if (!o || o.app !== T.repo || !o.state) throw new Error(`Not a ${T.hubTitle} export`); const ui = state.ui; state = migrate({ ...o.state, ui }); markDirty(); render(); toast(`Imported “${o.name}”`, 'ok'); } catch (e) { toast('Import failed: ' + e.message, 'error', 5000); } }
function exportCsv(which) {
  let rows;
  if (which === 'contracts') rows = [['Player', 'Type', 'Years', 'Total', 'CBT AAV', 'Ends', 'Options', 'Source']].concat(L.contracts.map((c) => [c.name, c.type, c.years, c.total, c.aav_cbt, c.ends, c.options, c.source_url]));
  else if (which === 'payroll') { const p = Fz.payroll(state)[2027]; rows = [['Line', '2027 $']].concat(Object.entries(p.lines).map(([k, v]) => [k, Math.round(v)])).concat([['total', Math.round(p.total)], ['ceiling', Math.round(Fz.ceiling(state))]]); }
  else rows = [['Group', 'Score', 'Urgency', 'Why']].concat(Fz.needs(state).map((n) => [n.group.id, n.score, n.urgency, n.why.join('; ')]));
  U.download(`${T.repo}-${which}.csv`, U.csv(rows), 'text/csv'); toast('CSV exported', 'ok');
}
function exportMemo() { const p = Fz.payroll(state)[2027]; const md = `# ${T.hubTitle} — plan memo\n\nScenario: ${P(state).label}\n\n- 2027 projected CBT payroll: ${fm(M(p.total))}\n- Ceiling: ${fm(M(Fz.ceiling(state)))} → room ${fm(M(p.room), { plus: true })}\n- Trades: ${state.trades.map((t) => `${t.give.map((a) => a.name).join(', ')} → ${t.partnerAbbr} for ${t.get.map((a) => a.name).join(', ')}`).join('; ') || 'none'}\n- Top needs: ${Fz.needs(state).slice(0, 4).map((n) => `${n.group.id} (${n.score})`).join(', ')}\n\n## Notes\n\n${state.notes || '_none_'}\n`; U.download(`${T.repo}-memo.md`, md, 'text/markdown'); }

function onClick(e) {
  const el = e.target.closest('[data-action]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
  const a = el.dataset.action, id = el.dataset.id;
  switch (a) {
    case 'module': e.preventDefault(); state.ui.module = id; document.body.classList.remove('sidebar-open'); markDirty(); render(); els.main.scrollTop = 0; break;
    case 'scenario': set((s) => { s.scenario = id; }); break;
    case 'depthSide': set((s) => { s.ui.depthSide = id; }); break;
    case 'faTab': case 'draftTab': case 'scenTab': case 'leagueTab': case 'heritageTab': set((s) => { s.ui[a] = id; }); break;
    case 'toggleSidebar': document.body.classList.toggle('sidebar-open'); break;
    case 'closeSidebar': document.body.classList.remove('sidebar-open'); break;
    case 'player': playerModal(id); break;
    case 'closeModal': closeModal(); break;
    case 'tmAdd': { const side = el.dataset.side; const pool = side === 'give' ? Fz.myAssets(state) : Fz.partnerAssets(state.ui.tm.partner); const as = pool.find((x) => x.id === id); if (as) set((s) => { s.ui.tm[side].push(as); }); break; }
    case 'tmRemove': set((s) => { s.ui.tm[el.dataset.side] = s.ui.tm[el.dataset.side].filter((x) => x.id !== id); }); break;
    case 'tmClear': set((s) => { s.ui.tm.give = []; s.ui.tm.get = []; }); break;
    case 'tmExecute': { const tm = state.ui.tm; const get = tm.get.map((x) => ({ ...x, salary: tm.salaries[x.id] != null && tm.salaries[x.id] !== '' ? tm.salaries[x.id] * 1e6 : (x.sal ? x.sal.v : null), thru: Fz.controlThru(x) })); const ev = Fz.evaluateTrade(state, tm.partner, tm.give, get); if (ev.verdict === 'Reject' || ev.verdict === 'Incomplete') return toast('Trade not acceptable', 'error'); set((s) => { s.trades.push({ partnerAbbr: tm.partner, give: tm.give, get, giveValue: ev.giveValue, getValue: ev.getValue, verdict: ev.verdict }); s.ui.tm.give = []; s.ui.tm.get = []; }); toast(`Trade executed with ${tm.partner}`, 'ok'); break; }
    case 'tradeUndo': set((s) => { s.trades.splice(+id, 1); }); toast('Trade undone'); break;
    case 'sort': set((s) => { s.ui.sort = { key: id, dir: s.ui.sort.key === id ? -s.ui.sort.dir : (id === 'name' || id === 'pos' ? 1 : -1) }; }); break;
    case 'extraAdd': { const n = document.getElementById('xName').value.trim(), v = +document.getElementById('xAav').value, f = +document.getElementById('xFrom').value, t = +document.getElementById('xTo').value, src = document.getElementById('xSrc').value.trim(); if (!n || !v || !f || t < f) return toast('Enter player, AAV and a valid year range', 'error'); set((s) => { s.extra.push({ name: n, aav: v, from: f, to: t, src }); }); break; }
    case 'extraDel': set((s) => { s.extra.splice(+id, 1); }); break;
    case 'runMC': { const r = monteCarlo(state); set((s) => { s.ui.mc = { ...r, scen: P(s).label }; }); toast('Simulation complete', 'ok'); break; }
    case 'saveScenario': promptModal('Save scenario', 'Name this plan so you can compare or reload it.', `${P(state).label} plan ${saved.length + 1}`, 'Save', (name) => { saved.push({ id: U.uid(), name, at: new Date().toISOString(), state: JSON.parse(JSON.stringify({ ...state, ui: undefined })) }); Store.set(Store.SAVED, saved); render(); toast(`Saved “${name}”`, 'ok'); }); break;
    case 'loadScenario': { const x = saved.find((y) => y.id === id); if (x) { const ui = state.ui; state = migrate({ ...x.state, ui }); markDirty(); render(); toast(`Loaded “${x.name}”`, 'ok'); } break; }
    case 'deleteScenario': saved = saved.filter((x) => x.id !== id); Store.set(Store.SAVED, saved); render(); toast('Scenario deleted'); break;
    case 'exportSaved': { const x = saved.find((y) => y.id === id); if (x) exportJson(x.name, x.state); break; }
    case 'exportJson': exportJson('Current plan'); break;
    case 'importJson': document.getElementById('fileInput').click(); break;
    case 'exportCsv': exportCsv(id); break;
    case 'exportMemo': exportMemo(); break;
    case 'resetAll': state = defaultState(); Store.remove(Store.KEY); render(); toast('Plan reset'); break;
    case 'shortcuts': e.preventDefault(); modal(`<h3>Keyboard shortcuts</h3><div class="shortcuts"><kbd>⌘/Ctrl S</kbd><span>Save scenario</span><kbd>⌘/Ctrl E</kbd><span>Export JSON</span><kbd>1–9</kbd><span>Jump to module</span><kbd>Esc</kbd><span>Close dialog</span></div><div class="actions"><button class="btn" data-action="closeModal">Close</button></div>`); break;
  }
}
function onChange(e) {
  const el = e.target; const a = el.dataset.action, id = el.dataset.id; if (!a) return;
  const num = (v) => (v === '' ? null : +v);
  switch (a) {
    case 'scenarioSelect': set((s) => { s.scenario = el.value; }); break;
    case 'tmPartner': set((s) => { s.ui.tm.partner = el.value; s.ui.tm.get = []; }); break;
    case 'tmSalary': set((s) => { s.ui.tm.salaries[id] = num(el.value); }); break;
    case 'faFilter': set((s) => { s.ui.faFilter = el.value; }); break;
    case 'optDecision': set((s) => { s.options[id] = el.value; }); break;
    case 'tender': set((s) => { s.tenders[id] = el.checked; }); break;
    case 'release': set((s) => { s.releases[id] = el.checked; const a2 = L.arbMine.find((x) => (RAW.roster || []).some((r) => String(r.id) === String(id) && norm(r.name) === norm(x.name))); if (a2) s.tenders[a2.id] = !el.checked; }); break;
    case 'resignOn': case 'signOn': { const k = a === 'resignOn' ? 'resigns' : 'signings'; set((s) => { s[k][id] = { ...(s[k][id] || { years: 1 }), on: el.checked }; }); if (el.checked && !(state[k][id] || {}).aav) toast('Enter an AAV — it counts toward 2027 payroll', 'warn'); break; }
    case 'resignAav': case 'signAav': { const k = a === 'resignAav' ? 'resigns' : 'signings'; set((s) => { s[k][id] = { ...(s[k][id] || { years: 1 }), aav: num(el.value) }; }); break; }
    case 'resignYears': case 'signYears': { const k = a === 'resignYears' ? 'resigns' : 'signings'; set((s) => { s[k][id] = { ...(s[k][id] || {}), years: clamp(+el.value || 1, 1, 10) }; }); break; }
    case 'dumpOn': set((s) => { if (el.checked) s.dumps[id] = 0; else delete s.dumps[id]; }); break;
    case 'dumpPct': set((s) => { s.dumps[id] = +el.value; }); break;
    case 'custom': set((s) => { s.custom[id] = +el.value; }); break;
    case 'customSel': set((s) => { s.custom[id] = id === 'ceilingIdx' ? +el.value : el.value; }); break;
    case 'notes': set((s) => { s.notes = el.value.slice(0, 5000); }, { rerender: false }); break;
  }
}
function onKey(e) {
  if (e.key === 'Escape') { closeModal(); document.body.classList.remove('sidebar-open'); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); document.querySelector('[data-action="saveScenario"]').click(); return; }
  if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); exportJson('Current plan'); return; }
  if (!mod && /^[1-9]$/.test(e.key) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const m = MODULES[+e.key - 1]; if (m) { state.ui.module = m.id; render(); } }
}
async function init() {
  await loadData(); buildLeague();
  state = migrate(Store.get(Store.KEY)); saved = Store.get(Store.SAVED) || [];
  mountShell(); render();
  document.addEventListener('click', onClick); document.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importText(r.result); r.readAsText(f); e.target.value = ''; });
  document.getElementById('app').removeAttribute('aria-busy');
  window.LAB = { state: () => state, Fz, L, RAW };
}
init();
