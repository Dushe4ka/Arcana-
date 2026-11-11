/* Three design directions for the ARCANA app, each a different composition of the same
   screens and the same palette. Everything is demo content: no real story text is used. */
(function () {
  const STORIES = [
    { id: "mask", title: "Маска и Слово", genre: "Романтика", chapters: 12, hue: 18, tone: "#6e2a35", blurb: "Тайное общество открывает двери на одну ночь." },
    { id: "dragon", title: "Дочь дракона", genre: "Фэнтези", chapters: 9, hue: 32, tone: "#7a5a2c", blurb: "Клятва, данная огню, не имеет срока." },
    { id: "ash", title: "Пепел королевы", genre: "Драма", chapters: 14, hue: 350, tone: "#4d2a33", blurb: "Корона тяжелее, чем кажется со стороны." },
    { id: "shade", title: "Шёпот теней", genre: "Мистика", chapters: 7, hue: 265, tone: "#3a3046", blurb: "В этом доме зеркала помнят больше людей." },
  ];
  const LINES = [
    { who: null, text: "Зал наполнялся гостями. Свечи дрожали, как будто знали, чем кончится вечер." },
    { who: "Адриан", text: "Вы всё-таки пришли. Я почти перестал надеяться." },
    { who: "Лия", thought: true, text: "Он смотрит так, будто уже знает мой ответ." },
    { choice: "Как ответить?", options: [{ t: "Улыбнуться в ответ" }, { t: "Отшутиться" }, { t: "Пригласить на танец", cost: 5 }] },
    { who: "Адриан", text: "Тогда позвольте украсть вас у этого вечера." },
  ];
  const SCREENS = [
    ["home", "Главная"], ["catalog", "Каталог"], ["story", "Карточка истории"],
    ["reader", "Игровой экран"], ["menu", "Меню в игре"], ["profile", "Профиль"],
  ];

  // --- shared art, drawn in code so the page ships no images ---------------------------
  const cover = (s, extra = "") =>
    `background: radial-gradient(120% 80% at 30% 10%, hsl(${s.hue} 45% 34% / .95), transparent 60%),
                 radial-gradient(90% 70% at 80% 90%, ${s.tone}, transparent 70%),
                 linear-gradient(160deg, #3a2a20, #14100d); ${extra}`;
  const figure = (id, body = "#2a2019", rim = "#d4af6a") => `
    <svg viewBox="0 0 200 460" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs><linearGradient id="fg-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${rim}" stop-opacity=".55"/><stop offset=".35" stop-color="${body}"/><stop offset="1" stop-color="#120e0b"/></linearGradient></defs>
      <path fill="url(#fg-${id})" d="M100 26c22 0 37 17 37 41 0 17-8 31-20 38l2 14c30 8 52 24 60 58l14 283H7l14-283c8-34 30-50 60-58l2-14c-12-7-20-21-20-38 0-24 15-41 37-41z"/>
      <path fill="none" stroke="${rim}" stroke-opacity=".35" stroke-width="1.2" d="M100 26c22 0 37 17 37 41 0 17-8 31-20 38l2 14c30 8 52 24 60 58"/>
    </svg>`;
  const hall = `background:
      radial-gradient(60% 40% at 50% 8%, rgba(233,217,184,.28), transparent 70%),
      radial-gradient(26% 46% at 18% 34%, rgba(212,175,106,.16), transparent 70%),
      radial-gradient(26% 46% at 82% 34%, rgba(212,175,106,.16), transparent 70%),
      linear-gradient(180deg, #3b2a22 0%, #241913 48%, #120e0b 100%);`;

  // =====================================================================================
  // 1. Гримуар — the app as an old book: arches, double gold rules, a table of contents.
  // =====================================================================================
  const grimoire = {
    name: "Гримуар", tagline: "Старинная книга: арки, золотые рамки, оглавление",
    title: "Гримуар",
    pitch: "Приложение как книга, которую открывают при свечах. Истории — арочные карты, как карты таро; главы — настоящее оглавление с римскими цифрами; диалог — страница в двойной золотой рамке.",
    facts: [
      ["Композиция", "Центральная ось, симметрия, арки. Экран читается как разворот."],
      ["Шрифт", "Cormorant Garamond с капителью для заголовков, спокойный гротеск для мелкого текста."],
      ["Движение", "Медленное: свеча дышит, страницы проявляются. Никаких резких вспышек."],
      ["Риск", "Самый декоративный вариант. Требует аккуратных иллюстраций в арках."],
    ],
    css: `
.v1 { --serif: "Cormorant Garamond", Georgia, serif; font-family: "Golos Text", system-ui, sans-serif; color: var(--text); height: 100%; position: relative;
      background: radial-gradient(90% 50% at 50% 0%, rgba(212,175,106,.13), transparent 70%), var(--bg); }
.v1 .scroll { position: absolute; inset: 0 0 58px; overflow-y: auto; padding: 46px 18px 20px; }
.v1 .mast { text-align: center; font-family: var(--serif); letter-spacing: .34em; font-size: 15px; color: var(--gold); }
.v1 .rule { display: flex; align-items: center; gap: 8px; margin: 8px 0 16px; color: var(--gold-dim); font-size: 9px; }
.v1 .rule::before, .v1 .rule::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--gold-dim)); }
.v1 .rule::after { transform: scaleX(-1); }
.v1 h2 { font-family: var(--serif); font-weight: 600; font-size: 22px; margin: 0; line-height: 1.15; }
.v1 .eyebrow { font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--gold-dim); }
.v1 .book { display: grid; grid-template-columns: 96px 1fr; gap: 14px; padding: 12px; border: 1px solid var(--gold-dim); outline: 1px solid rgba(212,175,106,.25); outline-offset: 3px; border-radius: 4px; background: rgba(36,31,26,.7); }
.v1 .arch { border-radius: 999px 999px 6px 6px; border: 1px solid var(--gold); box-shadow: inset 0 0 0 3px #1a1613, inset 0 0 0 4px rgba(212,175,106,.4); position: relative; overflow: hidden; }
.v1 .arch svg { position: absolute; inset: 14% 8% 0; width: 84%; height: 86%; }
.v1 .book .arch { height: 128px; }
.v1 .bar { height: 2px; background: var(--line); margin-top: 10px; } .v1 .bar i { display: block; height: 100%; width: 42%; background: var(--gold); }
.v1 .seal { margin-top: 12px; align-self: start; justify-self: start; padding: 8px 16px; border: 1px solid var(--gold); border-radius: 999px; font-family: var(--serif); font-size: 15px; color: var(--gold); letter-spacing: .06em; }
.v1 .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 14px; margin-top: 10px; }
.v1 .card { text-align: center; } .v1 .card .arch { height: 150px; }
.v1 .card b { display: block; font-family: var(--serif); font-size: 17px; font-weight: 600; margin-top: 8px; line-height: 1.1; }
.v1 .card span { font-size: 11px; color: var(--muted); }
.v1 .ribbons { display: flex; gap: 6px; overflow-x: auto; margin: 0 -18px 4px; padding: 0 18px; }
.v1 .ribbon { flex: none; padding: 5px 12px 9px; font-size: 12px; color: var(--muted); background: var(--surface); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%); }
.v1 .ribbon.on { background: var(--wine); color: var(--champagne); }
.v1 .nav { position: absolute; left: 0; right: 0; bottom: 0; height: 58px; display: flex; justify-content: space-around; align-items: center; border-top: 1px solid var(--gold-dim); background: #17130f; font-family: var(--serif); font-size: 15px; letter-spacing: .08em; }
.v1 .nav button { color: var(--muted); padding: 10px; } .v1 .nav button.on { color: var(--gold); } .v1 .nav button.on::before { content: "◆ "; font-size: 8px; vertical-align: middle; }
.v1 .hero-arch { height: 250px; margin: 0 26px; } .v1 .center { text-align: center; }
.v1 .toc { list-style: none; margin: 14px 0 0; padding: 0; }
.v1 .toc li { display: flex; align-items: baseline; gap: 8px; padding: 9px 0; font-family: var(--serif); font-size: 17px; }
.v1 .toc li i { flex: 1; border-bottom: 1px dotted var(--gold-dim); transform: translateY(-4px); }
.v1 .toc li em { font-style: normal; font-size: 12px; color: var(--muted); font-family: "Golos Text", sans-serif; }
.v1 .toc li.locked { color: var(--muted); }
.v1 .medal { width: 86px; height: 86px; border-radius: 50%; margin: 6px auto 10px; border: 1px solid var(--gold); box-shadow: inset 0 0 0 4px #1a1613, inset 0 0 0 5px var(--gold-dim); display: grid; place-items: center; font-family: var(--serif); font-size: 38px; color: var(--gold); }
.v1 .seals { display: flex; justify-content: space-around; margin: 16px 0; }
.v1 .seals div { text-align: center; font-size: 11px; color: var(--muted); }
.v1 .seals b { display: grid; place-items: center; width: 62px; height: 62px; margin: 0 auto 6px; border-radius: 50%; border: 1px dashed var(--gold-dim); font-family: var(--serif); font-size: 22px; color: var(--champagne); font-weight: 600; }
.v1 .rd { position: absolute; inset: 0; }
.v1 .rd .bg { position: absolute; inset: 0; }
.v1 .rd .sprite { position: absolute; right: -6%; bottom: 0; height: 88%; aspect-ratio: 200/460; }
.v1 .rd .sprite svg { width: 100%; height: 100%; }
.v1 .page { position: absolute; left: 12px; right: 12px; top: 52%; padding: 20px 16px 14px; background: rgba(23,19,15,.92); border: 1px solid var(--gold); outline: 1px solid rgba(212,175,106,.35); outline-offset: -5px; border-radius: 3px; min-height: 118px; }
.v1 .page::before, .v1 .page::after { content: "◆"; position: absolute; top: -7px; font-size: 10px; color: var(--gold); background: #17130f; padding: 0 4px; }
.v1 .page::before { left: 12px; } .v1 .page::after { right: 12px; }
.v1 .plaque { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); padding: 2px 14px; background: #17130f; border: 1px solid var(--gold); font-family: var(--serif); font-size: 15px; letter-spacing: .08em; color: var(--gold); white-space: nowrap; }
.v1 .page p { margin: 0; font-family: var(--serif); font-size: 18px; line-height: 1.32; }
.v1 .page p.thought { font-style: italic; color: var(--muted); }
.v1 .opts { position: absolute; left: 14px; right: 14px; top: 46%; display: grid; gap: 8px; }
.v1 .opts h4 { margin: 0 0 2px; text-align: center; font-family: var(--serif); font-size: 19px; font-weight: 600; }
.v1 .opt { display: flex; justify-content: space-between; gap: 8px; text-align: left; padding: 11px 14px; background: rgba(23,19,15,.92); border: 1px solid var(--gold-dim); font-family: var(--serif); font-size: 17px; border-radius: 3px; }
.v1 .opt small { color: var(--gold); font-family: "Golos Text", sans-serif; font-size: 12px; }
.v1 .gmenu { position: absolute; top: 12%; left: 10px; right: 10px; padding: 9px 6px; text-align: center; background: rgba(23,19,15,.9); border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); font-family: var(--serif); font-size: 15px; letter-spacing: .04em; line-height: 1.9; }
.v1 .gmenu span { color: var(--gold-dim); margin: 0 5px; font-size: 9px; }
.v1 .taphint { position: absolute; top: 0; left: 0; right: 0; height: 24%; }`,
    nav(active) {
      return `<nav class="nav"><button data-go="home" class="${active === "home" ? "on" : ""}">Полка</button><button data-go="catalog" class="${active === "catalog" ? "on" : ""}">Каталог</button><button data-go="profile" class="${active === "profile" ? "on" : ""}">Профиль</button></nav>`;
    },
    screens: {
      home() {
        const s = STORIES[0];
        return `<div class="scroll"><div class="mast">ARCANA</div><div class="rule">◆</div>
          <div class="eyebrow">Закладка</div>
          <button class="book" data-go="story" style="width:100%;text-align:left;margin-top:8px">
            <div class="arch" style="${cover(s)}">${figure("g1")}</div>
            <div><h2>${s.title}</h2><div style="font-size:12px;color:var(--muted);margin-top:4px">Глава V · «Маскарад»</div>
              <div class="bar"><i></i></div><div class="seal">Читать дальше</div></div></button>
          <div class="rule" style="margin-top:22px">◆</div><div class="eyebrow">На полке</div>
          <div class="cards">${STORIES.slice(1).map((x) => `<button class="card" data-go="story"><div class="arch" style="${cover(x)}">${figure("g" + x.id)}</div><b>${x.title}</b><span>${x.genre}</span></button>`).join("")}</div>
        </div>${grimoire.nav("home")}`;
      },
      catalog() {
        return `<div class="scroll"><div class="mast">КАТАЛОГ</div><div class="rule">◆</div>
          <div class="ribbons">${["Все", "Романтика", "Фэнтези", "Драма", "Мистика"].map((g, i) => `<span class="ribbon ${i === 0 ? "on" : ""}">${g}</span>`).join("")}</div>
          <div class="cards">${STORIES.map((x) => `<button class="card" data-go="story"><div class="arch" style="${cover(x)}">${figure("c" + x.id)}</div><b>${x.title}</b><span>${x.genre} · ${x.chapters} глав</span></button>`).join("")}</div>
        </div>${grimoire.nav("catalog")}`;
      },
      story() {
        const s = STORIES[0];
        const toc = [["I", "Приглашение", "прочитано"], ["II", "Зал зеркал", "прочитано"], ["III", "Письмо без подписи", "прочитано"], ["IV", "Сад", "прочитано"], ["V", "Маскарад", "вы здесь"], ["VI", "Ключ", "3 ключа"]];
        return `<div class="scroll center"><div class="arch hero-arch" style="${cover(s)}">${figure("s1")}</div>
          <div class="eyebrow" style="margin-top:14px">${s.genre} · сезон первый</div><h2 style="font-size:30px;margin-top:4px">${s.title}</h2>
          <p style="font-size:13px;color:var(--muted);margin:6px 10px 12px">${s.blurb}</p>
          <button class="seal" data-go="reader" style="margin:0 auto">Открыть главу V</button>
          <div class="rule" style="margin-top:18px">Оглавление</div>
          <ol class="toc" style="text-align:left">${toc.map((c, i) => `<li class="${i === 5 ? "locked" : ""}"><span style="color:var(--gold);width:26px">${c[0]}</span>${c[1]}<i></i><em>${c[2]}</em></li>`).join("")}</ol>
        </div>${grimoire.nav("")}`;
      },
      reader(ctx) {
        return `<div class="rd"><div class="bg" style="${hall}"></div><div class="sprite">${figure("r1", "#2c2019")}</div>
          ${ctx.menu ? `<div class="gmenu">Выйти<span>◆</span>Назад<span>◆</span>Журнал<span>◆</span>Автоклик<br>Перемотка<span>◆</span>Скрыть<span>◆</span>Настройки</div>` : ""}
          <button class="taphint" data-act="menu" aria-label="Открыть меню"></button>
          ${ctx.line.choice
            ? `<div class="opts"><h4>${ctx.line.choice}</h4>${ctx.line.options.map((o) => `<button class="opt" data-act="next">${o.t}${o.cost ? `<small>✦ ${o.cost}</small>` : ""}</button>`).join("")}</div>`
            : `<button class="page" data-act="next" style="text-align:left">${ctx.line.who ? `<span class="plaque">${ctx.line.who}</span>` : ""}<p class="${ctx.line.thought ? "thought" : ""}">${ctx.line.text}</p></button>`}
        </div>`;
      },
      profile() {
        return `<div class="scroll center"><div class="mast">ПРОФИЛЬ</div><div class="rule">◆</div>
          <div class="medal">Л</div><h2>Лилия</h2><div style="font-size:12px;color:var(--muted)">Читательница · уровень VII</div>
          <div class="seals"><div><b>340</b>Зёрна</div><div><b>25</b>Карты</div><div><b>12</b>Ключи</div></div>
          <div class="rule">Собрано</div>
          <ol class="toc" style="text-align:left"><li>Финалы<i></i><em>5 из 11</em></li><li>Иллюстрации<i></i><em>14 из 30</em></li><li>Главы<i></i><em>23</em></li></ol>
          <button class="seal" style="margin:14px auto 0">Забрать дар дня</button>
        </div>${grimoire.nav("profile")}`;
      },
    },
  };

  // =====================================================================================
  // 2. Созвездие — night sky: thin type, glass, stories joined into a constellation.
  // =====================================================================================
  const astral = {
    name: "Созвездие", tagline: "Ночное небо: тонкие линии, стекло, истории-звёзды",
    title: "Созвездие",
    pitch: "Приложение как карта звёздного неба. Истории — светила, соединённые в созвездие; главы — путь от звезды к звезде; интерфейс — стекло, сквозь которое видно сцену. Самый воздушный и «магический» вариант.",
    facts: [
      ["Композиция", "Асимметрия и воздух. Круги вместо прямоугольников, навигация — парящая «капля»."],
      ["Шрифт", "Forum для заголовков (античные пропорции), Manrope тонкого начертания для текста."],
      ["Движение", "Мерцание звёзд, кольцо прогресса, плавное проявление стекла."],
      ["Риск", "Размытие стекла нагружает слабые телефоны — нужен упрощённый режим."],
    ],
    css: `
.v2 { --disp: "Forum", Georgia, serif; font-family: "Manrope", system-ui, sans-serif; font-weight: 300; color: var(--text); height: 100%; position: relative;
      background: radial-gradient(70% 45% at 85% 0%, rgba(194,147,143,.22), transparent 70%), radial-gradient(60% 40% at 0% 100%, rgba(212,175,106,.14), transparent 70%), #15110e; }
.v2 canvas.sky { position: absolute; inset: 0; width: 100%; height: 100%; }
.v2 .scroll { position: absolute; inset: 0; overflow-y: auto; padding: 50px 20px 96px; }
.v2 h1 { font-family: var(--disp); font-weight: 400; font-size: 34px; line-height: 1.02; margin: 0; letter-spacing: .01em; }
.v2 h1 em { font-style: normal; color: var(--gold); }
.v2 .sub { font-size: 12px; color: var(--muted); letter-spacing: .04em; }
.v2 .glass { background: rgba(47,40,32,.42); border: 1px solid rgba(233,217,184,.16); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-radius: 22px; }
.v2 .orbit { display: flex; align-items: center; gap: 16px; padding: 14px; margin-top: 18px; width: 100%; text-align: left; }
.v2 .ring { --p: 42; flex: none; width: 92px; height: 92px; border-radius: 50%; padding: 4px; background: conic-gradient(var(--gold) calc(var(--p) * 1%), rgba(233,217,184,.14) 0); }
.v2 .ring > div { width: 100%; height: 100%; border-radius: 50%; border: 3px solid #15110e; overflow: hidden; position: relative; }
.v2 .ring svg { position: absolute; inset: 12% 10% 0; width: 80%; height: 88%; }
.v2 .orbit b { font-family: var(--disp); font-weight: 400; font-size: 21px; display: block; line-height: 1.1; }
.v2 .pill { display: inline-block; margin-top: 8px; padding: 6px 14px; border-radius: 999px; background: var(--gold); color: #1a1613; font-weight: 600; font-size: 12px; }
.v2 .const { position: relative; height: 330px; margin-top: 14px; }
.v2 .const svg.lines { position: absolute; inset: 0; width: 100%; height: 100%; }
.v2 .star { position: absolute; text-align: center; width: 104px; transform: translate(-50%, 0); }
.v2 .star .orb { width: 74px; height: 74px; margin: 0 auto; border-radius: 50%; border: 1px solid rgba(233,217,184,.5); box-shadow: 0 0 22px rgba(212,175,106,.35); position: relative; overflow: hidden; }
.v2 .star .orb svg { position: absolute; inset: 14% 12% 0; width: 76%; height: 86%; }
.v2 .star b { display: block; font-family: var(--disp); font-weight: 400; font-size: 14px; margin-top: 6px; line-height: 1.1; }
.v2 .star span { font-size: 10px; color: var(--muted); }
.v2 .dock { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 4px; padding: 5px; border-radius: 999px; }
.v2 .dock button { padding: 9px 15px; border-radius: 999px; font-size: 12px; font-weight: 500; color: var(--muted); }
.v2 .dock button.on { background: rgba(212,175,106,.18); color: var(--gold); }
.v2 .chips { display: flex; gap: 6px; overflow-x: auto; margin: 16px -20px 10px; padding: 0 20px; }
.v2 .chip { flex: none; padding: 6px 13px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(233,217,184,.18); color: var(--muted); }
.v2 .chip.on { border-color: var(--gold); color: var(--gold); }
.v2 .row { display: flex; align-items: center; gap: 14px; padding: 10px; width: 100%; text-align: left; margin-top: 10px; }
.v2 .row .orb { flex: none; width: 58px; height: 58px; border-radius: 50%; position: relative; overflow: hidden; border: 1px solid rgba(233,217,184,.4); }
.v2 .row .orb svg { position: absolute; inset: 14% 12% 0; width: 76%; height: 86%; }
.v2 .row b { font-family: var(--disp); font-weight: 400; font-size: 18px; display: block; line-height: 1.1; }
.v2 .big-orb { width: 190px; height: 190px; margin: 6px auto 0; border-radius: 50%; position: relative; border: 1px solid rgba(233,217,184,.5); box-shadow: 0 0 60px rgba(212,175,106,.3), 0 0 0 14px rgba(212,175,106,.05), 0 0 0 30px rgba(212,175,106,.03); overflow: hidden; }
.v2 .big-orb svg { position: absolute; inset: 10% 14% 0; width: 72%; height: 90%; }
.v2 .path { list-style: none; margin: 18px 0 0 8px; padding: 0; border-left: 1px solid rgba(212,175,106,.4); }
.v2 .path li { position: relative; padding: 0 0 16px 20px; font-size: 14px; }
.v2 .path li::before { content: ""; position: absolute; left: -5px; top: 5px; width: 9px; height: 9px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 10px var(--gold); }
.v2 .path li.next::before { background: #15110e; border: 1px solid var(--gold); box-shadow: none; }
.v2 .path li small { display: block; color: var(--muted); font-size: 11px; }
.v2 .rd { position: absolute; inset: 0; } .v2 .rd .bg { position: absolute; inset: 0; }
.v2 .rd .sprite { position: absolute; right: -6%; bottom: 0; height: 88%; aspect-ratio: 200/460; } .v2 .rd .sprite svg { width: 100%; height: 100%; }
.v2 .dots { position: absolute; top: 46px; left: 0; right: 0; display: flex; justify-content: center; gap: 7px; }
.v2 .dots i { width: 5px; height: 5px; border-radius: 50%; background: rgba(233,217,184,.3); } .v2 .dots i.on { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
.v2 .say { position: absolute; left: 12px; right: 12px; top: 52%; padding: 16px 18px; min-height: 112px; text-align: left; border-radius: 26px 26px 26px 6px; }
.v2 .say .who { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--gold); margin-bottom: 6px; font-weight: 500; }
.v2 .say .who::before { content: "✦ "; }
.v2 .say p { margin: 0; font-size: 15.5px; line-height: 1.45; font-weight: 400; } .v2 .say p.thought { font-style: italic; color: var(--champagne); opacity: .8; }
.v2 .opts { position: absolute; left: 14px; right: 14px; top: 46%; display: grid; gap: 9px; }
.v2 .opts h4 { margin: 0 0 2px; text-align: center; font-family: var(--disp); font-weight: 400; font-size: 20px; }
.v2 .opt { display: flex; justify-content: space-between; text-align: left; padding: 12px 18px; border-radius: 999px; font-size: 14px; font-weight: 400; }
.v2 .opt small { color: var(--gold); font-size: 12px; }
.v2 .arc { position: absolute; top: 9%; left: 0; right: 0; height: 96px; }
.v2 .arc button { position: absolute; width: 46px; height: 46px; margin-left: -23px; border-radius: 50%; font-size: 9.5px; font-weight: 500; display: grid; place-items: center; line-height: 1.05; }
.v2 .taphint { position: absolute; top: 0; left: 0; right: 0; height: 24%; }
.v2 .lvl { width: 150px; height: 150px; margin: 10px auto; border-radius: 50%; padding: 5px; background: conic-gradient(var(--gold) 64%, rgba(233,217,184,.12) 0); }
.v2 .lvl div { width: 100%; height: 100%; border-radius: 50%; background: #15110e; display: grid; place-content: center; text-align: center; }
.v2 .lvl b { font-family: var(--disp); font-weight: 400; font-size: 48px; line-height: 1; } .v2 .lvl span { font-size: 11px; color: var(--muted); }
.v2 .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.v2 .tiles div { padding: 12px 6px; text-align: center; font-size: 11px; color: var(--muted); border-radius: 18px; }
.v2 .tiles b { display: block; font-family: var(--disp); font-weight: 400; font-size: 24px; color: var(--text); }`,
    dock(active) {
      return `<nav class="dock glass"><button data-go="home" class="${active === "home" ? "on" : ""}">Небо</button><button data-go="catalog" class="${active === "catalog" ? "on" : ""}">Истории</button><button data-go="profile" class="${active === "profile" ? "on" : ""}">Я</button></nav>`;
    },
    after(root) {
      const canvas = root.querySelector("canvas.sky"); if (!canvas) return;
      const ctx = canvas.getContext("2d"); const w = (canvas.width = 340), h = (canvas.height = 700);
      const stars = Array.from({ length: 70 }, (_, i) => ({ x: (Math.sin(i * 91.7) * .5 + .5) * w, y: (Math.sin(i * 37.3 + 2) * .5 + .5) * h, r: .4 + ((i * 7) % 10) / 9, p: i }));
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let raf; const draw = (t) => {
        if (!canvas.isConnected) return cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, w, h);
        for (const s of stars) { ctx.globalAlpha = still ? .6 : .35 + .45 * Math.abs(Math.sin(t / 1400 + s.p)); ctx.fillStyle = s.p % 5 ? "#f3ece0" : "#d4af6a"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
        if (!still) raf = requestAnimationFrame(draw);
      }; draw(0);
    },
    screens: {
      home() {
        const pos = [[26, 0], [74, 76], [30, 168], [72, 232]];
        return `<canvas class="sky"></canvas><div class="scroll"><div class="sub">Добрый вечер, Лилия</div><h1>Ваше небо<br>ждёт <em>продолжения</em></h1>
          <button class="orbit glass" data-go="story"><div class="ring"><div style="${cover(STORIES[0])}">${figure("a1")}</div></div>
            <div><div class="sub">Глава 5 из 12</div><b>${STORIES[0].title}</b><span class="pill">Продолжить</span></div></button>
          <div class="sub" style="margin-top:22px;letter-spacing:.2em;text-transform:uppercase">Созвездие историй</div>
          <div class="const"><svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="26,11 74,34 30,62 72,81" fill="none" stroke="#d4af6a" stroke-opacity=".45" stroke-width=".4" stroke-dasharray="1.2 1.2"/></svg>
            ${STORIES.map((s, i) => `<button class="star" data-go="story" style="left:${pos[i][0]}%;top:${pos[i][1]}px"><div class="orb" style="${cover(s)}">${figure("as" + i)}</div><b>${s.title}</b><span>${s.genre}</span></button>`).join("")}</div>
        </div>${astral.dock("home")}`;
      },
      catalog() {
        return `<canvas class="sky"></canvas><div class="scroll"><h1>Истории</h1>
          <div class="chips">${["Все", "Романтика", "Фэнтези", "Драма", "Мистика"].map((g, i) => `<span class="chip ${i === 0 ? "on" : ""}">${g}</span>`).join("")}</div>
          ${STORIES.map((s, i) => `<button class="row glass" data-go="story"><div class="orb" style="${cover(s)}">${figure("ac" + i)}</div><div style="flex:1;min-width:0"><b>${s.title}</b><div class="sub">${s.genre} · ${s.chapters} глав</div></div><span style="color:var(--gold)">→</span></button>`).join("")}
        </div>${astral.dock("catalog")}`;
      },
      story() {
        const s = STORIES[0];
        return `<canvas class="sky"></canvas><div class="scroll" style="text-align:center"><div class="big-orb" style="${cover(s)}">${figure("ab")}</div>
          <h1 style="margin-top:22px">${s.title}</h1><div class="sub" style="margin-top:4px">${s.genre} · ${s.blurb}</div>
          <button class="pill" data-go="reader" style="margin-top:14px;padding:10px 22px;font-size:13px">Продолжить с главы 5</button>
          <ol class="path" style="text-align:left"><li>Приглашение<small>глава 1 · пройдена</small></li><li>Зал зеркал<small>глава 2 · пройдена</small></li><li>Письмо без подписи<small>глава 3 · пройдена</small></li><li>Маскарад<small>глава 5 · вы здесь</small></li><li class="next">Ключ<small>глава 6 · 3 ключа</small></li></ol>
        </div>${astral.dock("")}`;
      },
      reader(ctx) {
        const items = [["Выйти", 8], ["Назад", 22], ["Журнал", 36], ["Авто", 50], ["Пере­мотка", 64], ["Скрыть", 78], ["Опции", 92]];
        return `<div class="rd"><div class="bg" style="${hall}"></div><canvas class="sky" style="opacity:.5"></canvas><div class="sprite">${figure("ar", "#2c2019", "#e9d9b8")}</div>
          <div class="dots">${LINES.map((_, i) => `<i class="${i <= ctx.index ? "on" : ""}"></i>`).join("")}</div>
          ${ctx.menu ? `<div class="arc">${items.map(([t, x], i) => `<button class="glass" style="left:${x}%;top:${Math.round(34 - Math.sin((i / 6) * Math.PI) * 34)}px">${t}</button>`).join("")}</div>` : ""}
          <button class="taphint" data-act="menu" aria-label="Открыть меню"></button>
          ${ctx.line.choice
            ? `<div class="opts"><h4>${ctx.line.choice}</h4>${ctx.line.options.map((o) => `<button class="opt glass" data-act="next">${o.t}${o.cost ? `<small>✦ ${o.cost}</small>` : ""}</button>`).join("")}</div>`
            : `<button class="say glass" data-act="next">${ctx.line.who ? `<div class="who">${ctx.line.who}</div>` : ""}<p class="${ctx.line.thought ? "thought" : ""}">${ctx.line.text}</p></button>`}
        </div>`;
      },
      profile() {
        return `<canvas class="sky"></canvas><div class="scroll" style="text-align:center"><div class="sub">Лилия</div><h1>Ваш путь</h1>
          <div class="lvl"><div><b>7</b><span>уровень · 640 / 1000</span></div></div>
          <div class="tiles"><div class="glass"><b>340</b>Зёрна</div><div class="glass"><b>25</b>Карты</div><div class="glass"><b>12</b>Ключи</div></div>
          <button class="row glass" style="margin-top:14px"><div style="flex:1"><b>Коллекции</b><div class="sub">5 финалов · 14 иллюстраций</div></div><span style="color:var(--gold)">→</span></button>
          <button class="row glass"><div style="flex:1"><b>Дар дня</b><div class="sub">третий день подряд</div></div><span class="pill" style="margin:0">Забрать</span></button>
        </div>${astral.dock("profile")}`;
      },
    },
  };

  // =====================================================================================
  // 3. Кинозал — cinema: full-bleed posters, big italics, subtitles instead of a text box.
  // =====================================================================================
  const cinema = {
    name: "Кинозал", tagline: "Кино: афиши во весь экран, крупный курсив, субтитры",
    title: "Кинозал",
    pitch: "Приложение как премьерный показ. Истории — афиши на всю ширину, заголовки — крупным курсивом внахлёст на изображение, диалог — субтитры поверх сцены без рамки. Самый современный и «дорогой» вариант.",
    facts: [
      ["Композиция", "Изображение во весь экран, текст поверх. Горизонтальные ленты, жёсткая левая ось."],
      ["Шрифт", "Playfair Display — жирный курсив для заголовков, Golos Text для интерфейса."],
      ["Движение", "Плавные наезды камеры, каше (чёрные полосы) в игре, медленное проявление."],
      ["Риск", "Держится на качестве афиш и фонов: слабая иллюстрация будет заметна сразу."],
    ],
    css: `
.v3 { --disp: "Playfair Display", Georgia, serif; font-family: "Golos Text", system-ui, sans-serif; color: var(--text); height: 100%; position: relative; background: #100d0b; }
.v3 .scroll { position: absolute; inset: 0 0 54px; overflow-y: auto; }
.v3 .poster { position: relative; height: 430px; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 20px 22px; width: 100%; text-align: left; }
.v3 .poster .art { position: absolute; inset: 0; } .v3 .poster .art svg { position: absolute; right: -4%; bottom: 0; height: 92%; }
.v3 .poster::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,13,11,.2) 0%, transparent 30%, rgba(16,13,11,.55) 62%, #100d0b 100%); }
.v3 .poster > * { position: relative; z-index: 1; } .v3 .poster .art { z-index: 0; }
.v3 .kicker { font-size: 10.5px; letter-spacing: .24em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.v3 h1 { font-family: var(--disp); font-style: italic; font-weight: 700; font-size: 46px; line-height: .92; margin: 6px 0 8px; letter-spacing: -.01em; text-wrap: balance; }
.v3 .meta { font-size: 12px; color: var(--muted); }
.v3 .cta { margin-top: 14px; display: flex; gap: 8px; }
.v3 .btn { padding: 12px 18px; background: var(--text); color: #100d0b; font-weight: 700; font-size: 13px; border-radius: 2px; }
.v3 .btn.ghost { background: rgba(243,236,224,.12); color: var(--text); font-weight: 500; }
.v3 .progress { height: 2px; background: rgba(243,236,224,.2); margin-top: 14px; } .v3 .progress i { display: block; width: 42%; height: 100%; background: var(--gold); }
.v3 .strip-title { display: flex; justify-content: space-between; align-items: baseline; padding: 18px 20px 10px; font-weight: 600; font-size: 15px; } .v3 .strip-title span { font-size: 12px; color: var(--muted); font-weight: 400; }
.v3 .strip { display: flex; gap: 10px; overflow-x: auto; padding: 0 20px 6px; }
.v3 .tile { flex: none; width: 112px; text-align: left; } .v3 .tile .art { height: 160px; position: relative; overflow: hidden; border-radius: 2px; } .v3 .tile .art svg { position: absolute; inset: 12% 6% 0; width: 88%; height: 88%; }
.v3 .tile b { display: block; font-size: 13px; margin-top: 7px; font-weight: 600; line-height: 1.2; } .v3 .tile span { font-size: 11px; color: var(--muted); }
.v3 .tabbar { position: absolute; left: 0; right: 0; bottom: 0; height: 54px; display: flex; background: #0c0a08; border-top: 1px solid #2a231c; }
.v3 .tabbar button { flex: 1; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); } .v3 .tabbar button.on { color: var(--text); box-shadow: inset 0 2px 0 var(--gold); }
.v3 .head { padding: 52px 20px 0; } .v3 .head h1 { font-size: 40px; }
.v3 .tabs { display: flex; gap: 18px; overflow-x: auto; padding: 4px 20px 0; border-bottom: 1px solid #2a231c; } .v3 .tabs span { flex: none; padding: 10px 0; font-size: 13px; color: var(--muted); } .v3 .tabs span.on { color: var(--text); box-shadow: inset 0 -2px 0 var(--gold); }
.v3 .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 10px; padding: 16px 20px; } .v3 .grid .tile { width: auto; } .v3 .grid .tile .art { height: 200px; }
.v3 .eps { padding: 4px 20px 20px; } .v3 .ep { display: grid; grid-template-columns: 26px 96px 1fr; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid #2a231c; width: 100%; text-align: left; }
.v3 .ep i { font-family: var(--disp); font-style: italic; font-size: 20px; color: var(--gold-dim); } .v3 .ep .art { height: 56px; border-radius: 2px; } .v3 .ep b { font-size: 14px; font-weight: 600; display: block; } .v3 .ep span { font-size: 11.5px; color: var(--muted); }
.v3 .ep.now i { color: var(--gold); }
.v3 .rd { position: absolute; inset: 0; background: #000; }
.v3 .rd .frame { position: absolute; inset: 9% 0 9%; overflow: hidden; } .v3 .rd .bg { position: absolute; inset: 0; }
.v3 .rd .sprite { position: absolute; right: -4%; bottom: -6%; height: 104%; aspect-ratio: 200/460; } .v3 .rd .sprite svg { width: 100%; height: 100%; }
.v3 .rd .shade { position: absolute; inset: 40% 0 0; background: linear-gradient(180deg, transparent, rgba(0,0,0,.82)); }
.v3 .subt { position: absolute; left: 22px; right: 22px; bottom: 13%; text-align: center; }
.v3 .subt .who { font-size: 10.5px; letter-spacing: .26em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin-bottom: 8px; }
.v3 .subt p { margin: 0; font-size: 17px; line-height: 1.38; font-weight: 500; text-shadow: 0 2px 12px #000, 0 0 2px #000; } .v3 .subt p.thought { font-family: var(--disp); font-style: italic; font-weight: 500; font-size: 18px; }
.v3 .opts { position: absolute; left: 22px; right: 22px; bottom: 12%; } .v3 .opts h4 { margin: 0 0 10px; font-family: var(--disp); font-style: italic; font-size: 24px; font-weight: 700; }
.v3 .opt { display: flex; justify-content: space-between; width: 100%; text-align: left; padding: 13px 0; border-top: 1px solid rgba(243,236,224,.28); font-size: 15px; font-weight: 500; } .v3 .opt small { color: var(--gold); }
.v3 .hud { position: absolute; top: 9%; left: 0; right: 0; display: flex; justify-content: space-between; padding: 12px 14px; background: linear-gradient(180deg, rgba(0,0,0,.75), transparent); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; font-weight: 600; }
.v3 .hud span.on { color: var(--gold); }
.v3 .taphint { position: absolute; top: 0; left: 0; right: 0; height: 26%; }
.v3 .num { font-family: var(--disp); font-style: italic; font-weight: 700; font-size: 84px; line-height: .8; } .v3 .stat { padding: 0 20px; display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: end; margin-top: 18px; }
.v3 .ledger { margin: 20px 20px 0; border-top: 1px solid #2a231c; } .v3 .ledger div { display: flex; justify-content: space-between; padding: 13px 0; border-bottom: 1px solid #2a231c; font-size: 14px; } .v3 .ledger b { font-variant-numeric: tabular-nums; }`,
    bar(active) {
      return `<nav class="tabbar"><button data-go="home" class="${active === "home" ? "on" : ""}">Сегодня</button><button data-go="catalog" class="${active === "catalog" ? "on" : ""}">Каталог</button><button data-go="profile" class="${active === "profile" ? "on" : ""}">Профиль</button></nav>`;
    },
    screens: {
      home() {
        const s = STORIES[0];
        return `<div class="scroll"><button class="poster" data-go="story"><div class="art" style="${cover(s)}">${figure("k1", "#231a15", "#e9d9b8")}</div>
            <div class="kicker">Продолжить · глава 5</div><h1>${s.title}</h1><div class="meta">${s.genre} · осталось 7 глав</div><div class="progress"><i></i></div></button>
          <div class="strip-title">Новые истории<span>все →</span></div>
          <div class="strip">${STORIES.slice(1).map((x, i) => `<button class="tile" data-go="story"><div class="art" style="${cover(x)}">${figure("kt" + i)}</div><b>${x.title}</b><span>${x.genre}</span></button>`).join("")}</div>
          <div class="strip-title">Для вас<span>все →</span></div>
          <div class="strip" style="padding-bottom:20px">${STORIES.map((x, i) => `<button class="tile" data-go="story"><div class="art" style="${cover(x)}">${figure("ku" + i)}</div><b>${x.title}</b><span>${x.chapters} глав</span></button>`).join("")}</div>
        </div>${cinema.bar("home")}`;
      },
      catalog() {
        return `<div class="scroll"><div class="head"><div class="kicker">Каталог</div><h1>Все истории</h1></div>
          <div class="tabs">${["Все", "Романтика", "Фэнтези", "Драма", "Мистика"].map((g, i) => `<span class="${i === 0 ? "on" : ""}">${g}</span>`).join("")}</div>
          <div class="grid">${STORIES.map((x, i) => `<button class="tile" data-go="story"><div class="art" style="${cover(x)}">${figure("kc" + i)}</div><b>${x.title}</b><span>${x.genre} · ${x.chapters} глав</span></button>`).join("")}</div>
        </div>${cinema.bar("catalog")}`;
      },
      story() {
        const s = STORIES[0];
        const eps = [["3", "Письмо без подписи", "пройдена"], ["4", "Сад", "пройдена"], ["5", "Маскарад", "вы остановились здесь"], ["6", "Ключ", "откроется за 3 ключа"]];
        return `<div class="scroll"><div class="poster" style="height:380px"><div class="art" style="${cover(s)}">${figure("ks", "#231a15", "#e9d9b8")}</div>
            <div class="kicker">${s.genre} · 16+</div><h1>${s.title}</h1><div class="meta">${s.blurb}</div>
            <div class="cta"><button class="btn" data-go="reader">▶ Глава 5</button><button class="btn ghost">В избранное</button></div></div>
          <div class="strip-title">Сезон 1<span>12 глав</span></div>
          <div class="eps">${eps.map((e, i) => `<button class="ep ${i === 2 ? "now" : ""}" data-go="reader"><i>${e[0]}</i><div class="art" style="${cover(STORIES[i % 4])}"></div><div><b>${e[1]}</b><span>${e[2]}</span></div></button>`).join("")}</div>
        </div>${cinema.bar("")}`;
      },
      reader(ctx) {
        return `<div class="rd"><div class="frame"><div class="bg" style="${hall}"></div><div class="sprite">${figure("kr", "#231a15", "#e9d9b8")}</div><div class="shade"></div></div>
          ${ctx.menu ? `<div class="hud"><span>‹ Выйти</span><span>Назад</span><span>Журнал</span><span class="on">Авто</span><span>▸▸</span><span>Скрыть</span><span>⚙</span></div>` : ""}
          <button class="taphint" data-act="menu" aria-label="Открыть меню"></button>
          ${ctx.line.choice
            ? `<div class="opts"><h4>${ctx.line.choice}</h4>${ctx.line.options.map((o) => `<button class="opt" data-act="next">${o.t}${o.cost ? `<small>✦ ${o.cost}</small>` : ""}</button>`).join("")}</div>`
            : `<button class="subt" data-act="next">${ctx.line.who ? `<div class="who">${ctx.line.who}</div>` : ""}<p class="${ctx.line.thought ? "thought" : ""}">${ctx.line.text}</p></button>`}
        </div>`;
      },
      profile() {
        return `<div class="scroll"><div class="head"><div class="kicker">Профиль</div><h1>Лилия</h1></div>
          <div class="stat"><div class="num">7</div><div><b style="font-size:14px">уровень</b><div class="meta">640 из 1000 опыта до следующего</div><div class="progress"><i style="width:64%"></i></div></div></div>
          <div class="ledger"><div>Зёрна<b>340</b></div><div>Карты<b>25</b></div><div>Ключи<b>12</b></div><div>Финалов открыто<b>5 / 11</b></div><div>Иллюстраций<b>14 / 30</b></div></div>
          <div class="cta" style="padding:0 20px"><button class="btn">Забрать дар дня</button><button class="btn ghost">Коллекции</button></div>
        </div>${cinema.bar("profile")}`;
      },
    },
  };

  const variants = [grimoire, astral, cinema];

  function mount(stage, index, screen, onScreen) {
    const v = variants[index];
    let style = document.getElementById("app-variant-css");
    if (!style) { style = document.createElement("style"); style.id = "app-variant-css"; document.head.appendChild(style); }
    style.textContent = v.css;
    const reader = { index: 0, menu: false };

    stage.innerHTML = `
      <div class="phone-zone"><div class="phone"><div class="screen"><div class="v${index + 1}" id="app-root"></div></div></div></div>
      <aside class="notes"><h2>${v.title}</h2><p>${v.pitch}</p>
        <h3>Экраны — нажмите, чтобы открыть</h3><div class="screens" id="screen-buttons"></div>
        <h3>Чем отличается</h3><ul class="facts">${v.facts.map(([a, b]) => `<li>${a}<span>${b}</span></li>`).join("")}</ul>
        <div class="demo-note">Телефон живой: нажимайте на истории, вкладки и кнопки. На игровом экране нажмите на текст, чтобы листать реплики, и на верхнюю часть экрана — чтобы вызвать меню. Названия и реплики демонстрационные.</div>
      </aside>`;
    const root = stage.querySelector("#app-root");
    const buttons = stage.querySelector("#screen-buttons");

    function show(name) {
      screen = name; onScreen(name);
      const isReader = name === "reader" || name === "menu";
      if (name === "menu") reader.menu = true;
      if (name === "reader") reader.menu = false;
      const ctx = { index: reader.index, line: LINES[reader.index], menu: reader.menu };
      root.innerHTML = isReader ? v.screens.reader(ctx) : v.screens[name]();
      if (v.after) v.after(root);
      buttons.innerHTML = SCREENS.map(([id, label]) => `<button data-screen="${id}" aria-pressed="${id === name}">${label}</button>`).join("");
    }
    root.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]"); const act = e.target.closest("[data-act]");
      if (go) { reader.index = 0; return show(go.dataset.go); }
      if (!act) return;
      if (act.dataset.act === "menu") return show(reader.menu ? "reader" : "menu");
      reader.index = (reader.index + 1) % LINES.length; reader.menu = false; show("reader");
    });
    buttons.addEventListener("click", (e) => { const b = e.target.closest("[data-screen]"); if (b) show(b.dataset.screen); });
    show(screen in v.screens || screen === "menu" ? screen : "home");
  }

  window.ArcanaApp = { variants, mount };
})();
