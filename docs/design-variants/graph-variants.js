/* Three visual treatments of the story graph on one shared demo structure, so only the look
   and the ergonomics differ. Workbench behaviour follows n8n: pan the canvas, zoom, drag
   nodes, pull a link out of a node's port, click a node to inspect it. */
(function () {
  const EPISODES = [
    { id: "s1e1", season: 1, n: 1, title: "Бал" },
    { id: "s1e2", season: 1, n: 2, title: "Сад" },
    { id: "s1e3", season: 1, n: 3, title: "Маскарад" },
    { id: "s2e1", season: 2, n: 1, title: "Возвращение" },
    { id: "s2e2", season: 2, n: 2, title: "Суд" },
  ];
  // kind: start | scene | choice | option | gate | end.  key = shown in season/story views.
  const N = (id, ep, kind, label, x, y, extra = {}) => ({ id, ep, kind, label, x, y, key: ["option", "gate", "end"].includes(kind) && !extra.minor, ...extra });
  const NODES = [
    N("a0", "s1e1", "start", "Начало", 60, 200), N("a1", "s1e1", "scene", "Адриан подходит", 200, 200),
    N("a2", "s1e1", "choice", "Как ответить?", 340, 200),
    N("o1", "s1e1", "option", "Улыбнуться", 480, 110, { sets: "доверие +2" }), N("o2", "s1e1", "option", "Отшутиться", 480, 290, { sets: "смелость +1", minor: true }),
    N("a3", "s1e1", "scene", "Танец", 620, 110), N("a4", "s1e1", "scene", "Балкон", 620, 290),
    N("a5", "s1e1", "scene", "Письмо", 760, 200), N("a6", "s1e1", "choice", "Открыть письмо?", 900, 200),
    N("o3", "s1e1", "option", "Открыть", 1040, 120, { sets: "флаг «знает тайну»" }), N("o4", "s1e1", "option", "Сжечь", 1040, 280, { minor: true }),
    N("e1", "s1e1", "end", "Конец серии", 1180, 200, { minor: true }),

    N("b0", "s1e2", "start", "Начало", 60, 200),
    N("g1", "s1e2", "gate", "Доверие ≥ 2?", 200, 200, { cond: "доверие ≥ 2" }),
    N("b1", "s1e2", "scene", "Признание", 350, 110), N("b2", "s1e2", "scene", "Холодный приём", 350, 290),
    N("b3", "s1e2", "scene", "Ночной сад", 500, 200), N("b4", "s1e2", "choice", "Взять ключ?", 640, 200),
    N("o5", "s1e2", "option", "Взять ключ", 780, 120, { sets: "флаг «ключ»" }), N("o6", "s1e2", "option", "Оставить", 780, 280, { minor: true }),
    N("e2", "s1e2", "end", "Конец серии", 920, 200, { minor: true }),

    N("c0", "s1e3", "start", "Начало", 60, 200),
    N("g2", "s1e3", "gate", "Знает тайну?", 200, 200, { cond: "флаг «знает тайну»" }),
    N("c1", "s1e3", "scene", "Разоблачение", 350, 110), N("c2", "s1e3", "scene", "Обычный вечер", 350, 290),
    N("e3", "s1e3", "end", "Финал: правда", 500, 110), N("e4", "s1e3", "end", "Финал: маска", 500, 290),

    N("d0", "s2e1", "start", "Начало", 60, 200),
    N("g3", "s2e1", "gate", "Ключ взят?", 200, 200, { cond: "флаг «ключ»" }),
    N("d1", "s2e1", "scene", "Потайная дверь", 350, 110), N("d2", "s2e1", "scene", "Парадный вход", 350, 290),
    N("d3", "s2e1", "choice", "Кому довериться?", 500, 200),
    N("o7", "s2e1", "option", "Адриану", 640, 120, { sets: "доверие +2" }), N("o8", "s2e1", "option", "Никому", 640, 280, { minor: true }),
    N("e5", "s2e1", "end", "Конец серии", 780, 200, { minor: true }),

    N("f0", "s2e2", "start", "Начало", 60, 200),
    N("g4", "s2e2", "gate", "Доверие ≥ 4 и тайна?", 210, 200, { cond: "доверие ≥ 4 и флаг «знает тайну»" }),
    N("e6", "s2e2", "end", "Финал: вместе", 370, 110), N("e7", "s2e2", "end", "Финал: порознь", 370, 290),
  ];
  const FLOW = [
    ["a0", "a1"], ["a1", "a2"], ["a2", "o1"], ["a2", "o2"], ["o1", "a3"], ["o2", "a4"], ["a3", "a5"], ["a4", "a5"], ["a5", "a6"], ["a6", "o3"], ["a6", "o4"], ["o3", "e1"], ["o4", "e1"],
    ["b0", "g1"], ["g1", "b1", "да"], ["g1", "b2", "нет"], ["b1", "b3"], ["b2", "b3"], ["b3", "b4"], ["b4", "o5"], ["b4", "o6"], ["o5", "e2"], ["o6", "e2"],
    ["c0", "g2"], ["g2", "c1", "да"], ["g2", "c2", "нет"], ["c1", "e3"], ["c2", "e4"],
    ["d0", "g3"], ["g3", "d1", "да"], ["g3", "d2", "нет"], ["d1", "d3"], ["d2", "d3"], ["d3", "o7"], ["d3", "o8"], ["o7", "e5"], ["o8", "e5"],
    ["f0", "g4"], ["g4", "e6", "да"], ["g4", "e7", "нет"],
  ];
  // Deferred consequences: a decision changes a variable that a later event checks.
  const INFLUENCE = [
    ["o1", "g1", "доверие"], ["o3", "g2", "знает тайну"], ["o5", "g3", "ключ"],
    ["o3", "g4", "знает тайну"], ["o1", "g4", "доверие"], ["o7", "g4", "доверие"],
  ];
  const KIND = { start: "Начало", scene: "Сцена", choice: "Выбор", option: "Вариант выбора", gate: "Условие", end: "Финал", episode: "Серия" };

  const themes = [
    {
      name: "Схема", tagline: "Минимализм: ровные линии, сетка, ничего лишнего",
      pitch: "Рабочий инструмент. Плоские узлы, прямоугольные маршруты связей, точечная сетка. Ничто не отвлекает от структуры — удобно для больших глав.",
      bg: "#171310", grid: "dots", font: '"Golos Text", system-ui, sans-serif', labelSize: 11.5, labelWeight: 500,
      r: 15, path: "step", glow: false, label: "below",
      flow: "#b8a99a", flowW: 1.5, infl: "#c2938f", inflDash: "5 5", inflW: 1.5,
      fills: { start: "#2f2820", scene: "#3a3229", choice: "#171310", option: "#e9d9b8", gate: "#c2938f", end: "#6e2a35", episode: "#241f1a" },
      strokes: { start: "#8a7550", scene: "#6b5d4a", choice: "#d4af6a", option: "#e9d9b8", gate: "#c2938f", end: "#b8566a", episode: "#d4af6a" },
      glyph: null, text: "#f3ece0", dim: 0.16,
    },
    {
      name: "Аркана", tagline: "Магия: золотые нити, свечение, звёздная пыль",
      pitch: "Сюжет как карта созвездий. Золотые нити светятся, узлы — небесные знаки, отложенные последствия тянутся пунктирными дугами цвета шампанского. Красиво показывать, приятно работать.",
      bg: "#15110e", grid: "stars", font: '"Cormorant Garamond", Georgia, serif', labelSize: 15, labelWeight: 600,
      r: 18, path: "curve", glow: true, label: "below",
      flow: "#d4af6a", flowW: 1.6, infl: "#e9d9b8", inflDash: "2 7", inflW: 2,
      fills: { start: "#1f1913", scene: "#1f1913", choice: "#2a2015", option: "#2a2015", gate: "#2a1a1d", end: "#3a1820", episode: "#1f1913" },
      strokes: { start: "#8a7550", scene: "#8a7550", choice: "#d4af6a", option: "#e9d9b8", gate: "#c2938f", end: "#d4af6a", episode: "#d4af6a" },
      glyph: { start: "·", scene: "·", choice: "✦", option: "◆", gate: "☾", end: "★", episode: "✧" }, text: "#f3ece0", dim: 0.14,
    },
    {
      name: "Кинозал", tagline: "Кино: крупные узлы, плавные дуги, глубина",
      pitch: "Современно и премиально. Крупные узлы с градиентом, подписи на плашках, толстые плавные дуги, по отложенным связям бежит свет. При выборе узла всё остальное уходит в тень.",
      bg: "#0d0b09", grid: "vignette", font: '"Golos Text", system-ui, sans-serif', labelSize: 12, labelWeight: 600,
      r: 21, path: "curve", glow: false, label: "pill",
      flow: "#8a7550", flowW: 3, infl: "#d4af6a", inflDash: "10 8", inflW: 2.5, inflFlow: true,
      fills: { start: "url(#gr-dark)", scene: "url(#gr-dark)", choice: "url(#gr-gold)", option: "url(#gr-cream)", gate: "url(#gr-rose)", end: "url(#gr-wine)", episode: "url(#gr-dark)" },
      strokes: { start: "#4a3f30", scene: "#4a3f30", choice: "#f0d9a4", option: "#fff7e6", gate: "#e0b5b0", end: "#b8566a", episode: "#d4af6a" },
      glyph: null, text: "#f3ece0", dim: 0.08,
    },
  ];

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const epOf = (id) => byId[id].ep;

  function mount(stage, themeIndex) {
    const T = themes[themeIndex];
    const flow = FLOW.map((e) => [...e]);
    const state = { view: "episode", ep: "s1e1", sel: null, mode: null, expanded: new Set(), tx: 0, ty: 0, k: 1, positions: {} };

    stage.innerHTML = `
      <style>
        .gx { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 16px; }
        @media (max-width: 900px) { .gx { grid-template-columns: minmax(0,1fr); } }
        .gx-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
        .gx-bar .eps { display: flex; flex-wrap: wrap; gap: 6px; }
        .gx-bar .eps button, .gx-tools button { border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; font-size: 12.5px; color: var(--muted); }
        .gx-bar .eps button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); }
        .gx-tools { display: flex; gap: 6px; margin-left: auto; }
        .gx-canvas { position: relative; height: min(68vh, 620px); min-height: 380px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; touch-action: none; cursor: grab; }
        .gx-canvas.panning { cursor: grabbing; }
        .gx-canvas svg { width: 100%; height: 100%; display: block; }
        .gx-legend { position: absolute; left: 12px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: var(--muted); background: rgba(20,16,13,.78); padding: 6px 10px; border-radius: 8px; pointer-events: none; }
        .gx-legend i { display: inline-block; width: 26px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: 6px; }
        .gx-toast { position: absolute; right: 12px; top: 10px; font-size: 12px; background: var(--gold); color: #1a1613; padding: 6px 10px; border-radius: 8px; }
        .gx-side { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: var(--bg); min-width: 0; align-self: start; }
        .gx-side h2 { font-family: "Forum", Georgia, serif; font-weight: 400; font-size: 24px; margin: 0 0 4px; }
        .gx-side p { color: var(--muted); font-size: 13.5px; margin: 0 0 12px; }
        .gx-side h3 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-dim); margin: 14px 0 6px; }
        .gx-side dl { margin: 0; font-size: 13.5px; } .gx-side dt { color: var(--muted); font-size: 12px; margin-top: 8px; } .gx-side dd { margin: 0; }
        .gx-side .acts { display: grid; gap: 6px; margin-top: 12px; }
        .gx-side .acts button { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; text-align: left; }
        .gx-side .acts button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: rgba(212,175,106,.08); }
        .gx-side ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--text); } .gx-side li { margin: 3px 0; }
        .gx-node { cursor: pointer; } .gx-node text { user-select: none; pointer-events: none; }
        .gx-port { cursor: crosshair; opacity: 0; transition: opacity .15s; } .gx-node:hover .gx-port, .gx-node.sel .gx-port { opacity: 1; }
        @keyframes gx-run { to { stroke-dashoffset: -36; } } .gx-run { animation: gx-run 1.4s linear infinite; }
        @keyframes gx-tw { 50% { opacity: .25; } }
      </style>
      <div class="gx-bar">
        <div class="seg" role="group" aria-label="Вид графа">
          <button data-view="episode" aria-pressed="true">Граф серии</button>
          <button data-view="season" aria-pressed="false">Граф сезона</button>
          <button data-view="story" aria-pressed="false">Вся история</button>
        </div>
        <div class="eps" id="gx-eps"></div>
        <div class="gx-tools"><button data-tool="out" aria-label="Отдалить">−</button><button data-tool="in" aria-label="Приблизить">+</button><button data-tool="fit">Показать всё</button></div>
      </div>
      <div class="gx">
        <div class="gx-canvas" id="gx-canvas" style="background:${T.bg}">
          <svg id="gx-svg" role="img" aria-label="Граф сюжета"></svg>
          <div class="gx-legend"><span><i style="border-color:${T.flow}"></i>прямой переход к сцене</span><span><i style="border-color:${T.infl};border-top-style:dashed"></i>отложенное последствие (через характеристику или флаг)</span></div>
        </div>
        <aside class="gx-side" id="gx-side"></aside>
      </div>`;

    const svg = stage.querySelector("#gx-svg"), canvas = stage.querySelector("#gx-canvas"), side = stage.querySelector("#gx-side"), epsEl = stage.querySelector("#gx-eps");

    // ---- which nodes and links are on the canvas in the current view -------------------
    function scene() {
      if (state.view === "episode") {
        const nodes = NODES.filter((n) => n.ep === state.ep).map((n) => ({ ...n, vid: n.id }));
        const ids = new Set(nodes.map((n) => n.id));
        const links = flow.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, l]) => ({ a, b, l, type: "flow" }));
        // Consequences that leave or enter this episode are shown as stubs to a labelled marker.
        const stubs = [];
        INFLUENCE.forEach(([a, b, v]) => {
          if (ids.has(a) && ids.has(b)) links.push({ a, b, l: v, type: "infl" });
          else if (ids.has(a)) stubs.push({ id: `out-${a}-${b}`, at: a, dir: 1, text: `→ ${epLabel(epOf(b))}: ${byId[b].label}`, v });
          else if (ids.has(b)) stubs.push({ id: `in-${a}-${b}`, at: b, dir: -1, text: `← ${epLabel(epOf(a))}: ${byId[a].label}`, v });
        });
        return { nodes, links, stubs, bands: [] };
      }
      const season = EPISODES.find((e) => e.id === state.ep).season;
      const eps = state.view === "season" ? EPISODES.filter((e) => e.season === season) : EPISODES;
      const nodes = [], links = [], bands = [];
      const proxy = {};
      eps.forEach((ep, i) => {
        const x = 150 + i * 290;
        const open = state.view === "season" || state.expanded.has(ep.id);
        nodes.push({ id: ep.id, vid: ep.id, kind: "episode", ep: ep.id, label: `${epLabel(ep.id)} · ${ep.title}`, x, y: 90, open, big: true });
        const keys = NODES.filter((n) => n.ep === ep.id && n.key);
        NODES.filter((n) => n.ep === ep.id).forEach((n) => (proxy[n.id] = ep.id));
        if (open) keys.forEach((n, j) => { nodes.push({ ...n, vid: n.id, x: x + (j % 2 ? 60 : -60), y: 200 + j * 74 }); proxy[n.id] = n.id; links.push({ a: ep.id, b: n.id, type: "member" }); });
        if (i > 0) links.push({ a: eps[i - 1].id, b: ep.id, type: "flow" });
      });
      [...new Set(eps.map((e) => e.season))].forEach((s) => {
        const xs = nodes.filter((n) => n.kind === "episode" && EPISODES.find((e) => e.id === n.id).season === s).map((n) => n.x);
        bands.push({ s, x: Math.min(...xs) - 130, w: Math.max(...xs) - Math.min(...xs) + 260 });
      });
      const seen = new Map();
      INFLUENCE.forEach(([a, b, v]) => {
        const pa = proxy[a], pb = proxy[b]; if (!pa || !pb || pa === pb) return;
        const key = pa + ">" + pb; if (seen.has(key)) return seen.get(key).vars.add(v);
        const link = { a: pa, b: pb, type: "infl", vars: new Set([v]) }; seen.set(key, link); links.push(link);
      });
      links.forEach((l) => { if (l.vars) l.l = [...l.vars].join(", "); });
      return { nodes, links, stubs: [], bands };
    }
    const epLabel = (id) => { const e = EPISODES.find((x) => x.id === id); return `С${e.season}·Э${e.n}`; };

    // ---- reach: everything a decision leads to / everything an event depends on --------
    function reach(start, forward) {
      const out = new Set([start]); const queue = [start];
      const all = [...flow.map(([a, b]) => [a, b]), ...INFLUENCE.map(([a, b]) => [a, b])];
      // Finishing an episode leads into the next one.
      EPISODES.forEach((ep, i) => { const next = EPISODES[i + 1]; if (!next) return;
        NODES.filter((n) => n.ep === ep.id && n.kind === "end").forEach((n) => all.push([n.id, NODES.find((m) => m.ep === next.id && m.kind === "start").id])); });
      while (queue.length) { const cur = queue.shift();
        for (const [a, b] of all) { const [from, to] = forward ? [a, b] : [b, a]; if (from === cur && !out.has(to)) { out.add(to); queue.push(to); } } }
      return out;
    }
    function highlighted() {
      if (!state.sel || !state.mode) return null;
      const real = byId[state.sel] ? [state.sel] : NODES.filter((n) => n.ep === state.sel).map((n) => n.id);
      const set = new Set(); real.forEach((id) => reach(id, state.mode === "down").forEach((x) => set.add(x)));
      // Only deferred consequences count as "influence" when looking upstream at an event.
      return set;
    }

    const pos = (n) => state.positions[state.view + ":" + n.vid] || { x: n.x, y: n.y };

    function path(p, q, type) {
      if (type === "infl") { const lift = Math.min(160, 50 + Math.abs(q.x - p.x) * .22); const up = state.view === "episode" ? -lift : lift * .0 - 70;
        return `M${p.x},${p.y} Q${(p.x + q.x) / 2},${Math.min(p.y, q.y) + up} ${q.x},${q.y}`; }
      if (type === "member") return `M${p.x},${p.y} L${q.x},${q.y}`;
      if (T.path === "step") { const mid = (p.x + q.x) / 2; return `M${p.x},${p.y} H${mid} V${q.y} H${q.x}`; }
      const dx = Math.max(40, Math.abs(q.x - p.x) * .5); return `M${p.x},${p.y} C${p.x + dx},${p.y} ${q.x - dx},${q.y} ${q.x},${q.y}`;
    }

    function draw() {
      const sc = scene(); const hi = highlighted();
      const at = Object.fromEntries(sc.nodes.map((n) => [n.vid, pos(n)]));
      const lit = (n) => !hi || (n.kind === "episode" ? NODES.some((m) => m.ep === n.id && hi.has(m.id)) : hi.has(n.id));
      const litMap = Object.fromEntries(sc.nodes.map((n) => [n.vid, lit(n)]));
      const R = (n) => (n.big ? T.r + 12 : T.r);
      const out = [];
      out.push(`<defs>
        <marker id="ar-f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${T.flow}"/></marker>
        <marker id="ar-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${T.infl}"/></marker>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#4a3f30"/></pattern>
        <radialGradient id="vig" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2a2019" stop-opacity=".9"/><stop offset="1" stop-color="#0d0b09" stop-opacity="0"/></radialGradient>
        ${[["dark", "#3a3027", "#17120e"], ["gold", "#f0d9a4", "#b08a45"], ["cream", "#fff7e6", "#cdbb96"], ["rose", "#e0b5b0", "#96615c"], ["wine", "#9a3f50", "#4a1a24"]].map(([n, a, b]) => `<radialGradient id="gr-${n}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join("")}
      </defs>`);
      out.push(`<g transform="translate(${state.tx},${state.ty}) scale(${state.k})">`);
      if (T.grid === "dots") out.push(`<rect x="-4000" y="-4000" width="9000" height="9000" fill="url(#dots)"/>`);
      if (T.grid === "vignette") out.push(`<rect x="-4000" y="-4000" width="9000" height="9000" fill="url(#vig)"/>`);
      if (T.grid === "stars") for (let i = 0; i < 90; i++) { const x = ((Math.sin(i * 12.9) * 43758.5) % 1 + 1) % 1 * 2600 - 300, y = ((Math.sin(i * 78.2) * 12543.1) % 1 + 1) % 1 * 1100 - 200;
        out.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${i % 7 ? 1 : 1.8}" fill="${i % 5 ? "#f3ece0" : "#d4af6a"}" opacity=".55" style="animation: gx-tw ${3 + (i % 5)}s ${i % 4}s infinite"/>`); }

      const bandBottom = Math.max(...sc.nodes.map((n) => at[n.vid].y)) + 70;
      sc.bands.forEach((b) => out.push(`<rect x="${b.x}" y="20" width="${b.w}" height="${bandBottom - 20}" rx="18" fill="${T.flow}" fill-opacity=".05" stroke="${T.flow}" stroke-opacity=".3" stroke-dasharray="4 6"/><text x="${b.x + 16}" y="46" font-family='${T.font}' font-size="13" letter-spacing="2" fill="${T.flow}">СЕЗОН ${b.s}</text>`));

      sc.links.forEach((l, i) => {
        const p = at[l.a], q = at[l.b]; if (!p || !q) return;
        const A = sc.nodes.find((n) => n.vid === l.a), B = sc.nodes.find((n) => n.vid === l.b);
        const on = litMap[l.a] && litMap[l.b];
        const angle = Math.atan2(q.y - p.y, q.x - p.x);
        const s = l.type === "infl" || T.path !== "step" ? { x: p.x + Math.cos(angle) * R(A), y: p.y + Math.sin(angle) * R(A) } : { x: p.x + R(A), y: p.y };
        const e = l.type === "infl" || T.path !== "step" ? { x: q.x - Math.cos(angle) * (R(B) + 4), y: q.y - Math.sin(angle) * (R(B) + 4) } : { x: q.x - R(B) - 4, y: q.y };
        const infl = l.type === "infl", member = l.type === "member";
        const color = infl ? T.infl : T.flow;
        out.push(`<path d="${path(s, e, l.type)}" fill="none" stroke="${color}" stroke-width="${member ? 1 : infl ? T.inflW : T.flowW}" ${infl ? `stroke-dasharray="${T.inflDash}"` : member ? 'stroke-dasharray="2 5"' : ""} stroke-linecap="round" stroke-linejoin="round"
          opacity="${on ? (member ? .45 : 1) : T.dim}" ${member ? "" : `marker-end="url(#ar-${infl ? "i" : "f"})"`} ${T.glow && on && !member ? 'filter="url(#glow)"' : ""} class="${infl && T.inflFlow && on ? "gx-run" : ""}"/>`);
        if (l.l && on) { const mx = (s.x + e.x) / 2, my = infl ? Math.min(s.y, e.y) - (state.view === "episode" ? Math.min(160, 50 + Math.abs(e.x - s.x) * .22) / 2 + 8 : 44) : (s.y + e.y) / 2 - 7;
          out.push(`<text x="${mx}" y="${my}" text-anchor="middle" font-family='${T.font}' font-size="${T.labelSize - 1}" fill="${color}" paint-order="stroke" stroke="${T.bg}" stroke-width="4">${l.l}</text>`); }
      });

      sc.stubs.forEach((st, i) => { const p = at[st.at]; if (!p) return; const n = sc.nodes.find((x) => x.vid === st.at); const on = litMap[st.at];
        const count = sc.stubs.filter((x, j) => j < i && x.at === st.at).length; const ex = p.x + st.dir * 70, ey = p.y - 74 - count * 22;
        out.push(`<path d="M${p.x},${p.y - R(n)} Q${p.x},${ey} ${ex},${ey}" fill="none" stroke="${T.infl}" stroke-width="${T.inflW}" stroke-dasharray="${T.inflDash}" opacity="${on ? 1 : T.dim}" class="${T.inflFlow && on ? "gx-run" : ""}"/>
          <text x="${ex + st.dir * 6}" y="${ey + 4}" text-anchor="${st.dir > 0 ? "start" : "end"}" font-family='${T.font}' font-size="${T.labelSize - .5}" fill="${T.infl}" opacity="${on ? 1 : T.dim + .1}" paint-order="stroke" stroke="${T.bg}" stroke-width="4">${st.text} (${st.v})</text>`); });

      sc.nodes.forEach((n) => { const p = at[n.vid], r = R(n), on = litMap[n.vid], sel = state.sel === n.vid;
        const current = n.kind === "episode" && n.id === state.ep;
        out.push(`<g class="gx-node ${sel ? "sel" : ""}" data-id="${n.vid}" transform="translate(${p.x},${p.y})" opacity="${on ? 1 : T.dim + .1}" tabindex="0" role="button" aria-label="${KIND[n.kind]}: ${n.label}">
          ${sel ? `<circle r="${r + 8}" fill="none" stroke="${T.strokes[n.kind]}" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="3 4"/>` : ""}
          <circle r="${r}" fill="${T.fills[n.kind]}" stroke="${T.strokes[n.kind]}" stroke-width="${current || sel ? 3 : T.label === "pill" ? 2.5 : 1.6}" ${T.glow && on ? 'filter="url(#glow)"' : ""}/>
          ${T.glow && n.kind !== "scene" && n.kind !== "start" ? `<circle r="${r - 5}" fill="none" stroke="${T.strokes[n.kind]}" stroke-opacity=".45"/>` : ""}
          ${T.glyph ? `<text y="${r * .28}" text-anchor="middle" font-size="${n.big ? 20 : 14}" fill="${T.strokes[n.kind]}">${T.glyph[n.kind]}</text>` : n.kind === "episode" ? `<text y="5" text-anchor="middle" font-family='${T.font}' font-weight="700" font-size="12" fill="${T.strokes.episode}">${epLabel(n.id)}</text>` : ""}
          ${labelSvg(n, r)}
          ${n.kind === "episode" && state.view === "story" ? `<g class="gx-toggle" data-toggle="${n.id}" transform="translate(${r - 2},${-r + 2})"><circle r="9" fill="${T.bg}" stroke="${T.strokes.episode}"/><text y="4" text-anchor="middle" font-size="13" fill="${T.strokes.episode}">${n.open ? "−" : "+"}</text></g>` : ""}
          ${state.view === "episode" && n.kind !== "end" ? `<circle class="gx-port" data-port="${n.vid}" cx="${r + 7}" r="5" fill="${T.bg}" stroke="${T.flow}" stroke-width="1.5"/>` : ""}
        </g>`); });
      if (link) out.push(`<path d="M${link.x0},${link.y0} L${link.x},${link.y}" stroke="${T.flow}" stroke-width="2" stroke-dasharray="4 4" fill="none"/>`);
      out.push("</g>");
      svg.innerHTML = out.join("");
      drawSide(sc);
    }
    function labelSvg(n, r) {
      const text = n.kind === "episode" && !T.glyph ? n.label.split(" · ")[1] : n.label;
      if (T.label === "pill") { const w = text.length * 6.9 + 18;
        return `<g transform="translate(${-w / 2},${r + 8})"><rect width="${w}" height="22" rx="11" fill="#1a1613" stroke="#3a3128"/><text x="${w / 2}" y="15" text-anchor="middle" font-family='${T.font}' font-size="${T.labelSize}" font-weight="${T.labelWeight}" fill="${T.text}">${text}</text></g>`; }
      return `<text y="${r + 17}" text-anchor="middle" font-family='${T.font}' font-size="${T.labelSize}" font-weight="${T.labelWeight}" fill="${T.text}" paint-order="stroke" stroke="${T.bg}" stroke-width="4">${text}</text>`;
    }

    function drawSide(sc) {
      const n = state.sel && (byId[state.sel] || sc.nodes.find((x) => x.vid === state.sel));
      if (!n) { side.innerHTML = `<h2>${T.name}</h2><p>${T.pitch}</p>
        <h3>Что попробовать</h3><ul><li>Нажмите на узел — справа появятся его условия и кнопки «последствия» и «что влияет».</li><li>Перетащите узел. Перетащите пустое место — сдвинется поле. Колесо мыши или кнопки − / + меняют масштаб.</li><li>В графе серии потяните за кружок-порт справа от узла к другому узлу — появится новая связь.</li><li>Во «Всей истории» нажмите + на серии, чтобы раскрыть её ключевые решения.</li><li>Двойной щелчок по серии открывает её граф.</li></ul>
        <h3>Демо-сюжет</h3><p>Пять серий в двух сезонах. Решение «Улыбнуться» в первой серии открывает сцену во второй и влияет на финал второго сезона; «Взять ключ» открывает отдельную ветку в начале второго сезона.</p>`; return; }
      const real = byId[n.id];
      const ins = INFLUENCE.filter(([, b]) => b === n.id), outs = INFLUENCE.filter(([a]) => a === n.id);
      side.innerHTML = `<h2>${n.label}</h2><p>${KIND[n.kind]} · ${n.kind === "episode" ? "серия" : epLabel(n.ep) + " «" + EPISODES.find((e) => e.id === n.ep).title + "»"}</p>
        <dl>${real && real.cond ? `<dt>Условие перехода</dt><dd>${real.cond}</dd>` : ""}${real && real.sets ? `<dt>Что меняет</dt><dd>${real.sets}</dd>` : ""}
        ${outs.length ? `<dt>Отложенные последствия</dt><dd><ul>${outs.map(([, b, v]) => `<li>${epLabel(epOf(b))}: ${byId[b].label} <span style="color:var(--muted)">(${v})</span></li>`).join("")}</ul></dd>` : ""}
        ${ins.length ? `<dt>Зависит от решений</dt><dd><ul>${ins.map(([a, , v]) => `<li>${epLabel(epOf(a))}: ${byId[a].label} <span style="color:var(--muted)">(${v})</span></li>`).join("")}</ul></dd>` : ""}</dl>
        <div class="acts"><button data-mode="down" aria-pressed="${state.mode === "down"}">Показать всю цепочку последствий</button><button data-mode="up" aria-pressed="${state.mode === "up"}">Показать, что на это влияет</button>
        ${n.kind === "episode" ? `<button data-open="${n.id}">Открыть граф этой серии</button>` : ""}<button data-mode="">Снять выделение</button></div>`;
    }

    function drawEps() {
      epsEl.innerHTML = EPISODES.map((e) => `<button data-ep="${e.id}" aria-pressed="${e.id === state.ep}">${epLabel(e.id)} ${e.title}</button>`).join("");
      stage.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    }
    function fit() {
      const sc = scene(); const xs = sc.nodes.map((n) => pos(n).x), ys = sc.nodes.map((n) => pos(n).y);
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 500;
      const minX = Math.min(...xs) - 130, maxX = Math.max(...xs) + 150, minY = Math.min(...ys) - 150, maxY = Math.max(...ys) + 90;
      state.k = Math.min(1.25, Math.min(w / (maxX - minX), h / (maxY - minY)));
      state.tx = (w - (maxX - minX) * state.k) / 2 - minX * state.k; state.ty = (h - (maxY - minY) * state.k) / 2 - minY * state.k;
    }
    function refresh(refit) { drawEps(); if (refit) fit(); draw(); }
    function toast(text) { const t = document.createElement("div"); t.className = "gx-toast"; t.textContent = text; canvas.appendChild(t); setTimeout(() => t.remove(), 2600); }

    // ---- pointer: pan, drag a node, pull a link ----------------------------------------
    let drag = null, link = null;
    const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - state.tx) / state.k, y: (e.clientY - r.top - state.ty) / state.k }; };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".gx-legend")) return;
      const port = e.target.closest("[data-port]"), toggle = e.target.closest("[data-toggle]"), node = e.target.closest(".gx-node");
      if (toggle) { const id = toggle.dataset.toggle; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); return refresh(false); }
      const w = toWorld(e);
      if (port) { const sc = scene(), n = sc.nodes.find((x) => x.vid === port.dataset.port), p = pos(n); link = { from: n.vid, x0: p.x + T.r + 7, y0: p.y, x: w.x, y: w.y }; }
      else if (node) { const sc = scene(), n = sc.nodes.find((x) => x.vid === node.dataset.id), p = pos(n); drag = { id: n.vid, dx: w.x - p.x, dy: w.y - p.y, moved: false }; }
      else { drag = { pan: true, x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty, moved: false }; canvas.classList.add("panning"); }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (link) { const w = toWorld(e); link.x = w.x; link.y = w.y; return draw(); }
      if (!drag) return;
      if (drag.pan) { state.tx = drag.tx + e.clientX - drag.x; state.ty = drag.ty + e.clientY - drag.y; drag.moved = true; return draw(); }
      const w = toWorld(e); state.positions[state.view + ":" + drag.id] = { x: w.x - drag.dx, y: w.y - drag.dy }; drag.moved = true; draw();
    });
    canvas.addEventListener("pointerup", (e) => {
      canvas.classList.remove("panning");
      if (link) { const w = toWorld(e); const sc = scene();
        const target = sc.nodes.find((n) => { const p = pos(n); return Math.hypot(p.x - w.x, p.y - w.y) < T.r + 12 && n.vid !== link.from; });
        if (target && !flow.some(([a, b]) => a === link.from && b === target.vid)) { flow.push([link.from, target.vid]); toast("Связь создана. В редакторе она сразу сохранится в сценарий."); }
        link = null; return draw(); }
      if (drag && !drag.moved) { state.sel = drag.pan ? null : drag.id; if (drag.pan) state.mode = null; else if (!state.mode) state.mode = "down"; draw(); }
      drag = null;
    });
    canvas.addEventListener("dblclick", (e) => { const node = e.target.closest(".gx-node"); if (!node) return; const id = node.dataset.id;
      const ep = EPISODES.find((x) => x.id === id); if (ep) { state.ep = id; state.view = "episode"; state.sel = null; state.mode = null; refresh(true); } });
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.min(2.2, Math.max(.3, state.k * (e.deltaY < 0 ? 1.1 : .9))); state.tx = mx - ((mx - state.tx) / state.k) * k; state.ty = my - ((my - state.ty) / state.k) * k; state.k = k; draw(); }, { passive: false });
    canvas.addEventListener("keydown", (e) => { const node = e.target.closest && e.target.closest(".gx-node"); if (node && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); state.sel = node.dataset.id; state.mode = state.mode || "down"; draw(); } });

    stage.querySelector(".gx-bar").addEventListener("click", (e) => {
      const v = e.target.closest("[data-view]"), ep = e.target.closest("[data-ep]"), tool = e.target.closest("[data-tool]");
      if (v) { state.view = v.dataset.view; if (state.sel && !byId[state.sel] && state.view === "episode") state.sel = null; return refresh(true); }
      if (ep) { state.ep = ep.dataset.ep; if (state.view === "episode") { state.sel = null; state.mode = null; } return refresh(state.view !== "story"); }
      if (tool) { if (tool.dataset.tool === "fit") fit(); else { const w = canvas.clientWidth / 2, h = canvas.clientHeight / 2, k = Math.min(2.2, Math.max(.3, state.k * (tool.dataset.tool === "in" ? 1.2 : .83)));
        state.tx = w - ((w - state.tx) / state.k) * k; state.ty = h - ((h - state.ty) / state.k) * k; state.k = k; } draw(); }
    });
    side.addEventListener("click", (e) => { const m = e.target.closest("[data-mode]"), open = e.target.closest("[data-open]");
      if (open) { state.ep = open.dataset.open; state.view = "episode"; state.sel = null; state.mode = null; return refresh(true); }
      if (m) { state.mode = m.dataset.mode || null; if (!state.mode) state.sel = null; draw(); } });

    refresh(true);
    requestAnimationFrame(() => { fit(); draw(); });
  }

  window.ArcanaGraph = { themes, mount };
})();
