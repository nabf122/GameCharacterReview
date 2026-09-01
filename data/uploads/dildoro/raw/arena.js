/* ══ 아레나(PVP) — 알파 ═══════════════════════════════════════════════════════
 *
 * 5 대 5 한 판을 프레임 단위로 돌려 «누가 이기나»를 본다. 솔로 계산기와 **딴 물건**이다:
 *
 *   솔로   내 덱 하나가 보스에게 180초 동안 넣는 총딜
 *   아레나 두 덱이 서로 쏜다 — 죽는 순서와 남은 체력이 결과다
 *
 * 그래서 한 화면에 끼워 넣지 않고 파일을 갈라 둔다. 알파를 걷을 때 `arena.js`·`arena.css`와
 * `index.html`의 패널 한 덩이만 지우면 흔적이 남지 않는다.
 *
 * **`app.js`의 것을 빌려 쓴다** — `ROSTER`·`byName`·`artSrc`·`el`·`T`·`selectEl`·`MAPS`는
 * 전역 스크립트라 이름 그대로 보인다. 새로 만들지 않는 이유는 하나다: 니케 그림·이름·
 * 큐브 표가 두 벌이 되면 한쪽만 갱신되는 날이 온다.
 *
 * 상태는 `nikke.arena` 한 열쇠에 따로 담는다 — 솔로 편성(state)에 섞으면 프리셋·기록·공유가
 * 이 알파를 짊어진다.
 */
(() => {
  "use strict";

  const KEY = "nikke.arena";
  const SLOTS = 5;
  const FPS = 30;
  /** 챔피언 아레나는 400 고정이다 — 그 버튼만 400을 박고, 평소에는 **내 동기화 레벨**로
   *  양쪽을 채운다(유저 지시 2026-08-31). 어느 쪽이든 손으로 고칠 수 있다. */
  const LV_CHAMP = 400;
  /** 계정에서 받은 동기화 레벨. 계정이 없으면 400을 기본으로 둔다. */
  const syncLevel = () => {
    const v = typeof activeRec === "function"
      ? activeRec()?.fetched?._account?.synchro_level : null;
    return Number.isFinite(v) && v > 0 ? Math.round(v) : LV_CHAMP;
  };

  const blank = () => ({ names: Array(SLOTS).fill(null), cubes: {}, level: syncLevel() });
  let A = null;                 // { def, atk, skill, res, fixture }
  let picking = null;           // { side, idx } — 니케 고르기 시트가 채우는 자리
  let dragCube = null;          // 서랍에서 끌고 있는 큐브 이름

  const load_ = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && raw.def && raw.atk) return raw;
    } catch { /* 깨졌으면 새로 */ }
    return { def: blank(), atk: blank(), skill: 10, res: null };
  };
  const save_ = () => {
    try {
      // 결과는 안 담는다 — 20KB짜리가 매 저장마다 오간다. 편성만 남기면 다시 돌리면 된다.
      const { def, atk, skill } = A;
      localStorage.setItem(KEY, JSON.stringify({ def, atk, skill }));
    } catch { /* 사생활 모드 */ }
  };

  const sideOf = (s) => (s === "def" ? A.def : A.atk);
  const num = (v, lo, hi, fb) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fb;
  };

  // ── 편성 ────────────────────────────────────────────────────────────────
  /** 한 팀 판. 방어가 위, 공격이 아래 — 인게임 전투 화면과 같은 배치다(유저 지시). */
  function renderSide(side) {
    const box = document.getElementById(side === "def" ? "arena-def" : "arena-atk");
    if (!box) return;
    const d = sideOf(side);
    box.textContent = "";

    const head = el("div", "arena-side-head");
    head.append(el("b", null, side === "def" ? T("방어 (상대)") : T("공격 (나)")));
    head.append(el("span", "sub", T("{v}명", { v: d.names.filter(Boolean).length })));

    const lv = el("div", "arena-lv");
    lv.append(el("label", null, T("레벨")));
    const inp = el("input");
    inp.type = "number"; inp.min = "1"; inp.max = "999"; inp.value = String(d.level);
    inp.onchange = () => { d.level = num(inp.value, 1, 999, syncLevel()); inp.value = String(d.level); save_(); };
    lv.append(inp);
    // 챔레나는 **양쪽 다** 400이다 — 한쪽만 박으면 반쪽짜리 판이 된다.
    const q = el("button", "btn btn-ghost", T("챔레나"));
    q.type = "button";
    q.title = T("챔피언 아레나 — 양쪽 모두 400 고정");
    q.onclick = () => { A.def.level = LV_CHAMP; A.atk.level = LV_CHAMP; renderSide("def"); renderSide("atk"); save_(); };
    lv.append(q);
    const sy = el("button", "btn btn-ghost", T("싱크"));
    sy.type = "button";
    sy.title = T("내 동기화 레벨로 되돌립니다");
    sy.onclick = () => { d.level = syncLevel(); renderSide(side); save_(); };
    lv.append(sy);
    head.append(lv);
    box.append(head);

    const slots = el("div", "arena-slots");
    for (let i = 0; i < SLOTS; i++) slots.append(slotEl(side, i));
    box.append(slots);
    box.append(cubeBar(side));
  }

  /** 아레나 카드 — **레이드 카드의 요소를 그대로 쓴다**(`card()`가 만드는 `.nk`).
   *  자리 배치는 **인게임 아레나 카드 그대로**다(유저가 준 화면 2026-08-31):
   *
   *      ┌─────────────────────┐
   *      │ 속성    ★★★  코어  │  ← 위 띠
   *      │ [버스트]            │
   *      │        얼굴         │
   *      │ LV                  │
   *      │ 597          [큐브] │
   *      └─────────────────────┘
   *
   *  크기·자리는 `arena.css`가 맡고, 여기서는 카드가 안 들고 있는 둘 — **팀 레벨**과
   *  **그 자리의 큐브** — 만 얹는다. */
  function arenaCard(side, name) {
    const box = el("div", "arena-card has");
    const rec = byName.get(name);
    if (rec?.rare) box.dataset.rare = rec.rare;
    const fig = card(name, { inSlot: true });
    // 얼굴 크기를 맞춘다. 초상화(256×512)는 니케마다 얼굴 위치·크기가 달라서 정사각으로
    // 자르면 누구는 이마만, 누구는 어깨까지 들어온다(유저 지적 2026-08-31 «얼굴크기
    // 안맞아»). 인게임 스쿼드 목록이 쓰는 **정사각 얼굴 카드**(`rec.face`, 128×128)로
    // 갈아 끼우면 다섯 장이 같은 크기로 선다.
    const im = fig.querySelector(".nk-art img");
    if (im && rec && (rec.face || rec.img)) im.src = faceSrc(rec, name);
    box.append(fig);

    const lv = el("span", "ac-lv");
    lv.append(el("i", null, "LV"));
    lv.append(el("b", null, String(sideOf(side).level)));
    box.append(lv);

    // 큐브는 인게임처럼 **카드 오른쪽 아래**에 선다. 레벨은 아래 칸에서 고른다.
    const cur = sideOf(side).cubes[name];
    if (cur) {
      const file = uiIcon("cube", cur.name);
      const cb = el("span", "ac-cube");
      const ci = el("img");
      ci.src = file ? `image/ui/${file}` : "";
      ci.alt = "";
      ci.draggable = false;
      cb.append(ci);
      // 레벨 숫자는 안 적는다(유저 지시 2026-08-31) — 레벨은 아래 칸에서 고르고 본다.
      cb.title = `${T(cur.name)} — ${cubeEffect(cur.name, cur.level)}`;
      box.append(cb);
    }
    return box;
  }

  function slotEl(side, i) {
    const d = sideOf(side);
    const name = d.names[i];
    const wrap = el("div", "arena-slot");

    const box = name ? arenaCard(side, name) : el("div", "arena-card");
    if (name) {
      const x = el("button", "x", "✕");
      x.type = "button";
      x.title = T("비우기");
      x.onclick = (e) => { e.stopPropagation(); d.names[i] = null; delete d.cubes[name]; renderSide(side); save_(); };
      box.append(x);
    } else {
      box.append(el("span", "empty", "+"));
    }
    box.onclick = () => openPick(side, i);
    box.ondragover = (e) => { if (dragCube && name) { e.preventDefault(); box.classList.add("drop"); } };
    box.ondragleave = () => box.classList.remove("drop");
    box.ondrop = (e) => { box.classList.remove("drop"); dropCube(e, side, i); };
    wrap.append(box);
    wrap.append(cubeCellEl(side, i));
    return wrap;
  }

  /** 그 자리의 큐브 칸 — **레벨 고르개**다. 큐브 그림은 인게임처럼 카드 오른쪽 아래에
   *  이미 서 있으므로(arenaCard) 여기서 또 그리지 않는다. 큐브를 바꾸는 것은 서랍에서
   *  끌어다 놓거나 서랍 칩을 눌러서 한다. */
  function cubeCellEl(side, i) {
    const d = sideOf(side);
    const name = d.names[i];
    const cur = name ? d.cubes[name] : null;
    const cell = el("div", "arena-cube" + (cur ? " on" : ""));
    if (!name) {
      cell.append(el("span", "none", T("빈 칸")));
      return cell;
    }
    if (cur) {
      const tip = `${T(cur.name)} — ${cubeEffect(cur.name, cur.level)}`;
      const lv = selectEl(Array.from({ length: 15 }, (_, k) => [k + 1, `Lv${k + 1}`]), cur.level, (v) => {
        d.cubes[name] = { name: cur.name, level: Number(v) };
        renderSide(side); save_();
      });
      lv.title = tip;
      cell.append(lv);
      const x = el("button", "cube-x", "✕");
      x.type = "button";
      x.title = T("큐브 빼기");
      x.onclick = () => { delete d.cubes[name]; renderSide(side); save_(); };
      cell.append(x);
    } else {
      const hint = el("span", "none", T("큐브 없음"));
      hint.title = T("아래 서랍에서 큐브를 끌어다 놓거나 눌러서 끼웁니다");
      cell.append(hint);
    }
    cell.ondragover = (e) => { if (dragCube) { e.preventDefault(); cell.classList.add("drop"); } };
    cell.ondragleave = () => cell.classList.remove("drop");
    cell.ondrop = (e) => { cell.classList.remove("drop"); dropCube(e, side, i); };
    return cell;
  }

  function dropCube(e, side, i) {
    e.preventDefault();
    const d = sideOf(side);
    const name = d.names[i];
    const cube = dragCube || e.dataTransfer?.getData("text/plain");
    if (!name || !cube) return;
    d.cubes[name] = { name: cube, level: d.cubes[name]?.level ?? 15 };
    dragCube = null;
    renderSide(side); save_();
  }

  /** 큐브 서랍 — **그림으로** 늘어놓는다. 카드나 큐브 칸으로 끌어다 놓으면 끼워진다.
   *  터치에서는 끌기가 안 되니 **누르면 큐브가 없는 첫 자리**에 들어간다. */
  function cubeBar(side) {
    const bar = el("div", "arena-cubebar");
    bar.append(el("span", "arena-note", T("큐브를 끌어다 카드에 놓으세요")));
    for (const c of cubeChoices().ordered) {
      const file = uiIcon("cube", c);
      const chip = el("button", "cube-chip");
      chip.type = "button";
      chip.draggable = true;
      chip.title = `${T(c)} — ${cubeEffect(c, 15)}`;
      if (file) {
        const im = el("img");
        im.src = `image/ui/${file}`; im.alt = c; im.draggable = false;
        chip.append(im);
      } else {
        chip.append(el("span", null, T(c).slice(0, 2)));
      }
      chip.ondragstart = (e) => { dragCube = c; e.dataTransfer.setData("text/plain", c); };
      chip.ondragend = () => { dragCube = null; };
      chip.onclick = () => {
        const d = sideOf(side);
        const at = d.names.findIndex((n) => n && !d.cubes[n]);
        const idx = at >= 0 ? at : d.names.findIndex(Boolean);
        if (idx < 0) return;
        d.cubes[d.names[idx]] = { name: c, level: 15 };
        renderSide(side); save_();
      };
      bar.append(chip);
    }
    return bar;
  }

  // ── 니케 고르기 ─────────────────────────────────────────────────────────
  // **솔로가 쓰는 시트를 그대로 빌린다**(검색·버스트·속성 칩·카드 목록). 다만 상태는
  // 갈라 둔다 — 필터도 꽂는 자리도 아레나 것이다. 솔로 덱은 손대지 않는다
  // (유저 지시 2026-08-31: «솔로 것을 쓰더라도 거기 영향 주면 안 된다»).
  let pickFilter = null;
  function openPick(side, i) {
    if (typeof openDeckPick !== "function") return;
    pickFilter ||= defaultFilter();
    openDeckPick(0, i, {
      filter: pickFilter,
      // **문장 하나가 열쇠 하나다** — `T()` 안에서 고르면 뽑개가 앞의 것만 가져가서
      // 나머지 한 줄이 번역 없이 남는다(web/i18n_tool.py).
      title: side === "def" ? T("방어 {v}번 자리", { v: i + 1 })
                            : T("공격 {v}번 자리", { v: i + 1 }),
      // 아레나는 위아래 두 덱뿐이고, **같은 니케가 양쪽에 서도 된다**(인게임과 같다).
      // 잠그는 것은 «같은 팀 안»뿐이다.
      used: () => new Map(sideOf(side).names.filter(Boolean).map((n) => [n, 1])),
      place: (name) => {
        const d = sideOf(side);
        const dup = d.names.indexOf(name);
        if (dup >= 0) d.names[dup] = null;
        d.names[i] = name;
        renderSide(side); save_();
      },
    });
  }

  // ── 돌리기 ──────────────────────────────────────────────────────────────
  /** 그 편의 **니케별 스킬 레벨** — 계정에서 읽는다(유저 지시 2026-08-31 «애들
   *  스킬레벨을 가져와서 써야지»). 엔진 2.5부터 니케마다 따로 받는다:
   *  `{니케명: {s1, s2, ub}}`. 계정에 없는 니케는 엔진이 `skill_level`(10)로 떨어뜨린다. */
  function skillsOf(names) {
    const out = {};
    for (const n of names) {
      const sk = (typeof charSpec === "function" ? charSpec(n) : null)?.skill_levels;
      if (!sk) continue;
      out[n] = { s1: Number(sk["1"]) || 10, s2: Number(sk["2"]) || 10, ub: Number(sk["3"]) || 10 };
    }
    return out;
  }

  function payload() {
    const one = (d) => ({
      names: d.names.filter(Boolean),
      level: d.level,
      skills: skillsOf(d.names.filter(Boolean)),
      // 계정에 없는 니케의 뒷받침 값 — 엔진이 `skills`에 없는 이름에만 쓴다.
      skill_level: 10,
      cubes: Object.fromEntries(Object.entries(d.cubes).filter(([n]) => d.names.includes(n))),
    });
    // 표본 간격 3프레임 = 0.1초. 리플레이가 이 촘촘함을 쓴다 — 기본 15(0.5초)로 받으면
    // 재생이 계단처럼 튄다(코어 세션 안내 2026-08-31).
    return { attack: one(A.atk), defense: one(A.def), timeline_sample_frames: 3 };
  }

  function msg(text, kind) {
    const n = document.getElementById("arena-msg");
    if (!n) return;
    n.textContent = text || "";
    n.className = "acct-msg" + (kind ? " " + kind : "");
  }

  async function run() {
    if (A.atk.names.filter(Boolean).length === 0 || A.def.names.filter(Boolean).length === 0) {
      msg(T("양쪽에 니케를 넣어야 합니다."), "err");
      return;
    }
    msg(T("계산 중…"));
    try {
      const r = await fetch("/api/arena", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      A.res = j;
      msg("");
      renderRes();
    } catch (e) {
      // 엔진이 아직 아레나를 모르는 서버도 있다(501) — 그 문장을 그대로 보여 준다.
      msg(String(e.message || e), "err");
    }
  }

  // ── 결과 ────────────────────────────────────────────────────────────────
  const fmt = (v) => (v >= 1e8 ? `${(v / 1e8).toFixed(2)}억` : v >= 1e4 ? `${Math.round(v / 1e4)}만` : String(Math.round(v)));

  function renderRes() {
    const box = document.getElementById("arena-res");
    // `A`는 `ensure()`가 채운다 — 첫 진입에 상자를 접으려고 부를 때는 아직 없다(실측:
    // «null의 res를 읽을 수 없다»가 콘솔에 남았다).
    const res = A?.res;
    if (!box) return;
    box.textContent = "";
    // 결과·타임라인 자리는 **결과가 있을 때만** 편다 — 미리 잡아 두면 빈 상자가 화면
    // 절반을 먹는다(유저 지적 2026-08-31).
    const tl = document.querySelector(".arena-tl");
    const model = document.getElementById("arena-model");
    box.hidden = !res;
    if (tl) tl.hidden = !res;
    if (model) model.hidden = !res;
    if (!res) return;

    for (const side of ["attack", "defense"]) {
      const t = res[side] || {};
      const win = res.winner === side;
      const panel = el("div", "arena-team" + (win ? " win" : ""));
      const head = el("div", "arena-team-head");
      head.append(el("b", null, side === "attack" ? T("공격 (나)") : T("방어 (상대)")));
      head.append(el("span", "arena-badge", win ? T("승리") : T("패배")));
      head.append(el("span", "arena-note",
        T("풀버스트 {n}회", { n: t.full_bursts ?? 0 })));
      panel.append(head);

      // 팀 안에서 가장 큰 값에만 밑줄 — 인게임 전투 기록과 같은 읽는 법이다.
      const best = (k) => Math.max(0, ...(t.members || []).map((m) => m[k] || 0));
      const bd = best("damage_dealt"), bt = best("damage_taken"), bh = best("healed");

      for (const m of t.members || []) {
        const rec = byName.get(m.name);
        const row = el("div", "arena-mem" + (m.alive ? "" : " dead"));
        const face = el("div", "arena-face");
        // **얼굴 전용 그림**을 쓴다 — 초상화(256×512 전신)를 정사각으로 자르면 머리가
        // 잘린다(유저 지적 2026-08-31). `faceSrc`가 68×68 얼굴 카드를 준다.
        if (rec) { const im = el("img"); im.src = faceSrc(rec, m.name); im.alt = m.name; face.append(im); }
        row.append(face);

        const body = el("div", "arena-mem-body");
        const top = el("div", "arena-mem-top");
        if (rec?.element) {
          const b = el("span", "bdg bdg-code");
          const im = el("img"); im.src = `image/icon/${ELEMENT_ICON[rec.element] || ""}`; im.alt = rec.element;
          b.append(im); b.title = T(rec.element); top.append(b);
        }
        top.append(el("span", "nm", T(m.name)));
        const pct = Math.max(0, Math.min(100, Math.round((m.hp_pct ?? 0) * 100) / 100));
        top.append(el("span", "hp", m.alive ? `${pct}%` : T("전투 불능")));
        body.append(top);

        const bar = el("div", "arena-hpbar");
        const fill = el("i");
        fill.style.width = `${pct}%`;
        bar.append(fill);
        body.append(bar);

        const rows = el("div", "arena-rows");
        const line = (icon, label, val, isBest) => {
          const r = el("div", isBest && val > 0 ? "best" : null);
          r.append(el("em", null, icon));
          r.append(document.createTextNode(T(label)));
          r.append(el("span", null, fmt(val || 0)));
          return r;
        };
        rows.append(line("≡", "가한 대미지", m.damage_dealt, m.damage_dealt === bd));
        rows.append(line("🛡", "받은 대미지", m.damage_taken, m.damage_taken === bt));
        rows.append(line("✳", "회복", m.healed, m.healed === bh));
        body.append(rows);
        row.append(body);
        panel.append(row);
      }
      // 공격이 왼쪽 — 인게임 전투 기록과 같은 자리다.
      if (side === "attack") box.prepend(panel);
      else box.append(panel);
    }

    const foot = document.getElementById("arena-end");
    if (foot) {
      foot.textContent = T("{sec}초에 끝났습니다 — {who} 승리", {
        sec: (res.end_sec ?? 0).toFixed(1),
        who: res.winner === "attack" ? T("공격") : T("방어"),
      });
    }
    renderModel(res);
    drawTimeline(res);
  }

  /** 엔진이 준 «미반영» 목록. **내부 이름은 걷어내고 낸다** — 파일 경로·옵션 이름·문서
   *  이름은 우리 사정이지 유저가 볼 것이 아니다(유저 지적 2026-08-31: «data/arena.json»이
   *  화면에 그대로 떴다). 걸러 낼 것: 경로(`a/b.json`)·문서(`*.md`)·snake_case 식별자. */
  const scrub = (t) => String(t)
    .replace(/\(?\s*[\w./-]+\.(json|md|py|rs|ts|js)[^)]*\)?/g, "")
    .replace(/\(([^)]*[a-z]+_[a-z]+[^)]*)\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[—-]\s*$/, "")
    .trim();

  function renderModel(res) {
    const box = document.getElementById("arena-model");
    if (!box) return;
    box.textContent = "";
    const list = (res?._model?.["미반영"] || []).map(scrub).filter(Boolean);
    if (!list.length) return;
    box.append(el("b", null, T("알파 — 아직 계산에 안 들어가는 것")));
    const ul = el("ul");
    for (const t of list) ul.append(el("li", null, t));
    box.append(ul);
    // 엔진이 붙여 보내는 «보정» 문장은 **안 쓴다** — «앞으로 이렇게 맞춰 가겠다»는
    // 우리 일정이라 유저에게는 «지금 못 믿는다»만 남는다(유저 지시 2026-08-31).
  }

  // ── 타임라인 ────────────────────────────────────────────────────────────
  // PVE 뷰어(`timeline.js`)와 **다른 그림**이다: 저기는 한 팀의 딜 흐름이고, 여기는
  // 두 팀의 게이지와 멤버 체력이 함께 내려가는 판이다. 그래서 따로 그린다.
  const EV_COLOR = {
    burst_cast: "#3d86d8", full_burst: "#d08a1e", gauge_full: "#3aa86e",
    cover_break: "#8a5fd0", death: "#e0344f",
  };
  const EV_LABEL = {
    burst_cast: "버스트 시전", full_burst: "풀버스트", gauge_full: "게이지 만충",
    cover_break: "엄폐 파괴", death: "전투 불능",
  };

  function drawTimeline(res) {
    const cv = document.getElementById("arena-tl");
    const tl = res?.timeline;
    if (!cv || !tl) return;
    const frames = tl.sample_frames || [];
    if (!frames.length) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.parentElement.clientWidth || 900;
    const H = 260, PAD_L = 92, PAD_R = 12, PAD_T = 26, PAD_B = 22;
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = w + "px"; cv.style.height = H + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    g.font = "11px Pretendard, system-ui, sans-serif";
    g.textBaseline = "middle";
    // 색은 **그 판에서 가져온다**(도로롱은 흰 종이·검은 잉크다 — 밝은 잉크를 박아 두면
    // 글자가 안 보인다, 유저 지적 2026-08-31). 진하기는 알파로 조절한다.
    const tok = (n, fb) => getComputedStyle(cv).getPropertyValue(n).trim() || fb;
    const INK = tok("--color-stage-ink", "#e8eaf0");
    const C_ATK = tok("--arena-mine", "#4ea1ff");
    const C_DEF = tok("--arena-foe", "#ff5470");

    const last = frames[frames.length - 1] || 1;
    const x = (f) => PAD_L + (f / last) * (w - PAD_L - PAD_R);

    // 눈금 — 5초마다
    g.strokeStyle = INK; g.fillStyle = INK; g.globalAlpha = 0.14;
    for (let s = 0; s <= last / FPS; s += 5) {
      const px = x(s * FPS);
      g.beginPath(); g.moveTo(px, PAD_T); g.lineTo(px, H - PAD_B); g.stroke();
      g.globalAlpha = 0.5;
      g.fillText(`${s}초`, px + 3, H - PAD_B + 9);
      g.globalAlpha = 0.14;
    }
    g.globalAlpha = 1;

    // 위 절반 = 팀 게이지(0~100), 아래 절반 = 멤버 체력(%)
    const midY = PAD_T + (H - PAD_T - PAD_B) * 0.42;
    const gaugeY = (v) => PAD_T + (1 - Math.max(0, Math.min(100, v)) / 100) * (midY - PAD_T);
    const SIDES = [["attack", C_ATK, "공격"], ["defense", C_DEF, "방어"]];
    g.fillStyle = INK; g.globalAlpha = 0.55;
    g.fillText(T("버스트 게이지"), 8, PAD_T + 6);
    g.globalAlpha = 1;
    for (const [side, color] of SIDES) {
      const ser = (tl.gauge || {})[side] || [];
      g.strokeStyle = color; g.lineWidth = 1.5;
      g.beginPath();
      ser.forEach((v, i) => (i ? g.lineTo(x(frames[i]), gaugeY(v)) : g.moveTo(x(frames[i]), gaugeY(v))));
      g.stroke();
    }

    // 멤버 체력 — 팀 색으로, 죽으면 선이 바닥에 붙는다
    const hpTop = midY + 14, hpBot = H - PAD_B;
    const hpY = (pct) => hpBot - Math.max(0, Math.min(1, pct)) * (hpBot - hpTop);
    g.fillStyle = INK; g.globalAlpha = 0.55;
    g.fillText(T("멤버 체력"), 8, hpTop + 6);
    g.globalAlpha = 1;
    for (const [side, color] of SIDES) {
      for (const m of (tl.hp || {})[side] || []) {
        const max = m.max_hp || 1;
        g.strokeStyle = color; g.globalAlpha = 0.75; g.lineWidth = 1;
        g.beginPath();
        (m.series || []).forEach((v, i) => {
          const px = x(frames[i]), py = hpY(v / max);
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        });
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // 이벤트 마커 — 맨 위 띠에 점으로. 겹치면 같은 자리에 쌓인다(색이 다르면 보인다).
    for (const ev of tl.events || []) {
      const px = x(ev.frame);
      g.fillStyle = EV_COLOR[ev.kind] || "#888";
      g.globalAlpha = ev.side === "defense" ? 0.75 : 1;
      g.beginPath();
      g.arc(px, ev.side === "defense" ? PAD_T - 14 : PAD_T - 22, 3.2, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = INK; g.globalAlpha = 0.45;
    g.fillText(T("위 = 공격 · 아래 = 방어"), 8, PAD_T - 18);
    g.globalAlpha = 1;

    // 범례
    const leg = document.getElementById("arena-tl-legend");
    if (leg) {
      leg.textContent = "";
      for (const [k, label] of Object.entries(EV_LABEL)) {
        const s = el("span");
        const i = el("i");
        i.style.background = EV_COLOR[k];
        s.append(i, document.createTextNode(T(label)));
        leg.append(s);
      }
    }
  }

  // ── 리플레이 ────────────────────────────────────────────────────────────
  /** 리플레이 문서에 얹는 **도로롱 판**. 그쪽 화면은 어두운 판 하나로 만들어졌는데
   *  (게임 HUD 컨셉), 도로롱을 켜면 우리 화면만 희어지고 상세만 검게 남는다
   *  (유저 지적 2026-08-31). 그쪽 색이 전부 `:root` 변수라 **변수만 갈아** 준다 —
   *  마크업도 규칙도 안 건드리니 그쪽에서 새 판을 줘도 그대로 얹힌다.
   *  신호색(공격·수비·게이지·체력·대미지)은 흰 종이에서 읽히게 한 단계 낮춘다. */
  const DOR_SKIN = `:root{
    --ground:#fffafb; --panel:#fdf2f6; --panel2:#f8e6ee; --line:#f0d3de;
    --text:#231e20; --dim:#6b5c62; --faint:#7c6b72;
    --def:#d43a5c; --atk:#2f7fd0; --gauge:#b8820e; --hp:#2e9c63; --dmg:#d4472a;
    --cover:#8d7f86; --buff:#6b4fc4;
  }
  /* 변수를 안 타는 몇 줄 — 밝은 글자를 그대로 박아 둔 자리라 흰 종이에서 사라진다
     (유저 지적 «큐브 이름 안 보임», 실측 명암비 1.19). 그 몇 줄만 되잡는다. */
  .cubechip{ color:#4a2fa8; background:rgba(107,79,196,.12); border-color:rgba(107,79,196,.45); }
  .hpnum{ color:#6b5c62; }
  .cl{ color:#7c6b72; }
  .badge.off{ color:#8c7c84; border-color:#e6d0da; }
  .badge.reload{ color:#3f4a5c; border-color:#c9d2e0; background:rgba(122,134,158,.12); }
  .badge.taunt{ color:#9a5a10; border-color:rgba(180,110,30,.5); background:rgba(255,179,93,.16); }
  /* 어두운 홈(체력·커버 바 바닥)은 흰 종이에서 구멍처럼 보인다 */
  .hpbar, .coverbar{ background:#f2e4ea; }
  .badge[data-tip]:hover::after{ background:#fffafb; color:#231e20; border-color:#e6d0da; }`;
  /** 리플레이 카드의 배지 자리를 **편성 카드와 같게** 맞추는 판. 그쪽 프레임은 배지가
   *  한 치수 크고 버스트가 4px 더 내려와 있어, 두 화면을 나란히 보면 버스트만 아래로
   *  처져 보인다(유저 지적 2026-08-31, 실측 우리 (3,25) 16×18 · 그쪽 (6,29) 20×22).
   *  자리와 크기만 우리 것으로 옮긴다 — 마크업도 규칙도 안 건드리니 새 판에도 얹힌다. */
  const FRAME_FIT = `
    .frame .corp, .frame .rom{ width:16px; height:18px; font-size:11px; }
    .frame .corp{ top:3px; left:3px; }
    .frame .rom, .frame.has-corp .rom{ top:24px; left:3px; }
    .frame .elem{ width:16px; height:18px; right:3px; bottom:3px; }`;
  /** 도로롱이 켜져 있으면 그 판을 얹고, 꺼지면 걷는다. 배지 자리 판은 늘 얹는다. */
  function skinReplay(fr) {
    const doc = fr?.contentDocument;
    if (!doc?.head) return;
    // 배지 자리 맞추기는 판(도로롱)과 무관하게 늘 얹는다.
    let fit = doc.getElementById("dil-frame");
    if (!fit) { fit = doc.createElement("style"); fit.id = "dil-frame"; doc.head.append(fit); }
    fit.textContent = FRAME_FIT;
    const on = document.documentElement.getAttribute("data-dororong") === "on";
    let st = doc.getElementById("dor-skin");
    if (!on) { st?.remove(); return; }
    if (!st) { st = doc.createElement("style"); st.id = "dor-skin"; doc.head.append(st); }
    st.textContent = DOR_SKIN;
  }

  /** 상세 화면은 **코어 세션이 만든 한 문서**(arena_replay.html)다. 우리 CSS·JS와
   *  섞지 않으려고 액자(iframe)에 넣고, 결과는 `loadArenaResult`로 건넨다.
   *  액자는 **처음 열 때** 붙인다 — 안 여는 사람에게 한 문서를 더 받게 하지 않는다. */
  function openReplay() {
    const dlg = document.getElementById("arena-replay-sheet");
    const fr = document.getElementById("arena-replay-frame");
    if (!dlg || !fr || !A?.res) return;
    const feed = () => {
      try {
        // 얼굴 그림은 **우리 것을 빌려 준다**(그쪽 화면에는 그림이 없다) — 훅 하나로
        // 니케 이름을 받아 우리 얼굴 카드 주소를 돌려준다.
        fr.contentWindow.ARENA_PORTRAIT_URL = (n) => {
          const rec = byName.get(n);
          return rec && (rec.face || rec.img) ? faceSrc(rec, n) : null;
        };
        // 기업·돌파·코어·소장품은 **계정에만 있는 값**이라 엔진 응답에 없다 — 우리가
        // 넘긴다. 편성 카드가 그리는 것과 같은 출처(charSpec·로스터)라 두 화면이
        // 같은 값을 말한다.
        fr.contentWindow.ARENA_CARD_META = (n) => {
          const rec2 = byName.get(n);
          const sp = typeof charSpec === "function" ? charSpec(n) : null;
          if (!rec2 && !sp) return null;
          // 소장품 딱지는 **안 보낸다.** 그쪽 위 띠는 폭이 52px인데 돌파 별(23)과
          // 코어(23)가 이미 다 쓴다 — «애장 3»조차 6px로 잘려 읽을 게 없다(실측 v11).
          // 편성 카드에서는 왼쪽 위 배지가 색으로 말한다. 자리가 생기면 그때 보낸다.
          return {
            corp: rec2?.corp || null,
            breakthrough: sp?.breakthrough ?? null,
            core: sp?.core_enhancement ?? null,
          };
        };
        // 큐브 그림도 우리 것을 빌려 준다 — 편성 카드와 같은 아이콘이다.
        fr.contentWindow.ARENA_CUBE_URL = (cube) => {
          const file = cube ? uiIcon("cube", cube) : "";
          return file ? `image/ui/${file}` : null;
        };
        fr.contentWindow.loadArenaResult(A.res);
        skinReplay(fr);
        // 그쪽 화면은 엔진 쪽지(`_model`)를 아래에 그대로 적는다 — «보정 전»·«검증용»
        // 같은 우리 사정은 화면에 안 쓴다(유저 지시). 우리 문장 하나로 바꾼다.
        const note = fr.contentDocument?.getElementById("modelnote");
        // 화면 머리줄과 **같은 말**을 쓴다 — 여기만 다른 문장이면 어느 쪽이 맞는지 묻게 된다.
        if (note) {
          note.textContent = [T("그냥 재미로만 보세요."), T("아직 완성도 10% 수준입니다."),
                              T("알파 단계에서는 피드백을 받지 않습니다.")].join(" ");
        }
      } catch { /* 아직 안 떴다 */ }
    };
    if (fr.getAttribute("src")) feed();
    else { fr.addEventListener("load", feed, { once: true }); fr.src = "arena_replay.html"; }
    dlg.showModal();
    // 뷰어가 떠 있는 동안 뒤 문서는 안 움직인다 — `<dialog>`가 클릭은 막아도 스크롤은
    // 안 막는다(timeline.css의 `html.tlv-open`과 같은 규칙을 쓴다).
    document.documentElement.classList.add("tlv-open");
  }

  // ── 붙이기 ──────────────────────────────────────────────────────────────
  let wired = false;
  function ensure() {
    if (!A) A = load_();
    renderSide("def");
    renderSide("atk");
    if (wired) return;
    wired = true;
    document.getElementById("arena-run")?.addEventListener("click", run);
    document.getElementById("arena-tlv-open")?.addEventListener("click", openReplay);
    document.getElementById("arena-replay-x")?.addEventListener("click", () =>
      document.getElementById("arena-replay-sheet")?.close());
    document.getElementById("arena-replay-sheet")?.addEventListener("close", () =>
      document.documentElement.classList.remove("tlv-open"));
    document.getElementById("arena-swap")?.addEventListener("click", () => {
      const t = A.def; A.def = A.atk; A.atk = t;
      renderSide("def"); renderSide("atk"); save_();
    });
    document.getElementById("arena-clear")?.addEventListener("click", () => {
      A.def = blank(); A.atk = blank(); A.res = null;
      renderSide("def"); renderSide("atk");
      document.getElementById("arena-res").textContent = "";
      document.getElementById("arena-end").textContent = "";
      save_();
    });
    // 창 폭이 바뀌면 타임라인만 다시 그린다 — 결과는 그대로다.
    window.addEventListener("resize", () => A?.res && drawTimeline(A.res));
    // **판 색이 바뀌어도 다시 그린다.** 캔버스는 한 번 찍은 픽셀을 들고 있어서, 도로롱을
    // 켜면 바탕만 희어지고 글자·선은 옛 색으로 남는다(실측 2026-08-31).
    new MutationObserver(() => {
      if (A?.res) drawTimeline(A.res);
      // 리플레이가 떠 있으면 그쪽 판도 같이 갈아 준다.
      skinReplay(document.getElementById("arena-replay-frame"));
    })
      .observe(document.documentElement, {
        attributes: true, attributeFilter: ["data-dororong", "data-mode"],
      });
  }

  window.Arena = { ensure };

  // 첫 진입에 결과 상자를 접어 둔다 — 전투가 끝나야 편다(유저 지시 2026-08-31).
  // 화면을 그리는 것은 app.js가 부팅 끝에 부르는 `ensure()`다: 여기서 먼저 그리면
  // ROSTER가 아직 비어 있어 그림도 배지도 없는 빈 카드가 나온다.
  renderRes();
})();
