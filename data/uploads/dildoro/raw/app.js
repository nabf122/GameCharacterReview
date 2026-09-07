// 편성 탭 — 인게임 스쿼드 편성의 UX를 옮긴다.
//   덱 번호 01~05 → 그 덱의 5슬롯 → 아래 로스터에서 채운다.
//   채우는 방법은 **누르기와 끌기 둘 다**다 (모바일에서 드래그만이면 못 쓴다).
//   카드마다 톱니 버튼 → 그 니케 하나의 육성만 고치고, 되돌릴 수 있다.
//
// 계산은 서버(/api/sim, 코어 수만큼 병렬) 또는 이 브라우저(Pyodide 워커) 중에서 고른다.
// 계정 정보과 기록은 이 브라우저의 localStorage에만 있다 — 서버에 보관하지 않는다.

const LS = {
  decks: "nikke.decks.v2",
  results: "nikke.results.v2",
  settings: "nikke.settings.v2",
  profiles: "nikke.profiles.v1",
  records: "nikke.records.v1",
  presets: "nikke.presets.v2",
  movebar: "nikke.movebar",      // 옛 주소 안내를 접은 날(하루)
  whatsNew: "nikke.whatsnew.v1",
  notice: "nikke.notice.v1",
  fbMine: "nkl.fbMine",
  // 접었나 폈나. **사람이 접어 둔 것을 새로고침이 도로 펴면 안 된다**(유저 지시).
  folds: "nikke.folds.v1",};

// 저장 데이터 전체를 파일 하나로 내보내고 그대로 되돌리는 형식.
// 원래는 구 Funnel 주소 → dildoro.com 이전용 **임시 다리**였는데, 이전이 끝난 뒤에도
// 백업으로 쓸모가 남아 상시 기능이 됐다(내 계정의 «백업» 카드). 그래서 출처 주소를
// 더는 따지지 않는다 — 어느 주소에서 내보낸 파일이든 받는다.
const MIGRATION = {
  format: "dildoro.localStorage",
  version: 1,
  maxFileBytes: 24 * 1024 * 1024,
};

// 저장 개수 상한. localStorage는 오리진당 5MB 남짓이고, 실측으로 자리를 차지하는 것은
// **계정과 기록**이다 (계정 하나 ≈ 120KB · 기록 한 건 ≈ 6.5KB). 프리셋은 한 장이 1KB
// 안쪽(덱 하나 155B)이라 100개를 둬도 100KB다 — 넉넉히 열어 두고, 대신 계정 쪽을 조인다.
const PRESET_MAX = 100;
// 폴더는 «정리»를 위한 것이라 많으면 그 자체가 짐이 된다. 칩 한 줄에 들어갈 만큼만.
const PRESET_FOLDER_MAX = 10;
const FOLDER_NAME_MAX = 12;
const PRESET_NAME_MAX = 24;
// 계정 10개면 약 1.2MB — 한도의 4분의 1이다. 이보다 늘리면 기록·결과 캐시와 부딪친다.
const PROFILE_MAX = 10;

// 공유본 스키마 판. **담기는 것이 바뀌면 올린다** — 옛 링크를 새 뜻으로 읽지 않게.
const SHARE_V = 1;

const DECK_COUNT = 5;
const SLOTS = 5;
const CODES = ["", "작열", "수냉", "풍압", "전격", "철갑"];
// **위크포인트 → 적 코드.** 계산기는 «적의 속성»(`enemy.code`)을 받고, 니케 코드가
// 그 적에게 우월할 때만 ⑦ 우월 코드가 붙는다 (`calculator/damage.py _CODE_ADVANTAGE`).
// 인게임 레이드 화면이 알려 주는 건 «약점 코드» — **데려갈 속성**이다. 둘은 서로
// 반대 방향이라, 고른 값을 그대로 적 코드로 넘기면 엉뚱한 속성이 이득을 본다.
//   위크포인트 전격 → 적은 수냉 → 전격 니케가 우월  (전격 ▶ 수냉)
const WEAK_TO_ENEMY = {
  전격: "수냉", 수냉: "작열", 작열: "풍압", 풍압: "철갑", 철갑: "전격",
};
/** 지금 고른 위크포인트에 해당하는 **적 코드**. 계산에 넘길 값은 늘 이것이다. */
const enemyCode = () => WEAK_TO_ENEMY[state.settings.code] || null;
// 색이 들어간 육각 코드 아이콘 (63×73 RGBA). 흰 글리프판(icn_element_*.webp)과 달리
// 그 자체로 색·모양을 다 갖고 있어 배지에 그대로 얹는다.
// 돌파 별·코강 배지는 **실물 에셋**이다. 직접 ★을 찍으면 폰트가 그리는 모양이라
// 인게임과 다르고, 코강 링은 아예 글자로 만들 수 없다.
//   nk-star-on/off.png — blablalink가 쓰는 금색·회색 4각 별 (테두리까지 들어 있다)
//   nk-evolve.png      — 코강 숫자가 들어앉는 마젠타 링
const STAR_ON = "nk-star-on.png";
const STAR_OFF = "nk-star-off.png";
// 등급별 별 개수. blablalink `star-GXlUU28h.js`와 같은 값이다.
const RARE_STARS = { SSR: 3, SR: 2, R: 0 };

/** 돌파·코강 → 별 개수와 코강 숫자.
 *
 *  인게임은 **돌파와 코강을 한 눈금(limit_break)으로 이어 센다.** 별이 먼저 차고,
 *  넘치는 만큼이 코강 숫자이며, 10이면 MAX다. blablalink `star-GXlUU28h.js`의 계산을
 *  그대로 옮겼다 — 우리 식으로 다시 세면 SR·R에서 어긋난다. */
function starInfo(rare, grade, core) {
  const max = RARE_STARS[rare] ?? 3;
  const lb = (grade || 0) + (core || 0);
  return {
    max,
    active: Math.min(lb, max),
    breakNum: lb >= 10 ? "MAX" : (lb > max ? lb - max : 0),
  };
}

const ELEMENT_ICON = {
  작열: "icon-code-fire.png", 수냉: "icon-code-water.png",
  풍압: "icon-code-wind.png", 전격: "icon-code-electronic.png",
  철갑: "icon-code-iron.png",
};
const CORP_ICON = {
  엘리시온: "icn_corp_01.webp", 미실리스: "icn_corp_02.webp",
  테트라: "icn_corp_03.webp", 필그림: "icn_corp_04.webp",
  어브노말: "icn_corp_05.webp",
};
const CLASS_ICON = {
  화력형: "icn_class_attacker.webp", 방어형: "icn_class_defender.webp",
  지원형: "icn_class_supporter.webp",
};
// 버스트 — 인게임 글리프(`icn_burst_*`)를 그대로 쓴다. 로마자를 글자로 찍으면
// 폰트가 그리는 모양이라 인게임과 다르고, 올라운더(A)는 아예 글자가 없다.
const BURST_ICON = {
  1: "icn_burst_01.webp", 2: "icn_burst_02.webp",
  3: "icn_burst_03.webp", A: "icn_burst_all.webp",
};
const BURST_ROMAN = { 1: "Ⅰ", 2: "Ⅱ", 3: "Ⅲ", A: "A" };
// 역할군 → 결과 차트의 범주형 색. **고정 순서이며 순환하지 않는다** (dataviz 규칙).
// 세 색은 검증기 6검사를 통과한 조합이다 (tokens.css 주석 참조).
const CLASS_COLOR = {
  화력형: "var(--cat-attacker)", 방어형: "var(--cat-defender)", 지원형: "var(--cat-supporter)",
};
const WEAPONS = ["AR", "SMG", "SG", "SR", "RL", "MG"];
// 칩 순서는 **인게임 표시 순서로 고정**한다. 로스터 등장 순서로 두면
// 「지원형·화력형·방어형」처럼 뒤죽박죽이 되어 눈이 자리를 못 외운다.
const CLASS_ORDER = ["화력형", "방어형", "지원형"];
const CODE_ORDER = ["작열", "수냉", "풍압", "전격", "철갑"];
/** 속성 한 글자 — 유니온 기록 이름에 세 줄의 속성을 «작수풍»처럼 적는다(유저 제보).
 *  **한국어 화면에서만 쓴다** — 다른 말에는 한 글자로 줄여 부르는 관습이 없다. */
const CODE_ABBR = { 작열: "작", 수냉: "수", 풍압: "풍", 전격: "전", 철갑: "철" };
// 인게임 기업 표시 순서 (`context/roster.py` CORP_ICON과 같다)
const CORP_ORDER = ["엘리시온", "미실리스", "테트라", "필그림", "어브노말"];

// 인게임 표기 그대로 쓴다 — 줄임말을 만들면 게임 화면과 대조가 안 된다.
const OL_OPTS = [
  ["atk_pct", T("공격력")],
  ["element_bonus", T("우월 코드 대미지")],
  ["max_ammo_pct", T("최대 장탄 수")],
  ["crit_rate", T("크리티컬 확률")],
  ["crit_dmg", T("크리티컬 피해량")],
  ["charge_speed_pct", T("차지 속도")],   // 인게임 옵션 이름 그대로. 값이 클수록 차지가 빠르다
  ["charge_dmg_pct", T("차지 대미지")],
  ["accuracy_pct", T("명중률")],
  ["def_pct", T("방어력")],
];
const OL_LABEL = Object.fromEntries(OL_OPTS);
// 이 둘만 인게임이 단계별로 따로 반올림한다 → 줄별 리스트로 낸다
// (GAMEPLAY.md §무기 메카닉 · profile_convert.PER_LINE_KEYS와 같은 집합이어야 한다)
const PER_LINE = new Set(["max_ammo_pct", "charge_speed_pct"]);
const PARTS = ["머리", "몸통", "팔", "다리"];
const EQUIP_KEYS = OL_OPTS.map(([k]) => k);
const COLL_STAGES = ["없음", ...Array.from({ length: 16 }, (_, i) => `R${i}`),
  ...Array.from({ length: 16 }, (_, i) => `SR${i}`)];

// «내 순서»는 사용자가 나중에 직접 만든다 — 지금은 넣지 않는다.
// 정렬 기준은 **네 개**로 줄였다. 등급·한계돌파·호감도는 값이 몇 가지뿐이라
// 200명을 줄 세우는 데 쓸모가 없었다(대부분 같은 칸에 뭉친다). 남긴 것은
// 인게임에서 쓰던 둘(전투력·이름)과, 딜을 실제로 가르는 둘
// (**우월코드**, **우코+공증 합(우공합)**)이다.
// 레벨은 넣지 않는다 — 솔로레이드는 400 고정이라 전원 같다.
const SORTS = [
  ["combat", T("전투력")], ["name", T("이름")], ["elem", T("우월코드")], ["elematk", T("우공합")],
];

// 전투 조건 기본값 — **계산기의 DEFAULT_ENEMY / DEFAULT_CONFIG와 같아야 한다**
// (calculator/timeline.py). 다르면 UI를 안 건드려도 기본 결과가 달라진다.
//
// `def` 31784는 2026-08-24 실측으로 재확인했다. 솔로레이드 «사치스러운 거미»에서
// 목단(AR·펠릿 1개·우월코드 없음, 큐브 미장착)의 비크리 몸통 평타 10,454로 역산하면
// 30,939이고, 같은 방어력으로 드레이크를 예측하면 48,770 대 실측 48,015(오차 1.5%)로
// 맞는다. 한때 33,700으로 고쳤던 적이 있는데, 그건 같은 실측값을 **큐브 Lv15 착용**으로
// 잘못 가정하고 역산한 값이라 되돌렸다.
const BATTLE_DEFAULT = {
  def: 31784, core_px: 0,
  // 난수 — **기본은 기대값**이다(크리·코어를 확률 대신 기댓값으로 태운다). 확률로 굴리면
  // 크리가 뜨고 안 뜨고에 따라 값이 흔들린다(피드백 077430d5: 메스트 타이밍의 수신데).
  //   expected  지금까지와 같음 · 같은 조건이면 같은 값
  //   random    계산할 때마다 다른 시드
  //   seed      아래 `seed`로 못 박은 시드 — 같은 시드면 같은 판이 다시 나온다
  rng_mode: "expected",
  seed: 0,
  runs: 10,                      // «폭 보기»에서 굴리는 횟수(2~20 — 처음엔 10, 유저 결정 2026-09-02)
  // 관통 니케가 코어를 맞추면 뒤 몸통에 한 번 더(실험실 2026-08-28). **실측 전 근사**라
  // 기본은 꺼짐이고, 안 켜면 예전과 결과가 같다.
  core_pierceable: false,
  optimal_range_weapons: [],
  // 무기군별 평타 실전 계수. 시뮬은 모든 탄이 명중한다고 가정하지만 실전은 탄퍼짐으로
  // 새는 탄이 있다 — 2026-08-24 거미 솔레 실측: SG −7~25% (5명·2덱), SMG −19~21%
  // (리타·리틀 머메이드). 평타에만 곱하고 스킬·변신 대미지는 건드리지 않는다.
  weapon_coeff: { AR: 1, SMG: 0.8, SG: 0.9, SR: 1, RL: 1, MG: 1 },
  max_burst_count: 0,            // 0 = 무제한(null)
  first_burst_time: 3.0,
  // 1버→2버→3버를 **누르는** 데 걸리는 시간(단계마다). 사람 손속도라 정답이 없어
  // 세 단계로 고르게 하고 직접 넣을 수도 있다.
  //
  // **기본은 0.1초다**(유저 결정 2026-08-29). 하루 동안 0.25초였는데, 그러면 실누적
  // 게이지에서 풀버스트가 한 회 통째로 날아간다 — 같은 덱 180초에서 0.1초 13회 /
  // 0.25초 12회(고정 모델은 15회 / 14회). 사람이 실제로 누르는 속도에 가까운 쪽이
  // 0.1초라는 유저 판단이고, «간신히 들어가던» 회차가 그 차이로 갈렸다.
  // 딜로는 실누적에서 0.25초가 −4.3%, 0.4초가 −6.2%다(아니스덱 실측).
  burst_switch_delay: 0.1,
  burst_reenter_delay: 0.5,
  // 풀버스트가 **끝난 순간부터 다음 1버 체인 개시까지**의 게이지 재충전(초). 전투 시작 뒤
  // 첫 버스트는 이것이 아니라 `first_burst_time`이 정한다. 충전 속도 버프·즉시 충전이
  // 있으면 이 시간이 배율로 줄어든다. 0이면 쿨만 맞는 즉시 다음 체인이 열린다.
  //
  // **칸에 2가 채워진 채로 시작한다**(유저 지시 2026-08-28) — 비워 두고 «코어에 맡긴다»로
  // 두면 사람이 지금 몇 초로 도는지를 화면에서 못 본다. 대신 여기 숫자는 **코어 기본값을
  // 따라 적는 것**이라, 코어가 기본을 바꾸면 여기도 같이 고쳐야 한다. 안 고치면 사람이
  // 안 건드렸는데 사이트만 옛 값을 실어 보낸다(2026-08-28에 1.0으로 그럴 뻔했다).
  burst_regen_time: 2.0,
  // 버스트 게이지 실누적 — "fixed"면 위 두 값(첫 버스트·재충전)이 사이클을 정하고,
  // "accumulate"면 **쏜 히트가 게이지를 만들어** 100%에 1단계가 열린다.
  // 코어는 accumulate에서 `first_burst_time`·`burst_regen_time`을 아예 안 본다.
  //
  // **기본이 실누적이다**(유저 지시 2026-09-02) — 실험실 딱지를 떼고 켠 채로 시작한다.
  // 이미 쓰던 사람의 저장분은 boot에서 "fixed"로 못 박아 둔다(아래 `_gaugeV`) — 안 켜 둔
  // 사람이 새로고침 한 번에 사이클이 통째로 바뀌면 «내가 안 건드렸는데»가 된다.
  burst_gauge_mode: "accumulate",

  // 보스 구간 — «이 시간부터 이 시간까지»가 여럿일 수 있다. 빈 목록이면 예전과 같다.
  //   element_gate(속성저지) — 그 창에는 **약점에 우월한 니케만** 딜이 들어간다
  //   immune(족자패턴)      — 그 창에는 **아무 딜도** 안 들어간다
  // 둘 다 **대미지만 0**이다(코어 규약) — 시간·재장전·게이지·버프는 평소대로 흐르고,
  // 맞은 것은 «맞았지만 0»으로 타임라인에 남는다.
  phases: [],
};

/** 구간 종류. 화면에서는 셋을 한 목록으로 다루지만 **보낼 때 갈라진다**(계약 §4) —
 *  속성저지·족자패턴은 `enemy.phases`, 파츠는 `enemy.parts`다. 사람에게는 셋 다 «이 시간
 *  동안 이렇다»는 같은 얘기라 한 자리에서 넣는 편이 손에 맞는다. */
const PHASE_KINDS = [
  ["element_gate", "속성저지"],
  ["immune", "족자패턴"],
  ["parts", "파츠"],
  // 보스가 자리를 옮기는 구간 — 그동안은 적정거리가 붙는 무기군이 달라진다
  // (피드백 dce23611). 위쪽 «적정거리 적용 무기군»에서 켠 것은 판 내내 적정이고,
  // 이 줄은 **나머지 무기군에만** 걸린다(유저 결정 2026-09-01).
  ["range", "적정거리"],
  // 아래 둘은 실험실(2026-08-28) — 코어가 막 받기 시작했고 실측이 덜 됐다.
  //   pierce_gate — 그 창엔 **관통 대미지만** 통한다
  //   core        — 그 창에만 **코어가 열린다**. 크기는 위쪽 `core_px`가 그대로 든다
  ["pierce_gate", "관통저지 (실험실)"],
  ["core", "코어 등장 (실험실)"],
];
const PHASE_LABEL = Object.fromEntries(PHASE_KINDS);
/** 코어 상한. 넘겨 보내 봐야 거절당하므로 화면에서 막는다. */
const PHASE_MAX = 32;

/** 보낼 수 있는 꼴로 다듬는다 — 숫자로 만들고, 뒤집힌 것·빈 것을 버리고, 앞부터 세운다.
 *  코어도 정렬하지만 화면이 먼저 정리해야 «내가 넣은 것»과 «적용된 것»이 같아 보인다. */
function cleanPhases(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => {
      const kind = PHASE_LABEL[p?.kind] ? p.kind : "immune";
      // 0.1초 눈금에 맞춰 둔다 — 화면이 «30.0»이라고 적어 놓고 30.04를 보내면 안 된다.
      const tick = (v) => Math.round(Math.max(0, Number(v) || 0) * 10) / 10;
      const row = { kind, t0: tick(p?.t0), t1: tick(p?.t1) };
      // 적정거리 줄만 무기군을 들고 다닌다. 아는 이름만 남긴다.
      if (kind === "range") {
        const w = Array.isArray(p?.weapons) ? p.weapons : [];
        row.weapons = WEAPONS.filter((x) => w.includes(x));
      }
      return row;
    })
    .filter((p) => p.t1 > p.t0)
    .sort((a, b) => a.t0 - b.t0)
    .slice(0, PHASE_MAX);
}

let ROSTER = [];
const byName = new Map();
/** 게임 내부 번호(`name_code`) → 니케 이름. 로스터를 채울 때 함께 만든다. */
const byCode = new Map();
/** «X 해제»·«X 제거» 이름 → 본체 «X» (build.py가 parsed_skills에서 굽는다).
 *  게임 데이터에 그런 이름이 없어 사전으로는 못 옮긴다 — 조립해야 한다. */
let REMOVE_OF = {};
// 「최종 공격력이 가장 높은 아군」에게 버프를 거는 니케. 빌드가 파싱 데이터에서 굽는다
// (`web/build.py _top_atk_casters`). 이 중 하나가 덱에 있을 때만 진단을 띄운다.
let TOP_ATK_CASTERS = new Set();
let MAPS = null;          // profile_maps.json — 오버로드 표·큐브 이름·큐브 효능
let HEALTH = { sim: false, fetch: false };

// 클래스·코드·무기·버스트는 **다중 선택**이다 (인게임과 같다). 빈 배열 = 필터 없음.
const defaultFilter = () => ({ q: "", burst: [], element: [], cls: [], weapon: [], corp: [],
                               sort: "combat", asc: false, parsed: true, acc: [], favOnly: false,
                               favItem: false });

const state = {
  settings: {
    code: "풍압", duration: 180, deck: 0, profileId: "",
    mode: "solo",          // solo | union — 유니온은 아직 로컬 전용(HEALTH.union)
    engine: "auto",        // auto | server | local
    fpanel: false,
    fastMode: false,       // 배치모드 — 마지막으로 켜 둔 상태 그대로 다음에도 연다
  },
  decks: [],
  // 여러 판을 굴렸을 때 결과에 **어느 값을 보여 줄지**. 기본은 **평균**이다 — 이 앱의
  // 다른 모드 이름이 «평균으로 계산»이라, 굴린 쪽도 평균으로 두어야 둘을 나란히 견준다
  // (유저 지시 2026-09-01). 중앙값은 10판에서 평균과 거의 같아 따로 안 고른다.
  spreadView: "mean",
  filter: defaultFilter(),
  // 전투력 계산기(coop) 전용 필터. **편성과 독립**이다 — 예전엔 필터 바 DOM을 그대로
  // 옮겨 쓰면서 상태(state.filter)까지 공유해, 편성에서 걸어 둔 필터가 전투력
  // 계산기의 고르는 화면까지 그대로 새어 들었다(실측: 편성에서 속성을 좁혀 두면
  // 전투력 계산기에서 다른 속성 캐릭터가 안 보임). 화면(DOM)은 계속 공유하되
  // (`moveFilterBar`), 상태만 갈라 각자 기억하게 한다.
  coopFilter: defaultFilter(),
  // 빈 칸을 눌러 여는 «고르기» 시트의 필터 (솔로). 유니온은 자기 상자(U().pickFilter)를
  // 쓴다 — 두 화면이 한 필터를 나눠 쓰면 한쪽에서 좁혀 둔 조건이 다른 쪽에 새어 든다.
  pickFilter: defaultFilter(),
  profiles: {},
  favs: [],               // 즐겨찾기 — 등록 순서가 «내 순서»다
  records: [],
  presets: [],            // 편성만 담는 프리셋 — 계산 결과는 records가 담당한다
  battle: { ...BATTLE_DEFAULT },
};
let shared = null;        // 공유 링크로 받은 편성 (`/s?c=…`). 평소에는 null이다
let presetFilter = "all"; // 프리셋 목록 필터: all | single | bundle
let results = {};
let picked = null;
let ctrlOpen = null;      // 컨트롤을 펼친 니케 이름        // 누르기로 고른 카드 (모바일 경로)
// 배치모드 — 화면만 바꾼다. 데이터는 그대로 state.decks라서 껐다 켜도
// 편성이 그대로다. 모드 자체는 state.settings.fastMode로 저장되어 `boot()`가
// 복원한다(유저 피드백: 새로고침해도 켜 둔 상태 그대로 열려야 한다).
let fastMode = false;

// ── 저장 ────────────────────────────────────────────────────────────────
const load = (k, fb) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { setStatus(T("저장 실패 — 저장 공간이 찼을 수 있습니다: {name}", { name: e.name })); }
};
const saveAll = () => {
  // 뮤지엄이 꽂혀 있으면 state 자리에는 뮤지엄 것이 있다 — 솔로 것은 stash에 있다.
  // **솔로 키에는 언제나 솔로 것**을 쓴다(museumEnter 주석). 먼저 뮤지엄 상자에
  // 지금 값을 도로 적어야 `_museum`이 최신이다.
  museumSyncBack();
  const st = museumActive() ? museumStash : null;
  const solo = (k) => (st ? st[k] : state[k]);
  const settings = st ? { ...state.settings, ...st.settings } : state.settings;
  save(LS.decks, solo("decks"));
  // `_battle`은 **솔로 것**이다. 유니온 상자를 여기에 쓰면 솔로 설정이 조용히 덮인다.
  // 유니온 일체(편성·큐브·컨트롤·레벨·전투 조건)는 `_union`에 통째로 따로 담는다.
  // 뮤지엄도 마찬가지로 `_museum` 한 상자다.
  save(LS.settings, { ...settings, _filter: solo("filter"), _coopFilter: state.coopFilter,
                     _pickFilter: solo("pickFilter"), _favs: state.favs,
                     _filterV: state.settings._filterV, _battle: solo("battle"),
                     _union: state.union || null,
                     _museum: state.museum || null });
  save(LS.results, results);
  save(LS.profiles, state.profiles);
  save(LS.records, solo("records"));
  save(LS.presets, solo("presets"));
};

const $ = (sel, root = document) => root.querySelector(sel);
// 글자는 여기서 **번역된다**(i18n.js의 `T`). UI 문구도 니케 이름도 한국어 원문이
// 키라, 만드는 자리마다 감쌀 필요가 없다. 사전에 없는 글자는 그대로 나간다.
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = typeof text === "string" ? T(text) : text;
  return n;
};
const uid = () => Math.random().toString(36).slice(2, 9);
const eok = (n) => (n / 1e8).toFixed(2);
/** 진행 문구. **비어 있으면 배지가 사라진다** — 늘 떠 있는 라벨이 아니라
 *  기다려야 하는 동안만 보이는 표시다. 헤더 오른쪽에 흘리면 글자가 길어질 때마다
 *  옆 버튼들이 밀린다. */
/** 지금 떠 있는 진행 문구 (없으면 빈 문자열). */
const statusText = () => {
  const box = $("#busy");
  return box && !box.hidden ? ($("#busy-text").textContent || "") : "";
};

const setStatus = (t, spin = true) => {
  const box = $("#busy");
  if (!box) return;
  box.hidden = !t;
  if (!t) return;
  $("#busy-text").textContent = T(t);      // 서버가 준 한국어 문장도 사전에 있으면 바뀐다
  // 돌아가는 원은 «기다리는 중»이라는 뜻이다. 안내문에까지 붙이면 아무 일도 안 하는데
  // 뭔가 도는 것처럼 보인다.
  box.querySelector(".busy-spin").hidden = !spin;
};

/** 잠깐 떴다 사라지는 알림.
 *
 *  `setStatus`는 «기다리는 중»을 나타내는 배지라 지우는 사람이 있어야 한다. 저장처럼
 *  기다릴 것이 없는 일에 그대로 쓰면 **문구가 화면에 박힌다.** 그래서 시간이 지나면
 *  스스로 걷어내되, 그 사이 계산 같은 진짜 «기다림»이 시작됐으면 건드리지 않는다. */
function flashStatus(text, ms = 2600) {
  setStatus(text, false);
  setTimeout(() => {
    if ($("#busy-text")?.textContent === text) setStatus("", false);
  }, ms);
}

// ── 그 자리에서 묻기 ────────────────────────────────────────────────────
// `confirm()`·`prompt()`를 쓰지 않는다. 브라우저 대화상자는 **무엇에 대한 물음인지**를
// 화면에서 떼어 놓는다 — 「이 기록을 지웁니다」만 떠 있으면 어느 기록인지 확인할 방법이
// 없다. 카드 안에서 물으면 지울 대상이 바로 위에 보이고, 생김새도 사이트와 같다.
//
// 두 함수가 같은 자리(`.inline-ask`)를 쓰고, 한 카드에 하나만 열린다.

/** 이미 열려 있는 물음을 걷어낸다. 한 번에 하나만 열려 있어야 한다. */
function closeAsk(host) {
  for (const x of (host || document).querySelectorAll(".inline-ask")) x.remove();
}

/** 그 자리에서 «정말?»을 묻는다. `onOk`는 확인을 누르면 불린다. */
/** 작은 물음창. **좁은 자리에서는 이것을 쓴다** — `askInline`은 상자 안에 막대를
 *  끼워 넣으므로 툴바처럼 좁은 줄에 넣으면 줄이 통째로 무너진다(유저 지적 2026-08-30).
 *
 *  `input`을 주면 이름을 받는 창이 되고, 안 주면 «할까요?» 창이 된다. */
function askSheet({ title, msg, input = null, max = 24, okLabel, danger = false, onOk }) {
  const dlg = $("#ask-sheet");
  if (!dlg) return;
  $("#ask-t").textContent = title || T("확인");
  $("#ask-msg").textContent = msg || "";
  $("#ask-msg").hidden = !msg;
  const inp = $("#ask-in");
  inp.hidden = input == null;
  if (input != null) { inp.value = input; inp.maxLength = max; }
  const ok = $("#ask-ok");
  ok.textContent = okLabel || T("확인");
  ok.classList.toggle("btn-alert", !!danger);
  ok.classList.toggle("btn-primary", !danger);
  const close = () => dlg.close();
  $("#ask-x").onclick = close;
  $("#ask-cancel").onclick = close;
  const run = () => {
    const v = input != null ? inp.value.trim().slice(0, max) : null;
    if (input != null && !v) return;          // 빈 이름은 안 받는다
    dlg.close();
    onOk(v);
  };
  ok.onclick = run;
  inp.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); run(); }
    if (e.key === "Escape") close();
  };
  if (!dlg.open) dlg.showModal();
  if (input != null) { inp.focus(); inp.select(); } else ok.focus();
}

function askInline(host, text, okLabel, onOk) {
  if (!host) return;
  const open = host.querySelector(".inline-ask");
  closeAsk(document);
  if (open) return;                       // 같은 버튼을 다시 누르면 접는다
  const bar = el("div", "inline-ask");
  bar.append(el("span", "inline-ask-t", text));
  const acts = el("div", "inline-ask-acts");
  acts.append(mkBtn(T("취소"), "btn-ghost", () => bar.remove()));
  acts.append(mkBtn(okLabel, "btn-alert", () => { bar.remove(); onOk(); }));
  bar.append(acts);
  host.append(bar);
  // **눈에 들어오게 한다.** 이 확인은 툴바 아래에 붙는데, 툴바가 화면 밑에 걸려 있으면
  // 물어본 것이 화면 밖에 뜬다 — 누른 사람은 «아무 일도 안 났다»고 읽는다.
  bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
  bar.querySelector(".btn-alert").focus();
}

/** 줄(덱)을 골라서 확인 — askInline과 같은 막대에 체크가 붙는다. onOk(고른 덱 번호 목록). */
function askRows(host, text, rows, okLabel, onOk) {
  if (!host) return;
  const open = host.querySelector(".inline-ask");
  closeAsk(document);
  if (open) return;
  const bar = el("div", "inline-ask inline-ask-rows");
  bar.append(el("span", "inline-ask-t", text));
  const picks = el("div", "inline-ask-picks");
  const chosen = new Set(rows.map((r) => r.i));
  for (const r of rows) {
    const lab = el("label", "share-opt");
    const ck = el("input");
    ck.type = "checkbox"; ck.checked = true;
    ck.onchange = () => { if (ck.checked) chosen.add(r.i); else chosen.delete(r.i); ok.disabled = !chosen.size; };
    lab.append(ck, el("span", null, r.label));
    picks.append(lab);
  }
  bar.append(picks);
  const acts = el("div", "inline-ask-acts");
  acts.append(mkBtn(T("취소"), "btn-ghost", () => bar.remove()));
  const ok = mkBtn(okLabel, "btn-alert", () => { bar.remove(); onOk([...chosen].sort((a, b) => a - b)); });
  acts.append(ok);
  bar.append(acts);
  host.append(bar);
  bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
  ok.focus();
}

/** 이름을 그 자리에서 고친다. 엔터로 저장, Esc로 취소. */
function askRename(host, label, current, max, onOk) {
  if (!host) return;
  const open = host.querySelector(".inline-ask");
  closeAsk(document);
  if (open) return;
  const bar = el("div", "inline-ask");
  bar.append(el("span", "inline-ask-t", label));
  const inp = el("input", "inline-ask-in");
  inp.type = "text";
  inp.maxLength = max;
  inp.autocomplete = "off";
  inp.value = current;
  inp.setAttribute("aria-label", label);
  bar.append(inp);
  const acts = el("div", "inline-ask-acts");
  const commit = () => {
    const v = inp.value.trim().slice(0, max);
    if (!v) return;
    bar.remove();
    onOk(v);
  };
  acts.append(mkBtn(T("취소"), "btn-ghost", () => bar.remove()));
  acts.append(mkBtn(T("저장"), "btn-primary", commit));
  bar.append(acts);
  inp.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); bar.remove(); }
  };
  host.append(bar);
  inp.focus();
  inp.select();
}

function mkBtn(label, cls, onclick, disabled = false) {
  const b = el("button", `btn ${cls}`, label);
  b.type = "button";
  b.disabled = disabled;
  b.onclick = onclick;
  return b;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${String(filename).replace(/[\\/:*?"<>|]/g, "_")}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// ── 도메인 이전: 구 Funnel localStorage → dildoro.com ───────────────────
/** JSON으로 다시 해석하지 않고 raw string 그대로 담아 알 수 없는 키까지 손실 없이 옮긴다. */
function readAllLocalStorage() {
  const entries = {};
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((key) => typeof key === "string")
    .sort((a, b) => a.localeCompare(b));
  for (const key of keys) entries[key] = localStorage.getItem(key);
  return entries;
}

function makeMigrationExport() {
  return {
    format: MIGRATION.format,
    version: MIGRATION.version,
    storage: "localStorage",
    sourceHost: location.hostname.toLowerCase(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    entries: readAllLocalStorage(),
  };
}

/** 새 출처를 파일과 똑같이 만든다. 중간에 실패하면 가져오기 전 상태를 즉시 되돌린다. */
function replaceLocalStorage(entries) {
  const before = Object.entries(readAllLocalStorage());
  try {
    localStorage.clear();
    for (const [key, value] of entries) localStorage.setItem(key, value);
  } catch (error) {
    try {
      localStorage.clear();
      for (const [key, value] of before) localStorage.setItem(key, value);
    } catch {
      const fatal = new Error(T("저장 공간이 부족해 가져오지 못했고 기존 데이터도 완전히 복구하지 못했습니다. 이 탭을 닫고 다시 시도하세요."));
      fatal.storageRestoreFailed = true;
      throw fatal;
    }
    throw error;
  }
}

function migrationStatus(node, message = "", kind = "") {
  node.textContent = message;
  node.className = `migration-status${kind ? ` ${kind}` : ""}`;
}

/** 내 계정의 «백업» 카드 — 저장 데이터 전체를 파일로 내보내고 되돌린다. */
/** 백업 파일 검사 — 형식·버전·항목 타입만 본다(출처 host는 안 가린다: 내 파일이면 어디서
 *  만들었든 복원할 수 있어야 백업이다). 581b966이 이전 도구를 걷어내며 같이 지워져
 *  가져오기가 «parseBackupExport is not defined»로 죽었다 — 복원. */
function parseBackupExport(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(T("JSON 파일을 읽지 못했습니다.")); }
  if (!data || typeof data !== "object" || Array.isArray(data)
      || data.format !== MIGRATION.format || data.storage !== "localStorage") {
    throw new Error(T("이 파일은 DILDORO 전체 내보내기 파일이 아닙니다."));
  }
  if (data.version !== MIGRATION.version) {
    throw new Error(T("지원하지 않는 내보내기 파일 버전입니다."));
  }
  if (!data.entries || typeof data.entries !== "object" || Array.isArray(data.entries)) {
    throw new Error(T("저장 데이터 형식이 손상되었습니다."));
  }
  const entries = Object.entries(data.entries);
  if (entries.some(([key, value]) => typeof key !== "string" || typeof value !== "string")) {
    throw new Error(T("저장 데이터 형식이 손상되었습니다."));
  }
  return entries;
}

/** 접는 절의 열림 상태를 기억한다.
 *
 *  기본값은 «처음 온 사람에게 무엇을 보여 줄까»로 정한다 — 동기화는 계정이 **하나라도**
 *  있으면 이미 끝난 절차라 접어 두고(유저 지시 2026-08-28), 없으면 펴서 안내한다.
 *  백업은 늘 접어 둔다. 한 번 손대면 그 뒤로는 **사람이 정한 상태**를 따른다. */
function wireFold(id, openByDefault) {
  const d = document.getElementById(id);
  if (!d) return;
  const saved = load(LS.folds, {});
  d.open = id in saved ? !!saved[id] : openByDefault;
  d.addEventListener("toggle", () => {
    const now = load(LS.folds, {});
    now[id] = d.open;
    save(LS.folds, now);
  });
}

function renderBackupCard() {
  const card = $("#backup-card");
  if (!card) return;
  card.textContent = "";
  card.append(el("p", "migration-kicker", T("백업")));
  card.append(el("h2", "migration-title", "전체 데이터 내보내기 · 가져오기"));
  card.append(el("p", "migration-copy",
    "이 브라우저의 저장 데이터 전체(편성·계정·기록·설정)를 JSON 파일 하나로 내보내고, 그 파일로 언제든 되돌립니다."));

  const actions = el("div", "migration-actions");
  const status = el("p", "migration-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const exportBtn = mkBtn(T("전체 데이터 내보내기"), "btn-primary", () => {
    try {
      const payload = makeMigrationExport();
      const stamp = payload.exportedAt.slice(0, 19).replaceAll(":", "-");
      downloadJson(payload, `dildoro-migration-${stamp}`);
      // **옛 주소를 언제 닫아도 되나**를 이 숫자로 정한다(유저 물음 2026-09-06:
      // «데이터를 꺼내고 있긴 하다는 거지?»). 종전에는 «/account 화면이 열렸다»만
      // 세서, 정작 꺼내 갔는지는 알 길이 없었다. **성공했을 때만** 센다.
      hit("계정 내보내기");
      migrationStatus(status,
        T("저장 데이터 {n}개를 파일로 내보냈습니다.", { n: Object.keys(payload.entries).length }), "ok");
    } catch (error) {
      migrationStatus(status,
        T("내보내지 못했습니다. 브라우저의 사이트 데이터 권한을 확인하세요. ({reason})", { reason: error.message || error }), "err");
    }
  });

  const file = el("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  let pending = null;

  // «가져오기»가 곧 파일 창이다 — «고르기»와 «가져오기»를 따로 두면 무엇을 먼저
  // 눌러야 하는지가 안 읽힌다(하나는 늘 비활성이라 더 그렇다). 고른 뒤에만
  // «적용»이 나타나고, 그때 무엇을 덮어쓰는지 상태줄이 말해 준다.
  const importBtn = mkBtn(T("전체 데이터 가져오기"), "btn-primary", () => file.click());
  const applyBtn = mkBtn(T("적용"), "btn-primary", () => {
    if (!pending) return;
    applyBtn.disabled = true;
    importBtn.disabled = true;
    applyBtn.textContent = T("가져오는 중…");
    try {
      replaceLocalStorage(pending);
      hit("계정 가져오기");        // 여기까지 왔으면 실제로 들어갔다
      migrationStatus(status, T("가져왔습니다. 새 데이터로 다시 여는 중…"), "ok");
      setTimeout(() => location.reload(), 650);
    } catch (error) {
      applyBtn.disabled = false;
      importBtn.disabled = false;
      applyBtn.textContent = T("적용");
      migrationStatus(status,
        error.storageRestoreFailed
          ? String(error.message || error)
          : T("가져오지 못했습니다. 기존 데이터는 복구했습니다. ({reason})", { reason: error.message || error }),
        "err");
    }
  });
  applyBtn.hidden = true;                 // 고르기 전에는 누를 것이 없다
  file.onchange = async () => {
    const picked = file.files?.[0];
    file.value = "";
    pending = null;
    applyBtn.hidden = true;
    if (!picked) return;                  // 창을 그냥 닫았다 — 아무 일도 없었던 것으로
    if (picked.size > MIGRATION.maxFileBytes) {
      migrationStatus(status, T("파일이 너무 큽니다."), "err");
      return;
    }
    try {
      pending = parseBackupExport(await picked.text());
      applyBtn.hidden = false;
      migrationStatus(status,
        T("«{name}»에서 저장 데이터 {n}개를 확인했습니다. 적용하면 이 주소의 현재 데이터를 교체합니다.",
          { name: picked.name, n: pending.length }), "warn");
    } catch (error) {
      migrationStatus(status, error.message || String(error), "err");
    }
  };
  actions.append(exportBtn, importBtn, applyBtn, file);
  card.append(actions, status);
  card.append(el("p", "migration-note",
    T("내보낸 파일에는 편성·계정·설정과 비공개 글 열람 정보가 포함될 수 있습니다. 파일은 서버로 전송되지 않으며, 다른 사람에게 보내지 마세요.")));
}

// ── 프로필: 원본(fetched) + 수정본(edits) 2층 ───────────────────────────
// 원본은 절대 고치지 않는다. 그래야 니케 하나만 동기화 값으로 되돌릴 수 있고,
// 다시 싱크해도 수정본이 살아남는다.
function deepMerge(base, over) {
  if (!over) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = (v && typeof v === "object" && !Array.isArray(v)
      && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]))
      ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

const activeRec = () => state.profiles[state.settings.profileId] || null;

// ── 프로필 ──────────────────────────────────────────────────────────────
// 카드 톱니로 고친 육성값(`rec.edits`)을 **이름 붙여 저장해 두고 갈아 끼운다**(유저 지시
// 2026-08-30). 계정을 통째로 복제하지 않는 것이 요점이다 — 계정 하나가 약 120KB인데
// 프로필은 «고친 니케만» 들어 있어 수십 바이트~수 KB다. `fetched`(계정 실값)는 손대지
// 않으므로 «수정본이 원본으로 굳는» 옛 사고(드레이크 우코 44.31%)도 안 난다.
//
//   rec.variants   [{ id, name, edits }]  — 저장해 둔 것들
//   rec.variantId  ""(기본) | id          — 지금 고른 것
//   rec.edits                             — **지금 손댄 것**(작업 층, 예전과 같다)
//
// 결과 캐시 지문은 `profSig()`가 `rec.edits`를 해싱하므로 갈아 끼우면 저절로 새로
// 계산된다 — 따로 손볼 것이 없다.
const VARIANT_MAX = 20;
const variantsOf = (rec) => (rec ? (rec.variants ||= []) : []);
const curVariant = (rec) => variantsOf(rec).find((v) => v.id === rec?.variantId) || null;
/** 고른 프로필과 지금 손댄 것이 다른가 — «되돌리기·저장»을 낼지 정한다. */
function variantDirty(rec) {
  if (!rec) return false;
  const norm = (e) => JSON.stringify({ chars: e?.chars || {},
                                       ...(e?._account ? { _account: e._account } : {}) });
  return norm(rec.edits) !== norm(curVariant(rec)?.edits);
}
/** 고른 프로필을 작업 층에 앉힌다. «기본»이면 비운다. */
function useVariant(rec, id) {
  if (!rec) return;
  rec.variantId = id || "";
  const v = curVariant(rec);
  rec.edits = v ? JSON.parse(JSON.stringify(v.edits || { chars: {} })) : { chars: {} };
  rec.edits.chars ||= {};
  results = {};                    // 지문이 바뀐다 — 옛 결과를 남기지 않는다
  saveAll();
  renderProfilePick(); renderAll();
}
// ── 출시 전 니케의 기본 스펙 ────────────────────────────────────────────────
// 아직 안 나온 니케는 **아무 계정에도 없다** — 프로필이 값을 못 준다. 그렇다고 비워 두면 카드만
// 보이고 계산은 못 한다. 그래서 «누구나 이 정도는 맞춰 온다»는 한 벌을 기본으로 깔아 둔다
// (유저 지시 2026-09-02): 레벨은 본인 동기화와 같게 · 장비 네 칸 5강 · 스킬 10·10·10 ·
// 소장품 SR15 · 3돌파 7코강. 마음에 안 들면 카드 톱니에서 고치면 된다 — 수정 층이 그대로 덮는다.
// 스킬 레벨만은 못 고친다(카드가 레벨 10 수치라 나머지는 지어낸 값이 된다).
const PREVIEW_SKILLS = { 1: 10, 2: 10, 3: 10 };
// 오버로드는 네 칸 모두 «우월 코드 · 공격력 · 장탄» 11단계로 둔다(유저 지시 2026-09-02) — 흔히 맞추는
// 한 벌이다. 계산에 실제로 들어가는 것은 `equip_skills`(12줄을 합친 값)이고, `_ol`은 화면이 줄을
// 보여 주는 데 쓴다(밑줄 키라 시뮬에는 안 나간다).
const PREVIEW_OL = () => Array.from({ length: 4 }, () => ([
  { o: "element_bonus", l: 11 }, { o: "atk_pct", l: 11 }, { o: "max_ammo_pct", l: 11 },
]));
const previewSpec = (name) => {
  const ol = PREVIEW_OL();
  const sp = {
    breakthrough: 3,
    core_enhancement: 7,
    affinity: 30,
    skill_levels: { ...PREVIEW_SKILLS },
    equipment: Object.fromEntries(PARTS.map((k) => [k, { level: 5 }])),
    collection_stage: "SR15",
    _ol: ol,
    equip_skills: deriveEquipSkills(ol),
  };
  // 애장품이 **있는** 니케에만 칸을 만든다 — 없는 니케는 이 키가 아예 없는 것이 규약이고,
  // 0을 넣어 두면 편집 시트에 없는 애장품 줄이 생긴다(유저 지적 2026-09-02).
  if (byName.get(name)?.fav_item) sp.favorite_stage = 0;
  return sp;
};
const isPreview = (name) => !!byName.get(name)?.preview;

const mergedProfile = () => {
  const rec = activeRec();
  if (!rec) return null;
  const out = deepMerge(rec.fetched, rec.edits);
  // 출시 전 니케를 계산에 넣을 수 있게 여기서 채운다 — 서버로 나가는 프로필은 이것 하나다.
  for (const r of ROSTER) {
    if (!r.preview) continue;
    const chars = (out.chars ||= {});
    chars[r.name] = deepMerge(chars[r.name] || previewSpec(r.name), rec.edits?.chars?.[r.name]);
    chars[r.name].skill_levels = { ...PREVIEW_SKILLS };
  }
  return out;
};

/** 니케 한 명의 병합된 육성값. 편집 시트와 카드 배지가 쓴다. */
function charSpec(name) {
  const rec = activeRec();
  if (!rec) return null;
  // 계정에 없으면 출시 전 니케만 기본 한 벌로 세운다 — 나머지는 예전대로 «없음»이다.
  const base = rec.fetched?.chars?.[name] || (isPreview(name) ? previewSpec(name) : null);
  if (!base) return null;
  const sp = deepMerge(base, rec.edits?.chars?.[name]);
  // 출시 전 니케는 **스킬 레벨 10만 참이다** — 공개된 카드가 레벨 10 수치라 나머지 레벨은
  // 우리가 지어낸 값이 된다(유저 지시 2026-09-02). 프로필이 다른 값을 들고 있어도 10으로 본다.
  if (isPreview(name)) sp.skill_levels = { ...PREVIEW_SKILLS };
  return sp;
}
const isEdited = (name) => !!activeRec()?.edits?.chars?.[name];

// ── 코스튬(스킨) ────────────────────────────────────────────────────────
// 블라 프로필이 캐릭터마다 **장착 중인 코스튬 id**를 준다(`_costume`). `_` 접두
// 키라 시뮬에는 안 넘어간다 — 외형뿐이라 딜에는 아무 영향이 없다.
// 그 id로 그림을 찾는 표는 로스터에 구워져 온다(`web/build.py _costumes_for`):
//   rec.costumes = { "30017": {name, img, face, full?, fbb?} }
//
// `charSpec()`을 안 쓴다 — 카드 200장을 그릴 때마다 deepMerge를 돌릴 값이 아니고,
// 코스튬은 카드 톱니(수정 층)에서 건드리는 값도 아니다. 두 층만 직접 본다.
function costumeOf(rec, name) {
  if (!rec?.costumes) return null;
  const a = activeRec();
  const cid = a?.edits?.chars?.[name]?._costume ?? a?.fetched?.chars?.[name]?._costume;
  return cid ? rec.costumes[cid] || null : null;
}
/** 로스터 격자의 초상화는 **화면에 가까워질 때만** 받는다.
 *
 *  `loading="lazy"`만으로는 안 됐다 — 격자가 76px 칸으로 촘촘해서 199장이 브라우저의
 *  «미리 받기» 여유(수천 px) 안에 다 들어온다. 실측: 첫 방문에 초상화 199장 5.0MB가
 *  통째로 실렸다(2026-09-02). 그래서 교차 관찰자로 400px 앞까지만 받는다.
 *  편성 칸·결과·유령(inSlot·compact)은 예전처럼 바로 받는다 — 보이는 자리이고,
 *  복제(cloneNode)해 쓰는 코드가 src가 있다고 믿는다. 관찰자가 없는 브라우저는 바로 받는다. */
const artWatch = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const im = e.target;
        // 격자를 다시 그리면 옛 카드가 떨어져 나간다 — 붙잡고 있지 않는다(메모리).
        if (!im.isConnected) { artWatch.unobserve(im); continue; }
        if (!e.isIntersecting) continue;
        artWatch.unobserve(im);
        // 다른 코드가 먼저 src를 넣었으면(아레나가 얼굴로 바꾼다) 건드리지 않는다.
        if (!im.getAttribute("src") && im.dataset.src) im.src = im.dataset.src;
        delete im.dataset.src;
      }
    }, { rootMargin: "400px" })
  : null;

/** 초상화(256×512) 경로. 스킨을 입고 있으면 그 그림. */
function artSrc(rec, name) {
  return `image/${costumeOf(rec, name)?.img || rec?.img || ""}`;
}
/** 정사각 얼굴 카드(68×68). 스킨 얼굴이 없으면 기본 얼굴 → 초상화 순으로 물러난다. */
function faceSrc(rec, name) {
  return `image/${costumeOf(rec, name)?.face || rec?.face || rec?.img || ""}`;
}
/** 툴팁에 붙일 스킨 이름. 기본 코스튬이면 빈 문자열. */
function skinNote(rec, name) {
  const c = costumeOf(rec, name);
  return c?.name ? ` · ${c.name}` : "";
}

// 32비트 해시 — 수정본이 바뀌면 결과 캐시를 무효화하는 데만 쓴다
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
/** 계정 지문. **이게 없으면 계정을 바꿔도 옛 결과가 그대로 보인다.** */
function profSig() {
  const rec = activeRec();
  if (!rec) return "fixed";
  return `${rec.id}@${rec.fetched?._meta?.fetched_at || "?"}#${hash(JSON.stringify(rec.edits || {}))}`;
}

// `cubes`는 **칸에 붙는다** — 니케 육성이 아니라 그 자리에 끼울 큐브라서다(큐브는
// 인게임에서 자유롭게 갈아끼우는 자원이다). 25칸(5덱×5)이 니케와 별개로 존재하고,
// 자리를 맞바꾸면 큐브도 같이 따라간다(`place`). 덱 순서 변경은 덱 객체를 통째로
// 스왑하므로 그것만으로 큐브 세트가 함께 움직인다. `null`이면 기본값(계정 보유 최고
// → 없으면 러너 기본 렐릭 베어 Lv15).
// 큐브칸 기본값. 재장전 큐브가 사실상 표준이라 여기가 기준선이다.
const CUBE_DEFAULT = { name: "렐릭 베어 큐브", level: 15 };
// 고르개 순서 — 자주 쓰는 것부터. 여기 없는 큐브는 뒤에 가나다순으로 붙는다.
const CUBE_ORDER = ["렐릭 베어 큐브",       // 재장전 속도
                    "택티컬 베어 큐브",     // 탄환 충전
                    "렐릭 디스트로이 큐브", // 파츠 대미지
                    "렐릭 디바이드 큐브"];  // 분배 대미지

const newDeck = () => ({ names: Array(SLOTS).fill(null), control: {},
                         cubes: Array(SLOTS).fill(null) });
const deckOf = (i) => state.decks[i] || (state.decks[i] = newDeck());

/** 버스트 사이클 — **덱에 붙는다.** 보스가 아니라 «이 덱을 어떻게 돌리나»이기 때문이다
 *  (유저 결정 2026-08-28, 피드백 d46cf4f7). 덱 순서를 바꿀 때 덱 객체를 통째로 스왑하므로
 *  큐브처럼 저절로 따라간다. 보스 설정 공유에는 **안 담는다** — 남의 손속도를 받을 이유가
 *  없다. 유니온은 줄마다 제 `battle`을 이미 들고 있어 거기 그대로 둔다. */
const CYCLE_KEYS = ["max_burst_count", "first_burst_time", "burst_switch_delay",
                    "burst_reenter_delay", "burst_regen_time",
                    // 게이지 모델·카메라는 **보스가 아니라 편성**의 이야기다 — 회차 보스
                    // 기본값에 섞이면 보스를 새로 놓을 때마다 남의 실험 설정이 덮인다.
                    "burst_gauge_mode"];
function cycleOf(i) {
  const d = deckOf(i);
  if (!d.cycle) {
    d.cycle = {};
    for (const k of CYCLE_KEYS) d.cycle[k] = BATTLE_DEFAULT[k];
  }
  return d.cycle;
}
/** 지금 화면이 고치는 사이클 상자. 유니온은 줄의 `battle`이 곧 사이클이다. */
const cycleNow = () => (modeNow() === "union" ? battleNow() : cycleOf(state.settings.deck));
/** 그 덱이 쓸 사이클 — 계산 payload가 쓴다. */
function cycleFor(d) {
  if (modeNow() === "union") return battleFor(d);
  const i = state.decks.indexOf(d);
  return cycleOf(i < 0 ? state.settings.deck : i);
}

/** 옛 «선버스트» 플래그를 **자리 순서**로 옮기고 플래그를 지운다 (2026-08-27).
 *
 *  코어는 선버가 켜진 니케들을 **편성 순서대로** 우선 목록에 담고 나머지를 뒤에
 *  잇는다(`burst_priority`). 그러니 켜진 사람을 앞으로, 나머지를 뒤로 — 서로의 순서는
 *  그대로 둔 채 — 다시 늘어놓으면 **같은 우선 목록**이 된다. 계산 결과가 바뀌지 않는
 *  이관이다.
 *
 *  이제 순서는 자리가 표현하므로(버스트 비교·인게임 오토와 같은 규칙) 플래그는 지운다.
 *  두면 코어가 그걸 먼저 봐서 화면의 자리 순서와 실제 순서가 갈린다. */
function burstFirstToOrder(d) {
  if (!d?.control) return false;
  const flagged = Object.keys(d.control).filter((n) => d.control[n]?.burst_first);
  if (!flagged.length) return false;
  const on = new Set(flagged);
  const inDeck = d.names.filter((n) => n && on.has(n));
  // 편성에 없는 이름에 붙은 플래그는 순서와 무관하다 — 지우기만 한다.
  if (inDeck.length) {
    const rest = d.names.filter((n) => !n || !on.has(n));
    d.names = [...inDeck, ...rest];
  }
  for (const n of flagged) {
    delete d.control[n].burst_first;
    if (!Object.keys(d.control[n]).length) delete d.control[n];
  }
  return true;
}
/** 지금 모드의 덱 수. 유니온은 3덱(같은 보스를 여러 덱으로 쳐도 된다). */

/** 유니온 덱이 겨눈 보스의 약점 속성. 솔로는 이 함수를 쓰지 않는다. */
const uWeak = (d) => d?.weak || null;   // null = 아직 안 고름

/** 유니온에서 쓸 니케 레벨. 실제로는 동기화 소대 레벨이지만 계산기이므로 바꿀 수 있다.
 *  비워 두면 프로필의 동기화 레벨을 쓰고, 그것도 없으면 기본값(400)이 남는다. */
function unionLevel() {
  const v = Number(state.settings.unionLevel);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  const sync = activeRec()?.fetched?._account?.synchro_level;
  return Number.isFinite(sync) && sync > 0 ? sync : null;
}

/** 이 덱으로 보낼 니케 레벨. **유니온에서만** 값이 있다 — 솔로레이드는 400 고정이라
 *  계산기 기본값을 그대로 둔다(null). 서버·워커가 캐릭터 오버라이드 `level`로 얹는다. */
const deckLevel = () => (modeNow() === "union" ? unionLevel()
                         : modeNow() === "museum" ? museumLevel() : null);
const isFull = (d) => d.names.every(Boolean);
// 결과 스키마 판. **계산 결과의 뜻이나 모양이 바뀌면 반드시 올린다.**
// 지문에 안 들어 있으면 이미 저장된 결과가 새 뜻의 결과인 척 그대로 남는다.
//   w2 — 위크포인트가 «적 코드»에서 «데려갈 속성»으로 바뀜
//   c3 — 니케별 내역에 기대 크리율(crit_frac 합)이 들어옴
//   c5 — 결과에 최공 대상 버프 진단(top_atk)이 붙음. 옛 캐시에는 그 필드가 없다
//   c6 — 그 진단에 «최저공 타게팅»(리버렐리오 차지 속도)이 함께 들어옴 (`kind`)
// c10: 「투사체 폭발 대미지 ▲」 판정을 출생 무기 기준으로 — 변신으로 RL이 된
//      사격(나유타 등)은 못 받는다. 해당 조합 편성의 결과가 바뀐다.
// c9: 차지 배율(④)을 곱연산에서 가산으로 수정 — 풀차지 배율 + 차지 대미지 %p.
//     차지 무기(SR·RL)가 낀 모든 편성의 결과가 내려간다 (실측 정합).
// c23: K 「정의 실현」의 최대 장탄 ▼가 다른 최대 장탄 ▼와 안 겹친다(원문 «동일 효과 중복 불가»).
//      종전에는 프리바티 「EX 매거진」과 합쳐져 프리바티 탄창이 1발이 됐다 — K와 다른 장탄 ▼가
//      함께 든 편성의 결과가 크게 내려간다(실측 178.12억 → 120.88억, 프리바티 −67%).
// c22: 차임 «나의 왕»(소원·일과 보고·충심)이 크라운 고정 — 종전 «최고 공격력 아군» 근사는
//      딜러에게 새어 딜러가 부풀고 크라운이 줄어 있었다. 차임이 낀 편성의 배분이 바뀐다.
// c21: 샷건 평타의 버스트 게이지에 무기 계수(SG 0.9) — 실누적에서만 걸린다(코어 2929b8d).
// c20: 라플라스 : 얼티밋 히어로 모드 — 탄창 203발·연사 24.5발/초·게이지 계수 0.37(실누적 전용).
// c19: 위 «회차별 한 단계»를 넷 다 되돌린다 — 스킬 원문이 「하위 효과 중복 적용」이라고
//      적는데 반대로 읽었다. 볼륨·리타·헬름 : 아쿠아마린·도라가 c16 이전 값으로 돌아온다.
// c18: 같은 읽기를 리타·헬름 : 아쿠아마린·도라에도 — 리타가 낀 편성이 3분에서 15%까지 내려간다.
// c17: 볼륨 「드랍 더 비트」 쿨감이 회차마다 한 단계 — 3회부터 세 단계가 한꺼번에 들어가던 것을
//      고친다. 볼륨이 낀 편성의 버스트 회차가 줄어 결과가 크게 내려간다(실측 16회 → 13회).
// c16: 위 «예열 완냉 1→2초»를 머신건 전체에서 걷고 아스카 : WILLE에게만 건다 — c15에서
//      다른 머신건까지 바뀌었던 것을 되돌린다(재장전 버프가 큰 머신건이 낀 편성의 결과가 c15 이전으로 돌아온다).
// c15: 아스카 : WILLE 긴급 수복(태세 종료 순간 재장전 중이면 강제 재장전·재장전 고정 안 걸림)
//      + 머신건 예열 완냉 1초→2초 — 아스카가 낀 편성과 재장전 버프가 큰 머신건의 결과가 바뀐다.
// c8: 안 고른 칸의 큐브가 프로필(계정 보유 최고)로 새던 것을 편성 기본값으로 고정 —
//     큐브를 한 번도 안 만진 편성의 결과가 바뀐다.
// c7: 무기군 평타 계수(weapon_coeff) 도입 — SG 기본 0.9라 기본 상태의 결과가 바뀐다.
// 엔진·기본값이 바뀔 때 이 값을 올리지 않으면 캐시가 옛 엔진의 숫자를 재계산 없이
// 보여 준다 (2026-08-24 재장전 수정 때 실제로 겪음).
const CALC_V = "c23";
/** 이번 계산에 쓸 난수. «확률 — 매번 다른 판»이면 부를 때마다 새 시드를 뽑는다.
 *  뽑은 시드는 상자에 적어 둔다 — 결과 옆에 «시드 12345»로 보여 주고, 그 값을 그대로
 *  «시드 고정»에 넣으면 같은 판을 다시 뽑을 수 있다. */
/** 마지막으로 굴린 시드. **상자(battle)에 적지 않는다** — 적으면 지문이 매번 바뀌어
 *  방금 저장한 결과를 곧바로 못 찾는다(실측: «계산 0/5덱»). 이 값은 결과 줄에 적기만 한다. */
let lastSeed = 0;

function rngNow() {
  const b = battleNow();
  const mode = b.rng_mode || "expected";
  if (mode === "expected") return { mode, seed: 0, runs: 1 };
  const runs = mode === "spread"
    ? Math.max(2, Math.min(20, Math.round(Number(b.runs) || BATTLE_DEFAULT.runs)))
    : 1;
  if (mode === "seed") {
    const seed = Math.max(0, Math.round(Number(b.seed) || 0));
    lastSeed = seed;
    return { mode, seed, runs };
  }
  // random·spread — 부를 때마다 새 시드를 뽑는다. 시드는 **넣는 값이 아니라 나온 값**이다.
  const seed = Math.floor(Math.random() * 2147483647);
  lastSeed = seed;
  return { mode, seed, runs };
}

const fingerprint = (d) =>
  JSON.stringify([d.names, CALC_V, state.settings.code, durationNow(), profSig(), deckLevel(),
                  battleSig(), ctrlSig(d), cubeSig(d),
                  // 뮤지엄에서만 한 칸 더 — 보스·주간 버프가 결과를 바꾼다. 솔로·유니온의
                  // 지문은 **글자 하나 안 바뀌어야** 저장된 결과가 그대로 산다.
                  ...(museumSig() ? [museumSig()] : [])]);

/** 큐브 지문. **여기 안 들어가면 큐브를 바꿔도 옛 결과가 그대로 보인다** — 이 앱에서
 *  가장 조용히 틀리는 종류의 버그다(SITE.md §결과 캐시와 지문). 아무 칸도 안 건드리면
 *  짧은 문자열이라 옛 캐시와 호환된다. */
function cubeSig(d) {
  const cu = d.cubes || [];
  if (!cu.some(Boolean)) return "def";
  return JSON.stringify(cu.map((c) => (c ? [c.name, c.level] : 0)));
}

/** 고를 수 있는 큐브 목록(표시 순서)과 그중 기본으로 보이는 것.
 *  `cubeCell`의 화면과 `cubePayload`의 계산이 **같은 답**을 쓰게 하는 단일 출처다. */
function cubeChoices() {
  const names = Object.keys(MAPS?.cube_info || {}).filter((c) => c !== "공통").sort();
  const head = CUBE_ORDER.filter((c) => names.includes(c));
  const ordered = [...head, ...names.filter((c) => !head.includes(c))];
  const def = ordered.includes(CUBE_DEFAULT.name) ? CUBE_DEFAULT.name : ordered[0];
  return { names, ordered, def };
}

/** 그 칸에 **실제로 적용되는** 큐브. 아직 안 고른 칸은 화면에 보이는 기본값이 답이다.
 *  예전에는 안 고른 칸을 계산에서 빼 버려서, 프로필 층(계정에서 관찰된 보유 최고
 *  큐브)이 대신 들어갔다 — 카드에는 «렐릭 베어 Lv15»가 보이는데 계산은 다른 큐브로
 *  도는 상태였다. 편성에 보이는 것이 곧 계산에 들어가는 것이어야 한다. */
function cubeOf(d, i) {
  if (d.cubes?.[i]) return d.cubes[i];
  const { def } = cubeChoices();
  return def ? { name: def, level: CUBE_DEFAULT.level } : null;
}

/** 그 니케가 **인게임에서 실제로 끼고 있는** 큐브. 없으면 `null` — 칸 기본값이 답이다.
 *
 *  편성 계산은 큐브를 «갈아끼우는 자원»으로 보고 칸마다 러너 기본값(렐릭 베어 Lv15)을
 *  쓴다. 그래서 계정 프로필의 장착 사실은 시뮬로 안 넘어가는 `_cube`(UI 전용)에만
 *  적혀 있다(profile_convert.py). 그 사실을 **가져오기 순간에 한 번** 칸에 붙여 주는
 *  것이 여기다 — 프리셋·기록·공유는 이름만 담으므로, 안 붙이면 앞 편성이 쓰던 큐브가
 *  새 니케 밑에 그대로 남는다(제보 2026-08-30).
 *
 *  **안 낀 니케(level 0)는 안 옮긴다.** 장착 상태를 그대로 편성에 쓰면 실전보다 딜이
 *  낮게 나온다 — 실제로 그 니케를 굴릴 때는 끼우기 때문이다(원본 실측 2026-08-24:
 *  안 낀 상태를 0으로 적었더니 그랬다). 그 칸은 기본값으로 두고, 바꾸고 싶으면
 *  카드의 큐브 칸에서 고르면 된다. */
function equippedCube(name) {
  const sp = charSpec(name);
  // 카드 톱니에서 이 니케에 직접 지정한 큐브가 있으면 그게 먼저다.
  const c = sp?.cube || sp?._cube;
  const lv = Number(c?.level);
  if (!c?.name || !(lv > 0)) return null;
  // 고르개에 없는 이름이면 붙이지 않는다 — 카드에 안 보이는 값이 계산에만 들어가면
  // «보이는 것이 계산되는 것»이 깨진다(cubeOf 주석).
  if (!cubeChoices().names.includes(c.name)) return null;
  return { name: c.name, level: lv };
}

/** 칸 큐브 → {니케 이름: {name, level}}. 니케가 있는 칸은 **항상** 실린다. */
function cubePayload(d) {
  const out = {};
  (d.names || []).forEach((nm, i) => {
    if (!nm) return;
    const c = cubeOf(d, i);
    if (c) out[nm] = { name: c.name, level: c.level };
  });
  return Object.keys(out).length ? out : null;
}

/** 컨트롤 지문. 아무것도 안 켜면 짧은 문자열이라 옛 캐시와 호환된다. */
function ctrlSig(d) {
  const c = d.control || {};
  const on = Object.keys(c).filter((n) => d.names.includes(n) && Object.keys(c[n] || {}).length);
  if (!on.length) return "auto";
  return JSON.stringify(on.sort().map((n) => [n, c[n]]));
}
/** 전투 조건 지문. 기본값과 같으면 짧은 문자열이라 옛 캐시와 호환된다. */
function battleSig() {
  const b = battleNow();
  const mode = b.rng_mode || "expected";
  const diff = Object.keys(BATTLE_DEFAULT).filter((k) => {
    // 시드는 «시드 고정»일 때만 조건이다. 굴릴 때마다 바뀌는 값을 지문에 넣으면 방금
    // 저장한 결과를 곧바로 못 찾는다(실측). 회수도 «폭 보기»일 때만 뜻이 있다.
    if (k === "seed" && mode !== "seed") return false;
    if (k === "runs" && mode !== "spread") return false;
    // **없는 열쇠는 기본값으로 친다.** 예전에 저장된 상자에는 나중에 생긴 열쇠가 없다 —
    // `undefined !== 기본값`으로 세면, 손댄 적도 없는 사람의 패널이 새 열쇠가 생긴
    // 날부터 통째로 «고침 *»으로 뜬다.
    const a = k in b ? b[k] : BATTLE_DEFAULT[k], d = BATTLE_DEFAULT[k];
    if (Array.isArray(d)) return JSON.stringify([...a].sort()) !== JSON.stringify(d);
    if (d && typeof d === "object") return JSON.stringify(a) !== JSON.stringify(d);
    return a !== d;
  });
  return diff.length ? diff.map((k) => `${k}=${JSON.stringify(b[k])}`).join(",") : "def";
}

/** 계산기에 넘길 enemy / config. 기본값과 같은 항목은 보내지 않는다. */
/** 계산기에 넘길 «적·전투 조건». 덱을 주면 **그 덱의** 설정으로 만든다 —
 *  유니온은 줄마다 보스도 설정도 다르므로 덱 없이 부르면 안 된다. */
/** 「파츠 보스」 체크·「파츠 파괴 주기」를 같은 뜻의 파츠 구간으로 옮긴다.
 *
 *  둘은 구간으로 **정확히** 대체된다(상용 실측 2026-08-28: 체크만 = 구간 0~전투시간,
 *  체크+주기 N = N초짜리 구간을 끝까지 이어 붙인 것). 구간 쪽이 «언제 떠 있나»를 그대로
 *  적으므로, 두 곳에서 따로 정하던 것을 한 곳으로 합쳤다.
 *
 *  이미 파츠 구간을 넣어 둔 사람은 건드리지 않는다 — 그쪽이 더 정확한 설정이다. */
function partsToPhases(b, dur) {
  if (!b) return;
  const had = b.has_parts === true;
  const iv = Number(b.part_break_interval) || 0;
  delete b.has_parts;
  delete b.part_break_interval;
  if (!had) return;
  b.phases ||= [];
  if (b.phases.some((p) => p.kind === "parts")) return;
  const win = [];
  if (iv > 0) {
    for (let t = 0; t + iv <= dur && win.length < PHASE_MAX; t += iv) {
      win.push({ kind: "parts", t0: t, t1: t + iv });
    }
  }
  if (!win.length) win.push({ kind: "parts", t0: 0, t1: dur });
  b.phases = [...b.phases, ...win].slice(0, PHASE_MAX);
}

function battlePayload(d = null) {
  const b = battleFor(d);
  const cy = cycleFor(d);          // 사이클은 **덱**에서 온다(유니온은 줄의 battle)
  const enemy = {
    code: d ? enemyCodeFor(d) : enemyCode(),
    def: b.def, core_px: b.core_px,
    optimal_range_weapons: [...b.optimal_range_weapons],
    weapon_coeff: { ...b.weapon_coeff },
  };
  // 구간은 **있을 때만** 보낸다 — 빈 목록을 보내도 코어는 같은 값을 주지만(계약 §4),
  // 요청에 없는 편이 «안 쓰는 기능»이라는 것이 분명하다.
  // **갈라 보낸다** — 파츠는 `enemy.parts`, 나머지는 `enemy.phases`(계약 §4).
  const all = cleanPhases(b.phases);
  const ph = all.filter((p) => p.kind === "element_gate" || p.kind === "immune"
                               || p.kind === "pierce_gate");
  // 파츠가 여럿이면 **구간을 여럿 넣는다** — 개수 칸은 뺐다(유저 지시 2026-08-28).
  // 개수만 적어 봐야 «언제 몇 개가 떠 있나»를 말할 수 없고, 코어도 그 숫자를 안 쓴다.
  const pt = all.filter((p) => p.kind === "parts").map((p) => ({ t0: p.t0, t1: p.t1 }));
  const cw = all.filter((p) => p.kind === "core").map((p) => ({ t0: p.t0, t1: p.t1 }));
  // 적정거리 구간 — **위에서 켠 무기군을 합쳐** 보낸다. 화면 규칙(«위에서 고른 것은 판
  // 내내 적정, 아래 구간은 나머지 무기군에만»)을 여기서 한 벌로 풀어 두면, 엔진은
  // «이 창의 적정거리 무기군은 이것»만 알면 된다.
  const rw = all.filter((p) => p.kind === "range")
    .map((p) => ({
      kind: "range", t0: p.t0, t1: p.t1,
      weapons: WEAPONS.filter((w) => b.optimal_range_weapons.includes(w) || (p.weapons || []).includes(w)),
    }));
  // 적정거리 창도 **같은 `phases` 목록**에 실린다(코어 합의 2026-09-01) — 엔진이 읽는
  // 자리만 다르다(저지·족자는 히트를 만든 뒤 0으로, 적정거리는 만들기 전에 정해진다).
  if (ph.length || rw.length) enemy.phases = [...ph, ...rw].sort((x, y) => x.t0 - y.t0);
  if (pt.length) enemy.parts = pt;
  if (cw.length) enemy.core_windows = cw;
  if (b.core_pierceable) enemy.core_pierceable = true;
  const config = {
    duration: durationNow(),
    first_burst_time: cy.first_burst_time,
    burst_switch_delay: cy.burst_switch_delay,
    burst_reenter_delay: cy.burst_reenter_delay,

    burst_regen_time: cy.burst_regen_time ?? BATTLE_DEFAULT.burst_regen_time,
  };
  // 0은 «무제한»이라는 뜻이고 계산기에서는 null이다 — 0을 그대로 보내면 한 번도 못 쓴다
  if (cy.max_burst_count > 0) config.max_burst_count = cy.max_burst_count;
  // 뮤지엄 주간 버프 — 전원 상시 버프로 코어에 넘긴다(`extra_squad_buffs`, 계약 §4).
  // 종류는 보스가 정하고(분배·코어·관통) 수치는 화면에서 적은 %다. 0이면 안 보낸다.
  if (modeNow() === "museum") {
    const buffs = museumBuffList();
    if (buffs.length) config.extra_squad_buffs = buffs;
  }
  // 난수 — **기대값이 아닐 때만** 실어 보낸다. 매번 실으면 안 건드린 사람의 지문까지
  // 바뀌어 예전 결과가 통째로 다시 계산된다.
  const rng = rngNow();
  if (rng.mode !== "expected") {
    config.rng_mode = "random";
    // 시드는 **문자열로** 보낸다 — 자바스크립트 수는 큰 정수를 정확히 못 담는다(2^53).
    // 코어는 `"777"`과 `777`을 같은 값으로 읽는다(코어 세션 2026-08-31).
    config.seed = String(rng.seed);
    // «폭 보기»는 한 요청 안에서 여러 판을 돌린다 — 왕복은 한 번이고 계산만 N배다.
    if (rng.runs > 1) config.runs = rng.runs;
  }
  // 실누적 게이지. **켰을 때만** 실어 보낸다 — "fixed"를 매번 실으면 안
  // 건드린 사람의 지문까지 바뀌어 예전 결과가 통째로 다시 계산된다.
  if (cy.burst_gauge_mode === "accumulate") {
    config.burst_gauge_mode = "accumulate";
    // 카메라는 **가운데(3번) 자리로 못 박는다**(유저 결정 2026-08-29). 인게임 기본이
    // 가운데 한 명이고, 고르게 해 봐야 «자동»과 다른 값을 넣을 일이 거의 없다 —
    // 실측: 차지 니케가 없는 덱은 무엇을 골라도 값이 한 푼도 안 바뀌고(0.000%),
    // 차지가 하나면 그 하나가 답이라 고를 것이 없다(차지 하나짜리 덱에서 보느냐
    // 마느냐는 6.5%까지 벌어지지만, 그 «하나»가 곧 답이라 물어볼 것이 없다).
    //
    // **나중에 낸다면 «카메라»가 아니라 «버충 구간에 누구 잡기»로 낸다**(유저 착안).
    // 이 값이 실제로 먹는 곳이 충전 창(풀버스트 종료 → 1단계)뿐이고, 사람이 하는
    // 일도 그 사이에 누구를 잡고 있느냐다. 「카메라」는 코어 쪽 낱말이지 손에 잡히는
    // 말이 아니다.
    //
    // **코어에 맡기지 않고 이름을 적어 보낸다.** 코어의 유도 규칙은 «컨트롤 켠 차지
    // 니케가 딱 하나면 그 사람, 아니면 3번 자리»라, 3번이 아닌 사람이 뽑힐 수 있다.
    // 자리가 비면 안 보낸다 — 빈 문자열은 «아무도 안 봄»이라는 뜻이라 보내면
    // 풀차지 게이지가 통째로 죽는다.
    const mid = (d?.names || [])[2];
    if (mid) config.camera = mid;
  }
  return { enemy, config };
}
const resultOf = (d) => (isFull(d) ? results[fingerprint(d)] : null);
const pendingDecks = () => [...Array(deckCountNow()).keys()]
  .filter((i) => isFull(deckAt(i)) && !resultOf(deckAt(i)));

/** 니케별 딜을 **배치 순서**로 늘어놓는다 — 딜 순 아님. 편성을 보면서 대조하려는
 *  화면(결과·기록 상세·복사)이 전부 이 순서를 쓴다. `chars`에 없는 이름은 빼고,
 *  `names`에 없는 이례적인 키(있을 일은 없지만)는 뒤에 붙여 값을 잃지 않는다. */
function charsByFormation(names, chars) {
  chars = chars || {};
  const order = (names || []).filter(Boolean);
  const inOrder = order.filter((nm) => nm in chars).map((nm) => [nm, chars[nm]]);
  const extra = Object.entries(chars).filter(([nm]) => !order.includes(nm));
  return [...inOrder, ...extra];
}

// ── 덱 조작 ─────────────────────────────────────────────────────────────
function place(name, deckIdx, slotIdx) {
  const d = deckOf(deckIdx);
  const at = d.names.indexOf(name);
  if (at === slotIdx) return;
  const displaced = d.names[slotIdx];
  // 덮어썼으면 그 칸에서 되돌릴 수 있어야 한다 — 빈 칸이 안 생겨 실수를 더 못 알아챈다
  sSnap(displaced && displaced !== name ? T("{displaced} → {name} 교체", { displaced, name }) : T("{name} 배치", { name }),
        displaced && displaced !== name ? { deckIdx, idx: slotIdx } : null);
  d.names[slotIdx] = name;
  // 큐브칸은 자리에 붙지만 **자리를 맞바꾸면 같이 따라간다** — 그래야 「이 니케에
  // 이 큐브」라는 짝이 드래그 뒤에도 유지된다(deckOf 주석).
  d.cubes ||= Array(SLOTS).fill(null);
  if (at !== -1) {
    d.names[at] = displaced;   // 같은 덱 안에서 옮기면 자리 교환
    [d.cubes[at], d.cubes[slotIdx]] = [d.cubes[slotIdx], d.cubes[at]];
  } else {
    // 다른 덱에 이미 있던 걸 끌어왔으면 그 자리에 원래 있던 아이(displaced)를
    // 보낸다 — 두 덱에 걸쳐 자리를 맞바꾼다. 그냥 비우면(null) 놓인 자리에
    // 있던 니케가 사라진 것처럼 보인다(유저 피드백: 서로 바뀌어야지 사라지면
    // 안 된다). 대상 칸이 비어 있었으면(displaced가 null) 그대로 비워 둔다 —
    // 5덱 배치 모드는 25칸이 한 화면에 있어 덱 간 드래그가 가능하다.
    for (let i = 0; i < DECK_COUNT; i++) {
      if (i === deckIdx) continue;
      const other = deckOf(i);
      const oi = other.names.indexOf(name);
      if (oi !== -1) {
        other.names[oi] = displaced;
        other.cubes ||= Array(SLOTS).fill(null);
        [other.cubes[oi], d.cubes[slotIdx]] = [d.cubes[slotIdx], other.cubes[oi]];
        break;
      }
    }
  }
  saveAll();
  renderAll();
}

/** 누르기 경로 — 활성 덱의 첫 빈 슬롯에 넣는다. 꽉 찼으면 '고른 상태'로 둔다. */
function tapPlace(name) {
  // 유니온은 자기 저장소로 간다 — 솔로 덱을 건드리면 안 된다
  if (modeNow() === "union") return uTapPlace(name);
  const d = deckOf(state.settings.deck);
  const at = d.names.indexOf(name);
  if (at !== -1) { d.names[at] = null; saveAll(); renderAll(); return; }  // 다시 누르면 뺀다
  const empty = d.names.indexOf(null);
  if (empty !== -1) { place(name, state.settings.deck, empty); picked = null; return; }
  picked = picked === name ? null : name;
  setStatus(picked ? T("{picked} — 놓을 슬롯을 누르세요", { picked }) : "", false);
  renderAll();
}

/** 유니온 누르기 — 세 줄을 위에서부터 훑어 첫 빈 칸에 넣는다.
 *  이미 어딘가에 있으면 뺀다(솔로와 같은 손버릇). 중복 편성은 불가라 한 명은 한 자리다. */
function uTapPlace(name) {
  uSnap(T("{name} 배치/빼기", { name }));
  for (let i = 0; i < UNION_DECKS; i++) {
    const at = uDeck(i).names.indexOf(name);
    if (at !== -1) { uDeck(i).names[at] = null; saveAll(); renderAll(); return; }
  }
  for (let i = 0; i < UNION_DECKS; i++) {
    const empty = uDeck(i).names.indexOf(null);
    if (empty !== -1) {
      uDeck(i).names[empty] = name; picked = null; saveAll(); renderAll();
      slamSlot(i, empty);            // 눌러서 담아도 «쾅»은 똑같이 난다
      return;
    }
  }
  picked = picked === name ? null : name;
  setStatus(picked ? T("{picked} — 놓을 칸을 누르세요", { picked }) : "", false);
  renderAll();
}

// 솔로 되돌리기 — 유니온과 **같은 규약, 다른 상자**다. 한 번 실수로 빼면 다시 짜기가
// 성가신 것은 어느 쪽이나 같다. 계산 결과는 이름으로 찾으므로(fingerprint) 되돌리면
// 옛 결과가 그대로 다시 붙는다.
const SUNDO_MAX = 40;
let sUndo = [];

/** 바꾸기 직전의 5덱을 찍는다. `at`은 «그 자리에서 되돌릴 수 있는 일»의 좌표다. */
function sSnap(label, at = null) {
  if (modeNow() === "union") return;
  sUndo.push({ label, at, decks: JSON.parse(JSON.stringify(state.decks)) });
  if (sUndo.length > SUNDO_MAX) sUndo.shift();
}

/** 그 칸이 «방금 손댄 자리»인가 — 맞으면 되돌리기 단추가 뜬다. */
function sUndoSpotAt(deckIdx, idx) {
  const top = sUndo[sUndo.length - 1];
  return top?.at && top.at.deckIdx === deckIdx && top.at.idx === idx ? top : null;
}

function sUndoLast() {
  const last = sUndo.pop();
  if (!last) return;
  state.decks = last.decks.map((d) => ({ ...d, names: [...d.names] }));
  picked = null;
  saveAll();
  renderAll();
  flashStatus(T("되돌렸습니다 — {label}", { label: last.label }));
}

function clearSlot(deckIdx, slotIdx) {
  const who = deckOf(deckIdx).names[slotIdx];
  if (who) sSnap(T("{who} 빼기", { who }), { deckIdx, idx: slotIdx });
  deckOf(deckIdx).names[slotIdx] = null;
  saveAll();
  renderAll();
}

// 솔로레이드는 덱 간 중복이 불가하다. 풀에서 잠그되 경고도 함께 남긴다.
function duplicated() {
  const seen = new Map();
  const decks = modeNow() === "union" ? U().decks : state.decks;
  for (const d of decks) for (const n of d.names) if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
  return new Set([...seen].filter(([, c]) => c > 1).map(([n]) => n));
}

function toggleFav(name) {
  const i = state.favs.indexOf(name);
  if (i === -1) state.favs.push(name);
  else state.favs.splice(i, 1);
  saveAll();
  renderPools();          // 전투력 계산기 격자도 같은 카드를 쓴다 — 한쪽만 그리면 표시가 어긋난다
}

// ── 카드 ────────────────────────────────────────────────────────────────
function card(name, opts = {}) {
  const rec = byName.get(name);
  const sp = charSpec(name);
  const fig = el("figure", "nk");
  fig.dataset.name = name;
  // 등급은 **색**이다 (SSR 금색 · SR 보라 · R 파랑). 텍스트 배지를 두지 않는다.
  if (rec?.rare) fig.dataset.rare = rec.rare;
  fig.ondragstart = () => false;
  if (opts.dim) fig.classList.add("dim");
  if (opts.on) fig.classList.add("on");
  if (opts.dup) fig.classList.add("dup");
  if (picked === name) fig.classList.add("picked");
  if (opts.usedIn) fig.classList.add("used");
  // 인접 버프는 카드 하나하나에 테두리를 두르지 않는다 — **묶인 3명 전체**를
  // 사각형 하나로 감싼다(`renderSlots()`의 `.adj-frame`). 카드마다 따로 두르면
  // 「셋이 한 무리」라는 느낌이 안 살고 뭘 여러 번 두른 것처럼 산만해진다.
  // 인게임처럼 우상단에 파티 번호. 지금 덱이면 그 번호, 다른 덱이면 그 덱 번호다.
  fig.tabIndex = opts.dim ? -1 : 0;

  // 5덱 배치 모드 — 얼굴만 보이는 정사각형 카드. 배지·이름 띠·별을 다 걷어내
  // 25칸을 한 화면에 욱여넣는다. 이름은 title 툴팁으로만 남는다.
  //
  // 초상화(256×512)를 잘라 억지로 정사각형을 만들지 않는다 — 캐릭터마다 머리
  // 위치가 달라 하나의 크롭 기준으로는 다 안 맞았다(유저 피드백: 얼굴이 잘려
  // 보인다). 대신 인게임 스쿼드 목록이 실제로 쓰는 68×68 얼굴 카드(`rec.face`,
  // scraper/cdn_face.py 수집)를 그대로 쓴다 — 이미 정사각으로 잘 잡혀 있다.
  if (opts.compact) {
    fig.classList.add("compact");
    fig.title = name + skinNote(rec, name);
    const art = el("div", "nk-art");
    if (rec?.face || rec?.img) {
      const img = el("img");
      img.src = faceSrc(rec, name);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      art.append(img);
    } else art.append(el("span", "nk-noart", name));
    fig.append(art);
    if (opts.dmg != null) fig.append(el("span", "nk-dmg", `${I18N.dmg(opts.dmg)}`));
    return fig;
  }

  // 오른쪽은 왼쪽 배지 레일과 짝을 이루는 우리 쪽 레일이다 — 위에서부터
  // 파티 번호(인게임 위치) · 즐겨찾기 · 설정. 예전엔 설정이 우하단이라 MAX 배지와
  // 겹쳤다.
  // 오른쪽 레일 — 위에서부터 ⚙ · ★. 파티 번호는 좌측 배지 레일 맨 위로 갔다
  // (⚙가 우상단을 쓰므로 겹친다).
  const railR = el("div", "nk-rail-r");
  fig.append(railR);

  // 아직 안 나온 니케 — 그림과 기본값은 있고 스킬만 없다. 흐린 카드가 왜 흐린지 말해 준다.
  if (rec?.preview) {
    fig.classList.add("nk-preview");
    fig.append(el("span", "nk-soon", T("출시 예정")));
  }

  const art = el("div", "nk-art");
  if (rec?.img) {
    const img = el("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;                // 네이티브 이미지 드래그가 포인터를 가로챈다
    img.width = 256; img.height = 512;    // 레이아웃이 이미지 도착을 기다리지 않게
    if (opts.inSlot || !artWatch) img.src = artSrc(rec, name);
    else { img.dataset.src = artSrc(rec, name); artWatch.observe(img); }
    art.append(img);
  } else art.append(el("span", "nk-noart", name));
  fig.append(art);

  // 좌측 배지 레일 — 속성 · 버스트 · 역할군 · 소장품(우리가 더한 슬롯)
  // 인게임 좌측 레일: 속성 → 역할군 → 버스트 → 애장품 하트. 네 육각이다.
  const rail = el("div", "nk-rail");
  if (opts.party) rail.append(el("span", "nk-party", `P${opts.party}`));
  rail.append(badgeImg(ELEMENT_ICON[rec?.element], rec?.element, "bdg-code"));
  rail.append(badgeImg(CLASS_ICON[rec?.cls], rec?.cls, "bdg-cls"));
  rail.append(badgeImg(BURST_ICON[rec?.burst], T("버스트 {v}", { v: rec?.burst ?? "?" }), "bdg-burst"));
  if (sp) {
    const g = gradeBadge(sp, name);
    if (g) rail.append(g);
  }
  fig.append(rail);

  // 하단 — 인게임 구조: 사선으로 잘린 어두운 띠에 **기업 엠블럼이 별 뒤로 깔리고**,
  // 그 아래 줄이 이름이다. 맨 아래 등급색 마감선이 카드를 닫는다.
  // (버프 뱃지는 여기 안 들어간다 — foot의 사선 마스크가 상자 밖으로 나간 것을
  // 지워 버려서 다른 자리에 따로 띄운다. 아래 `opts.adj` 블록 참고.)
  const foot = el("div", "nk-foot");
  const line1 = el("div", "nk-line1");
  if (sp) {
    const st = starInfo(rec?.rare, sp.breakthrough, sp.core_enhancement);
    const stars = el("div", "nk-stars");
    for (let i = 0; i < st.max; i++) {
      const im = el("img");
      im.src = `image/icon/${i < st.active ? STAR_ON : STAR_OFF}`;
      im.alt = ""; im.draggable = false;
      stars.append(im);
    }
    if (st.max) line1.append(stars);
    if (st.breakNum) {
      const c = el("span", "nk-core" + (st.breakNum === "MAX" ? " max" : ""),
                   st.breakNum === "MAX" ? "MAX" : String(st.breakNum));
      c.title = T("돌파 {v} · 코어 강화 {v1}", { v: sp.breakthrough ?? 0, v1: sp.core_enhancement ?? 0 });
      line1.append(c);
    }
  }
  foot.append(line1);

  const nm = el("div", "nk-nm");
  const track = el("span");
  track.append(el("i", null, name));
  nm.append(track);
  foot.append(nm);
  fig.append(foot);

  // 뱃지는 **이웃한테만** 단다 — 본인 카드는 테두리(위 `adjbuff` 클래스)로만
  // 「무리에 묶여 있다」를 표시하고, 「내가 내 버프를 받는다」는 새삼스러운 뱃지는
  // 안 붙인다.
  const adjOthers = opts.adj?.filter((h) => !h.self) || [];
  if (adjOthers.length) {
    // 별·코강 줄 바로 위에 뜨는 버프 뱃지 — **`foot`의 형제**로 붙인다. `foot` 안에
    // 넣으면 사선 마스크(`clip-path`)가 상자 밖으로 나간 부분을 지워 버리고(실측:
    // 사라져 안 보임), 그 자리를 만들려고 `foot` 안에서 높이를 늘리면 사선 띠
    // 모양까지 같이 바뀐다(실측: 커지거나 작아짐). 형제로 두면 `foot`는 원래
    // 모양 그대로고, 뱃지는 `foot` 위(z-index)에서 마스크를 안 타 잘리지 않는다.
    // 정확한 높이(별 줄 바로 위)는 카드가 실제로 화면에 붙은 뒤에만 잴 수 있어
    // `positionAdjBuffs()`가 삽입 직후 한 번 더 잡아 준다.
    const buffs = el("div", "nk-buffs");
    const byCaster = new Map();
    for (const h of adjOthers) if (!byCaster.has(h.caster)) byCaster.set(h.caster, h.buffs);
    for (const [caster, cbuffs] of byCaster) {
      // 육각 하나에 글자 하나 — «루»(루주)·«플»(플로라)처럼 첫 글자만으로 누구인지
      // 짐작이 간다. 정확한 버프 이름은 툴팁에 있다.
      const b = el("span", "bdg bdg-adj", caster.slice(0, 1));
      b.title = T("{caster}의 양옆 버프 — {v}", { caster, v: (cbuffs || []).map((x) => T(x)).join(" · ") });
      const sig = ADJ_COLOR[caster];
      if (sig) b.style.setProperty("--adj-c", sig);
      buffs.append(b);
    }
    fig.append(buffs);
    fig._adjBuffs = buffs;
  }

  if (sp) {
    const cog = el("button", "nk-cog" + (isEdited(name) ? " edited" : ""), "⚙");
    cog.type = "button";
    cog.title = isEdited(name) ? T("육성 수정됨 — 눌러서 보기") : T("이 니케만 육성 수정");
    cog.onclick = (e) => { e.stopPropagation(); openSheet(name); };
    // 오른쪽 레일 맨 아래. 스쿼드에서는 ✕ 아래, 로스터에서는 ★ 아래에 선다.
    railR.append(cog);
  }
  // 계산 신뢰도 딱지 — **톱니 바로 아래**(유저 지시). 편성 슬롯에서는 ✕ · ⚙ 다음이라
  // 카드 오른쪽 어깨에 세로로 셋이 선다. 글자를 안 쓰고 색 있는 동그라미에 «!»만
  // 넣는다 — 다섯 장에 문장을 붙일 자리가 없고, 무엇이 문제인지는 편성 상자가 말한다.
  const cst = charStatus(name);
  if (cst) {
    const mark = el("span", "nk-stat", "!");
    mark.dataset.k = cst.status;
    mark.title = charStatusLine(name, cst);
    railR.append(mark);
  }
  if (!opts.inSlot) {
    // 즐겨찾기 — 인게임 로스터 카드의 북마크 자리(우상단)를 그대로 쓴다
    const fav = el("button", "nk-fav" + (state.favs.includes(name) ? " on" : ""), "★");
    fav.type = "button";
    fav.title = T("즐겨찾기 — 위쪽 ★ 버튼을 켜면 즐겨찾기한 니케만 보입니다");
    fav.onclick = (e) => { e.stopPropagation(); toggleFav(name); };
    railR.append(fav);
  }

  return fig;
}

function badgeImg(file, title, extra = "") {
  const s = el("span", "bdg" + (extra ? " " + extra : ""));
  if (file) {
    const i = el("img");
    i.src = `image/icon/${file}`;
    i.alt = "";
    i.draggable = false;
    s.append(i);
  }
  if (title) s.title = title;
  return s;
}

/** 소장품/애장품 배지 — **인게임 아이템 그림 그대로**.
 *
 *  그림은 `scraper/cdn_icons.py`가 인게임 CDN(`/icon/favoriteitem/*`)에서 뽑아 온 것이고,
 *  조회는 두 갈래다. 애장품(SSR)은 캐릭터 전용이라 **이름**으로, 소장품(R·SR)은 무기군
 *  공용이라 **등급+무기군**으로 찾는다 — CSV에는 아이템 id가 없어 id로는 못 찾는다.
 *  그림을 못 찾으면 예전처럼 색 다이아로 물러난다. */
/** 인게임과 같은 **하트 육각**. 배경/하트 색 조합이 곧 상태다.
 *
 *  | 상태                    | 육각 배경 | 하트   |
 *  |-------------------------|-----------|--------|
 *  | R·SR **15레벨 미만**    | 흰색      | 등급색 |
 *  | **R15 · SR15** (만레벨) | 등급색    | 흰색   |
 *  | **애장품 3단계**        | 검정      | 주황   |
 *  | 애장품 1·2단계          | 흰색      | 주황   |
 *
 *  실제 아이템 그림(`image/icon/si_favoriteitem_*`)도 갖고 있지만, 20px 배지에 인형·
 *  커피잔 그림을 넣으면 정보가 아니라 장식으로 보인다. 그림은 자리가 있는 편집 시트에서 쓴다. */
function gradeBadge(sp, name) {
  const fav = sp.favorite_stage;
  if (fav != null && fav > 0) {
    // 애장품 등급은 늘 SSR(주황)이고, 만단계(3)에서만 배경이 검정으로 뒤집힌다
    return favBadge(fav >= 3 ? "max-ssr" : "sub", "var(--color-grade-ssr)",
                    T("애장품 {fav}단계", { fav }));
  }
  const st = sp.collection_stage;
  if (!st || st === "없음") return null;
  const m = /^(SSR|SR|R)(\d*)$/.exec(st);
  const grade = m ? m[1] : "R";
  const lv = m && m[2] ? Number(m[2]) : 0;
  const color = grade === "SSR" ? "var(--color-grade-ssr)"
    : grade === "SR" ? "var(--color-grade-sr)" : "var(--color-grade-r)";
  return favBadge(lv >= 15 ? "max" : "sub", color, T("소장품 {st}", { st }));
}


/** 계산을 얼마나 믿을 수 있나 — 확인 안 된 니케에만 붙는 딱지.
 *
 *  로스터에 구워 온다(`build.py _char_status` ← 코어 저장소의 `data/char_status.json`).
 *  **`verified`는 아예 안 실려 온다** — 표시가 없는 것이 곧 «확인됨»이다. 다 붙이면
 *  화면이 배지로 도배되고, 정작 조심해야 할 니케가 안 보인다.
 *
 *  글자 대신 **색과 동그라미**로 말한다. 카드 다섯 장에 문장을 붙일 자리가 없고,
 *  「무엇이 문제인가」는 눌러서(툴팁·편성 상자) 읽으면 되는 것이라서다. */
// 필터 줄에 쓰는 이름과 순서. «표시 없음»은 딱지가 없는 상태다 — **«검증됨»이 아니다**:
// 이 계산기는 전부 실측 보정 없이 스킬 원문으로 계산하므로 «검증»을 말할 자리가 없다
// (유저 결정 2026-08-31, 같은 이유로 «초안» 딱지를 걷었다).
const ACC_ORDER = ["verified", "preview", "verifying", "unsupported", "bug"];
const ACC_LABEL = { verified: "표시 없음", preview: "출시 전", verifying: "확인중",
                    unsupported: "미지원", bug: "계산 오류" };

const CHAR_STATUS = {
  bug: { label: "계산 오류", tip: "지금 계산이 틀린 것으로 확인된 니케입니다 — 수정 대기" },
  verifying: { label: "확인중", tip: "지금 손보는 중입니다 — 값이 바뀔 수 있습니다" },
  // «확인중»과 뜻이 다르다(유저 지시 2026-09-02) — 확인중은 우리가 손보는 중이고,
  // 출시 전은 게임에 아직 없어서 공개된 카드밖에 근거가 없는 상태다.
  preview: { label: "출시 전", tip: "게임에 아직 없는 니케입니다 — 공개된 카드로만 계산합니다" },
  unsupported: { label: "미지원", tip: "계산기가 아직 다루지 못하는 니케입니다" },
};

/** 그 니케의 딱지 `{ status, label, tip, note }` — 없으면 null. */
function charStatus(name) {
  const st = byName.get(name)?.status;
  const meta = st && CHAR_STATUS[st];
  if (!meta) return null;
  return { status: st, label: meta.label, tip: meta.tip, note: byName.get(name)?.note || "" };
}

/** 사람이 읽는 한 줄 — «클레이 · 미지원 : 계산기가 아직 다루지 못하는 …». */
/** «이름 · 딱지 : 안내문». **안내문도 사전을 태운다** — `data/char_status.json`이
 *  한국어로만 적혀 있어서 영문 화면에 «Helm · Miscalculated : 일반 공격 전용…»처럼
 *  뒷부분이 통째로 한글로 남았다(2026-08-30 실측). 사전에 없으면 한국어 그대로 나오므로
 *  코어가 문구를 고쳐도 화면이 깨지지 않는다 — 번역만 뒤늦게 따라붙는다. */
const charStatusLine = (name, st) =>
  T("{name} · {label}", { name, label: T(st.label) }) + (st.note ? ` : ${T(st.note)}` : "");

function favBadge(mode, color, title) {
  const s = el("span", "bdg bdg-fav");
  s.dataset.fav = mode;
  s.title = title;
  s.style.setProperty("--grade", color);
  return s;
}


// ── 렌더 ────────────────────────────────────────────────────────────────
function renderAll() {
  renderBench();
  renderDeckTabs(); renderSlots(); renderScore(); renderPools(); renderResults();
  buildControl(); renderTopAtk(); renderLowAtk(); renderCompWarn();
  if (fastMode) { renderFastGrid(); renderFastTotal(); }
}

/** 5명이 다 찼을 때만 — 편성이 «성립은 하지만 놓친 게 있는» 흔한 실수 세 가지를
 *  본다. 계산 없이 이름만 보고 즉시 답할 수 있는 것들만 다룬다(정확한 값은
 *  계산 결과가 답한다는 이 앱의 다른 진단들과 같은 방침).
 *
 *  ① 약점 저지 — 캐릭터 속성이 지금 고른 약점 코드와 하나도 안 맞으면
 *     상성 우월 보너스를 통째로 못 받는다.
 *  ② 버스트 쿨타임 감소 — 아군 전체에게 주는 니케가 하나도 없으면 사이클이
 *     길어져 3버가 밀린다(계산은 정상이지만 실전에서 체감이 다르다는 뜻).
 *  ③ 풀버스트 순환 — 1·2·3단계 버스트가 다 있어야 풀버스트가 열린다
 *     (`burstStages`, 리버렐리오 진단이 이미 쓰던 것과 같은 판정). */
function renderCompWarn() {
  const box = $("#deck-compwarn");
  if (!box) return;
  const d = deckOf(state.settings.deck);
  const names = d.names.filter(Boolean);

  // **먼저** 말한다 — «못 박힌 버스트 단계». 배지에는 «A»(어느 단계든 메움)라고 적혀
  // 있는데 계산은 한 단계로만 돌리므로, 결과를 보기 전에 알고 있어야 오해가 없다.
  // 5명이 다 차기 전에도 보여 준다(아래 진단들과 달리 계산이 아니라 «규칙»이라서다).
  const pins = names.filter((n) => byName.get(n)?.burst_stage
    && String(byName.get(n).burst_stage) !== String(byName.get(n).burst));

  /** 계산 신뢰도 딱지 줄. 카드의 «!» 동그라미가 가리키는 그 내용을 **문장으로** 편다 —
   *  배지는 「무엇이 있다」만 말할 수 있고, 「무엇이 어떻게 부정확한가」는 여기서 읽는다.
   *  버스트 고정 안내와 같은 규약으로 5명이 차기 전에도 보여 준다. */
  const statLines = () => names.map((n) => [n, charStatus(n)]).filter(([, st]) => st)
    .map(([n, st]) => {
      const line = el("p", "squad-warn-line stat", charStatusLine(n, st));
      line.dataset.k = st.status;
      line.title = T(st.tip);
      return line;
    });

  if (names.length < 5) {
    box.textContent = "";
    const stats = statLines();
    box.hidden = !pins.length && !stats.length;
    for (const n of pins) {
      box.append(el("p", "squad-warn-line pin", T("{name}는 {v}버로 고정해 계산합니다.",
                                                  { name: n, v: burstStageOf(n) })));
    }
    for (const line of stats) box.append(line);
    return;
  }

  const warns = pins.map((n) => T("{name}는 {v}버로 고정해 계산합니다.",
                                  { name: n, v: burstStageOf(n) }));
  if (state.settings.code) {
    const hasElem = names.some((n) => elementsOf(byName.get(n)).includes(state.settings.code));
    if (!hasElem) warns.push(T("약점 {code}에 우월한 속성이 없습니다.", { code: state.settings.code }));
  }
  if (!names.some((n) => CDR_CASTERS.has(n))) {
    warns.push(T("아군 전체 버스트 쿨타임 감소가 없습니다 — 3버 순번이 밀릴 수 있습니다."));
  }
  const bs = burstStages(names);
  if (!bs.ok) {
    warns.push(T("{v} 버스트가 없어 풀버스트가 열리지 않습니다.", { v: bs.missing.map((x) => x + T("단계")).join("·") }));
  }

  box.textContent = "";
  const stats = statLines();
  if (!warns.length && !stats.length) { box.hidden = true; return; }
  box.hidden = false;
  // 고정 안내는 «경고»가 아니라 «규칙»이라 앞자리에 다른 색으로 세운다.
  warns.forEach((w, i) => box.append(el("p", "squad-warn-line" + (i < pins.length ? " pin" : ""), w)));
  // 딱지는 맨 뒤 — 「이 편성이 어떤가」를 먼저 읽고, 「그 값을 얼마나 믿나」를 나중에 읽는다.
  for (const line of stats) box.append(line);
}

function renderDeckTabs() {
  const wrap = $("#deck-tabs");
  wrap.textContent = "";
  for (let i = 0; i < DECK_COUNT; i++) {
    const d = deckOf(i);
    const on = i === state.settings.deck;
    const btn = el("button", "deck-tab" + (on ? " on" : "") + (isFull(d) ? " filled" : ""),
      String(i + 1).padStart(2, "0"));
    btn.type = "button";
    btn.dataset.deck = String(i);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(on));
    btn.title = T("덱 {v} — {v1}/5명 — 끌어서 순서를 바꿀 수 있습니다", { v: i + 1, v1: d.names.filter(Boolean).length });
    btn.onclick = () => { state.settings.deck = i;
      picked = null; saveAll(); renderAll(); syncRoute(); };
    // 탭 번호 자체가 덱 순서를 바꾸는 손잡이다(유저 피드백: 배치모드 옆 오른쪽
    // 위 숫자로 옮기게 해 달라 — 결과 탭의 합계 알약이 아니라 **이 탭**이었다).
    btn.addEventListener("pointerdown", (e) => startDeckDrag(e, i, ".deck-tab"));
    wrap.append(btn);
  }
}

/** 카드가 DOM에 실제로 붙은 **뒤에** 부른다. 붙기 전에는 `.nk-line1`의 좌표를
 *  잴 수 없다(떨어져 있는 노드는 크기가 전부 0으로 나온다) — 그래서 `card()`
 *  안에서는 자리만 만들어 두고, 삽입 직후 이 함수가 실측해서 자리를 잡는다. */
function positionAdjBuffs(fig) {
  const buffs = fig?._adjBuffs;
  const line1 = fig?.querySelector(".nk-line1");
  if (!buffs || !line1) return;
  const fr = fig.getBoundingClientRect(), lr = line1.getBoundingClientRect();
  buffs.style.bottom = `${Math.round(fr.bottom - lr.top) + 2}px`;
}

/** 큐브 한 칸. **카드 바로 아래, 컨트롤 막대 위**에 붙는다 — 큐브는 니케 육성이
 *  아니라 그 자리에 끼울 자원이라 카드 톱니(육성 수정)가 아니고, 슬롯 밖에 따로
 *  두면 컨트롤 막대가 사이에 끼어 어느 카드 것인지 안 보인다(실측으로 겪었다).
 *  「지금 실제로 무엇을 끼고 있나」는 전투력 계산기가 보여 준다. */
function cubeCell(d, i) {
  // 렐릭 베어(재장전)를 맨 위에 두고 나머지는 가나다순. «기본» 같은 빈 항목은 두지
  // 않는다 — 화면에 보이는 것과 계산에 들어가는 것이 항상 같아야 한다.
  const { names, ordered } = cubeChoices();
  {
    // 계산에 들어가는 값과 **같은 함수**로 고른다 (cubeOf) — 둘이 갈라지면 카드에
    // 보이는 큐브와 실제 계산이 어긋난다
    const cur = cubeOf(d, i);
    // 니케 이름은 안 적는다 — 바로 위 카드가 곧 그 정보다. 툴팁에만 남긴다.
    const cell = el("div", "cube-cell" + (cur ? " on" : ""));
    cell.title = d.names[i] || T("{v}번 칸", { v: i + 1 });
    // **큐브 이름 대신 효과로 적는다** — 「렐릭 베어」가 무슨 큐브인지 외우고 있는
    // 사람은 없다. 고르는 자리에는 «재장전 속도»처럼 오르는 스탯이 보여야 한다.
    const NAMES = ordered.map((c) => [c, cubeStatLabel(c)]);
    const nameSel = selectEl(NAMES, cur?.name ?? "", (v) => {
      d.cubes[i] = { name: v, level: cur?.level ?? CUBE_DEFAULT.level };
      saveAll(); refreshSlots(); renderResults();
    }, !ordered.length);
    // 이름 툴팁 = **무엇이 오르는 큐브인지**(효과 종류). 레벨 툴팁은 그 레벨의 실제
    // 수치다 — 이름만 보고는 재장전인지 공격인지 알 수 없고, 목록에서 고르는 자리에
    // 그 정보가 없으면 매번 다른 화면을 찾아봐야 한다.
    nameSel.title = cur ? cubeEffect(cur.name, cur.level) : "";
    cell.append(nameSel);
    // 레벨은 **항상 보인다.** 큐브를 고른 뒤에야 나타나면 「레벨도 정해야 한다」는 걸
    // 모른 채 지나가고, 칸 폭도 그때그때 달라져 줄이 흔들린다.
    // Lv0 = 미장착. 진짜로 큐브를 안 끼고 도는 편성을 표현할 수 있어야 한다
    // (계산기도 레벨 0을 플랫 스탯 0·스킬 없음으로 받는다 — base_stat.py).
    const LVS = [[0, T("미장착")], ...Array.from({ length: 15 }, (_, k) => [k + 1, `Lv${k + 1}`])];
    const lvSel = selectEl(LVS, cur?.level ?? 15, (v) => {
      // 큐브를 아직 안 골랐으면 레벨만 바꿔도 의미가 없다 — 기본 큐브를 함께 채운다.
      const nm = cur?.name || names[0];
      if (nm) d.cubes[i] = { name: nm, level: Number(v) };
      saveAll(); refreshSlots(); renderResults();
    }, !names.length);
    lvSel.title = cur
      ? cubeEffect(cur.name, cur.level)
      : T("큐브를 고르면 이 레벨의 수치가 적용됩니다");
    cell.append(lvSel);
    return cell;
  }
}

// ── 솔로 편성의 «고르기» 시트 ───────────────────────
// 유니온 워크벤치의 시트(`#pick-sheet`)와 **같은 모양**이되 물건은 따로다. 담는 곳도
// 꽂는 규칙도 달라서(솔로는 5덱·`place()`, 유니온은 3줄·`uSnap()`) 한 벌을 나눠 쓰면
// 어느 쪽 규약이 도는지 매번 확인해야 한다. 생김새는 같은 CSS(`.pick-sheet`)가 맡는다.

// 지금 이 시트가 채우려는 자리. null이면 닫혀 있다.
let deckPickAt = null;

/** 이 시트의 필터. 아래 로스터 목록(`state.filter`)과 **따로 든다** — 한 명 찾으려고
 *  건 조건이 목록에 그대로 남으면, 시트를 닫고 나서 «왜 몇 명 안 보이지»가 된다.
 *
 *  아레나처럼 **다른 화면이 이 시트를 빌려 쓸 때는 제 필터를 들고 온다**(`pickBorrow`) —
 *  솔로 필터를 같이 쓰면 아레나에서 건 조건이 솔로 시트에 남는다(유저 지시 2026-08-31:
 *  «솔로 것을 쓰더라도 거기에 영향을 주면 안 된다»). */
let pickBorrow = null;      // { filter, place(name), used(name), title }
const deckPickFilter = () => (pickBorrow ? pickBorrow.filter
                              : (state.pickFilter ||= defaultFilter()));

/** 빈 칸을 눌러 시트를 연다. 검색과 필터만 있고 육성 수정은 없다 —
 *  여기서 할 일은 «찾아서 꽂기» 하나뿐이다. */
function openDeckPick(deckIdx, idx, borrow = null) {
  const dlg = $("#deck-pick-sheet");
  if (!dlg) return;
  pickBorrow = borrow;
  deckPickAt = { deckIdx, idx };
  deckPickFilter().q = "";                   // 열 때마다 검색어는 비운다
  $("#deck-pick-title").textContent = borrow?.title
    ?? T("{v}덱 {v1}번 자리", { v: deckIdx + 1, v1: idx + 1 });
  renderDeckPick();
  if (!dlg.open) dlg.showModal();
  $("#deck-pick-q")?.focus();
}

function closeDeckPick() {
  deckPickAt = null;
  pickBorrow = null;
  const dlg = $("#deck-pick-sheet");
  if (dlg?.open) dlg.close();
}

/** 시트 안의 칩·목록을 지금 필터로 다시 그린다. */
function renderDeckPick() {
  const f = deckPickFilter();
  const q = $("#deck-pick-q");
  if (q && document.activeElement !== q) q.value = f.q;

  const burst = $("#deck-pick-burst");
  if (burst) {
    burst.textContent = "";
    for (const [v, label] of BURST_CHIPS) {
      const b = el("button", "chip" + (f.burst.includes(v) ? " on" : ""), label);
      b.type = "button";
      b.onclick = () => {
        f.burst = f.burst.includes(v) ? f.burst.filter((x) => x !== v) : [...f.burst, v];
        saveAll(); renderDeckPick();
      };
      burst.append(b);
    }
  }

  const elem = $("#deck-pick-elem");
  if (elem) {
    elem.textContent = "";
    for (const code of CODES.filter(Boolean)) {
      const b = el("button", "chip chip-elem" + (f.element.includes(code) ? " on" : ""));
      b.type = "button";
      b.title = code;
      b.style.setProperty("--code-c", CODE_VAR[code] || "var(--color-stage-line)");
      const file = ELEMENT_ICON[code];
      if (file) { const im = el("img"); im.src = `image/icon/${file}`; im.alt = code; b.append(im); }
      else b.append(el("span", null, code));
      b.onclick = () => {
        f.element = f.element.includes(code)
          ? f.element.filter((x) => x !== code) : [...f.element, code];
        saveAll(); renderDeckPick();
      };
      elem.append(b);
    }
  }

  const wrap = $("#deck-pick-pool");
  if (!wrap) return;
  wrap.textContent = "";
  // 이미 다른 덱에 들어간 이름은 **잠근다** — 솔로레이드는 덱 간 중복이 불가하다.
  const used = new Map();
  if (pickBorrow) {
    // 빌려 쓰는 화면의 규칙으로 잠근다 — 솔로 덱 다섯을 보면 아레나에서 엉뚱한 이름이
    // 잠긴다(아레나는 위아래 두 덱뿐이고 서로 겹쳐도 된다).
    for (const [n, at] of pickBorrow.used?.() ?? []) used.set(n, at);
  } else {
    for (let di = 0; di < DECK_COUNT; di++) {
      for (const n of deckOf(di).names) if (n) used.set(n, di + 1);
    }
  }
  const list = filteredRoster(false, f);
  for (const rec of list) {
    const at = used.get(rec.name);
    const c = card(rec.name, { dim: !rec.parsed || !!at, usedIn: at, party: at || 0 });
    // 고르는 자리다 — 육성 수정(⚙)·즐겨찾기(★)는 여기서 치운다
    c.querySelector(".nk-cog")?.remove();
    c.querySelector(".nk-fav")?.remove();
    // 액자는 **등급색 그대로** 둔다 — 속성색 액자는 «이 줄 보스에 우월한가»를 따지는
    // 유니온의 규칙이다. 솔로에서는 등급·중복이 먼저 읽혀야 한다(renderPool과 같다).
    if (!rec.parsed) {
      // 아직 안 나온 니케는 «파싱이 안 됐다»가 아니라 «아직 안 나왔다»가 사실이다.
      c.title = rec.preview ? T("출시 예정 — 스킬이 공개되면 계산할 수 있습니다")
        : T("스킬 미파싱 — 계산할 수 없습니다");
    } else if (at) {
      c.title = T("덱 {usedIn}에서 사용 중 — 덱 간 중복은 불가합니다", { usedIn: at });
    } else {
      c.onclick = () => {
        if (!deckPickAt) return;
        const { deckIdx, idx } = deckPickAt;
        const borrow = pickBorrow;
        closeDeckPick();
        // 빌려 쓰는 화면은 **제 상자에** 꽂는다 — 솔로 덱은 손대지 않는다.
        if (borrow) { borrow.place(rec.name); return; }
        // 되돌리기 찍기(sSnap)·큐브 따라가기·저장·다시 그리기가 `place()`에 다 있다.
        place(rec.name, deckIdx, idx);
      };
    }
    wrap.append(c);
  }
  const n = $("#deck-pick-count");
  if (n) n.textContent = T("{length}명", { length: list.length });
}

function renderSlots() {
  const deckIdx = state.settings.deck;
  const wrap = $("#slots");
  const d = deckOf(deckIdx);
  const dup = duplicated();
  const adj = adjHitsIn(d.names);
  wrap.textContent = "";
  d.names.forEach((name, idx) => {
    const slot = el("div", "slot" + (name ? " has" : ""));
    let cell = null;                    // 찬 슬롯은 [카드 + 컨트롤 막대]로 감싼다
    slot.dataset.deck = String(deckIdx);
    slot.dataset.idx = String(idx);
    if (name) {
      // 스쿼드 안은 이미 "편성됨"이 자명하다 — 시안 체크는 로스터 쪽에만 단다
      slot.append(card(name, { dup: dup.has(name), inSlot: true, adj: adj.get(name) }));
      const x = el("button", "slot-x", "✕");
      x.type = "button";
      x.title = T("슬롯 비우기");
      x.onclick = (e) => { e.stopPropagation(); clearSlot(deckIdx, idx); };
      slot.append(x);
      slot.querySelector(".nk").addEventListener("pointerdown",
        (e) => startDrag(e, name, { deckIdx, idx }));
      // 카드 아래 «확장» — 이 니케의 컨트롤을 슬롯 줄 바로 밑에 펼친다.
      // 덱 전체를 한 목록으로 늘어놓는 것보다, 고칠 니케 자리에서 여는 편이 짧다.
      const more = el("button", "slot-more" + (ctrlOpen === name ? " on" : ""));
      more.type = "button";
      more.title = T("{name} 컨트롤 설정", { name });
      const on = Object.keys(d.control?.[name] || {}).length;
      more.append(el("span", null, on ? T("컨트롤 {on}", { on }) : T("컨트롤")));
      more.append(el("i", null, "▾"));
      if (on) more.classList.add("has");
      more.onclick = (e) => {
        e.stopPropagation();
        patDraft = null;
        ctrlOpen = ctrlOpen === name ? null : name;
        renderAll(); buildControl();
      };
      // 슬롯은 카드 비율로 고정돼 있다 — 막대를 그 안에 넣으면 카드가 눌리므로
      // 슬롯과 막대를 함께 감싸 세로로 쌓는다. **`slot.onclick`은 아래에서 그대로
      // 걸린다** — 여기서 일찍 빠져나가면 찬 슬롯에 다른 니케를 못 놓는다.
      cell = el("div", "slot-wrap");
      // 카드 → 큐브 → 컨트롤 순. 큐브를 컨트롤 아래에 두면 카드와 떨어져
      // 어느 니케 것인지 안 보인다(실측으로 겪었다).
      cell.append(slot, cubeCell(d, idx), more);
    } else {
      slot.append(el("span", "slot-no", "+"));
      cell = el("div", "slot-wrap");
      // 빈 칸도 큐브칸·컨트롤이 **자리에 그대로 있다.** 채워질 때 생겨나면 줄 높이가
      // 흔들리고 무엇이 들어올 자리인지도 안 읽힌다 — 누를 사람이 없을 뿐이라
      // 진짜 «비활성 버튼»으로 둔다(모양이 아니라 상태로 말한다).
      const gap = el("button", "slot-more slot-more-gap");
      gap.type = "button";
      gap.disabled = true;
      gap.append(el("span", null, "컨트롤"), el("i", null, "▾"));
      cell.append(slot, cubeCell(d, idx), gap);
    }
    // 방금 여기서 빼거나 바꿨다면 **그 자리에서** 되돌린다
    const sSpot = sUndoSpotAt(deckIdx, idx);
    if (sSpot) {
      slot.classList.add("has-undo");
      const back = el("button", "u-undo", "↩");
      back.type = "button";
      back.title = T("{label} — 되돌리기", { label: sSpot.label });
      back.onclick = (e) => { e.stopPropagation(); sUndoLast(); };
      slot.append(back);
    }
    slot.onclick = () => {
      // 집어 든 카드가 있으면 그걸 놓는다. 없으면 **찾아서 꽂는 시트**를 연다 —
      // 빈 칸을 눌렀는데 아무 일도 안 일어나면 무엇을 해야 할지 알 수 없다
      // (유니온 칸과 같은 손버릇).
      if (picked) { place(picked, deckIdx, idx); picked = null; setStatus(""); return; }
      if (!d.names[idx]) openDeckPick(deckIdx, idx);
    };
    wrap.append(cell || slot);
    // DOM에 붙은 **뒤**에만 잴 수 있다 — 그래서 `card()` 안이 아니라 여기서 부른다.
    if (name && adj.get(name)?.length) positionAdjBuffs(slot.querySelector(".nk"));
  });

  // 인접 버프 무리 — 캐스터+양옆을 사각형 하나로 감싼다. `.slots`가 그리드라
  // 칸 번호(1-based)만 지정하면 그 사이 간격까지 포함해 깔끔하게 이어진다.
  for (const g of adjGroupsIn(d.names)) {
    const frame = el("div", "adj-frame");
    frame.style.gridColumn = `${g.lo + 1} / ${g.hi + 2}`;
    frame.style.setProperty("--adj-frame-c", ADJ_COLOR[g.caster] || "var(--color-info)");
    frame.title = T("{caster}의 양옆 버프 무리", { caster: g.caster });
    wrap.append(frame);
    // **카드(초상화)까지만** — 칸 전체 높이로 두면 그 밑의 «컨트롤» 펼침 버튼까지
    // 덮인다. 그건 캐릭터가 아니라 우리 UI라 감쌀 이유가 없다. DOM에 붙은 뒤에만
    // 실제 카드 높이를 잴 수 있어(`positionAdjBuffs`와 같은 이유) 여기서 잰다.
    const anyCard = wrap.children[g.lo]?.querySelector(".nk");
    if (anyCard) frame.style.height = `${anyCard.getBoundingClientRect().height}px`;
  }

  const res = resultOf(d);
  $("#deck-total").textContent = d.calcState === "run" ? T("계산 중…")
    : d.error ? T("오류") : res ? `${I18N.dmg(res.total)}` : isFull(d) ? T("미계산") : "—";
  $("#deck-notes").textContent = d.error ? d.error : (res?.notes || "");
  renderGrowthFlags(d.error ? null : res?.growth_flags);

  // 편성이 바뀌면 지난 비교는 다른 덱 얘기가 된다 — 조용히 걷는다.
  const fbcBtn = $("#deck-fbc");
  if (fbcBtn) fbcBtn.disabled = !isFull(d) || !!d.calcState || fbcRunning;
  // 편성이 바뀌었으면 되돌릴 대상이 다른 얘기가 된다 — 그때 버린다.
  if (fbcUndo && fbcUndo.key !== fbcKeyOf(deckIdx)) fbcUndo = null;
  const undoBtn = $("#deck-fbc-undo");
  if (undoBtn) undoBtn.hidden = !fbcUndo || fbcUndo.deckIdx !== deckIdx;
  const fbcOut = $("#deck-fbc-out");
  if (fbcOut && fbcOut.dataset.deck !== String(deckIdx) + ":" + d.names.join("|")) {
    fbcOut.hidden = true;
    fbcOut.dataset.deck = String(deckIdx) + ":" + d.names.join("|");
  }
  const btn = $("#deck-calc");
  btn.disabled = !isFull(d) || !!d.calcState;
  btn.dataset.state = d.calcState === "run" ? "loading" : "";
  // 이미 나온 덱을 다시 누르는 건 «재계산»이다 — 같은 라벨이면 눌러도 아무 일이
  // 없는 것처럼 보인다(계산 목록에서 걸러지므로 실제로도 아무 일이 없었다).
  btn.textContent = res ? T("덱 재계산") : T("덱 계산");

  // 전체 계산 — 아직 결과가 없는 '꽉 찬' 덱이 있을 때만 누를 수 있다
  const todo = pendingDecks();
  const nDecks = deckCountNow();
  const anyRunning = [...Array(nDecks).keys()].some((i) => deckAt(i).calcState);
  for (const sel of ["#deck-calc-all", "#res-calc", "#fast-calc-all"]) {
    const all = $(sel);
    if (!all) continue;
    // 다 계산했으면 «전체 재계산»으로 바뀐다 — 같은 라벨로 비활성만 시키면
    // 계정을 손본 뒤 다시 돌릴 방법이 없다.
    const ready = [...Array(nDecks).keys()].filter((i) => isFull(deckAt(i)));
    const done = ready.length && !todo.length;
    all.disabled = anyRunning || !ready.length;
    all.dataset.state = anyRunning ? "loading" : "";
    // 유니온의 «전체 계산»은 말 그대로 **전부** 다시 돈다. 세 줄이 한 출격 묶음이라
    // 「2줄만 계산」 같은 건 뜻이 없다 — 묶음 총딜을 보려고 누르는 버튼이다.
    if (modeNow() === "union") {
      all.textContent = T("전체 계산");
      all.dataset.force = "1";
    } else {
      all.textContent = done ? T("전체 재계산 ({length}덱)", { length: ready.length })
        : todo.length > 1 ? T("전체 계산 ({length}덱)", { length: todo.length }) : T("전체 계산");
      all.dataset.force = done ? "1" : "";
    }
  }

  // 계산해 둔 덱이 하나라도 있으면 «결과 보기»를 보여 준다 — 계산 버튼만 누르고
  // 결과 탭까지 직접 눌러 넘어가야 하는 걸음을 줄인다.
  const goto = $("#deck-goto-result");
  if (goto) {
    goto.hidden = ![...Array(DECK_COUNT).keys()].some((i) => resultOf(deckOf(i)));
  }
}

function renderScore() {
  const dup = duplicated();
  let sum = 0, known = 0;
  const each = el("div", "score-each");
  for (let i = 0; i < DECK_COUNT; i++) {
    const r = resultOf(deckOf(i));
    if (r) { sum += r.total; known++; }
    // 덱 번호는 알약의 **자리**가 이미 말해 준다 — 숫자를 붙이면 값이 파묻힌다.
    const pill = el("span", "score-pill" + (r ? " on" : ""),
                    r ? `${I18N.dmg(r.total)}` : "—");
    pill.title = T("{v}덱 — 끌어서 순서를 바꿀 수 있습니다", { v: String(i + 1).padStart(2, "0") });
    pill.dataset.deck = String(i);
    pill.addEventListener("pointerdown", (e) => startDeckDrag(e, i, ".score-pill"));
    each.append(pill);
  }
  const box = $("#score");
  box.textContent = "";
  box.append(el("span", null, T("{known}/{DECK_COUNT}덱 합계", { known, DECK_COUNT })),
             el("b", null, known ? `${I18N.dmg(sum)}` : "—"), each);
  // 뮤지엄은 합계 옆에 스텝도 — 여기서 겨루는 숫자는 딜이 아니라 스텝이다.
  if (modeNow() === "museum" && museumStage()) {
    const walk = museumWalk(M().boss, [...Array(DECK_COUNT).keys()].map((i) => resultOf(deckOf(i))?.total ?? null));
    const st = el("span", "score-step", known ? T("스텝 {step} / {max}", { step: walk.step, max: walk.max }) : T("스텝 —"));
    st.title = T("덱마다 센 스텝의 합 — 계산한 덱만 셉니다");
    box.append(st);
  }
  $("#dup-warn").textContent = dup.size
    ? T("덱 간 중복: {v} — 솔로레이드에서는 불가능한 편성입니다", { v: [...dup].map((n) => T(n)).join(" · ") }) : "";
}

// ── 배치모드 ───────────────────────────────────────────────────────────
// 설정을 다 걷어내고 25칸(5덱×5인)을 한 화면에 펼쳐 빠르게 채우는 전용 화면.
// **state.decks를 그대로 그리는 것뿐**이라 일반 화면과 데이터가 둘일 일이
// 없다 — 껐다 켜도(`setFastMode`) 편성이 그대로다. 모드 자체는 켠 채로
// 새로고침해도 그대로 열리게 저장한다(유저 피드백) — `boot()`가 복원한다.
function applyFastModeDom(on) {
  document.querySelector('.panel[data-panel="deck"]')?.classList.toggle("fast-on", on);
  // 감싸는 div 대신 항목마다 직접 숨긴다 — 감싸면 그 자체가 하나의 flex
  // 아이템이 되어 좁은 화면에서 줄바꿈이 이상하게 갈렸다(유저 피드백: 계정·콘솔이
  // 엉뚱하게 버튼 쪽으로 딸려 보임). 각자 원래 자리에서 개별로 사라지게 한다.
  for (const el of document.querySelectorAll(".hide-in-fast")) el.hidden = on;
  $("#deck-tabs").hidden = on;
  $("#squad-wrap").hidden = on;
  $("#fast-wrap").hidden = !on;
  // 켜져 있든 꺼져 있든 같은 파랑(btn-primary)이다 — 색으로 상태를 가르지
  // 않는다(유저 피드백: «일반 모드로»와 같은 색으로). 글자만 바뀐다.
  $("#fast-toggle-label").textContent = on ? T("✕ 일반 모드로") : T("배치모드");
}

function setFastMode(on) {
  fastMode = on;
  state.settings.fastMode = on;
  applyFastModeDom(on);
  picked = null;
  setStatus("");
  saveAll();
  renderAll();
  syncRoute();
}

// ── 덱 순서 바꾸기 (배치모드 줄 · 일반 모드 합계 알약 둘 다 공용) ─────────
// 카드 드래그(`startDrag`)와 다른 길이다 — 여기서 옮기는 건 니케가 아니라
// **덱 통째**(이름·컨트롤·계산 결과까지)다. 잡은 덱과 놓은 덱을 통째로
// 맞바꾼다 — 사이에 낀 덱들을 밀지 않는다(카드 슬롯 교환과 같은 결).
let deckDrag = null;

function startDeckDrag(e, deckIdx, selector) {
  if (e.pointerType === "touch") return;   // 손가락 드래그는 로스터 넘기기와 겹친다
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const src = document.querySelector(`${selector}[data-deck="${deckIdx}"]`);
  const rect = src?.getBoundingClientRect();
  // 원본을 통째로 복제해 커서를 따라다니는 유령을 띄운다 — «줄 자체가 같이
  // 움직이는» 느낌을 주기 위해서다(유저 피드백). pointer-events:none이라
  // elementFromPoint가 이 유령이 아니라 그 밑의 진짜 줄/알약을 잡는다.
  const ghost = el("div", "deck-drag-ghost");
  if (src) {
    ghost.append(src.cloneNode(true));
    ghost.style.width = `${rect.width}px`;
  }
  document.body.append(ghost);
  deckDrag = {
    from: deckIdx, target: null, selector, ghost,
    offX: rect ? e.clientX - rect.left : 0, offY: rect ? e.clientY - rect.top : 0,
  };
  moveDeckGhost(e.clientX, e.clientY);
  src?.classList.add("deck-dragging");
  document.addEventListener("pointermove", onDeckDragMove);
  document.addEventListener("pointerup", onDeckDragEnd, { once: true });
}

const moveDeckGhost = (x, y) => {
  deckDrag.ghost.style.transform = `translate(${x - deckDrag.offX}px, ${y - deckDrag.offY}px)`;
};

function onDeckDragMove(e) {
  if (!deckDrag) return;
  moveDeckGhost(e.clientX, e.clientY);
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(deckDrag.selector);
  const hitIdx = hit ? Number(hit.dataset.deck) : null;
  if (hitIdx === deckDrag.target) return;
  document.querySelectorAll(deckDrag.selector)
    .forEach((r) => r.classList.remove("deck-drop-target"));
  if (hit && hitIdx !== deckDrag.from) hit.classList.add("deck-drop-target");
  deckDrag.target = hitIdx;
}

function onDeckDragEnd() {
  document.removeEventListener("pointermove", onDeckDragMove);
  document.querySelectorAll(".fg-row, .score-pill, .deck-tab")
    .forEach((r) => r.classList.remove("deck-dragging", "deck-drop-target"));
  const drag = deckDrag;
  deckDrag = null;
  drag?.ghost.remove();
  if (!drag || drag.target == null || drag.target === drag.from) return;
  const a = drag.from, b = drag.target;
  [state.decks[a], state.decks[b]] = [state.decks[b], state.decks[a]];
  saveAll();
  renderAll();
}

/** 25칸 그리드. 슬롯은 `.slot`을 그대로 쓰므로 기존 드래그(`startDrag`→
 *  `onDragEnd`→`place`)가 `dataset.deck`/`dataset.idx`만 보고 그대로 먹힌다 —
 *  덱마다 따로 만들 이유가 없었다. */
function renderFastGrid() {
  const wrap = $("#fast-grid");
  if (!wrap) return;
  wrap.textContent = "";
  const dup = duplicated();
  for (let di = 0; di < DECK_COUNT; di++) {
    const d = deckOf(di);
    const res = resultOf(d);
    const row = el("div", "fg-row");
    row.dataset.deck = String(di);
    // 줄 손잡이는 **줄 전체**다 — 번호칸·총딜칸뿐 아니라 총딜 오른쪽으로
    // 남는 빈 공간(줄은 `.stage` 폭까지 늘어나는데 내용은 그보다 짧다)도
    // 눈에는 같은 줄로 보이니 거기서도 잡혀야 한다(유저 피드백: 거기도
    // 드래그 되는 것처럼 보이는데 안 된다). 카드(cells)와 계산 버튼만 뺀다 —
    // 나머지 어디를 눌러도 이 줄을 잡는다. 라벨·총딜칸에 따로 달았던 손잡이는
    // 이걸로 대체한다(둘 다 있으면 버블링으로 두 번 잡혀 고스트가 겹친다).
    row.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".fg-slot, .fg-row-calc")) return;
      startDeckDrag(e, di, ".fg-row");
    });
    const label = el("div", "fg-row-label", String(di + 1).padStart(2, "0"));
    row.append(label);
    const cells = el("div", "fg-cells");
    d.names.forEach((name, idx) => {
      const slot = el("div", "slot fg-slot" + (name ? " has" : ""));
      slot.dataset.deck = String(di);
      slot.dataset.idx = String(idx);
      if (name) {
        // 계산해 둔 결과가 있으면 얼굴 카드 아래에 이 니케의 딜을 바로 얹는다
        // (`res.chars`는 니케별 총딜 — 각각 딜량을 보고 싶다는 요청).
        const c = card(name, { compact: true, inSlot: true, dup: dup.has(name),
                               dmg: res?.chars?.[name] });
        slot.append(c);
        c.addEventListener("pointerdown", (e) => startDrag(e, name, { deckIdx: di, idx }));
        const x = el("button", "slot-x", "✕");
        x.type = "button";
        x.title = T("슬롯 비우기");
        x.onclick = (e) => { e.stopPropagation(); clearSlot(di, idx); };
        slot.append(x);
      } else {
        slot.append(el("span", "slot-no", "+"));
      }
      slot.onclick = () => {
        if (picked) { place(picked, di, idx); picked = null; setStatus(""); return; }
        if (!d.names[idx]) openDeckPick(di, idx);   // 빈 칸 → 고르기 시트 (편성 화면과 같다)
      };
      cells.append(slot);
    });
    row.append(cells);
    // 총딜 바로 위에 이 덱만 다시 계산하는 버튼 — «전체 재계산»까지 안 가도
    // 이 덱 하나만 손봤을 때 바로 반영해 볼 수 있다(유저 피드백).
    const totalWrap = el("div", "fg-total-wrap");
    const totalCol = el("div", "fg-total-col");
    // 선버 비교는 계산 **위**에 — 이 줄(=이 덱)만 돌린다.
    // 사이클은 **그 줄(덱) 것**이라 줄에 붙는다. 버스트 비교 위에 세로로 쌓는다(유저).
    const cyBtn = el("button", "fg-row-cy", T("버스트 사이클"));
    cyBtn.type = "button";
    cyBtn.onclick = () => { state.settings.deck = di; saveAll(); openCycleSheet(); };
    const fbcBtn = el("button", "fg-row-fbc", T("버스트 비교"));
    fbcBtn.type = "button";
    fbcBtn.disabled = !isFull(d) || !!d.calcState || fbcRunning;
    fbcBtn.onclick = () => fbcRun(di);
    // 이 줄에 적용한 것이 있으면 그 자리에서 되돌린다
    const undoRow = fbcUndo && fbcUndo.deckIdx === di && fbcUndo.key === fbcKeyOf(di)
      ? el("button", "fg-row-fbc", T("되돌리기")) : null;
    if (undoRow) { undoRow.type = "button"; undoRow.onclick = fbcUndoApply; }
    const calcBtn = el("button", "fg-row-calc", res ? T("재계산") : T("계산"));
    calcBtn.type = "button";
    calcBtn.disabled = !isFull(d) || !!d.calcState;
    calcBtn.onclick = () => calcDecks([di], true);
    totalCol.append(cyBtn, fbcBtn, ...(undoRow ? [undoRow] : []), calcBtn, el("span", "fg-row-total",
      d.calcState === "run" ? T("계산 중…") : d.error ? T("오류")
        : res ? `${I18N.dmg(res.total)}` : isFull(d) ? T("미계산") : "—"));
    totalWrap.append(totalCol);
    row.append(totalWrap);
    wrap.append(row);
  }
}

function renderFastTotal() {
  const box = $("#fast-total");
  if (!box) return;
  let sum = 0, known = 0;
  for (let i = 0; i < DECK_COUNT; i++) {
    const r = resultOf(deckOf(i));
    if (r) { sum += r.total; known++; }
  }
  // 「몇 덱 합계」는 옅게, **숫자만 튀게** — 여기서 제일 궁금한 건 라벨이 아니라 값이다.
  box.textContent = "";
  box.append(el("span", "fast-total-label", T("{known}/{DECK_COUNT}덱 합계", { known, DECK_COUNT })),
             el("b", "fast-total-val", known ? `${I18N.dmg(sum)}` : "—"));
}

// ── 이름 검색 — 초성과 별명 ─────────────────────────────────────────────
//
// 세 화면(편성 풀·니케 고르기 시트 둘·전투력)이 전부 `filteredRoster`로 모이므로
// 검색 규칙은 여기 한 벌만 있으면 된다.
//
// **한국어 전용이다.** 초성도 «르나린디» 같은 별명도 한국어 쓰는 사람만 치는 것이라
// 번역 카탈로그에 넣지 않는다(사용자 요청). 외국어 UI에서도 동작은 하지만 —
// 한국어 이름을 그대로 들고 있으므로 — 그쪽을 위해 뭘 더 하지는 않는다.

/** 한글 초성 19자. 인덱스가 곧 음절 코드의 초성 번호다. */
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 검색에 쓰는 꼴 — 띄어쓰기·구두점을 지우고 소문자로.
 *  「미하라 : 본딩 체인」과 「미하라본딩체인」이 같은 것을 가리키게 한다. */
const searchNorm = (v) => String(v ?? "").toLowerCase().replace(/[\s:·.,()[\]{}'"\-_/]/g, "");

/** 글자 하나 대조. 검색어 쪽이 **자음 하나**면 이름 글자의 초성과 견준다 —
 *  이것이 «ㅁㅎㄹ → 미하라»를 만든다. 한글 자판은 「미하라」를 칠 때
 *  「미하ㄹ」을 거쳐 가므로, 섞인 꼴(「미하ㄹ」)도 그냥 걸린다. */
function charHit(hay, q) {
  if (hay === q) return true;
  if (!CHO.includes(q)) return false;
  const c = hay.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 && CHO[Math.floor(c / 588)] === q;
}

/** 윈도우 한글 IME가 **붙여 버리는** 겹자음 → 원래 둘.
 *
 *  자음만 연달아 치면 IME가 «받침»으로 읽고 합친다. 「베스티」의 초성을 치면
 *  ㅂ 다음 ㅅ이 붙어 **ㅄㅌ**가 되고, 사람은 ㅂㅅㅌ를 친 줄 안다(맥은 안 합친다).
 *  합쳐진 자음은 초성이 될 수 없어서(`CHO`에 없다) 지금까지 아무것도 안 걸렸다.
 *
 *  **합쳐지는 짝만 적는다.** 받침이 될 수 있는 것만 합쳐지므로 ㄷㄷ·ㅂㅂ·ㅈㅈ은
 *  애초에 ㄸ·ㅃ·ㅉ가 되지 않는다 — 넣으면 «ㅃ로 시작하는 이름»을 찾는 사람에게
 *  엉뚱한 것이 걸린다. ㄲ·ㅆ는 합쳐지기도 하고 **그 자체로 초성**이기도 해서
 *  (까·싸) 둘 다로 쳐 본다 — 아래 `jamoAt`이 붙은 채로 먼저 맞춰 본다. */
const JAMO_SPLIT = {
  "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ",
  "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ",
  "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ",
  "ㅄ": "ㅂㅅ",
  "ㄲ": "ㄱㄱ", "ㅆ": "ㅅㅅ",
};

/** 검색어에 쓸 수 있는 자음인가 — 초성 열아홉에 «합쳐진 것»까지 친다. */
const isJamoQ = (c) => CHO.includes(c) || c in JAMO_SPLIT;

/** `hay[i]`부터 `ndl[j]`부터를 맞춘다. 검색어 한 글자가 이름 **두 글자**를 먹을 수
 *  있어서(합쳐진 자음) 자리 수가 안 맞는다 — 되짚기로 푼다. 이름도 검색어도
 *  길어야 수십 자라 가지가 폭발할 일이 없다. */
function jamoAt(hay, i, ndl, j) {
  if (j >= ndl.length) return true;
  // ① 붙은 채로 — ㄲ·ㅆ처럼 진짜 초성일 수 있다
  if (i < hay.length && charHit(hay[i], ndl[j]) && jamoAt(hay, i + 1, ndl, j + 1)) return true;
  // ② 쪼개서 — 윈도우가 붙여 놓은 것
  const sp = JAMO_SPLIT[ndl[j]];
  if (sp && i + 1 < hay.length
      && charHit(hay[i], sp[0]) && charHit(hay[i + 1], sp[1])
      && jamoAt(hay, i + 2, ndl, j + 1)) return true;
  return false;
}

/** `hay` 안에 `ndl`이 있는가 — 글자 대조를 `charHit`으로 하는 부분 문자열 찾기. */
function jamoIncludes(hay, ndl) {
  if (!ndl) return true;
  for (let i = 0; i < hay.length; i++) if (jamoAt(hay, i, ndl, 0)) return true;
  return false;
}

/** 별명 사전 `{니케: [별명…]}`. 두 겹이 합쳐진 것이다:
 *    · 구운 것 — `web/alias.json`(손 등록) + 이름에서 뽑은 것(web/build.py `_alias_map`)
 *    · 서버 것 — 관리 화면(`/admin` 별명 탭)에서 넣은 것. `/api/alias`로 온다.
 *  서버 것이 **더해진다** — 구운 것을 지우지 않는다. 서버가 없으면 구운 것만으로 돈다. */
let ALIAS_BAKED = {};

/** 이 니케를 가리킬 수 있는 모든 문자열(이름 + 별명), 검색용으로 다듬어 둔 것.
 *  로스터 199명 × 키 몇 개를 글자마다 훑으므로 한 번 만들고 캐싱한다. */
const _searchKeys = new Map();
function searchKeys(name) {
  let keys = _searchKeys.get(name);
  if (keys) return keys;
  const seen = new Set();
  // **화면에 보이는 이름으로도 찾아진다.** 외국어로 보면 카드에 «Grave»라고 적혀 있는데
  // 그대로 쳐도 안 걸렸다 — 검색이 한국어 이름과 별명만 봤기 때문이다(유저 제보).
  // 한국어에서는 `T(name)`이 그대로라 아무것도 안 는다.
  for (const v of [name, T(name), ...(ALIAS_BAKED[name] || [])]) {
    const k = searchNorm(v);
    if (k) seen.add(k);
  }
  keys = [...seen];
  _searchKeys.set(name, keys);
  return keys;
}

/** 사전이 바뀌면 캐시를 버린다 — 안 그러면 새 별명으로 안 찾아진다. */
const dropSearchKeys = () => _searchKeys.clear();

/** 서버 별명을 구운 사전에 얹는다. 실패해도 조용하다 — 검색은 구운 것만으로도 돈다.
 *
 *  **빼는 것이 먼저다.** 구운 별명 중 잘못 들어간 것을 관리 화면에서 뺄 수 있는데,
 *  배포물 자체는 서버가 못 고치므로 «빼라»는 목록(`hidden`)을 받아 여기서 덜어 낸다. */
async function loadServerAlias() {
  try {
    const r = await fetch("/api/alias");
    if (!r.ok) return;
    const j = await r.json();
    let n = 0;
    for (const [name, list] of Object.entries(j?.hidden || {})) {
      if (!Array.isArray(list) || !list.length || !ALIAS_BAKED[name]) continue;
      const drop = new Set(list.map(searchNorm));
      const kept = ALIAS_BAKED[name].filter((v) => !drop.has(searchNorm(v)));
      if (kept.length !== ALIAS_BAKED[name].length) {
        n += ALIAS_BAKED[name].length - kept.length;
        if (kept.length) ALIAS_BAKED[name] = kept;
        else delete ALIAS_BAKED[name];
      }
    }
    for (const [name, list] of Object.entries(j?.alias || {})) {
      if (!Array.isArray(list) || !list.length) continue;
      const have = new Set((ALIAS_BAKED[name] || []).map(searchNorm));
      const add = list.filter((v) => v && !have.has(searchNorm(v)));
      if (add.length) { ALIAS_BAKED[name] = [...(ALIAS_BAKED[name] || []), ...add]; n += add.length; }
    }
    if (n) dropSearchKeys();
  } catch { /* 사전 없이도 검색은 된다 */ }
}

/** 이 니케가 검색어에 걸리는가. 검색어에 자음이 없으면 빠른 길(부분 문자열)로 간다. */
function nameHit(name, needle, hasJamo) {
  const keys = searchKeys(name);
  return hasJamo ? keys.some((k) => jamoIncludes(k, needle))
                 : keys.some((k) => k.includes(needle));
}

/** 필터·정렬을 적용한 로스터. **편성과 전투력 계산기가 같은 규칙(이 함수)을 쓰지만
    상태는 각자다** — `f`를 명시하지 않으면 편성 쪽(state.filter)을 본다. 전투력
    계산기는 state.coopFilter를 넘겨 받는다(편성에서 건 필터가 새어 들면 안 된다). */
function filteredRoster(ignoreParsed = false, f = state.filter) {
  // 검색어도 이름과 **같은 규칙**으로 다듬는다 — 「미하라 본딩」처럼 띄어 쳐도 걸리게.
  const needle = searchNorm(f.q);
  const hasJamo = [...needle].some(isJamoQ);
  const any = (arr, v) => !arr.length || arr.includes(v);
  const list = ROSTER.filter((r) =>
    // 「계산 가능」 필터는 **딜 계산용**이다 — 전투력은 스킬 파싱과 무관하므로
    // 전투력 계산기는 이 조건을 건너뛰고 보유 니케 전원을 보여 준다.
    (ignoreParsed || !f.parsed || r.parsed) &&
    // 계산 정확도 — 아무것도 안 고르면 전부. 딱지가 없는 니케는 «검증됨»으로 센다
    // (로스터에는 `verified`가 아예 안 실려 오므로 «없음»이 곧 그 뜻이다).
    (!f.acc?.length || f.acc.includes(r.status || "verified")) &&
    (!f.favOnly || state.favs.includes(r.name)) &&
    // 버스트 «A»(레드 후드)는 1·2·3버 어느 필터에도 걸린다 — 실제로 그 자리를 다 메운다.
    // 칩 값 "4"(Λ)와 로스터 값 "A"는 같은 뜻이다.
    (!f.burst.length || f.burst.map((b) => (b === "4" ? "A" : b))
        .some((b) => b === String(r.burst) || String(r.burst) === "A")) &&
    (!f.element.length || elementsOf(r).some((e) => f.element.includes(e))) &&   // 이중 우월 코드
    any(f.cls, r.cls) &&
    any(f.weapon, r.weapon) &&
    any(f.corp, r.corp) &&
    (!f.favItem || hasFavItem(r.name)) &&
    (!needle || nameHit(r.name, needle, hasJamo)));
  const cmp = sorter(f.sort);
  return list.slice().sort(f.asc === false ? (a, b) => cmp(b, a) : cmp);
}

/** 두 화면의 카드 격자를 함께 다시 그린다 (필터는 공유다). */
function renderPools() {
  renderPool();
  if ($("#coop-pool")) renderCoopPool();
}

function renderPool() {
  const wrap = $("#pool");
  wrap.textContent = "";
  // 유니온은 **자기 저장소만** 본다. 솔로 5덱이 쓰는 이름을 유니온에서 잠그면
  // (실측) 스무 명 남짓이 통째로 «사용 중»이 되어 아예 안 올라간다 — 둘은 서로
  // 다른 콘텐츠이므로 중복 규칙도 각자 안에서만 따진다.
  const union = modeNow() === "union";
  const f = union ? uFilter() : state.filter;

  // 유니온은 «지금 고른 덱»이 없다 — 세 줄 15칸이 한 화면에 다 보이고, 어느 줄에
  // 있든 다시 누르면 빠진다. 그래서 잠그는 이름이 없고 «어느 줄에 있나»만 알린다.
  const uAt = new Map();
  if (union) {
    U().decks.forEach((d, di) => {
      for (const n of d.names) if (n) uAt.set(n, di + 1);
    });
  }

  // 5덱 배치 모드는 «지금 고른 덱»이 없다 — 25칸이 한 화면에 다 보이므로
  // 「어느 덱에 있나」만 따진다(있으면 잠금, 없으면 클릭으로 집는다).
  const cur = union ? new Set(uAt.keys())
    : fastMode ? new Set() : new Set(deckOf(state.settings.deck).names.filter(Boolean));
  // 다른 덱이 쓰는 이름은 잠근다 — 솔로레이드는 덱 간 중복이 불가하다.
  // 현재 덱 멤버는 잠그지 않는다 (다시 눌러 빼야 하므로).
  const usedElsewhere = new Map();
  if (!union) {
    state.decks.forEach((d, di) => {
      if (!fastMode && di === state.settings.deck) return;
      for (const n of d.names) if (n) usedElsewhere.set(n, di + 1);
    });
  }

  const list = filteredRoster(false, f);
  const cmp = sorter(f.sort);
  // 전투력은 계정에서 온다 — `_combat`을 담기 전에 저장해 둔 계정이라면 전원 0이라
  // 정렬이 «아무 일도 안 한 것처럼» 보인다. 조용히 이름순으로 두지 않고 말해 준다.
  const combatBlind = f.sort === "combat" && list.length
    && !list.some((r) => growNum(r.name, (sp) => sp._combat ?? 0));
  if (combatBlind) {
    wrap.append(el("p", "pool-note",
      T("이 계정에는 전투력이 없습니다 — 다시 받아 오면 전투력순으로 정렬됩니다.")));
  }

  for (const rec of list) {
    const usedIn = usedElsewhere.get(rec.name);
    const inCur = cur.has(rec.name);
    const c = card(rec.name, {
      compact: fastMode,
      dim: !rec.parsed || !!usedIn, on: inCur, usedIn,
      party: union ? (uAt.get(rec.name) || 0)
        : inCur ? state.settings.deck + 1 : usedIn || 0,
    });
    // 유니온에서는 아래 목록도 **속성색 액자**로 든다 — 줄마다 우월 속성을 세 명씩
    // 채워야 해서, 고르는 자리에서부터 속성이 눈에 걸려야 한다. 솔로는 등급색
    // 그대로 둔다(그쪽은 속성보다 등급·중복이 먼저 읽혀야 하는 화면이다).
    if (union && CODE_VAR[rec.element]) {
      // 액자(--frame)는 **건드리지 않는다** — 아래 목록에서는 등급·편성 상태가 먼저
      // 읽혀야 한다. 속성색은 «지금 이 보스를 치는 속성» 강조에만 따로 쓴다.
      c.style.setProperty("--hit-c", CODE_VAR[rec.element]);
      c.dataset.elem = rec.element;   // 보스를 꽂을 때 이 속성만 골라 훑는다
      // 목록은 자주 다시 그려진다(칸에 넣을 때마다). 켜 둔 표시를 여기서 다시
      // 입히지 않으면 니케 하나 넣자마자 불이 꺼져 버린다.
      if (elementsOf(rec).includes(litElem)) c.classList.add("lit");
    }
    if (!rec.parsed) {
      // 아직 안 나온 니케는 «파싱이 안 됐다»가 아니라 «아직 안 나왔다»가 사실이다.
      c.title = rec.preview ? T("출시 예정 — 스킬이 공개되면 계산할 수 있습니다")
        : T("스킬 미파싱 — 계산할 수 없습니다");
    } else if (usedIn) {
      c.title = fastMode ? T("{name} — 덱 {usedIn}에 있음", { name: rec.name, usedIn })
        : T("덱 {usedIn}에서 사용 중 — 덱 간 중복은 불가합니다", { usedIn });
    } else if (fastMode && !union) {
      // 여기서는 «놓을 자리»가 화면에 25칸이나 있어 바로 넣을 수 없다 —
      // 집어 두면(picked) 25칸 그리드에서 원하는 칸을 눌러 넣는다.
      c.onclick = () => {
        picked = picked === rec.name ? null : rec.name;
        setStatus(picked ? T("{picked} — 놓을 칸을 누르세요", { picked }) : "", false);
        renderAll();
      };
      c.addEventListener("pointerdown", (e) => startDrag(e, rec.name, null));
    } else {
      c.onclick = () => tapPlace(rec.name);
      c.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapPlace(rec.name); }
      };
      c.addEventListener("pointerdown", (e) => startDrag(e, rec.name, null));
    }
    wrap.append(c);
  }
  $("#pool-count").textContent = T("{length}명", { length: list.length });
  markOverflow();
}

/** 이름 비교기 — **화면에 보이는 글자를, 보고 있는 언어의 규칙으로** 견준다.
 *
 *  예전에는 한국어 이름을 한국어 규칙으로만 견줬다(`localeCompare(…, "ko")`). 이름은
 *  화면에서 번역돼 나가므로(`T(name)`) 영어로 보면 **정렬이 이름과 안 맞았다** — 실측:
 *  Neve가 Neon보다 위였다(네베 < 네온이라서). Novel이 Noah보다 위이기도 했다.
 *
 *  `Intl.Collator`는 만드는 값이 비싸서 한 번만 만든다. 언어를 바꾸면 페이지가 다시
 *  뜨므로(`i18n.js setLang` → `location.reload`) 도중에 낡을 일이 없다.
 *  `numeric`은 «2B»·«스칼렛 2» 같은 숫자를 글자가 아니라 수로 견주게 한다. */
let _nameColl = null;
function nameCmp(a, b) {
  if (!_nameColl) {
    const lang = (window.I18N && I18N.lang) || "ko";
    const tag = { zh: "zh-Hant", ja: "ja", en: "en", ko: "ko" }[lang] || lang;
    try { _nameColl = new Intl.Collator(tag, { numeric: true, sensitivity: "base" }); }
    catch { _nameColl = { compare: (x, y) => String(x).localeCompare(String(y)) }; }
  }
  return _nameColl.compare(T(String(a)), T(String(b)));
}

/** 정렬 비교기. «내 순서»는 즐겨찾기 등록 순서를 그대로 쓴다. */
function sorter(kind) {
  const ko = nameCmp;
  if (kind === "fav") {
    return (a, b) => {
      const ia = state.favs.indexOf(a.name), ib = state.favs.indexOf(b.name);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
      return ko(a.name, b.name);
    };
  }
  if (kind === "weapon") {
    return (a, b) => WEAPONS.indexOf(a.weapon) - WEAPONS.indexOf(b.weapon) || ko(a.name, b.name);
  }
  // 육성값으로 세는 정렬. 여기 비교기는 **언제나 오름차순**이다 — 방향은 `asc`
  // 하나가 정한다. 예전엔 여기서 미리 내림차순으로 뒤집어 놓아 `asc`가 뜻하는 것과
  // 화면이 반대였다(▼인데 작은 값이 위로 왔다). 큰 값을 먼저 보여 주는 «자연스러운
  // 기본»은 정렬을 고르는 자리에서 `asc = false`로 준다. 계정이 없는 니케는 0이다.
  const num = {
    // 인게임 전투력. 프로필의 `_combat`(UI 전용 키)에 담겨 온다 — 딜과 순위가
    // 같지는 않지만, 유저가 인게임에서 보던 숫자라 목록 기본 정렬로 쓴다.
    combat: (r) => growNum(r.name, (sp) => sp._combat ?? 0),
    elem: (r) => growNum(r.name, (sp) => sp.equip_skills?.element_bonus ?? 0),
    elematk: (r) => growNum(r.name,
      (sp) => (sp.equip_skills?.element_bonus ?? 0) + (sp.equip_skills?.atk_pct ?? 0)),
  }[kind];
  if (num) return (a, b) => num(a) - num(b) || ko(a.name, b.name);
  const key = { name: "name", burst: "burst", element: "element", cls: "cls" }[kind] || "name";
  return (a, b) => ko(a[key], b[key]) || ko(a.name, b.name);
}

/** 계정 정보에서 숫자 하나를 꺼낸다. 계정이 없으면 0 (정렬에서 맨 아래로 간다). */
/** 애장품(SSR 소장품)을 낀 니케인가. 인게임 «애장품» 필터와 같은 뜻이다. */
function hasFavItem(name) {
  const sp = charSpec(name);
  return !!(sp && (sp.favorite_stage ?? 0) > 0);
}

function growNum(name, pick) {
  const sp = charSpec(name);
  if (!sp) return 0;
  const v = pick(sp);
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/** 넘치는 이름만 흐르게 한다. 넘친 양을 재서 넘겨야 딱 그만큼만 움직인다 —
 *  비율(-100%)로 하면 이름 길이에 따라 너무 가거나 덜 간다. */
function markOverflow() {
  const SPEED = 34;                       // 초당 픽셀. 체감 속도를 한 값으로 묶는다
  for (const nm of document.querySelectorAll(".nk-nm")) {
    const track = nm.firstElementChild;
    const first = track?.firstElementChild;
    if (!first) continue;
    const over = first.offsetWidth > nm.clientWidth + 1;
    // 사본은 넘칠 때만 둔다 — 안 넘치면 두 벌이 나란히 보여 이상하다
    while (track.children.length > (over ? 2 : 1)) track.lastElementChild.remove();
    if (over && track.children.length === 1) track.append(el("i", null, first.textContent));
    nm.classList.toggle("over", over);
    if (over) {
      // 한 벌(여백 포함) 폭을 지나는 시간. -50%가 정확히 한 벌이다.
      nm.style.setProperty("--dur", `${Math.max(2, (track.scrollWidth / 2) / SPEED).toFixed(1)}s`);
    } else {
      nm.style.removeProperty("--dur");
    }
  }
}

// ── 드래그 (포인터 이벤트 — 마우스·터치 한 경로) ────────────────────────
let drag = null;
// 터치에서 끌기는 **위쪽 슬롯에서만** 된다.
//
// 터치에서는 «끌기»와 «넘기기»가 같은 동작이다. 어느 쪽을 줄지는 `touch-action`으로
// **제스처가 시작되기 전에** 정해야 한다 — 잡은 뒤에 바꿔 봐야 소용이 없어서,
// 길게 누르기로 갈라 보려던 시도는 손가락을 움직이는 순간 브라우저가 스크롤을
// 시작하며 `pointercancel`로 풀려 버렸다(게다가 길게 누르면 기본 메뉴가 떴다).
//
// 그래서 자리로 가른다:
//   위 슬롯 (5장, 한 줄)   → `touch-action: none` · 끌어서 자리 바꾸기
//   아래 로스터 (200장)    → `touch-action: pan-y` · 넘기기. 배치는 탭으로
//
// 로스터는 스크롤이 생명이고 슬롯은 스크롤할 게 없다. 그리고 아래쪽에는 이미
// 온전한 길이 있다 — 탭하면 빈 슬롯에 들어가고, 꽉 찼으면 «놓을 슬롯을 누르세요».
// 카드를 길게 누르면 브라우저가 «이미지 복사·새 탭으로 열기» 메뉴를 띄운다.
// 카드는 그림이 아니라 버튼이라 그 메뉴가 뜰 자리가 아니다.
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".nk")) e.preventDefault();
});

function startDrag(e, name, from) {
  // `from`이 있으면 슬롯에서 집은 것이다. 로스터(아래)에서 손가락으로 집는 것만 막는다.
  if (e.pointerType === "touch" && !from) return;
  if (e.button != null && e.button !== 0) return;
  if (e.target.closest(".nk-cog, .slot-x, .nk-fav")) return;
  beginDrag(e.clientX, e.clientY, name, from);
}

function beginDrag(x, y, name, from) {
  const ghost = el("div", "ghost");
  ghost.append(card(name, { inSlot: true, compact: fastMode }));
  document.body.append(ghost);
  drag = { name, from, ghost, target: null, moved: false, x0: x, y0: y };
  moveGhost(x, y);
  document.addEventListener("pointermove", onDragMove, { passive: false });
  document.addEventListener("pointerup", onDragEnd, { once: true });
  document.addEventListener("pointercancel", onDragEnd, { once: true });
}
const moveGhost = (x, y) => { drag.ghost.style.transform = `translate(${x - 36}px, ${y - 48}px)`; };

function onDragMove(e) {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
  if (!drag.moved) return;
  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(".slot, .u-slot");
  if (hit !== drag.target) {
    drag.target?.classList.remove("over");
    hit?.classList.add("over");
    drag.target = hit;
  }
}

function onDragEnd() {
  if (!drag) return;
  document.removeEventListener("pointermove", onDragMove);
  const { name, from, target, moved } = drag;
  target?.classList.remove("over");
  drag.ghost.remove();
  drag = null;
  if (!moved) return;                      // 안 움직였으면 클릭으로 넘긴다
  // 유니온 칸(.u-slot)은 **자기 저장소**에 꽂는다 — 솔로 place()는 state.decks를
  // 만지므로 여기로 오면 유니온에서 끈 것이 솔로 덱에 들어간다.
  if (target?.classList.contains("u-slot")) {
    uDrop(name, Number(target.dataset.udeck), Number(target.dataset.idx), from);
  } else if (target) {
    place(name, Number(target.dataset.deck), Number(target.dataset.idx));
  } else if (from) {
    if (from.union) {
      // 칸 밖으로 끌어내 버리는 것도 «뺀 것»이다 — 그 자리에서 되돌릴 수 있어야 한다
      uSnap(T("{name} 빼기", { name }), { deckIdx: from.deckIdx, idx: from.idx });
      uDeck(from.deckIdx).names[from.idx] = null;
      saveAll(); renderAll();
    }
    else clearSlot(from.deckIdx, from.idx);          // 슬롯 밖으로 끌어내면 비운다
  }
}

/** 유니온 칸에 꽂는다. 유니온도 줄 간 중복이 불가하므로 같은 이름이 다른 줄에
 *  있으면 먼저 뺀다. 칸에서 칸으로 끌면 **자리를 맞바꾼다** — 채워 둔 줄을 다시
 *  짤 때 하나씩 비우고 넣는 수고를 없앤다. */
function uDrop(name, deckIdx, idx, from) {
  // 자리를 **덮어썼으면** 그 칸에서 되돌릴 수 있어야 한다. 실수로 바꾼 것이
  // 빼는 것보다 알아채기 어렵다 — 빈 칸이 생기지 않아 눈에 안 걸린다.
  const had = uDeck(deckIdx).names[idx];
  uSnap(had && had !== name ? T("{had} → {name} 교체", { had, name }) : T("{name} 배치", { name }),
        had && had !== name ? { deckIdx, idx } : null);
  const dst = uDeck(deckIdx);
  const held = dst.names[idx];
  if (from?.union) {
    const src = uDeck(from.deckIdx);
    src.names[from.idx] = held;            // 맞바꾸기(빈 칸이면 그대로 비워진다)
  } else {
    for (let i = 0; i < UNION_DECKS; i++) {
      const at = uDeck(i).names.indexOf(name);
      if (at !== -1) uDeck(i).names[at] = null;
    }
  }
  dst.names[idx] = name;
  picked = null;
  saveAll();
  renderAll();
  slamSlot(deckIdx, idx);
}

// ── 계산 ────────────────────────────────────────────────────────────────
// 지문은 빌드가 이 파일에 박는다(`web/build.py stamp_assets`). app.js만 새로 받고
// worker.js가 낡으면 계산 쪽이 조용히 어긋난다.
const ASSET_V = "823cbf7c";
// ── 워커 풀 ─────────────────────────────────────────────────────────────
// 브라우저 계산은 **방문자 기기**에서 돈다. 워커 하나로 5덱을 줄 세우면 코어가 몇
// 개든 덱당 12초씩 60초가 걸린다 — 남는 코어를 쓰면 그대로 이득이다.
//
// 다만 워커 하나가 Pyodide 인스턴스 하나다(수백 MB). 무작정 늘리면 저사양 PC와
// 휴대폰이 메모리로 죽는다. 그래서 두 가지로 묶는다:
//   - 코어 수 - 1 (UI가 쓸 코어를 하나 남긴다)
//   - `deviceMemory`로 어림한 상한 (안 알려 주는 브라우저는 보수적으로 잡는다)
// 그리고 **필요할 때만 늘린다** — 덱 하나만 계산하는 사람이 5인분 메모리를 쓸 이유가 없다.
// 워커 하나가 Pyodide 인스턴스 하나이고 메모리를 200~300MB쯤 쓴다. 데스크톱은 5개
// (1GB 안팎)를 아무렇지 않게 견디지만 **모바일은 다르다** — 특히 iOS WebKit은 탭이
// 그만큼 쓰면 경고 없이 통째로 죽인다. 안드로이드도 데스크톱보다 빠듯하다.
// 그래서 갈림길은 «모바일이냐» 하나다.
//
// 사양을 숫자로 재려던 건 되돌렸다. `deviceMemory`·`performance.memory`는 **크롬 전용**
// 이라 사파리·파이어폭스에서는 기본값으로 떨어져 멀쩡한 데스크톱까지 묶었다.
// 모르는 값으로 성능을 깎느니 넉넉히 쓰고, 감당 못 하면 아래 «죽으면 물러서기»가
// 받아 낸다 — 그래도 안 되면 사용자가 「서버」로 바꾸면 된다.
//
// iPadOS 13부터 UA가 «Macintosh»로 나오고 `Mobi`도 없다. 그래서 터치 포인트를 같이
// 봐야 아이패드를 놓치지 않는다 (터치 맥북은 없으므로 오검출 걱정이 없다).
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const poolCapacity = () => (IS_MOBILE ? 2 : DECK_COUNT);

// 상한은 **줄어들 수 있다.** 워커가 죽으면(대개 메모리) 하나로 물러선다 — 재 본 값이
// 틀렸다는 증거가 실제로 나왔을 때 고집할 이유가 없다.
let poolMax = poolCapacity();

const pool = [];
const pending = new Map();
let workerReady = false;

function spawnWorker() {
  const rec = { w: new Worker(`worker.js?v=${ASSET_V}`), busy: 0 };
  rec.w.onmessage = ({ data }) => {
    if (data.type === "ready") { workerReady = true; renderEngine(); return; }
    if (data.type === "fatal") {
      failPending(T("브라우저 계산기를 불러오지 못했습니다: {error}", { error: data.error }));
      return;
    }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    rec.busy = Math.max(0, rec.busy - 1);
    p(data);
  };
  rec.w.onerror = (e) => failPending(
    T("브라우저 계산기가 멈췄습니다 ({v}) — 새로고침해 주세요. ", { v: e.message || T("워커 오류") })
    + T("계산만 필요하다면 위에서 「서버」로 바꿔도 됩니다."));
  rec.w.onmessageerror = () => failPending(
    T("브라우저 계산기와의 통신이 깨졌습니다 — 새로고침해 주세요."));
  pool.push(rec);
  return rec;
}
// **미리 띄우지 않는다.** 워커를 만드는 순간 Pyodide가 부팅하며 200~300MB를 잡는데,
// 서버 계산만 쓰는 사람에게는 그게 통째로 낭비다(모바일에서는 탭이 죽는 원인이 된다).
// 브라우저 계산을 **고르거나 실제로 계산할 때** 처음 띄운다 — 부팅 1.8초는 그때
// «준비 중…»으로 알린다.
function warmWorker() {
  if (!pool.length) spawnWorker();
}

/** 일을 맡길 워커. 노는 게 있으면 그걸 쓰고, 다 바쁘면 상한까지 늘린다. */
function pickWorker() {
  if (!pool.length) spawnWorker();
  const idle = pool.find((r) => r.busy === 0);
  if (idle) return idle;
  if (pool.length < poolMax) return spawnWorker();
  return pool.reduce((a, b) => (a.busy <= b.busy ? a : b));
}

// 워커가 통째로 죽으면(Pyodide 내려받기 실패·CSP 차단·메모리) **아무 답도 안 온다.**
// 그러면 기다리던 약속이 영영 안 끝나 화면은 «계산 중…»에 멈추고, 그 사이 재계산
// 버튼은 잠겨 있어 새로고침 말고는 빠져나갈 길이 없다. 기다리는 것들을 모두 실패로
// 마감해 이유를 보여 준다.
// 이 워커는 **계산만 하는 게 아니다** — 블라링크에서 받아 온 raw를 육성 프로필로
// 바꾸는 일도 여기서 한다. 그래서 워커가 죽으면 동기화도 같이 실패하는데, 문구가
// 「계산이 멈췄다」뿐이면 동기화 화면에서 엉뚱한 말이 뜬다. 그리고 변환은 서버
// 경로가 없으므로 «서버로 바꿔 보라»는 안내도 그때는 틀린 말이 된다.
function failPending(msg) {
  // 워커가 죽었다 — 재 본 상한이 이 기기에는 과했다는 뜻이다. 하나로 줄이고,
  // 여분은 정리한다. 실패한 덱은 부른 쪽이 한 번 더 시도한다.
  if (poolMax > 1) {
    poolMax = 1;
    for (const r of pool.slice(1)) r.w.terminate();
    pool.length = Math.min(pool.length, 1);
  }
  for (const [id, res] of [...pending]) {
    pending.delete(id);
    res({ type: "error", id, error: msg, workerDied: true });
  }
  for (const r of pool) r.busy = 0;
  setStatus(msg);
}

// 답이 아예 안 오는 경우까지 막는다. 브라우저 계산은 첫 실행에 Pyodide를 내려받느라
// 오래 걸릴 수 있어 넉넉히 잡되, **무한정 기다리지는 않는다.**
const WORKER_TIMEOUT = 300000;

function askWorker(msg) {
  return new Promise((res) => {
    const id = uid();
    warmWorker();
    const rec = pickWorker();
    rec.busy += 1;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      rec.busy = Math.max(0, rec.busy - 1);
      res({ type: "error", id,
            error: T("브라우저 계산기가 응답하지 않습니다 — 새로고침하거나 ")
                   + T("계산은 「서버」로 바꿔 보세요.") });
    }, WORKER_TIMEOUT);
    pending.set(id, (data) => { clearTimeout(timer); res(data); });
    rec.w.postMessage({ ...msg, id });
  });
}

/** 계산은 **서버에서만** 한다 (2026-08-26). 브라우저(Pyodide) 계산과 «계산 처리» 선택은 없앴다 —
 *  서버가 없으면 계산은 실패로 끝나고, 다른 경로로 대신 돌리지 않는다. */
// 계산은 **서버만** 한다(2026-08-26). 브라우저 계산은 2026-08-27에 걷어냈다 —
// «어느 쪽으로 계산했나»를 기록에 남기는 자리들이 아직 부르므로 이름은 남긴다.
const engine = () => "server";

/** 계산 처리 선택 UI가 없어져 할 일이 없다. renderAll이 부르던 자리라 이름만 남긴다. */
function renderEngine() {}

/** 서버 작업 하나를 이벤트 스트림으로 따라간다 → 결과 배열.
 *  대기 중에는 순번을, 도는 중에는 그 사실을 상태줄에 옮긴다. */
// 서버 작업(계산·조회)은 둘 다 **줄에 세우고 id만** 준다. 긴 POST로 기다리면 대기
// 순번을 보여 줄 수 없고 타임아웃에도 걸린다. 이벤트 스트림으로 진행을 받다가
// 끝나면 결과를 가져온다.
//
// `say(state, pos)`가 진행 문구를 만든다 — 계산과 조회는 같은 기계를 쓰되 사람에게는
// 다른 말을 해야 한다. 끝나면 **반드시 `say("idle")`로 진행 표시를 지운다** — 안 지우면
// 계산이 다 끝났는데도 «계산 중…» 띠가 남는다.
function jobEvents(kind, jobId, say) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/${kind}/events?id=${encodeURIComponent(jobId)}`);
    let got = false;
    const done = () => { got = true; es.close(); say("idle", 0); };
    es.onmessage = async (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.state === "queued" || m.state === "running") {
        say(m.state, m.pos);
      } else if (m.state === "done") {
        done();
        // 조회 결과는 스트림에 안 실려 온다 (340KB) — 따로 받아 온다.
        if (m.results !== undefined) return resolve(m.results);
        try {
          const r = await fetch(`/api/${kind}/result?id=${encodeURIComponent(jobId)}`);
          const j = await readJSON(r);
          if (j.error) throw new Error(j.error);
          resolve(j.results);
        } catch (e) { reject(e); }
      } else if (m.state === "error") {
        done(); reject(new Error(m.error));
      }
    };
    es.onerror = () => {
      if (got) return;                       // 정상 종료 뒤에도 한 번 온다
      es.close();
      say("idle", 0);
      reject(new Error(T("서버와의 연결이 끊겼습니다 — 잠시 후 다시 시도하세요.")));
    };
  });
}

// (계산은 2026-08-26부터 동기 응답이라 `simEvents`가 없다 — 이벤트 스트림은 조회(`fetchQueued`)만 쓴다)

/** 블라링크 조회를 줄에 세우고 결과(raw)를 받아 온다. `note`로 진행을 알린다. */
async function fetchQueued(body, note) {
  const r = await fetch("/api/fetch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await readJSON(r);
  if (j.error) throw new Error(j.error);
  const out = await jobEvents("fetch", j.job, (state, pos) => {
    if (state === "idle") return;            // 마무리 문구는 부른 쪽이 쓴다
    note(state === "running" ? T("블라블라링크에서 받는 중…")
      : (pos > 1 ? T("대기 중 — 앞에 {v}건", { v: pos - 1 }) : T("대기 중…")));
  });
  return out.raws;               // 지역별 raw 목록 — 계정에 한섭·일섭이 둘 다 걸리면 2개
}

// «상세 타임라인» 뷰어(timeline.js)가 그 덱만 다시 계산할 때 쓰는 /api/sim 본문 —
// calcDecks의 서버 요청과 같은 재료를 덱 하나로 줄인 것이다. 조건이 하나라도 다르면
// 뷰어 수치가 결과 탭과 어긋나므로 여기 말고 딴 데서 만들지 않는다.
function tlRequestFor(d) {
  const p = battlePayload(d);
  return {
    decks: [d.names], code: enemyCodeFor(d), duration: durationNow(),
    profile: mergedProfile(), enemy: p.enemy, config: p.config,
    controls: [ctrlPayload(d)], cubes: [cubePayload(d)], levels: [deckLevel()],
  };
}

// ── 버스트 비교 ─────────────────────────────────────────────────────────
// 같은 덱을 **버스트 순서마다** 돌려 보고 더 나은 순서를 알려 준다. 계산이 덱당 0.04초라
// 열몇 가지를 한 요청(계약 §4 — 12덱 상한)에 담아도 체감이 없다.
//
// **순서는 편성 자리로 표현한다** (2026-08-27). 인게임 오토 버스트가 왼쪽부터 쓰는 것과
// 같은 규칙이고, 코어의 기본 순서도 그것이다. 그래서 후보 하나는 «자리를 이렇게 바꾼
// 편성» 자체이고, 적용은 그 편성을 그대로 앉힌다 — 잰 것과 적용한 것이 어긋날 데가 없다.
//
// 조합을 어디까지 세는가:
//   · 버스트 단계(1·2·3·A)로 묶고, **2명 이상인 단계만** 선택지를 만든다.
//     혼자인 단계는 순서를 바꿔 봐야 그 단계에서 뽑힐 사람이 그 사람뿐이라 값이
//     한 자리도 안 움직인다(실측으로 확인했다 — 소수점까지 같았다).
//   · 단계마다 그 단계 멤버의 **자리 순열 전부**이고, 단계끼리는 **곱한다.**
//     1버 둘·3버 셋이면 2! × 3! = 12가지다. 여기에 «버스트 금지» 조합이 또 곱해진다.
//   · **버스트 «A»는 자리를 지킨다.** 그 니케는 세 단계에 동시에 걸려 있어서, 한
//     단계에서만 자리를 옮기는 것은 실제로 만들어 낼 수 없는 조합이다.
//   · **버스트 금지 걸린 사람은 순서 후보에서 뺀다.** 버스트를 아예 안 쓰므로 순서에
//     끼지 않고, 실제로 섞어 봐도 값이 그대로였다.
//
// 결과는 **결과 캐시에 안 넣는다**(`results`) — 내 덱의 결과가 아니라 가정이다.

/** «누가 먼저»가 뜻을 갖는 단계들. 각 항목은 `{ stage, members }` — members는 배치 순서다.
 *  2명 이상인 단계만 담는다: 혼자면 그 단계에서 뽑힐 사람이 그 사람뿐이라 값이 안 움직인다. */
/** **계산이 실제로 쓰는** 버스트 단계. 배지에 보이는 `burst`와 다를 수 있다 —
 *  단계가 «A»(어느 단계든 메움)인 니케를 `char_defaults.json`이 한 단계로 못 박기 때문이다
 *  (레드 후드 → 3버). 배지는 «A» 그대로 두고, 계산과 맞아야 하는 자리만 이걸 본다. */
const burstStageOf = (name) => {
  const r = byName.get(name);
  return String(r?.burst_stage ?? r?.burst ?? "?");
};

/** **이 편성에서** 그 니케가 실제로 서는 버스트 단계.
 *
 *  `burstStageOf`는 니케 하나만 보고 답한다. 그런데 편성을 봐야만 정해지는 니케가 있다:
 *  **라피 : 레드 후드**는 기본 3버지만 **1버 아군이 하나도 없으면 1버로 간다**
 *  (`burst_stage_override:1`, 조건 `no_burst1_ally`). 1버·3버를 동시에 메우는 것이
 *  아니라 **한쪽으로 옮겨 가는** 것이다.
 *
 *  버스트 비교가 이걸 몰라서 라피를 3버 무리에 넣고 순서를 섞었다 — 실제로는 그 편성에서
 *  3버에 서지도 않는데 «3버 …→ 라피 : 레드 후드 →…»를 추천했다(사용자 제보:
 *  라피·브리드·헬름·디젤·미하라 — 1버가 없는 편성). */
function burstStageIn(name, names) {
  const b = burstStageOf(name);
  if (name !== "라피 : 레드 후드") return b;
  const hasOne = names.some((n) => n && n !== name && burstStageOf(n) === "1");
  return hasOne ? b : "1";
}

/** 못 박힌 단계로 계산되는 니케들 — 그 사실을 화면이 **미리** 알려야 한다. */
const fbcPinned = (d) => d.names.filter(Boolean)
  .filter((n) => byName.get(n)?.burst_stage
                 && String(byName.get(n).burst_stage) !== String(byName.get(n).burst));

function fbcGroups(d) {
  const names = d.names.filter(Boolean);
  // 버스트 «A»는 단계가 고정이 아니다 — 코어가 1·2·3 목록에 **전부** 넣어 빈 자리를
  // 메우게 한다(`_rebuild_burst_order`). 그래서 여기서도 모든 단계의 참가자로 센다.
  const flex = names.filter((n) => burstStageIn(n, names) === "A");
  const stages = new Map();
  for (const n of names) {
    // **편성을 봐야 아는 단계**를 쓴다(`burstStageIn`) — 라피 : 레드 후드는 1버 아군이
    // 없으면 1버로 간다. 배지대로 3버에 묶으면 그 편성에서 일어나지도 않는 순서를 낸다.
    const b = burstStageIn(n, names);
    if (b === "A") continue;                          // 아래에서 모든 단계에 넣는다
    if (!stages.has(b)) stages.set(b, []);
    stages.get(b).push(n);                            // 배치 순서로 쌓인다
  }
  // **금지 걸린 사람도 뺀 채로 세지 않는다.** 금지 자체가 이 비교의 후보이기 때문이다
  // — 지금 금지해 둔 것을 푸는 쪽이 더 셀 수도 있다.
  return [...stages.entries()]
    .map(([stage, base]) => ({
      stage,
      // 편성 순서를 지켜 «A»를 끼워 넣는다 — 순서 계산이 편성 순서를 따르기 때문이다.
      members: names.filter((n) => base.includes(n) || flex.includes(n)),
      // **후보(=순서를 바꾸거나 금지할 대상)에서는 «A»를 뺀다.** 그 니케의 선버스트
      // 표시는 하나뿐인데 세 단계에 동시에 걸려서, «1버에서만 앞으로»처럼 사람이
      // 실행할 수 없는 조합이 나온다. 표시되는 순서에는 그대로 들어간다.
      fixed: flex,
    }))
    .filter((g) => g.members.filter((n) => !g.fixed.includes(n)).length > 1);
}

/** 이 우선 목록으로 그 단계가 실제로 쓰게 되는 **순서**.
 *
 *  코어는 «켠 사람들을 편성 순서로» 우선 목록에 담고 나머지를 그 뒤에 붙인다
 *  (`context/spec.py`의 `burst_priority`). 그래서 켠 집합만 알면 순서가 정해진다. */
/** 이 단계의 **자리 순열**을 전부. 각 항목은 `{ order }` — 왼쪽부터 쓰는 순서다.
 *
 *  ### 왜 플래그가 아니라 자리인가 (유저 결정 2026-08-27)
 *
 *  예전에는 «선버스트» 플래그를 여러 명 켜서 순서를 표현했다. 코어가 «켠 사람들을 편성
 *  순서로 우선 목록에» 담기 때문이다(`burst_priority`). 두 가지가 잘못됐다:
 *
 *  · **규약이 두 벌이었다.** 컨트롤의 선버 체크는 «같은 단계 한 명만»인데 추천은 여러 명을
 *    켰다 — 적용하고 컨트롤을 열면 둘 다 켜져 있어 버그로 보였다(사용자 제보).
 *  · **역순을 못 만들었다.** 켠 사람들끼리는 편성 순서를 따르므로 셋이면 6순서 중 5개만
 *    나왔다(«셋째 → 둘째 → 첫째»가 빠진다).
 *
 *  자리로 하면 둘 다 풀리고, **인게임 오토 버스트(왼쪽부터)와 같은 규칙**이 된다.
 *
 *  `fixed`(버스트 «A»)는 자리를 지킨다 — 그 니케는 세 단계에 동시에 걸려서, 한 단계에서만
 *  자리를 옮기는 것은 실제로 만들 수 없는 조합이다. */
function fbcStageOrders(members, fixed = []) {
  const movable = members.filter((n) => !fixed.includes(n));
  const slots = members.map((n, k) => (fixed.includes(n) ? -1 : k)).filter((k) => k >= 0);
  const out = [];
  const walk = (left, acc) => {
    if (!left.length) {
      const order = [...members];
      acc.forEach((n, k) => { order[slots[k]] = n; });
      out.push({ order });
      return;
    }
    for (let k = 0; k < left.length; k++) {
      walk([...left.slice(0, k), ...left.slice(k + 1)], [...acc, left[k]]);
    }
  };
  walk(movable, []);
  return out;
}

function fbcStageVariants(members, fixed = []) {
  const out = new Map();
  const movable = members.filter((n) => !fixed.includes(n));
  for (let mask = 0; mask < (1 << movable.length); mask++) {
    const bans = movable.filter((_, i) => mask & (1 << i));
    const live = members.filter((n) => !bans.includes(n));
    if (!live.filter((n) => !fixed.includes(n)).length) continue;
    for (const o of fbcStageOrders(live, fixed)) {
      const key = `${bans.join(",")}#${o.order.join(">")}`;
      if (!out.has(key)) out.set(key, { bans, order: o.order });
    }
  }
  return [...out.values()];
}

/** 이 덱의 버스트 조합 전부. 각 항목은 `{ picks, bans, orders, ctrl }`.
 *  단계끼리는 곱한다 — 1버 둘·3버 셋이면 4 × 14 = 56가지다. */
function fbcVariants(d) {
  const names = d.names.filter(Boolean);
  const groups = fbcGroups(d);
  let combos = [{ bans: [], orders: [] }];
  for (const g of groups) {
    const next = [];
    for (const base of combos) {
      for (const o of fbcStageVariants(g.members, g.fixed)) {
        next.push({ bans: [...base.bans, ...o.bans],
                    orders: [...base.orders, { stage: g.stage, order: o.order, bans: o.bans }] });
      }
    }
    combos = next;
  }
  // **지금 설정이 조합에 없으면 넣는다.** «한 단계를 통째로 금지»는 후보로 만들지
  // 않는데(그 단계가 없으면 풀버스트가 안 선다), 사람이 이미 그렇게 해 뒀으면 기준선이
  // 사라져 `baseTotal`이 «가장 높은 값»으로 떨어진다 — 실측으로 추천이 0줄이 되고
  // «지금 설정이 가장 높습니다»가 떴다(실제로는 +529% 여지가 있었다).
  const curKey = fbcOrdersKey(fbcCurrentOrders(d));
  if (!combos.some((c) => fbcOrdersKey(c.orders) === curKey)) {
    combos.push({ bans: names.filter((n) => d.control?.[n]?.no_burst),
                  orders: fbcCurrentOrders(d) });
  }
  return combos.map(({ bans, orders }) => {
    // 지금 컨트롤을 그대로 두고 **버스트 관련 둘만** 갈아 끼운다 — 톡톡이·큐브 같은
    // 다른 설정까지 바뀌면 차이가 «버스트 때문»이 아니게 된다.
    //
    // 후보가 되는 단계(2명 이상)의 사람만 손댄다. 혼자인 단계의 금지는 사람이 뜻을
    // 갖고 걸어 둔 것이므로 건드리지 않는다 — 그 단계는 애초에 바꿀 자리가 없다.
    const inPlay = new Set(fbcGroups(d).flatMap((g) => g.members));
    const banned = new Set(bans);
    const ctrl = {};
    for (const n of names) {
      const c = d.control?.[n];
      if (c && Object.keys(c).length) ctrl[n] = { ...c };
      // 선버 플래그는 더 쓰지 않는다(순서는 자리가 표현한다) — 옛 덱에 남아 있으면
      // 코어가 그걸 먼저 보므로 **잴 때도 적용할 때도 반드시 지운다.**
      if (ctrl[n]) delete ctrl[n].burst_first;
      if (ctrl[n] && inPlay.has(n)) delete ctrl[n].no_burst;
    }
    for (const n of banned) (ctrl[n] ||= {}).no_burst = true;
    for (const n of Object.keys(ctrl)) if (!Object.keys(ctrl[n]).length) delete ctrl[n];
    // **적용이 하는 일과 똑같이 만든다** — 순서는 `names`로 보낸다.
    return { bans, orders, names: fbcNamesFor(d, orders),
             ctrl: Object.keys(ctrl).length ? ctrl : null };
  });
}

/** 단계별 순서의 서명 — 기준선 대조와 중복 판정이 **같은 규칙**을 써야 한다. */
const fbcOrdersKey = (orders) =>
  (orders || []).map((o) => `${o.stage}:${o.order.join(">")}/${o.bans.join(",")}`).join("|");

/** 지금 이 덱의 단계별 순서 — 비교의 기준선.
 *
 *  **편성 자리가 곧 순서다.** `fbcGroups`가 이미 편성 순서로 멤버를 담으므로 그대로 쓴다.
 *  «순서를 안 정했다»는 상태는 없다. */
const fbcCurrentOrders = (d) => fbcGroups(d).map((g) => {
  const bans = g.members.filter((n) => d.control?.[n]?.no_burst);
  return { stage: g.stage, order: g.members.filter((n) => !bans.includes(n)), bans };
});

/** 단계별 순서를 **편성 자리에 새긴다** → 새 `names`.
 *
 *  그 단계 멤버가 앉아 있는 자리들만 서로 바꾼다 — 다른 단계와 금지된 멤버는 제자리다.
 *  자리를 옮기면 «버스트 순서»만 바뀌는 것이 지금 코어의 규칙이다(후보 정렬이 편성
 *  순서를 따른다). 나중에 자리에 다른 효과가 붙으면 그것도 같이 움직인다. */
function fbcNamesFor(d, orders) {
  const names = [...d.names];
  for (const o of orders || []) {
    const want = o.order;
    if (!want.length) continue;
    const slots = [];
    for (let i = 0; i < names.length; i++) if (want.includes(names[i])) slots.push(i);
    want.forEach((n, k) => { if (slots[k] != null) names[slots[k]] = n; });
  }
  return names;
}

/** 조합 하나를 사람 문장으로 —
 *  «3버 라피 : 레드 후드 → 미하라 : 본딩 체인 (프리바티 금지)».
 *
 *  화살표는 **편성 왼쪽부터의 순서**다. 적용하면 그 순서대로 편성 자리가 바뀐다. */
function fbcLabel(d, orders) {
  if (!orders || !orders.length) return T("바꿀 자리가 없습니다");
  return orders.map((o) => (o.order.length
      // 이름은 **한 명씩** 사전을 태우고 잇는다 — 이어 붙인 덩어리는 사전에 없다(제보 2026-09-02).
      ? T("{v}버 {name}", { v: o.stage, name: o.order.map((n) => T(n)).join(" → ") })
      : T("{v}버 없음", { v: o.stage }))            // 그 단계를 통째로 금지한 상태
    + (o.bans.length ? T(" ({v} 금지)", { v: o.bans.map((n) => T(n)).join(" · ") }) : "")).join(" · ");
}

let fbcRunning = false;

/** 이번 비교에서 «순서를 바꾸지 않은» 단계 무관 니케(버스트 A). 결과에 한 줄로 알린다. */
let fbcFlexNote = [];

/** 계산이 못 박은 단계로 도는 니케 — 배지와 달라서 **미리** 말해 줘야 한다. */
let fbcPinNote = [];

/** 편성 때문에 단계가 옮겨 간 니케 `[이름, 단계]` — 라피 : 레드 후드. */
let fbcMoveNote = [];

/** 적용 **직전**의 버스트 순서. «순서 되돌리기»가 이걸로 되돌린다.
 *  `key`는 «어느 덱의 어느 편성이었나»다 — 덱을 옮기거나 니케를 갈아 끼우면 되돌릴
 *  대상이 사라지므로(다른 편성 얘기가 된다) 그때 조용히 버린다. */
let fbcUndo = null;

/** 되돌릴 것이 이 덱 것인지 가리는 열쇠 — 덱 번호 + **누가 있나**.
 *
 *  자리 순서는 일부러 뺀다. 적용이 하는 일이 곧 자리 바꾸기라, 순서를 열쇠에 넣으면
 *  적용한 그 순간 열쇠가 어긋나 되돌리기 버튼이 사라진다(실측). 가려야 하는 것은
 *  «다른 편성 얘기가 됐나»이지 «순서가 바뀌었나»가 아니다. */
const fbcKeyOf = (deckIdx) =>
  `${deckIdx}:${deckAt(deckIdx).names.map((n) => n || "").sort().join("|")}`;

/** 적용 전 상태를 담아 두는 그릇 — 후보가 되는 사람들의 «금지·버스트 주기».
 *
 *  순서는 여기 없다 — **편성 자리**가 들고 있어서 `fbcUndo.names`가 담는다. */
const fbcFlagsOf = (d) => {
  const out = {};
  for (const n of fbcGroups(d).flatMap((g) => g.members)) {
    const c = d.control?.[n] || {};
    out[n] = { ban: !!c.no_burst,
               pattern: "burst_pattern" in c ? c.burst_pattern : undefined };
  }
  return out;
};

/** 적용 직전으로 되돌린다. */
function fbcUndoApply() {
  if (!fbcUndo) return;
  const { deckIdx, before, label } = fbcUndo;
  const d = deckAt(deckIdx);
  // **자리를 먼저 되돌린다** — 순서가 거기 들어 있다.
  if (fbcUndo?.names) d.names = [...fbcUndo.names];
  for (const [n, was] of Object.entries(before)) {
    if (!!d.control?.[n]?.no_burst !== was.ban) {
      setCtrl(n, "no_burst", was.ban ? true : null, d);
    }
    // 주기는 «없음»과 «null(안 씀)»이 다른 뜻이라 `undefined`로 갈라 본다.
    const now = d.control?.[n] || {};
    const hadPattern = "burst_pattern" in now ? now.burst_pattern : undefined;
    if (hadPattern !== was.pattern) {
      setCtrl(n, "burst_pattern", was.pattern === undefined ? null : was.pattern, d);
    }
  }
  fbcUndo = null;
  renderAll();
  flashStatus(T("버스트를 «{v}»로 되돌렸습니다.", { v: label }));
  // 적용과 같은 규약으로 **바로 다시 계산한다** — 되돌려도 자리가 바뀌므로 총딜이
  // 똑같이 «미계산»으로 빈다. 한쪽만 채워 주면 되돌린 사람이 빈 칸을 본다.
  calcDecks([deckIdx], true).catch(() => { /* 실패는 덱의 error가 화면에 말한다 */ });
}

/** 결과를 낼 상자. 배치모드·유니온에서는 편성 상자가 통째로 숨으므로 그쪽 것을 쓴다. */
const fbcBox = () => $(modeNow() === "union" ? "#union-fbc-out"
  : fastMode ? "#fast-fbc-out" : "#deck-fbc-out");

async function fbcRun(deckIdx) {
  const d = deckAt(deckIdx);
  if (!fbcBox() || fbcRunning) return;
  if (!isFull(d)) { fbcMsg(T("5명을 채우면 비교할 수 있습니다."), "err"); return; }
  const vars = fbcVariants(d);
  if (vars.length <= 1) {
    fbcMsg(T("이 덱은 바꿀 자리가 없습니다 — 같은 버스트 단계에 두 명 이상이어야 합니다."), "err");
    return;
  }
  fbcRunning = true;
  fbcMsg(T("{n}가지 조합을 돌리는 중…", { n: vars.length }));
  const ns = d.names.filter(Boolean);
  fbcFlexNote = ns.filter((n) => burstStageIn(n, ns) === "A");
  fbcPinNote = fbcPinned(d);
  // 편성 때문에 단계가 옮겨 간 니케 — 말 안 하면 «왜 3버에 없지»가 된다.
  fbcMoveNote = ns.filter((n) => burstStageIn(n, ns) !== burstStageOf(n))
    .map((n) => [n, burstStageIn(n, ns)]);
  try {
    const max = Math.max(1, Number(HEALTH.max_decks) || 12);
    const pl = battlePayload(d);
    // **버스트 순서 비교는 언제나 기대값이다**(유저 지시 2026-08-31). 이 화면이 하는 말은
    // «어느 순서가 더 낫나»인데, 한 판의 운이 섞이면 순위가 운으로 뒤집힌다 — 크리 판정을
    // «굴리기»로 둔 사람에게도 여기서는 굴리지 않는다.
    delete pl.config.rng_mode;
    delete pl.config.seed;
    const names = d.names.filter(Boolean);
    const totals = [];
    for (let at = 0; at < vars.length; at += max) {
      const part = vars.slice(at, at + max);
      const r = await fetch("/api/sim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // **조합마다 편성이 다르다** — 순서를 자리로 표현하므로 덱 이름 배열 자체가
          // 후보다. 예전에는 이름은 하나로 두고 컨트롤(선버 플래그)만 갈아 끼웠다.
          kind: "fbc", mode: modeNow(), dororong: dororongOn(), lang: I18N.lang || "ko",
          decks: part.map((v) => v.names || names), duration: durationNow(), code: enemyCode(),
          profile: mergedProfile(), enemy: pl.enemy, config: pl.config,
          codes: part.map(() => enemyCodeFor(d)),
          enemies: part.map(() => pl.enemy), configs: part.map(() => pl.config),
          controls: part.map((v) => v.ctrl), cubes: part.map(() => cubePayload(d)),
          levels: part.map(() => deckLevel()),
          // 이 화면은 **총딜만** 본다(아래 `res.total`이 전부다). `lean`을 주면 서버가
          // 파생 요약(detail·top_atk·timeline·burst_cycles)을 **아예 만들지 않는다** —
          // 12덱 한 방 실측으로 응답 110.8KB → 2.0KB, 벽시계 189 → 172ms. 시간 이득이
          // 한 자릿수%인 것은 계산 자체가 지배적이라서고, 비교는 배치를 여러 번 도므로
          // 쌓인다. **모르는 서버는 이 키를 무시**해 무거운 응답을 줄 뿐 깨지지 않는다
          // (계약 §4) — 그래서 갈라 보내지 않고 늘 붙인다.
          lean: true,
        }),
      });
      const j = await readJSON(r);
      if (j.error) throw new Error(j.error);
      if (!Array.isArray(j.results) || j.results.length !== part.length) {
        throw new Error(T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
      }
      j.results.forEach((res, k) => totals.push({ ...part[k], total: Number(res.total) || 0 }));
    }
    fbcRender(deckIdx, totals);
  } catch (e) {
    fbcMsg(String(e.message || e), "err");
  } finally {
    fbcRunning = false;
  }
}

// ── «이 자리에 누가 제일 좋아?» — 자리 추천 ───────────────────────────────
// 카드 자리 하나(비었든 찼든)에 단추 하나. 후보를 하나씩 그 자리에 넣어 **실제로 돌려**
// 순위를 낸다(유저 확정 2026-09-02). 계산은 서버의 «큰 계산 차선»(/api/sim-heavy → 맥 워커)
// 이 맡는다 — 보통 계산 줄을 안 막는다. 문구는 «내 스펙으로 계산한 결과»로만 쓴다.
//
// 후보 거르기(유저 결정): 계정에 있고 · 동기화 소대 안(`_unsynced` 아님) · 이 덱·다른 덱에 없음 ·
// 계산 불가(unsupported) 아님 · 버스트 단계가 맞음 — 네 명이 1·2·3을 다 갖췄으면 자유,
// 한 단계가 비면 그 단계(또는 전체 버스트)만, 둘 이상 비면 한 명으론 못 채우니 안 거른다.
// 판은 언제나 기대값 1판(운으로 순위가 뒤집히지 않게), 응답은 총딜만(lean).
let recoRunning = false;
let recoWired = false;

/** 옵션 — 다른 덱에 있는 니케를 후보에서 뺄지. 기본은 넣는다(유저 지시 2026-09-02 — 넣으면 맞바꾼다). */
let recoExcludeElsewhere = false;

/** 정사각 얼굴 한 장 — 시트의 줄·자리 고르기가 쓴다. 초상화(세로)를 네모에 욱여넣으면 안 맞는다(유저 지적). */
function recoFace(name) {
  const box = el("span", "reco-face");
  const rec = byName.get(name);
  if (rec && (rec.face || rec.img)) {
    const im = el("img");
    im.src = faceSrc(rec, name);
    im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
    box.append(im);
  }
  return box;
}

/** «한 명을 바꾼다면?» — 먼저 **자리를 고른다**(다섯 중 하나, 빈 자리 포함). 칸마다 단추를 달면
 *  칸이 길어진다(유저 지적 2026-09-02) — 왼쪽 단추 기둥(솔로)·줄 단추(유니온)에서 연다. */
function recoChooser(deckIdx) {
  const body = $("#reco-body");
  if (!body) return;
  body.textContent = "";
  const d = deckAt(deckIdx);
  body.append(el("p", "share-pick-note", T("어느 자리를 바꿔 볼까요? 자리를 고르면 그 자리에 누가 제일 좋은지 내 계정 스펙으로 후보를 전부 돌려 봅니다.")));
  const grid = el("div", "reco-choose");
  d.names.forEach((n, i) => {
    const b = el("button", "reco-choice" + (n ? "" : " empty"));
    b.type = "button";
    if (n) { b.append(recoFace(n)); b.append(el("b", null, n)); }
    else { b.append(el("span", "reco-choice-plus", "+")); b.append(el("b", null, T("빈 자리 {n}", { n: i + 1 }))); }
    b.onclick = () => recoRun(deckIdx, i);
    grid.append(b);
  });
  body.append(grid);
  const lab = el("label", "share-opt");
  const ck = el("input");
  ck.type = "checkbox";
  ck.checked = recoExcludeElsewhere;
  ck.onchange = () => { recoExcludeElsewhere = ck.checked; };
  lab.append(ck, el("span", null, T("다른 덱에 들어 있는 니케는 빼기")));
  lab.title = T("끄면 다른 덱의 니케도 후보에 들고, 넣으면 그 자리와 서로 맞바꿉니다");
  body.append(lab);
}

/** 이 자리에 넣어 볼 후보. 왜 걸렀는지도 함께 돌려준다(시트 머리에 적는다). */
function recoCandidates(d, idx) {
  const rec = activeRec();
  const chars = rec?.fetched?.chars || {};
  const fixed = d.names.filter((n, i) => n && i !== idx);
  const union = modeNow() === "union";
  // 다른 덱에 있는 니케도 후보다(유저 지시 2026-09-02) — 넣으면 그쪽 자리와 맞바꾼다. 어디 있는지를
  // 표에 적고, 옵션(recoExcludeElsewhere)을 켜면 뺀다.
  const elsewhere = new Map();
  const decks = union ? U().decks : state.decks;
  decks.forEach((o, di) => {
    if (o === d) return;
    for (const n of o.names) if (n) elsewhere.set(n, di + 1);
  });
  // 네 명이 갖춘 버스트 단계 — «A»(전체 버스트)는 어느 단계든 선다.
  const have = new Set();
  for (const n of fixed) {
    const s = burstStageIn(n, fixed);
    if (s === "A") { have.add("1"); have.add("2"); have.add("3"); } else have.add(s);
  }
  const missing = ["1", "2", "3"].filter((s) => !have.has(s));
  const needStage = missing.length === 1 ? missing[0] : null;
  const list = [];
  for (const r of ROSTER) {
    const n = r.name;
    if (fixed.includes(n)) continue;
    if (recoExcludeElsewhere && elsewhere.has(n)) continue;
    // 계정에 없으면 뺀다 — 미육성 바닥값으로 순위에 끼면 안 된다. 다만 **출시 전 니케**는 계정에
    // 있을 수가 없으므로 기본 스펙으로 후보에 넣는다(유저 지시 2026-09-02) — 유저가 카드 톱니에서
    // 고쳐 두었으면 그 값으로 계산된다(요청에 실리는 프로필은 수정 층까지 합친 것이다).
    const spec = chars[n] || (isPreview(n) ? previewSpec(n) : null);
    if (!spec) continue;
    if (spec._unsynced) continue;                         // 동기화 소대 밖 — 레벨이 다르다
    if (r.status === "unsupported" || r.parsed === false) continue;
    if (needStage) {
      const s = burstStageIn(n, [...fixed, n]);
      if (s !== needStage && s !== "A") continue;
    }
    list.push(n);
  }
  return { list, needStage, missing, elsewhere };
}

function recoOpen(deckIdx, idx) {
  const dlg = $("#reco-sheet");
  if (!dlg) return;
  if (!recoWired) {
    recoWired = true;
    $("#reco-x")?.addEventListener("click", () => { if (dlg.open) dlg.close(); });
  }
  if (!dlg.open) dlg.showModal();
  if (idx == null) recoChooser(deckIdx);
  else recoRun(deckIdx, idx);
}

function recoMsg(text, kind) {
  const body = $("#reco-body");
  if (!body) return;
  body.textContent = "";
  body.append(el("p", "fbc-msg" + (kind === "err" ? " warn" : ""), text));
}

async function recoRun(deckIdx, idx) {
  if (recoRunning) return;
  const d = deckAt(deckIdx);
  const cur = d.names[idx] || null;
  if (!activeRec()) { recoMsg(T("먼저 «내 계정»에서 계정을 받아 오세요 — 내 스펙으로 돌려야 답이 됩니다."), "err"); return; }
  const others = d.names.filter((n, i) => n && i !== idx);
  if (!others.length) { recoMsg(T("다른 자리를 먼저 채우세요 — 누구와 함께 서느냐가 답을 정합니다."), "err"); return; }
  const { list, needStage, missing, elsewhere } = recoCandidates(d, idx);
  if (!list.length) { recoMsg(T("넣어 볼 후보가 없습니다 — 동기화 소대 안에 이 자리에 맞는 니케가 없습니다."), "err"); return; }
  recoRunning = true;
  recoMsg(T("후보 {n}명을 이 자리에 넣어 돌리는 중…", { n: list.length }));
  try {
    const pl = battlePayload(d);
    // 순위는 언제나 기대값이다 — 운이 섞이면 순위가 뒤집힌다(버스트 비교와 같은 규칙).
    delete pl.config.rng_mode;
    delete pl.config.seed;
    const mk = (who) => d.names.map((n, i) => (i === idx ? who : n));
    const decks = list.map(mk);
    if (cur) decks.unshift(mk(cur));                      // 0번은 «지금 사람» — 같은 판에서 잰 기준선
    const ctrlFor = (names) => {
      const out = {};
      for (const n of names) if (n && d.control?.[n] && Object.keys(d.control[n]).length) out[n] = d.control[n];
      return Object.keys(out).length ? out : null;
    };
    const cubeFor = (names) => {
      const out = {};
      names.forEach((nm, i) => { if (!nm || i === idx) return; const c = cubeOf(d, i); if (c) out[nm] = { name: c.name, level: c.level }; });
      return Object.keys(out).length ? out : null;
    };
    const totals = [];
    const max = 400;                                      // 서버 차선 상한(계약 §5)
    for (let at = 0; at < decks.length; at += max) {
      const part = decks.slice(at, at + max);
      const r = await fetch("/api/sim-heavy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "reco", heavy: "slot", mode: modeNow(), dororong: dororongOn(), lang: I18N.lang || "ko",
          decks: part, duration: durationNow(), code: enemyCode(),
          profile: mergedProfile(), enemy: pl.enemy, config: pl.config,
          codes: part.map(() => enemyCodeFor(d)),
          enemies: part.map(() => pl.enemy), configs: part.map(() => pl.config),
          controls: part.map(ctrlFor), cubes: part.map(cubeFor),
          levels: part.map(() => deckLevel()),
          lean: true,
        }),
      });
      const j = await readJSON(r);
      if (j.error) throw new Error(j.error);
      if (!Array.isArray(j.results) || j.results.length !== part.length) {
        throw new Error(T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
      }
      for (const res of j.results) totals.push(Number(res.total) || 0);
    }
    const base = cur ? totals.shift() : null;
    const rows = list.map((n, k) => ({ name: n, total: totals[k] }))
      .sort((a, b) => b.total - a.total);
    recoRender(deckIdx, idx, { cur, base, rows, needStage, missing, elsewhere });
  } catch (e) {
    recoMsg(String(e.message || e), "err");
  } finally {
    recoRunning = false;
  }
}

function recoRender(deckIdx, idx, { cur, base, rows, needStage, missing, elsewhere }) {
  const body = $("#reco-body");
  if (!body) return;
  body.textContent = "";
  const d = deckAt(deckIdx);
  const union = modeNow() === "union";
  body.append(mkBtn(T("← 자리 다시 고르기"), "btn-ghost btn-sm reco-back", () => recoChooser(deckIdx)));
  const head = el("p", "share-pick-note");
  head.append(el("span", null, T("내 계정 스펙으로, 지금 편성의 나머지 자리·레이드 설정 그대로 한 판씩 돌린 결과입니다(평균 판). ")));
  head.append(el("span", null, needStage
    ? T("이 자리는 {s}버스트가 비어 {s}버스트(또는 전체 버스트)만 후보로 잡았습니다 — {n}명.", { s: needStage, n: rows.length })
    : missing.length >= 2
      ? T("비어 있는 버스트 단계가 둘 이상이라 단계로 거르지 않았습니다 — {n}명.", { n: rows.length })
      : T("버스트 단계는 이미 다 갖춰져 있어 아무나 들어갈 수 있습니다 — {n}명.", { n: rows.length })));
  body.append(head);
  if (cur && base != null) {
    const now = el("p", "reco-now");
    now.append(el("b", null, T("지금: {name}", { name: cur })), el("span", null, ` · ${I18N.dmg(base)}`));
    body.append(now);
  }
  const list = el("div", "reco-list");
  rows.forEach((r, i) => {
    const row = el("div", "reco-row" + (r.name === cur ? " cur" : ""));
    row.append(el("span", "reco-rank", String(i + 1)));
    row.append(recoFace(r.name));
    const nm = el("span", "reco-name");
    nm.append(el("b", null, r.name));
    const st = burstStageIn(r.name, d.names.map((n, k) => (k === idx ? r.name : n)));
    nm.append(el("i", "reco-burst", st === "A" ? T("전체") : T("{s}버", { s: st })));
    const at = elsewhere?.get(r.name);
    if (at) nm.append(el("i", "reco-else", union ? T("{n}번 줄에 있음", { n: at }) : T("{n}덱에 있음", { n: at })));
    row.append(nm);
    const val = el("span", "reco-dmg");
    val.append(el("b", null, I18N.dmg(r.total)));
    if (base != null) val.append(deltaEl(base, r.total));
    row.append(val);
    if (r.name !== cur) {
      row.append(mkBtn(T("넣기"), "btn-primary btn-sm", () => {
        if (modeNow() === "union") {
          uSnap(T("{picked} 배치", { picked: r.name }));
          // 다른 줄에 있던 니케면 그 자리에 지금 사람을 보낸다(솔로 place()와 같은 맞바꿈).
          U().decks.forEach((o, j) => {
            if (j === deckIdx) return;
            const oi = o.names.indexOf(r.name);
            if (oi !== -1) o.names[oi] = cur && cur !== r.name ? cur : null;
          });
          uDeck(deckIdx).names[idx] = r.name;
          saveAll(); renderAll(); slamSlot(deckIdx, idx);
        } else {
          place(r.name, deckIdx, idx);
        }
        const dlg = $("#reco-sheet");
        if (dlg?.open) dlg.close();
      }));
    }
    list.append(row);
  });
  body.append(list);
}

// ── 실험실 — 큐브 최적화 · 컨트롤 자동 탐색 ─────────────────────────────────
// 둘 다 «지금 편성은 그대로 두고, 갈아 끼울 수 있는 것만 최선으로» 고르는 도구다(유저 지시 2026-09-03).
// 무거운 차선(맥)에서 한 묶음(≤400판)씩 돌린다 — 판 수는 큐브 100판 안팎, 컨트롤 100~150판.
//
// **큐브** — 개수 제한 없음(같은 큐브를 여러 명이 껴도 된다 — 유저 지시 2026-09-03). 자리마다 후보를
// 전부 넣어 보고 → 자리별 최선을 같이 얹어 실제로 한 판 돌려 참값을 얻고 → 그 자리에서 다시 반복한다
// (보통 한두 바퀴, ≤3). 이득은 더하면 정확히 안 맞으므로 **실제로 돌린 값만** 답으로 쓴다. «지금»이
// 기준이라 못 넘으면 «지금이 가장 높다». 후보는 계정이 가진 큐브(보유 레벨)만, 그중 딜에 닿는 종류만이다 —
// 방어·회복·피해감소 큐브는 무엇에도 딜에 영향이 없어 처음부터 뺀다(유저 지시). 체력 큐브(렐릭 비고르)는
// 최대 체력이 그대로 공격력이 되는 «atk_from_hp_pct» 니케(2B·드레이크 : 그레이트 빌런·라플라스 : 얼티밋
// 히어로·맥스웰 : 오디너리 미케닉·메이든 : 아이스 로즈·신데렐라)에게 실제로 딜이 붙어 후보에 넣는다(코어 확인
// 2026-09-03) — 잃은 체력 비례(목단·길로틴)는 다른 갈래라 여기 안 묶는다. 렐릭 퀀텀 큐브(버스트 게이지
// 충전 속도)는 계산 자체는 반영됐지만(CALC_V c14) 실누적 180초에 다섯 명 착용해도 +0.2~0.4%뿐이라 다른
// 큐브와 나란히 두면 늘 뒤로 가 추천에서는 노이즈만 된다 — 후보에서 뺀다(유저 지시 2026-09-03, 아레나에서나
// 중요하다고 판단). 택티컬 부스트 큐브는 뺀 채로 둔다. **렐릭 부스트 큐브는 도로 넣었다** — 처음엔
// «부스트는 아니야, 아예 제외»였다가, 코어가 차지 무기 17명 실측에서 레드 후드 스킬1(차지 속도 초과분을
// 차지 대미지로 변환)이 큐브 몫을 실제 딜로 바꾼다는 걸 확인 — SR·RL 차지 무기 85명 중 78명이 움직이고
// (E.H. +9.0%·벨벳 +6.9%·루주 +6.2%…) 유저가 «차지 무기 쓰는 애들은 다 체크해줘»로 확정해 니케를 가린
// 후보로 넣었다(2026-09-03). 재장전(렐릭 베어)·탄충(택티컬 베어)은 «서포터·딜러 상관없이
// 무조건 체크해야 하는 주요 큐브»라 **역할군과 무관하게** 항상 후보다(유저 지시) — 다만 **보유 여부는
// 그대로 본다**(유저 정정 2026-09-03: «보유하지 않았으면 후보로 넣는 게 아님», 처음엔 보유 필터까지
// 건너뛰게 했다가 되돌림). 계정 정보가 아예 없으면(!haveInfo) 종전처럼 전부 후보다. 렐릭 크래시(방어력
// 무시 대미지)·렐릭 디스트로이(파츠 대미지)·렐릭 부스트(차지 속도)는
// 니케를 가려서만 후보다 — `LAB_CUBE_GATE`. 스킬 안 쓰는 니케에게 그 큐브를 권해 봐야 의미가 없다는 유저
// 지시라, 이름을 박아 두지 않고 로스터의 `armor_break`(build.py가 parsed_skills의 armor_break_damage·
// armor_break_enabled로 판정) · `burst`(3버 전원 — 역할군은 안 본다, 유저 정정 2026-09-03) ·
// `weapon`(SR·RL, `CHARGE_WEAPONS`)으로 가른다 —
// 새 니케가 와도 데이터만 맞으면 저절로 따라온다.
//
// **컨트롤** — 니케마다 켤 수 있는 조작(톡톡이·장전컨·탄충 취소·엄폐컨/홀드·후버·버스트 금지·재진입 대기·
// 파츠·모드 전환)을 축으로 놓고, 축 하나씩 값을 바꿔 보는 좌표 오름을 돈다. 한 바퀴에 니케마다 제일 좋은
// 한 가지만 적용하고 다시 재서, 더 안 오를 때까지(최대 4바퀴). 끝에 «아깝게 진 후보»를 지금 상태에 하나씩
// 얹어 보는 짝 확인을 한 번 더 한다 — 두 조작이 같이 있어야 사는 경우를 잡는다. 계산상 최고를 고를 뿐,
// 사람이 실제로 그 조작을 해낼 수 있는지는 판단하지 않는다(시트에 그렇게 적는다).
let labRunning = false;
let labWired = false;
let labAbort = false;
let labUndo = null;                // {deckIdx, cubes, control} — 적용 직전 모습
const LAB_DMG_CUBES = [
  "렐릭 베어 큐브", "택티컬 베어 큐브", "렐릭 부스트 큐브",
  "택티컬 어설트 큐브", "렐릭 어설트 큐브", "렐릭 디스트로이 큐브",
  "렐릭 피어싱 큐브", "렐릭 크래시 큐브", "렐릭 디바이드 큐브", "렐릭 비고르 큐브",
];
// 니케를 가려서만 후보인 큐브 — 값이 없으면(위 목록의 나머지처럼) 전원 후보다.
const LAB_CUBE_GATE = {
  "렐릭 크래시 큐브": (n) => !!byName.get(n)?.armor_break,
  "렐릭 디스트로이 큐브": (n) => byName.get(n)?.burst === "3",   // 3버 전원 — 화력형으로 좁히지 않는다(유저 정정)
  "렐릭 부스트 큐브": (n) => CHARGE_WEAPONS.has(byName.get(n)?.weapon),   // 차지 무기(SR·RL) 전원 — 예외 없음(유저 지시)
};
const labUnit = () => (modeNow() === "union" ? T("줄") : T("덱"));

function labBtns(running) {
  for (const b of [$("#deck-lab"), $("#lab-open")]) {
    if (!b) continue;
    b.disabled = running;
    b.dataset.state = running ? "loading" : "";
  }
}

const labSleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** 편성 여러 판을 한 묶음으로 — 판마다 큐브 배치·컨트롤을 따로 싣는다. 총딜 목록을 돌려준다. */
async function labEval(deckIdx, variants) {
  const d = deckAt(deckIdx);
  const names = d.names.filter(Boolean);
  const pl = battlePayload(d);
  delete pl.config.rng_mode; delete pl.config.seed;      // 기대값 한 판 — 순위에 운이 섞이면 안 된다
  const out = [];
  for (let at = 0; at < variants.length; at += 400) {
    if (labAbort) throw new Error(T("그만두었습니다."));
    const part = variants.slice(at, at + 400);
    const body = JSON.stringify({
      kind: "lab", heavy: "lab", mode: modeNow(), dororong: dororongOn(), lang: I18N.lang || "ko",
      decks: part.map(() => names), duration: durationNow(), code: enemyCode(),
      profile: mergedProfile(), enemy: pl.enemy, config: pl.config,
      codes: part.map(() => enemyCodeFor(d)),
      enemies: part.map(() => pl.enemy), configs: part.map(() => pl.config),
      controls: part.map((v) => { const c = v.control || ctrlPayload(d) || {}; const o = {}; for (const n of names) if (c[n] && Object.keys(c[n]).length) o[n] = c[n]; return Object.keys(o).length ? o : null; }),
      cubes: part.map((v) => { const o = {}; d.names.forEach((nm, i) => { if (!nm) return; const c = v.cubes ? v.cubes[i] : cubeOf(d, i); if (c) o[nm] = { name: c.name, level: c.level }; }); return Object.keys(o).length ? o : null; }),
      levels: part.map(() => deckLevel()),
      lean: true,
    });
    let j = null;
    for (let tries = 0; tries < 40; tries++) {
      const r = await fetch("/api/sim-heavy", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      j = await readJSON(r);
      if (j && j.retry) { await labSleep(900); continue; }
      break;
    }
    if (!j || j.error) throw new Error(j?.error || T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
    if (!Array.isArray(j.results) || j.results.length !== part.length) throw new Error(T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
    for (const res of j.results) out.push(Number(res.total) || 0);
  }
  return out;
}

/** 시트를 연다. 유니온에서 deckIdx가 없으면 먼저 줄(보스)을 고른다. */
function labOpen(deckIdx) {
  const dlg = $("#lab-sheet");
  if (!dlg) return;
  if (!labWired) { labWired = true; $("#lab-x")?.addEventListener("click", () => { if (dlg.open) dlg.close(); }); }
  if (!dlg.open) dlg.showModal();
  if (labRunning) return;
  const body = $("#lab-body");
  body.textContent = "";
  if (!activeRec()) { body.append(el("p", "fbc-msg warn", T("먼저 «내 계정»에서 계정을 받아 오세요 — 내 스펙으로 돌려야 답이 됩니다."))); return; }
  if (modeNow() === "union" && deckIdx == null) {
    body.append(el("p", "share-pick-note", T("어느 줄을 볼까요? 고른 줄 하나에서 돌립니다.")));
    // 줄 고르개 — **낮고 넓은 카드 석 장**이다. 보스 그림은 카드 머리의 고정 높이 띠로만
    // 쓴다(원본이 500px대라 크기를 안 잡으면 카드를 뚫고 나와 옆 카드까지 덮는다 — 유저 지적
    // 2026-09-04). 보스를 아직 안 고른 줄은 그림 자리를 비우고 흐리게 둔다.
    const list = el("div", "lab-rows");
    for (let i = 0; i < UNION_DECKS; i++) {
      const d = uDeck(i);
      const code = uWeak(d);
      const bz = code ? bossOf(code) : null;
      const n = d.names.filter(Boolean).length;
      const btn = el("button", "lab-row-pick" + (bz ? "" : " empty"));
      btn.type = "button";
      const art = el("span", "lab-row-art");
      if (bz?.art) {
        const im = el("img");
        im.src = `image/boss/${bz.art}.webp`;
        im.alt = "";
        im.loading = "lazy";
        im.onerror = () => im.remove();
        art.append(im);
      }
      btn.append(art);
      const txt = el("span", "lab-row-txt");
      txt.append(el("b", null, bz ? bz.name : T("보스 없음")));
      txt.append(el("span", "lab-row-sub", T("{v}번 줄 · {n}명", { v: i + 1, n })));
      btn.append(txt);
      // 보스가 없거나 두 명이 안 되면 잴 것이 없다 — 왜 못 누르는지 손대면 알 수 있게 적는다.
      btn.disabled = !bz || n < 2;
      if (btn.disabled) btn.title = !bz ? T("보스를 먼저 고르세요") : T("편성에 두 명 이상 있어야 돌릴 수 있습니다.");
      btn.onclick = () => labOpen(i);
      list.append(btn);
    }
    body.append(list);
    return;
  }
  const d = deckAt(deckIdx);
  if (d.names.filter(Boolean).length < 2) { body.append(el("p", "fbc-msg warn", T("편성에 두 명 이상 있어야 돌릴 수 있습니다."))); return; }
  if (modeNow() === "union" ? !uWeak(d) : !enemyCode()) { body.append(el("p", "fbc-msg warn", T("보스를 먼저 고르세요 — 어느 보스에 맞출지 알아야 잴 수 있습니다."))); return; }
  body.append(el("p", "share-pick-note", T("{v}번 {unit} · 내 계정 스펙으로, 지금 편성과 레이드 설정은 그대로 두고 갈아 끼울 수 있는 것만 최선으로 고릅니다(평균 판).", { v: deckIdx + 1, unit: labUnit() })));
  body.append(labCard("cube", deckIdx));
  body.append(labCard("ctrl", deckIdx));
  body.append(el("p", "lab-note", T("실험실입니다 — 계산상 가장 높은 것을 고를 뿐, 그 조작을 실제로 해낼 수 있는지는 따지지 않습니다. 적용한 뒤 «되돌리기»로 원래대로 돌릴 수 있습니다.")));
}

function labCard(kind, deckIdx) {
  const card = el("div", "lab-card");
  card.dataset.kind = kind;
  const h = el("h3");
  h.append(el("span", null, kind === "cube" ? T("큐브 최적화") : T("컨트롤 자동 탐색")));
  h.append(el("i", "lab-tag", T("실험실")));
  card.append(h);
  card.append(el("p", null, kind === "cube"
    ? T("내가 가진 큐브(보유 레벨) 중 딜에 닿는 것만 골라 자리마다 넣어 봅니다 — 같은 큐브를 여러 명이 껴도 됩니다. 자리별로 제일 오른 것을 같이 얹어 실제로 돌려 확인하기를 두어 바퀴 — 60~100판입니다.")
    : T("니케마다 켤 수 있는 조작(톡톡이·장전컨·탄충 취소·엄폐컨/홀드·후버·버스트 금지 등)을 하나씩 바꿔 보며 총딜이 더 안 오를 때까지 갑니다 — 100~150판입니다. 이미 손으로 켜 둔 것은 출발점으로 삼습니다.")));
  // 딜에 안 닿는 큐브가 «이득»으로 뜨는 일이 실제로 있었다(마스트 : 로망틱 메이드·신데렐라를
  // 렐릭 베어 15 → 렐릭 비고르 13으로 바꾸라며 +1.78%). 재장전 속도를 뺀 부작용이다 —
  // 탄창 비는 시각이 밀려 그 재장전이 풀버스트 중에 걸리면 실누적에서 뒤쪽 버스트가 1초쯤
  // 당겨진다(남들 +0.5~2%, 본인 −6~13%). 고정 게이지에서는 같은 교체가 −0.7%로 부호가
  // 뒤집힌다. 즉 정렬 우연이라 사람에게 말해 줘야 한다(코어 세션 재현 2026-09-05).
  if (kind === "cube") {
    card.append(el("p", "prose-sm lab-warn",
      T("딜과 상관없는 큐브(체력·방어·피해 감소·회복)가 «이득»으로 뜰 때가 있습니다. 재장전 속도 큐브를 빼면 탄창이 비는 시각이 밀리고, 그 재장전이 게이지가 차는 구간이 아니라 풀버스트 중에 걸리면 다음 버스트가 1초쯤 일찍 돌아 총딜이 1~2% 오르기도 합니다. 그 큐브 덕이 아니라 타이밍이 우연히 맞아떨어진 것이라, 게이지 방식이나 손속도를 조금만 바꿔도 뒤집히고 실제 전투에서는 버스트 누르는 순간의 차이에 묻힙니다. 이런 추천은 그냥 넘기세요.")));
  }
  const out = el("div", "lab-out");
  card.append(out);
  const acts = el("div", "lab-acts");
  const go = mkBtn(T("돌리기"), "btn-primary btn-sm", () => (kind === "cube" ? labCubeRun(deckIdx, card) : labCtrlRun(deckIdx, card)));
  go.dataset.role = "go";
  acts.append(go);
  card.append(acts);
  return card;
}

function labMsg(card, text, kind) {
  const out = card.querySelector(".lab-out");
  out.textContent = "";
  out.append(el("p", "fbc-msg" + (kind === "err" ? " warn" : ""), text));
}

/** 적용 뒤 «되돌리기» — 적용 직전의 큐브·컨트롤을 그대로 돌려놓는다. */
function labRestore() {
  const u = labUndo;
  if (!u) return;
  const d = deckAt(u.deckIdx);
  d.cubes = u.cubes.map((c) => (c ? { ...c } : null));
  d.control = JSON.parse(JSON.stringify(u.control));
  labUndo = null;
  saveAll(); renderAll();
  calcDecks([u.deckIdx], true, "row");
}

function labSnap(deckIdx) {
  const d = deckAt(deckIdx);
  labUndo = { deckIdx, cubes: Array.from({ length: SLOTS }, (_, i) => (d.cubes?.[i] ? { ...d.cubes[i] } : null)),
              control: JSON.parse(JSON.stringify(d.control || {})) };
}

// ── 큐브 최적화 ──
async function labCubeRun(deckIdx, card) {
  if (labRunning) return;
  labRunning = true; labAbort = false; labBtns(true);
  const d = deckAt(deckIdx);
  const slots = d.names.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
  const owned = activeRec()?.fetched?._account?.cubes || {};
  const known = new Set(cubeChoices().names);
  // 후보 — 가진 큐브 중 딜에 닿는 종류만, 레벨은 **보유 레벨**. 보유 정보가 없으면 딜 큐브 전부를 기본 레벨로(그렇게 적는다).
  // 개수 제한은 없다 — 같은 큐브를 여러 명이 껴도 된다. 레벨만 가진 것에 맞춘다(유저 지시 2026-09-03).
  const haveInfo = Object.keys(owned).length > 0;
  const cands = LAB_DMG_CUBES.filter((c) => known.has(c) && (!haveInfo || Number(owned[c]) > 0))
    .map((c) => ({ name: c, level: haveInfo ? Number(owned[c]) : CUBE_DEFAULT.level }));
  // 지금 끼운 큐브는 «그대로 두기»로 언제나 후보다. 미장착(레벨 0)은 «없음»이다.
  const cur = slots.map((i) => { const c = cubeOf(d, i); return c && Number(c.level) > 0 ? c : null; });
  for (const c of cur) if (c && !cands.some((x) => x.name === c.name)) cands.push({ name: c.name, level: c.level });
  // «없음»을 실어 보내는 법 — 칸을 비우면 서버가 프로필 층의 큐브를 대신 끼운다(cubeOf 주석). 레벨 0이 «없음»이다.
  const none = (k) => ({ name: cur[k]?.name || CUBE_DEFAULT.name, level: 0 });
  let sims = 0;
  try {
    if (!cands.length) throw new Error(T("돌릴 큐브가 없습니다 — 계정에 딜에 닿는 큐브가 없습니다."));
    labMsg(card, T("기준 편성을 재는 중…"));
    const assign = cur.map((c) => (c ? cands.findIndex((x) => x.name === c.name) : -1));
    const build = (asg) => d.names.map((n, i) => { const k = slots.indexOf(i); if (k < 0 || !n) return null; const c = asg[k] >= 0 ? cands[asg[k]] : null; return c ? { name: c.name, level: c.level } : none(k); });
    let base = (await labEval(deckIdx, [{ cubes: build(assign) }]))[0];
    sims += 1;
    const start = base;
    // «지금 배치»가 이겨야 할 기준이다 — 못 넘으면 «지금이 가장 높다»로 끝난다.
    // 자리마다 후보를 다 넣어 보고 → 자리별로 제일 오른 것을 한꺼번에 얹어 참값으로 확인(서로 방해하면 제일 큰
    // 하나만) → 더 안 오를 때까지, 세 바퀴 안에서. 자리끼리는 버프로만 얽히니 이 정도면 거의 늘 한 바퀴에 끝난다.
    let best = { asg: [...assign], total: base };
    for (let round = 0; round < 3; round++) {
      labMsg(card, T("{r}바퀴째 — 자리마다 큐브를 넣어 보는 중… (지금까지 {k}판)", { r: round + 1, k: sims }));
      const trials = [];
      for (let si = 0; si < slots.length; si++) {
        const nm = d.names[slots[si]];
        for (let ci = 0; ci < cands.length; ci++) {
          if (ci === assign[si]) continue;
          const gate = LAB_CUBE_GATE[cands[ci].name];
          if (gate && !gate(nm)) continue;               // 이 니케에게는 의미 없는 큐브 — 시험하지 않는다
          const asg = [...assign]; asg[si] = ci;
          trials.push({ si, ci, asg });
        }
      }
      if (!trials.length) break;
      const totals = await labEval(deckIdx, trials.map((t) => ({ cubes: build(t.asg) })));
      sims += trials.length;
      // 자리별 최선 — 기준보다 오른 것만.
      const pick = slots.map(() => null);
      trials.forEach((t, k) => { const g = totals[k] - base; if (g > 0 && (!pick[t.si] || g > pick[t.si].g)) pick[t.si] = { ci: t.ci, g }; });
      if (!pick.some(Boolean)) break;
      let top = -1;
      pick.forEach((p, si) => { if (p && (top < 0 || p.g > pick[top].g)) top = si; });
      const single = [...assign]; single[top] = pick[top].ci;
      let next = { asg: single, total: base + pick[top].g };   // 이미 잰 값
      if (pick.filter(Boolean).length > 1) {
        const merged = assign.map((ci, si) => (pick[si] ? pick[si].ci : ci));
        const tm = (await labEval(deckIdx, [{ cubes: build(merged) }]))[0];
        sims += 1;
        if (tm >= next.total) next = { asg: merged, total: tm };
      }
      if (next.total <= best.total) break;
      best = next;
      assign.splice(0, assign.length, ...next.asg);
      base = next.total;
    }
    labRenderCube(card, deckIdx, { slots, cands, start, best, cur, sims, haveInfo, none });
  } catch (e) {
    labMsg(card, String(e.message || e), "err");
  } finally {
    labRunning = false; labBtns(false);
  }
}

function labRenderCube(card, deckIdx, { slots, cands, start, best, cur, sims, haveInfo, none }) {
  const d = deckAt(deckIdx);
  const out = card.querySelector(".lab-out");
  out.textContent = "";
  const gainPct = start > 0 ? ((best.total / start - 1) * 100) : 0;
  const changed = slots.filter((i, k) => { const c = best.asg[k] >= 0 ? cands[best.asg[k]] : null; const o = cur[k]; return (c?.name || "") !== (o?.name || "") || (c?.level || 0) !== (o?.level || 0); });
  out.append(el("p", "lab-note", (haveInfo ? T("내 계정의 보유 큐브 {n}종으로 {k}판 돌렸습니다.", { n: cands.length, k: sims })
    : T("계정에 큐브 보유 정보가 없어 딜 큐브 전부를 {lv}레벨로 보고 {k}판 돌렸습니다.", { lv: CUBE_DEFAULT.level, k: sims }))));
  if (!changed.length) { out.append(el("p", "fbc-best", T("지금 배치가 가장 높습니다 — 바꿀 이유가 없습니다."))); return; }
  slots.forEach((i, k) => {
    const n = d.names[i];
    const c = best.asg[k] >= 0 ? cands[best.asg[k]] : null;
    const o = cur[k];
    const row = el("div", "lab-row");
    const who = el("span", "lab-who");
    who.append(recoFace(n)); who.append(el("b", null, T(n)));
    row.append(who);
    const what = el("span", "lab-what");
    const same = (c?.name || "") === (o?.name || "") && (c?.level || 0) === (o?.level || 0);
    if (same) what.append(el("span", null, o ? `${T(o.name)} Lv${o.level}` : T("미장착")));
    else { what.append(el("span", null, (o ? `${T(o.name)} Lv${o.level}` : T("미장착")) + " → ")); what.append(el("b", null, c ? `${T(c.name)} Lv${c.level}` : T("미장착"))); }
    row.append(what);
    out.append(row);
  });
  const sum = el("p", "lab-sum");
  // 여기 온 이상 늘 올랐다 — «지금»이 기준이라서.
  sum.append(el("span", null, `${I18N.dmg(start)} → `));
  sum.append(el("b", null, `${I18N.dmg(best.total)} (+${gainPct.toFixed(2)}%)`));
  out.append(sum);
  const acts = el("div", "lab-acts");
  acts.append(mkBtn(T("적용"), "btn-primary btn-sm", () => {
    labSnap(deckIdx);
    if (modeNow() === "union") uSnap(T("큐브 최적화"));
    // «없음»은 미장착(레벨 0)으로 적는다 — null이면 칸 기본값(렐릭 베어 Lv15)이 도로 들어간다.
    slots.forEach((i, k) => { const c = best.asg[k] >= 0 ? cands[best.asg[k]] : null; d.cubes ||= Array(SLOTS).fill(null); d.cubes[i] = c ? { name: c.name, level: c.level } : none(k); });
    saveAll(); renderAll();
    calcDecks([deckIdx], true, "row");
    acts.textContent = "";
    acts.append(el("span", "lab-note", T("적용했습니다.")));
    acts.append(mkBtn(T("되돌리기"), "btn-ghost btn-sm", () => { labRestore(); labOpen(deckIdx); }));
  }));
  out.append(acts);
}

// ── 컨트롤 자동 탐색 ──
/** 니케 하나의 조작 축 목록 — 축마다 {key, values:[{id,label,patch(ctrl)->ctrl}]} */
function labCtrlAxes(d, name) {
  const rec = byName.get(name);
  const charge = CHARGE_WEAPONS.has(rec?.weapon);
  const forced = (rec?.forced_control || [])
    .filter((r) => !r.with.length || (r.all ? r.with.every((n) => d.names.includes(n)) : r.with.some((n) => d.names.includes(n))));
  const fk = (key) => forced.find((r) => r.key === key);
  const axes = [];
  const drop = (c, k) => { const o = { ...c }; delete o[k]; return o; };
  // 자세 — 엄폐컨과 홀드는 둘 다 못 켠다(차지형만 홀드).
  const stance = [
    { id: "auto", label: T("자동"), patch: (c) => { let o = drop(c, "cover"); o = drop(o, "hold"); return o; } },
    { id: "none", label: T("엄폐컨·홀드 없음"), patch: (c) => { let o = { ...c }; o.cover = fk("cover") ? false : undefined; o.hold = (charge && fk("hold")) ? false : undefined; if (o.cover === undefined) delete o.cover; if (o.hold === undefined) delete o.hold; return o; } },
    { id: "cover", label: T("버스트 엄폐컨"), patch: (c) => { let o = { ...c }; if (fk("cover")) delete o.cover; else o.cover = { policy: "own_full_burst" }; if (charge) { if (fk("hold")) o.hold = false; else delete o.hold; } return o; } },
  ];
  if (charge) stance.push({ id: "hold", label: T("홀드"), patch: (c) => { let o = { ...c }; if (fk("hold")) delete o.hold; else o.hold = { policy: "own_full_burst", lead: 0.5 }; if (fk("cover")) o.cover = false; else delete o.cover; return o; } });
  axes.push({ key: "stance", values: stance });
  if (charge) {
    const tap = [
      { id: "auto", label: T("자동"), patch: (c) => drop(c, "tap_fire") },
      { id: "on", label: T("톡톡이"), patch: (c) => ({ ...c, tap_fire: { rate: 3.6, release: 0.03 } }) },
    ];
    if (fk("tap_fire")) tap.push({ id: "off", label: T("톡톡이 끔"), patch: (c) => ({ ...c, tap_fire: false }) });
    axes.push({ key: "tap", values: tap });
  }
  // 장전 — 장전컨(정책 둘)과 탄충 취소가 한 열쇠를 나눠 쓴다.
  const cancelAuto = !!(fk("reload")?.value?.cancel_on_full);
  const reload = [
    { id: "auto", label: T("자동"), patch: (c) => drop(c, "reload") },
    { id: "cancel", label: T("탄충 취소"), patch: (c) => (cancelAuto ? drop(c, "reload") : { ...c, reload: { cancel_on_full: true } }) },
    { id: "p1", label: T("장전컨 · 풀버스트 종료 전"), patch: (c) => ({ ...c, reload: { policy: "before_fb_end", ...(cancelAuto ? { cancel_on_full: false } : {}) } }) },
    { id: "p2", label: T("장전컨 · 풀버스트 안으로"), patch: (c) => ({ ...c, reload: { policy: "into_fb", ...(cancelAuto ? { cancel_on_full: false } : {}) } }) },
    { id: "p1c", label: T("장전컨(종료 전) + 탄충 취소"), patch: (c) => ({ ...c, reload: { policy: "before_fb_end", cancel_on_full: true } }) },
    { id: "p2c", label: T("장전컨(안으로) + 탄충 취소"), patch: (c) => ({ ...c, reload: { policy: "into_fb", cancel_on_full: true } }) },
  ];
  if (cancelAuto) reload.push({ id: "nocancel", label: T("탄충 취소 끔"), patch: (c) => ({ ...c, reload: false }) });
  axes.push({ key: "reload", values: reload });
  // 버스트 운용 — 손으로 주기를 걸어 둔 니케는 건드리지 않는다.
  const bp = d.control?.[name]?.burst_pattern;
  if (bp === undefined || bp === DEFER) {
    axes.push({ key: "burst", values: [
      { id: "auto", label: T("자동"), patch: (c) => { let o = drop(c, "burst_pattern"); o = drop(o, "no_burst"); return o; } },
      { id: "defer", label: T("후버"), patch: (c) => ({ ...drop(c, "no_burst"), burst_pattern: DEFER }) },
      { id: "ban", label: T("버스트 금지"), patch: (c) => ({ ...drop(c, "burst_pattern"), no_burst: true }) },
    ] });
  }
  if (rec?.reenter && d.names.some((n) => n && n !== name && (byName.get(n)?.burst === rec.burst || byName.get(n)?.burst === "A" || rec.burst === "A"))) {
    axes.push({ key: "reenter", values: [
      { id: "auto", label: T("재진입 대기"), patch: (c) => drop(c, "reenter_wait") },
      { id: "off", label: T("재진입 대기 끔"), patch: (c) => ({ ...c, reenter_wait: false }) },
    ] });
  }
  if ((battleFor(d).phases || []).some((p) => p.kind === "parts")) {
    axes.push({ key: "parts", values: [
      { id: "auto", label: T("파츠 노림"), patch: (c) => drop(c, "part_aim") },
      { id: "no", label: T("파츠 안 노림"), patch: (c) => ({ ...c, part_aim: 0 }) },
    ] });
  }
  if (rec?.mode_swap) {
    axes.push({ key: "mode", values: [
      { id: "auto", label: T("모드 전환 안 함"), patch: (c) => drop(c, "weapon_mode_swap") },
      { id: "start", label: T("변환 모드 · 전투 시작하자마자"), patch: (c) => ({ ...c, weapon_mode_swap: { policy: "battle_start" } }) },
    ] });
  }
  return axes;
}

/** 지금 컨트롤이 어느 값에 해당하나 — 값의 patch를 지금 상태에 적용해 같은 모양이면 그것이다. */
function labCtrlCurrent(axis, ctrl) {
  const key = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort()));
  const now = key(ctrl);
  for (const v of axis.values) if (key(v.patch(ctrl || {})) === now) return v.id;
  return null;                                           // 손으로 만든 조합 — 축 밖이다
}

// 컨트롤 하나가 «올랐다»로 쳐지는 최소 이득. 0.05%였을 때 나유타에게 +0.09%짜리 장전컨을 권했다
// (유저 지적 2026-09-03) — 그 정도는 손이 가는 값어치가 없다. 진짜 조작은 보통 1%를 훌쩍 넘는다.
const LAB_MIN_GAIN = 0.002;

async function labCtrlRun(deckIdx, card) {
  if (labRunning) return;
  labRunning = true; labAbort = false; labBtns(true);
  const d = deckAt(deckIdx);
  const names = d.names.filter(Boolean);
  const start = JSON.parse(JSON.stringify(d.control || {}));
  let curMap = JSON.parse(JSON.stringify(start));
  const axesOf = Object.fromEntries(names.map((n) => [n, labCtrlAxes(d, n)]));
  let sims = 0;
  const changes = [];                                    // 적용한 변화 [{name, key, from, to}]
  try {
    labMsg(card, T("기준 편성을 재는 중…"));
    let base = (await labEval(deckIdx, [{ control: curMap }]))[0];
    sims += 1;
    const startTotal = base;
    const leftovers = [];                                // 이겼지만 안 쓴 후보 — 끝에 짝으로 다시 본다
    for (let round = 0; round < 4; round++) {
      labMsg(card, T("{r}바퀴째 — 조작을 하나씩 바꿔 보는 중… (지금까지 {k}판)", { r: round + 1, k: sims }));
      const trials = [];
      for (const n of names) {
        const c = curMap[n] || {};
        for (const axis of axesOf[n]) {
          const curId = labCtrlCurrent(axis, c);
          for (const v of axis.values) {
            if (v.id === curId) continue;
            const patched = v.patch(c);
            const map = { ...curMap };
            if (Object.keys(patched).length) map[n] = patched; else delete map[n];
            trials.push({ n, axis, v, curId, map });
          }
        }
      }
      if (!trials.length) break;
      const totals = await labEval(deckIdx, trials.map((t) => ({ control: t.map })));
      sims += trials.length;
      trials.forEach((t, k) => { t.total = totals[k]; });
      // 니케마다 제일 좋은 하나 — 기준선보다 LAB_MIN_GAIN 넘게 올라야 «올랐다»로 친다.
      const picks = [];
      for (const n of names) {
        const mine = trials.filter((t) => t.n === n && t.total > base * (1 + LAB_MIN_GAIN)).sort((a, b) => b.total - a.total);
        if (mine.length) { picks.push(mine[0]); for (const t of mine.slice(1, 3)) leftovers.push(t); }
      }
      if (!picks.length) break;
      // 같이 적용해 참값으로 확인 — 서로 방해하면 제일 큰 하나만 적용한다.
      const merged = { ...curMap };
      for (const t of picks) { if (Object.keys(t.map[t.n] || {}).length) merged[t.n] = t.map[t.n]; else delete merged[t.n]; }
      const tm = (await labEval(deckIdx, [{ control: merged }]))[0];
      sims += 1;
      const top = picks.slice().sort((a, b) => b.total - a.total)[0];
      if (tm >= top.total) {
        for (const t of picks) changes.push({ name: t.n, key: t.axis.key, from: t.curId, to: t.v.id, label: t.v.label, gain: t.total - base });
        curMap = merged; base = tm;
      } else {
        changes.push({ name: top.n, key: top.axis.key, from: top.curId, to: top.v.id, label: top.v.label, gain: top.total - base });
        curMap = top.map; base = top.total;
      }
    }
    // 짝 확인 — 아깝게 진 후보를 지금 상태에 하나씩 얹어 본다.
    if (leftovers.length) {
      labMsg(card, T("마무리 — 아깝게 진 조합 {n}가지를 다시 보는 중… (지금까지 {k}판)", { n: leftovers.length, k: sims }));
      const trials = leftovers.map((t) => { const c = curMap[t.n] || {}; const patched = t.v.patch(c); const map = { ...curMap }; if (Object.keys(patched).length) map[t.n] = patched; else delete map[t.n]; return { ...t, map }; });
      const totals = await labEval(deckIdx, trials.map((t) => ({ control: t.map })));
      sims += trials.length;
      let bi = -1;
      totals.forEach((v, k) => { if (v > base * (1 + LAB_MIN_GAIN) && (bi < 0 || v > totals[bi])) bi = k; });
      if (bi >= 0) { const t = trials[bi]; changes.push({ name: t.n, key: t.axis.key, from: labCtrlCurrent(t.axis, curMap[t.n] || {}), to: t.v.id, label: t.v.label, gain: totals[bi] - base }); curMap = t.map; base = totals[bi]; }
    }
    labRenderCtrl(card, deckIdx, { startTotal, total: base, curMap, changes, sims, axesOf });
  } catch (e) {
    labMsg(card, String(e.message || e), "err");
  } finally {
    labRunning = false; labBtns(false);
  }
}

function labRenderCtrl(card, deckIdx, { startTotal, total, curMap, changes, sims, axesOf }) {
  const d = deckAt(deckIdx);
  const out = card.querySelector(".lab-out");
  out.textContent = "";
  out.append(el("p", "lab-note", T("{k}판 돌렸습니다.", { k: sims })));
  if (!changes.length) { out.append(el("p", "fbc-best", T("지금 설정이 가장 높습니다 — 바꿀 이유가 없습니다."))); return; }
  // 니케별 최종 상태만 보여 준다 — 중간에 오간 것은 사람이 볼 것이 아니다.
  const byName2 = new Map();
  for (const ch of changes) byName2.set(ch.name, true);
  for (const n of byName2.keys()) {
    const row = el("div", "lab-row");
    const who = el("span", "lab-who");
    who.append(recoFace(n)); who.append(el("b", null, T(n)));
    row.append(who);
    const what = el("span", "lab-what");
    const labels = [];
    for (const axis of axesOf[n]) {
      const id = labCtrlCurrent(axis, curMap[n] || {});
      const v = axis.values.find((x) => x.id === id);
      const was = labCtrlCurrent(axis, (d.control || {})[n] || {});
      if (v && id !== was) labels.push(v.label);
    }
    what.append(el("b", null, labels.join(" · ") || T("자동")));
    // 이 니케의 변화가 얹은 몫 — 하나씩 잰 이득의 합이라 근사다. 작은 것은 작다고 보여야 한다.
    const mine = changes.filter((c) => c.name === n).reduce((a, c) => a + (c.gain || 0), 0);
    if (startTotal > 0) what.append(el("span", "lab-gain", ` +${(mine / startTotal * 100).toFixed(2)}%`));
    row.append(what);
    out.append(row);
  }
  const gainPct = startTotal > 0 ? ((total / startTotal - 1) * 100) : 0;
  const sum = el("p", "lab-sum");
  sum.append(el("span", null, `${I18N.dmg(startTotal)} → `));
  sum.append(el("b", null, `${I18N.dmg(total)} (+${gainPct.toFixed(2)}%)`));
  out.append(sum);
  const acts = el("div", "lab-acts");
  acts.append(mkBtn(T("적용"), "btn-primary btn-sm", () => {
    labSnap(deckIdx);
    if (modeNow() === "union") uSnap(T("컨트롤 자동 탐색"));
    d.control = JSON.parse(JSON.stringify(curMap));
    saveAll(); renderAll(); buildControl();
    calcDecks([deckIdx], true, "row");
    acts.textContent = "";
    acts.append(el("span", "lab-note", T("적용했습니다.")));
    acts.append(mkBtn(T("되돌리기"), "btn-ghost btn-sm", () => { labRestore(); labOpen(deckIdx); }));
  }));
  out.append(acts);
}

// ── 육성 효율표 — «한정된 재화를 누구에게 넣을까» ─────────────────────────────
// 켜 둔 판 전체(솔로 5덱 / 유니온 3줄, 다 찬 덱만)에서 목표를 고르면, 그 목표보다 낮은 니케마다
// «지금 → 목표로 올리면 그 덱 +% · 판 합계 +%»를 실제로 돌려 순위로 보여 준다(유저 확정 2026-09-02).
// 니케별로 넣는 것만 축이다 — 동기화 레벨·연구소·큐브처럼 전체에 걸리는 건 뺐다.
//   스킬 1·2·버스트(목표 레벨) · 돌파/코어(목표 단계) · 장비(오버로드 강화 목표) ·
//   오버로드 옵션 수치(+n%, 상한에서 자름) · 소장품(목표 등급·레벨) · 애장품(목표 단계)
// 덱마다 «그 다섯 명만 담은 얇은 프로필»을 따로 실어(`profiles[i]`, 계약 §4) 한 니케의 육성만
// 바꾼다. `_meta`·`_account`(연구소·보유 큐브)를 그대로 복사해야 원래 덱 딜과 기준선이 같다
// (코어 세션 2026-09-02). 기준선도 같은 얇은 프로필로 같은 판에서 잰다.
const GROWTH_AXES = [
  ["skill1", T("스킬 1")], ["skill2", T("스킬 2")], ["burst", T("버스트 스킬")],
  ["core", T("한계돌파 · 코어")], ["equip", T("장비(오버로드 강화)")], ["ol", T("오버로드 옵션")],
  ["coll", T("소장품")], ["fav", T("애장품")],
];
const CORE_TARGETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];   // 1~3 돌파, 4~10 = 코어 +1~+7
const coreRank = (sp) => {
  const bt = Math.max(0, Math.min(3, Number(sp?.breakthrough) || 0));
  return bt < 3 ? bt : 3 + Math.max(0, Math.min(7, Number(sp?.core_enhancement) || 0));
};
const coreLabel = (rank) => (rank <= 3 ? T("돌파 {n}", { n: rank }) : T("코어 +{n}", { n: rank - 3 }));
const isOlEquip = (e) => !!e && (e.tier == null || e.tier === "기업") && e.tier !== "없음";
const equipLabel = (e) => (!e || e.tier === "없음") ? T("없음")
  : isOlEquip(e) ? T("OL{n}", { n: Number(e.level) || 0 })
  : e.tier === "T9" && e.corp ? T("T9기업{n}", { n: Number(e.level) || 0 }) : String(e.tier);
// how — "to"는 «목표까지», "by"는 «딱 n개 올리기»(유저 지시 — 둘 다 있어야 한다). 오버로드 수치 축은 늘 +n%.
let growthState = { axis: "skill1", target: 10, how: "to", steps: 1, ol: "atk_pct", amount: 10 };
/** 축의 상한(단계) — «+n»이 여기서 멈춘다. */
const growthMax = (axis) => (axis === "core" ? 10 : axis === "equip" ? 5 : axis === "coll" ? COLL_STAGES.length - 1
  : axis === "fav" ? 3 : 10);
let growthRunning = false;
let growthWired = false;

function growthOpen() {
  const dlg = $("#growth-sheet");
  if (!dlg) return;
  if (!growthWired) {
    growthWired = true;
    $("#growth-x")?.addEventListener("click", () => { if (dlg.open) dlg.close(); });
  }
  growthForm();
  if (!dlg.open) dlg.showModal();
}

/** 축마다 고를 수 있는 목표 — [값, 보이는 글자]. */
function growthTargets(axis) {
  if (axis === "skill1" || axis === "skill2" || axis === "burst") return [8, 9, 10].map((v) => [v, T("{n}까지", { n: v })]);
  if (axis === "core") return CORE_TARGETS.map((v) => [v, coreLabel(v)]);
  if (axis === "equip") return [0, 1, 2, 3, 4, 5].map((v) => [v, T("오버로드 강화 {n}까지", { n: v })]);
  if (axis === "coll") return COLL_STAGES.slice(1).map((s, i) => [i + 1, s]);
  if (axis === "fav") return [1, 2, 3].map((v) => [v, T("{n}단계까지", { n: v })]);
  return [];
}

function growthForm() {
  const form = $("#growth-form");
  if (!form) return;
  form.textContent = "";
  const row = el("div", "growth-row");
  row.append(el("span", "field-label", T("무엇을")));
  const axisSel = selectEl(GROWTH_AXES, growthState.axis, (v) => {
    growthState.axis = v;
    const t = growthTargets(v);
    growthState.target = t.length ? t[t.length - 1][0] : null;
    growthForm();
  });
  row.append(axisSel);
  if (growthState.axis === "ol") {
    row.append(selectEl(OL_OPTS, growthState.ol, (v) => { growthState.ol = v; }));
    const amt = el("input", "growth-amt");
    amt.type = "number"; amt.min = "0.5"; amt.max = "120"; amt.step = "0.5"; amt.inputmode = "decimal";
    amt.value = String(growthState.amount);
    amt.onchange = () => { growthState.amount = Math.max(0.5, Math.min(120, Number(amt.value) || 10)); amt.value = String(growthState.amount); };
    row.append(el("span", "field-label", "+"), amt, el("span", "field-label", "%"));
  } else {
    row.append(selectEl([["to", T("목표까지")], ["by", T("딱 몇 개 올리기")]], growthState.how,
      (v) => { growthState.how = v; growthForm(); }));
    if (growthState.how === "by") {
      const st = el("input", "growth-amt");
      st.type = "number"; st.min = "1"; st.max = "9"; st.step = "1"; st.inputmode = "numeric";
      st.value = String(growthState.steps);
      st.onchange = () => { growthState.steps = Math.max(1, Math.min(9, Math.round(Number(st.value) || 1))); st.value = String(growthState.steps); };
      row.append(el("span", "field-label", "+"), st, el("span", "field-label", T("단계")));
    } else {
      const t = growthTargets(growthState.axis);
      if (growthState.target == null || !t.some(([v]) => v === growthState.target)) growthState.target = t[t.length - 1][0];
      row.append(el("span", "field-label", T("목표")));
      row.append(selectEl(t, growthState.target, (v) => { growthState.target = Number(v); }));
    }
  }
  row.append(mkBtn(T("이 목표로 돌리기"), "btn-primary btn-sm", () => growthRun()));
  form.append(row);
  const note = el("p", "share-pick-note");
  note.textContent = T("지금 켜 둔 판의 다 찬 덱 전체에서, 목표보다 낮은 니케만 골라 «올리면 그 덱과 판 합계가 얼마나 오르나»를 내 계정 스펙으로 한 판씩 돌립니다(평균 판). 상한은 넘지 않습니다.");
  form.append(note);
}

/** 니케 하나의 육성을 목표까지 올린 사본. 못 올리면(이미 목표 이상·상한) null. */
function growthMod(sp, name) {
  const { axis, how, steps } = growthState;
  const cp = JSON.parse(JSON.stringify(sp));
  // «목표까지»면 고른 목표, «딱 n개»면 지금 값 + n(상한에서 멈춤).
  const goal = (cur) => (how === "by" ? Math.min(growthMax(axis), cur + steps) : growthState.target);
  if (axis === "skill1" || axis === "skill2" || axis === "burst") {
    const k = axis === "skill1" ? "1" : axis === "skill2" ? "2" : "3";
    const cur = Number(sp.skill_levels?.[k]) || 1;
    const target = goal(cur);
    if (cur >= target) return null;
    cp.skill_levels = { ...(sp.skill_levels || {}), [k]: target };
    return { cp, cur: T("{k} Lv{n}", { k: GROWTH_AXES.find(([a]) => a === axis)[1], n: cur }), to: T("Lv{n}", { n: target }) };
  }
  if (axis === "core") {
    const cur = coreRank(sp);
    const target = goal(cur);
    if (cur >= target) return null;
    cp.breakthrough = Math.min(3, target);
    cp.core_enhancement = Math.max(0, target - 3);
    return { cp, cur: coreLabel(cur), to: coreLabel(target) };
  }
  if (axis === "equip") {
    const eq = sp.equipment || {};
    // 부위마다 «지금 단계»가 다르다 — 오버로드 아니면 0단계로 친다(T9→OL 0이 첫 걸음).
    const lv = (e) => (isOlEquip(e) ? (Number(e.level) || 0) : -1);
    const parts = PARTS.map((p) => ({ p, e: eq[p], cur: lv(eq[p]) }))
      .map((x) => ({ ...x, to: how === "by" ? Math.min(5, Math.max(0, x.cur) + steps) : growthState.target }))
      .filter((x) => x.cur < x.to);
    if (!parts.length) return null;
    cp.equipment = { ...eq };
    // T9 기업 → 오버로드로 바꿀 때 tier·corp를 **명시적으로 null**로 둔다 — 남기면 T9 경로로 계산된다(코어 세션).
    for (const x of parts) cp.equipment[x.p] = { tier: null, corp: null, level: x.to };
    const toLabel = how === "by" ? T("+{n}단계", { n: steps }) : T("OL{n} ×4", { n: growthState.target });
    return { cp, cur: PARTS.map((p) => equipLabel(eq[p])).join("·"), to: toLabel };
  }
  if (axis === "ol") {
    const key = growthState.ol;
    const lineMax = pct(key, 15);
    if (!lineMax) return null;
    const ol = normalizeOl(sp._ol);
    const lines = ol.flat().filter((l) => l?.o === key).length;
    const es = { ...(sp.equip_skills || {}) };
    if (PER_LINE.has(key)) {
      if (lines >= 4) return null;                        // 부위마다 한 줄, 네 부위 — 더 넣을 자리가 없다
      const curList = Array.isArray(es[key]) ? es[key] : [];
      const add = +Math.min(growthState.amount, lineMax).toFixed(4);
      es[key] = [...curList, add].sort((a, b) => b - a);
      cp.equip_skills = es;
      const sum = curList.reduce((a, b) => a + b, 0);
      return { cp, cur: `${sum.toFixed(1)}%`, to: `${(sum + add).toFixed(1)}%` };
    }
    const cur = Number(es[key]) || 0;
    const cap = +(lineMax * 4).toFixed(4);
    const next = Math.min(cap, cur + growthState.amount);
    if (next - cur < 0.05) return null;
    es[key] = +next.toFixed(4);
    cp.equip_skills = es;
    return { cp, cur: `${cur.toFixed(1)}%`, to: `${next.toFixed(1)}%${next < cur + growthState.amount ? T("(상한)") : ""}` };
  }
  if (axis === "coll") {
    const cur = Math.max(0, COLL_STAGES.indexOf(sp.collection_stage || "없음"));
    const target = goal(cur);
    if (cur >= target) return null;
    cp.collection_stage = COLL_STAGES[target];
    return { cp, cur: COLL_STAGES[cur] === "없음" ? T("없음") : COLL_STAGES[cur], to: COLL_STAGES[target] };
  }
  if (axis === "fav") {
    if (sp.favorite_stage === undefined) return null;     // 애장품이 없는 니케
    const cur = Number(sp.favorite_stage) || 0;
    const target = goal(cur);
    if (cur >= target) return null;
    cp.favorite_stage = target;
    return { cp, cur: T("{n}단계", { n: cur }), to: T("{n}단계", { n: target }) };
  }
  return null;
}

function growthMsg(text, kind) {
  const out = $("#growth-out");
  if (!out) return;
  out.textContent = "";
  out.append(el("p", "fbc-msg" + (kind === "err" ? " warn" : ""), text));
}

async function growthRun() {
  if (growthRunning) return;
  const prof = mergedProfile();
  if (!prof) { growthMsg(T("먼저 «내 계정»에서 계정을 받아 오세요 — 내 스펙으로 돌려야 답이 됩니다."), "err"); return; }
  const idxs = [];
  for (let i = 0; i < deckCountNow(); i++) if (isFull(deckAt(i))) idxs.push(i);
  if (!idxs.length) { growthMsg(T("다 찬 덱이 없습니다 — 5명을 채운 덱만 봅니다."), "err"); return; }
  // 얇은 프로필 — 그 덱 다섯 명 + _meta·_account
  const thin = (names, patch) => {
    const chars = {};
    for (const n of names) {
      const sp = charSpec(n);
      if (sp) chars[n] = patch && patch.name === n ? patch.cp : sp;
    }
    return { ...(prof._meta ? { _meta: prof._meta } : {}), ...(prof._account ? { _account: prof._account } : {}), chars };
  };
  const jobs = [];   // {deckIdx, name?, cur?, to?}
  const decks = [], profiles = [], codes = [], enemies = [], configs = [], controls = [], cubes = [], levels = [];
  const push = (i, patch, meta) => {
    const d = deckAt(i);
    const pl = battlePayload(d);
    delete pl.config.rng_mode; delete pl.config.seed;   // 순위는 언제나 기대값
    decks.push([...d.names]); profiles.push(thin(d.names, patch));
    codes.push(enemyCodeFor(d)); enemies.push(pl.enemy); configs.push(pl.config);
    controls.push(ctrlPayload(d)); cubes.push(cubePayload(d)); levels.push(deckLevel());
    jobs.push({ deckIdx: i, ...meta });
  };
  let cand = 0;
  for (const i of idxs) {
    push(i, null, { base: true });
    for (const n of deckAt(i).names) {
      const sp = charSpec(n);
      if (!sp) continue;
      const m = growthMod(sp, n);
      if (!m) continue;
      push(i, { name: n, cp: m.cp }, { name: n, cur: m.cur, to: m.to });
      cand += 1;
    }
  }
  if (!cand) { growthMsg(T("목표보다 낮은 니케가 없습니다 — 이 판은 이미 다 채워져 있습니다."), "err"); return; }
  growthRunning = true;
  growthMsg(T("{d}덱 · {n}명을 목표까지 올려 돌리는 중…", { d: idxs.length, n: cand }));
  try {
    const totals = [];
    const max = 400;
    for (let at = 0; at < decks.length; at += max) {
      const sl = (a) => a.slice(at, at + max);
      const r = await fetch("/api/sim-heavy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "growth", heavy: "growth", mode: modeNow(), dororong: dororongOn(), lang: I18N.lang || "ko",
          decks: sl(decks), duration: durationNow(), code: enemyCode(),
          profile: null, profiles: sl(profiles), enemy: enemies[at], config: configs[at],
          codes: sl(codes), enemies: sl(enemies), configs: sl(configs),
          controls: sl(controls), cubes: sl(cubes), levels: sl(levels),
          lean: true,
        }),
      });
      const j = await readJSON(r);
      if (j.error) throw new Error(j.error);
      if (!Array.isArray(j.results) || j.results.length !== Math.min(max, decks.length - at)) {
        throw new Error(T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
      }
      for (const res of j.results) totals.push(Number(res.total) || 0);
    }
    const base = {};
    jobs.forEach((jb, k) => { if (jb.base) base[jb.deckIdx] = totals[k]; });
    const sumBase = Object.values(base).reduce((a, b) => a + b, 0);
    const rows = [];
    jobs.forEach((jb, k) => {
      if (jb.base) return;
      const b = base[jb.deckIdx] || 0;
      const t = totals[k];
      rows.push({ ...jb, base: b, total: t, deckPct: b ? ((t - b) / b) * 100 : 0,
                  sumPct: sumBase ? ((t - b) / sumBase) * 100 : 0 });
    });
    growthRender(rows, idxs.length);
  } catch (e) {
    growthMsg(String(e.message || e), "err");
  } finally {
    growthRunning = false;
  }
}

function growthRender(rows, nDecks) {
  const out = $("#growth-out");
  if (!out) return;
  out.textContent = "";
  const axisLabel = GROWTH_AXES.find(([a]) => a === growthState.axis)?.[1] || "";
  const head = el("p", "share-pick-note");
  head.textContent = T("{axis} — {d}덱 · {n}명. 내 계정 스펙, 지금 편성·설정 그대로, 평균 판. 순위는 «그 덱 +%»입니다.", { axis: axisLabel, d: nDecks, n: rows.length });
  out.append(head);
  // «지금 값»으로 묶는다 — «7짜리 누구부터 10 찍을까»에 바로 답이 되게(유저 결정).
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.cur)) groups.set(r.cur, []); groups.get(r.cur).push(r); }
  const keys = [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b), "ko"));
  for (const k of keys) {
    const g = groups.get(k).sort((a, b) => b.deckPct - a.deckPct);
    const sec = el("div", "growth-group");
    sec.append(el("h4", null, T("지금 {cur} → {to}", { cur: k, to: g[0].to })));
    const tbl = el("div", "reco-list");
    g.forEach((r, i) => {
      const row = el("div", "reco-row growth-row-item");
      row.append(el("span", "reco-rank", String(i + 1)));
      row.append(recoFace(r.name));
      const nm = el("span", "reco-name");
      nm.append(el("b", null, r.name));
      nm.append(el("i", "reco-burst", T("{n}덱", { n: r.deckIdx + 1 })));
      row.append(nm);
      const val = el("span", "reco-dmg");
      const sign = r.deckPct >= 0 ? "+" : "−";
      val.append(el("b", null, `${sign}${Math.abs(r.deckPct).toFixed(2)}%`));
      val.append(el("span", null, T("합계 {s}{p}%", { s: r.sumPct >= 0 ? "+" : "−", p: Math.abs(r.sumPct).toFixed(2) })));
      val.title = `${I18N.dmg(r.base)} → ${I18N.dmg(r.total)}`;
      row.append(val);
      tbl.append(row);
    });
    sec.append(tbl);
    out.append(sec);
  }
}

function fbcMsg(text, kind) {
  const box = fbcBox();
  if (!box) return;
  box.hidden = false;
  box.textContent = "";
  box.append(el("p", "fbc-msg" + (kind === "err" ? " warn" : ""), text));
}

function fbcRender(deckIdx, rows) {
  const d = deckAt(deckIdx);
  const box = fbcBox();
  const cur = fbcCurrentOrders(d);
  const same = (orders) => fbcOrdersKey(orders) === fbcOrdersKey(cur);
  const base = rows.find((r) => same(r.orders));
  const baseTotal = base ? base.total : Math.max(...rows.map((r) => r.total));
  const sorted = rows.slice().sort((a, b) => b.total - a.total);
  const best = sorted[0];

  box.hidden = false;
  box.textContent = "";
  // 배치모드는 25칸이, 유니온은 세 줄이 한 화면이라 어느 쪽 얘기인지 말해 줘야 한다.
  if (modeNow() === "union") box.append(el("p", "fbc-who", T("{v}번 줄", { v: deckIdx + 1 })));
  else if (fastMode) box.append(el("p", "fbc-who", T("{v}덱", { v: deckIdx + 1 })));
  // 지금 설정은 적지 않는다 — 추천 줄이 «지금 → 바꾸면»을 이미 둘 다 보여 준다.
  // 같은 숫자를 두 번 적으면 정작 봐야 할 «얼마나 오르나»가 묻힌다.
  // 못 박힌 단계는 **숫자보다 먼저** 알린다 — 배지가 «A»인데 3버로 계산하는 것을
  // 모르면 결과를 통째로 오해한다.
  for (const n of fbcPinNote) {
    box.append(el("p", "fbc-pin", T("{name}는 {v}버로 고정해 계산합니다.",
                                    { name: n, v: burstStageOf(n) })));
  }
  for (const [n, v] of fbcMoveNote) {
    box.append(el("p", "fbc-pin",
      T("이 편성에는 1버가 없어 {name}가 {v}버로 갑니다.", { name: n, v })));
  }
  box.append(el("p", "fbc-msg", T("{n}가지를 돌렸습니다.", { n: rows.length })));
  // **적용하면 편성이 바뀐다.** 순서를 자리로 표현하므로 니케가 실제로 자리를 옮긴다 —
  // 누르고 나서 «왜 편성이 흐트러졌지»가 되면 안 된다.
  box.append(el("p", "fbc-msg", T("적용하면 편성 순서가 바뀝니다 — 버스트는 왼쪽부터 나갑니다.")));
  // 버스트 «A»는 순서에 **들어가되 바꾸지는 않는다** — 왜 그런지 말해 주지 않으면
  // «왜 저 니케는 안 건드리지»가 된다.
  if (fbcFlexNote.length) {
    box.append(el("p", "fbc-msg warn",
      T("{v}는 버스트 단계가 고정이 아닙니다 — 지금 계산기는 이런 니케를 한 사이클에 여러 단계로 내보내서 이 덱은 총딜 자체가 부정확할 수 있습니다. 순서 추천도 참고만 하세요.",
        { v: fbcFlexNote.map((n) => T(n)).join(" · ") })));
  }

  if (best.total <= baseTotal) {
    box.append(el("p", "fbc-best", T("지금 설정이 가장 높습니다 — 바꿀 이유가 없습니다.")));
  }
  const list = el("div", "fbc-list");
  // 지금 설정보다 나은 것만, 높은 순으로. 같은 값은 «바꿔도 그대로»라 뜻이 없다.
  // 같은 총딜을 내는 줄은 하나만 남긴다 — 실측에서 상위 5칸 중 셋이 같은 값이었다.
  // 어차피 «얼마나 오르나»가 같으면 사람에겐 한 줄이면 된다.
  const seenTotal = new Set();
  const better = sorted.filter((r) => {
    if (r.total <= baseTotal || same(r.orders)) return false;
    const k = r.total.toFixed(3);
    if (seenTotal.has(k)) return false;
    seenTotal.add(k);
    return true;
  });
  for (const r of better.slice(0, 5)) {
    const row = el("div", "fbc-row");
    const pct = ((r.total - baseTotal) / baseTotal) * 100;
    // **수치가 먼저다.** 이름이 길면(«디젤 : 윈터 스위츠») 앞에 둘 때 이득·총딜이
    // 오른쪽으로 밀려 화면 밖으로 나간다 — 보러 온 것이 그 수치다.
    row.append(el("span", "fbc-gain", `+${pct.toFixed(2)}%`));
    row.append(el("span", "fbc-total", `${I18N.dmg(baseTotal)} → ${I18N.dmg(r.total)}`));
    // «적용»은 **수치 바로 옆**이다. 줄 끝으로 밀면 이름이 긴 줄에서는 눈이 한참
    // 가야 닿는다 — 읽는 것과 누르는 것이 같은 자리에 있어야 한다.
    row.append(mkBtn(T("적용"), "btn-primary btn-sm",
                     () => fbcApply(deckIdx, r.orders, r.bans)));
    row.append(el("b", "fbc-pick", fbcLabel(d, r.orders)));
    list.append(row);
  }
  if (better.length) box.append(list);
  if (better.length > 5) {
    box.append(el("p", "fbc-msg", T("높은 순으로 5가지만 보입니다 (모두 {n}가지 중 {b}가지가 더 높음).",
                                    { n: rows.length, b: better.length })));
  }
}

/** 고른 조합을 실제 컨트롤에 새긴다. 결과 캐시는 **지문이 컨트롤을 물고 있어**
 *  저절로 «미계산»이 된다(ctrlSig) — 따로 지우지 않는다. */
function fbcApply(deckIdx, orders, bans) {
  const d = deckAt(deckIdx);
  // 되돌릴 자리를 먼저 찍는다 — 적용하고 나면 «원래 뭐였는지»를 알 길이 없다.
  // **편성 순서까지** 담는다. 순서를 자리로 표현하므로 그것이 되돌릴 것의 절반이다.
  fbcUndo = { deckIdx, key: fbcKeyOf(deckIdx), before: fbcFlagsOf(d), names: [...d.names],
              label: fbcLabel(d, fbcCurrentOrders(d)) };
  const ban = new Set(bans || []);
  for (const n of fbcGroups(d).flatMap((g) => g.members)) {
    if (!!d.control?.[n]?.no_burst !== ban.has(n)) {
      setCtrl(n, "no_burst", ban.has(n) ? true : null, d);
    }
  }
  // **순서는 자리가 표현한다.** 컨트롤은 이름을 열쇠로 쓰므로 자리를 바꿔도 따라온다.
  d.names = fbcNamesFor(d, orders);
  saveAll();
  renderAll();
  const box = fbcBox();
  if (box) box.hidden = true;
  flashStatus(T("편성 순서를 «{v}»로 바꿨습니다 — 다시 계산합니다.",
                { v: fbcLabel(d, orders || []) }));
  // **바로 다시 계산한다**(유저 지시). 자리가 바뀌면 결과 지문이 어긋나 총딜이 «미계산»으로
  // 비는데, 방금 «+2.9%»를 보고 누른 사람에게 빈 칸을 돌려주면 «적용이 안 됐나»가 된다.
  // 되돌리기는 그대로 살아 있다 — 계산은 결과만 채울 뿐 자리를 더 건드리지 않는다.
  calcDecks([deckIdx], true).catch(() => { /* 실패는 덱의 error가 화면에 말한다 */ });
}

async function calcDecks(idxs, force = false, kind = null) {
  // 덱을 모드별로 집는다. **유니온은 줄마다 보스도 레이드 설정도 다르므로**
  // 덱 하나하나에 제 조건을 붙여 보낸다(솔로는 셋 다 같아 예전과 값이 같다).
  const jobs = idxs.filter((i) => isFull(deckAt(i)) && (force || !resultOf(deckAt(i))));
  if (!jobs.length) return;
  for (const i of jobs) { deckAt(i).calcState = "run"; deckAt(i).error = null; }
  renderAll();
  const profile = mergedProfile();
  const duration = durationNow();
  const code = enemyCode();
  const payloads = jobs.map((i) => battlePayload(deckAt(i)));

  if (engine() === "server") {
    let rngIgnored = false;
    let runsIgnored = false;
    try {
      const { enemy, config } = payloads[0];
      setStatus(T("서버에서 계산 중…"));
      const r = await fetch("/api/sim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // `kind`·`mode`는 **지표에만** 쓴다 — 계산 결과에는 영향이 없다(서버가 세고 버린다).
        // 지표 차원 — 도로모드·화면 언어까지 같이 보낸다. 계산에는 안 쓰이고 서버가
        // 세고 버린다. «계산을 누른 사람» 기준이라 방문자 전체 비율은 아니다.
        body: JSON.stringify({ kind: kind || (idxs.length > 1 ? "all" : "deck"), mode: modeNow(),
                               dororong: dororongOn(), lang: I18N.lang || "ko",
                               decks: jobs.map((i) => deckAt(i).names), code, duration,
                               profile, enemy, config,
                               codes: jobs.map((i) => enemyCodeFor(deckAt(i))),
                               enemies: payloads.map((p) => p.enemy),
                               configs: payloads.map((p) => p.config),
                               controls: jobs.map((i) => ctrlPayload(deckAt(i))),
                               cubes: jobs.map((i) => cubePayload(deckAt(i))),
                               levels: jobs.map(() => deckLevel()) }),
      });
      const j = await readJSON(r);
      if (j.error) throw new Error(j.error);
      // 서버가 계산을 끝내고 결과를 바로 준다 — 코어가 덱당 0.1초 안이라 줄·이벤트 스트림이 필요 없다.
      const out = j.results;
      if (!Array.isArray(out) || out.length !== jobs.length) throw new Error(T("서버 응답이 올바르지 않습니다 — 잠시 후 다시 시도하세요."));
      jobs.forEach((i, k) => {
        const d = deckAt(i);
        d.calcState = null;
        results[fingerprint(d)] = out[k];
      });
      // 확률로 굴려 달라고 했는데 **그대로 기대값이 돌아오면** 표시해 둔다 — 서버의 계산
      // 코어가 아직 그 모드를 모르는 것이다. 잠자코 두면 «시드를 바꿔도 값이 똑같다»가
      // 되어 계산이 틀린 것처럼 보인다. 말하는 것은 `finally`가 상태줄을 지운 **뒤**다.
      rngIgnored = config.rng_mode === "random"
        && (out[0]?._model?.rng_mode ?? "expected") !== "random";
      // 여러 판을 부탁했는데 폭이 안 오면 **한 판만 계산된 것**이다. 잠자코 두면
      // «폭 보기를 골랐는데 폭이 어디 있냐»가 된다(유저 지적 2026-09-01).
      runsIgnored = !rngIgnored && config.runs != null && !out[0]?.runs;
    } catch (e) {
      // 서버가 죽었으면 조용히 브라우저로 떨어지지 않는다 — 이유를 보여 준다
      jobs.forEach((i) => { deckAt(i).calcState = null; deckAt(i).error = String(e.message || e); });
    } finally {
      setStatus("");
    }
    if (rngIgnored || runsIgnored) {
      // 도는 원 없이 문장만 — 기다리라는 뜻이 아니라 «이렇게 계산됐다»는 알림이다.
      setStatus(rngIgnored
        ? T("이 서버의 계산 코어는 아직 확률 모드를 모릅니다 — 기대값으로 계산했습니다.")
        : T("이 서버의 계산 코어는 아직 여러 번 굴리기를 모릅니다 — 한 판만 계산했습니다."), false);
      window.setTimeout(() => setStatus(""), 7000);
    }
    saveAll(); renderAll();
    return;
  }
}

// ── 결과 탭 ─────────────────────────────────────────────────────────────
// 헤드라인은 합계(히어로 숫자), 덱별은 가로 스택 바다. 세그먼트 색은 **역할군** 3색이고
// 캐릭터 정체성으로 칠하지 않는다 — 덱마다 멤버가 달라 25색이 필요해지기 때문이다.
/** 여러 판을 굴렸을 때 **지금 보고 있는 판**. 폭이 없으면 계산된 그 값 그대로다.
 *  기본은 가운데(중앙값) — «대표로 이 정도»가 사람이 먼저 알고 싶은 값이다. */
/** 결과에서 보고 있는 값. 여섯 가지다(유저 결정 2026-09-01):
 *    envMin  각자의 최저를 더한 값        — «다 안 풀렸을 때 이만큼»
 *    worst   총딜이 가장 낮았던 **한 판**  — 실제로 나온 판
 *    mean    각자의 평균을 더한 값        — 기본
 *    mid     총딜이 중간인 **한 판**       — 코어가 `runs.mid`를 주면 그 판, 아니면 각자의 중앙값 합
 *    best    총딜이 가장 높았던 **한 판**
 *    envMax  각자의 최고를 더한 값        — «다 잘 풀렸을 때 이만큼»
 *  «합산»과 «판»은 뜻이 다르다 — 합산은 서로 다른 판의 좋은 순간을 모은 것이고, 판은
 *  실제로 한 번에 일어난 값이다(실측 차이 0.72%). */
// 실제로 나온 판만 보여 준다(유저 결정 2026-09-01). «최저 합산·최고 합산»은 각자의
// 극값을 더한 것이라 **어느 한 판에서도 나오지 않는 수**다 — 폭을 부풀려 읽게 된다.
const SPREAD_VIEWS = ["worst", "mean", "mid", "best"];
const spreadView = () => {
  const v = state.settings.spreadView;
  if (SPREAD_VIEWS.includes(v)) return v;
  // 예전 저장값을 옮긴다 — 고르개에 없는 값이 남으면 아무 칩도 안 켜진다.
  // 걷어낸 «합산» 둘은 가장 가까운 «판»으로 보낸다.
  return v === "envMin" || v === "min" ? "worst" : v === "envMax" || v === "max" ? "best" : "mean";
};
/** 고른 보기의 값. **«가장 낮을 때»·«가장 높을 때»는 다섯 명 각자의 최저·최고를 더한
 *  값이다**(유저 결정 2026-09-01) — 엔진이 주는 «총딜이 가장 낮았던 한 판»을 쓰면 그 판의
 *  니케별 값을 모르니 부분의 합이 전체와 안 맞는다. 각자의 극값을 더하면 화면이 앞뒤가
 *  맞고, 뜻도 «다 잘 풀렸을 때 이만큼»으로 읽힌다.
 *  평균은 판마다의 총딜을 평균한 값(엔진)이 정확하므로 그대로 쓴다. */
/** 한 판짜리 보기(worst·mid·best)가 코어에서 온 그 판. 없으면 null. */
const runOf = (res, view) => {
  const key = view === "worst" ? "worst" : view === "best" ? "best" : view === "mid" ? "mid" : null;
  const r = key ? res?.runs?.[key] : null;
  return r && r.chars ? r : null;
};
/** 니케별 합산 보기에서 쓸 열쇠. */
const ENV_KEY = { envMin: "min", envMax: "max", mean: "mean", mid: "median" };

/** **덱 숫자는 언제나 그 화면에 적힌 다섯 값의 합**이다(유저 결정 2026-09-01).
 *  «판»이면 그 판의 다섯 값을 더하고(코어가 준 값이라 합이 정확히 그 판 총딜이다),
 *  «합산»이면 각자의 극값을 더한다. */
const runsAgg = (res, view) => {
  const r = res?.runs;
  if (!r) return res?.total ?? 0;
  const one = runOf(res, view);
  if (one) return one.total ?? Object.values(one.chars).reduce((a, v) => a + (Number(v) || 0), 0);
  const cs = r.chars, k = ENV_KEY[view] || "mean";
  if (cs) {
    let sum = 0, ok = true;
    for (const v of Object.values(cs)) {
      const x = v?.[k] ?? v?.mean ?? v?.median;
      if (x == null) { ok = false; break; }
      sum += x;
    }
    if (ok && sum > 0) return sum;
  }
  return r[k] ?? r.mean ?? r.median ?? res.total ?? 0;
};
const shownOf = (res) => runsAgg(res, spreadView());
/** 그 니케의 «지금 보고 있는 판» 딜. 니케별 폭이 안 왔으면 계산된 값 그대로. */
const shownChar = (res, name, fallback) => {
  const view = spreadView();
  // «판»이면 **그 판에서 그 니케가 낸 값**이다 — 자기 기준 최고(=chars.max)와는 다르다.
  const one = runOf(res, view);
  if (one) return Number(one.chars[name] ?? fallback);
  const c = res?.runs?.chars?.[name];
  if (!c) return fallback;
  return c[ENV_KEY[view] || "mean"] ?? c.mean ?? c.median ?? fallback;
};

/** 어느 판을 볼지 고르는 칩 셋. 폭이 하나라도 있을 때만 뜬다. */
function renderSpreadPick(rows) {
  const box = $("#res-spread");
  if (!box) return;
  const rr = rows.map((r) => r.res?.runs).find(Boolean);
  box.hidden = !rr;
  box.textContent = "";
  if (!rr) return;
  const cur = spreadView();
  const LABELS = [["worst", T("가장 낮은 판")], ["mean", T("평균")],
                  ["mid", T("중간 판")], ["best", T("가장 높은 판")]];
  for (const [k, label] of LABELS) {
    // 코어가 아직 그 판을 안 주면(중간 판) 칩은 두되 «각자의 중앙값 합»으로 그린다 —
    // 합은 맞고, 실제 한 판이 아니라는 것만 툴팁이 말한다.
    const b2 = el("button", "chip" + (k === cur ? " on" : ""), label);
    b2.type = "button";
    b2.title = k === "mean" ? T("판마다의 값을 평균한 값입니다.")
      : rr[k] && rr[k].chars ? T("실제로 나온 한 판입니다 — 다섯 명의 값이 그 판의 값입니다.")
      : T("아직 그 판의 니케별 값이 오지 않아 각자의 중앙값을 더해 그립니다.");
    b2.onclick = () => { state.settings.spreadView = k; saveAll(); renderResults(); };
    box.append(b2);
  }
  box.append(el("span", "res-spread-n", T("{n}회 굴림", { n: rr.n ?? battleNow().runs })));
}

function renderResults() {
  const rows = [];
  let sum = 0;
  const nDecks = deckCountNow();
  for (let i = 0; i < nDecks; i++) {
    const d = deckAt(i);
    const r = resultOf(d);
    if (r) sum += shownOf(r);
    rows.push({ i, names: d.names, res: r, full: isFull(d), deck: d });
  }
  const known = rows.filter((r) => r.res).length;

  renderSpreadPick(rows);
  $("#res-total").textContent = known ? `${I18N.dmg(sum)}` : "—";
  const p = activeRec();
  // 유니온은 조건이 **줄마다 다르다** — 한 줄로 뭉뚱그리면 어느 줄 얘기인지 알 수 없다.
  // 보스와 방어력을 줄별로 늘어놓고, 모두가 함께 쓰는 것(시간·계정·엔진)만 뒤에 붙인다.
  const condHead = modeNow() === "union"
    ? [...Array(nDecks).keys()].map((i) => {
        const d = uDeck(i);
        const w = uWeak(d);
        const b = battleFor(d);
        return T("{v}줄 {v1}", { v: i + 1, v1: w ? (bossOf(w)?.name || w) : T("보스 없음") })
             + T("(방 {v})", { v: Number(b.def || 0).toLocaleString() });
      }).join(" · ") + " · "
    : (modeNow() === "museum"
        ? T("{v} · ", { v: museumStage() ? T(museumStage().boss) : T("뮤지엄") })
          + (museumBuffAlways() ? T("상시 {v}% · ", { v: museumBuffAlways().value }) : "")
          + (museumBuffWeekly() ? (museumWeeklyOn() ? T("주간 {v}% · ", { v: museumWeekly() }) : T("주간 꺼짐 · ")) : "")
          + (deckLevel() ? T("Lv {v} · ", { v: deckLevel() }) : "")
        : T("약점 {v} · ", { v: state.settings.code || T("없음") }))
      + T("방어력 {v} · ", { v: battleNow().def.toLocaleString() })
      + (battleNow().core_px ? T("코어 {v}px · ", { v: battleNow().core_px }) : T("코어 없음 · "))
      + (() => {  // 1.0이 아닌 평타 계수만 밝힌다 — 보정 섞인 숫자를 이론치로 오해하지 않게
          const c = battleNow().weapon_coeff || {};
          const parts = WEAPONS.filter((w) => c[w] != null && c[w] !== 1)
                               .map((w) => `${w}×${c[w]}`);
          return parts.length ? T("계수 {v} · ", { v: parts.join(" ") }) : "";
        })();
  // 난수를 굴린 판이면 **어떤 시드였는지**를 조건줄에 적는다 — 그 값을 «시드 고정»에
  // 도로 넣으면 같은 판이 다시 나온다. 기대값(기본)일 때는 적지 않는다(늘 같은 값이라
  // 할 말이 없다).
  const rngLine = (() => {
    const bt = battleNow();
    const m = bt.rng_mode || "expected";
    if (m === "expected") return "";
    if (m === "spread") {
      // 폭 보기 — «가장 낮은 판 ~ 가장 높은 판»이다(고르개의 양 끝과 같은 값). 어느
      // 보기를 골라도 그 값을 품는다 — «지금 97.97억인데 폭은 99.63억부터» 같은 말이
      // 안 나온다(유저 지적 2026-09-01).
      //
      // **보기 이름을 그대로 넘겨야 한다.** 예전에 "min"·"max"를 넘겼는데 그건 보기
      // 이름이 아니라서 `runsAgg`가 둘 다 «평균»으로 떨어뜨렸다 — 양 끝이 같은 수로
      // 찍혔다(«99.63억 ~ 99.63억»).
      const rs = rows.map((r) => r.res?.runs).filter(Boolean);
      const n = rs[0]?.n ?? bt.runs;
      if (!rs.length) return T("난수 시드 {v} · ", { v: lastSeed });
      const lo = rows.reduce((a, r) => a + (r.res?.runs ? runsAgg(r.res, "worst") : 0), 0);
      const hi = rows.reduce((a, r) => a + (r.res?.runs ? runsAgg(r.res, "best") : 0), 0);
      return T("{n}회 굴림 · {lo} ~ {hi} · ", { n, lo: I18N.dmg(lo), hi: I18N.dmg(hi) });
    }
    return T("난수 시드 {v} · ", { v: m === "seed" ? Math.max(0, Math.round(Number(bt.seed) || 0)) : lastSeed });
  })();
  $("#res-cond").textContent =
    condHead
    + rngLine
    + T("{v}초 · ", { v: durationNow() })
    + T("계정 {v} · 계산 {known}/{nDecks}{v1} · ", { v: p ? p.name : T("고정"), known, nDecks, v1: modeNow() === "union" ? T("줄") : T("덱") })
    + T("서버");
  const dup = duplicated();
  $("#res-dup").textContent = dup.size
    ? T("덱 간 중복: {v} — ", { v: [...dup].map((n) => T(n)).join(" · ") })
      + T("{v}에서는 불가능한 편성입니다", { v: modeNow() === "union" ? T("유니온 레이드")
                                              : modeNow() === "museum" ? T("뮤지엄") : T("솔로레이드") }) : "";
  renderMuseumResults(rows);

  // 역할군 범례는 없앤다. 이제 색은 **누구인지**를 가리키고(덱 슬롯 색), 이름은
  // 막대와 아래 상세에 직접 적히므로 색만으로 전달하지 않는다.
  const lg = $("#res-legend");
  if (lg) { lg.textContent = ""; lg.hidden = true; }

  const max = Math.max(1, ...rows.map((r) => r.res?.total || 0));
  const bars = $("#res-bars");
  bars.textContent = "";
  for (const row of rows) {
    const wrap = el("div", "bar-row");
    const head = el("div", "bar-head");
    head.append(el("span", "bar-no", String(row.i + 1).padStart(2, "0")));
    head.append(el("span", null, row.names.filter(Boolean).map(T).join(" · ") || T("빈 덱")));
    head.append(el("span", "bar-total", row.res ? `${I18N.dmg(shownOf(row.res))}` : "—"));
    // 여러 판을 굴렸으면 총딜 옆에 **폭**을 적는다 — 큰 숫자는 대표값(중앙값), 그 옆이
    // «운이 나쁘면 · 좋으면»이다.
    // 폭은 **숫자로만** 적는다. 막대 아래에 폭 막대를 그려 봤더니 흔한 폭(±1~2%)에서는
    // 막대 끝의 2px짜리 얼룩이 되어 «저 파란 게 뭐냐»가 됐다(유저 지적 2026-09-01).
    // 폭이 큰 편성에서도 숫자가 더 정확히 말한다 — 그림은 걷는다.
    const rr0 = row.res?.runs;
    if (rr0 && rr0.min != null && rr0.max != null) {
      const sp = el("span", "bar-range",
                    `${I18N.dmg(runsAgg(row.res, "worst"))} ~ ${I18N.dmg(runsAgg(row.res, "best"))}`);
      sp.title = T("{n}회 굴려서 나온 폭 — 다섯 명 각자의 최저와 최고를 더한 값입니다.",
                   { n: rr0.n ?? battleNow().runs });
      head.append(sp);
    }
    wrap.append(head);

    // 이 덱에 딱지 붙은 니케가 있으면 **숫자 바로 아래**에서 말한다. 편성 화면을 안 거치고
    // 결과만 보는 사람이 있고, 「이 값에 사정이 있다」는 그 숫자 옆에 있어야 뜻이 있다.
    // 이름과 표만 적고 자세한 것은 툴팁 — 세 줄에 문장이 다섯이면 막대가 안 보인다.
    const stats = row.names.filter(Boolean).map((n) => [n, charStatus(n)]).filter(([, st]) => st);
    if (stats.length) {
      const line = el("div", "bar-stat");
      line.textContent = stats.map(([n, st]) => `${T(n)} · ${T(st.label)}`).join("  ");
      line.title = stats.map(([n, st]) => charStatusLine(n, st)).join("\n");
      // 색은 **제일 센 것**으로 — 계산 오류가 하나라도 있으면 그 덱의 숫자는 붉다.
      const rank = { bug: 3, verifying: 1, unsupported: 1 };
      line.dataset.k = [...stats].sort(
        (a, b) => (rank[b[1].status] || 0) - (rank[a[1].status] || 0))[0][1].status;
      wrap.append(line);
    }

    if (!row.res) {
      wrap.append(el("div", "bar-empty",
        row.full ? T("미계산") : T("5명을 채우면 계산할 수 있습니다")));
    } else {
      // 막대 **위에 배치모드와 같은 얼굴 카드**를 얹는다 — 누가 얼마를 냈는지 «덱별
      // 상세»까지 안 내려가도 읽힌다(피드백 6452a138 «간략화된 캐릭터사진 + 딜량이
      // 결과에서도 보이면 좋겠어요, 가로 그래프 위에 놓인다던가»).
      // 카드 테두리는 그 아래 막대 조각과 **같은 색**이다 — 조각과 얼굴이 눈으로 이어진다.
      const strip = el("div", "bar-cards");
      for (const [nm, dmg0] of charsByFormation(row.names, row.res.chars)) {
        const dmg = shownChar(row.res, nm, dmg0);
        const c = card(nm, { compact: true, dmg });
        c.style.setProperty("--seg-c", deckColor(row.names, nm));
        c.title = `${T(nm)} — ${I18N.dmg(dmg)}`;
        // 니케별 폭은 **딜 줄에 붙여 한 줄로** 적는다 — «9.24억(±0.5%)»(유저 지시
        // 2026-09-01). 얼굴 위에 따로 얹었더니 머리색과 겹쳐 안 읽혔고, 밑에 한 줄을 더
        // 두면 카드 다섯 장이 그만큼 내려앉는다. 정확한 폭은 손을 올리면 뜨고 상세에도 있다.
        const rc = row.res.runs?.chars?.[nm];
        if (rc && rc.min != null && rc.max != null) {
          const mid = rc.median ?? (dmg || 1);
          const pct = ((rc.max - rc.min) / 2 / mid) * 100;
          const dmgEl = c.querySelector(".nk-dmg");
          if (dmgEl) {
            dmgEl.textContent = `${I18N.dmg(dmg)}(±${pct.toFixed(pct < 10 ? 1 : 0)}%)`;
            dmgEl.classList.add("has-var");
          }
          c.title = `${T(nm)} — ${I18N.dmg(dmg)} (${I18N.dmg(rc.min)} ~ ${I18N.dmg(rc.max)})`;
        }
        strip.append(c);
      }
      wrap.append(strip);

      const track = el("div", "bar-track");
      // 여러 판을 굴렸으면 **고른 판**의 길이로 선다(기본 가운데). 자동으로 오가게 했더니
      // 가만히 못 있는 화면이 됐다 — 사람이 고른다(유저 지시 2026-09-01).
      track.style.width = `${(shownOf(row.res) / max) * 100}%`;
      for (const [nm, dmg0] of charsByFormation(row.names, row.res.chars)) {
        const seg = el("div", "bar-seg");
        const dmg = shownChar(row.res, nm, dmg0);
        const pctv = (dmg / shownOf(row.res)) * 100;
        seg.style.flex = `${Math.max(pctv, 0.5)}`;
        seg.style.background = deckColor(row.names, nm);   // 상세·도넛과 같은 색
        seg.title = `${T(nm)} — ${I18N.dmg(dmg)} (${pctv.toFixed(1)}%)`;
        // 좁은 세그먼트에 이름을 넣으면 넘친다 — 넉넉할 때만 직접 라벨을 붙인다
        if (pctv >= 14) seg.append(el("span", null, `${T(nm)} ${pctv.toFixed(0)}%`));
        track.append(seg);
      }
      wrap.append(track);
    }
    bars.append(wrap);
  }

  // 덱별 상세 — 기록 탭과 **같은 렌더러**를 쓴다. 두 곳이 다르게 보이면 어느 쪽이
  // 맞는지 매번 확인해야 한다.
  const det = $("#res-detail");
  if (det) {
    det.textContent = "";
    const packed = {
      decks: rows.filter((r) => r.res).map((r) => ({
        names: r.names, total: r.res.total, chars: r.res.chars,
        detail: r.res.detail || null, notes: r.res.notes || "",
        // 여러 판을 굴렸을 때의 폭(덱 합계 + 니케별). 없으면 상세도 폭을 안 그린다.
        runs: r.res.runs || null,
        // 확인용 — **기록에는 안 실린다**(collectDecks가 이 둘을 안 담는다).
        // 계산할 때마다 새로 나오는 진행 로그일 뿐 저장할 값이 아니다.
        timeline: r.res.timeline || null, burstCycles: r.res.burst_cycles || null,
        // «상세 타임라인» 뷰어가 그 덱만 trace로 다시 계산할 때 쓸 요청 — 결과 탭에서만
        // 존재한다(기록·공유에는 없어 뷰어 버튼도 안 뜬다).
        tlReq: r.deck ? tlRequestFor(r.deck) : null,
      })),
      total: sum,
      duration: durationNow(),
    };
    if (packed.decks.length) det.append(recDetail(packed));
    else det.append(el("p", "prose prose-sm", "아직 계산한 덱이 없습니다."));
  }
}

// ── 최공 대상 즉시 계산 ─────────────────────────────────────────────────
// 「자신을 제외한 최종 공격력이 가장 높은 아군 N기에게」 계열 버프는 **대상이 갈리면
// 딜이 통째로 달라진다.** 미란다 애장품이 대표다.
//
// **순위를 바꾸는 값은 몇 개뿐이다.** 아군 전체에게 똑같이 들어가는 버프는 모두의
// 공격력을 같은 비율로 올리므로 순위를 못 바꾼다. 남는 것은 셋:
//
//   ① 소지 공격력            — 계산기에게 한 번 물어 캐시한다 (시뮬 아님, 표 조회)
//   ② 오버로드 공격력 증가    — 계정에 이미 있다
//   ③ 자기 버스트 자버프      — **그 사이클의 3버만** 받는다. 이게 순위를 뒤집는다
//
// 그래서 3버 후보마다 «그 사람이 버스트를 쓰는 사이클»을 따로 세운다.
// 순서는 인게임과 같다: 미란다 버스트(파워 업!)가 **먼저** 걸리고 — 그때는 3버 자버프가
// 아직 없다 — 그 다음 풀버스트 시작 시점에 웨이크업!의 «1발 크확»이 정해진다.
//
// 조건부 버프(중첩·체력·명중 횟수)와 «시전자 기준» 버프는 세지 않는다. 그래서 이 값은
// **예측**이고, 화면이 그렇게 밝힌다. 정확한 값은 덱을 계산하면 결과에 실려 오는
// 진단(`top_atk`)이 답한다 — 그쪽은 계산기 엔진이 실제로 돌린 결과다.

let TOP_ATK_BUFFS = {};      // 이름 → {buff, pct, slots, excl, timing}
let SELF_BURST_ATK = {};     // 이름 → 자기 버스트 자버프 공격력 %
let DEALER_ATK_FLAT = {};    // 이름 → «버스트 쓴 아군»에게 주는 시전자 공격력 비례 %
let SELF_FB_ATK = {};        // 이름 → 풀버스트가 열리면 켜지는 자기 공격력 % (매 사이클)
let LOW_ATK_CASTERS = new Set();  // 「최종 공격력이 가장 «낮은» 3버」에게 거는 니케
let LOW_ATK_BUFFS = {};      // 이름 → {buff, stat, pct, slots}
let ADJ_CASTERS = new Set();  // 루주·플로라처럼 «양옆 아군»에게 거는 니케
let ADJ_BUFFS = {};           // 이름 → [버프 이름, …]
// 뱃지 색 — **본인 일러에서 실측한 색**이다(초상화 화소를 채도·명도로 걸러
// 가장 많이 나온 색 순으로 뽑았다). 루주는 와인레드(#9f1313·#9f1359 계열이
// 압도적), 플로라는 보라(#6d3b9f가 다른 색보다 3배 이상 많음)로 각각 정체성이
// 뚜렷했다. 목록에 없는 캐스터는 `--color-info`(청록)로 물러난다.
const ADJ_COLOR = { "루주": "#9c1a3e", "플로라": "#7d46c2" };
let CDR_CASTERS = new Set();  // **아군 전체**에게 버스트 쿨타임 감소를 주는 니케
const atkCache = new Map();  // `${profSig()}|${이름}` → {atk, atk_pct}
let atkInflight = null;      // 같은 조회가 겹치면 하나로 묶는다
let atkError = "";           // 실패 이유. **비워 두지 않는다** — 「읽는 중…」에서 멈추면
                             // 왜 멈췄는지 알 방법이 없다 (실제로 그렇게 막혔다)

const topAtkCastersIn = (d) => (d.names || []).filter((n) => n && TOP_ATK_CASTERS.has(n));

/** 루주·플로라 같은 «양옆 아군» 버프 — 계산이 아니라 **배치 규칙**이라 스탯 비교
 *  없이 항상 정해진다. 그래서 최공 대상처럼 진단 패널을 열지 않고 **슬롯 카드에
 *  바로 표시한다.** 양쪽 다 받는다는 걸 모르는 사람이 많다는 게 만든 이유다.
 *
 *  빈 슬롯은 뛰어넘는다 — 실제 전투에서 스쿼드는 **채운 자리만으로** 좁혀지므로,
 *  UI에 뚫린 빈 칸을 이웃으로 세면 «채웠으면 옆에 있었을 사람»을 놓친다. */
function adjHitsIn(names) {
  const filled = (names || []).filter(Boolean);
  const hits = new Map();          // 이름 → [{caster, buffs, self}]
  filled.forEach((caster, i) => {
    if (!ADJ_CASTERS.has(caster)) return;
    // 실제로는 본인도 받지만(엔진 코드에 `[caster] + adj`로 그렇게 있다) — **뱃지는**
    // 이웃에게만 단다(「본인이 자기 버프를 받는다」는 새삼스러운 정보라서). 무리
    // 전체를 하나로 묶어 보여 주는 테두리는 `adjGroupsIn()`이 따로 맡는다.
    const reach = new Set([caster]);
    if (i > 0) reach.add(filled[i - 1]);
    if (i < filled.length - 1) reach.add(filled[i + 1]);
    const buffs = ADJ_BUFFS[caster] || [];
    for (const n of reach) {
      if (!hits.has(n)) hits.set(n, []);
      hits.get(n).push({ caster, buffs, self: n === caster });
    }
  });
  return hits;
}

/** 캐스터별 «묶을 슬롯 범위» — 물리적 자리(빈 칸 없이 채운 덱) 기준으로 캐스터
 *  본인 칸부터 양옆 칸까지를 [시작, 끝] 인덱스로 돌려준다. 이웃이 없으면(양쪽 다
 *  비었거나 캐스터 혼자) 묶을 것이 없어 제외한다 — 테두리 한 칸짜리는 의미가 없다. */
function adjGroupsIn(names) {
  const out = [];
  (names || []).forEach((caster, i) => {
    if (!caster || !ADJ_CASTERS.has(caster)) return;
    const lo = names[i - 1] ? i - 1 : i;
    const hi = names[i + 1] ? i + 1 : i;
    if (lo === hi) return;
    out.push({ caster, lo, hi });
  });
  return out;
}
/** 오버로드 공격력 증가. **계산기가 준 값을 쓴다** — 계정에서 직접 읽으면
 *  «고정값»(프로필 없음)에서 조용히 0이 되어 예측이 실제보다 낮아진다. */
/** 풀버스트가 열리는 편성인가. **1·2·3단계가 다 있어야** 1→2→3으로 이어져 열린다.
 *
 *  이 판정이 없으면 화면이 조용히 헛말을 한다: 2단계가 없는 편성에서 «3버가 자기
 *  버스트에 받습니다»라고 적으면, 애초에 풀버스트가 없어서 웨이크업!의 1발 크확이
 *  발동하지도 않는데 마치 잘 돌아가는 것처럼 읽힌다. */
function burstStages(names) {
  const have = new Set();
  const base = [];
  for (const n of names) {
    // 배지가 아니라 **계산이 쓰는 단계**를 본다 — 레드 후드처럼 «A»를 한 단계로 못 박은
    // 니케는 이제 그 단계 하나만 메운다. 배지(«A»)를 그대로 믿으면 «풀버스트 열림»이라
    // 해 놓고 실제로는 1·2버가 비어 안 열리는, 정반대 안내가 나간다.
    // 라피 : 레드 후드처럼 **편성을 봐야 아는** 단계는 `burstStageIn`이 답한다 —
    // 버스트 비교와 **같은 함수**를 쓴다. 규칙이 두 벌이면 언젠가 갈린다.
    const b = burstStageIn(n, names);
    if (!b || b === "?") continue;
    // "A" — 1·2·3버 전부 대체 가능한 와일드카드. 있으면 무조건 다 채워진다.
    if (b === "A") { have.add("1"); have.add("2"); have.add("3"); continue; }
    base.push([n, b]);
  }
  for (const [n, b] of base) have.add(b);
  return { have, ok: have.has("1") && have.has("2") && have.has("3"),
           missing: ["1", "2", "3"].filter((x) => !have.has(x)) };
}

/** 실제로 **순번이 오는** 3단계 버스트 니케.
 *
 *  3버가 셋이어도 다 나가지 않는다. 버스트 쿨이 40초이고 사이클이 20초면 둘로 매
 *  사이클이 덮이므로 셋째는 영영 안 나간다(실측: 리버렐리오↔홍련:흑영만 교대하고
 *  에이다는 한 번도 안 나갔다). 이걸 모르고 «에이다가 3버인 사이클»까지 예측하면
 *  일어나지 않는 상황을 근거로 화면이 말하게 된다.
 *
 *  순번은 **덱 배치 순서**를 따른다 (실측과 일치). 쿨이 섞여 있으면 가장 짧은 쿨로
 *  본다 — 그쪽이 순번을 결정한다. */
function activeB3(names) {
  const b3 = names.filter((n) => String(byName.get(n)?.burst) === "3");
  if (b3.length <= 1) return b3;
  const cds = b3.map((n) => Number(byName.get(n)?.cd) || 40);
  const cycle = Math.max(20, ...names
    .filter((n) => String(byName.get(n)?.burst) !== "3")
    .map((n) => Number(byName.get(n)?.cd) || 20));
  const need = Math.max(1, Math.ceil(Math.min(...cds) / cycle));
  return b3.slice(0, need);
}

const olAtkPct = (n, sig) => Number(atkCache.get(`${sig}|${n}`)?.atk_pct || 0);

/** 소지 공격력을 계산기에게 물어 캐시한다. **시뮬이 아니라 표 조회**라 즉시 끝난다.
 *  브라우저에서 다시 구하지 않는 이유는 `base_atk_of` 주석 참고 — 두 곳이 갈린다. */
async function fillBaseAtk(names) {
  const sig = profSig();
  const need = names.filter((n) => n && !atkCache.has(`${sig}|${n}`));
  if (!need.length) return true;
  // **겹친 요청을 버리지 않는다.** 예전에는 «이미 떠 있으면 false»로 돌려보냈는데,
  // 그러면 뒤늦게 온 렌더가 다시 그릴 기회를 잃고 「읽는 중…」에서 영구히 멈췄다.
  if (atkInflight) return atkInflight;
  atkInflight = (async () => {
    try {
      let atk = null;
      // 소지 공격력은 **서버가 낸다**(`/api/atk`). 브라우저 폴백이 있었지만 계산
      // 자체가 서버 전용이 되면서 닿지 않는 길이 됐다(2026-08-27 제거).
      const r = await fetch("/api/atk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: need, profile: mergedProfile() }),
      });
      const j = await readJSON(r);
      if (j.error) throw new Error(j.error);
      atk = j.atk;
      for (const [n, v] of Object.entries(atk || {})) {
        // 옛 모양(숫자 하나)도 받아 준다 — 서버와 워커가 갈릴 때 조용히 0이 되지 않게
        atkCache.set(`${sig}|${n}`, typeof v === "number" ? { atk: v, atk_pct: 0 } : v);
      }
      atkError = "";
      return true;
    } catch (e) {
      atkError = String(e.message || e);
      return false;
    } finally {
      atkInflight = null;
    }
  })();
  return atkInflight;
}

/** 3버 `dealer`가 버스트를 쓰는 사이클의 최공 순위. 시뮬 없이 위 셋만 더한다. */
function estimateTopAtk(names, caster, dealer) {
  const sig = profSig();
  const buff = TOP_ATK_BUFFS[caster];
  const pool = names.filter((n) => n && (!buff?.excl || n !== caster));
  const base = {};
  for (const n of pool) {
    const v = atkCache.get(`${sig}|${n}`);
    if (v == null) return null;                    // 아직 못 받았다
    base[n] = v.atk;
  }

  // ① 미란다 버스트 시점 — 3버 자버프는 **아직 없다** (버스트 순서: 1단계 → 3단계)
  const pct1 = {};
  for (const n of pool) pct1[n] = olAtkPct(n, sig);
  const atk1 = pool.map((n) => ({ n, v: base[n] * (1 + pct1[n] / 100) }))
    .sort((a, b) => b.v - a.v);
  const powered = new Set(atk1.slice(0, buff?.slots || 1).map((x) => x.n));

  // ② 풀버스트 시작 시점 — 3버 자버프 + 파워 업! + «버스트 쓴 아군» 지원이 얹힌다.
  //    에이다 「은밀한 지원」·크라운 「원 포 올」은 **시전자 공격력 비례 고정값**이라
  //    곱이 아니라 덧셈으로 붙는다 (`_effective_atk`와 같은 식).
  let flat = 0;
  const flatFrom = [];
  for (const n of names) {
    const v = Number(DEALER_ATK_FLAT[n] || 0);
    const bv = atkCache.get(`${sig}|${n}`)?.atk;
    if (!v || !bv) continue;
    flat += bv * v / 100;
    flatFrom.push(n);
  }
  const rows = pool.map((n) => {
    const pct = pct1[n]
      // 풀버스트가 열리면 켜지는 자버프는 **누가 3버든** 걸린다 (리버렐리오 +160%)
      + Number(SELF_FB_ATK[n] || 0)
      // 자기 버스트로 켜지는 자버프는 그 사이클의 3버만 (아인 +70.12%, 에이다 +40%)
      + (n === dealer ? Number(SELF_BURST_ATK[n] || 0) : 0)
      + (powered.has(n) ? Number(buff?.pct || 0) : 0);
    const add = n === dealer ? flat : 0;      // 그 사이클에 3단계 버스트를 쓴 사람에게
    return { name: n, base: base[n], pct, flat: add,
             atk: base[n] * (1 + pct / 100) + add,
             powered: powered.has(n), selfBurst: n === dealer && !!SELF_BURST_ATK[n],
             selfFb: !!SELF_FB_ATK[n], supported: add > 0 };
  }).sort((a, b) => b.atk - a.atk);

  // **몇 명이 받는지는 버프마다 다르다** — 맥스웰·미란다는 2명이다. rows[0]만 보면
  // 실제로 받은 2번째 사람이 「예측과 다름」으로 잘못 표시된다(실측: 2번·3번 덱).
  const slots = Math.max(1, buff?.slots || 1);
  const winners = rows.slice(0, slots).map((r) => r.name);
  const winSet = new Set(winners);
  const cutRow = rows[Math.min(slots, rows.length) - 1];
  const cut = cutRow ? cutRow.atk : 0;
  for (const r of rows) {
    r.got = winSet.has(r.name);
    r.need = r.got ? null : (r.base > 0 ? (cut - r.atk) / r.base * 100 : null);
    r.tie = !r.got && r.need != null && r.need <= 0;
  }
  return { dealer, winner: winners[0] || null, winners, powered: [...powered],
           flatFrom, rows };
}

/** 편성 탭 아래 줄. 덱을 짜는 즉시 나온다 — 버튼도, 계산도 필요 없다. */
function renderTopAtk() {
  const box = $("#deck-topatk");
  if (!box) return;
  const d = deckOf(state.settings.deck);
  const casters = topAtkCastersIn(d);
  // **실험 스위치(`lab`)를 타지 않는다.** 최공 대상 버프(미란다·나가·맥스웰·
  // 소다:트윙클링 바니·앨리스)는 값이 확정적이라 운영에서도 그대로 보인다.
  // 차속 대상(`renderLowAtk` — 리버렐리오)도 같은 근거로 상용에 노출한다.
  if (!casters.length) { box.hidden = true; box.textContent = ""; return; }
  box.hidden = false;
  box.textContent = "";

  const caster = casters[0];
  const names = d.names.filter(Boolean);
  box.append(el("span", "topatk-k", T("{caster} 버프 대상", { caster })));

  // 소지 공격력이 아직 없으면 받아 오고 다시 그린다. **성공·실패 모두 다시 그린다** —
  // 실패한 채 「읽는 중…」으로 남으면 무엇이 잘못됐는지 알 수가 없다.
  if (names.some((n) => !atkCache.has(`${profSig()}|${n}`))) {
    if (atkError) {
      box.append(el("span", "topatk-sum warn", T("소지 공격력을 읽지 못했습니다 — {atkError}", { atkError })));
      box.append(mkBtn(T("다시"), "btn-ghost", () => { atkError = ""; renderTopAtk(); }));
      return;
    }
    box.append(el("span", "topatk-note", "소지 공격력을 읽는 중…"));
    fillBaseAtk(names).then(() => renderTopAtk());
    return;
  }

  // 풀버스트가 안 열리는 편성이면 예측이 의미가 없다 — 그것부터 말한다
  const st = burstStages(names);
  if (!st.ok) {
    box.append(el("span", "topatk-sum warn",
      T("{v} 버스트가 없어 풀버스트가 열리지 않습니다", { v: st.missing.map((x) => x + T("단계")).join("·") })));
    box.append(el("span", "topatk-note",
      T("풀버스트 시작 시 걸리는 버프(웨이크업! 등)는 발동하지 않습니다.")));
    return;
  }

  // **다툴 상대가 없으면 띄우지 않는다.** 후보가 한 명이면 그 사람이 받는 것이
  // 자명해서 볼 것이 없다 — 미미르의 «아인-에이다»·«나유타-헬름»처럼 두 딜러가
  // 최공 1위를 다투는 상황이 이 진단이 답하는 질문이다.
  const rivals = names.filter((n) => n !== caster);
  if (rivals.length < 2) { box.hidden = true; box.textContent = ""; return; }

  // **순번이 오는 3버만** 본다 — 안 나가는 사람의 사이클을 예측하면 헛말이 된다
  const b3 = activeB3(names);
  const scen = (b3.length ? b3 : [null]).map((x) => estimateTopAtk(names, caster, x))
    .filter(Boolean);
  if (!scen.length) { box.append(el("span", "topatk-note", "계산할 수 없습니다.")); return; }

  const res = resultOf(d);
  const done = (res?.top_atk || []).filter((c) => (c.kind || "top") === "top");

  // 대상이 여러 명인 버프(맥스웰·미란다는 2명)는 **그 사람이 목록에 들었는지**로
  // 본다. `winner`(1명)로만 재면 2번째로 받는 사람 몫이 통째로 안 잡힌다.
  const miss = scen.filter((x) => x.dealer && !x.winners.includes(x.dealer));
  const predText = miss.length
    ? (() => { const m = miss.map((x) => T(x.dealer)).join(" · ");
                return T("{m}{v} 자기 버스트에 못 받습니다", { m, v: eun(m) }); })()
    : (b3.length ? T("3버가 자기 버스트에 받습니다") : T("{v}가 받습니다", { v: scen[0].winners.map((n) => T(n)).join(" · ") }));

  // 계산 결과가 있으면 **그쪽이 정답이다.** 예측과 갈리면 그 사실을 눈에 보이게 한다 —
  // 조용히 다른 말을 하게 두면 어느 쪽을 믿어야 하는지 알 수 없다.
  let text = predText, warn = miss.length > 0, differs = false;
  if (done.length) {
    const missed = done.filter((c) => c.dealer_got === false);
    const cyc = missed.reduce((n, c) => n + (c.cycles?.length || 0), 0);
    text = missed.length
      ? T("3버가 못 받은 사이클 {cyc}회 — {v}", { cyc, v: [...new Set(missed.map((c) => c.dealer))].map((n) => T(n)).join(" · ") })
      : T("모든 사이클에서 그 사이클의 3버가 받았습니다");
    warn = missed.length > 0;
    // 여러 명이 받는 버프는 **명단 전체**를 맞춰야 한다 — 한 명만 보면 2번째 자리가
    // 갈려도 안 걸린다(실측: 2번 덱 맥스웰·3번 덱 미란다가 매번 「예측과 다름」으로
    // 잘못 떴었다. rows[0] 한 명만 보고 세던 게 원인).
    const predWho = [...new Set(scen.flatMap((x) => x.winners))].sort().join(",");
    const realWho = [...new Set(done.flatMap((c) => c.chosen))].sort().join(",");
    differs = predWho !== realWho;
  }
  box.append(el("span", "topatk-sum " + (warn ? "warn" : "ok"), text));
  if (differs) box.append(diffFlag());
  box.append(mkBtn(T("예측"), "btn-ghost", () => openTopAtkInstant(caster, scen)));
  if (done.length) {
    box.append(mkBtn(T("계산 결과"), "btn-primary",
      () => openTopAtk(T("{caster} 버프 대상 — 계산 결과", { caster }), done)));
  }
}

/** 「예측과 계산 결과가 다르다」 표식. **눈에 걸려야 한다** — 둘이 갈렸는데 조용하면
 *  화면의 어느 숫자를 믿어야 하는지 알 수 없다. */
function diffFlag() {
  const f = el("span", "diff-flag");
  f.append(el("b", null, "⚠"));
  f.append(el("span", null, "예측과 다름"));
  f.title = T("예측은 순번·조건부 버프를 완전히 세지 못합니다. 계산 결과가 실제 값입니다.");
  return f;
}

function openTopAtkInstant(caster, scen) {
  const dlg = $("#topatk-sheet");
  const body = $("#topatk-body");
  if (!dlg || !body) return;
  $("#topatk-t").textContent = T("{caster} 버프 대상 (예측)", { caster });
  body.textContent = "";

  // **니케마다 다른 것을 한 문장으로 우기지 않는다**(피드백 2026-08-28).
  //
  //   · 값이 없는 니케가 있다. `top_atk_buffs`는 «조건 없는 `atk_pct`»만 굽는데(build.py
  //     `_top_atk_data`), 소다 : 트윙클링 바니처럼 조건이 붙은 버프는 일부러 빠진다.
  //     그 빈칸을 그대로 찍어 «공격력 0%»라고 적고 있었다 — 읽는 사람은 «0을 준다»로 읽는다.
  //   · **자신도 받는 니케가 있다**(`excl:false`). 맥스웰·소다가 그렇다. 그런데 늘
  //     «자신을 제외한»이라고만 말해, «2명이 받아야 하는데 1명만 준다»는 제보를 받았다.
  //   · 마지막 «1발 크리티컬 확률» 문장은 **맥스웰 전용**인데 모두에게 붙어 있었다.
  //
  // 아는 것만 말한다. 이 시트가 하는 일은 «누가 뽑히나»를 보여 주는 것이고, 버프의
  // 값·범위는 데이터가 있을 때만 덧붙인다.
  const buff = TOP_ATK_BUFFS[caster] || {};
  const who = buff.excl === false
    ? T("자신과, 자신을 제외한 최종 공격력이 가장 높은 아군")
    : T("자신을 제외한 최종 공격력이 가장 높은 아군");
  // 값이 없는 니케는 `excl`도 모른다 — 그때 «자신을 제외한»이라고 단정하면 또 같은
  // 거짓말이 된다(소다 : 트윙클링 바니는 자신도 함께 받는다). 아우르는 말로 쓴다.
  const head = buff.pct
    ? T("{caster} 「{v}」는 «{who} {v1}기»에게 공격력 {v2}%를 겁니다.",
        { caster, v: buff.buff || "", who, v1: buff.slots || 1, v2: buff.pct })
    : T("{caster}는 «최종 공격력이 가장 높은 아군»을 골라 버프를 겁니다(니케에 따라 자신도 함께 받습니다).",
        { caster });
  body.append(el("p", "prose prose-sm",
    head + T(" 대상은 **버프가 걸리는 그 순간의 최종 공격력**으로 정해집니다 — 아래는 그 예측입니다.")
      .replace(/\*\*/g, "")
    + (buff.pct ? "" : T(" 이 버프는 조건이 붙어 있어 여기서는 값을 세지 않습니다 — 정확한 값은 계산 결과의 진단이 답합니다."))));

  for (const s of scen) {
    // 몇 명이 받는지는 버프마다 다르다(맥스웰·미란다는 2명) — «그 사람이 목록에
    // 들었는지»로 봐야 한다. `winner` 한 명만 대조하면 2번째 자리가 놓친다.
    const dealerGot = s.dealer && s.winners.includes(s.dealer);
    const blk = el("div", "ta-case" + (s.dealer && !dealerGot ? " miss" : ""));
    const h = el("div", "ta-case-h");
    h.append(el("span", "ta-cyc",
      s.dealer ? T("{dealer}{v} 버스트하는 사이클", { dealer: s.dealer, v: ga(s.dealer) }) : T("3버 없음")));
    h.append(el("span", "ta-dealer", T("받는 사람: {v}", { v: s.winners.map((n) => T(n)).join(" · ") || "-" })));
    if (s.dealer) {
      h.append(el("span", "ta-mark" + (dealerGot ? " ok" : " miss"),
        dealerGot ? T("✔ 3버가 받음") : T("✘ 3버가 못 받음")));
    }
    blk.append(h);
    for (const r of s.rows) {
      const row = el("div", "ta-row" + (r.got ? " got" : ""));
      row.append(faceOne(r.name));
      const nm = el("span", "ta-nm", r.name);
      if (r.selfBurst) nm.append(el("i", "cmp-tag in", "버스트 자버프"));
      if (r.selfFb) nm.append(el("i", "cmp-tag in", "풀버스트 자버프"));
      if (r.supported) nm.append(el("i", "cmp-tag in", "버스트 지원"));
      if (r.powered) nm.append(el("i", "cmp-tag in", buff.buff || T("버프")));
      row.append(nm);
      const v = el("span", "ta-atk", Math.round(r.atk).toLocaleString("ko-KR"));
      v.title = T("소지 {v} × (1 + {v1}%)", { v: r.base.toLocaleString("ko-KR"), v1: r.pct.toFixed(1) })
        + (r.flat ? ` + ${Math.round(r.flat).toLocaleString("ko-KR")}` : "");
      row.append(v);
      if (r.got) row.append(el("span", "ta-need got", "받음"));
      else if (r.tie) row.append(el("span", "ta-need tie", "동점 — 순서로 밀림"));
      else row.append(el("span", "ta-need", T("공증 +{v}%p 필요", { v: r.need.toFixed(1) })));
      blk.append(row);
    }
    body.append(blk);
  }

  const tail = el("p", "prose prose-sm", "이 값은 ");
  tail.append(el("b", null, "예측"));
  tail.append(el("span", null,
    T("입니다 — 소지 공격력 · 오버로드 공증 · 자기 버스트 자버프 · «버스트를 쓴 아군»")
    + T(" 지원까지 셉니다. 중첩·체력·명중 횟수에 걸린 버프는 빠집니다.")
    + T(" 덱을 계산하면 «계산 결과» 버튼이 생기고, 그쪽이 실제로 돌린 값입니다.")));
  body.append(tail);

  $("#topatk-x").onclick = () => dlg.close();
  $("#topatk-close").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

// ── 최저공 타게팅 ───────────────────────────────────────────────────────
// 리버렐리오 「차분한 수심 4」: 「풀 버스트 타임 시작 시 **최종 공격력이 가장 낮은**
// 기본 버스트 3단계 아군 1기에게 시전자 기준 차지 속도 ▲」.
//
// **최공의 반대다.** 받으려면 공격력이 더 «낮아야» 한다. 차지형(RL·SR)에게는 차지 속도가
// 곧 딜이라 이 한 자리가 크게 갈리는데, 리버렐리오 자신이 풀버스트 자버프 +160%를 갖고
// 있어서 대개 자기가 최저에서 빠진다 — 그래서 3버가 둘이면 상대가 받는다.

const lowAtkCastersIn = (d) => (d.names || []).filter((n) => n && LOW_ATK_CASTERS.has(n));

/** 3버 `dealer`가 버스트하는 사이클에서 «최저공 3버»가 누구인가. */
function estimateLowAtk(names, caster, dealer) {
  const sig = profSig();
  // 후보는 **기본 버스트 3단계 아군**이다. 시전자도 제외 문구가 없어 후보에 든다.
  const pool = names.filter((n) => n && String(byName.get(n)?.burst) === "3");
  if (!pool.length) return null;
  const rows = [];
  for (const n of pool) {
    const c = atkCache.get(`${sig}|${n}`);
    if (c == null) return null;
    const pct = Number(c.atk_pct || 0)
      + Number(SELF_FB_ATK[n] || 0)
      + (n === dealer ? Number(SELF_BURST_ATK[n] || 0) : 0);
    rows.push({ name: n, base: c.atk, pct, atk: c.atk * (1 + pct / 100) });
  }
  rows.sort((a, b) => a.atk - b.atk);          // 낮은 쪽이 먼저다
  const slots = LOW_ATK_BUFFS[caster]?.slots || 1;
  const win = new Set(rows.slice(0, slots).map((r) => r.name));
  const cut = rows[slots - 1]?.atk ?? 0;
  for (const r of rows) {
    r.got = win.has(r.name);
    // 받으려면 «내려야» 한다 — 부호가 최공과 반대다
    r.drop = r.got ? null : (r.base > 0 ? (r.atk - cut) / r.base * 100 : null);
  }
  // `winners`도 같이 준다 — 지금은 대상이 늘 1명(리버렐리오)이라 `winner` 한 명으로도
  // 맞지만, 최공 대상 쪽에서 같은 가정 때문에 2명짜리 버프(맥스웰·미란다)가 「예측과
  // 다름」으로 잘못 뜬 적이 있다. 대상 수가 늘어도 조용히 같은 문제가 재발하지 않게
  // 여기도 처음부터 명단으로 둔다.
  return { dealer, winner: rows[0]?.name || null, winners: [...win], rows };
}

function renderLowAtk() {
  const box = $("#deck-lowatk");
  if (!box) return;
  box.textContent = "";
  const d = deckOf(state.settings.deck);
  const casters = lowAtkCastersIn(d);
  // **실험 스위치(`lab`)를 타지 않는다.** 최공 대상(renderTopAtk)과 같은 근거다 —
  // 리버렐리오 차속 대상도 조건부·중첩 없이 결정되는 값이라 상용에 내놔도 된다.
  if (!casters.length) { box.hidden = true; return; }
  box.hidden = false;

  const caster = casters[0];
  const names = d.names.filter(Boolean);
  const info = LOW_ATK_BUFFS[caster] || {};
  box.append(el("span", "topatk-k", T("{caster} 차속 대상", { caster })));

  // **최저를 가릴 상대가 있어야 띄운다.** 3버가 한 명이면 그 사람이 받는 것이 자명하다
  // — 미미르의 «흑련-리버렐리오»처럼 리버렐리오와 다른 3버가 같이 있을 때의 질문이다.
  const b3all = names.filter((n) => String(byName.get(n)?.burst) === "3");
  if (b3all.length < 2) { box.hidden = true; box.textContent = ""; return; }

  const st = burstStages(names);
  if (!st.ok) {
    box.append(el("span", "topatk-sum warn",
      T("{v} 버스트가 없어 풀버스트가 열리지 않습니다", { v: st.missing.map((x) => x + T("단계")).join("·") })));
    return;
  }
  if (names.some((n) => !atkCache.has(`${profSig()}|${n}`))) {
    box.append(el("span", "topatk-note", "소지 공격력을 읽는 중…"));
    fillBaseAtk(names).then(() => renderLowAtk());
    return;
  }
  // **순번이 오는 3버만** 가정한다 (`activeB3`) — 안 나가는 사람의 사이클을 세면
  // 화면이 일어나지 않는 상황을 근거로 말한다
  const b3 = activeB3(names);
  const scen = (b3.length ? b3 : [null]).map((x) => estimateLowAtk(names, caster, x))
    .filter(Boolean);
  if (!scen.length) {
    box.append(el("span", "topatk-note", "3단계 버스트 아군이 없어 대상이 없습니다."));
    return;
  }
  const res2 = resultOf(d);
  const done2 = (res2?.top_atk || []).filter((c) => c.kind === "low");
  // 계산 결과가 있으면 **그쪽이 정답이다** — 예측은 순번·조건부 버프를 완전히 세지 못한다
  const predWho = [...new Set(scen.flatMap((x) => x.winners))];
  const who = done2.length ? [...new Set(done2.flatMap((c) => c.chosen))] : predWho;
  const w = who.map((n) => T(n)).join(" · ");
  box.append(el("span", "topatk-sum ok", T("{w}{v} 받습니다", { w, v: ga(w) })));
  if (done2.length
      && predWho.slice().sort().join(",") !== who.slice().sort().join(",")) {
    box.append(diffFlag());
  }
  box.append(mkBtn(T("예측"), "btn-ghost", () => openLowAtk(caster, info, scen)));
  if (done2.length) {
    box.append(mkBtn(T("계산 결과"), "btn-primary",
      () => openTopAtk(T("{caster} 차속 대상 — 계산 결과", { caster }), done2)));
  }
}

function openLowAtk(caster, info, scen) {
  const dlg = $("#topatk-sheet");
  const body = $("#topatk-body");
  if (!dlg || !body) return;
  $("#topatk-t").textContent = T("{caster} 차속 대상 (예측)", { caster });
  body.textContent = "";
  const lead = el("p", "prose prose-sm",
    T("{caster} 「{v}」는 풀버스트 시작 시 ", { caster, v: info.buff || "" }));
  lead.append(el("b", null, "최종 공격력이 가장 낮은 3단계 버스트 아군"));
  lead.append(el("span", null,
    T(" {v}기에게 시전자 기준 차지 속도 {v1}%를 겁니다.", { v: info.slots || 1, v1: info.pct || 0 })
    + T(" 최공 버프와 **반대**라, 받으려면 공격력이 더 낮아야 합니다.")));
  lead.textContent = lead.textContent.replace(/\*\*/g, "");
  body.append(lead);

  for (const s of scen) {
    const blk = el("div", "ta-case");
    const h = el("div", "ta-case-h");
    h.append(el("span", "ta-cyc",
      s.dealer ? T("{dealer}{v} 버스트하는 사이클", { dealer: s.dealer, v: ga(s.dealer) }) : T("3버 없음")));
    h.append(el("span", "ta-dealer", T("받는 사람: {v}", { v: s.winners.map((n) => T(n)).join(" · ") || "-" })));
    blk.append(h);
    for (const r of s.rows) {
      const row = el("div", "ta-row" + (r.got ? " got" : ""));
      row.append(faceOne(r.name));
      const nm = el("span", "ta-nm", r.name);
      if (SELF_FB_ATK[r.name]) nm.append(el("i", "cmp-tag out", "풀버스트 자버프"));
      if (r.name === s.dealer && SELF_BURST_ATK[r.name]) {
        nm.append(el("i", "cmp-tag out", "버스트 자버프"));
      }
      row.append(nm);
      const v = el("span", "ta-atk", Math.round(r.atk).toLocaleString("ko-KR"));
      v.title = T("소지 {v} × (1 + {v1}%)", { v: r.base.toLocaleString("ko-KR"), v1: r.pct.toFixed(1) });
      row.append(v);
      row.append(el("span", "ta-need" + (r.got ? " got" : ""),
        r.got ? T("받음") : T("공증 −{v}%p 내려야", { v: r.drop.toFixed(1) })));
      blk.append(row);
    }
    body.append(blk);
  }
  body.append(el("p", "prose prose-sm",
    T("차지 속도는 차지형(RL·SR)에게 곧 딜입니다. 이 값은 예측이며, 자버프가 큰 니케는")
    + T(" 최저에서 빠지므로 대개 상대가 받습니다.")));
  $("#topatk-x").onclick = () => dlg.close();
  $("#topatk-close").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

// 진단은 **로컬 직접 접속에서만** 보인다 (`/api/health`의 `lab`). 서버가 판정하므로
// 코드가 배포에 딸려 가도 운영에서는 나오지 않는다 — 화면 스위치로 가릴 필요가 없다.
const labOn = () => !!HEALTH.lab;

// ── 레이드 모드 (솔로 / 유니온) ─────────────────────────────────────────
// 화면은 하나를 공유하고 **데이터만 갈아 끼운다** — 편성·큐브·컨트롤·결과 UI가
// 똑같은데 화면을 복제하면 고칠 곳이 두 배가 된다. 모드별로 덱·결과·전투 조건을
// 따로 들고 있다가 토글이 통째로 바꿔치기한다.
//
// 유니온 레이드: 속성 5종은 **고정**이고(안의 보스만 바뀐다) 그중 3개를 골라
// 덱 3개로 친다. 4렙은 마지막 속성 하나로 고정이라 그 판은 속성을 못 고른다.
const UNION_CODES = ["전격", "수냉", "작열", "풍압", "철갑"];
// 속성색 토큰 — 슬롯 아래 상태 바가 «무엇을 겨눴나»를 색으로도 말한다
const CODE_VAR = { 작열: "var(--code-fire)", 수냉: "var(--code-water)",
                   풍압: "var(--code-wind)", 전격: "var(--code-elec)",
                   철갑: "var(--code-iron)" };
const UNION_DECKS = 3;

// 유니온 레이드 회차별 보스 — 다섯 속성이 **한 번씩** 배정된다(순서는 회차마다
// 다르고, 같은 랩처가 회차에 따라 다른 속성으로 나온다). 레벨이 올라도 라인업은
// 그대로고 체력만 오른다. 4단계는 5번째 보스 하나만 남는다.
// [속성, 그림 파일(image/boss/*.webp), 이름] — 실측 출처는 research/blablalink.
const UNION_SEASONS = [
  { id: 1000035, label: "S35", start: "2025-12-04",
    bosses: [["작열", "ecg002", "듀얼 링 [H.S.T.A.]"], ["수냉", "ecg006", "스프레드 [P.S.I.D.]"], ["전격", "eba001", "스톰 브링어 [Z.E.U.S.]"], ["풍압", "mca003_re", "리빌드 핑거즈 [A.N.M.I]"], ["철갑", "ebg002_dmtr", "마테리얼H [D.M.T.R.]"]] },
  { id: 1000036, label: "S36", start: "2026-01-01",
    bosses: [["수냉", "mcg005", "닥터 [P.S.I.D.]"], ["작열", "mcg006", "헤비메탈 [H.S.T.A.]"], ["철갑", "bbg004_dmtr_intercept", "크라켄 [D.M.T.R.]"], ["전격", "eca001_re", "리빌드 오벨리스크 [Z.E.U.S.]"], ["풍압", "mbg004_anmi", "모더니아 [A.N.M.I.]"]] },
  { id: 1000037, label: "S37", start: "2026-01-29",
    bosses: [["풍압", "bcg002", "레이턴스 [A.N.M.I.]"], ["철갑", "mca003", "핑거즈 [D.M.T.R.]"], ["전격", "mbg002", "그레이브 디거 [Z.E.U.S.]"], ["수냉", "ecg005_re", "리빌드 빅 토르소 [P.S.I.D.]"], ["작열", "bbg003", "블랙스미스 [H.S.T.A.]"]] },
  { id: 1000038, label: "S38", start: "2026-03-05",
    bosses: [["전격", "bcg003", "포터 [Z.E.U.S.]"], ["작열", "eca003", "플레이트 [H.S.T.A.]"], ["수냉", "ebg001", "랜드 이터 [P.S.I.D.]"], ["풍압", "mca003_re", "리빌드 핑거즈 [A.N.M.I]"], ["철갑", "ebg002_dmtr", "마테리얼H [D.M.T.R.]"]] },
  { id: 1000039, label: "S39", start: "2026-04-09",
    bosses: [["작열", "ecg006", "스프레드 [H.S.T.A.]"], ["수냉", "xcg002", "크리스탈 아머 [P.S.I.D.]"], ["철갑", "bbg004_dmtr_intercept", "크라켄 [D.M.T.R.]"], ["풍압", "bcg001_re", "리빌드 쿠쿰버 [A.N.M.I.]"], ["전격", "eba001", "스톰 브링어 [Z.E.U.S.]"]] },
  { id: 1000040, label: "S40", start: "2026-05-14",
    bosses: [["철갑", "bca002", "두리안 [D.M.T.R.]"], ["작열", "mcg006", "헤비메탈 [H.S.T.A.]"], ["풍압", "mbg004_anmi", "모더니아 [A.N.M.I.]"], ["전격", "mcg004_re", "리빌드 벌컨R [Z.E.U.S.]"], ["수냉", "mbg001_psid", "알트아이젠 [P.S.I.D.]"]] },
  { id: 1000041, label: "S41", start: "2026-06-11",
    bosses: [["풍압", "mca001", "시니스터 [A.N.M.I.]"], ["철갑", "mcg007", "레플리카 레드 슈즈 [D.M.T.R.]"], ["작열", "mba002", "니힐리스타 [H.S.T.A.]"], ["수냉", "ecg005_re", "리빌드 빅 토르소 [P.S.I.D.]"], ["전격", "bbg006_zeus", "울트라 [Z.E.U.S.]"]] },
  { id: 1000042, label: "S42", start: "2026-07-09",
    bosses: [["작열", "bca002", "두리안 [H.S.T.A.]"], ["전격", "mcg005", "닥터 [Z.E.U.S.]"], ["수냉", "mbg001_psid", "알트아이젠 [P.S.I.D.]"], ["풍압", "eca001_re", "리빌드 오벨리스크 [A.N.M.I.]"], ["철갑", "bbg004_dmtr_intercept", "크라켄 [D.M.T.R.]"]] },
  { id: 1000043, label: "S43", start: "2026-07-30",
    bosses: [["수냉", "bcg005", "선바스 [P.S.I.D.]"], ["풍압", "eca003", "플레이트 [A.N.M.I.]"], ["작열", "bbg002", "토커티브 [H.S.T.A.]"], ["철갑", "mca003_re", "리빌드 핑거즈 [D.M.T.R]"], ["전격", "ebg002", "마테리얼H [Z.E.U.S.]"]] },
  // **표에 넣는 값은 «보스 자신의 속성»이다 — 공지 이미지의 «약점»이 아니다.**
  // 공지는 «이 속성으로 때려라»(약점)를 적고, 이 표는 그 보스의 코드를 든다
  // (`enemyCodeFor`가 이 값을 그대로 서버에 적 코드로 넘긴다). 한 번 그대로
  // 넣었다가 다섯이 통째로 뒤집혔다 — 약점의 역(`WEAK_TO_ENEMY[약점]`)이 답이다.
  // 검산: 모더니아는 S36·S40에서 풍압, 리빌드 빅 토르소는 S37·S41에서 수냉이었고
  // 이번 계산도 같게 나온다. 부대 이름도 속성이 정하므로 함께 바뀐다.
  // 9/4(금) 5:00 ~ 9/10(목) 4:59. 아직 시작 전이라 수집본이 없다 — 공식 라운지의
  // «유니온 레이드 오픈 사전 안내» 보스 리스트를 그대로 옮겼다. **툼스톤·애니힐리오는
  // 유니온 레이드에 처음 나오는 랩처라 그림이 없다**(`null`) — 카드는 이름으로 대신
  // 뜬다. 회차가 열려 수집본이 들어오면 그림 파일 이름을 채워 넣을 것.
  // 툼스톤·애니힐리오 그림은 **잠정**이다 — 파일 이름이 `tombstone`·`annihilio`로
  // 다른 것들(`bcg002` 같은 게임 내부 id)과 생김새부터 다르다. 회차가 열려 진짜
  // `icon_id`가 나오면 파일만 갈아 끼우면 된다.
  // 회차 id는 S35~S43이 라벨과 1:1로 이어져 온 규칙을 따라 1000044로 둔다(수집 전 추정 —
  // 틀려도 «회차별로 고른 보스»를 담는 열쇠만 달라지고 계산에는 영향이 없다).
  { id: 1000044, label: "S44", start: "2026-09-04",
    bosses: [["전격", "bcg002", "레이턴스 [Z.E.U.S.]"], ["작열", "tombstone", "툼스톤 [H.S.T.A.]"], ["풍압", "mbg004_anmi", "모더니아 [A.N.M.I.]"], ["수냉", "ecg005_re", "리빌드 빅 토르소 [P.S.I.D.]"], ["철갑", "annihilio", "애니힐리오 [D.M.T.R.]"]] },
];

/** 지금 볼 회차. 아직 고르개가 없으니 **가장 최근 회차**를 쓴다 — 저장값이 있으면
    그쪽이 우선이라, 나중에 회차 고르개를 붙여도 이 함수만 그대로 쓰면 된다. */
// 「커스텀」 회차 — 아직 안 나온 회차를 직접 짜 보는 자리다. 실제 회차 표는 건드리지
// 않고 **저장소에 따로** 든다(U().custom). 처음에는 가장 최근 회차를 베껴 두어,
// 비어 있는 화면 대신 «고칠 것이 있는 화면»에서 시작한다.
const CUSTOM_SEASON = "custom";
function customSeason() {
  U().custom ||= {
    id: CUSTOM_SEASON,
    label: T("커스텀"),
    start: T("직접 설정"),
    bosses: UNION_SEASONS[UNION_SEASONS.length - 1].bosses.map((b) => [...b]),
  };
  return U().custom;
}

/** 그 회차에 내가 골라 둔 보스 셋. **회차마다 따로 기억한다** — 회차가 바뀌면
 *  보스 라인업이 통째로 바뀌므로, 지난 회차에 걸어 둔 배정이 그대로 남아 있으면
 *  「고른 적 없는데 뭔가 꽂혀 있다」가 된다. 고른 적 없는 회차는 빈 채로 시작한다. */
function seasonPicks(id = unionSeason().id) {
  return (U().picks[String(id)] ||= [null, null, null]);
}

/** 줄에 꽂힌 보스를 그 회차의 기억과 맞춘다. 회차를 바꿀 때 부른다. */
function applySeasonPicks() {
  const picks = seasonPicks();
  for (let i = 0; i < UNION_DECKS; i++) uDeck(i).weak = picks[i] || null;
}

function unionSeason() {
  const want = U().season;
  if (want === CUSTOM_SEASON) return customSeason();
  return UNION_SEASONS.find((s) => s.id === want) || UNION_SEASONS[UNION_SEASONS.length - 1];
}

/** 속성 하나에 걸린 이번 회차 보스: {code, art, name}. 회차마다 속성당 하나뿐이다. */
function bossOf(code) {
  const row = unionSeason().bosses.find((b) => b[0] === code);
  return row ? { code, art: row[1], name: row[2] } : null;
}
// 유니온 레이드는 **언제나 켜져 있다.** 만드는 중에는 서버 플래그(`HEALTH.union` —
// 로컬 직접 접속이거나 `NIKKE_UNION=1`)로 잠가 뒀지만 이제 정식 화면이다. 플래그로
// 잠가 두면 `/api/health`가 없는 자리(정적 서버·오프라인)에서 유니온이 통째로
// 사라지고, 주소로 `/union`을 열어도 솔로로 떨어진다.
const unionOn = () => true;

// 유니온은 **자기 데이터를 따로 든다.** 솔로의 state.decks/results는 한 글자도
// 건드리지 않는다 — 두 콘텐츠는 덱 수도, 보스도, 레벨 정책도 다르다.
function U() {
  state.union ||= { decks: null, level: null, results: {}, battle: null,
                    duration: 180, code: "풍압", profileId: null };
  state.union.decks ||= Array.from({ length: UNION_DECKS }, () => newDeck());
  // 레이드 설정(방어력·코어·적정거리·무기 계수·버스트 사이클)도 **따로 든다**.
  // 솔로와 같은 상자를 쓰면 한쪽을 만질 때 다른 쪽 결과가 조용히 바뀐다.
  state.union.battle ||= { ...BATTLE_DEFAULT, optimal_range_weapons: [],
                           weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff } };
  // 레이드 설정은 **줄마다 따로** 든다. 세 줄이 서로 다른 보스를 치므로 방어력도
  // 코어도 적정거리도 같을 이유가 없다. 예전에 한 벌만 쓰던 값(state.union.battle)이
  // 있으면 그것을 씨앗으로 세 줄에 나눠 심는다 — 저장해 둔 설정을 잃지 않는다.
  for (const d of state.union.decks) {
    d.battle ||= { ...state.union.battle,
                   optimal_range_weapons: [...(state.union.battle.optimal_range_weapons || [])],
                   weapon_coeff: { ...(state.union.battle.weapon_coeff || {}) } };
  }
  // 2026-08-28에 반나절 «보스마다 한 상자»로 들었던 흔적을 치운다. **같은 보스를 두 줄이
  // 치는 편성**에서는 줄마다 다른 설정이 필요해서 되돌렸다(유저 지적). 줄에 붙어 있던
  // 값은 저장·불러오기를 지나며 이미 줄마다의 사본이 되어 있으므로 옮길 것은 없다.
  if (state.union.battles) delete state.union.battles;
  // 검색·필터도 따로 든다. 화면(필터 바 DOM)은 솔로와 같은 것을 쓰지만 **상태를
  // 나눠** 유니온에서 건 필터가 편성으로 새어 들지 않는다 — 전투력 계산기가
  // state.coopFilter로 하는 것과 같은 방식이다.
  state.union.filter ||= defaultFilter();
  // 회차별 보스 기억. **여기서 한 번만** 옮겨 심는다 — 회차를 바꾼 뒤에 심으면
  // 지금 줄에 꽂힌 것이 «새로 고른 회차»의 기억으로 들어가, 고른 적 없는 회차에
  // 보스가 생기고 원래 회차는 비어 버린다(실측).
  if (!state.union.picks) {
    const sid = state.union.season ?? UNION_SEASONS[UNION_SEASONS.length - 1].id;
    state.union.picks = { [String(sid)]: state.union.decks.map((d) => d.weak || null) };
  }
  // 예전에 저장된 엉뚱한 값(이미지 주소 등)을 걷어낸다 — 남아 있으면 보스 이름
  // 자리에 그대로 뜬다. 모르는 값은 «안 고름»으로 되돌린다.
  for (const d of state.union.decks) {
    if (d.weak && !UNION_CODES.includes(d.weak)) d.weak = null;
  }
  return state.union;
}

/** 유니온이 쓰는 필터 상자. */
const uFilter = () => U().filter;

/** 빈 칸을 눌러 여는 «고르기» 시트의 필터. 아래 목록과 **따로 든다** — 한 명 찾으려고
 *  건 조건이 목록에 그대로 남으면, 시트를 닫고 나서 «왜 몇 명 안 보이지»가 된다. */
const pickFilter = () => (U().pickFilter ||= defaultFilter());

// 지금 고르기 시트가 채우려는 자리. null이면 닫혀 있다.
let pickAt = null;

const BURST_CHIPS = [["1", "Ⅰ"], ["2", "Ⅱ"], ["3", "Ⅲ"], ["4", "Λ"]];

// 보스 속성 → **그 보스를 치는 속성**. WEAK_TO_ENEMY(치는 쪽 → 맞는 쪽)의 역방향이다.
// 원본 데이터(blablalink `nikke_list_v2.json`의 weak_element_id)로 확인한 사슬:
//   수냉 ▶ 작열 ▶ 풍압 ▶ 철갑 ▶ 전격 ▶ 수냉
const COUNTER_OF = Object.fromEntries(
  Object.entries(WEAK_TO_ENEMY).map(([hit, hurt]) => [hurt, hit]));

// 유니온 한 줄에 우월 속성이 이만큼은 있어야 한다 — 그 아래면 경고를 띄운다.
const UNION_COUNTER_MIN = 3;

/** 두 줄의 편성을 **통째로 맞바꾼다.** 보스는 줄에 남는다 — 「이 보스는 그대로 두고
 *  편성만 다른 줄로」가 실제로 하고 싶은 일이다. */
function uSwapDecks(i, j) {
  if (i === j || i < 0 || j < 0 || i >= UNION_DECKS || j >= UNION_DECKS) return;
  uSnap(T("{v}·{v1}번 줄 편성 맞바꾸기", { v: i + 1, v1: j + 1 }));
  const a = uDeck(i), b = uDeck(j);
  for (const k of ["names", "cubes", "control"]) {
    const t = a[k]; a[k] = b[k]; b[k] = t;
  }
  saveAll();
  renderAll();
}

/** 빈 칸을 눌러 «고르기» 시트를 연다. 검색과 필터만 있고 육성 수정은 없다 —
 *  여기서 할 일은 «찾아서 꽂기» 하나뿐이다. */
function openPick(deckIdx, idx) {
  const dlg = $("#pick-sheet");
  if (!dlg) return;
  pickAt = { deckIdx, idx };
  const f = pickFilter();
  f.q = "";                                  // 열 때마다 검색어는 비운다
  $("#pick-title").textContent = T("{v}번 줄 {v1}번 자리", { v: deckIdx + 1, v1: idx + 1 });
  renderPick();
  if (!dlg.open) dlg.showModal();
  $("#pick-q")?.focus();
}

function closePick() {
  pickAt = null;
  const dlg = $("#pick-sheet");
  if (dlg?.open) dlg.close();
}

/** 시트 안의 칩·목록을 지금 필터로 다시 그린다. */
function renderPick() {
  const f = pickFilter();
  const q = $("#pick-q");
  if (q && document.activeElement !== q) q.value = f.q;

  const burst = $("#pick-burst");
  if (burst) {
    burst.textContent = "";
    for (const [v, label] of BURST_CHIPS) {
      const b = el("button", "chip" + (f.burst.includes(v) ? " on" : ""), label);
      b.type = "button";
      b.onclick = () => {
        f.burst = f.burst.includes(v) ? f.burst.filter((x) => x !== v) : [...f.burst, v];
        saveAll(); renderPick();
      };
      burst.append(b);
    }
  }

  const elem = $("#pick-elem");
  if (elem) {
    elem.textContent = "";
    for (const code of UNION_CODES) {
      const b = el("button", "chip chip-elem" + (f.element.includes(code) ? " on" : ""));
      b.type = "button";
      b.title = code;
      b.style.setProperty("--code-c", CODE_VAR[code] || "var(--color-stage-line)");
      const file = ELEMENT_ICON[code];
      if (file) { const im = el("img"); im.src = `image/icon/${file}`; im.alt = code; b.append(im); }
      else b.append(el("span", null, code));
      b.onclick = () => {
        f.element = f.element.includes(code)
          ? f.element.filter((x) => x !== code) : [...f.element, code];
        saveAll(); renderPick();
      };
      elem.append(b);
    }
  }

  const wrap = $("#pick-pool");
  if (!wrap) return;
  wrap.textContent = "";
  // 이미 다른 줄에 들어간 이름은 **잠근다** — 유니온도 줄 간 중복이 불가하다.
  const used = new Map();
  U().decks.forEach((d, di) => {
    for (const n of d.names) if (n) used.set(n, di + 1);
  });
  const list = filteredRoster(false, f);
  for (const rec of list) {
    const at = used.get(rec.name);
    const c = card(rec.name, { dim: !rec.parsed || !!at, usedIn: at, party: at || 0 });
    // 고르는 자리다 — 육성 수정(⚙)·즐겨찾기(★)는 여기서 치운다
    c.querySelector(".nk-cog")?.remove();
    c.querySelector(".nk-fav")?.remove();
    if (CODE_VAR[rec.element]) c.style.setProperty("--frame", CODE_VAR[rec.element]);
    if (!rec.parsed) {
      // 아직 안 나온 니케는 «파싱이 안 됐다»가 아니라 «아직 안 나왔다»가 사실이다.
      c.title = rec.preview ? T("출시 예정 — 스킬이 공개되면 계산할 수 있습니다")
        : T("스킬 미파싱 — 계산할 수 없습니다");
    } else if (at) {
      c.title = T("{at}번 줄에서 사용 중 — 줄 간 중복은 불가합니다", { at });
    } else {
      c.onclick = () => {
        if (!pickAt) return;
        const { deckIdx, idx } = pickAt;
        const prev = uDeck(deckIdx).names[idx];
        uSnap(prev && prev !== rec.name ? T("{prev} → {name} 교체", { prev, name: rec.name }) : T("{name} 배치", { name: rec.name }),
              prev && prev !== rec.name ? { ...pickAt } : null);
        uDeck(deckIdx).names[idx] = rec.name;
        closePick();
        saveAll(); renderAll();
        slamSlot(deckIdx, idx);
      };
    }
    wrap.append(c);
  }
  const n = $("#pick-count");
  if (n) n.textContent = T("{length}명", { length: list.length });
}

/** 니케 한 명의 컨트롤을 모달로 연다. 패널은 한 벌뿐이라 데려왔다 돌려보낸다. */
function openUnionCtrl(name) {
  const cp = $("#ctrl-panel"), dlg = $("#ctrl-sheet"), host = $("#ctrl-host");
  if (!cp || !dlg || !host) return;
  uCtrlOpen = name;
  host.append(cp);
  cp.hidden = false;
  $("#ctrl-title").textContent = T("{name} — 컨트롤", { name });
  buildControl();
  renderBench();
  if (!dlg.open) dlg.showModal();
}

/** 닫으면 패널을 제자리(솔로 편성 상자)로 돌려보낸다 — 모달 안에 두고 오면
 *  솔로에서 컨트롤을 펼쳐도 아무것도 안 나온다. */
function closeUnionCtrl() {
  const cp = $("#ctrl-panel"), dlg = $("#ctrl-sheet");
  // 컨트롤 패널의 집은 **가운데 칸**이다. `.squad`에 붙이면 좌우 기둥·아래 줄 뒤로
  // 밀려 니케 카드와 떨어진다.
  const home = document.querySelector("#squad-wrap .squad-main")
    || document.querySelector("#squad-wrap .squad");
  uCtrlOpen = null;
  if (cp && home) { home.append(cp); cp.hidden = true; }
  if (dlg?.open) dlg.close();
  renderBench();
}

/** 그 줄의 레이드 설정 패널을 연다. 패널은 **한 벌뿐**이고 줄마다 갈아 끼운다 —
 *  복제하면 입력칸이 세 벌이 되어 어느 것이 진짜인지 알 수 없게 된다. */
function openRowBattle(i) {
  const bp = $("#btpanel"), dlg = $("#raid-sheet"), host = $("#raid-host");
  if (!bp || !dlg || !host) return;
  bossCfgCode = null;        // 보스 기본값을 보다 왔다면 여기서 끊는다 — 상자가 둘이다
  uBattleRow = i;
  uBattleOpen = true;
  // 워크벤치를 **아래로 늘리지 않는다** — 세 줄이 한 화면에 보이는 것이 이 화면의
  // 요점이라, 설정이 줄 사이를 벌리면 화면이 무너진다. 패널을 모달로 데려온다.
  host.append(bp);
  // 사이클은 **덱 것이라 여기 없다**(유저 지시 2026-08-30). 예전에는 줄 설정 안에
  // 끼워 뒀는데, 레이드 설정은 «이 보스를 어떤 조건으로 치나»이고 사이클은 «이 덱을
  // 어떻게 굴리나»라 성격이 다르다 — 줄마다 제 «버스트 사이클» 단추로 연다.
  homeCycleBlock();
  bp.hidden = false;
  $("#raid-title").textContent =
    T("{v}번 줄 레이드 설정 — {v1}", { v: i + 1, v1: bossOf(uWeak(uDeck(i)))?.name || uWeak(uDeck(i)) || T("보스 없음") });
  buildBattle();                      // 입력칸을 그 줄의 값으로 다시 채운다
  syncBattleChrome();
  if (!dlg.open) dlg.showModal();
  renderBench();
}

/** 그 보스의 **회차 기본값**을 고친다. 줄 설정과 같은 패널을 쓰되 대상만 바꾼다 —
 *  입력칸을 두 벌 두면 어느 것이 진짜인지 알 수 없게 된다(줄 설정과 같은 규칙). */
function openBossCfg(code) {
  const bp = $("#btpanel"), dlg = $("#raid-sheet"), host = $("#raid-host");
  if (!bp || !dlg || !host) return;
  bossCfgCode = code;
  uBattleOpen = false;       // 줄 설정이 아니다 — 닫을 때 줄 쪽 정리로 새지 않게 한다
  host.append(bp);
  // 사이클은 덱 것이라 여기서는 안 보인다 — 보스가 정할 값이 아니다.
  homeCycleBlock();
  bp.hidden = false;
  $("#raid-title").textContent =
    T("{v} 기본 설정 — {v1}", { v: bossOf(code)?.name || code, v1: unionSeason().label });
  buildBattle();
  syncBattleChrome();
  if (!dlg.open) dlg.showModal();
}

/** 버스트 사이클 시트. 블록(`#bt-cycle`)은 **하나뿐이고 자리만 옮겨 다닌다** — 복제하면
 *  입력칸이 두 벌이 되어 어느 것이 진짜인지 알 수 없게 된다(레이드 설정 패널과 같은 규칙). */
function openCycleSheet(row = null) {
  const dlg = $("#cycle-sheet"), host = $("#cycle-host"), blk = $("#bt-cycle");
  if (!dlg || !host || !blk) return;
  // 보스 기본값을 고치다 왔으면 끊는다 — 안 끊으면 `cycleNow()`가 그 상자를 가리킨다.
  bossCfgCode = null; museumCfgBoss = null;
  if (row !== null) uBattleRow = row;
  host.append(blk);
  // 시트에 담긴 것이 이 블록 하나뿐이라 **접히면 빈 창**이 된다(유저 지적). 늘 펼쳐 두고,
  // 접는 손잡이(summary)는 CSS가 감춘다 — 접을 방법 자체를 없앤다.
  blk.open = true;
  const t = $("#cycle-title");
  if (t) {
    t.textContent = modeNow() === "union"
      ? T("{v}번 줄 버스트 사이클", { v: uBattleRow + 1 })
      : T("{v}덱 버스트 사이클", { v: state.settings.deck + 1 });
  }
  buildBattle();
  syncCycleChrome();
  if (!dlg.open) dlg.showModal();
}

/** 사이클 블록을 제자리로. 솔로는 시트, 유니온은 줄의 레이드 설정 안이다. */
function homeCycleBlock() {
  const blk = $("#bt-cycle"), host = $("#cycle-host");
  if (blk && host && blk.parentElement !== host) host.append(blk);
}

/** 모달을 닫는다. 패널은 제자리(.fwrap)로 돌려보낸다 — 모달 안에 두고 오면
 *  솔로의 «레이드 설정»을 눌러도 아무것도 안 열린다. */
function closeRowBattle() {
  const bp = $("#btpanel"), dlg = $("#raid-sheet");
  const home = document.querySelector("#bt-toggle")?.closest(".fwrap");
  uBattleOpen = false;
  bossCfgCode = null;              // 보스 기본값을 고치던 중이었다면 여기서 끝난다
  const wasMuseumCfg = museumCfgBoss !== null;
  museumCfgBoss = null;
  if (bp && home) { home.append(bp); bp.hidden = true; }
  homeCycleBlock();
  if (dlg?.open) dlg.close();
  // 뮤지엄 기본값을 고치고 나왔으면 패널을 5덱 설정으로 되돌려 채운다 — 안 그러면 다음에
  // «레이드 설정»을 열었을 때 기본값 숫자가 그대로 보인다.
  if (wasMuseumCfg) {
    saveAll(); buildBattle(); renderMuseumBar();
    if ($("#boss-cfg-sheet")?.open) renderMuseumCfgList();   // 뒤에 열려 있는 시즌 시트의 숫자를 새로
  }
  else if (modeNow() === "museum") { saveAll(); buildBattle(); renderAll(); }
  renderBench();
}

/** 레이드 설정이 기본값에서 벗어났나 — 줄 버튼에 표시를 달 때 쓴다. */
function battleChanged(b) {
  if (!b) return false;
  for (const k of Object.keys(BATTLE_DEFAULT)) {
    // 없는 열쇠는 기본값 — 이유는 `battleSig()` 주석과 같다.
    const c = BATTLE_DEFAULT[k], a = k in b ? b[k] : c;
    if (Array.isArray(c)) { if ((a || []).length !== c.length) return true; continue; }
    if (c && typeof c === "object") {
      for (const w of Object.keys(c)) if ((a || {})[w] !== c[w]) return true;
      continue;
    }
    if (a !== c) return true;
  }
  return false;
}

/** 방금 놓은 것을 «쾅» 하고 알린다. renderBench()가 DOM을 통째로 새로 그리므로
 *  **다시 그린 뒤**에 불러야 한다 — 먼저 붙이면 그 노드가 사라진다.
 *  애니메이션은 CSS가 들고, 여기서는 색과 시작 신호만 준다. */
/** 화면 연출을 켤지. **솔로·유니온이 같은 값을 본다** — 끄고 켜는 자리가 둘인데
 *  값이 따로 놀면 «껐는데 저쪽은 튄다»가 된다. 끄면 연출을 **아예 시작하지 않고**
 *  결과만 조용히 바꾼다(중간에 멈추면 자국이 남는다). */
const fxOn = () => state.settings.fx !== false;

/** 도로롱 색은 솔로 전용이지만 선택값은 모드를 오가도 남는다. 유니온에서는 CSS
 * 선택자와 renderMode()가 색과 버튼을 함께 내리고, 솔로로 돌아오면 저장값을 복원한다. */
const dororongOn = () => state.settings.dororong === true;

let dororongPlayTimer = 0;

const dororongMotionReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

function dororongCanPlay() {
  return dororongOn() && fxOn()
    && !document.hidden && !dororongMotionReduced();
}

function stopDororongPlayground() {
  window.clearTimeout(dororongPlayTimer);
  dororongPlayTimer = 0;
  $("#dororong-playground")?.replaceChildren();
}

const DORORONG_EDGES = ["left", "right", "top", "bottom"];
const DORORONG_OPPOSITE_EDGE = {
  left: "right", right: "left", top: "bottom", bottom: "top",
};
const doroRand = (min, max) => min + Math.random() * (max - min);
const doroInt = (min, max) => Math.floor(doroRand(min, max + 1));
const doroClamp = (min, value, max) => Math.min(max, Math.max(min, value));

function dororongEdgePoint(edge, width, height, padding) {
  // 모서리에 몰리지 않도록 각 변의 12~88% 구간에서만 출발·도착한다.
  const along = doroRand(0.12, 0.88);
  if (edge === "left") return { x: -padding, y: height * along };
  if (edge === "right") return { x: width + padding, y: height * along };
  if (edge === "top") return { x: width * along, y: -padding };
  return { x: width * along, y: height + padding };
}

function dororongRoute(width, height, padding) {
  const minDistance = Math.hypot(width, height) * 0.55;
  let candidate;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const startEdge = DORORONG_EDGES[doroInt(0, DORORONG_EDGES.length - 1)];
    const endEdges = DORORONG_EDGES.filter((edge) => edge !== startEdge);
    const endEdge = endEdges[doroInt(0, endEdges.length - 1)];
    const start = dororongEdgePoint(startEdge, width, height, padding);
    const end = dororongEdgePoint(endEdge, width, height, padding);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    candidate = { startEdge, endEdge, start, end, distance };
    if (distance >= minDistance) return candidate;
  }

  // 작은 화면의 짧은 인접 변 조합이 계속 나오면 마지막에는 반대편 변으로 보낸다.
  const startEdge = candidate?.startEdge || DORORONG_EDGES[doroInt(0, 3)];
  const endEdge = DORORONG_OPPOSITE_EDGE[startEdge];
  const start = dororongEdgePoint(startEdge, width, height, padding);
  const end = dororongEdgePoint(endEdge, width, height, padding);
  return { startEdge, endEdge, start, end, distance: Math.hypot(end.x - start.x, end.y - start.y) };
}

function dororongCount(width) {
  if (width < 375) return doroInt(2, 3);
  if (width < 640) return doroInt(3, 4);
  return doroInt(4, 5);
}

function dororongSizes(width, count) {
  // 작은 도로롱과 화면을 크게 가로지르는 도로롱이 함께 나오게 폭을 크게 벌린다.
  // 모바일에서는 화면을 완전히 덮지 않게 막고, 데스크톱은 기존 최대(104px)의
  // 세 배가 넘는 360px까지 허용한다.
  const [min, max] = width < 375
    ? [24, Math.min(156, width * 0.48)]
    : width < 640
      ? [22, Math.min(220, width * 0.46)]
      : [20, Math.min(360, width * 0.3)];
  const sizes = Array.from({ length: count }, (_, index) => {
    let ratio;
    if (index === 0) ratio = doroRand(0, 0.12);
    else if (index === count - 1) ratio = doroRand(0.88, 1);
    else ratio = doroClamp(0.18, index / (count - 1) + doroRand(-0.08, 0.08), 0.82);
    return min + (max - min) * ratio;
  });
  // 작은→큰 순서가 출발 순서로 드러나지 않도록 Fisher–Yates로 한 번 섞는다.
  for (let index = sizes.length - 1; index > 0; index -= 1) {
    const swap = doroInt(0, index);
    [sizes[index], sizes[swap]] = [sizes[swap], sizes[index]];
  }
  return sizes;
}

function dororongDelays(count) {
  let cursor = doroRand(0.4, 1.8);
  return Array.from({ length: count }, (_, index) => {
    if (index > 0) cursor += doroRand(1.1, 3.3);
    return cursor;
  });
}

const DORORONG_THROW = {
  // 마지막 0.22초의 손 움직임만 본다. 짧은 플릭은 살리고, 잡은 채 멈췄다가
  // 놓은 것은 던지기로 오인하지 않는 범위다.
  sampleMs: 220,
  minSpeed: 0.06,
  stopSpeed: 0.045,
  maxCoastMs: 1250,
  maxEscapeMs: 3200,
};

function dororongOutsideViewport(node, margin = 64) {
  const rect = node.getBoundingClientRect();
  return rect.right < -margin || rect.left > window.innerWidth + margin
    || rect.bottom < -margin || rect.top > window.innerHeight + margin;
}

/** 원래 경로는 runner가 계속 들고 있고, grab 층만 손의 이동량만큼 옮긴다.
 *  놓은 뒤에도 그 오프셋을 유지하면 던져진 자리에서 멈춰 둔 경로를 그대로 이어 간다. */
function enableDororongThrow(runner, grab) {
  let pointerId = null;
  let originX = 0;
  let originY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let rotation = 0;
  let samples = [];
  let frame = 0;
  let returnTimer = 0;

  const place = () => {
    grab.style.transform = `translate3d(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px, 0) rotate(${rotation.toFixed(1)}deg)`;
  };
  const resumeFromHere = () => {
    if (!runner.isConnected) return;
    runner.classList.remove("is-grabbed", "is-tossed", "is-coasting", "is-escaping", "is-interacting");
    place();
  };
  const vanish = () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(returnTimer);
    runner.remove();
  };
  const release = (event, cancelled = false) => {
    if (event.pointerId !== pointerId) return;
    const now = performance.now();
    if (!cancelled) samples.push({ x: event.clientX, y: event.clientY, t: now });
    try { runner.releasePointerCapture(pointerId); } catch { /* 이미 놓인 포인터 */ }
    pointerId = null;
    runner.classList.remove("is-grabbed");

    if (dororongOutsideViewport(grab)) { vanish(); return; }
    const recent = samples.filter((sample) => now - sample.t <= DORORONG_THROW.sampleMs);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const elapsed = first && last ? Math.max(16, last.t - first.t) : 0;
    let vx = cancelled || !elapsed ? 0 : (last.x - first.x) / elapsed;
    let vy = cancelled || !elapsed ? 0 : (last.y - first.y) / elapsed;
    const speed = Math.hypot(vx, vy);
    if (speed < DORORONG_THROW.minSpeed) { resumeFromHere(); return; }

    const escapeSpeed = doroClamp(0.9, Math.min(window.innerWidth, window.innerHeight) / 900, 1.45);
    const escaping = speed >= escapeSpeed;
    runner.classList.add("is-tossed", escaping ? "is-escaping" : "is-coasting");
    const startedAt = now;
    let previous = now;
    const coast = (time) => {
      if (!runner.isConnected) return;
      if (!dororongCanPlay()) { vanish(); return; }
      const dt = doroClamp(4, time - previous, 34);
      previous = time;
      offsetX += vx * dt;
      offsetY += vy * dt;
      rotation += doroClamp(-14, vx * dt * 0.32, 14);
      if (escaping) {
        vy += 0.00072 * dt;
        const drag = Math.pow(0.996, dt / 16.67);
        vx *= drag;
        vy *= drag;
      } else {
        const drag = Math.pow(0.91, dt / 16.67);
        vx *= drag;
        vy *= drag;
      }
      place();
      const lived = time - startedAt;
      if (dororongOutsideViewport(grab)) { vanish(); return; }
      if (escaping) {
        if (lived >= DORORONG_THROW.maxEscapeMs) { vanish(); return; }
      } else if (Math.hypot(vx, vy) <= DORORONG_THROW.stopSpeed
        || lived >= DORORONG_THROW.maxCoastMs) {
        // 관성이 끝난 자리를 잠깐 보여 준 뒤, 그 위치에서 멈춰 둔 경로를 이어 간다.
        returnTimer = window.setTimeout(resumeFromHere, 110);
        return;
      }
      frame = window.requestAnimationFrame(coast);
    };
    frame = window.requestAnimationFrame(coast);
  };

  runner.addEventListener("pointerdown", (event) => {
    if (pointerId !== null || runner.classList.contains("is-interacting")
      || (event.pointerType === "mouse" && event.button !== 0)) return;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(returnTimer);
    pointerId = event.pointerId;
    originX = event.clientX - offsetX;
    originY = event.clientY - offsetY;
    samples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
    runner.classList.add("is-interacting", "is-grabbed");
    runner.setPointerCapture(pointerId);
    event.preventDefault();
  });
  runner.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    offsetX = event.clientX - originX;
    offsetY = event.clientY - originY;
    rotation = doroClamp(-18, offsetX * 0.045, 18);
    const now = performance.now();
    samples.push({ x: event.clientX, y: event.clientY, t: now });
    samples = samples.filter((sample) => now - sample.t <= DORORONG_THROW.sampleMs * 1.5);
    place();
    event.preventDefault();
  });
  runner.addEventListener("pointerup", (event) => release(event));
  runner.addEventListener("pointercancel", (event) => release(event, true));
}

/** 경로 목록은 없다. 각 도로롱이 화면의 임의 변에서 출발해 다른 변의 임의 지점으로 향하고,
 * 진행 벡터에 수직인 두 중간점을 조금씩 비틀어 거의 직선인 완만한 곡선을 만든다. */
function runDororongWave() {
  const host = $("#dororong-playground");
  const source = $("#dororong-toggle img");
  if (!host || !source || !dororongCanPlay()) {
    stopDororongPlayground();
    return;
  }
  if (host.querySelector(".dororong-runner.is-interacting")) {
    dororongPlayTimer = window.setTimeout(runDororongWave, 700);
    return;
  }
  host.replaceChildren();
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const offsetX = window.scrollX;
  const offsetY = window.scrollY;
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    offsetY + height,
  );
  host.style.setProperty("--doro-canvas-height", `${documentHeight}px`);
  const count = dororongCount(width);
  const sizes = dororongSizes(width, count);
  const delays = dororongDelays(count);
  const spinnerIndex = Math.random() < 0.5 ? doroInt(0, count - 1) : -1;
  let longestLifetime = 0;
  for (let index = 0; index < count; index += 1) {
    const size = sizes[index];
    const route = dororongRoute(width, height, size * 0.72 + 12);
    // 생성 순간의 뷰포트 좌표를 문서 좌표로 고정한다. 이후 스크롤해도 따라오지 않는다.
    route.start.x += offsetX;
    route.start.y += offsetY;
    route.end.x += offsetX;
    route.end.y += offsetY;
    const dx = route.end.x - route.start.x;
    const dy = route.end.y - route.start.y;
    const normalX = -dy / route.distance;
    const normalY = dx / route.distance;
    const bendSign = Math.random() < 0.5 ? -1 : 1;
    const bend = doroClamp(18, route.distance * doroRand(0.035, 0.075), 72) * bendSign;
    const curve1 = {
      x: route.start.x + dx * 0.34 + normalX * bend,
      y: route.start.y + dy * 0.34 + normalY * bend,
    };
    const curve2 = {
      x: route.start.x + dx * 0.68 - normalX * bend * 0.55,
      y: route.start.y + dy * 0.68 - normalY * bend * 0.55,
    };
    const duration = doroClamp(7.5, route.distance / doroRand(92, 150), 16);
    const delay = delays[index];
    const travelAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const face = dx >= 0 ? -1 : 1;
    const relativeAngle = dx >= 0 ? travelAngle : travelAngle - 180;
    const normalizedAngle = ((relativeAngle + 180) % 360 + 360) % 360 - 180;
    const tilt = normalizedAngle;
    const spinDuration = doroRand(0.85, 1.45);

    const runner = document.createElement("span");
    runner.className = "dororong-runner";
    const spinning = index === spinnerIndex;
    if (spinning) runner.classList.add("dororong-runner--spinner");
    runner.dataset.startEdge = route.startEdge;
    runner.dataset.endEdge = route.endEdge;
    const variables = {
      "--doro-start-x": `${route.start.x.toFixed(1)}px`,
      "--doro-start-y": `${route.start.y.toFixed(1)}px`,
      "--doro-curve-1-x": `${curve1.x.toFixed(1)}px`,
      "--doro-curve-1-y": `${curve1.y.toFixed(1)}px`,
      "--doro-curve-2-x": `${curve2.x.toFixed(1)}px`,
      "--doro-curve-2-y": `${curve2.y.toFixed(1)}px`,
      "--doro-end-x": `${route.end.x.toFixed(1)}px`,
      "--doro-end-y": `${route.end.y.toFixed(1)}px`,
      "--doro-size": `${size.toFixed(1)}px`,
      "--doro-duration": `${duration.toFixed(2)}s`,
      "--doro-delay": `${delay.toFixed(2)}s`,
      "--doro-alpha": doroRand(0.64, 0.92).toFixed(2),
      "--doro-face": String(face),
      "--doro-tilt": `${tilt.toFixed(1)}deg`,
      "--doro-hop-count": String(Math.ceil(duration / 0.44) + 2),
      "--doro-spin-duration": `${spinDuration.toFixed(2)}s`,
      "--doro-spin-count": String(Math.ceil(duration / spinDuration) + 1),
      "--doro-spin-turn": Math.random() < 0.5 ? "-1turn" : "1turn",
    };
    for (const [name, value] of Object.entries(variables)) runner.style.setProperty(name, value);

    const grab = document.createElement("span");
    grab.className = "dororong-runner__grab";
    const sprite = document.createElement("span");
    sprite.className = "dororong-runner__sprite";
    const image = source.cloneNode(false);
    image.removeAttribute("id");
    image.alt = "";
    image.draggable = false;
    sprite.append(image);
    grab.append(sprite);
    runner.append(grab);
    enableDororongThrow(runner, grab);
    runner.addEventListener("animationend", (event) => {
      if (event.target === runner) runner.remove();
    });
    host.append(runner);
    longestLifetime = Math.max(longestLifetime, duration + delay);
  }
  // 가장 느린 도로롱까지 지나간 뒤 4~9초는 화면을 조용히 비운다.
  dororongPlayTimer = window.setTimeout(
    runDororongWave,
    longestLifetime * 1000 + doroRand(4000, 9000),
  );
}

function syncDororongPlayground({ immediate = true } = {}) {
  stopDororongPlayground();
  if (!dororongCanPlay()) return;
  dororongPlayTimer = window.setTimeout(runDororongWave, immediate ? 80 : 1200);
}

function applyDororongTheme() {
  const on = dororongOn();
  document.documentElement.dataset.dororong = on ? "on" : "off";
  const b = $("#dororong-toggle");
  if (!b) return;
  b.setAttribute("aria-pressed", String(on));
  b.dataset.state = on ? "success" : "default";
  const label = on ? T("도로롱 테마 끄기") : T("도로롱 테마 켜기");
  b.title = label;
  b.setAttribute("aria-label", label);
  syncDororongPlayground();
}

/** 끈 상태를 문서에 새긴다 — CSS 쪽 연출은 `:root[data-fx="off"]`가 통째로 멎힌다. */
function applyFx() {
  document.documentElement.dataset.fx = fxOn() ? "on" : "off";
  const b = $("#fx-toggle");
  if (!b) return;
  b.setAttribute("aria-pressed", String(!fxOn()));
  b.textContent = fxOn() ? "✦" : "✧";
  b.title = fxOn() ? T("무거운 애니메이션 효과 끄기") : T("무거운 애니메이션 효과 켜기");
  syncDororongPlayground();
}

function replay(node, cls) {
  if (!node || !fxOn()) return;
  node.classList.remove(cls);
  void node.offsetWidth;              // 리플로우 — 같은 자리에 연달아 놓아도 다시 튄다
  node.classList.add(cls);
  node.addEventListener("animationend", () => node.classList.remove(cls), { once: true });
}

/** 보스를 꽂은 순간 — 그 줄을 오른쪽으로 훑고, 아래 로스터가 **약점 속성색**으로
 *  잠깐 물든다. 「이 줄엔 이 속성을 넣어라」가 글자가 아니라 몸으로 읽힌다. */
function slamRow(i, code) {
  if (!fxOn()) return;
  const want = COUNTER_OF[code];
  const c = CODE_VAR[want] || CODE_VAR[code] || "var(--color-accent)";
  const row = $("#bench-rows")?.children[i];
  if (row) { row.style.setProperty("--slam-c", c); replay(row, "slam"); }
  // 아래 목록은 **통째로 물들이지 않는다.** 그 보스를 치는 속성 카드만 왼쪽에서
  // 오른쪽으로 차례로 불이 들어온다 — 「이 중에 골라라」가 화면에서 바로 짚인다.
  const roster = document.querySelector(".roster");
  if (roster) { roster.style.setProperty("--slam-c", c); replay(roster, "wash"); }
  if (!want) return;
  // 먼저 **지난 속성을 끈다.** 불(.lit)만 끄고 움직임(.beat)을 안 끄면, 보스를
  // 바꿨는데 이전 속성 카드가 남은 횟수만큼 계속 뛰어 «어느 쪽이지»가 된다.
  for (const on of document.querySelectorAll("#pool .nk.lit, #pool .nk.beat")) {
    on.classList.remove("lit", "beat");
  }
  litElem = want;                       // 다음 보스를 꽂을 때까지 켜 둔다
  const hits = document.querySelectorAll(`#pool .nk[data-elem="${want}"]`);
  hits.forEach((card, k) => {
    card.classList.add("lit");
    // 화면 왼쪽에 있는 것부터 켜져야 «훑고 지나간다»가 된다. 목록 순서가 곧
    // 왼→오→다음 줄이라 인덱스만으로 파도가 만들어진다. 너무 늘어지지 않게 자른다.
    card.style.setProperty("--hit-d", `${Math.min(k * 26, 900)}ms`);
    // 가만히 빛나기만 하면 목록에 묻힌다 — **5초쯤 계속 튀고 번쩍인다.**
    // 파도(지연)로 시작해 저마다 몇 번 뛰고 멎는다. 멎은 뒤엔 .lit가 남아
    // 다음 보스를 꽂을 때까지 «여기가 그 속성»을 계속 말한다.
    replay(card, "beat");
  });
}

/** 니케를 칸에 놓은 순간 — 그 칸만 짧게 «쾅». */
function slamSlot(deckIdx, idx) {
  if (!fxOn()) return;
  const row = $("#bench-rows")?.children[deckIdx];
  // 칸이 아니라 **칸을 감싼 상자**에 건다 — .u-slot은 overflow:hidden이라 충격파가
  // 칸 밖으로 못 퍼진다. 상자에 걸면 파장이 이웃 칸 위로 번져 «쾅»이 산다.
  const cell = row?.querySelectorAll(".u-cell")[idx];
  replay(cell, "slam");
  replay(row, "nudge");
  puff(cell);
}

/** 떨어진 자리에서 이는 먼지. 입자 수·방향이 매번 달라야 «찍어낸 효과»로 안 보인다.
 *  DOM으로 만들고 끝나면 지운다 — 애니메이션이 끝난 노드를 남겨 두면 줄마다 쌓인다. */
function puff(cell) {
  if (!fxOn()) return;
  if (!cell || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  cell.querySelector(".dust")?.remove();
  const box = el("div", "dust");
  for (let k = 0; k < 9; k++) {
    const bit = el("i");
    const dir = k < 5 ? -1 : 1;                       // 좌우로 갈라 퍼진다
    const x = dir * (14 + Math.random() * 46);
    const y = -(6 + Math.random() * 26);
    bit.style.setProperty("--dx", `${x.toFixed(1)}px`);
    bit.style.setProperty("--dy", `${y.toFixed(1)}px`);
    bit.style.setProperty("--sz", `${(3 + Math.random() * 5).toFixed(1)}px`);
    bit.style.setProperty("--d", `${(Math.random() * 90).toFixed(0)}ms`);
    box.append(bit);
  }
  cell.append(box);
  setTimeout(() => box.remove(), 900);
}

/** 두 줄의 **보스만** 맞바꾼다(편성은 제자리). 줄에 꽂힌 보스를 끌어 옮길 때 쓴다. */
function uSwapBoss(i, j) {
  if (i === j || i < 0 || j < 0 || i >= UNION_DECKS || j >= UNION_DECKS) return;
  uSnap(T("{v}·{v1}번 줄 보스 맞바꾸기", { v: i + 1, v1: j + 1 }));
  const a = uDeck(i), b = uDeck(j);
  const t = a.weak; a.weak = b.weak; b.weak = t;
  const pk = seasonPicks();
  pk[i] = a.weak; pk[j] = b.weak;     // 기억도 함께 맞바꾼다
  bossPick = null;
  saveAll();
  renderBench();
  slamRow(j, b.weak);
}

/** 줄에 보스를 꽂는다. **중복을 허용한다** — 같은 보스를 여러 덱으로 쳐도 되고
 *  (횟수만 쓴다), 남의 줄 것을 뺏어 오면 그 줄이 빈 채로 튕겨 다닌다.
 *  줄끼리 자리를 바꾸는 것은 보스 카드를 끌었을 때(uSwapBoss)만이다. */
function uSetBoss(deckIdx, code) {
  // 드롭 짐은 **아무 문자열이나 올 수 있다.** 브라우저 기본 이미지 끌기가 끼어들면
  // 이미지 주소가 그대로 실려 오고, 그걸 그냥 넣으면 보스 코드 자리에 URL이 앉아
  // 카드 이름으로 튀어나온다(실측). 아는 다섯 속성만 받는다.
  if (!UNION_CODES.includes(code)) return;
  uSnap(T("{v}번 줄 보스 바꾸기", { v: deckIdx + 1 }));
  const d0 = uDeck(deckIdx);
  d0.weak = code;
  // **회차 기본값을 부어 준다.** 방어력·코어·구간은 보스가 정해 놓은 값이라, 보스를
  // 바꿀 때마다 손으로 다시 넣게 하면 그게 일이다. 줄에서 고친 것은 그 줄에만 남는다.
  const dft = (U().bossDefaults || {})[unionSeason().id]?.[code];
  if (dft) pourBossDefault(d0, dft);
  seasonPicks()[deckIdx] = code;      // 이 회차에 이렇게 골랐다고 기억해 둔다
  bossPick = null;
  saveAll();
  renderBench();
  slamRow(deckIdx, code);
}

/** 한 줄의 속성 셈. 보스를 안 골랐으면 null(따질 것이 없다).
 *
 *  경고 기준은 «우월이 모자란가»가 아니라 **«넣은 것 중 틀린 쪽이 절반을 넘었나»**다
 *  (3명 넣었으면 2명, 5명 다 넣었으면 3명부터). 빈 줄과 반쯤 짠 줄이 저절로 빠진다 —
 *  한 명 넣자마자 붉어지면 시작하기도 전에 셋 다 경고가 뜨고, 그러면 경고가 뜻을
 *  잃는다. 넣은 것의 절반을 넘겨 엉뚱하면 그때는 «이 줄은 이 보스용이 아니다»가 사실이다. */
/** 니케가 «우월»로 치는 속성 전부. 인게임에서 두 속성 판정을 받는 니케가 있다 —
 *  배지는 본래 속성 그대로 두고, **검색·필터·약점 판정**에서만 둘 다로 친다.
 *    라피 : 레드 후드 — 작열 + 철갑 (상시)
 *    슈가 — 철갑 + 수냉, **애장품을 꼈을 때만** (계정에 애장품 단계가 있으면) */
function elementsOf(rec) {
  if (!rec) return [];
  const out = rec.element ? [rec.element] : [];
  if (rec.name === "라피 : 레드 후드" && !out.includes("철갑")) out.push("철갑");
  if (rec.name === "슈가" && hasFavItem(rec.name) && !out.includes("수냉")) out.push("수냉");
  return out;
}

function counterCount(d) {
  const want = COUNTER_OF[uWeak(d)];
  if (!want) return null;
  const names = d.names.filter(Boolean);
  let n = 0, wrong = 0, main = false;
  for (const name of names) {
    if (elementsOf(byName.get(name)).includes(want)) {
      n += 1;
      // **3버에 우월이 서 있나.** 우월 속성 보정은 그 니케가 넣는 대미지에 붙는데,
      // 유니온 편성의 대미지는 3버(=메인 딜러)에 몰린다. 서포터 셋이 엉뚱한 속성인
      // 것과 딜러가 엉뚱한 것은 같은 일이 아니다 — 앞은 흔한 정석이고 뒤는 사고다.
      // «A»도 3버를 메울 수 있으므로 같이 친다.
      const st = burstStageIn(name, names);
      if (st === "3" || st === "A") main = true;
    } else wrong += 1;
  }
  return { want, n, wrong, main, ok: n >= UNION_COUNTER_MIN, bad: wrong * 2 > n + wrong };
}

/** 니케 하나의 개별 설정(큐브·레벨·컨트롤)이 들어갈 덱. 솔로는 «지금 고른 덱»
 *  하나뿐이지만 유니온은 세 줄 중 **그 니케가 들어 있는 줄**이다. 이걸 안 갈라
 *  두면 유니온에서 건 컨트롤이 솔로 덱에 쓰인다(실측). */
function ctrlDeck(name) {
  if (modeNow() !== "union") return deckOf(state.settings.deck);
  for (let i = 0; i < UNION_DECKS; i++) if (uDeck(i).names.includes(name)) return uDeck(i);
  return uDeck(0);
}

/** 지금 보고 있는 편성 칸을 다시 그린다 — 모드마다 그리는 화면이 다르다. */
const refreshSlots = () => (modeNow() === "union" ? renderBench() : renderSlots());

/** 컨트롤 패널이 지금 펼쳐 놓은 니케. 유니온은 워크벤치가 따로 기억한다. */
const ctrlName = () => (modeNow() === "union" ? uCtrlOpen : ctrlOpen);

/** 프리셋·기록도 모드별로 나눠 든다 — 5덱짜리 솔로 프리셋을 3줄 유니온에 끼우면
 *  뜻이 어긋난다. 목록만 갈라 두면 화면은 그대로 쓰면서 서로 섞이지 않는다. */
const presetsNow = () => (modeNow() === "union" ? (U().presets ||= []) : state.presets);
const recordsNow = () => (modeNow() === "union" ? (U().records ||= []) : state.records);

/** 프리셋·기록 목록 통째 쓰기 (필터·자르기 결과를 되돌려 넣을 때). */
function setPresets(v) { if (modeNow() === "union") U().presets = v; else state.presets = v; }
/** 프리셋 폴더 — 프리셋과 **같은 칸에** 산다(솔로·유니온이 따로). 유니온 폴더가
 *  솔로 목록에 끼면 «내가 안 만든 폴더»가 보인다. */
const foldersNow = () => (modeNow() === "union" ? (U().presetFolders ||= [])
                                               : (state.presetFolders ||= []));
const recFoldersNow = () => (modeNow() === "union" ? (U().recordFolders ||= [])
                                                  : (state.recordFolders ||= []));
function setRecFolders(v) {
  if (modeNow() === "union") U().recordFolders = v; else state.recordFolders = v;
}
function setRecords(v) { if (modeNow() === "union") U().records = v; else state.records = v; }

/** 지금 화면이 쓰는 전투 조건 상자. 솔로는 state.battle, 유니온은 state.union.battle. */
// 레이드 설정 패널이 지금 **어느 줄**을 보고 있나. 유니온은 설정이 세 벌이라
// 패널 하나를 줄마다 갈아 끼워 쓴다(복제하면 입력칸이 세 벌이 되어 상태가 어긋난다).
let uBattleRow = 0;
// 패널이 지금 펼쳐져 있나. DOM의 hidden만 보고 판단하면, 줄을 다시 그리는 사이
// 패널이 잠시 자리를 비켜 있어 «닫힌 것»으로 오해한다.
let uBattleOpen = false;

/** 지금 «보스 기본값»을 고치는 중인 속성. 켜져 있으면 레이드 설정 패널이 줄이 아니라
 *  **그 회차 그 보스의 기본값**을 고친다 — 패널은 한 벌뿐이라 대상만 갈아 끼운다. */
let bossCfgCode = null;

/** 회차별 보스 기본값 — `{ 회차id: { 속성: 설정 } }`.
 *
 *  방어력·코어·구간처럼 **보스가 정해 놓은 값**은 세 줄이 각자 들고 있을 이유가 없다.
 *  줄 설정(`d.battle`)은 «내가 이 줄을 어떻게 칠까»이고, 여기는 «그 보스가 원래 어떤가»다.
 *  그래서 줄에 보스를 꽂으면 여기서 값을 부어 주고, 그 뒤 줄에서 고친 것은 줄에만 남는다. */
function bossDefaults(sid = unionSeason().id) {
  const all = (U().bossDefaults ||= {});
  return (all[sid] ||= {});
}
/** 보스 기본값을 줄에 붓는다 — **사이클은 줄 것이라 그대로 둔다.**
 *
 *  보스 기본값 상자에는 CYCLE_KEYS가 없다(보스가 정할 값이 아니다). 그래서 통째로
 *  덮어쓰면 그 줄의 첫 버스트·손속도·재충전·실누적이 «없음»이 되어, 보스를 다시
 *  놓거나 회차 설정을 부을 때마다 조용히 초기화됐다. 보스가 정하는 값만 갈아 끼운다. */
function pourBossDefault(d, dft) {
  const keep = {};
  for (const k of CYCLE_KEYS) if (k in (d.battle || {})) keep[k] = d.battle[k];
  d.battle = { ...JSON.parse(JSON.stringify(dft)), ...keep };
}

/** 그 보스의 기본값 상자. 없으면 만들어 준다(BATTLE_DEFAULT 사본). */
function bossCfgOf(code, sid = unionSeason().id) {
  const box = bossDefaults(sid);
  if (!box[code]) {
    box[code] = JSON.parse(JSON.stringify(BATTLE_DEFAULT));
    // 사이클은 덱에 붙는 값이라 보스 기본값에 둘 것이 아니다(유저 결정 2026-08-28).
    for (const k of CYCLE_KEYS) delete box[code][k];
  }
  return box[code];
}

/** 지금 화면이 편집 중인 레이드 설정. 유니온은 **고른 줄**의 것이고,
 *  보스 기본값을 고치는 중이면 그 상자다. */
const battleNow = () => (bossCfgCode ? bossCfgOf(bossCfgCode)
  : museumCfgBoss ? museumDefaultsOf(museumCfgBoss)
  : modeNow() === "union" ? uDeck(uBattleRow).battle : state.battle);

/** 그 덱이 **계산에 쓸** 레이드 설정. 화면이 무엇을 보고 있든 덱 자기 것을 쓴다. */
const battleFor = (d) => (modeNow() === "union" ? (d?.battle || battleNow()) : state.battle);

/** 그 덱이 상대할 **적 코드**. 유니온은 줄에 꽂힌 보스의 속성이 곧 적 코드다
 *  (솔로는 «데려갈 속성»을 고르므로 WEAK_TO_ENEMY로 뒤집어야 한다). */
const enemyCodeFor = (d) => (modeNow() === "union" ? uWeak(d) : enemyCode());
/** 전투 시간 쓰기 — 지금 모드의 상자에 넣는다. */
function setDuration(v) {
  if (modeNow() === "union") U().duration = v; else state.settings.duration = v;
}
/** 지금 화면이 쓰는 전투 시간. */
const durationNow = () => (modeNow() === "union" ? (U().duration ?? 180)
                                                : state.settings.duration);
const uDeck = (i) => (U().decks[i] ||= newDeck());

/** 지금 모드의 덱 수·덱. 계산과 결과 화면이 이 둘만 보면 모드를 안 따져도 된다. */
const deckCountNow = () => (modeNow() === "union" ? UNION_DECKS : DECK_COUNT);
const deckAt = (i) => (modeNow() === "union" ? uDeck(i) : deckOf(i));
const modeNow = () => (state.settings.mode === "museum" ? "museum"
  : state.settings.mode === "arena" ? "arena"
  : unionOn() && state.settings.mode === "union" ? "union" : "solo");

// ══ 뮤지엄 ══════════════════════════════════════════════════════════════════
// 솔로 레이드 뮤지엄 — 옛 솔로레이드 보스를 **지금 레벨**로 쳐서 «스텝»(웨이브 클리어 수,
// 상한 140)을 세는 판. 입장은 무제한, 한 번에 5덱. 보스마다 주간 버프(분배·코어·관통)가
// 걸리고 수치는 매주 바뀐다. 데이터는 `museum.json`(nikke-calc/data가 정본,
// notes/build_museum.py·museum_levels.py) — 보스·웨이브 HP·누적딜→보스 레벨·레벨별 스탯.
//
// **화면은 솔로와 같고 데이터는 통째로 따로다.** 솔로 코드는 state.decks·state.battle·
// state.settings.code 같은 자리를 직접 읽는다(수백 곳). 그 자리를 하나하나 모드로 갈라
// 놓는 대신 — 유니온을 붙일 때 그러다 솔로 설정을 여러 번 건드렸다 — 뮤지엄으로 들어올 때
// 그 자리에 **뮤지엄 상자의 것을 꽂고**, 나갈 때 솔로 것을 도로 꽂는다(museumEnter/
// museumLeave). 솔로 경로는 한 줄도 안 바뀌고, 뮤지엄에서 무엇을 만져도 솔로 데이터는
// stash에 그대로 있다. 저장(saveAll)은 «지금 어느 쪽이 꽂혀 있나»를 보고 솔로 키에는
// 언제나 솔로 것을, `_museum`에는 뮤지엄 것을 쓴다.
//
// 갈아 끼우는 자리: decks · battle · filter · pickFilter · presets · records · presetFolders ·
// recordFolders, 그리고 settings의 code · duration · deck · fastMode(배치모드 토글도 따로다).
// 계정(profileId)·즐겨찾기·연출 스위치는 계정·브라우저의 것이라 함께 쓴다. 결과 캐시
// (`results`)는 지문에 보스·주간 버프가 들어가므로(museumSig) 같은 상자를 써도 안 섞인다.
//
// 덱과 레이드 설정은 **보스마다** 따로 든다 — 스테이지마다 진행이 따로고 편성도 다르다.
// 보스를 바꾸면 그 보스의 5덱·설정을 꽂는다(museumMount). 프리셋·기록·필터는 뮤지엄
// 안에서 함께 쓴다.

let MUSEUM = null;                 // museum.json. 못 받으면 null — 화면이 «데이터 없음»을 말한다
const MUSEUM_SWAP_BOXES = ["decks", "battle", "filter", "pickFilter", "presets", "records",
                           "presetFolders", "recordFolders"];
const MUSEUM_SWAP_SETTINGS = ["code", "duration", "deck", "fastMode"];
let museumStash = null;            // 뮤지엄이 꽂혀 있는 동안 솔로 것을 여기 둔다. null = 솔로 꽂힘
const museumActive = () => museumStash !== null;

const museumStages = () => (MUSEUM?.stages ? Object.keys(MUSEUM.stages).sort() : []);
const museumStage = (id = M().boss) => MUSEUM?.stages?.[id] || null;
const museumMaxStep = () => MUSEUM?.nolimit_max_step || 140;
/** 시즌(홀) 목록 — `{n, stages}`. 데이터에 없으면 «시즌 1»에 전부 넣는다. */
function museumSeasons() {
  const list = Array.isArray(MUSEUM?.seasons) && MUSEUM.seasons.length ? MUSEUM.seasons
             : [{ n: 1, stages: museumStages() }];
  return list.map((s) => ({ n: s.n, id: s.n, label: T("HALL {n}", { n: s.n }), stages: s.stages || [] }));
}
/** 지금 고른 시즌. 안 골랐으면 배치한 보스가 든 시즌, 그것도 없으면 첫 시즌. */
function museumSeason() {
  const all = museumSeasons();
  const want = M().season;
  return all.find((s) => s.id === want)
      || all.find((s) => s.stages.includes(M().boss))
      || all[0];
}
/** 아군 적용 효과 — 보스마다 «상시»와 «주간» 두 겹(인게임 «아군 적용 효과» 창, 2026-08-29 유저 캡처).
 *  상시는 보스에 고정이고 주간은 돌아오는 주에만 걸린다(같은 종류, 더 큰 값). 둘 다 별개 버프로
 *  표시되므로 **합산**으로 넘긴다 — 틀리면 주간을 끄거나 값만 고치면 된다. `{kind, stat, value}`이고
 *  stat이 null이면 코어에 아직 그 스탯 통로가 없어 계산에는 안 들어간다(화면이 «계산 미지원»으로 말한다). */
const museumBuffAlways = (boss = M().boss) => museumStage(boss)?.buff_always || null;
const museumBuffWeekly = (boss = M().boss) => museumStage(boss)?.buff_weekly || null;
const museumWeeklyOn = (boss = M().boss) => !!M().weeklyOn?.[boss];
/** 코어에 넘길 버프 목록 — 상시 + (켰으면) 주간. 스탯 키가 있는 것만. */
function museumBuffList(boss = M().boss) {
  const out = [];
  const one = (b, value) => ({ stat: b.stat, value, ...(b.weapon ? { weapon: b.weapon } : {}) });
  const a = museumBuffAlways(boss);
  if (a?.stat && a.value) out.push(one(a, a.value));
  const w = museumBuffWeekly(boss);
  if (w?.stat && museumWeeklyOn(boss) && museumWeekly(boss)) out.push(one(w, museumWeekly(boss)));
  return out;
}
/** 보스 속성 → «데려갈 속성»(솔로의 약점 고르개와 같은 뜻). enemyCode()가 다시 뒤집는다. */
function museumCounterCode(boss) {
  const e = boss ? museumStage(boss)?.element : null;
  return e ? (COUNTER_OF[e] || "") : "";
}

/** 뮤지엄 상자. 없으면 만든다. */
function M() {
  const m = (state.museum ||= { v: 1 });
  // 보스는 **비어 있을 수 있다** — 유니온 줄처럼 빈 «보스» 칸에서 시작해 끌어다 붙인다(유저 지시
  // 2026-08-29). 모르는 보스 id(데이터에서 빠진 것)는 빈 칸으로 되돌린다.
  if (m.boss === undefined || (m.boss && MUSEUM && !museumStage(m.boss))) m.boss = null;
  m.weekly ||= {};                   // 주간 버프 수치 덮어쓰기(보스별) — 안 적으면 데이터 값
  m.weeklyOn ||= {};                 // 주간 버프를 켰나(보스별) — 돌아오는 주에만 켠다
  m.startStep ||= {};
  if (m.season === undefined) m.season = null;
  m.decks ||= {};
  m.battles ||= {};
  m.bossDefaults ||= {};             // 시즌 보스 기본값(왼쪽 카드 톱니) — 붙일 때 5덱 설정으로 복사된다
  m.presets ||= []; m.records ||= [];
  m.presetFolders ||= []; m.recordFolders ||= [];
  m.filter ||= defaultFilter(); m.pickFilter ||= defaultFilter();
  if (!m.code) m.code = museumCounterCode(m.boss);
  m.duration ||= 180;
  m.deck = Math.min(DECK_COUNT - 1, Math.max(0, Number(m.deck) || 0));
  m.fastMode = !!m.fastMode;
  if (m.level === undefined) m.level = null;
  return m;
}
/** 그 보스의 5덱. 모양을 여기서 맞춘다(옛 저장분의 큐브칸·이름 길이). */
const MUSEUM_NONE = "_none";        // 보스를 아직 안 붙인 채로 짠 덱·설정의 열쇠
function museumDecks(boss = M().boss || MUSEUM_NONE) {
  const arr = (M().decks[boss] ||= []);
  for (let i = 0; i < DECK_COUNT; i++) {
    arr[i] ||= newDeck();
    arr[i].cubes = Array.from({ length: SLOTS }, (_, k) => arr[i].cubes?.[k] ?? null);
    arr[i].names = (arr[i].names || []).slice(0, SLOTS);
    while (arr[i].names.length < SLOTS) arr[i].names.push(null);
  }
  return arr;
}
/** 그 보스의 레이드 설정. 처음이면 기본값에 **그 보스 레벨의 방어력**을 앉힌다. */
function museumBattle(boss = M().boss || MUSEUM_NONE) {
  const all = M().battles;
  if (!all[boss]) {
    all[boss] = { ...BATTLE_DEFAULT, optimal_range_weapons: [],
                  weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff }, phases: [] };
    const def = museumDefAt(museumBossLv(boss));
    if (def) all[boss].def = def;
  }
  // 나중에 생긴 키를 채우고, 사이클 키는 기본값으로 맞춘다 — 뮤지엄의 사이클은 덱(cycleOf)의 것이라
  // 이 상자의 사이클 값은 안 쓰이는데, 기본값이 바뀌면(0.25→0.1, 2026-08-29 머지) 옛 값이 «바뀜»으로 잡혔다.
  for (const k of Object.keys(BATTLE_DEFAULT)) {
    if (all[boss][k] === undefined || CYCLE_KEYS.includes(k)) {
      const v = BATTLE_DEFAULT[k];
      all[boss][k] = Array.isArray(v) ? [...v] : (v && typeof v === "object") ? { ...v } : v;
    }
  }
  return all[boss];
}

/** 시즌 보스 **기본값** — 유니온의 회차 보스 기본값과 같은 층이다. 왼쪽 카드의 톱니가 고치고,
 *  카드를 오른쪽에 붙일 때 5덱의 레이드 설정으로 **복사**된다(그 뒤 오른쪽에서 고친 것은 오른쪽에만
 *  남는다). 사이클은 덱 것이라 여기 안 든다. */
function museumDefaultsOf(id) {
  const all = M().bossDefaults;
  if (!all[id]) {
    const box = { ...BATTLE_DEFAULT, optimal_range_weapons: [],
                  weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff }, phases: [] };
    for (const k of CYCLE_KEYS) delete box[k];
    const def = museumDefAt(museumBossLv(id));
    if (def) box.def = def;
    all[id] = box;
  }
  return all[id];
}
/** 기본값을 고치는 중인 보스. 켜져 있으면 레이드 설정 패널이 5덱 설정이 아니라 **그 보스의
 *  기본값**을 고친다 — 유니온의 `bossCfgCode`와 같은 장치, 패널은 한 벌뿐이라 대상만 갈아 끼운다. */
let museumCfgBoss = null;
function openMuseumBossCfg(id) {
  const bp = $("#btpanel"), dlg = $("#raid-sheet"), host = $("#raid-host");
  if (!bp || !dlg || !host || !museumStage(id)) return;
  museumCfgBoss = id;
  bossCfgCode = null; uBattleOpen = false;
  host.append(bp);
  homeCycleBlock();
  bp.hidden = false;
  $("#raid-title").textContent =
    T("{v} 기본 설정 — {v1}", { v: T(museumStage(id).boss), v1: museumSeason().label });
  buildBattle();
  syncBattleChrome();
  if (!dlg.open) dlg.showModal();
}
/** 5덱의 레이드 설정을 모달로 연다 — 유니온 줄의 openRowBattle과 같은 장치. 사이클은 덱 것이라
 *  솔로처럼 «버스트 사이클» 시트에 남겨 둔다(homeCycleBlock). */
function openMuseumBattle() {
  const bp = $("#btpanel"), dlg = $("#raid-sheet"), host = $("#raid-host");
  if (!bp || !dlg || !host) return;
  museumCfgBoss = null; bossCfgCode = null; uBattleOpen = false;
  host.append(bp);
  homeCycleBlock();
  bp.hidden = false;
  const st = museumStage();
  $("#raid-title").textContent = T("레이드 설정 — {v}", { v: st ? T(st.boss) : T("보스 없음") });
  buildBattle();
  syncBattleChrome();
  if (!dlg.open) dlg.showModal();
}
/** 기본값을 배치한 보스의 5덱 설정에 부어 준다(오른쪽에서 고친 것은 사라진다 — 누를 때만). */
function pourMuseumBoss() {
  const id = M().boss;
  if (!id || !M().bossDefaults[id]) return 0;
  Object.assign(state.battle, JSON.parse(JSON.stringify(M().bossDefaults[id])));
  saveAll(); buildBattle(); renderAll();
  return 1;
}

/** 솔로 것을 stash에 두고 뮤지엄 것을 state 자리에 꽂는다. */
function museumEnter() {
  if (museumActive()) return;
  museumStash = { settings: {} };
  for (const k of MUSEUM_SWAP_BOXES) museumStash[k] = state[k];
  for (const k of MUSEUM_SWAP_SETTINGS) museumStash.settings[k] = state.settings[k];
  museumMount();
}
/** 뮤지엄 상자의 «지금 보스» 것을 state 자리에 꽂는다. 보스를 바꿀 때도 부른다. */
function museumMount() {
  const m = M();
  state.decks = museumDecks();
  state.battle = museumBattle();
  state.filter = m.filter; state.pickFilter = m.pickFilter;
  state.presets = m.presets; state.records = m.records;
  state.presetFolders = m.presetFolders; state.recordFolders = m.recordFolders;
  state.settings.code = m.code; state.settings.duration = m.duration;
  state.settings.deck = m.deck; state.settings.fastMode = m.fastMode;
  fastMode = m.fastMode;
}
/** state 자리에 꽂힌 것을 뮤지엄 상자에 도로 적는다 — 저장·보스 전환·나가기 전에.
 *  솔로 코드가 `state.decks = …`처럼 통째로 갈아 끼우는 곳(되돌리기·기본값)이 있어서,
 *  참조를 믿지 않고 매번 다시 적는다. */
function museumSyncBack() {
  if (!museumActive()) return;
  const m = M();
  m.decks[m.boss] = state.decks;
  m.battles[m.boss] = state.battle;
  m.filter = state.filter; m.pickFilter = state.pickFilter;
  m.presets = state.presets; m.records = state.records;
  m.presetFolders = state.presetFolders; m.recordFolders = state.recordFolders;
  m.code = state.settings.code; m.duration = state.settings.duration;
  m.deck = state.settings.deck; m.fastMode = !!state.settings.fastMode;
}
/** 솔로 것을 도로 꽂는다. */
function museumLeave() {
  if (!museumActive()) return;
  museumSyncBack();
  for (const k of MUSEUM_SWAP_BOXES) state[k] = museumStash[k];
  for (const k of MUSEUM_SWAP_SETTINGS) state.settings[k] = museumStash.settings[k];
  museumStash = null;
  fastMode = !!state.settings.fastMode;
}

/** 뮤지엄에서 쓸 니케 레벨 — 유니온과 같은 규칙(비우면 계정의 동기화 레벨). 뮤지엄이
 *  «지금 레벨로 친다»는 판이라 이 값이 곧 뜻이다. 유니온 레벨과 따로 든다. */
function museumLevel() {
  const v = Number(M().level);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  const sync = activeRec()?.fetched?._account?.synchro_level;
  return Number.isFinite(sync) && sync > 0 ? sync : null;
}
/** 지금 보스의 주간 버프 %. 안 적었으면 데이터 값(인게임 표시치). */
function museumWeekly(boss = M().boss) {
  const w = M().weekly[boss];
  const v = Number(w);
  return w !== null && w !== undefined && w !== "" && Number.isFinite(v) ? v
       : (museumBuffWeekly(boss)?.value ?? 0);
}
/** 결과 지문 조각 — 뮤지엄에서만 값이 있다. 실제로 넘기는 버프 목록이 곧 지문이다. */
const museumSig = () => (modeNow() === "museum"
  ? `m:${M().boss}:${JSON.stringify(museumBuffList())}` : "");

// ── 스텝 셈 ─────────────────────────────────────────────────────────────────
// 웹 실측(2026-08-29, 에펨코리아·아카·Vortex 공지 번역)으로 굳힌 규칙:
//   «블랙스미스는 입장 시 STEP1, 17억 넘기면 STEP2, 34억 넘기면 STEP3» — 데이터마인
//   `lv_change`(누적 딜 → 보스 레벨 밴드)의 문턱과 정확히 같다.
// 그러니 **스텝 = 덱 하나의 누적 딜이 넘은 문턱 수**다. 덱마다 STEP1에서 시작해 따로 세고
// 다섯 덱의 스텝을 더한다(공지: «덱마다 최대 20스텝, 합계 100» → 지금은 28·140). 보스 체력은
// 사실상 무한이고 문턱을 넘을 때마다 레벨(공·방)만 오른다. 검산: 울트라 «스텝당 14억»(1003
// 문턱 간격 14.5억), «스텝 38 = 500억 → 덱당 100억 → 표에서 7~8스텝 ×5».
// 웨이브 1~7 HP 표(`wave_hp`)는 스텝과 무관하다 — 처음엔 그걸로 셌다가 되돌렸다.

/** 그 보스의 스텝 문턱 표 — `[{step, cum_damage_from, boss_lv, _extrapolated?, _unverified?}]`. */
function museumBands(boss = M().boss) {
  const st = museumStage(boss);
  if (!st) return [];
  return MUSEUM.lv_change?.[String(st.modes?.NoLimit?.lv_change_group)] || [];
}
const museumDefAt = (lv) => (lv ? MUSEUM?.level_stats?.def?.[lv] ?? null : null);
const museumStepsPerDeck = () => MUSEUM?.steps_per_deck || 28;
/** 덱 하나의 딜 → {step, lv, next(다음 문턱까지 남은 딜|null), frac(이 밴드 안 진행), est(추정 구간)}. */
function museumStepOf(boss, dmg) {
  const bands = museumBands(boss);
  const cap = museumStepsPerDeck();
  const d = Math.max(0, Number(dmg) || 0);
  let cur = bands[0] || null, nxt = null;
  for (let i = 0; i < bands.length; i++) {
    if (d >= bands[i].cum_damage_from) { cur = bands[i]; nxt = bands[i + 1] || null; }
    else { nxt = bands[i]; break; }
  }
  if (!cur) return { step: 0, lv: null, next: null, frac: 0, est: false };
  const step = Math.min(cap, cur.step);
  const capped = step >= cap;
  const span = nxt ? nxt.cum_damage_from - cur.cum_damage_from : 0;
  return {
    step, lv: cur.boss_lv,
    next: capped || !nxt ? null : nxt.cum_damage_from - d,
    frac: capped || !span ? 1 : (d - cur.cum_damage_from) / span,
    est: !!(cur._extrapolated || cur._unverified || nxt?._extrapolated || nxt?._unverified),
  };
}
/** 덱이 치기 시작하는 보스 레벨(STEP 1 밴드). 방어력이 여기서 나온다. */
const museumBossLv = (boss = M().boss) => museumBands(boss)[0]?.boss_lv
  ?? museumStage(boss)?.modes?.NoLimit?.boss_start_lv ?? null;
/** 시작 레벨의 방어력을 레이드 설정에 앉힌다. 보스를 바꿀 때 부른다. */
function museumSyncDef() {
  const def = museumDefAt(museumBossLv());
  if (def && state.battle) state.battle.def = def;
}
/** 덱 딜 목록 → 덱별 스텝과 합산. 안 계산한 덱(null)은 0으로 센다. */
function museumWalk(boss, damages) {
  const rows = damages.map((d) => (d == null ? { step: 0, lv: null, next: null, frac: 0, est: false, none: true }
                                             : museumStepOf(boss, d)));
  const max = museumMaxStep();
  const step = Math.min(max, rows.reduce((a, r) => a + r.step, 0));
  return { rows, step, max, perDeck: museumStepsPerDeck(), capped: step >= max,
           est: rows.some((r) => r.est) };
}

/** 이 시즌 보스 셋의 레이드 설정(+주간 버프 %)을 통째로 — 유니온의 회차 보스 기본값과 같은 층. */
function museumSeasonPayload() {
  const se = museumSeason();
  const bosses = {}, weekly = {};
  for (const id of se.stages) {
    const b = M().bossDefaults[id];
    if (b) {
      bosses[id] = { ...b, phases: cleanPhases(b.phases) };
      for (const k of CYCLE_KEYS) delete bosses[id][k];   // 사이클은 덱의 것 — 남과 나눌 값이 아니다
    }
    if (M().weekly[id] !== undefined && M().weekly[id] !== null) weekly[id] = museumWeekly(id);
  }
  return { mode: "museum", kind: "season_bosses", season: se.id, duration: durationNow(), bosses, weekly };
}
/** 받은 시즌 보스 설정을 앉힌다. 배치한 보스의 것이면 화면(레이드 설정 패널)도 따라간다. */
function applyMuseumBosses(got) {
  if (!got || got.mode !== "museum" || got.kind !== "season_bosses" || !got.bosses) {
    return { err: T("HALL 보스 설정 코드가 아닙니다.") };
  }
  const dur = got.duration || durationNow();
  let n = 0;
  for (const [id, b] of Object.entries(got.bosses)) {
    if (!museumStage(id) || !b) continue;
    const box = museumDefaultsOf(id);
    Object.assign(box, {
      ...b,
      optimal_range_weapons: [...(b.optimal_range_weapons || [])],
      weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff, ...(b.weapon_coeff || {}) },
      phases: cleanPhases(b.phases),
    });
    partsToPhases(box, dur);
    for (const k of CYCLE_KEYS) delete box[k];
    n++;
  }
  for (const [id, w] of Object.entries(got.weekly || {})) {
    if (museumStage(id) && Number.isFinite(Number(w))) M().weekly[id] = Number(w);
  }
  if (!n) return { err: T("코드에 보스 설정이 없습니다.") };
  const se = museumSeasons().find((s) => s.id === got.season);
  if (se) M().season = se.id;
  saveAll(); buildBattle(); renderMuseumBar(); renderAll();
  return { n, season: se?.label || "" };
}
/** 시트 안 목록 — 이 시즌 보스 셋이 «정해졌나/비었나». 유니온의 회차 목록과 같은 모양. */
function renderMuseumCfgList() {
  const box = $("#boss-cfg-list");
  if (!box) return;
  box.textContent = "";
  for (const id of museumSeason().stages) {
    const st = museumStage(id);
    if (!st) continue;
    const b = M().bossDefaults[id];
    const line = el("div", "preset-line");
    line.append(el("span", "preset-boss", T(st.boss)));
    line.append(el("span", "prof-meta", b
      ? T("방어력 {v} · 구간 {n}개", { v: (b.def ?? 0).toLocaleString(), n: (b.phases || []).length })
        + (M().weekly[id] != null ? T(" · 주간 버프 {v}%", { v: museumWeekly(id) }) : "")
      : T("아직 안 정했습니다")));
    line.append(mkBtn(T("고치기"), "btn-ghost", () => openMuseumBossCfg(id)));
    box.append(line);
  }
}
/** 회차(유니온)·시즌(뮤지엄) 보스 설정 시트 — 한 벌을 모드가 나눠 쓴다. */
function openSeasonCfgSheet() {
  const museum = modeNow() === "museum";
  bossNote("", "", "#boss-cfg-msg");
  const inp = $("#boss-cfg-in");
  if (inp) inp.value = "";
  const t = $("#boss-cfg-t");
  if (t) t.textContent = museum ? T("{v} 보스 설정", { v: museumSeason().label })
                                : T("{v} 보스 설정", { v: unionSeason().label });
  const p1 = $("#boss-cfg-prose"), p2 = $("#boss-cfg-prose2"), pour = $("#boss-cfg-apply");
  if (p1) {
    p1.textContent = museum
      ? T("이 HALL 세 보스의 레이드 설정과 주간 버프 수치를 통째로 주고받습니다 — 방어력·코어·구간·적정거리·계수까지. 편성(니케)은 담기지 않습니다.")
      : T("이 회차 다섯 보스의 기본 설정을 통째로 주고받습니다 — 레이드 설정에서 정하는 값이 전부 들어갑니다. 오른쪽 세 줄에 내가 따로 고친 것은 담기지 않습니다.");
  }
  if (p2) {
    p2.textContent = museum ? T("받은 코드를 넣으면 이 HALL 세 보스의 설정이 바뀝니다.")
                            : T("받은 코드를 넣으면 이 회차 다섯 보스의 기본값이 바뀝니다.");
  }
  if (pour) {
    pour.hidden = false;
    pour.textContent = museum ? T("배치한 보스에 다시 적용") : T("세 줄에 다시 적용");
  }
  if (museum) renderMuseumCfgList(); else renderBossCfgList();
  $("#boss-cfg-sheet")?.showModal();
}

/** 보스를 바꾼다 — 지금 보스 것을 상자에 적고 그 보스의 5덱·설정을 꽂는다. */
function museumSetBoss(id) {
  id = id || null;
  if ((id && !museumStage(id)) || id === M().boss) return;
  museumSyncBack();
  // **보스 없이 짜 둔 니케는 붙이는 보스에게 넘어간다** — 유니온 줄에 니케를 먼저 넣고 보스를
  // 나중에 꽂는 손버릇과 같다. 그 보스가 이미 제 덱을 갖고 있으면(한 명이라도) 그쪽이 이긴다.
  if (id && !M().boss) {
    const loose = museumDecks(MUSEUM_NONE);
    const own = museumDecks(id);
    const has = (arr) => arr.some((d) => (d?.names || []).some(Boolean));
    if (has(loose) && !has(own)) {
      M().decks[id] = loose;
      M().decks[MUSEUM_NONE] = [];
      if (M().battles[MUSEUM_NONE] && !M().battles[id]) {
        M().battles[id] = M().battles[MUSEUM_NONE];
        delete M().battles[MUSEUM_NONE];
      }
    }
  }
  M().boss = id;
  M().code = museumCounterCode(id);
  // 기본값이 있으면 **부어 준다** — 유니온이 줄에 보스를 꽂을 때와 같다. 사이클은 덱 것이라
  // BATTLE_DEFAULT가 채우고, 그 뒤 오른쪽에서 고친 것은 오른쪽에만 남는다.
  if (id && M().bossDefaults[id]) {
    const prev = M().battles[id] || {};
    M().battles[id] = { ...BATTLE_DEFAULT, ...JSON.parse(JSON.stringify(M().bossDefaults[id])) };
    for (const k of CYCLE_KEYS) if (prev[k] !== undefined) M().battles[id][k] = prev[k];
  }
  museumMount();
  if (!(id && M().bossDefaults[id])) museumSyncDef();
  picked = null; ctrlOpen = null;
  const sel = $("#code");
  if (sel) sel.value = state.settings.code;
  syncCodeIco();
  saveAll(); buildBattle(); renderMode(); renderAll(); syncRoute();
}

/** 뮤지엄 보스 카드 — 유니온 카드(`bossCard`)와 같은 옷(.boss)을 입되 열쇠가 속성이 아니라
 *  **스테이지 id**다. 풀 카드는 끌 수 있고 누르면 바로 배치된다(터치에서도 같은 일).
 *  배치 자리 카드는 놓을 자리다. */
function museumBossCard(id, { pool = false } = {}) {
  const st = id ? museumStage(id) : null;
  const code = st?.element || null;
  const box = el("div", "boss" + (pool ? " boss-pick" : " boss-set") + (st ? "" : " empty"));
  box.style.setProperty("--code-c", CODE_VAR[code] || "var(--color-stage-line)");
  const art = el("div", "boss-art");
  if (st?.art) {
    const im = el("img", "boss-img");
    im.src = `image/boss/${st.art}.webp`;
    im.alt = "";
    im.loading = "lazy";
    im.onerror = () => { im.remove(); art.append(el("span", "boss-noart", T(st.boss))); };
    art.append(im);
  } else if (st) {
    art.append(el("span", "boss-noart", T(st.boss)));   // 그림이 아직 없는 랩처 — 이름으로
  } else {
    art.append(el("span", "u-plus", "+"));
  }
  box.append(art);
  const f = code && ELEMENT_ICON[code];
  if (f) {
    const badge = el("img", "boss-code");
    badge.src = `image/icon/${f}`;
    badge.alt = code;
    badge.title = T("{code} 보스", { code });
    box.append(badge);
  }
  const want = code && COUNTER_OF[code];
  const wf = want && ELEMENT_ICON[want];
  if (wf) {
    const wb = el("img", "boss-want");
    wb.src = `image/icon/${wf}`;
    wb.alt = want;
    wb.title = T("{code} 보스는 {want}에 약합니다", { code, want });
    box.append(wb);
  }
  // 데이터가 아직 없는 보스(홀 2·3) — 속성은 비공식, HP 표는 홀1 것을 빌렸다. 카드가 말한다.
  if (st?._unverified) {
    const q = el("i", "boss-unv", "?");
    q.title = T("이 보스의 스텝 문턱·시작 레벨·주간 버프 종류는 추정값입니다.");
    box.append(q);
  }
  box.append(el("span", "boss-name", st ? T(st.boss) : T("보스")));
  if (pool) {
    box.draggable = true;
    box.title = T("{v} — 오른쪽 자리로 끌어다 놓거나 누르면 배치됩니다", { v: st ? T(st.boss) : id });
    box.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", `mboss:${id}`);
      e.dataTransfer.effectAllowed = "copy";
      box.classList.add("dragging");
    });
    box.addEventListener("dragend", () => box.classList.remove("dragging"));
    box.onclick = () => museumSetBoss(id);
    if (id === M().boss) box.classList.add("armed");
    // 톱니 — **이 시즌 이 보스의 기본값**을 고친다(유니온의 «보스 기본값» 톱니와 같은 층).
    // 오른쪽에 붙일 때 이 값이 5덱 설정으로 복사된다. 끌기를 막지 않게 톱니에서 시작한 끌기는 삼킨다.
    const gear = el("button", "boss-gear", "⚙");
    gear.type = "button";
    gear.title = T("{v} 기본 설정", { v: st ? T(st.boss) : id });
    gear.draggable = false;
    gear.addEventListener("dragstart", (e) => e.preventDefault());
    gear.onclick = (e) => { e.stopPropagation(); openMuseumBossCfg(id); };
    box.append(gear);
  } else {
    box.title = st ? T("5덱이 치는 보스 — 왼쪽 카드를 끌어다 놓으면 바뀝니다") : T("왼쪽 카드를 끌어다 놓거나 누르세요");
    // 비우는 길 — 유니온 줄의 보스 칸과 같은 자리·같은 손버릇(✕).
    if (st) {
      const x = el("button", "slot-x boss-x", "✕");
      x.type = "button";
      x.title = T("보스 비우기");
      x.onclick = (e) => { e.stopPropagation(); museumSetBoss(null); };
      box.append(x);
    }
  }
  return box;
}

/** 뮤지엄 밴드 — 시즌·보스 카드·배치 자리·주간 버프·현재 스텝·보스 Lv·니케 레벨. */
function renderMuseumBar() {
  const m = M();
  const seasons = museumSeasons();
  const se = museumSeason();
  const sel = $("#museum-season");
  if (sel && document.activeElement !== sel) {
    if (sel.options.length !== seasons.length) {
      sel.textContent = "";
      for (const s of seasons) {
        const o = el("option", null, s.label);
        o.value = String(s.id);
        sel.append(o);
      }
    }
    sel.value = String(se.id);
    sel.onchange = () => { m.season = Number(sel.value); saveAll(); renderMuseumBar(); };
  }
  // 이 시즌의 보스 셋 — 끌어다 놓거나 눌러서 배치한다.
  const pool = $("#museum-pool");
  if (pool) {
    pool.textContent = "";
    for (const id of se.stages) if (museumStage(id)) pool.append(museumBossCard(id, { pool: true }));
    if (!pool.childElementCount) pool.append(el("span", "prose prose-sm", T("뮤지엄 데이터가 없습니다")));
  }
  const target = $("#museum-target");
  if (target) {
    target.textContent = "";
    target.append(museumBossCard(museumStage() ? m.boss : null));
    target.ondragover = (e) => { e.preventDefault(); target.classList.add("over"); };
    target.ondragleave = () => target.classList.remove("over");
    target.ondrop = (e) => {
      e.preventDefault(); target.classList.remove("over");
      const payload = e.dataTransfer.getData("text/plain");
      if (payload.startsWith("mboss:")) museumSetBoss(payload.slice(6));
    };
  }
  const st = museumStage();
  // 아군 적용 효과 — 시즌 톱니 옆(유저 지시). «상시»는 보스에 붙은 기본값이라 글자로 보여 주고,
  // «주간»은 셀렉트로 켠다 — 그 보스의 주간 버프 하나뿐이다(«없음» / «+ 종류 값%»).
  const bw = $("#museum-buffs");
  if (bw && document.activeElement?.closest?.("#museum-buffs") == null) {
    bw.textContent = "";
    const a = museumBuffAlways(), w = museumBuffWeekly();
    if (st && a) {
      const chip = el("span", "museum-buff always" + (a.stat ? "" : " unsupported"));
      chip.append(el("b", "museum-buff-key", T("기본")));
      chip.append(el("span", null, T("{kind} {v}%", { kind: T(a.kind), v: a.value })));
      chip.title = a.stat ? T("보스에 항상 걸리는 아군 버프 — 계산에 들어갑니다")
                          : T("계산기가 아직 이 종류를 받지 못합니다 — 계산에는 안 들어갑니다");
      bw.append(chip);
    }
    if (st) {
      const wrap = el("label", "museum-buff weekly" + (w && museumWeeklyOn() ? " on" : "") + (w && !w.stat ? " unsupported" : ""));
      wrap.append(el("b", "museum-buff-key", T("주간")));
      const sel = el("select");
      sel.setAttribute("aria-label", T("주간 버프"));
      const none = el("option", null, T("없음")); none.value = "";
      sel.append(none);
      if (w) {
        const o = el("option", null, T("+ {kind} {v}%", { kind: T(w.kind), v: museumWeekly() }));
        o.value = "on";
        sel.append(o);
      } else {
        sel.disabled = true;
      }
      sel.value = w && museumWeeklyOn() ? "on" : "";
      sel.onchange = () => { m.weeklyOn[m.boss] = sel.value === "on"; saveAll(); renderAll(); };
      wrap.append(sel);
      wrap.title = !w ? T("이 보스의 주간 버프는 아직 확인되지 않았습니다")
        : w.stat ? T("돌아오는 주에만 걸리는 아군 버프 — 켜면 기본에 더해 계산합니다")
                 : T("계산기가 아직 이 종류를 받지 못합니다 — 계산에는 안 들어갑니다");
      bw.append(wrap);
    }
  }
  const lvIn = $("#union-level");
  if (lvIn && document.activeElement !== lvIn) {
    lvIn.value = m.level ?? "";
    const auto = museumLevel();
    lvIn.placeholder = auto ? String(auto) : "—";
  }
}

/** 결과 탭의 스텝 상자 — 딜 막대 위. 뮤지엄에서만 보인다. */
function renderMuseumResults(rows) {
  const box = $("#res-museum");
  if (!box) return;
  const on = modeNow() === "museum";
  box.hidden = !on;
  if (!on) return;
  const boss = M().boss;
  const st = museumStage(boss);
  const known = rows.filter((r) => r.res).length;
  const hero = $("#res-mstep"), cond = $("#res-mstep-cond"), track = $("#res-mtrack");
  const ol = $("#res-mrows"), note = $("#res-mnote");
  if (!st || !museumBands(boss).length) {
    hero.textContent = "—"; cond.textContent = !MUSEUM ? T("뮤지엄 데이터가 없습니다") : T("보스를 붙이면 스텝을 셉니다");
    track.textContent = ""; ol.textContent = ""; note.textContent = "";
    return;
  }
  const walk = museumWalk(boss, rows.map((r) => (r.res ? r.res.total : null)));
  hero.textContent = known ? String(walk.step) : "—";
  cond.textContent = T("{boss} · 5덱 합산 · 덱당 최대 {per} · 상한 {max}",
                       { boss: T(st.boss), per: walk.perDeck, max: walk.max });
  // 진행 막대 — 0부터 상한까지. 보상 미션(20·40·60·80·100)과 상한은 눈금으로.
  track.textContent = "";
  const bar = el("div", "museum-bar-track");
  const gain = el("i", "museum-bar-gain");
  gain.style.left = "0";
  gain.style.width = `${(walk.step / walk.max) * 100}%`;
  bar.append(gain);
  const ticks = [...new Set([...(MUSEUM.missions?.[boss]?.nolimit_step || [20, 40, 60, 80, 100]), walk.max])]
    .filter((s) => s > 0 && s <= walk.max).sort((a, b) => a - b);
  for (const s of ticks) {
    const tick = el("b", "museum-bar-tick" + (walk.step >= s ? " on" : ""), String(s));
    tick.style.left = `${(s / walk.max) * 100}%`;
    bar.append(tick);
  }
  track.append(bar);
  ol.textContent = "";
  rows.forEach((r, i) => {
    const w = walk.rows[i];
    const li = el("li", "museum-row" + (r.res ? "" : " off"));
    li.append(el("span", "bar-no", String(i + 1).padStart(2, "0")));
    li.append(el("span", "museum-row-dmg", r.res ? I18N.dmg(r.res.total) : "—"));
    li.append(el("span", "museum-row-step",
      r.res ? T("STEP {step}", { step: w.step })
            : (r.full ? T("미계산") : T("5명을 채우면 계산할 수 있습니다"))));
    if (r.res && w.next != null) {
      const nx = el("span", "museum-row-frac", T("다음까지 {v}", { v: I18N.dmg(w.next) }));
      nx.title = T("이 덱이 STEP {step}에 닿으려면 더 넣어야 하는 딜", { step: w.step + 1 });
      li.append(nx);
    } else if (r.res && w.step >= walk.perDeck) {
      li.append(el("span", "museum-row-frac", T("덱 상한")));
    }
    if (r.res && w.lv) li.append(el("span", "museum-row-lv", T("보스 Lv {lv}", { lv: w.lv })));
    ol.append(li);
  });
  const notes = [];
  notes.push(T("덱마다 STEP 1에서 시작해 그 덱의 누적 딜이 문턱을 넘을 때마다 스텝이 오르고, 다섯 덱의 스텝을 더합니다. 딜은 시작 레벨의 방어력으로 계산합니다."));
  if (st._unverified) {
    notes.push(T("이 보스의 스텝 문턱은 추정값입니다."));
  }
  if (walk.rows.some((w, i) => rows[i].res && w.step >= 20)) notes.push(T("STEP 21부터의 문턱은 표를 이어 그린 추정값입니다."));
  if (walk.capped) notes.push(T("상한 {max} 스텝에 닿았습니다.", { max: walk.max }));
  note.textContent = notes.join(" ");
}

/** 모드 전환 연출 — 누른 자리에서 충격파가 판 끝까지 퍼지고 판이 한 번 관통된다.
 *  연출은 결과를 기다리게 하지 않는다: 화면은 이미 바뀐 뒤에 얹힌다. */
function playWarp(m) {
  if (!fxOn()) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const stage = document.querySelector(".stage");
  const head = document.querySelector(".stage-head");
  if (!stage) return;
  const btn = document.getElementById(`mode-${m}`);
  const layer = el("div", "stage-warp");
  if (btn) {
    const b = btn.getBoundingClientRect(), s2 = stage.getBoundingClientRect();
    const x = b.left + b.width / 2 - s2.left, y = b.top + b.height / 2 - s2.top;
    layer.style.setProperty("--wx", `${x}px`);
    layer.style.setProperty("--wy", `${y}px`);
    // 원점에서 **가장 먼 모서리**까지 — 파장이 판 끝을 지나서 사라지게 한다
    const far = Math.max(
      Math.hypot(x, y), Math.hypot(s2.width - x, y),
      Math.hypot(x, s2.height - y), Math.hypot(s2.width - x, s2.height - y));
    layer.style.setProperty("--wr", `${Math.ceil(far)}px`);
  }
  stage.append(layer);
  stage.classList.add("is-warping");
  head?.classList.add("is-swap");
  btn?.classList.add("just-on");
  window.setTimeout(() => {
    layer.remove();
    stage.classList.remove("is-warping");
    head?.classList.remove("is-swap");
    btn?.classList.remove("just-on");
    // CSS의 가장 긴 애니메이션(shock 1000ms)보다 넉넉히 뒤에 치운다 — 먼저 걷으면
    // 파장이 판 끝에 닿기도 전에 잘린다.
  }, 1100);
}

/** 모드 전환. 솔로의 데이터·DOM은 건드리지 않는다 — 화면만 갈아 끼운다. */
function setMode(m, { save: doSave = true, warp = true } = {}) {
  if (m === modeNow()) return;
  // 뮤지엄은 상자를 갈아 끼운다 — 나갈 때 솔로 것을 도로 꽂고, 들어올 때 뮤지엄 것을 꽂는다.
  if (modeNow() === "museum") museumLeave();
  state.settings.mode = m;
  if (m === "museum") museumEnter();
  // 아레나는 제 파일이 그린다 — 들어올 때 한 번 준비시킨다(없으면 조용히 넘어간다).
  if (m === "arena") window.Arena?.ensure();
  // 배치모드는 솔로 5덱 전용이다 — 유니온은 세 줄이 이미 한 화면에 있다
  if (m === "union" && fastMode) setFastMode(false);
  // 솔로·뮤지엄은 배치모드를 각자 기억한다 — 갈아 끼운 값대로 화면을 다시 새긴다
  if (m !== "union") applyFastModeDom(fastMode);
  renderMode();
  buildBattle();                 // 레이드 설정 입력칸을 그 모드의 상자로 다시 채운다
  if (doSave) saveAll();
  renderAll();
  // 모드를 바꾸면 **편성으로 돌아온다.** 프리셋·결과·기록은 모드마다 내용이 통째로
  // 갈리는 화면이라, 보던 자리에 그대로 서 있으면 목록이 조용히 바뀐 것처럼 보인다.
  // 모드를 바꾼 사람이 다음에 할 일도 대개 편성이다.
  document.querySelector('.tab[data-tab="deck"]')?.click();
  if (warp) playWarp(m);
}

// 되돌리기 — 유니온 편성은 한 번 실수로 빼면 다시 짜기가 성가시다. 바꾸기 **직전**의
// 세 줄을 통째로 찍어 두고, 누르면 그 순간으로 되돌린다. 계산 결과는 이름으로
// 찾으므로(fingerprint) 되돌리면 옛 결과가 그대로 다시 붙는다.
const UNDO_MAX = 40;
let uUndo = [];

/** 바꾸기 직전을 찍는다. 무엇을 한 것인지도 함께 남겨 버튼이 말해 줄 수 있게 한다. */
function uSnap(label, at = null) {
  if (modeNow() !== "union") return;
  // `at`은 «그 자리에서 되돌릴 수 있는 일»의 좌표다. 니케를 뺐을 때만 채운다 —
  // 빈 칸에 되돌리기 단추를 띄워, 실수로 뺀 자리에서 바로 되돌릴 수 있게 한다.
  uUndo.push({ label, at, decks: JSON.parse(JSON.stringify(U().decks)) });
  if (uUndo.length > UNDO_MAX) uUndo.shift();
}

/** 그 칸이 «방금 뺀 자리»인가 — 맞으면 빈 칸에 되돌리기 단추가 뜬다. */
function undoSpotAt(deckIdx, idx) {
  const top = uUndo[uUndo.length - 1];
  return top?.at && top.at.deckIdx === deckIdx && top.at.idx === idx ? top : null;
}

/** 마지막 한 번을 되돌린다. */
function uUndoLast() {
  const last = uUndo.pop();
  if (!last) return;
  U().decks = last.decks.map((d) => ({ ...d, names: [...d.names] }));
  picked = null; bossPick = null;
  saveAll();
  renderAll();
  flashStatus(T("되돌렸습니다 — {label}", { label: last.label }));
}

// 지금 어느 줄을 끌고 있나 — 드래그 중에는 dataTransfer를 못 읽으므로 따로 든다.
let deckDragFrom = null;
// 줄에 꽂힌 보스를 끌 때, 그 끌기가 **어느 줄에 놓였는지**. 놓인 데가 없으면
// 「밖으로 던진 것」이라 그 줄을 비운다 — 니케 칸에서 끌어내는 것과 같은 손버릇이다.
// dragend는 drop 뒤에 오므로 이 깃발로 갈린다.
let bossDropped = false;

// 걸린 보스 카드를 덮는 사선 줄 수와 간격(px). 상자는 카드의 3배짜리 **정사각**이고
// (실측 684×684), 줄이 그 세로를 끝까지 메워야 어느 모서리도 안 빈다 — 684/13 ≈ 53.
// 34줄로는 442px까지만 닿아 한쪽 귀퉁이가 비어 보였다.
const HATCH_BARS = 54;
const HATCH_GAP = 13;

// 방금 꽂은 보스가 **무엇에 약한가**. 아래 목록에서 그 속성 카드를 계속 켜 둔다 —
// 몇 초 만에 꺼지면 «어느 카드였지»를 다시 찾아야 한다. 다음 보스를 꽂을 때까지
// 남고, 그때 새 속성으로 갈린다.
let litElem = null;

// 직전에 «걸려» 있던 줄. renderBench()가 매번 줄을 통째로 새로 그리므로, 이걸
// 기억해 두지 않으면 이미 걸려 있던 줄까지 사선이 다시 그어진다(실측: 다른 줄에
// 보스를 꽂았을 뿐인데 세 줄이 같이 그어졌다). **새로 걸린 줄만** 긋는다.
let uShortWas = new Set();
let unionHideWired = false;
function wireUnionHide() {
  if (unionHideWired) return;
  const eye = $("#union-hide");
  if (!eye) return;
  unionHideWired = true;
  eye.onclick = () => {
    state.settings.unionNameHidden = state.settings.unionNameHidden === false;
    saveAll();
    renderUnionBar();
  };
}

function renderMode() {
  const sw = $("#mode-sw");
  if (!sw) return;
  sw.hidden = false;                      // 정식 화면 — 언제나 보인다
  const m = modeNow();
  sw.classList.toggle("at-union", m === "union");
  sw.classList.toggle("at-museum", m === "museum");
  sw.classList.toggle("at-arena", m === "arena");
  for (const b of sw.querySelectorAll(".mode-btn")) {
    b.classList.toggle("on", b.dataset.mode === m);
  }
  const pill = $("#mode-pill");
  if (pill) pill.textContent = m === "union" ? "UNION RAID" : m === "museum" ? "MUSEUM"
    : m === "arena" ? "ARENA" : "SOLO RAID";
  // 테마 스코프 — tokens.css의 `:root[data-mode="union"]` 블록이 여기에 걸린다
  document.documentElement.setAttribute("data-mode", m);
  // 두 화면은 자리를 나눠 쓴다. 솔로 쪽 DOM은 **감추기만** 하고 내용은 안 건드린다 —
  // 돌아오면 있던 그대로여야 한다.
  // 뮤지엄은 솔로와 **같은 DOM**을 쓴다(데이터만 갈아 끼운 상태) — 아래에서 «유니온이냐»로
  // 내리고 올리는 것은 솔로와 같이 두고, 솔로레이드에만 뜻이 있는 것만 따로 내린다.
  const union = m === "union", museum = m === "museum", arena = m === "arena";
  // 아레나는 **편성 패널 자리를 통째로 쓴다** — 5덱·배치모드·레이드 설정은 뜻이 없다.
  // (탭이 아니라 모드다 — 솔로/유니온/뮤지엄과 같은 줄에 선다, 유저 지시 2026-08-31.)
  const arenaWrap = $("#arena-wrap");
  if (arenaWrap) arenaWrap.hidden = !arena;
  // 아래 단추 줄은 통째로 솔로 살림이다 — 아레나에는 뜻이 없다. **아레나일 때만 내리고,
  // 나가면 되살린다**(뒤의 분기들이 다시 제 모드에 맞게 손본다).
  for (const sel of ["#deck-acts", "#deck-goto-result", ".squad-foot", "#deck-notes"]) {
    const n2 = document.querySelector(sel);
    if (n2) n2.hidden = arena;
  }
  // 바닥 줄의 «육성 효율표»는 **유니온 것**(세 줄 공용이라 프리셋 저장 무리 옆) — 솔로·뮤지엄은
  // 왼쪽 기둥(#deck-growth)에서 연다(유저 지시 2026-09-02).
  const g2 = $("#growth-open");
  if (g2) g2.hidden = !union;
  const lb = $("#lab-open");
  if (lb) lb.hidden = !union;
  // 머리줄은 **통째로 내리지 않는다**(유저 지시 2026-08-31) — 계정·콘솔·프로필은
  // 아레나에서도 그대로 쓴다(어느 계정의 육성값으로 세우는지가 여기서 갈린다).
  // 솔로레이드에만 뜻이 있는 것(약점·레이드 설정·배치모드·덱 탭)만 골라 내린다.
  const head2 = document.querySelector(".stage-head");
  if (head2) head2.hidden = false;
  // 아래 니케 목록은 아레나에서 통째로 내린다 — 자리를 눌러 시트에서 고른다(유저 지시
  // 2026-08-31: «맨 아래 니케 고르는 건 없애»). 나가면 되살린다.
  const roster2 = document.querySelector(".roster");
  if (roster2) roster2.hidden = arena;
  // 프로필 **저장**은 아레나에서 내린다(유저 지시 2026-08-31 «괜히 꼬일라») — 여기서
  // 고친 값이 솔로 프로필에 덮어써지면 되돌릴 방법이 마땅치 않다. 되돌리기(↺)는 남긴다:
  // 고친 것을 무르는 길은 있어야 한다.
  for (const sel of ["#variant-save", "#variant-saveas", "#variant-del"]) {
    const v = document.querySelector(sel);
    if (v) v.hidden = arena;
  }
  // 위 메뉴줄도 콘텐츠를 탄다. 아레나에는 «편성»과 «내 계정»만 두고 그 뒤(전투력
  // 계산기·피드백·미미르)는 그대로 둔다 — 프리셋·결과·기록은 아직 아레나 것이 없다.
  for (const sel of ['.tab[data-tab="preset"]', '.tab[data-tab="result"]',
                     '.tab[data-tab="log"]']) {
    const t2 = document.querySelector(sel);
    if (t2) t2.hidden = arena;
  }
  // 미미르(덱빌딩·니케 데이터 관리)도 아레나에서는 내린다(유저 지시 2026-08-31).
  // 다른 화면에서는 그대로 둔다 — 솔로·유니온·뮤지엄을 가리지 않는 도구다.
  const mimir = document.querySelector("#tab-mimir");
  if (mimir) mimir.hidden = arena;
  // 프리셋 탭의 «미미르에서 가져오기» 링크는 모드를 탄다(솔로 ↔ 유니온 덱 구성).
  // `renderPresets`는 모드 전환에 안 불리므로(renderAll에 없다) 여기서 맞춘다.
  wireMimirImport();
  // 도로롱은 **두 화면 공용**이다(유저 지시 2026-08-29) — 유니온에서 토글이 사라지면
  // 색이 되돌아간 것을 끌 방법이 없어 «고장»으로 읽힌다.
  if (!union) litElem = null;
  const squad = $("#squad-wrap"), tabs = $("#deck-tabs");
  if (squad) squad.hidden = union || fastMode || arena;
  if (tabs) tabs.hidden = union || fastMode || arena;
  // 배치모드는 «5덱 25칸을 빠르게 채우는» 화면이라 유니온에는 쓸 자리가 없다
  const fastWrap = document.querySelector(".fast-toggle-wrap");
  if (fastWrap) fastWrap.hidden = union || arena;
  // 상단 메뉴도 콘텐츠를 탄다. «솔레 결과 기록하기»(솔레 금서고)는 솔로레이드
  // 기록을 다루는 바깥 사이트라 유니온에서는 갈 이유가 없어 내린다.
  // 프리셋·기록은 유니온에도 필요하므로 그대로 두고, 목록만 모드별로 갈라
  // 둔다(presetsNow·recordsNow).
  const steal = document.querySelector("#tab-steal");
  if (steal) steal.hidden = union;
  // 「캡처에서 솔레 기록 만들기」는 **솔로레이드 스쿼드 목록 캡처**를 읽는 기능이다.
  // 유니온에는 그런 화면이 없으므로 내린다 — 눌러 봐야 읽을 것이 없다.
  const shotOpen = document.querySelector("#shot-open");
  if (shotOpen) shotOpen.hidden = union;
  // 「덱 비우기」·「프리셋 저장」·「덱 계산」은 «지금 고른 덱» 하나를 뜻한다. 유니온에는
  // 그런 것이 없어서 **어느 줄인지 말하지 않는 버튼**이 된다 — 내리고, 같은 일은
  // 줄 손잡이에서 줄 번호를 달고 한다(N번 줄 계산·줄 비우기).
  // «버스트 비교»도 같은 이유로 내린다 — 유니온에는 «지금 고른 덱»이 없어서 어느 줄을
  // 비교하는지 말하지 못한다. 같은 일은 줄 손잡이에서 줄 번호를 달고 한다.
  for (const sel of ["#deck-clear", "#preset-save-single", "#deck-calc", "#deck-fbc"]) {
    const b = document.querySelector(sel);
    if (b) b.hidden = union;
  }
  // «되돌리기»는 조건부다(적용한 뒤에만) — 위 목록에 넣으면 솔로에서 늘 보인다.
  // 유니온에서 내리는 것 **더하기** 되돌릴 것이 있는지까지 함께 본다.
  const fbcUndoBtn = $("#deck-fbc-undo");
  if (fbcUndoBtn) {
    fbcUndoBtn.hidden = union || !fbcUndo || fbcUndo.deckIdx !== state.settings.deck;
  }
  // 묶음 저장이 유니온에서는 유일한 저장이다 — 무엇을 담는지 이름으로 말한다
  const bundle = document.querySelector("#preset-save-bundle");
  if (bundle) bundle.textContent = union ? T("프리셋 묶음 저장") : T("묶음 저장");
  const clearAll = document.querySelector("#deck-clear-all");
  if (clearAll) clearAll.textContent = union ? T("전부 비우기") : T("전체 비우기");
  // 화면을 옮기면 떠 있던 확인은 접는다 — «3줄 7명을 비웁니다»가 솔로 화면에 남으면
  // 무엇을 비우는 건지 알 수 없다(제보 2026-08-29).
  closeAsk(document);
  // 세 줄 보스 셋팅 공유 — 유니온에서만. 솔로는 레이드 설정 패널 안에 같은 것이 있다.
  const shareAll = document.querySelector("#boss-share-all");
  if (shareAll) shareAll.hidden = !union;
  // 「보스 추천 설정」도 유니온에서만 — 담는 것이 «이 회차 다섯 보스»라 솔로·뮤지엄에는 앉힐 자리가 없다.
  const bossRec = document.querySelector("#boss-rec");
  if (bossRec) bossRec.hidden = !union;
  // «보스 설정도 함께»도 유니온에서만 — 솔로는 공유본에 레이드 설정을 안 싣는다.
  const sbw = document.querySelector("#share-boss-wrap");
  if (sbw) sbw.hidden = !union;
  // 사이클은 유니온에서 **줄의 레이드 설정 안**에 있다 — 하단 단추는 솔로에서만.
  const cyt = document.querySelector("#cy-toggle");
  if (cyt) cyt.hidden = union;
  if (union) {
    const drop = document.querySelector("#shot-drop");
    if (drop) drop.hidden = true;
  }
  // 레이드 설정은 유니온에서 **줄마다 따로** 잡아야 한다(보스가 셋이다). 한 벌짜리
  // 공통 패널을 그대로 두면 세 줄에 같은 값이 걸려 뜻이 어긋나므로, 개별 UI를
  // 붙이기 전까지는 내려 둔다.
  const btWrap = document.querySelector("#bt-toggle")?.closest(".fwrap");
  // 뮤지엄도 머리줄 트리거는 내린다 — 유니온 줄처럼 기둥의 «레이드 설정»이 모달로 연다(openMuseumBattle).
  if (btWrap) btWrap.hidden = union || museum || arena;
  const mr = $("#museum-raid");
  if (mr) { mr.hidden = !museum; mr.onclick = openMuseumBattle; }
  // 설정 패널은 **한 벌뿐**이라 모드에 따라 자리를 옮겨 다닌다. 솔로로 돌아올 때
  // 유니온 줄 밑에 두고 오면, 솔로의 «레이드 설정»을 눌러도 아무것도 안 열린다.
  const bp = $("#btpanel");
  if (bp && !union && btWrap && bp.parentElement !== btWrap) {
    btWrap.append(bp);
    bp.hidden = true;
    uBattleOpen = false;
  }

  // 덱 툴바(비우기·프리셋·계산)·컨트롤 패널은 원래 솔로 편성 상자 안에
  // 있다. 유니온에서는 그 상자가 통째로 숨으므로 **옮겨 심는다** — 복제하면
  // «전체 계산» 같은 버튼이 두 벌이 되어 상태가 어긋난다.
  const host = union ? $("#union-bench")?.parentElement : $("#squad-wrap .squad");
  const foot = document.querySelector(".squad-foot");
  const ctrlPanel = document.querySelector("#ctrl-panel");
  if (host && foot) {
    if (union) {
      // 워크벤치 바로 아래로
      // 컨트롤은 모달(#ctrl-sheet)이 데려간다 — 여기서 벤치 밑에 심으면 줄이 벌어진다
      $("#union-bench").after(foot);
    } else if (foot.parentElement !== host) {
      host.append(ctrlPanel, foot);
    }
  }
  const ub = $("#union-bar"), sw2 = $("#solo-weak"), mb = $("#museum-bar");
  if (ub) ub.hidden = m !== "union";
  if (mb) mb.hidden = !museum;
  // 보스 기둥·배치 자리는 편성 상자 안팎에 산다 — 뮤지엄에서만 켠다
  const mpw = $("#museum-pool-wrap"), mt = $("#museum-target");
  if (mpw) mpw.hidden = !museum || fastMode;
  if (mt) mt.hidden = !museum;
  // 레벨·유니온명은 계정 옆에 따로 서 있다(유니온 바 밖) — 모드가 직접 켜고 끈다.
  // 유니온명은 «이름이 있을 때만» 뜨므로, 켜는 판단은 renderUnionBar에 맡기고
  // 여기서는 끄기만 한다. 레벨 칸은 뮤지엄도 쓴다(값은 각자 든다 — museumLevel).
  const lv2 = $("#union-lv");
  if (lv2) lv2.hidden = !(union || museum);
  const nameWrap = $("#union-name-wrap");
  if (nameWrap && m !== "union") nameWrap.hidden = true;
  // 약점 고르개는 솔로만 — 뮤지엄은 보스가 속성을 정한다(museumCounterCode).
  if (sw2) sw2.hidden = union || museum || arena;
  // 솔레 금서고·캡처 판독은 **솔로레이드**의 것이다 — 뮤지엄·아레나에도 없다.
  if (museum || arena) {
    for (const sel of ["#tab-steal", "#shot-open"]) {
      const b = document.querySelector(sel);
      if (b) b.hidden = true;
    }
    const drop = document.querySelector("#shot-drop");
    if (drop) drop.hidden = true;
  }
  if (m === "union") { wireUnionHide(); renderUnionBar(); }
  if (museum) renderMuseumBar();
  // 필터 바는 DOM을 함께 쓰고 **상태만 갈린다**(curFilter). 모드가 바뀌면 지금
  // 상자의 값으로 다시 맞춰 준다 — 안 그러면 솔로에서 건 칩이 유니온 화면에
  // 그대로 떠 있어 목록과 표시가 어긋난다.
  if (!inCoop) {
    const q = $("#q");
    if (q) q.value = curFilter().q;
    buildFilters();
  }
  // **배치모드의 숨김을 맨 끝에서 다시 새긴다.** 이 함수는 «유니온이냐»로만 보고
  // 내렸다 올리는 것이 여럿이라(편성 상자·레이드 설정·약점 줄), 배치모드로 켜 둔 채
  // 한 번 더 돌면 감춰 둔 것들이 되살아난다 — 새로고침으로 `/deck/grid`에 바로
  // 들어가면 실제로 그 순서가 났다(boot: applyRoute가 배치모드를 켠 **뒤** renderMode).
  // 맨 끝에서 한 번 다시 새기면 위쪽 순서를 외우지 않아도 된다.
  if (m !== "union" && fastMode) applyFastModeDom(true);
  syncDororongPlayground();
}

/** 지금 계정의 유니온 이름. 블라링크에서 받아 온 계정 정보에 실려 온다
 *  (`_account.union` — `scraper/profile_fetch.fetch_union`). 없으면 null. */
const unionName = () => activeRec()?.fetched?._account?.union?.name || null;

/** 유니온 상단 — 유니온명과 레벨 계기. 보스는 워크벤치의 각 줄이 들고 있다. */
function renderUnionBar() {
  const wrap = $("#union-name-wrap"), nm = $("#union-name");
  const name = unionName();
  if (wrap && nm) {
    wrap.hidden = !name;
    if (name) nm.textContent = name;
    // 가림은 **이 브라우저에만** 남는다. 스샷 찍을 때만 켜는 스위치라 계정·서버로
    // 넘길 값이 아니다.
    // **기본은 가림**이다 — 유니온명은 스샷에 딸려 나가면 곤란한 사람이 있고,
    // 한 번 새어 나간 것은 되돌릴 수 없다. 보고 싶으면 누르면 된다(그 선택은
    // 이 브라우저에만 남는다).
    const hidden = state.settings.unionNameHidden !== false;
    wrap.classList.toggle("masked", hidden);
    const eye = $("#union-hide");
    if (eye) {
      eye.textContent = hidden ? "◌" : "◉";
      eye.setAttribute("aria-pressed", String(hidden));
      eye.title = hidden ? T("유니온명 다시 보기") : T("유니온명 가리기");
    }
  }
  // 회차 고르개 — 고르면 보스 다섯의 «안에 든 것»이 통째로 바뀐다(속성 배정도).
  // 줄에 꽂아 둔 속성(weak)은 그대로 두므로, 회차만 바꾸면 «같은 자리에 이번 회차
  // 보스»가 들어온다.
  const ss = $("#union-season");
  if (ss && document.activeElement !== ss) {
    const cur = unionSeason();
    if (ss.options.length !== UNION_SEASONS.length + 1) {
      ss.textContent = "";
      // 최신 회차가 위로 — 대개 이번 것을 본다. 커스텀은 맨 아래(직접 짜는 자리다).
      for (const se of [...UNION_SEASONS].reverse()) {
        const o = el("option", null, `${se.label} · ${se.start.slice(2).replace(/-/g, ".")}`);
        o.value = String(se.id);
        ss.append(o);
      }
      // 보스를 직접 짜 넣는 화면이 아직 없다 — 목록에 자리는 잡아 두되 «준비중»으로
      // 잠가 둔다. 고를 수 있게 열어 두면 빈 판만 나와 «고장 났나»가 된다.
      const co = el("option", null, "유니온 커스텀 설정 (준비중)");
      co.value = CUSTOM_SEASON;
      co.disabled = true;
      ss.append(co);
    }
    ss.value = String(cur.id);
    ss.onchange = () => {
      // 회차 id는 숫자지만 커스텀만 문자열이다 — 무턱대고 Number()로 바꾸면 NaN이 된다
      U().season = ss.value === CUSTOM_SEASON ? CUSTOM_SEASON : Number(ss.value);
      applySeasonPicks();             // 고른 적 없는 회차면 세 줄이 빈 채로 선다
      saveAll();
      renderAll();
    };
  }

  const lv = $("#union-level");
  if (lv && document.activeElement !== lv) {
    lv.value = state.settings.unionLevel ?? "";
    const auto = unionLevel();
    lv.placeholder = auto ? String(auto) : "—";
  }
}

/** 유니온 워크벤치 — 왼쪽 보스 5(속성 고정), 오른쪽 덱 3줄.
 *  **솔로와 데이터·DOM을 공유하지 않는다** — 자기 저장소(state.union)만 읽고,
 *  자기 칸(renderUnionSlots)만 그린다. */
function renderBench() {
  const on = modeNow() === "union";
  const bench = $("#union-bench");
  if (bench) bench.hidden = !on;
  if (!on) return;

  // 보스 풀 — 속성 다섯 고정. 회차마다 안의 보스만 바뀐다.
  // **좁은 화면에서는 CSS가 이걸 감춘다**(끌어 놓기가 터치에서 잘 안 되고, 다섯이
  // 화면을 밀어낸다). 거기서는 줄의 보스 칸을 눌러 시트로 고른다(`openBossPick`).
  const pool = $("#boss-pool");
  if (pool) {
    pool.textContent = "";
    for (const code of UNION_CODES) {
      const card = bossCard(code, { pool: true });
      // 톱니바퀴 — **이 회차 이 보스의 기본값**을 고친다(줄 설정과 다르다).
      // 카드를 끌어 줄에 꽂는 동작을 막지 않게 톱니에서 시작한 끌기는 삼킨다.
      const gear = el("button", "boss-gear", "⚙");
      gear.type = "button";
      gear.title = T("{v} 기본 설정", { v: bossOf(code)?.name || code });
      gear.draggable = false;
      gear.addEventListener("dragstart", (e) => e.preventDefault());
      gear.onclick = (e) => { e.stopPropagation(); openBossCfg(code); };
      card.append(gear);
      // 딱지만 남긴다 — 그리기는 안 바꾼다(톱니는 다섯이 같은 모습이어야 한다).
      // 붙여 두는 이유는 나중에 «정해 뒀다»를 톱니가 아닌 곳에 표시할 자리이기 때문이다.
      if (bossDefaults()[code]) card.classList.add("boss-has-cfg");
      pool.append(card);
    }
  }

  // 덱 세 줄 — [보스] + [니케 5칸]
  const rows = $("#bench-rows");
  rows.textContent = "";
  for (let i = 0; i < UNION_DECKS; i++) {
    const d = uDeck(i);
    const code = uWeak(d);
    const row = el("div", "bench-row");
    row.style.setProperty("--code-c", CODE_VAR[code] || "var(--color-stage-line)");

    const take = (c) => uSetBoss(i, c);
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      // 덱을 끌고 있으면 «여기와 바뀐다»를, 보스를 끌고 있으면 «여기 꽂힌다»를 말한다
      row.classList.add(deckDragFrom != null && deckDragFrom !== i ? "swap" : "over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("over", "swap"));
    row.addEventListener("drop", (e) => {
      e.preventDefault(); row.classList.remove("over", "swap");
      const payload = e.dataTransfer.getData("text/plain");
      if (payload.startsWith("deck:")) uSwapDecks(Number(payload.slice(5)), i);
      else if (payload.startsWith("boss:")) { bossDropped = true; uSwapBoss(Number(payload.slice(5)), i); }
      else take(payload);
    });
    if (bossPick) {
      row.classList.add("armed");
      // 풀에서 보스를 «고른» 상태면 줄 아무 데나 눌러도 꽂힌다 — 끌기가 안 되는
      // 환경(터치·트랙패드)에서도 같은 일을 할 수 있어야 한다. 니케 칸을 누른
      // 경우는 그쪽 핸들러가 먼저 먹으므로 여기까지 오지 않는다.
      row.onclick = (e) => { if (!e.target.closest(".u-slot, .row-side")) take(bossPick); };
    } else {
      row.onclick = null;
    }

    const target = bossCard(code, { deckIdx: i, onTake: take });
    // 칸을 누르면 고르기 시트. 「고른 상태로 줄을 누른다」는 옛 흐름은 풀이 없어져
    // 쓸 일이 없지만, 코드는 그대로 두어 옛 링크·키보드 흐름이 깨지지 않게 한다.
    target.onclick = (e) => { e.stopPropagation(); openBossPick(i); };
    target.tabIndex = 0;
    target.setAttribute("role", "button");
    target.title = T("눌러서 보스를 고릅니다");
    target.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBossPick(i); }
    };
    const cells = el("div", "bench-slots");
    renderUnionSlots(cells, i);

    // 줄 왼쪽 손잡이 — 편성을 통째로 위/아래로 옮기는 단추와, **꽉 찬 뒤에도**
    // 남아 있는 우월 속성 경고. 빈 칸 힌트는 다 채우면 사라지므로, 「5명 다 넣었는데
    // 우월이 둘뿐」인 상태를 말해 줄 자리가 따로 있어야 한다.
    // 줄 손잡이 — **끌어서** 편성을 통째로 다른 줄로 옮긴다. 보스는 줄에 남는다
    // (「이 보스는 그대로 두고 편성만 다른 줄로」가 하고 싶은 일이다).
    // 줄 손잡이 — 단추가 아니라 **왼쪽 긴 영역 전체**가 잡히는 자리다. 조준할
    // 것 없이 그 줄 옆을 잡아 끌면 편성이 통째로 따라온다. 보스는 줄에 남는다.
    // 끌 수 있는 자리는 **양옆의 빈 영역**이다. 줄 전체를 draggable로 두면 니케 한 명을
    // 집으려 해도 줄이 통째로 끌려온다(실측) — 안쪽은 저마다 할 일이 있는 자리다.
    const grabL = el("div", "row-grab row-grab-l");
    grabL.append(el("span", "row-grip", "⠿"));   // 손잡이 표시 — 잡는 자리는 왼쪽 빈 영역 전체다
    const grabR = el("div", "row-grab");
    const side = el("div", "row-side");
    side.title = T("{v}번 편성을 끌어 다른 줄과 맞바꿉니다 (보스는 그대로)", { v: i + 1 });
    side.draggable = true;
    const onGrabStart = (e) => {
      e.dataTransfer.setData("text/plain", `deck:${i}`);
      e.dataTransfer.effectAllowed = "move";
      // 끌고 다니는 그림은 **줄과 정확히 같은 크기의 복제본**으로 찍는다.
      // 줄 자체를 넘기면 붉은 해치처럼 카드 밖으로 뻗는 자식 때문에 스냅샷 원점이
      // 줄보다 위에서 시작해, 해치가 있는 줄만 한 칸쯤 아래로 밀려 잡혔다(실측).
      // contain: paint로는 안 잡혔다 — 넘치는 것을 아예 떼어 낸 복제본이 확실하다.
      const box = row.getBoundingClientRect();
      const shot = row.cloneNode(true);
      shot.querySelectorAll(".boss-hatch, .dust").forEach((n) => n.remove());
      shot.classList.remove("lifted", "swap", "over");
      shot.style.cssText = `position:fixed; left:-20000px; top:0; margin:0;`
        + `width:${box.width}px; height:${box.height}px; overflow:hidden;`
        + `background:var(--color-stage-2); pointer-events:none;`;
      document.body.append(shot);
      e.dataTransfer.setDragImage(shot, e.clientX - box.left, e.clientY - box.top);
      setTimeout(() => shot.remove(), 0);      // 스냅샷은 이미 찍혔다
      side.classList.add("dragging");
      // 줄 **전체가 들린다** — 손잡이만 흐려지면 「판이 움직인다」가 안 읽힌다.
      deckDragFrom = i;
      row.classList.add("lifted");
      $("#bench-rows")?.classList.add("shuffling");
    };
    const onGrabEnd = () => {
      side.classList.remove("dragging");
      deckDragFrom = null;
      row.classList.remove("lifted");
      $("#bench-rows")?.classList.remove("shuffling");
      for (const r of $("#bench-rows")?.children || []) r.classList.remove("swap");
    };
    for (const g of [grabL, grabR]) {
      g.draggable = true;
      g.title = T("{v}번 편성을 끌어 다른 줄과 맞바꿉니다 (보스는 그대로)", { v: i + 1 });
      g.addEventListener("dragstart", onGrabStart);
      g.addEventListener("dragend", onGrabEnd);
    }

    // 줄마다 **제 레이드 설정**과 **제 계산 버튼**을 든다. 세 줄이 서로 다른 보스를
    // 치므로 설정도 계산도 줄 단위여야 한다 — 위쪽에 공용 버튼 하나만 두면
    // 「지금 어느 줄 얘기지」가 매번 생긴다.
    const raid = el("button", "row-btn row-raid");
    raid.type = "button";
    // 톱니만 두면 무엇을 여는 버튼인지 안 읽힌다 — 글자를 함께 적는다
    raid.append(el("i", null, "⚙"), el("span", null, "레이드 설정"));
    raid.title = T("{v}번 줄의 레이드 설정 — 방어력·코어·적정거리·버스트", { v: i + 1 });
    raid.setAttribute("aria-label", T("{v}번 줄 레이드 설정", { v: i + 1 }));
    if (battleChanged(uDeck(i).battle)) raid.classList.add("has");
    raid.onclick = (e) => { e.stopPropagation(); openRowBattle(i); };
    side.append(raid);

    const calc = el("button", "row-btn row-calc");
    calc.type = "button";
    const rr = resultOf(d);
    calc.disabled = !isFull(d) || !!d.calcState;
    calc.dataset.state = d.calcState === "run" ? "loading" : "";
    // 버튼이 **줄 안에** 있으므로 몇 번 줄인지는 자리가 이미 말한다 — 글자에까지
    // 「1번 줄」을 넣으면 읽을 것만 는다. 설명이 필요한 곳은 툴팁이다.
    calc.textContent = d.calcState === "run" ? T("계산 중…") : rr ? T("재계산") : T("계산");
    calc.title = isFull(d) ? T("{v}번 줄만 계산합니다", { v: i + 1 }) : T("5명을 다 채워야 계산할 수 있습니다");
    calc.onclick = (e) => { e.stopPropagation(); calcDecks([i], true, "row"); };
    side.append(calc);

    // 버스트 비교 — 이 줄만 돈다. 유니온은 줄마다 보스도 레이드 설정도 달라서
    // «세 줄을 한꺼번에»가 아니라 줄 단위여야 뜻이 맞는다.
    const fbc = el("button", "row-btn row-fbc", "버스트 비교");
    fbc.type = "button";
    fbc.disabled = !isFull(d) || !!d.calcState || fbcRunning;
    fbc.title = isFull(d)
      ? T("{v}번 줄의 버스트 순서·금지를 조합해 더 나은 설정을 찾습니다", { v: i + 1 })
      : T("5명을 다 채워야 계산할 수 있습니다");
    fbc.onclick = (e) => { e.stopPropagation(); fbcRun(i); };
    side.append(fbc);

    // 버스트 사이클 — **줄 = 덱**이라 레이드 설정(보스 조건)이 아니라 여기 붙는다
    // (유저 지시 2026-08-30). 솔로도 «버스트 비교» 옆이라 자리가 같다.
    const cyb = el("button", "row-btn row-cycle", "버스트 사이클");
    cyb.type = "button";
    cyb.title = T("{v}번 줄을 어떻게 굴릴지 — 풀버스트 상한·첫 버스트·손속도", { v: i + 1 });
    if (cycleChangedOf(uDeck(i).battle)) cyb.classList.add("has");
    cyb.onclick = (e) => { e.stopPropagation(); openCycleSheet(i); };
    side.insertBefore(cyb, calc);     // «레이드 설정» 바로 아래 — 설정 무리끼리(유저 지시 2026-09-02)

    // «한 명을 바꾼다면?» — 이 줄의 자리 하나를 골라 후보 전원을 돌려 본다(recoOpen). 왼쪽 기둥
    // (유저 결정 2026-09-02 — 오른쪽은 애매하다). «육성 효율표»는 세 줄 공용이라 바닥 줄에 있다.
    const swp = el("button", "row-btn row-swap", "한 명을 바꾼다면?");
    swp.type = "button";
    swp.disabled = d.names.filter(Boolean).length < 2;
    swp.title = T("{v}번 줄의 자리 하나를 골라, 누가 제일 좋은지 내 계정 스펙으로 돌려 봅니다", { v: i + 1 });
    swp.onclick = (e) => { e.stopPropagation(); recoOpen(i, null); };
    side.append(swp);


    // 이 줄에 적용한 것이 있으면 그 자리에서 되돌린다
    if (fbcUndo && fbcUndo.deckIdx === i && fbcUndo.key === fbcKeyOf(i)) {
      const back = el("button", "row-btn row-fbc-undo", "되돌리기");
      back.type = "button";
      back.title = T("{v}번 줄의 버스트를 적용 전으로 되돌립니다", { v: i + 1 });
      back.onclick = (e) => { e.stopPropagation(); fbcUndoApply(); };
      side.append(back);
    }



    // 그 줄의 결과 — 계산하면 여기에 바로 뜬다. 결과 탭까지 안 가도 된다.
    const out = el("span", "row-total");
    // 숫자 앞에 **그 줄을 치는 속성**을 적는다 — 「풍압 89.98억」처럼 읽혀야
    // 어느 조건에서 나온 딜인지가 숫자와 함께 온다.
    const want = COUNTER_OF[uWeak(d)];
    if (want && !d.error) {
      const tag = el("span", "row-total-el", want);
      tag.style.setProperty("--code-c", CODE_VAR[want] || "var(--color-stage-line)");
      out.append(tag);
    }
    out.append(el("b", null,
      d.error ? T("오류") : rr ? `${I18N.dmg(rr.total)}` : isFull(d) ? T("미계산") : "—"));
    if (d.error) { out.classList.add("err"); out.title = d.error; }
    side.append(out);

    row.append(grabL, side, target, cells, grabR);
    rows.append(row);
  }
  // 세 줄 합계 — 유니온에서 실제로 궁금한 숫자는 줄별 딜이 아니라 **오늘의 총딜**이다.
  const sumVal = $("#bench-sum-val"), sumNote = $("#bench-sum-note");
  if (sumVal) {
    let sum = 0, done = 0, full = 0;
    for (let k = 0; k < UNION_DECKS; k++) {
      const dk = uDeck(k);
      if (isFull(dk)) full += 1;
      const r = resultOf(dk);
      if (r) { sum += r.total; done += 1; }
    }
    sumVal.textContent = done ? `${I18N.dmg(sum)}` : "—";
    // 다 됐을 때는 **아무 말도 안 한다.** 숫자가 곧 답이고, 옆에 «모두 계산됨»을
    // 붙여 봐야 읽을 것만 는다. 말을 거는 건 뭔가 빠졌을 때뿐이다.
    sumNote.textContent = done === UNION_DECKS ? ""
      : done ? T("{v}줄이 아직 계산 전입니다", { v: UNION_DECKS - done })
      : full ? "" : T("다섯 명씩 채우면 계산할 수 있습니다");
    sumVal.classList.toggle("partial", done > 0 && done < UNION_DECKS);
  }

  // 상단 바(유니온명·레벨)도 여기서 함께 맞춘다. 모드 전환 때만 그리면 계정을
  // 다시 받아 온 뒤에도 옛 값이 그대로 남는다(실측: 유니온명이 안 떴다).
  wireUnionHide();
  renderUnionBar();
}

/** 보스 카드 — 랩처 그림이 주인공이다. 지금은 속성 아이콘이 자리를 지키고,
 *  나중에 회차별 랩처 아트를 `.boss-art`에 끼우면 그대로 들어간다.
 *  풀(왼쪽)은 끌 수 있고, 줄(오른쪽)에 꽂힌 것은 눌러서 다음 속성으로 돈다. */
/** 보스 고르기 시트 — 어느 줄에 꽂을지 기억해 둔다. */
let bossPickRow = null;

function openBossPick(deckIdx) {
  bossPickRow = deckIdx;
  renderBossPick();
  const dlg = $("#boss-pick-sheet");
  if (dlg && !dlg.open) dlg.showModal();
}

function closeBossPick() {
  bossPickRow = null;
  const dlg = $("#boss-pick-sheet");
  if (dlg?.open) dlg.close();
}

/** 이번 회차 다섯을 늘어놓는다. 이미 다른 줄이 쓰는 보스는 **가리지 않고** 표시만
 *  한다 — 유니온은 세 줄이 같은 보스를 칠 수도 있고, 막으면 왜 못 고르는지 모른다. */
function renderBossPick() {
  const wrap = $("#boss-pick-pool");
  if (wrap == null) return;
  wrap.textContent = "";
  const used = new Map();
  for (let i = 0; i < UNION_DECKS; i++) {
    const w = uWeak(uDeck(i));
    if (w) used.set(w, i);
  }
  for (const code of UNION_CODES) {
    const card = bossCard(code, { pool: true });
    const at = used.get(code);
    if (at != null && at !== bossPickRow) {
      card.classList.add("boss-used");
      card.title = T("{v}번 줄이 쓰는 중", { v: at + 1 });
    }
    if (bossPickRow != null && uWeak(uDeck(bossPickRow)) === code) card.classList.add("armed");
    card.onclick = () => {
      if (bossPickRow != null) uSetBoss(bossPickRow, code);
      closeBossPick();
    };
    wrap.append(card);
  }
}

function bossCard(code, { pool = false, deckIdx = null, onTake = null } = {}) {
  const box = el("div", "boss" + (pool ? " boss-pick" : " boss-set"));
  box.style.setProperty("--code-c", CODE_VAR[code] || "var(--color-stage-line)");
  if (!code) box.classList.add("empty");
  // 줄 번호는 안 적는다 — 세 줄이 보스 그림·속성색으로 이미 갈리고, 유니온에는
  // 「몇 번 덱」이라는 뜻이 따로 없다(출격 세 번일 뿐이다). 번호를 달면 읽을 것만 는다.
  // 우월 속성이 모자란 줄은 보스 카드에 **붉은 사선**이 그어진다. 빈 칸 힌트는
  // 다 채우면 사라지므로, 「5명 다 넣었는데 우월이 둘뿐」인 상태를 말할 자리가
  // 따로 있어야 한다 — 그 자리는 «틀린 대상»인 보스 카드다.
  if (deckIdx != null && code) {
    const cc = counterCount(uDeck(deckIdx));
    // **3버에 우월이 서 있으면 긋지 않는다** (유저 결정 2026-08-27). 딜러가 제 속성으로
    // 치고 있으면 나머지가 엉뚱해도 그 줄은 «이 보스용이 아니다»가 아니다 — 서포터를
    // 속성 맞춰 짜는 편성이 오히려 드물어서, 긋고 다니면 사선이 뜻을 잃는다.
    if (cc && cc.bad && !cc.main) {
      box.classList.add("boss-short");
      const fresh = !uShortWas.has(deckIdx);
      if (fresh && fxOn()) box.classList.add("wipe");             // 이번에 새로 걸렸다 (연출 켜졌을 때만)
      uShortWas.add(deckIdx);
      // 줄무늬를 **막대 하나씩** 만든다. 반복 그라디언트 한 장이면 «덮개가 미끄러지는»
      // 느낌뿐이라, 줄이 저마다 그어지게 하려면 요소가 따로 있어야 한다.
      // 회전한 상자 안에 가로 막대를 쌓아 두면 화면에서는 대각선 줄이 된다.
      const hatch = el("i", "boss-hatch");
      for (let k = 0; k < HATCH_BARS; k++) {
        const bar = el("b");
        bar.style.top = `${k * HATCH_GAP}px`;
        // **한 줄씩** 그어진다 — 시차를 넉넉히 벌려 앞 줄이 거의 다 그어진 뒤
        // 다음 줄이 시작한다. 각 줄은 제 오른쪽 위 끝에서 아래로 자란다
        // (transform-origin: 100% 50%). 손으로 «////»를 긋는 순서 그대로다.
        if (fresh) bar.style.animationDelay = `${140 + k * 34}ms`;
        hatch.append(bar);
      }
      box.append(hatch);
      box.style.setProperty("--want-c", CODE_VAR[cc.want] || "var(--color-stage-line)");
      // 숫자는 카드에 안 적는다 — 세 줄에 셋이 떠 있으면 시끄럽다. 몇 명 모자란지는
      // 툴팁이 답하고, 화면은 «걸렸다/아니다»만 말한다. 툴팁 본문은 아래에서
      // 카드 설명과 함께 붙인다(여기서 title을 쓰면 그쪽이 덮어쓴다).
      box.dataset.warn = T("{code} 보스는 {want}에 약합니다 — ", { code, want: cc.want })
        + T("엉뚱한 속성이 {wrong}명입니다 ({want} {n}명, ", { wrong: cc.wrong, want: cc.want, n: cc.n })
        + T("{UNION_COUNTER_MIN}명 이상 권장)", { UNION_COUNTER_MIN });
    } else {
      uShortWas.delete(deckIdx);      // 풀렸다 — 다음에 다시 걸리면 그때 다시 긋는다
    }
  }
  const art = el("div", "boss-art");
  // 이번 회차에 그 속성으로 나오는 랩처. 회차가 바뀌면 그림도 이름도 같이 바뀐다.
  const b = code ? bossOf(code) : null;
  if (b && b.art) {
    const im = el("img", "boss-img");
    im.src = `image/boss/${b.art}.webp`;
    im.alt = "";
    im.loading = "lazy";
    // 파일이 아직 없을 수도 있다(새 회차를 수집 전에 손으로 넣은 경우) — 깨진 그림
    // 아이콘 대신 이름으로 내려앉는다.
    im.onerror = () => { im.remove(); art.append(el("span", "boss-noart", b.name)); };
    art.append(im);
  } else if (b) {
    // 처음 나오는 랩처라 그림이 아직 없다. 이름만으로도 카드는 제 일을 한다.
    art.append(el("span", "boss-noart", b.name));
  } else {
    art.append(el("span", "u-plus", "+"));
  }
  box.append(art);
  // 속성 아이콘은 «무엇에 약한가»라 그림 위가 아니라 **카드 왼쪽 어깨**에 둔다 —
  // 랩처 그림을 가리지 않으면서 한눈에 갈린다.
  const f = ELEMENT_ICON[code];
  if (f) {
    const badge = el("img", "boss-code");
    badge.src = `image/icon/${f}`;
    badge.alt = code;
    badge.title = T("{code} 보스", { code });
    box.append(badge);
  }
  // 오른쪽 어깨에는 **약점 속성**을 배지로만 얹는다 — 「이 보스를 치는 속성」이
  // 편성을 짤 때 실제로 필요한 정보라, 보스 속성과 나란히 보여야 고르면서 헷갈리지
  // 않는다. 글자는 안 붙인다(카드 셋에 셋이 뜨면 시끄럽다).
  const want = COUNTER_OF[code];
  const wf = want && ELEMENT_ICON[want];
  if (wf) {
    const wb = el("img", "boss-want");
    wb.src = `image/icon/${wf}`;
    wb.alt = want;
    wb.title = T("{code} 보스는 {want}에 약합니다", { code, want });
    box.append(wb);
  }
  box.append(el("span", "boss-name", b ? b.name : (code || T("보스"))));
  if (pool) {
    box.draggable = true;
    box.title = T("{v}{code} 약점 — 덱 줄로 끌어다 놓으세요", { v: b ? T(b.name) + " · " : "", code });
    box.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", code);
      e.dataTransfer.effectAllowed = "copy";
      box.classList.add("dragging");
    });
    box.addEventListener("dragend", () => box.classList.remove("dragging"));
    box.onclick = () => { bossPick = bossPick === code ? null : code; renderBench(); };
    if (bossPick === code) box.classList.add("armed");
  } else {
    box.title = box.dataset.warn
      || T("{v}번 덱이 칠 보스 — 다른 줄로 끌면 서로 맞바꿉니다", { v: deckIdx + 1 });
    // 비우는 길 — 꽂기만 되고 뺄 수가 없었다. 니케 칸의 ✕와 같은 자리·같은 손버릇이다.
    if (code) {
      const x = el("button", "slot-x boss-x", "✕");
      x.type = "button";
      x.title = T("{v}번 줄 보스 비우기", { v: deckIdx + 1 });
      x.onclick = (e) => {
        e.stopPropagation();
        uSnap(T("{v}번 줄 보스 비우기", { v: deckIdx + 1 }));
        uDeck(deckIdx).weak = null;
        seasonPicks()[deckIdx] = null;   // 이 회차에 «안 골랐다»로 기억한다
        saveAll();
        renderBench();
      };
      box.append(x);
    }
    // 줄에 꽂힌 보스도 **끌 수 있다.** 풀에서 새로 꽂는 것과 같은 규약을 쓰되,
    // 어느 줄에서 왔는지를 함께 실어 정확히 그 줄과 맞바꾼다.
    box.draggable = true;
    box.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", `boss:${deckIdx}`);
      e.dataTransfer.effectAllowed = "move";
      box.classList.add("dragging");
      bossDropped = false;
    });
    box.addEventListener("dragend", () => {
      box.classList.remove("dragging");
      if (bossDropped) return;                  // 다른 줄에 놓였다 — 맞바꿈이 처리했다
      // 줄 밖으로 던졌다 = 비우기
      uSnap(T("{v}번 줄 보스 비우기", { v: deckIdx + 1 }));
      uDeck(deckIdx).weak = null;
      seasonPicks()[deckIdx] = null;
      saveAll();
      renderBench();
    });
    // 그냥 누르면 **아무 일도 안 일어난다.** 눌러서 속성이 한 칸씩 도는 것은
    // 「고른 적도 없는데 지멋대로 바뀐다」로 읽힌다 — 바꾸는 길은 왼쪽에서 고르거나
    // 끌어다 놓는 것, 둘뿐이어야 한다.
    box.onclick = () => { if (bossPick) onTake?.(bossPick); };
  }
  return box;
}

/** 유니온 덱 한 줄의 5칸. 솔로의 renderSlots와 **별개 함수**다 — 줄에 맞춘 크기,
 *  자기 저장소, 자기 드래그 규약을 쓴다. */
function renderUnionSlots(wrap, deckIdx) {
  const d = uDeck(deckIdx);
  wrap.textContent = "";
  d.names.forEach((name, idx) => {
    const slot = el("div", "u-slot" + (name ? " has" : ""));
    slot.dataset.udeck = String(deckIdx);
    slot.dataset.idx = String(idx);
    // 뺐든 바꿨든, 방금 손댄 자리라면 **그 칸에서** 되돌릴 수 있게 한다
    const spot = undoSpotAt(deckIdx, idx);
    if (spot) {
      slot.classList.add("has-undo");
      const back = el("button", "u-undo", "↩");
      back.type = "button";
      back.title = T("{label} — 되돌리기", { label: spot.label });
      back.onclick = (e) => { e.stopPropagation(); uUndoLast(); };
      slot.append(back);
    }
    if (name) {
      const c = card(name, { inSlot: true });
      // 유니온 칸에서는 **액자를 속성색으로** 든다. 이 화면에서 줄마다 따지는 것은
      // 등급이 아니라 «이 줄 보스에 우월한가»라서, 카드 다섯 장의 테두리만 훑어도
      // 속성이 맞는지 보여야 한다.
      const elem = byName.get(name)?.element;
      if (elem && CODE_VAR[elem]) c.style.setProperty("--frame", CODE_VAR[elem]);
      slot.append(c);
      // 칸에서 칸으로 끌어 옮긴다 — 로스터에서 끄는 것과 같은 손버릇이어야 한다
      slot.addEventListener("pointerdown",
        (e) => startDrag(e, name, { union: true, deckIdx, idx }));
      const x = el("button", "slot-x", "✕");
      x.type = "button"; x.title = T("슬롯 비우기");
      x.onclick = (e) => {
        e.stopPropagation();
        uSnap(T("{name} 빼기", { name }), { deckIdx, idx });
        d.names[idx] = null; saveAll(); renderBench();
      };
      slot.append(x);
    } else {
      // 빈 칸이 **무엇을 기다리는지** 스스로 말한다. 우월 속성이 아직 모자란 줄이면
      // 그 속성 아이콘을 옅게 깔아 둔다 — 떠 있는 경고 배지를 하나 더 얹는 대신,
      // 이미 «채워야 할 자리»인 곳이 답을 들고 있는 편이 손이 먼저 간다.
      const cc = counterCount(d);
      const f = cc && !cc.ok ? ELEMENT_ICON[cc.want] : null;
      if (f) {
        const hint = el("div", "u-want");
        hint.style.setProperty("--want-c", CODE_VAR[cc.want] || "var(--color-stage-line)");
        const im = el("img"); im.src = `image/icon/${f}`; im.alt = "";
        hint.append(im, el("span", "u-plus", "+"));
        hint.title = T("{v} 보스는 {want}에 약합니다 — ", { v: uWeak(d), want: cc.want })
          + T("{want} {UNION_COUNTER_MIN}명 이상 권장 (지금 {n}명)", { want: cc.want, UNION_COUNTER_MIN, n: cc.n });
        slot.append(hint);
      } else {
        slot.append(el("span", "u-plus", "+"));
      }
    }
    slot.onclick = () => {
      // 집어 든 카드가 있으면 그걸 놓는다. 없으면 **찾아서 꽂는 시트**를 연다 —
      // 빈 칸을 눌렀는데 아무 일도 안 일어나면 무엇을 해야 할지 알 수 없다.
      if (picked) {
        uSnap(T("{picked} 배치", { picked }));
        d.names[idx] = picked; picked = null; setStatus("");
        saveAll(); renderBench();
        slamSlot(deckIdx, idx);
        return;
      }
      if (!d.names[idx]) openPick(deckIdx, idx);
    };
    // 카드 아래 3줄 — 큐브 종류·레벨·컨트롤. 솔로와 같은 구성이어야 같은 손버릇으로
    // 쓸 수 있다. 다만 저장소는 유니온 것을 본다.
    const cell = el("div", "u-cell");
    cell.append(slot, cubeCell(d, idx));
    const more = el("button", "slot-more" + (uCtrlOpen === name ? " on" : ""));
    more.type = "button";
    if (name) {
      const on = Object.keys(d.control?.[name] || {}).length;
      more.append(el("span", null, on ? T("컨트롤 {on}", { on }) : T("컨트롤")));
      more.append(el("i", null, "▾"));
      if (on) more.classList.add("has");
      more.title = T("{name} 컨트롤 설정", { name });
      more.onclick = (e) => {
        e.stopPropagation();
        if (uCtrlOpen === name) { closeUnionCtrl(); return; }
        openUnionCtrl(name);
      };
    } else {
      more.classList.add("slot-more-gap");
      more.setAttribute("aria-hidden", "true");
      more.append(el("span", null, "컨트롤"));
    }
    cell.append(more);
    wrap.append(cell);
  });
}

// 클릭으로 고른 보스(끌기 대안). 고른 상태에서 줄을 누르면 그 줄에 들어간다.
let bossPick = null;
let uCtrlOpen = null;   // 유니온에서 컨트롤을 펼친 니케

function wireUnion() {
  const lv = $("#union-level");
  if (lv) lv.onchange = () => {
    const v = Number(lv.value);
    const want = (Number.isFinite(v) && v > 0) ? Math.round(v) : null;
    // 칸은 하나지만 값은 모드마다 따로다 — 뮤지엄 레벨을 유니온에 쓰지 않는다.
    if (modeNow() === "museum") {
      M().level = want;
      lv.value = M().level ?? "";
      renderMuseumBar(); saveAll(); renderAll();
      return;
    }
    state.settings.unionLevel = want;
    lv.value = state.settings.unionLevel ?? "";
    renderUnionBar(); saveAll(); renderAll();
  };
}

/** 니케 한 명 얼굴. 순위 표에서 이름만 있으면 누가 누군지 훑기 어렵다. */
function faceOne(name) {
  const th = el("span", "cmp-art");
  const rec = byName.get(name);
  if (rec?.img) {
    const im = el("img");
    im.src = artSrc(rec, name);
    im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
    th.append(im);
  }
  return th;
}

// 캐릭터 하나당 값 하나인 육성 경고 — 스킬 레벨·애장품 단계·미육성. 쉼표로 나열한
// 문장 대신 초상화 카드로 보여준다(버프 대상과 같은 결 — 유저 피드백).
const GF_GROUPS = [
  ["low_skill", T("스킬 레벨 낮음")],
  ["low_favorite", T("애장품 단계 낮음")],
  ["ungrown", T("미육성 (프로필에 없음)")],
];

/** 카드 한 칸의 아래 값 표시. 그룹마다 재는 값이 다르다. */
function gfCardValue(group, item) {
  if (group === "low_skill") {
    const lv = item.levels || {};
    return `${lv["1"] ?? "-"}/${lv["2"] ?? "-"}/${lv["3"] ?? "-"}`;
  }
  if (group === "low_favorite") return T("{stage}단계", { stage: item.stage });
  return T("미육성");
}

function renderGrowthFlags(gf) {
  const box = $("#deck-growth-flags");
  if (!box) return;
  box.textContent = "";
  if (!gf) { box.hidden = true; return; }
  const groups = GF_GROUPS
    .map(([key, label]) => [key, label, gf[key] || []])
    .filter(([, , items]) => items.length);
  if (!groups.length) { box.hidden = true; return; }
  box.hidden = false;
  for (const [key, label, items] of groups) {
    const grp = el("div", "gf-group");
    grp.append(el("span", "gf-group-label", label));
    const cards = el("div", "gf-cards");
    for (const item of items) {
      const card = el("div", "gf-card");
      card.append(faceOne(item.name));
      card.append(el("span", "gf-card-nm", item.name));
      card.append(el("span", "gf-card-v", gfCardValue(key, item)));
      cards.append(card);
    }
    grp.append(cards);
    box.append(grp);
  }
}

const OL_STAT_LABEL = {
  crit_rate: T("크리티컬 확률"), crit_dmg: T("크리티컬 대미지"), atk_pct: T("공격력"),
  atk_dmg_pct: T("공격 대미지"), charge_dmg_pct: T("차지 대미지"),
  charge_speed_pct: T("차지 속도"), max_ammo_pct: T("최대 장탄"), accuracy_pct: T("명중률"),
  charge_speed_caster_based_pct: T("차지 속도 (시전자 기준)"),
  atk_caster_based_pct: T("공격력 (시전자 기준)"), atk_flat: T("공격력(고정)"),
};

function openTopAtk(title, cases) {
  const dlg = $("#topatk-sheet");
  const body = $("#topatk-body");
  if (!dlg || !body) return;
  $("#topatk-t").textContent = title;
  body.textContent = "";

  // `textContent`라 마크다운이 글자로 나온다 — 강조는 요소로 만든다
  const low = cases.every((c) => c.kind === "low");
  const lead = el("p", "prose prose-sm", low
    ? T("「최종 공격력이 가장 «낮은» 기본 버스트 3단계 아군 N기에게」 거는 버프입니다. 대상은 ")
    // **«자신을 제외한»이라고 단정하지 않는다** — 자신도 함께 받는 니케가 있다
    // (맥스웰·소다 : 트윙클링 바니). 여기서는 어느 니케인지 모르므로 둘 다 아우른다.
    : T("「최종 공격력이 가장 높은 아군 N기에게」 거는 버프입니다(니케에 따라 자신도 함께 받습니다). 대상은 "));
  lead.append(el("b", null, "버프가 걸리는 그 순간의 최종 공격력"));
  lead.append(el("span", null,
    T("으로 정해집니다 — 소지 공격력이 아니라, 그때까지 걸린 버프(자기 버스트 자버프 포함)를")
    + T(" 다 더한 값입니다.")));
  body.append(lead);

  // 사이클에 못 붙은 것만 있으면 «왜»를 말해 준다. 「사이클 밖 · 3버 없음」만 적어 두면
  // 화면이 무슨 말을 하는지 알 수가 없다 — 실제로 이 자리에서 막혔다.
  const names0 = deckOf(state.settings.deck).names.filter(Boolean);
  const st0 = burstStages(names0);
  if (!cases.some((c) => c.cycles && c.cycles.length)) {
    const why = el("p", "share-pick-note warn");
    why.textContent = st0.ok
      ? T("이 계산에서는 풀버스트가 열리지 않아 사이클에 묶이지 않았습니다.")
      : T("{v} 버스트가 없어 **풀버스트가 열리지", { v: st0.missing.map((x) => x + T("단계")).join("·") })
        + T(" 않습니다.** 아래는 버스트만 발동한 결과이고, 풀버스트가 열려야 걸리는")
        + T(" 버프는 발동하지 않았습니다.");
    why.textContent = why.textContent.replace(/\*\*/g, "");
    body.append(why);
  }

  // 버프별로 묶는다 — 같은 버프의 사이클별 차이를 나란히 봐야 읽힌다
  const byBuff = new Map();
  for (const c of cases) {
    if (!byBuff.has(c.buff)) byBuff.set(c.buff, []);
    byBuff.get(c.buff).push(c);
  }

  for (const [buff, list] of byBuff) {
    const blk = el("div", "ta-buff");
    const h = el("div", "ta-buff-h");
    h.append(el("b", null, `${list[0].caster} 「${buff}」`));
    h.append(el("span", "ta-stat",
      `${OL_STAT_LABEL[list[0].stat] || list[0].stat || T("효과")}`
      + T(" · {v} {v1}기", { v: low ? T("하위") : T("상위"), v1: list[0].slots })));
    blk.append(h);

    for (const c of list) {
      const cs = el("div", "ta-case" + (!low && c.dealer_got === false ? " miss" : ""));
      const ch = el("div", "ta-case-h");
      ch.append(el("span", "ta-cyc",
        c.cycles.length ? T("사이클 {v}", { v: c.cycles.join("·") }) : T("풀버스트 밖")));
      if (c.dealer && low) {
        // 최저공 버프는 «그 사이클의 3버»가 받아야 하는 것이 아니다 — 3버 중 최저가
        // 받는다. 여기에 ✔/✘를 붙이면 정상 동작이 실패처럼 읽힌다.
        ch.append(el("span", "ta-dealer", T("그 사이클 3버: {dealer}", { dealer: c.dealer })));
      } else if (c.dealer) {
        ch.append(el("span", "ta-dealer", T("3버 {dealer}", { dealer: c.dealer })));
        ch.append(el("span", "ta-mark" + (c.dealer_got ? " ok" : " miss"),
          c.dealer_got ? T("✔ 3버가 받음") : T("✘ 3버가 못 받음")));
      } else {
        ch.append(el("span", "ta-dealer",
          T("풀버스트가 없어 «그 사이클의 3버»를 가릴 수 없습니다")));
      }
      cs.append(ch);

      for (const e of c.ranking) {
        const row = el("div", "ta-row" + (e.got ? " got" : ""));
        row.append(faceOne(e.name));
        row.append(el("span", "ta-nm", e.name));
        const v = el("span", "ta-atk", e.atk.toLocaleString("ko-KR"));
        v.title = T("소지 공격력 {v}", { v: e.base.toLocaleString("ko-KR") });
        row.append(v);
        if (e.got) {
          row.append(el("span", "ta-need got", "받음"));
        } else if (e.tie) {
          row.append(el("span", "ta-need tie", "동점 — 순서로 밀림"));
        } else if (e.need != null) {
          // 최저공은 «내려야» 받는다 — 부호를 뒤집어 적지 않으면 정반대로 읽힌다
          row.append(el("span", "ta-need", low
            ? T("공증 −{v}%p 내려야", { v: e.need.toFixed(1) })
            : T("공증 +{v}%p 필요", { v: e.need.toFixed(1) })));
        } else {
          row.append(el("span", "ta-need", ""));
        }
        cs.append(row);
      }
      blk.append(cs);
    }
    body.append(blk);
  }

  body.append(el("p", "prose prose-sm", low
    ? T("«공증 −N%p 내려야»는 오버로드 공격력 증가 기준입니다 —")
      + T(" (내 최종 공격력 − 커트라인) ÷ 내 소지 공격력.")
    : T("«공증 +N%p 필요»는 오버로드 공격력 증가 기준입니다 —")
      + T(" (커트라인 최종 공격력 − 내 최종 공격력) ÷ 내 소지 공격력.")));

  $("#topatk-x").onclick = () => dlg.close();
  $("#topatk-close").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

// ── 프리셋 ──────────────────────────────────────────────────────────────
// 기록(records)과 **다른 물건이다.** 기록은 «그때 그 계정으로 계산한 결과»의 스냅샷이라
// 계정이 바뀌면 낡는다. 프리셋은 편성과 운용만 담아 계정과 무관하게 계속 유효하다.
// 그래서 결과(total·chars)를 **일부러 담지 않는다** — 담으면 「저장된 수치」가 지금 내
// 수치인지 매번 의심해야 한다.
//
// 두 종류를 **한 배열에** 담는다. 목록·삭제·파일 입출력이 전부 같은 코드를 타고,
// 다른 점은 `kind`와 `decks`의 길이뿐이다:
//   single — 덱 하나(5인 조합). 「이 조합」을 모아 두는 용도
//   bundle — 여러 덱을 한 이름으로. 「26년 8월 작열 솔레」처럼 그 주의 편성 전체
// 묶음은 5덱일 필요가 없다 — 저장할 때 **빈 덱은 버린다**.

const PRESET_KINDS = { single: T("단일"), bundle: T("묶음") };

/** 지금 편성에서 프리셋 한 장을 만든다.
 *
 *  **담는 것은 니케 이름뿐이다.** 컨트롤(운용)도, 조건(약점 코드·전투 시간·레이드 설정)도
 *  넣지 않는다 — 프리셋은 «이 조합»이고, 운용과 조건은 그때그때 화면에서 정하는 것이다.
 *  담아 두면 꺼낼 때마다 지금 보고 있는 설정이 조용히 갈린다. */
function currentPreset(name, kind, withBoss = true, only = null) {
  const union = modeNow() === "union";
  // 유니온에는 «지금 고른 덱»이 없다 — 세 줄이 한 화면에 다 있다. 「덱 하나만」은
  // 마지막으로 손댄 줄(레이드 설정을 연 줄)을 뜻하게 한다.
  const cur = union ? uBattleRow : state.settings.deck;
  // `only`(덱 번호 목록)가 있으면 그 덱만 — 묶음 저장 시트에서 줄을 골라 담는 길이다.
  const idx = (kind === "single"
    ? [cur]
    : [...Array(deckCountNow()).keys()].filter((i) => deckAt(i).names.some(Boolean)))
    .filter((i) => !only || only.includes(i));
  return {
    id: uid(),
    name,
    kind,
    mode: union ? "union" : "solo",
    at: new Date().toISOString(),
    // 유니온은 편성만으로는 되살릴 수 없다 — **어느 보스를 어떤 조건으로 쳤는지**가
    // 곧 그 편성의 뜻이다. 보스 속성과 그 줄의 레이드 설정을 함께 담는다.
    decks: idx.map((i) => {
      const d = deckAt(i);
      const out = { names: [...d.names] };
      // 보스·레이드 설정은 **담기로 했을 때만**(유저 지시 2026-08-28). 프리셋을 «조합»
      // 으로만 쓰고 싶은 사람이 있는데, 늘 담으면 불러올 때마다 남의 보스 조건이 따라온다.
      if (union && withBoss) {
        out.weak = d.weak || null;
        out.battle = d.battle ? JSON.parse(JSON.stringify(d.battle)) : null;
      }
      return out;
    }),
  };
}

/** 니케 얼굴 띠.
 *
 *  이름 줄만으로는 «어떤 조합인지»가 한눈에 안 들어온다 — 목록에서 고르는 자리에는
 *  얼굴이 있어야 한다. 다만 초상화는 256×512(1:2)라 그대로 넣으면 목록이 세로로
 *  길어지므로, 기록 탭이 쓰는 얼굴 크롭(`object-position: center 16%`)으로 자른다.
 *  이름은 아래에 작게 붙이고 전체 이름은 `title`에 둔다 — 38px에서는 세 글자면
 *  잘리지만, 얼굴과 함께 보면 그걸로 충분히 알아본다. */
function faceStrip(names, opts = {}) {
  const wrap = el("div", "face-strip");
  for (const n of names.slice(0, SLOTS)) {
    const cell = el("span", "face" + (n ? "" : " empty"));
    cell.title = n || T("빈 자리");
    const rec = n ? byName.get(n) : null;
    if (rec?.img) {
      const im = el("img");
      im.src = artSrc(rec, n);
      im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
      cell.append(im);
    } else {
      // 로스터에 없는 니케(내 계정 밖·미출시)는 그림이 없다 — 빈 칸으로 두지 않고 표시한다
      cell.append(el("span", "face-none", n ? "?" : ""));
    }
    if (opts.labels !== false) cell.append(el("span", "face-nm", n || ""));
    wrap.append(cell);
  }
  return wrap;
}

const presetHeads = (p) => (p.decks || []).reduce((n, d) => n + d.names.filter(Boolean).length, 0);
const presetIsSingle = (p) => (p.kind || (p.decks?.length === 1 ? "single" : "bundle")) === "single";

/** 저장 이름의 기본값.
 *
 *  묶음은 **언제·무엇을 위한 편성인지**가 이름의 전부다(「26년 8월 작열 솔레」).
 *  단일은 조합을 알아볼 수 있어야 하니 대표 니케를 쓴다. */
function autoPresetName(kind) {
  const union = modeNow() === "union";
  // 유니온은 «약점 코드» 하나로 묶이지 않는다 — 줄마다 보스가 다르다. 회차 이름이
  // 그 편성이 무엇을 위한 것인지를 가장 잘 말해 준다.
  const code = union ? unionSeason().label : (state.settings.code || T("속성없음"));
  if (kind === "bundle") {
    const d = new Date();
    const what = union ? T("유니온") : T("솔레");
    return T("{v}년 {v1}월 {code} {what}", { v: String(d.getFullYear()).slice(2), v1: d.getMonth() + 1, code, what });
  }
  const cur = union ? uBattleRow : state.settings.deck;
  const names = deckAt(cur).names.filter(Boolean);
  const head = union ? T("{v} 줄", { v: uWeak(uDeck(cur)) || code }) : code;
  if (!names.length) return T("{head} 빈 덱", { head });
  return names.length > 1 ? T("{head} · {v} 외 {v1}명", { head, v: names[0], v1: names.length - 1 }) : `${head} · ${names[0]}`;
}

// ── 저장 시트 ───────────────────────────────────────────────────────────

function openPresetSave(kind) {
  const dlg = $("#preset-save-sheet");
  const body = $("#preset-save-body");
  const go = $("#preset-save-go");
  if (!dlg || !body || !go) return;

  const cur0 = modeNow() === "union" ? uBattleRow : state.settings.deck;
  const filled = kind === "single"
    ? (deckAt(cur0).names.some(Boolean) ? [cur0] : [])
    : [...Array(deckCountNow()).keys()].filter((i) => deckAt(i).names.some(Boolean));
  if (!filled.length) {
    // **탭을 옮기지 않는다.** 저장할 게 없다는 말을 들으려고 다른 화면으로 끌려갈 이유가
    // 없다 — 사용자는 편성을 채우려고 여기 있다.
    flashStatus(kind === "single"
      ? T("지금 덱이 비어 있습니다 — 먼저 니케를 배치하세요.")
      : T("저장할 편성이 없습니다 — 먼저 니케를 배치하세요."));
    return;
  }

  $("#preset-save-t").textContent = modeNow() === "union"
    ? (kind === "single" ? T("프리셋 저장 — {v}번 줄", { v: cur0 + 1 }) : T("프리셋 묶음 저장 — 세 줄"))
    : (kind === "single" ? T("프리셋 저장 (단일)") : T("묶음 저장"));
  body.textContent = "";

  const row = el("div", "preset-name-row");
  row.append(el("span", "field-label", "이름"));
  const inp = el("input", "preset-name-in");
  inp.type = "text";
  inp.maxLength = PRESET_NAME_MAX;
  inp.autocomplete = "off";
  inp.value = autoPresetName(kind);
  inp.setAttribute("aria-label", T("프리셋 이름"));
  row.append(inp);
  body.append(row);

  // `textContent`라 마크다운이 그대로 글자로 나온다 — 강조는 요소로 만든다
  // **deckAt**이다. deckOf(솔로 덱)로 읽으면 유니온에서 저장을 열었을 때 미리보기에
  // 솔로 1~3덱이 뜬다 — 저장되는 내용(currentPreset)과 화면이 어긋난다(실측).
  const union = modeNow() === "union";
  const heads = filled.reduce((n, i) => n + deckAt(i).names.filter(Boolean).length, 0);
  const unit = union ? T("줄") : T("덱");
  const note = el("p", "prose prose-sm", T("담기는 것: {length}{unit} {heads}명 — ", { length: filled.length, unit, heads }));
  if (union) {
    note.append(el("b", null, "편성과 보스·레이드 설정"));
    note.append(el("span", null, "을 담습니다. 컨트롤·계산 결과는 담지 않습니다."));
  } else {
    note.append(el("b", null, "편성만"));
    note.append(el("span", null, " 담습니다. 컨트롤·전투 조건·계산 결과는 담지 않습니다."));
  }
  body.append(note);

  // 묶음이면 줄마다 체크로 **담을 줄을 고른다** — 줄별 «프리셋 저장» 단추를 뺀 대신이다(유저 지시
  // 2026-09-02: 줄 단추가 늘어 화면이 길어졌다). 기본은 전부 담긴다.
  const chosen = new Set(filled);
  const pickable = kind !== "single" && filled.length > 1;
  const list = el("div", "preset-lines");
  for (const i of filled) {
    const names = deckAt(i).names;
    const line = el("div", "preset-line" + (pickable ? " pickable" : ""));
    if (pickable) {
      const ck = el("input", "preset-pick");
      ck.type = "checkbox";
      ck.checked = true;
      ck.title = T("이 줄을 담습니다");
      ck.onchange = () => {
        if (ck.checked) chosen.add(i); else chosen.delete(i);
        line.classList.toggle("off", !ck.checked);
        go.disabled = !chosen.size || !inp.value.trim();
      };
      line.append(ck);
    }
    line.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
    if (union) {
      const w = uWeak(uDeck(i));
      line.append(el("span", "preset-boss", w ? (bossOf(w)?.name || w) : T("보스 없음")));
    }
    line.append(faceStrip(names));
    const n = names.filter(Boolean).length;
    if (n < SLOTS) line.append(el("span", "prof-meta", `${n}/5`));
    list.append(line);
  }
  body.append(list);

  const dup = el("p", "share-pick-note warn");
  dup.hidden = true;
  body.append(dup);

  // 유니온 프리셋은 «어느 보스를 어떤 조건으로 쳤나»까지가 한 벌이다 — 기본은 담는다.
  // **저장 단추 바로 위**에 둔다(유저 지시) — 목록 사이에 끼워 두면 지나친다.
  let withBoss = true;
  if (union) {
    const lab = el("label", "share-opt share-opt-strong");
    const ck = el("input");
    ck.type = "checkbox";
    ck.checked = true;
    ck.onchange = () => { withBoss = ck.checked; };
    lab.append(ck, el("span", null, T("보스 설정도 함께 저장")));
    lab.title = T("어느 줄에 어느 보스를 올렸는지와 그 줄의 방어력·구간까지 담습니다");
    body.append(lab);
  }
  const syncDup = () => {
    const nm = inp.value.trim();
    const hit = presetsNow().find((x) => x.name === nm);
    dup.hidden = !hit;
    if (hit) {
      dup.textContent = T("같은 이름의 {v} 프리셋이 있습니다", { v: PRESET_KINDS[hit.kind] || "" })
        + T(" — «{v}»으로 저장합니다. 덮어쓰지 않습니다.", { v: uniquePresetName(nm) });
    }
    go.disabled = !nm || !chosen.size;
  };
  inp.oninput = syncDup;
  syncDup();

  const close = () => dlg.close();
  $("#preset-save-x").onclick = close;
  $("#preset-save-cancel").onclick = close;
  const commit = () => {
    const name = inp.value.trim().slice(0, PRESET_NAME_MAX);
    if (!name) return;
    savePreset(name, kind, withBoss, [...chosen].sort((a, b) => a - b));
    close();
  };
  go.onclick = commit;
  inp.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();               // 엔터가 폼을 제출해 화면이 새로 뜨지 않게
    commit();
  };
  if (!dlg.open) dlg.showModal();
  inp.focus();
  inp.select();
}

/** 같은 이름이 있으면 «이름 (1)»·«이름 (2)»로 비켜 준다 — 윈도우가 파일을 겹칠 때처럼.
 *
 *  덮어쓰기는 되돌릴 수 없다. 이름을 재활용하려는 것인지, 그냥 같은 이름이 떠오른
 *  것인지 저장 단추 하나로는 갈라낼 수 없으므로 **잃는 쪽을 고르지 않는다.**
 *  진짜로 바꿔 치우려면 프리셋 탭에서 지우고 저장하면 된다. */
function uniquePresetName(base) {
  const taken = new Set(presetsNow().map((x) => x.name));
  if (!taken.has(base)) return base;
  for (let i = 1; i < 1000; i++) {
    const cand = `${base} (${i})`;
    if (!taken.has(cand)) return cand;
  }
  return `${base} (${uid()})`;
}

function savePreset(want, kind, withBoss = true, only = null) {
  if (presetsNow().length >= PRESET_MAX) {
    // 이건 «프리셋 탭에서 지워야» 해결되는 일이라 그쪽으로 안내한다
    presetMsg(T("프리셋은 {PRESET_MAX}개까지 저장합니다 — 쓰지 않는 것을 먼저 지우세요.", { PRESET_MAX }), "err");
    flashStatus(T("프리셋이 {PRESET_MAX}개로 찼습니다 — «프리셋» 탭에서 지우세요.", { PRESET_MAX }));
    return;
  }
  hit("프리셋 저장");
  const name = uniquePresetName(want);
  const next = currentPreset(name, kind, withBoss, only);
  presetsNow().unshift(next);
  saveAll();
  renderPresets();
  presetMsg(T("«{name}»에 저장했습니다", { name })
            + (name === want ? "" : T(" — «{want}»이 이미 있어 이름을 비켰습니다", { want }))
            + T(" — {v} · {length}덱 {v1}명.", { v: PRESET_KINDS[kind], length: next.decks.length, v1: presetHeads(next) }), "ok");
  flashStatus(T("프리셋 «{name}» 저장 — «프리셋» 탭에 있습니다.", { name }));
}

// ── 가져오기 시트 ───────────────────────────────────────────────────────
// 공유 페이지의 «전부 가져오기»와 같은 문제를 푼다: **되돌릴 수 없는 조작이라 미리
// 보여 준다.** 다른 점은 프리셋은 5덱이 아닐 수 있어서 «어느 덱으로»를 짝지어야 하는
// 것이다 — 그래서 행마다 대상 덱 고르개를 둔다.

function openPresetLoad(p, opts = {}) {
  const sink = opts.sink || presetMsg;
  const dlg = $("#preset-load-sheet");
  const body = $("#preset-load-body");
  const go = $("#preset-load-go");
  if (!dlg || !body || !go) return;

  const decks = (p.decks || []).filter((d) => d.names.some(Boolean));
  if (!decks.length) { sink(T("불러올 편성이 없습니다."), "err"); return; }

  // 기본 짝: 앞에서부터 1덱·2덱·… 단일은 «지금 보고 있는 덱»이 기본이다.
  const pick = decks.map((_, i) => (decks.length === 1 ? state.settings.deck : i));
  const on = decks.map(() => true);

  $("#preset-load-t").textContent = T("«{name}» 가져오기", { name: p.name });
  // 보스가 담긴 프리셋이면 **받는 쪽이 고른다** — 편성만 쓰고 싶을 때가 있다(유저 지시).
  const hasBoss = modeNow() === "union" && decks.some((d) => d && (d.weak || d.battle));
  let withBoss = hasBoss;

  const paint = () => {
    body.textContent = "";
    body.append(el("p", "prose prose-sm",
      T("고른 덱이 내 덱을 덮습니다. 들어가는 것은 편성뿐이라 컨트롤은 «전부 자동»이 되고, 큐브는 계정에서 그 니케가 끼고 있는 것으로 채웁니다(안 낀 니케는 기본값).")
      + (p.cond
        ? T(" 약점 코드·전투 시간은 이 기록의 값({v} · {duration}초)으로 되돌립니다.", { v: p.cond.code || T("속성없음"), duration: p.cond.duration })
        : T(" 약점 코드·전투 조건은 지금 화면의 값을 그대로 씁니다."))));

    if (hasBoss) {
      body.append(el("p", "prose prose-sm",
        T("이 프리셋에는 보스와 레이드 설정도 담겨 있습니다 — 무엇을 가져올지 고르세요.")));
      const opt = el("div", "share-boss-opt");
      for (const [v, label] of [[true, T("편성 + 보스 설정")], [false, T("편성만")]]) {
        const chip = el("button", "chip" + (withBoss === v ? " on" : ""), label);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(withBoss === v));
        chip.title = v ? T("어느 줄에 어느 보스를 올렸는지와 그 줄의 방어력·구간까지 들어갑니다")
                       : T("지금 걸어 둔 보스와 레이드 설정은 그대로 둡니다");
        chip.onclick = () => { withBoss = v; paint(); };
        opt.append(chip);
      }
      body.append(opt);
    }

    const rows = el("div", "share-pairs");
    decks.forEach((d, i) => {
      // **행 전체가 누르는 자리다.** 왼쪽 체크만 반응하면 어디를 눌러야 하는지 매번
      // 겨냥해야 한다. 대상 고르개(select)만 예외로 두어 클릭이 새어 올라오지 않게 한다.
      const row = el("div", "share-pair pick" + (on[i] ? " on" : ""));
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", String(on[i]));
      row.tabIndex = 0;
      const toggle = () => {
        on[i] = !on[i];
        if (on[i]) dedupeTargets(pick, on, i);      // 켜면서 자리가 겹칠 수 있다
        paint();
      };
      row.onclick = toggle;
      row.onkeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      };

      row.append(el("span", "share-pair-ck", on[i] ? "✓" : ""));
      row.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));

      const mid = el("span", "share-pair-mid");
      mid.append(faceStrip(d.names));
      const mine = (state.decks[pick[i]]?.names || []).filter(Boolean);
      mid.append(el("span", "share-pair-dst" + (on[i] ? " on" : ""),
        on[i] ? T("지금 {v}덱: {v1}", { v: pick[i] + 1, v1: mine.length ? mine.map((n) => T(n)).join(" · ") : T("빈 덱") })
              : T("가져오지 않습니다")));
      row.append(mid);

      const sel = el("select", "preset-target");
      for (let t = 0; t < deckCountNow(); t++) {
        const o = el("option", null, modeNow() === "union" ? T("내 {v}번 줄", { v: t + 1 }) : T("내 {v}덱", { v: t + 1 }));
        o.value = String(t);
        sel.append(o);
      }
      sel.value = String(pick[i]);
      sel.disabled = !on[i];
      sel.setAttribute("aria-label", T("{v}번 편성을 넣을 덱", { v: i + 1 }));
      sel.onchange = () => {
        pick[i] = Number(sel.value);
        dedupeTargets(pick, on, i);                 // 그 덱을 쓰던 행은 빈 자리로 밀린다
        paint();
      };
      // 고르개를 누른 것이 «행 끄기»로 읽히면 안 된다
      for (const ev of ["click", "keydown", "pointerdown"]) {
        sel.addEventListener(ev, (e) => e.stopPropagation());
      }
      row.append(sel);

      rows.append(row);
    });
    body.append(rows);

    // 미리보기 — 무엇이 비워지고 무엇이 빈 자리로 남는가
    const sel = decks.map((d, i) => ({ d, t: pick[i] })).filter((_, i) => on[i]);
    const notes = el("div", "share-sheet-notes");

    const seen = new Map();
    for (const { t } of sel) seen.set(t, (seen.get(t) || 0) + 1);
    // `dedupeTargets`가 고를 때마다 풀어 주므로 평소에는 걸리지 않는다 — 안전망이다
    const clash = [...seen].filter(([, c]) => c > 1).map(([t]) => T("{v}덱", { v: t + 1 }));
    if (clash.length) {
      notes.append(el("p", "share-pick-note warn",
        T("{v}에 두 개가 겹칩니다 — 서로 다른 덱을 고르세요.", { v: clash.join(" · ") })));
    }

    // 밀려나는 편성이 어디로 가는지 — 고른 조합에 따라 달라지므로 매번 다시 센다
    const plan = planDisplaced(sel.map(({ t }) => t));
    if (plan.shifted.length) {
      notes.append(el("p", "share-pick-note",
        T("지금 그 덱에 있는 편성은 {v}", { v: plan.shifted.map((x) => T("{v}덱→{v1}덱", { v: x.from + 1, v1: x.to + 1 })).join(" · ") })
        + T("으로 옮깁니다.")));
    }
    if (plan.lost.length) {
      notes.append(el("p", "share-pick-note warn",
        T("빈 덱이 없어 {v}의 편성은 사라집니다.", { v: plan.lost.map((t) => T("{v}덱", { v: t + 1 })).join(" · ") })));
    }

    const names = sel.flatMap(({ d }) => d.names.filter(Boolean));
    const missing = [...new Set(names.filter((n) => !haveChar(n)))];
    const want = new Set(names.filter(haveChar));
    const targets = new Set(sel.map(({ t }) => t));
    const emptied = new Map();
    for (let i = 0; i < deckCountNow(); i++) {
      if (targets.has(i)) continue;
      for (const nm of (deckAt(i)?.names || [])) {
        if (!nm || !want.has(nm)) continue;
        if (!emptied.has(i)) emptied.set(i, []);
        emptied.get(i).push(nm);
      }
    }
    if (emptied.size) {
      const where = [...emptied.entries()].sort((a, b) => a[0] - b[0])
        .map(([d, ns]) => T("{v}덱에서 {v1}", { v: d + 1, v1: briefNames([...new Set(ns)]) })).join(", ");
      notes.append(el("p", "share-pick-note warn",
        T("덱 간 중복이라 {where}{v} 비웁니다.", { where, v: eul(where) })));
    }
    if (missing.length) {
      notes.append(el("p", "share-pick-note",
        T("내 계정에 없는 {length}명은 빈 자리로 들어갑니다 — {v}.", { length: missing.length, v: briefNames(missing) })));
    }
    if (!sel.length) notes.append(el("p", "share-pick-note warn", "가져올 덱을 하나 이상 고르세요."));
    body.append(notes);

    go.disabled = !sel.length || clash.length > 0;
    go.textContent = sel.length > 1 ? T("{length}덱 가져오기", { length: sel.length }) : T("가져오기");
  };
  paint();

  const close = () => dlg.close();
  $("#preset-load-x").onclick = close;
  $("#preset-load-cancel").onclick = close;
  go.onclick = () => {
    const entries = decks.map((d, i) => ({ names: d.names, target: pick[i],
                                          ...(withBoss ? { weak: d.weak || null,
                                                           battle: d.battle || null } : {}) }))
      .filter((_, i) => on[i]);
    if (!entries.length) return;
    close();
    hit("프리셋 불러오기");
    const res = importMapped(entries, p.cond ? { cond: p.cond } : {});
    const kind = res.missing.length || res.moved.length || res.dup?.length ? "warn" : "ok";
    const where = entries.map((e) => T("{v}덱", { v: e.target + 1 })).join(" · ");
    sink(T("«{name}» → {where}에 {v}", { name: p.name, where, v: importReport(res) }), kind);
    flashStatus(T("«{name}» → {where}. 수치는 다시 계산해야 합니다.", { name: p.name, where }));
    document.querySelector('.tab[data-tab="deck"]')?.click();
  };
  if (!dlg.open) dlg.showModal();
}

// ── 목록 ────────────────────────────────────────────────────────────────

/** 펴 둔 프리셋. **다시 그려도 남게** 밖에 둔다 — 목록은 이름 변경·삭제마다 통째로
 *  다시 그려지므로, 안에 두면 뭘 한 번 할 때마다 도로 접힌다. */
const presetOpen = new Set();

/** 폴더 칩 줄 — 프리셋과 기록이 **같은 코드를 쓴다.** 두 벌 두면 한쪽만 고쳐진다.
 *
 *  `ctx`는 그 탭이 무엇을 다루는지만 알려 준다:
 *    list()      지금 모드의 항목 배열        folders()  그 모드의 폴더 배열
 *    setFolders(v)                           filter/setFilter  칩 고름 상태
 *    redraw()    다시 그리기                  msg(text, kind)   알림
 *  «드래그로 넣기»는 항목 카드가 `dragItem`에 id를 넣어 두면 여기서 받는다. */
function folderChips(host, ctx) {
  const row = el("div", "chips folder-row");
  const drop = (chip, folderId) => {
    chip.addEventListener("dragover", (e) => {
      if (!dragItem) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      chip.classList.add("chip-drop");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("chip-drop"));
    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      chip.classList.remove("chip-drop");
      const it = ctx.list().find((x) => x.id === dragItem);
      dragItem = null;
      if (!it) return;
      if (folderId) it.folder = folderId; else delete it.folder;
      saveAll(); ctx.redraw();
      const f = ctx.folders().find((x) => x.id === folderId);
      ctx.msg(folderId
        ? T("«{name}»을 «{v}»에 넣었습니다.", { name: it.name || "", v: f ? f.name : "" })
        : T("«{name}»을 폴더에서 뺐습니다.", { name: it.name || "" }), "ok");
    });
  };
  for (const f of ctx.folders()) {
    const n = ctx.list().filter((x) => x.folder === f.id).length;
    const key = `f:${f.id}`;
    const b = el("button", "chip chip-folder" + (ctx.filter() === key ? " on" : ""),
      `${f.name} ${n}`);
    b.type = "button";
    b.onclick = () => { ctx.setFilter(key); ctx.redraw(); };
    drop(b, f.id);
    row.append(b);
  }
  if (ctx.folders().length < PRESET_FOLDER_MAX) {
    const add = el("button", "chip chip-add", "+");
    add.type = "button";
    add.title = T("폴더 만들기");
    add.onclick = () => askRename(host, T("폴더 이름"), "", FOLDER_NAME_MAX, (v) => {
      ctx.setFolders([...ctx.folders(), { id: uid(), name: v }]);
      saveAll(); ctx.redraw();
    });
    row.append(add);
  }
  // 폴더를 **보고 있을 때만** 손보는 단추를 낸다 — 늘 띄우면 칩 줄이 시끄럽다.
  const cur = ctx.folders().find((f) => `f:${f.id}` === ctx.filter());
  if (cur) {
    const ren = el("button", "chip chip-quiet", T("이름 변경"));
    ren.type = "button";
    ren.onclick = () => askRename(host, T("폴더 이름"), cur.name, FOLDER_NAME_MAX, (v) => {
      cur.name = v; saveAll(); ctx.redraw();
    });
    const del = el("button", "chip chip-quiet", T("폴더 삭제"));
    del.type = "button";
    del.onclick = () => {
      // **항목은 안 지운다.** 폴더만 없애고 안에 있던 것은 «전체»로 돌아간다.
      for (const x of ctx.list()) if (x.folder === cur.id) delete x.folder;
      ctx.setFolders(ctx.folders().filter((f) => f.id !== cur.id));
      ctx.setFilter("all");
      saveAll(); ctx.redraw();
      ctx.msg(T("«{v}» 폴더를 지웠습니다 — 안에 있던 것은 그대로입니다.", { v: cur.name }), "ok");
    };
    row.append(ren, del);
  }
  return row;
}

/** 카드를 **통째로** 끌 수 있게 한다(유저 결정). 얼굴 그림은 `faceStrip`이 이미
 *  draggable을 껐고, 단추에서 시작한 드래그는 브라우저가 안 만든다. */
function makeDraggable(box, id) {
  box.draggable = true;
  box.addEventListener("dragstart", (e) => {
    dragItem = id;
    e.dataTransfer.setData("text/plain", `item:${id}`);
    e.dataTransfer.effectAllowed = "move";
    box.classList.add("prof-dragging");
  });
  box.addEventListener("dragend", () => {
    dragItem = null;
    box.classList.remove("prof-dragging");
  });
}
/** 지금 끌고 있는 항목 id(프리셋·기록 공용). **드래그 중에는 `dataTransfer`를 못
 *  읽으므로** 따로 든다 — 덱 끌기와 같은 규약. */
let dragItem = null;
const folderName = (id) => foldersNow().find((f) => f.id === id)?.name || "";
function setFolders(v) {
  if (modeNow() === "union") U().presetFolders = v; else state.presetFolders = v;
}

function renderPresets() {
  // 미미르 링크는 **지금 모드**를 따라간다 — 이 함수가 모드 전환 때도 불린다.
  wireMimirImport();
  const cnt = $("#preset-count");
  if (cnt) cnt.textContent = `${presetsNow().length} / ${PRESET_MAX}`;

  const fwrap = $("#preset-filter");
  if (fwrap) {
    fwrap.textContent = "";
    const counts = {
      all: presetsNow().length,
      single: presetsNow().filter(presetIsSingle).length,
      bundle: presetsNow().filter((p) => !presetIsSingle(p)).length,
    };
    // 기본 셋에 놓으면 폴더에서 빼는 것으로 친다 — «빼기» 단추를 따로 둘 자리가 없다.
    const outDrop = (chip) => {
      chip.addEventListener("dragover", (e) => {
        if (!dragItem) return;
        e.preventDefault(); chip.classList.add("chip-drop");
      });
      chip.addEventListener("dragleave", () => chip.classList.remove("chip-drop"));
      chip.addEventListener("drop", (e) => {
        e.preventDefault(); chip.classList.remove("chip-drop");
        const it = presetsNow().find((x) => x.id === dragItem);
        dragItem = null;
        if (!it) return;
        delete it.folder;
        saveAll(); renderPresets();
        presetMsg(T("«{name}»을 폴더에서 뺐습니다.", { name: it.name }), "ok");
      });
    };
    for (const [k, label] of [["all", T("전체")], ["single", T("단일")], ["bundle", T("묶음")]]) {
      const b = el("button", "chip" + (presetFilter === k ? " on" : ""), `${label} ${counts[k]}`);
      b.type = "button";
      b.title = T("여기로 끌어다 놓으면 폴더에서 뺍니다");
      b.onclick = () => { presetFilter = k; renderPresets(); };
      outDrop(b);
      fwrap.append(b);
    }
    fwrap.append(folderChips(fwrap.parentElement || fwrap, {
      list: presetsNow, folders: foldersNow, setFolders,
      filter: () => presetFilter,
      setFilter: (v) => { presetFilter = v; },
      redraw: renderPresets,
      msg: presetMsg,
    }));
  }

  const wrap = $("#preset-list");
  if (!wrap) return;
  wrap.textContent = "";
  const list = presetsNow().filter((p) => {
    if (presetFilter === "all") return true;
    if (presetFilter.startsWith("f:")) return `f:${p.folder}` === presetFilter;
    return (presetFilter === "single") === presetIsSingle(p);
  });
  if (!list.length) {
    wrap.append(el("p", "prose prose-sm", presetsNow().length
      ? T("이 종류에는 저장된 프리셋이 없습니다.")
      : T("저장된 프리셋이 없습니다. 편성 탭에서 «프리셋 저장»(덱 하나) 또는")
        + T(" «묶음 저장»(여러 덱)을 누르세요.")));
    return;
  }

  for (const p of list) {
    const single = presetIsSingle(p);
    const box = el("div", "prof");
    makeDraggable(box, p.id);
    const top = el("div", "prof-top");
    top.append(el("span", "preset-kind" + (single ? " single" : " bundle"),
      single ? T("단일") : T("묶음")));
    top.append(el("b", "prof-name", p.name));
    top.append(el("span", "prof-meta",
      `${when(p.at)} · ${single ? T("{v}명", { v: presetHeads(p) }) : T("{length}덱 {v}명", { length: p.decks.length, v: presetHeads(p) })}`));

    const acts = el("div", "prof-acts");
    acts.append(mkBtn(T("불러오기"), "btn-primary", () => openPresetLoad(p)));
    acts.append(mkBtn(T("이름 변경"), "btn-ghost", () => {
      askRename(box, T("프리셋 이름"), p.name, PRESET_NAME_MAX, (v) => {
        p.name = v;
        saveAll(); renderPresets();
      });
    }));
    acts.append(mkBtn(T("내보내기"), "btn-ghost",
      () => downloadJson({ presets: [p] }, T("니케프리셋-{name}", { name: p.name }))));
    acts.append(mkBtn(T("삭제"), "btn-ghost", () => {
      askInline(box, T("«{name}» 프리셋을 지웁니다.", { name: p.name }), T("지우기"), () => {
        setPresets(presetsNow().filter((x) => x.id !== p.id));
        saveAll(); renderPresets();
        presetMsg(T("«{name}»을 지웠습니다.", { name: p.name }), "ok");
      });
    }));
    top.append(acts);
    box.append(top);

    // 묶음은 다섯 줄이라 목록이 금세 길어진다 — **첫 줄만 펴 두고** 나머지는 접는다
    // (유저 지시). 편 상태는 다시 그려도 남는다 — 목록은 이름 변경·삭제마다 다시
    // 그려지는데 그때마다 도로 접히면 «접혔다 폈다»가 반복된다.
    const lines = el("div", "preset-lines");
    const filled = p.decks.filter((d) => d.names.some(Boolean));
    const open = presetOpen.has(p.id);
    filled.forEach((d, i) => {
      if (i > 0 && !open) return;
      const line = el("div", "preset-line");
      if (!single) line.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
      line.append(faceStrip(d.names));
      lines.append(line);
    });
    box.append(lines);
    if (filled.length > 1) {
      const more = el("button", "preset-more",
        open ? T("접기") : T("+{v}덱 더 보기", { v: filled.length - 1 }));
      more.type = "button";
      more.setAttribute("aria-expanded", String(open));
      more.onclick = () => {
        if (open) presetOpen.delete(p.id); else presetOpen.add(p.id);
        renderPresets();
      };
      box.append(more);
    }
    wrap.append(box);
  }
}

// ── 파일 입출력 ─────────────────────────────────────────────────────────
// 내보낸 파일은 **프리셋만** 담는다. 계정 이름·계정 지문이 들어갈 자리가 없다
// (프리셋 자체가 편성과 조건뿐이다).

function exportAllPresets() {
  if (!presetsNow().length) { presetMsg(T("내보낼 프리셋이 없습니다."), "err"); return; }
  downloadJson({ presets: presetsNow() }, T("니케프리셋-전체-{v}개", { v: presetsNow().length }));
  presetMsg(T("{v}개를 파일로 내보냈습니다.", { v: presetsNow().length }), "ok");
}

/** 프리셋 한 건이 쓸 만한 모양인가. 파일에서 온 것은 믿지 않는다. */
function cleanPreset(x) {
  if (!x || typeof x !== "object") return null;
  const decks = Array.isArray(x.decks) ? x.decks : null;
  if (!decks || !decks.length) return null;
  const out = [];
  for (const d of decks.slice(0, DECK_COUNT)) {
    const names = Array.isArray(d?.names) ? d.names.slice(0, SLOTS)
      .map((n) => (typeof n === "string" && n.length <= 40 ? n : null)) : null;
    if (!names || !names.some(Boolean)) continue;
    while (names.length < SLOTS) names.push(null);
    out.push({ names });               // 편성만 — 컨트롤·조건은 애초에 받지 않는다
  }
  if (!out.length) return null;
  const kind = x.kind === "single" || out.length === 1 ? "single" : "bundle";
  return {
    id: uid(),
    name: String(x.name || T("가져온 프리셋")).slice(0, PRESET_NAME_MAX),
    kind,
    at: typeof x.at === "string" ? x.at : new Date().toISOString(),
    decks: kind === "single" ? out.slice(0, 1) : out,
  };
}

/** 파일에서 프리셋을 받는다. **이름이 겹치면 덮지 않고 번호를 붙인다** —
 *  남이 준 파일이 내가 쓰던 프리셋을 조용히 지우면 안 된다. */
function importPresets(arr) {
  const taken = new Set(presetsNow().map((p) => p.name));
  let added = 0, skipped = 0, full = false;
  for (const raw of arr) {
    const p = cleanPreset(raw);
    if (!p) { skipped++; continue; }
    if (presetsNow().length + added >= PRESET_MAX) { full = true; break; }
    let nm = p.name, k = 2;
    while (taken.has(nm)) nm = `${p.name} (${k++})`;
    taken.add(nm);
    presetsNow().unshift({ ...p, name: nm });
    added++;
  }
  saveAll(); renderPresets();
  const parts = [T("{added}개를 가져왔습니다.", { added })];
  if (skipped) parts.push(T("{skipped}개는 모양이 아니라 건너뜁니다.", { skipped }));
  if (full) parts.push(T("{PRESET_MAX}개가 차서 나머지는 넣지 않았습니다.", { PRESET_MAX }));
  presetMsg(parts.join(" "), skipped || full ? "warn" : "ok");
  return added;
}

async function importPresetFiles(files) {
  const all = [];
  for (const f of files) {
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data?.presets)) all.push(...data.presets);
      else if (Array.isArray(data)) all.push(...data);
      else if (data?.decks) all.push(data);
      else throw new Error(T("프리셋 파일이 아닙니다"));
    } catch (e) {
      presetMsg(`${f.name}: ${String(e.message || e)}`, "err");
      return;
    }
  }
  if (!all.length) { presetMsg(T("파일에 프리셋이 없습니다."), "err"); return; }
  importPresets(all);
}

// ── 기록 ────────────────────────────────────────────────────────────────

/** 이 니케를 지금 편성에 올릴 수 있나.
 *
 *  계정이 있으면 그 계정에 있는지, 고정값이면 로스터에 있는지 본다. 기록·프리셋·
 *  공유를 불러올 때 **같은 판정**을 써야 한다 — 한 곳만 느슨하면 계산 단계에서
 *  «스킬 미파싱»으로 터진다. */
function haveChar(n) {
  if (!n) return false;
  return activeRec() ? !!charSpec(n) : byName.has(n);
}

/** 계산이 끝난 덱만 모아 기록 모양으로 만든다. 기록 저장과 공유가 함께 쓴다. */
function collectDecks() {
  const decks = [];
  let total = 0;
  for (let i = 0; i < deckCountNow(); i++) {
    const d = deckAt(i);
    const r = resultOf(d);
    if (!r) continue;
    const one = { names: [...d.names], total: r.total, chars: r.chars,
                  detail: r.detail || null, notes: r.notes || "" };
    // 유니온은 «어느 보스에 이 편성»까지가 한 벌이다. 레이드 설정도 같이 든다 —
    // 공유할 때 담을지는 그때 정하지만, 여기서 안 실으면 담을 것 자체가 없다.
    if (modeNow() === "union" && uWeak(d)) one.weak = uWeak(d);
    if (modeNow() === "union") one.battle = battleFor(d);
    decks.push(one);
    total += r.total;
  }
  return { decks, total, mode: modeNow() };
}

/* ── 캡처에서 솔레 기록 만들기 ─────────────────────────────────────────────
 * 스쿼드 목록 캡처를 넣으면 25칸의 니케를 알아내 기록으로 남긴다.
 * 자르기는 브라우저(`squadshot.js`), 판독은 서버(`web/squad_ocr.py`)가 한다 —
 * 대조군 서명표를 내보내지 않기 위해서고, 덕분에 캡처 원본도 서버에 안 올라간다.
 *
 * **자동판독을 100% 믿게 만들지 않는다.** 실측 74/75인데, 틀린 한 칸도 후보
 * 안에는 있었다(75/75). 그래서 칸마다 후보를 보여 주고 고칠 수 있게 한다.
 */
let shotState = null;              // {cells, boxes, shot, align, rows, cols, locked}
let shotBusy = false;

function shotMsg(text, kind) {
  const n = $("#shot-msg");
  if (!n) return;
  n.textContent = text || "";
  n.className = "acct-msg" + (kind ? " " + kind : "");
}

/** 캡처 상자를 연다·닫는다. `want`를 주면 그 상태로 맞춘다(지름길이 쓴다). */
function shotToggleDrop(want) {
  const drop = $("#shot-drop"), btn = $("#shot-open");
  if (!drop) return;
  if (!HEALTH.ocr) {
    recMsg(T("캡처 판독은 서버가 필요합니다 — 지금 서버에 연결할 수 없습니다."), "err");
    return;
  }
  drop.hidden = want == null ? !drop.hidden : !want;
  btn?.classList.toggle("on", !drop.hidden);
  btn?.setAttribute("aria-expanded", String(!drop.hidden));
  if (!drop.hidden) {
    shotMsg("");
    drop.scrollIntoView({ block: "center", behavior: "smooth" });
    drop.focus({ preventScroll: true });
  }
}

function shotWire() {
  const drop = $("#shot-drop");
  if (!drop) return;
  $("#shot-open").onclick = () => shotToggleDrop();
  $("#shot-pick").onclick = () => $("#shot-file").click();
  $("#shot-guide").onclick = () => $("#shot-guide-sheet").showModal();
  $("#shot-guide-x").onclick = () => $("#shot-guide-sheet").close();
  $("#shot-file").onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) shotHandle(f);
    e.target.value = "";
  };
  for (const ev of ["dragenter", "dragover"]) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  }
  for (const ev of ["dragleave", "drop"]) {
    drop.addEventListener(ev, () => drop.classList.remove("over"));
  }
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) shotHandle(f);
    else shotMsg(T("그림 파일이 아닙니다."), "err");
  });
  // 붙여넣기는 **상자에 초점이 있을 때만** 받는다 — 다른 입력칸에 붙여넣는 것을
  // 가로채면 안 된다.
  document.addEventListener("paste", (e) => {
    if (drop.hidden || !drop.contains(document.activeElement) && document.activeElement !== drop) return;
    const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
    if (!it) return;
    e.preventDefault();
    shotHandle(it.getAsFile());
  });
  $("#shot-x").onclick = () => $("#shot-sheet").close();
  $("#shot-find-x").onclick = () => $("#shot-find-sheet").close();
  $("#shot-find-sheet").addEventListener("close", () => { shotFindAt = -1; });
  $("#shot-save").onclick = shotSave;
}

async function shotHandle(file) {
  if (shotBusy) return;
  shotBusy = true;
  shotMsg(T("판독하는 중…"));
  try {
    const st = await shotRead(file, {});
    st.locked = {};
    shotState = st;
    shotRender();
    $("#shot-sheet").showModal();
    shotMsg("");
  } catch (e) {
    shotMsg(String(e.message || e), "err");
  } finally {
    shotBusy = false;
  }
}

/** 점수를 사람 말로. «3.2σ»는 우리끼리 쓰는 값이지 사용자에게 보일 것이 아니다.
 *
 *  1등의 등급은 **칸 뱃지와 같은 기준**을 써야 한다 — 뱃지는 «애매»인데 목록은
 *  «확정»이라고 하면 어느 쪽을 믿어야 할지 알 수 없다. 그래서 1등은 2등과의
 *  거리(`sure`)로 정하고, 나머지는 1등과의 거리로 정한다.
 */
function shotGrade(score, best, sure) {
  const gap = best - score;
  if (gap <= 0.001) return sure ? T("확정") : T("유력");
  if (gap < 0.6) return T("비슷");
  if (gap < 1.5) return T("가능");
  return T("낮음");
}

/** 지금 어느 칸이든 쓰고 있는 이름 — «다른 칸에 있음»을 알려 줄 때 쓴다.
 *  후보를 **빼는** 데는 쓰지 않는다(shotRender 주석). */
function shotTaken(i) {
  const used = new Set();
  shotState.cells.forEach((c, k) => { if (k !== i && c.pick) used.add(c.pick); });
  return used;
}

function shotRender() {
  const wrap = $("#shot-grid");
  wrap.textContent = "";
  const st = shotState;
  const nc = st.cols;
  const weak = st.cells.filter((c) => !c.sure).length;
  $("#shot-summary").classList.remove("warn");
  $("#shot-summary").textContent =
    T("{rows}개 스쿼드 × {nc}명을 읽었습니다. ", { rows: st.rows, nc })
    + (weak ? T("{weak}칸이 «애매»입니다 — 눌러서 후보 중에 고르세요.", { weak })
            : T("모두 «확정»으로 읽혔습니다. 그래도 한 번 훑어봐 주세요."));
  st.cells.forEach((c, i) => {
    if (i % nc === 0) {
      // 스쿼드 머리글에 **총딜 입력칸**을 함께 둔다. 판독값이 채워져 있고 고칠 수
      // 있다 — 숫자 판독은 90%라 사람이 한 칸 고치는 길이 반드시 있어야 한다.
      const r = Math.floor(i / nc);
      const hd = el("div", "shot-row-hd");
      hd.append(el("b", null, `SQUAD ${r + 1}`));
      const inp = el("input", "shot-power");
      inp.type = "text";
      inp.inputMode = "numeric";
      inp.placeholder = T("총딜 (숫자만)");
      const v = st.powers?.[r];
      inp.value = v ? String(v) : "";        // 쉼표를 넣지 않는다 — 고칠 때 걸린다
      // 판독이 흔들린 줄은 표시해 둔다. 얼굴 딱지와 달리 이 신호는 실측으로
      // 오답을 정확히 집어낸다(오답 2/2, 헛표시 0).
      const sureP = st.powerSure?.[r];
      if (v && sureP === false) inp.classList.add("shaky");
      if (!v) inp.classList.add("weak");
      inp.oninput = () => {
        const n = Number(String(inp.value).replace(/[^0-9]/g, ""));
        st.powers = st.powers || [];
        st.powers[r] = n || 0;
        inp.classList.toggle("weak", !n);
      };
      hd.append(inp);
      // 억 단위로도 읽어 준다 — 55억인지 550억인지 자릿수를 눈으로 세지 않게
      const eokEl = el("span", "shot-eok", v ? `${I18N.dmg(v)}` : "");
      hd.append(eokEl);
      inp.addEventListener("input", () => {
        const n = Number(String(inp.value).replace(/[^0-9]/g, ""));
        eokEl.textContent = n ? `${I18N.dmg(n)}` : "";
      });
      // 판독한 숫자 그림을 그대로 보여 준다 — 읽은 값과 눈으로 대조해야 고칠 수 있다
      const th = st.powerThumbs?.[r];
      if (th) {
        const im = el("img", "shot-power-img");
        im.src = th;
        im.alt = "";
        im.title = T("판독한 숫자 영역");
        hd.append(im);
      }
      wrap.append(hd);
    }
    const cell = el("div", "shot-cell" + (c.sure ? "" : " weak")
      + (st.locked[i] ? " locked" : ""));
    const img = el("img", "shot-thumb");
    img.src = shotThumb(st, i, 64);
    img.alt = "";
    cell.append(img);
    const tag = st.locked[i] ? T("내가 고침") : (c.sure ? T("확정") : T("애매"));
    cell.append(el("span", "shot-tag" + (st.locked[i] ? " fixed" : c.sure ? " sure" : " weak"),
                   tag));
    // **후보는 하나도 빼지 않는다.** 다른 칸이 쥐고 있다고 목록에서 지우면, 그 칸이
    // 틀렸을 때 정답을 아는 칸에서 그 이름이 통째로 사라진다 — 애매한 칸끼리 겹칠 때
    // 실제로 그랬다(모더니아가 옆 칸에 먼저 붙어, 정작 맞는 칸에서는 고를 수가 없었다).
    // 겹치는 것은 **저장할 때** 막으므로(`shotSave`) 여기서는 알려만 준다. 하나를
    // 고르면 그 칸이 고정되고 서버가 나머지를 다시 배정해 겹침이 저절로 풀린다.
    const taken = shotTaken(i);
    const opts = [];
    const best = c.candidates.length ? c.candidates[0].score : 0;
    for (const cand of c.candidates) {
      const dupe = taken.has(cand.name) && cand.name !== c.pick;
      opts.push([cand.name,
                 `${cand.name} · ${shotGrade(cand.score, best, c.sure)}`
                 + (dupe ? ` · ${T("다른 칸에 있음")}` : "")]);
    }
    if (!opts.some(([v]) => v === c.pick)) opts.unshift([c.pick, c.pick]);
    const sel = selectEl(opts, c.pick, (v) => shotFix(i, v));
    sel.className = "shot-pick";
    cell.append(sel);
    // 후보는 «닮은 순 몇 개»다. 크게 빗나가면 정답이 목록에 아예 없다 — 그때 손으로
    // 못 넣으면 기록을 통째로 버려야 하므로 **전체 명단 검색**을 붙인다.
    // 확정 칸에는 안 붙인다(대부분 맞다). 애매하거나 이미 고친 칸에만.
    if (!c.sure || st.locked[i]) {
      const fb = el("button", "btn btn-ghost shot-find-btn", "이름으로 찾기");
      fb.type = "button";
      fb.onclick = () => shotFindOpen(i);
      cell.append(fb);
    }
    wrap.append(cell);
  });
}

/** 어느 칸을 고치는 중인가. 검색 모달이 닫히면 -1로 돌아간다. */
let shotFindAt = -1;

/** 이름 대조용 — 공백·쉼표·괄호·콜론을 지운다. «라피:레드 후드»를 «라피레드후드»로
 *  두면 «레드후드»·«라피」 어느 쪽으로 쳐도 걸린다. */
const shotNorm = (t) => String(t).toLowerCase().replace(/[\s:·,()\[\]{}–—-]/g, "");

/** 후보에 아예 없는 니케를 **전체 명단에서 찾아** 넣는다. */
function shotFindOpen(i) {
  shotFindAt = i;
  const dlg = $("#shot-find-sheet");
  const q = $("#shot-find-q");
  const st = shotState;
  const r = Math.floor(i / st.cols) + 1, c = (i % st.cols) + 1;
  $("#shot-find-note").textContent =
    T("SQUAD {r}의 {c}번째 칸 — 지금은 «{v}»입니다.", { r, c, v: st.cells[i].pick || T("없음") })
    + T(" 이미 다른 칸이 쓰는 이름을 고르면 그쪽이 다시 배정됩니다.");
  q.value = "";
  q.oninput = shotFindRender;
  shotFindRender();
  if (!dlg.open) dlg.showModal();
  q.focus();
}

function shotFindRender() {
  const box = $("#shot-find-list");
  box.textContent = "";
  const raw = $("#shot-find-q").value.trim();
  const key = shotNorm(raw);
  const used = shotFindAt >= 0 ? shotTaken(shotFindAt) : new Set();
  const list = ROSTER.filter((r) => !key || shotNorm(r.name).includes(key))
    .sort((x, y) => nameCmp(x.name, y.name));
  if (!list.length) {
    box.append(el("p", "share-pick-note warn", "그런 이름이 없습니다."));
    return;
  }
  for (const rec of list.slice(0, 200)) {
    const b = el("button", "shot-find-item" + (used.has(rec.name) ? " used" : ""));
    b.type = "button";
    if (rec.img) {
      const im = el("img");
      im.src = artSrc(rec, rec.name);
      im.alt = "";
      im.loading = "lazy";
      im.decoding = "async";
      im.draggable = false;
      b.append(im);
    }
    b.append(el("span", "shot-find-nm", rec.name));
    if (used.has(rec.name)) b.append(el("i", "shot-find-used", "다른 칸에 있음"));
    b.onclick = () => {
      const at = shotFindAt;
      $("#shot-find-sheet").close();
      if (at >= 0) shotFix(at, rec.name);
    };
    box.append(b);
  }
  if (list.length > 200) {
    box.append(el("p", "share-pick-note", T("{length}명 중 200명만 보입니다 — 더 치세요.", { length: list.length })));
  }
}

async function shotFix(i, name) {
  const st = shotState;
  st.locked[i] = name;
  shotMsg("");
  $("#shot-summary").textContent = T("다시 배정하는 중…");
  try {
    st.cells = await shotRelock(st, st.locked);
    shotRender();
  } catch (e) {
    $("#shot-summary").textContent = String(e.message || e);
  }
}

function shotSave() {
  const st = shotState;
  if (!st) return;
  const nc = st.cols;
  // 같은 니케가 두 칸에 들어간 기록은 **저장하지 않는다.** 솔로레이드에서 한 니케는
  // 한 덱에만 들어가므로 중복은 반드시 오답이다. 검색으로 아무나 넣을 수 있게 된
  // 이상, 저장 문턱에서 막지 않으면 틀린 기록이 그대로 남는다.
  {
    const seen = new Map();
    const dup = [];
    st.cells.forEach((c, i) => {
      if (!c.pick) return;
      if (seen.has(c.pick)) dup.push([c.pick, seen.get(c.pick), i]);
      else seen.set(c.pick, i);
    });
    const empty = st.cells.filter((c) => !c.pick).length;
    if (dup.length || empty) {
      const at = (i) => `SQUAD ${Math.floor(i / nc) + 1}-${(i % nc) + 1}`;
      const sm = $("#shot-summary");
      sm.textContent =
        (dup.length
          ? T("저장하지 않았습니다 — 같은 니케가 두 칸에 있습니다: {v}.", { v: dup.map(([n, a, b]) =>
              `${n} (${at(a)} · ${at(b)})`).join(", ") })
          : T("저장하지 않았습니다 —"))
        + (empty ? T(" 그리고 {empty}칸이 비어 있습니다.", { empty }) : "")
        + T(" 고친 뒤 다시 저장하세요.");
      sm.classList.add("warn");
      return;
    }
  }
  const decks = [];
  let total = 0;
  for (let r = 0; r < st.rows; r++) {
    const names = [];
    for (let c = 0; c < nc; c++) names.push(st.cells[r * nc + c].pick || "");
    const dmg = Number(st.powers?.[r]) || 0;
    total += dmg;
    // `names`가 없으면 «편성 불러오기»와 공유가 동작하지 않는다 — 그쪽은 이름만 본다.
    // `chars`(니케별 딜)는 **캡처에서 알 수 없다.** 빈 dict로 둔다 —
    // `{이름: {}}`처럼 채우면 렌더러가 값을 숫자로 여겨 NaN이 뜬다.
    decks.push({ names, total: dmg, chars: {}, detail: null, notes: "" });
  }
  const rec = {
    id: uid(),
    at: new Date().toISOString(),
    kind: "solo-shot",
    label: T("솔레 기록 · {length}덱{v}", { length: decks.length, v: total ? ` · ${I18N.dmg(total)}` : "" }),
    name: ($("#shot-name").value || "").trim() || T("솔레 기록 {v}", { v: when(new Date().toISOString()) }),
    code: state.settings.code, duration: durationNow(),
    profileName: T("캡처 판독"), profileSig: "",
    engine: "server", decks, total,
  };
  recordsNow().unshift(rec);
  setRecords(recordsNow().slice(0, 200));
  saveAll();
  renderRecords();
  $("#shot-sheet").close();
  $("#shot-drop").hidden = true;
  recMsg(T("캡처에서 {length}덱을 읽어 기록에 저장했습니다.", { length: decks.length }), "ok");
}

/** 유니온 기록 이름에 쓸 «작수풍» — 줄 순서대로 속성 한 글자씩. 못 만들면 null.
 *
 *  「3줄」은 **몇 줄인지만** 말해 주는데, 그건 유니온이면 늘 셋이라 새 소식이 없다.
 *  무슨 속성으로 짰는지가 나중에 기록을 고를 때 찾는 단서다(유저 제보 2026-08-30).
 *  한 줄이라도 보스를 안 골랐거나 한국어 화면이 아니면 예전처럼 「{n}줄」로 둔다. */
function unionCodes(decks) {
  if ((I18N.lang || "ko") !== "ko") return null;
  // **`weak`은 보스 속성이다** — 사람이 말하는 «그 줄의 속성»은 그 보스에게 우월한 속성,
  // 즉 데려갈 속성이다(기록 이미지도 그렇게 적는다). 그대로 쓰면 뒤집혀 저장된다
  // (유저 지적 2026-09-01: «속성 반대로 저장되는 듯»).
  const abbr = decks.map((d) => CODE_ABBR[COUNTER_OF[d.weak] || d.weak]);
  return abbr.length && abbr.every(Boolean) ? abbr.join("") : null;
}

function saveRecord() {
  const { decks, total, mode } = collectDecks();
  if (!decks.length) { recMsg(T("저장할 계산 결과가 없습니다 — 먼저 계산하세요."), "err"); return; }
  const p = activeRec();
  const union = mode === "union", museum = mode === "museum";
  // 뮤지엄 기록은 보스·주간 버프·시작 스텝과 **그 결과 스텝**까지 든다 — 딜만 남기면
  // 나중에 «몇 스텝이었지»를 다시 셀 수 없다(웨이브 표가 바뀔 수 있다).
  const mstep = museum && museumStage()
    ? museumWalk(M().boss, decks.map((d) => d.total)) : null;
  const rec = {
    id: uid(),
    at: new Date().toISOString(),
    // 유니온 기록은 **모드를 달고 다닌다** — 이미지로 뽑을 때 세로 한 줄로 그릴지가
    // 여기서 갈린다. 솔로 기록에는 이 열쇠가 없다(예전 기록도 그대로 산다).
    ...(union ? { mode: "union" } : {}),
    ...(museum ? { mode: "museum", boss: M().boss, weekly: museumWeekly(),
                   step: mstep?.step ?? null } : {}),
    label: union
      ? (unionCodes(decks)
          ? T("{v} 유니온 · {codes} · {v1}",
              { v: unionSeason().label, codes: unionCodes(decks), v1: I18N.dmg(total) })
          : T("{v} 유니온 · {length}줄 · {v1}", { v: unionSeason().label, length: decks.length, v1: I18N.dmg(total) }))
      : museum
      ? T("{v} 뮤지엄 · {length}덱 · 스텝 {step} · {v1}",
          { v: museumStage() ? T(museumStage().boss) : "?", length: decks.length,
            step: mstep?.step ?? "—", v1: I18N.dmg(total) })
      : T("{v} · {length}덱 · {v1}", { v: state.settings.code || T("속성없음"), length: decks.length, v1: I18N.dmg(total) }),
    code: state.settings.code, duration: durationNow(),
    profileName: p ? p.name : T("고정값"), profileSig: profSig(),
    engine: "server", decks, total,
  };
  recordsNow().unshift(rec);
  setRecords(recordsNow().slice(0, 200));
  saveAll();
  renderRecords();
  recMsg(T("기록에 저장했습니다 — {label}", { label: rec.label }), "ok");
  // 이 저장 단추는 **결과 탭**에 있는데, 방금 그 메시지는 **기록 탭 안** 요소라
  // 결과 탭에 남아 있으면 안 보인다 — 그래서 확인 겸 지름길을 모달로 띄운다.
  $("#rec-saved-msg").textContent = T("«{label}»을(를) 기록에 저장했습니다.", { label: rec.label });
  const dlg = $("#rec-saved-sheet");
  if (dlg && !dlg.open) dlg.showModal();
}

/** ISO 시각 → 사람이 읽는 표기. 오늘·어제는 시각만, 그 전은 날짜까지.
 *  `2026-08-21T06:17:56+09:00`처럼 기계가 남긴 문자열을 그대로 보여 줄 자리가 아니다. */
function when(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff === 0) return T("오늘 {t}", { t: hm });
  if (diff === 1) return T("어제 {t}", { t: hm });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (I18N.lang === "en") {
    const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric",
                                               ...(sameYear ? {} : { year: "numeric" }) });
    return `${md} ${hm}`;
  }
  const y = sameYear ? "" : T("{y}년 ", { y: d.getFullYear() });
  return `${y}${T("{m}월 {d}일", { m: d.getMonth() + 1, d: d.getDate() })} ${hm}`;
}

/** 안내 문구를 **부르는 쪽이 지정한 자리**에 쓴다. 탭마다 문구 자리가 따로 있어서,
 *  한 자리에만 쓰면 다른 탭에서 누른 결과가 안 보이는 곳에 뜬다. */
function msgAt(sel, msg, kind = "") {
  const n = $(sel);
  if (!n) return;
  n.textContent = msg;
  n.className = "acct-msg " + kind;
}
const recMsg = (msg, kind = "") => msgAt("#rec-msg", msg, kind);
const presetMsg = (msg, kind = "") => msgAt("#preset-msg", msg, kind);
const shareMsg = (msg, kind = "") => msgAt("#share-msg", msg, kind);

// 기록 종류. «시뮬»은 결과 탭에서 저장한 계산 스냅샷이고, «솔레»는 캡처에서 읽은
// 실제 기록이다. 수치의 출처가 달라서 같은 목록에 섞이면 헷갈린다.
const REC_KINDS = [["all", T("전체")], ["sim", T("시뮬 기록")], ["shot", T("솔레 기록")]];
let recKind = "all";
const recKindOf = (r) => (r.kind === "solo-shot" ? "shot" : "sim");

function renderRecKinds() {
  const bar = $("#rec-kinds");
  if (!bar) return;
  bar.textContent = "";
  const n = { all: recordsNow().length, sim: 0, shot: 0 };
  for (const r of recordsNow()) n[recKindOf(r)]++;
  for (const [key, label] of REC_KINDS) {
    const b = mkBtn(`${label} ${n[key]}`, "rec-kind" + (recKind === key ? " on" : ""),
      () => { recKind = key; renderRecords(); });
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(recKind === key));
    // 기본 셋에 놓으면 폴더에서 뺀다(프리셋과 같은 규칙).
    b.addEventListener("dragover", (e) => {
      if (!dragItem) return;
      e.preventDefault(); b.classList.add("chip-drop");
    });
    b.addEventListener("dragleave", () => b.classList.remove("chip-drop"));
    b.addEventListener("drop", (e) => {
      e.preventDefault(); b.classList.remove("chip-drop");
      const it = recordsNow().find((x) => x.id === dragItem);
      dragItem = null;
      if (!it) return;
      delete it.folder;
      saveAll(); renderRecords();
    });
    bar.append(b);
  }
  bar.append(folderChips(bar.parentElement || bar, {
    list: recordsNow, folders: recFoldersNow, setFolders: setRecFolders,
    filter: () => recKind,
    setFilter: (v) => { recKind = v; },
    redraw: renderRecords,
    msg: (t, k) => recMsg?.(t, k),
  }));
}

function renderRecords() {
  const wrap = $("#rec-list");
  if (!wrap) return;
  renderRecKinds();
  wrap.textContent = "";
  const shown = recordsNow().filter((r) => {
    if (recKind === "all") return true;
    if (recKind.startsWith("f:")) return `f:${r.folder}` === recKind;
    return recKindOf(r) === recKind;
  });
  if (recordsNow().length && !shown.length) {
    wrap.append(el("p", "prose prose-sm",
      recKind === "shot"
        ? T("솔레 기록이 없습니다. 위 «캡처에서 솔레 기록 만들기»로 스쿼드 화면을 넣어 보세요.")
        : T("시뮬 기록이 없습니다. 결과 탭에서 «기록에 저장»을 누르세요.")));
    return;
  }
  if (!recordsNow().length) {
    wrap.append(el("p", "prose prose-sm",
      T("아직 기록이 없습니다. 결과 탭에서 «기록에 저장»을 누르세요.")));
    return;
  }
  for (const r of shown) {
    const box = el("div", "prof");
    makeDraggable(box, r.id);
    const top = el("div", "prof-top");
    const shot = recKindOf(r) === "shot";
    top.append(el("span", "rec-badge" + (shot ? " shot" : ""), shot ? T("솔레") : T("시뮬")));
    top.append(el("b", "prof-name", r.name || r.label));
    top.append(el("span", "prof-meta", shot
      ? T("{v} · 캡처 판독 · {length}덱", { v: when(r.at), length: r.decks.length })
      : T("{v} · {duration}초 · {profileName}", { v: when(r.at), duration: r.duration, profileName: r.profileName })
        + ` · ${r.engine === "server" ? T("서버") : T("브라우저")}`));
    const acts = el("div", "prof-acts");
    acts.append(mkBtn(T("편성 불러오기"), "btn-primary", () => loadRecord(r)));
    // 공유는 **서버가 받아 줄 때만** 보인다 — 눌러 놓고 실패를 알려 주는 버튼은 두지 않는다
    const sout = el("div", "share-out");
    sout.hidden = true;
    if (HEALTH.share) {
      acts.append(mkBtn(T("공유 링크"), "btn-ghost", () => makeShare(r, sout, recMsg)));
    }
    acts.append(mkBtn(T("이미지 저장"), "btn-ghost", () => imageRecord(r)));
    acts.append(mkBtn(T("이미지 복사"), "btn-ghost", () => copyImageRecord(r)));
    // 이름 바꾸기 — 자동으로 지은 이름(«S44 유니온 · 작수풍 · 1조»)은 나중에 찾기
    // 어려울 때가 있다. 계정 이름과 같은 자리·같은 방식이다(유저 요청 2026-09-01).
    acts.append(mkBtn(T("이름 변경"), "btn-ghost", () => {
      askRename(box, T("기록 이름"), r.name || r.label || "", NAME_MAX, (v) => {
        r.name = v;
        saveAll(); renderRecords();
        recMsg(T("이름을 바꿨습니다."), "ok");
      });
    }));
    acts.append(mkBtn(T("내보내기"), "btn-ghost",
      () => downloadJson(r, T("니케기록-{v}", { v: r.name || r.label }))));
    acts.append(mkBtn(T("삭제"), "btn-ghost", () => {
      askInline(box, T("«{v}» 기록을 지웁니다.", { v: r.name || r.label }), T("지우기"), () => {
        setRecords(recordsNow().filter((x) => x.id !== r.id));
        saveAll(); renderRecords();
        recMsg(T("기록을 지웠습니다."), "ok");
      });
    }));
    top.append(acts);
    box.append(top);
    box.append(sout);

    const det = el("details", "prof-names");
    det.append(el("summary", null, T("{length}덱 상세 보기", { length: r.decks.length })));
    det.append(recDetail(r));
    box.append(det);
    wrap.append(box);
  }
}

/** 딜 타임라인 — **확인용**이지 저장되는 값이 아니다(호출부 주석 참고).
 *  구간(버킷)마다 니케별 딜을 쌓아 올린 막대이고, 색은 도넛·막대·표와 **같은
 *  deckColor**를 그대로 쓴다 — 같은 니케는 이 화면 어디서 봐도 같은 색이어야 한다.
 *  풀버스트로 열린 구간은 옅은 띠로 배경에 깔고, 그 사이클을 연 순간에 세모 표를
 *  하나씩 찍는다.
 *
 *  **1·2·3버를 따로 찍지 않는다.** 실측: 셋이 몇 분의 1초 간격으로 몰려 있어서
 *  180초 축에 그대로 찍으면 겹쳐 뭉갠다(버그 리포트로 확인됨). 그래서
 *  `burst_cycles()`(계산기 쪽)가 풀버스트 하나당 1·2·3버를 미리 묶어 주고,
 *  여기서는 사이클당 세모 하나 + 툴팁에 단계별 발동자를 담는다. 풀버스트로
 *  안 이어진 버스트(`strays`)도 조용히 버리지 않고 작고 옅은 표로 남긴다. */
function timelineEl(names, timeline, burstCycles, duration, tlReq = null) {
  const det = el("details", "rec-timeline");
  const sum = el("summary", null, "딜 타임라인");
  sum.append(el("span", "rec-timeline-hint", "확인용 · 저장 안 됨"));
  // 상세 뷰어(timeline.js) — 결과 탭에서만(tlReq가 있을 때만) 뜬다. trace는 크기 때문에
  // 그 자리에서 그 덱만 다시 계산해 받는다(저장 안 함 — 뷰어에서 내보내기만 가능).
  if (tlReq && window.TimelineViewer) {
    // **`T()`를 지나야 한다** — 이 한 줄이 빠져 있어 영어 화면에도 한국어로 떴다
    // (피드백 2026-08-28: «on results, some of the abilities names are not localized»).
    const btn = mkBtn(T("상세 타임라인 뷰어 (베타)"), "btn-ghost tl-viewer-btn", async (e) => {
      e.preventDefault(); e.stopPropagation(); // summary 클릭(접기/펼치기)과 분리
      btn.disabled = true;
      hit("상세 타임라인");
      try {
        await TimelineViewer.open({ names: (names || []).filter(Boolean), duration, request: tlReq });
      } catch (err) {
        setStatus(String(err.message || err));
      } finally {
        btn.disabled = false;
      }
    });
    sum.append(btn);
  }
  det.append(sum);

  const wrap = el("div", "tl-wrap");
  const order = (names || []).filter(Boolean);

  // 범례 — deckColor와 같은 색의 점 + 이름. 막대 색만으로 「누구인지」를 추측하게
  // 두지 않는다.
  const legend = el("div", "tl-legend");
  for (const nm of order) {
    const item = el("span", "tl-legend-item");
    const dot = el("i", "tl-legend-dot");
    dot.style.background = deckColor(names, nm);
    item.append(dot, T(nm));
    legend.append(item);
  }
  wrap.append(legend);

  const { bucket_sec, buckets } = timeline;
  const totals = buckets.map((b) => Object.values(b).reduce((s, v) => s + v, 0));
  const maxTotal = Math.max(1, ...totals);
  const cycles = burstCycles?.cycles || [];
  const strays = burstCycles?.strays || [];

  const plot = el("div", "tl-plot");

  // 배경 — 풀버스트로 열려 있던 구간. 막대보다 먼저 붙여 뒤에 깔리게 한다.
  for (const c of cycles) {
    const band = el("div", "tl-fb");
    band.style.left = `${clamp01(c.start / duration) * 100}%`;
    band.style.width = `${Math.max(clamp01((c.end - c.start) / duration) * 100, 0.6)}%`;
    plot.append(band);
  }

  // 막대 — 구간마다 니케별 딜을 **배치 순서로** 쌓는다(순서가 딜 크기로 매번
  // 바뀌면 «이 니케는 늘 이 자리»라는 감을 못 잡는다).
  const bars = el("div", "tl-bars");
  buckets.forEach((b, i) => {
    const col = el("div", "tl-col");
    const t0 = i * bucket_sec, t1 = Math.min(duration, (i + 1) * bucket_sec);
    const lines = [`${t0.toFixed(0)}~${t1.toFixed(0)}s`];
    for (const nm of order) {
      const v = b[nm];
      if (!v) continue;
      const seg = el("div", "tl-seg");
      seg.style.height = `${Math.max((v / maxTotal) * 100, 1.2)}%`;
      seg.style.background = deckColor(names, nm);
      col.append(seg);
      lines.push(`${T(nm)} ${I18N.dmg(v)}`);
    }
    col.title = lines.length > 1 ? lines.join("\n") : T("{v} — 딜 없음", { v: lines[0] });
    bars.append(col);
  });
  plot.append(bars);

  // 사이클 표 — 풀버스트를 연 순간 하나에 세모 하나.
  for (const c of cycles) {
    const mark = el("div", "tl-mark");
    mark.style.left = `${clamp01(c.start / duration) * 100}%`;
    const parts = ["1", "2", "3"].map((s) => c.casts[s]
      ? T("{s}버 {v}s · {v1}", { s, v: c.casts[s].t.toFixed(1), v1: T(c.casts[s].name) }) : T("{s}버 — 없음", { s }));
    mark.title = [T("풀버스트 {v}~{v1}s", { v: c.start.toFixed(1), v1: c.end.toFixed(1) }), ...parts].join("\n");
    plot.append(mark);
  }
  // 못 이어진 버스트 — 작고 옅게. 사라뜨리면 «왜 이 캐릭터가 버스트를 안 쓴 것처럼
  // 보이지»가 풀리지 않는다.
  for (const s of strays) {
    const mark = el("div", "tl-mark tl-mark-stray");
    mark.style.left = `${clamp01(s.t / duration) * 100}%`;
    mark.title = T("{v}s · {stage}버 · {name} — 풀버스트로 안 이어짐", { v: s.t.toFixed(1), stage: s.stage, name: s.name });
    plot.append(mark);
  }
  wrap.append(plot);

  const axis = el("div", "tl-axis");
  axis.append(el("span", null, "0s"));
  axis.append(el("span", null, `${Math.round(duration / 2)}s`));
  axis.append(el("span", null, `${Math.round(duration)}s`));
  wrap.append(axis);

  wrap.append(el("p", "tl-note",
    T("▲ 풀버스트가 열린 순간 (음영 = 지속 구간) · 옅은 세모 = 풀버스트로 못 이어진 버스트")));

  det.append(wrap);
  return det;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 기록 한 건의 상세 — 인게임 «전투 기록»처럼 덱마다 니케 5명의 딜을 세로로 세운다.
 *  덱 총딜(5명 전체딜)과 전체 합계를 함께 적는다 — 기여도만 보이면 «얼마나 셌나»를 놓친다. */
/** 덱별 상세. 결과 탭·기록 탭·공유 페이지가 **모두 이 렌더러 하나만** 쓴다 —
 *  같은 것을 두 곳에서 그리면 어느 쪽이 맞는지 매번 확인해야 한다.
 *
 *  `opts.deckAction(i, blk)`이 있으면 덱 블록마다 불러 준다. 공유 페이지가
 *  «이 덱 가져오기»를 그 자리에 얹는 데 쓴다. */
function recDetail(r, opts = {}) {
  const box = el("div", "rec-decks");
  r.decks.forEach((d, i) => {
    const blk = el("div", "rec-deck");

    const head = el("div", "rec-deck-h");
    head.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
    head.append(el("span", "rec-deck-sub", "5명 전체딜"));
    const tot = el("b", "rec-deck-total", `${I18N.dmg(d.total)}`);
    tot.title = Math.round(d.total).toLocaleString("ko-KR");
    head.append(tot);
    blk.append(head);

    // 전체딜 100%를 **누가 얼마나 채웠는지**. 이 자리가 답할 질문은 «누가 지배하는가»
    // 하나뿐이고, «20%와 14% 중 뭐가 큰가»는 아래 개별 막대가 정확히 답한다.
    // 그래서 띠 대신 도넛이다 — 행 옆에 세우면 세로를 더 먹지도 않는다.
    const rowsAll = charsByFormation(d.names, d.chars);
    // 캡처에서 만든 기록은 «니케별 딜»이 없다 — 합계와 편성만 안다. 그때는 도넛·막대
    // 대신 얼굴 줄만 보여 준다. 없는 수치를 0으로 그리면 있는 것처럼 읽힌다.
    if (!rowsAll.length) {
      // 덱 블록은 [도넛][행 목록] 두 칸 격자다. 얼굴 줄만 넣으면 첫 칸(도넛 자리)에
      // 갇혀 왼쪽에 세로로 쌓인다 — 한 칸짜리로 풀어 준다.
      blk.classList.add("rec-deck-faces");
      const strip = el("div", "face-strip");
      for (const nm of (d.names || []).filter(Boolean)) {
        const rec2 = byName.get(nm);
        const f = el("div", "face" + (rec2?.img ? "" : " empty"));
        if (rec2?.img) {
          const im = el("img");
          im.src = artSrc(rec2, nm);
          im.alt = "";
          f.append(im);
        } else {
          f.append(el("div", "face-none", nm.slice(0, 1)));
        }
        f.append(el("div", "face-nm", nm));
        strip.append(f);
      }
      blk.append(strip);
      box.append(blk);
      if (opts.deckAction) opts.deckAction(i, blk);
      return;
    }
    // 도넛만은 **딜 순**이다 — 목록·막대는 배치 순이지만, 동그라미는 조각을
    // 딜 크기 순으로 이어야 「누가 지배하는가」가 회전 순서로도 바로 읽힌다.
    blk.append(donutEl(rowsAll.slice().sort((a, b) => b[1] - a[1]), d.total, d.names));
    // 행들을 한 상자로 묶는다 — 그래야 덱 블록이 [도넛][행 목록] **두 칸**으로 끝난다.
    // 행을 격자에 직접 늘어놓으면 도넛이 여러 행을 걸쳐야 하고, 그 span이 암시 행을
    // 잔뜩 만들어 블록 아래에 빈 공간이 생긴다.
    const list = el("div", "rec-rows");
    blk.append(list);

    // 덱 안에서 가장 센 니케를 100%로 잡는다 — 인게임 막대도 덱 내 최대 기준이다.
    // 줄 순서 자체는 **배치 순서**다(딜 순 아님) — 편성과 대조하기 쉬우라고.
    const rows = charsByFormation(d.names, d.chars);
    const top = Math.max(1, ...rows.map(([, v]) => v));
    for (const [nm, dmg] of rows) {
      const rec2 = byName.get(nm);
      const li = el("div", "rec-ch");

      const th = el("div", "rec-ch-art");
      if (rec2?.img) {
        const im = el("img");
        im.src = artSrc(rec2, nm);
        im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
        th.append(im);
      }
      li.append(th);

      const mid = el("div", "rec-ch-mid");
      const nmrow = el("div", "rec-ch-nm");
      // 도넛 조각과 **같은 색 점**. 조각에 이름을 그어 붙이면 240px 칸에서 겹치므로,
      // 색으로 잇고 이름은 이 줄에서 읽게 한다.
      const dot = el("i", "rec-ch-dot");
      dot.style.background = deckColor(d.names, nm);
      nmrow.append(dot);
      nmrow.append(el("span", "rec-ch-b", BURST_ROMAN[rec2?.burst] || "?"));
      nmrow.append(el("span", null, nm));
      mid.append(nmrow);

      const bar = el("div", "rec-ch-bar");
      const fill = el("i");
      fill.style.width = `${Math.max((dmg / top) * 100, 1.5)}%`;
      fill.style.background = deckColor(d.names, nm);   // 도넛·점과 같은 색
      bar.append(fill);
      mid.append(bar);
      li.append(mid);

      // 총딜 하나로는 «왜 이 딜인지»를 못 읽는다 — 기본공격/스킬 비중과 히트·크리를 함께.
      const dt = d.detail?.[nm];
      if (dt && dt.total) {
        // 아래 띠는 **위 딜 막대와 같은 길이** 안에서 갈린다. 전폭으로 두면 딜이 적은
        // 니케도 띠만 길어 «많이 때린 것»처럼 읽힌다.
        const seg = el("div", "rec-ch-split");
        seg.style.width = `${Math.max((dmg / top) * 100, 1.5)}%`;
        const nPct = (dt.normal / dt.total) * 100;
        const sN = el("i", "seg-normal"); sN.style.width = `${nPct}%`;
        sN.title = T("기본공격 {v} ({v1}%)", { v: I18N.dmg(dt.normal), v1: nPct.toFixed(1) });
        const sS = el("i", "seg-skill"); sS.style.width = `${100 - nPct}%`;
        sS.title = T("스킬 {v} ({v1}%)", { v: I18N.dmg(dt.skill), v1: (100 - nPct).toFixed(1) });
        seg.append(sN, sS);
        mid.append(seg);
        const sub = el("div", "rec-ch-sub");
        sub.append(el("span", null, T("기본 {v}%", { v: nPct.toFixed(0) })));
        sub.append(el("span", null, T("스킬 {v}%", { v: (100 - nPct).toFixed(0) })));
        sub.append(el("span", null, T("{v}히트", { v: dt.hits.toLocaleString("ko-KR") })));
        // 크리는 **기대 크리율**이다. 기대값 모드에서는 크리를 확률로 굴리지 않고
        // 계수에 녹이므로 `is_crit`이 늘 false다 — 대신 히트마다 실린 `crit_frac`
        // (그 히트의 크리 확률)을 평균 내면 «몇 %가 크리로 들어갔는지»가 나온다.
        // 옛 기록은 크리가 0으로 저장돼 있다 — «크리 0%»로 적으면 사실이 아니다
        if (dt.hits && dt.crit > 0) {
          sub.append(el("span", null, T("크리 {v}%", { v: ((dt.crit / dt.hits) * 100).toFixed(0) })));
        }
        mid.append(sub);
      }

      const val = el("div", "rec-ch-v");
      val.append(el("b", null, `${I18N.dmg(dmg)}`));
      val.append(el("span", null, `${((dmg / (d.total || 1)) * 100).toFixed(1)}%`));
      const dps = dmg / (r.duration || 1);
      val.append(el("span", null, T("{v}/초", { v: I18N.dmg(dps) })));
      val.title = Math.round(dmg).toLocaleString("ko-KR");
      // 여러 판을 굴렸으면 **이 니케의 폭**도 적는다 — «수신데가 크리 떴냐로 얼마나
      // 갈리나»가 원 질문이라(피드백 077430d5), 덱 합계보다 이쪽이 답에 가깝다.
      const rc = d.runs?.chars?.[nm];
      if (rc && rc.min != null && rc.max != null) {
        const rl = el("span", "rec-ch-range", `${I18N.dmg(rc.min)} ~ ${I18N.dmg(rc.max)}`);
        rl.title = T("{n}회 굴린 폭 — 가장 낮은 판과 가장 높은 판", { n: d.runs.n ?? "" });
        val.append(rl);
      }
      li.append(val);

      list.append(li);
    }
    if (!rows.length) list.append(el("div", "rec-ch-none", "니케별 수치가 없는 기록입니다"));
    // 덱 노트(«고정값 아님…»)는 여기 안 적는다. 편성 탭에서 이미 크게 경고하고,
    // 기록은 «그때 이 수치가 나왔다»를 보는 자리라 매 덱마다 같은 문단이 반복될 뿐이다.

    // 타임라인 — **확인용**. `d.timeline`은 결과 탭이 방금 계산한 결과에만 실려 온다
    // (collectDecks가 기록에는 안 담는다) — 그래서 기록 탭에서 이 함수를 같이 써도
    // 저장된 기록에서는 조용히 안 뜬다.
    if (d.timeline?.buckets?.length) {
      blk.append(timelineEl(d.names, d.timeline, d.burstCycles, r.duration || 180, d.tlReq || null));
    }
    if (opts.deckAction) opts.deckAction(i, blk);
    box.append(blk);
  });

  const sum = el("div", "rec-sum");
  sum.append(el("span", null, T("{length}덱 전체 합계", { length: r.decks.length })));
  const sv = el("b", null, `${I18N.dmg(r.total)}`);
  sv.title = Math.round(r.total).toLocaleString("ko-KR");
  sum.append(sv);
  box.append(sum);
  return box;
}

/** 기여도 도넛. 라이브러리 없이 SVG 원 하나에 `stroke-dasharray`로 조각을 얹는다.
 *  가운데에는 덱 총딜을 적어 «무엇의 100%인지»를 도넛 자체가 말하게 한다. */
function donutEl(rows, total, names) {
  const NS = "http://www.w3.org/2000/svg";
  const R = 34, C = 2 * Math.PI * R, W = 12;
  const box = el("div", "rec-donut");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 88 88");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", T("덱 기여도 — {v}", { v: rows.map(([n, v]) =>
    `${T(n)} ${((v / (total || 1)) * 100).toFixed(0)}%`).join(", ") }));

  const ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", "44"); ring.setAttribute("cy", "44"); ring.setAttribute("r", R);
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke-width", W);
  ring.setAttribute("stroke", "var(--color-stage-3)");
  svg.append(ring);

  let acc = 0;
  for (const [nm, dmg] of rows) {
    const frac = dmg / (total || 1);
    const seg = document.createElementNS(NS, "circle");
    seg.setAttribute("cx", "44"); seg.setAttribute("cy", "44"); seg.setAttribute("r", R);
    seg.setAttribute("fill", "none"); seg.setAttribute("stroke-width", W);
    seg.setAttribute("stroke", deckColor(names, nm));
    // 조각 사이 2px 간격 — 인접한 채움이 붙으면 경계가 사라진다 (dataviz 규칙)
    const len = Math.max(0, C * frac - 2);
    seg.setAttribute("stroke-dasharray", `${len} ${C - len}`);
    seg.setAttribute("stroke-dashoffset", `${-C * acc}`);
    seg.setAttribute("transform", "rotate(-90 44 44)");
    const t = document.createElementNS(NS, "title");
    t.textContent = `${T(nm)} — ${I18N.dmg(dmg)} (${(frac * 100).toFixed(1)}%)`;
    seg.append(t);
    svg.append(seg);

    // 조각 안에 퍼센트. 좁은 조각에 글자를 넣으면 넘치므로 **8% 이상만** 적는다.
    if (frac >= 0.08) {
      const mid = (acc + frac / 2) * 2 * Math.PI - Math.PI / 2;
      const rr = R;                       // 링 한가운데
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", (44 + Math.cos(mid) * rr).toFixed(1));
      tx.setAttribute("y", (44 + Math.sin(mid) * rr).toFixed(1));
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("dominant-baseline", "central");
      tx.setAttribute("font-size", "7");
      tx.setAttribute("font-weight", "700");
      // 링 색이 밝아 흰 글자는 묻힌다 — 어두운 글자에 얇은 밝은 테를 두른다
      tx.setAttribute("fill", "#101317");
      tx.setAttribute("paint-order", "stroke");
      tx.setAttribute("stroke", "rgba(255,255,255,.55)");
      tx.setAttribute("stroke-width", "1.6");
      tx.textContent = `${(frac * 100).toFixed(0)}%`;
      svg.append(tx);
    }
    acc += frac;
  }
  box.append(svg);
  // 가운데는 «몇 명»이 아니라 **1등이 누구인지**. 인원은 옆 목록을 세면 되고,
  // 도넛이 답해야 할 질문은 «누가 지배하는가»다.
  // `rows`는 이제 배치 순서로 들어온다 — **딜 최댓값을 따로 찾아야** 1등이 맞는다
  // (rows[0]은 편성 첫 자리일 뿐 1등이 아닐 수 있다).
  const mid = el("div", "rec-donut-mid");
  mid.append(el("b", null, `${I18N.dmg(total)}`));
  const topPick = rows.reduce((a, b) => (!a || b[1] > a[1] ? b : a), null);
  if (topPick) {
    const [tn, tv] = topPick;
    const lead = el("span", "rec-donut-lead");
    lead.append(el("i", null, tn));
    lead.append(el("em", null, `${((tv / (total || 1)) * 100).toFixed(0)}%`));
    mid.append(lead);
  }
  box.append(mid);
  return box;
}

/** 기록 → 붙여넣기 좋은 평문. 표 모양을 유지하려고 폭을 맞춘다. */
function recordText(r) {
  const L = [];
  L.push(`■ ${r.name || r.label}`);
  L.push(T("   {v} · 약점 {v1} · {duration}초 · {profileName}", { v: when(r.at), v1: r.code || T("없음"), duration: r.duration, profileName: r.profileName }));
  r.decks.forEach((d, i) => {
    L.push("");
    L.push(T("[{v}] 5명 전체딜 {v1}", { v: String(i + 1).padStart(2, "0"), v1: I18N.dmg(d.total) }));
    const rows = charsByFormation(d.names, d.chars);
    const w = Math.max(4, ...rows.map(([n]) => [...n].reduce(
      (a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)));
    for (const [nm, dmg] of rows) {
      const pad = w - [...nm].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
      const dt = d.detail?.[nm];
      const extra = dt && dt.total
        ? T("  기본 {v}% · {v1}히트", { v: ((dt.normal / dt.total) * 100).toFixed(0), v1: dt.hits.toLocaleString("ko-KR") })
        : "";
      L.push(`  ${nm}${" ".repeat(Math.max(0, pad))}  ${I18N.dmg(dmg)}`
             + `  ${((dmg / (d.total || 1)) * 100).toFixed(1)}%${extra}`);
    }
  });
  L.push("");
  L.push(T("합계 {v} · {length}덱", { v: I18N.dmg(r.total), length: r.decks.length }));
  return L.join("\n");
}

async function copyRecord(r) {
  const text = recordText(r);
  try {
    await navigator.clipboard.writeText(text);
    recMsg(T("클립보드에 복사했습니다."), "ok");
  } catch {
    // 클립보드 권한이 없는 환경(비 HTTPS 등)에서는 조용히 실패하지 않는다
    const ta = el("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    recMsg(ok ? T("클립보드에 복사했습니다.") : T("복사에 실패했습니다 — 내보내기를 쓰세요."),
           ok ? "ok" : "err");
  }
}

// ── 기록 비교 ───────────────────────────────────────────────────────────
// 두 기록의 «같은 덱»을 짝지어 딜이 어디서 늘었는지 본다.
//
// 덱 번호는 믿을 수 없다 — 같은 편성이 이번엔 3덱에, 저번엔 1덱에 있을 수 있다.
// 그래서 **편성이 겹치는 정도**로 짝을 짓는다. 5명 중 3명 이상 같으면 같은 덱으로 본다
// (한두 명 바꿔 끼운 것은 같은 덱, 세 명 이상 바뀌면 다른 덱이라는 뜻이다).

const COMPARE_MIN_OVERLAP = 3;

const deckNames = (d) => (d.names || []).filter(Boolean);

/** 두 기록을 짝짓는다. 겹치는 수가 큰 짝부터 확정하는 그리디 —
 *  「a가 b1과 4명, b2와 3명 겹친다」면 4명 쪽이 먼저 임자를 정해야 한다. */
function compareRecords(a, b) {
  const cand = [];
  a.decks.forEach((da, ai) => {
    const sa = new Set(deckNames(da));
    b.decks.forEach((db, bi) => {
      const n = deckNames(db).filter((x) => sa.has(x)).length;
      if (n >= COMPARE_MIN_OVERLAP) cand.push({ ai, bi, n });
    });
  });
  cand.sort((x, y) => y.n - x.n);
  const usedA = new Set(), usedB = new Set(), pairs = [];
  for (const c of cand) {
    if (usedA.has(c.ai) || usedB.has(c.bi)) continue;
    usedA.add(c.ai); usedB.add(c.bi);
    pairs.push(c);
  }
  pairs.sort((x, y) => x.ai - y.ai);

  // 편성이 겹치지 않아 짝을 못 지은 덱을 **따로 늘어놓지 않는다.** 남은 것끼리
  // **딜 순으로** 맞댄다 — 남는 1등 ↔ 남는 1등, 남는 2등 ↔ 남는 2등.
  // 편성이 통째로 바뀌어도 «내 제일 센 덱이 쟤 제일 센 덱보다 높은가»는 여전히
  // 묻고 싶은 비교다. 나란히 안 붙여 놓으면 사람이 눈으로 숫자를 옮겨 적어야 한다.
  const byTot = (rec) => (x, y) => (rec.decks[y].total || 0) - (rec.decks[x].total || 0);
  const restA = a.decks.map((_, i) => i).filter((i) => !usedA.has(i)).sort(byTot(a));
  const restB = b.decks.map((_, i) => i).filter((i) => !usedB.has(i)).sort(byTot(b));
  const rank = [];
  for (let i = 0; i < Math.min(restA.length, restB.length); i++) {
    const ai = restA[i], bi = restB[i];
    const sa = new Set(deckNames(a.decks[ai]));
    const n = deckNames(b.decks[bi]).filter((x) => sa.has(x)).length;
    rank.push({ ai, bi, n, rank: i + 1 });
  }
  // 한쪽에만 남은 덱(덱 수가 다를 때)은 어쩔 수 없이 혼자 놓는다
  return { pairs, rank, onlyA: restA.slice(rank.length), onlyB: restB.slice(rank.length) };
}

/** 증감 한 칸. 부호와 색을 함께 준다 — 숫자만 있으면 늘었는지 줄었는지 훑을 수 없다. */
function deltaEl(from, to, opts = {}) {
  const d = to - from;
  const pct = from ? (d / from) * 100 : 0;
  const cls = Math.abs(d) < 1 ? "flat" : (d > 0 ? "up" : "down");
  const box = el("span", `cmp-delta ${cls}`);
  const sign = d > 0 ? "+" : (d < 0 ? "−" : "±");
  box.append(el("b", null, `${sign}${I18N.dmg(Math.abs(d))}`));
  if (!opts.noPct && from) box.append(el("span", null, `${sign}${Math.abs(pct).toFixed(1)}%`));
  box.title = `${Math.round(from).toLocaleString("ko-KR")} → ${Math.round(to).toLocaleString("ko-KR")}`;
  return box;
}

/** 짝지은 덱 하나의 니케별 증감. 두 기록에 한쪽만 있는 니케도 빠뜨리지 않는다. */
/** 이 덱이 «니케별 딜»을 아는가. 캡처에서 만든 기록은 모른다(`chars`가 비어 있다). */
const hasChars = (d) => Object.keys(d.chars || {}).length > 0;

function charRows(da, db) {
  const A = da.chars || {}, B = db.chars || {};
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
  const rows = keys.map((n) => ({ n, a: A[n] ?? null, b: B[n] ?? null }));
  // 배치 순서로 늘어놓는다 — 딜 증감 순이 아니다. 같은 편성을 계정만 바꿔 비교할 때
  // (실측 사례) 딜 증감순이면 계정마다 어느 니케가 제일 늘었는지가 갈려 순서가 매번
  // 뒤바뀐다. 기준(a) 덱의 배치를 먼저 따르고, a엔 없고 b에만 있는 이름은 b 덱
  // 배치 순서로 뒤에 붙인다.
  const orderA = deckNames(da), orderB = deckNames(db);
  const rank = (n) => {
    const ia = orderA.indexOf(n);
    if (ia !== -1) return ia;
    const ib = orderB.indexOf(n);
    return ib !== -1 ? orderA.length + ib : orderA.length + orderB.length;
  };
  return rows.sort((x, y) => rank(x.n) - rank(y.n));
}

function renderCompare(body, a, b) {
  const cmp = compareRecords(a, b);
  body.textContent = "";

  // 조건이 다르면 비교 자체가 의미가 흐려진다 — 숫자를 보여 주기 전에 말한다
  const diffs = [];
  if (a.code !== b.code) diffs.push(T("약점 코드 {v} → {v1}", { v: a.code || T("없음"), v1: b.code || T("없음") }));
  if (a.duration !== b.duration) diffs.push(T("전투 시간 {duration}초 → {duration1}초", { duration: a.duration, duration1: b.duration }));
  if (a.profileName !== b.profileName) diffs.push(T("계정 «{profileName}» → «{profileName1}»", { profileName: a.profileName, profileName1: b.profileName }));
  if (diffs.length) {
    body.append(el("p", "share-pick-note warn",
      T("조건이 다릅니다 — {v}. 늘어난 딜이 편성 덕인지 조건 탓인지 갈립니다.", { v: diffs.join(" · ") })));
  }

  // 합계
  const sum = el("div", "cmp-sum");
  sum.append(el("span", "cmp-sum-k", "합계"));
  sum.append(el("span", "cmp-sum-v", `${I18N.dmg(a.total)} → ${I18N.dmg(b.total)}`));
  sum.append(deltaEl(a.total, b.total));
  body.append(sum);

  const head = el("p", "prose prose-sm",
    T("{v} (기준) → {v1} (비교)", { v: a.name || when(a.at), v1: b.name || when(b.at) })
    + T(" · 편성으로 짝지은 덱 {length}개", { length: cmp.pairs.length })
    + (cmp.rank.length ? T(" · 나머지 {length}개는 딜 순으로 맞댐", { length: cmp.rank.length }) : "")
    + T(" · 5명 중 {COMPARE_MIN_OVERLAP}명 이상 겹치면 같은 덱으로 봅니다.", { COMPARE_MIN_OVERLAP }));
  body.append(head);

  if (!cmp.pairs.length && !cmp.rank.length) {
    body.append(el("p", "share-pick-note warn",
      T("겹치는 덱이 없습니다 — 편성이 완전히 다른 두 기록입니다.")));
  }

  for (const p of [...cmp.pairs, ...cmp.rank]) {
    const da = a.decks[p.ai], db = b.decks[p.bi];
    const blk = el("div", "cmp-deck" + (p.rank ? " byrank" : ""));

    const h = el("div", "cmp-deck-h");
    h.append(el("span", "rec-no", String(p.ai + 1).padStart(2, "0")));
    h.append(el("span", "cmp-arrow", "→"));
    h.append(el("span", "rec-no", String(p.bi + 1).padStart(2, "0")));
    h.append(el("span", "cmp-overlap",
      p.rank ? T("편성 다름 · 남는 덱 {rank}위끼리", { rank: p.rank }) : T("{n}명 같음", { n: p.n })));
    h.append(el("span", "cmp-tot", `${I18N.dmg(da.total)} → ${I18N.dmg(db.total)}`));
    h.append(deltaEl(da.total, db.total));
    blk.append(h);

    // 편성이 어떻게 바뀌었나 — 늘어난 딜의 이유가 대개 여기에 있다.
    // 이름만 적으면 누가 누군지 바로 안 떠오른다. **얼굴로**, 그리고 바뀐 사람은
    // **딜 순으로 짝지어** 보여 준다 (빠진 1등 ↔ 새로 온 1등).
    blk.append(cmpFaces(da, db));

    // 캡처 기록은 **니케별 딜을 모른다.** 그런 쪽을 0으로 두고 표를 그리면 같은
    // 니케가 «빠짐 −100%»로 찍힌다 — 편성은 그대로인데 전멸한 것처럼 보인다.
    // 아는 것만 말한다: 덱 합계와 편성.
    if (!hasChars(da) || !hasChars(db)) {
      const who = !hasChars(da) && !hasChars(db) ? T("양쪽 다")
        : (!hasChars(da) ? T("기준") : T("비교"));
      blk.append(el("p", "cmp-nochars",
        T("{who} 캡처에서 만든 기록이라 니케별 딜이 없습니다 — 덱 합계와 편성만 견줍니다.", { who })));
      body.append(blk);
      continue;
    }
    const list = el("div", "cmp-rows");
    for (const r of charRows(da, db)) {
      const li = el("div", "cmp-row");
      const th = el("div", "cmp-art");
      const rec = byName.get(r.n);
      if (rec?.img) {
        const im = el("img");
        im.src = artSrc(rec, r.n);
        im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.draggable = false;
        th.append(im);
      }
      li.append(th);
      const nm = el("div", "cmp-nm", r.n);
      if (r.a == null) nm.append(el("i", "cmp-tag in", "새로"));
      else if (r.b == null) nm.append(el("i", "cmp-tag out", "빠짐"));
      li.append(nm);
      li.append(el("div", "cmp-v", `${I18N.dmg(r.a ?? 0)} → ${I18N.dmg(r.b ?? 0)}`));
      li.append(deltaEl(r.a ?? 0, r.b ?? 0, { noPct: r.a == null }));
      list.append(li);
    }
    blk.append(list);
    body.append(blk);
  }

  for (const [side, idxs, rec, label] of [["a", cmp.onlyA, a, T("기준에만")],
                                          ["b", cmp.onlyB, b, T("비교에만")]]) {
    for (const i of idxs) {
      const d = rec.decks[i];
      const blk = el("div", "cmp-deck lone");
      const h = el("div", "cmp-deck-h");
      h.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
      h.append(el("span", "cmp-overlap", T("{label} 있는 덱 — 맞둘 상대가 없음", { label })));
      h.append(el("span", "cmp-tot", `${I18N.dmg(d.total)}`));
      blk.append(h);
      blk.append(cmpLoneFaces(d));
      body.append(blk);
    }
  }
}

/** 비교할 기록 두 개를 고른다. **먼저 고른 쪽이 기준**이다 —
 *  이 화면이 답하는 질문이 «내가 쟤보다 몇 % 높은가»라서, 기준을 사람이 정해야 한다.
 *  (시간 순으로 고정해 두면 부호를 매번 거꾸로 읽게 된다.) */
function openCompare() {
  const dlg = $("#rec-compare-sheet");
  const body = $("#rec-compare-body");
  const go = $("#rec-compare-go");
  if (!dlg || !body || !go) return;
  if (recordsNow().length < 2) {
    recMsg(T("비교하려면 기록이 둘 이상 있어야 합니다."), "err");
    return;
  }

  let pick = [];
  const paint = () => {
    $("#rec-compare-t").textContent = T("비교할 기록 고르기");
    body.textContent = "";
    body.append(el("p", "prose prose-sm",
      T("두 개를 고르세요. **먼저 고른 쪽이 기준**이 되고, 덱은 편성이")
      + T(" {COMPARE_MIN_OVERLAP}명 이상 겹치는 것끼리 짝지어 비교합니다.", { COMPARE_MIN_OVERLAP })));
    const list = el("div", "share-pairs");
    for (const r of recordsNow()) {
      const on = pick.includes(r.id);
      const row = el("div", "share-pair pick" + (on ? " on" : ""));
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", String(on));
      row.tabIndex = 0;
      const toggle = () => {
        if (on) pick = pick.filter((x) => x !== r.id);
        else pick = [...pick, r.id].slice(-2);      // 셋째를 고르면 가장 먼저 고른 것이 빠진다
        paint();
      };
      row.onclick = toggle;
      row.onkeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      };
      row.append(el("span", "share-pair-ck", on ? "✓" : ""));
      const mid = el("span", "share-pair-mid");
      // 사람이 붙인 이름이 우선 — 자동 라벨(«솔레 기록 · 5덱 · …억»)만 보이면
      // 기록이 여럿일 때 구분이 안 된다.
      mid.append(el("span", "share-pair-src", r.name || r.label));
      mid.append(el("span", "share-pair-dst" + (on ? " on" : ""),
        T("{v} · {length}덱 · {profileName} · {v1} {duration}초", { v: when(r.at), length: r.decks.length, profileName: r.profileName, v1: r.code || T("속성없음"), duration: r.duration })));
      row.append(mid);
      list.append(row);
    }
    body.append(list);
    go.disabled = pick.length !== 2;
    go.textContent = pick.length === 2 ? T("비교하기") : T("{length} / 2 골랐습니다", { length: pick.length });
  };
  paint();

  const close = () => dlg.close();
  $("#rec-compare-x").onclick = close;
  $("#rec-compare-cancel").onclick = close;
  go.onclick = () => {
    // **먼저 고른 것이 기준**이다. 시간 순으로 뒤집으면 «내가 쟤보다 몇 % 높다»를
    // 보려고 고른 사람이 부호를 매번 거꾸로 읽어야 한다.
    const byId = new Map(recordsNow().map((r) => [r.id, r]));
    const two = pick.map((id) => byId.get(id)).filter(Boolean);
    if (two.length !== 2) return;
    $("#rec-compare-t").textContent =
      `«${two[0].name || two[0].label}» → «${two[1].name || two[1].label}»`;
    renderCompare(body, two[0], two[1]);
    go.hidden = true;
    $("#rec-compare-cancel").textContent = T("닫기");
  };
  go.hidden = false;
  $("#rec-compare-cancel").textContent = T("취소");
  if (!dlg.open) dlg.showModal();
}

/** 기록 → 캔버스. **직접 그린다** — html2canvas 같은 라이브러리는 오프라인·CSP에서
 *  깨지고, 이 표는 선 몇 개라 손으로 그리는 편이 확실하다.
 *
 *  덱을 **2열**로 놓아 5덱이 한 장에 다 들어가게 하고, 초상화도 같이 그린다.
 *  세로로 쭉 늘어놓으면 5덱이 세로로 길어져 한눈에 안 들어온다. */
async function recordCanvas(r) {
  const S = 2;                                   // 레티나 배율
  const PAD = 22, COL_GAP = 18, ROW = 40, HEAD = 64, FOOT = 14;
  const DONUT = 104;                             // 왼쪽 도넛 칸
  const RX = DONUT + 14;                         // 행이 시작하는 x (도넛 오른쪽)
  const RW = 440;                                // 덱 칸 전체 폭
  const COLS = r.decks.length > 1 ? 2 : 1;
  const COL_W = 440;
  const W = PAD * 2 + COL_W * COLS + COL_GAP * (COLS - 1);
  // 니케별 딜이 없으면 `names`로 높이를 잡는다. `chars`만 보면 0줄이 되어
  // 덱 칸이 텅 빈 채로 저장된다.
  const deckRows = (d) => (Object.keys(d.chars || {}).length
    || (d.names || []).filter(Boolean).length);
  const deckH = (d) => 26 + deckRows(d) * ROW + 14;
  const rowsH = [];
  for (let i = 0; i < r.decks.length; i += COLS) {
    rowsH.push(Math.max(...r.decks.slice(i, i + COLS).map(deckH)));
  }
  const H = HEAD + rowsH.reduce((x, y) => x + y, 0) + FOOT;

  const cv = el("canvas");
  cv.width = W * S; cv.height = H * S;
  const x = cv.getContext("2d");
  x.scale(S, S);
  const INK = "#eef1f6", DIM = "#9aa3b2", AMBER = "#f0a935", BG = "#14161a", LINE = "#2a2f38";

  x.fillStyle = BG; x.fillRect(0, 0, W, H);
  x.fillStyle = INK; x.font = "700 19px Pretendard, system-ui, sans-serif";
  x.fillText(r.name || r.label, PAD, 36);
  x.strokeStyle = LINE; x.beginPath(); x.moveTo(PAD, 50); x.lineTo(W - PAD, 50); x.stroke();

  // 초상화를 먼저 다 불러 둔다 — 그리는 중에 기다리면 순서가 뒤엉킨다
  // 캡처에서 만든 기록은 `chars`가 비어 있다 — 그때는 `names`가 유일한 명단이다.
  const wanted = [...new Set(r.decks.flatMap(
    (d) => (Object.keys(d.chars || {}).length ? Object.keys(d.chars)
                                              : (d.names || []).filter(Boolean))))];
  const arts = new Map();
  await Promise.all(wanted.map(async (nm) => {
    const rec = byName.get(nm);
    if (!rec?.img) return;
    try {
      const im = new Image();
      im.src = artSrc(rec, nm);
      await im.decode();
      arts.set(nm, im);
    } catch { /* 초상화가 없으면 이름만 그린다 */ }
  }));

  let rowTop = HEAD;
  r.decks.forEach((d, i) => {
    const col = COLS === 1 ? 0 : i % COLS;
    if (col === 0 && i) rowTop += rowsH[Math.floor(i / COLS) - 1];
    const ox = PAD + col * (COL_W + COL_GAP);
    let y = rowTop;

    x.fillStyle = "#4cb3ef"; x.font = "700 13px Pretendard, system-ui, sans-serif";
    x.fillText(String(i + 1).padStart(2, "0"), ox, y);
    x.fillStyle = DIM; x.font = "11px Pretendard, system-ui, sans-serif";
    x.fillText(T("5명 전체딜"), ox + 24, y);
    x.fillStyle = AMBER; x.font = "700 15px Pretendard, system-ui, sans-serif";
    x.textAlign = "right"; x.fillText(`${I18N.dmg(d.total)}`, ox + COL_W, y); x.textAlign = "left";

    // **배치 순서**로 나열한다(딜 순 아님) — 편성을 보면서 대조하려는 목적이라
    // 실제 슬롯 순서와 같아야 훑기 쉽다. 도넛 가운데 «1등» 표시만 별도로 딜
    // 최상위를 찾는다(목록 순서와 무관하게 실제 1등이어야 한다).
    const chars = d.chars || {};
    const order = (d.names || []).filter(Boolean);
    const rows = order.length
      ? order.filter((nm) => nm in chars).map((nm) => [nm, chars[nm]])
      : Object.entries(chars);
    const topRow = rows.reduce((a, b) => (!a || b[1] > a[1] ? b : a), null);

    // 캡처에서 만든 기록은 니케별 딜을 모른다 — 도넛·막대를 0으로 그리면
    // 있는 수치처럼 읽힌다. 얼굴과 이름만 늘어놓고 끝낸다.
    if (!rows.length) {
      const list = (d.names || []).filter(Boolean);
      let fy = y + 18;
      for (const nm of list) {
        const im = arts.get(nm);
        if (im) {
          const AW = 26, AH = 34;
          x.save();
          x.beginPath(); x.rect(ox, fy - 4, AW, AH); x.clip();
          const sc = Math.max(AW / im.width, AH / im.height);
          x.drawImage(im, ox + (AW - im.width * sc) / 2,
                      fy - 4 - im.height * sc * 0.10, im.width * sc, im.height * sc);
          x.restore();
        }
        x.fillStyle = INK; x.font = "13px Pretendard, system-ui, sans-serif";
        x.fillText(T(nm), ox + 34, fy + 18);
        fy += ROW;
      }
      return;
    }

    // 기여도 도넛 — **왼쪽 제 칸**에. 가운데에 덱 총딜과 1등을 적어 화면과 같은
    // 모습으로 만든다 (행 위에 얹으면 이름·막대와 겹친다).
    {
      const cxx = ox + DONUT / 2, cyy = y + rows.length * ROW / 2 + 4,
            rr = DONUT / 2 - 8, lw = 11;
      let acc = -Math.PI / 2;
      x.lineWidth = lw;
      x.strokeStyle = "#232830";
      x.beginPath(); x.arc(cxx, cyy, rr, 0, Math.PI * 2); x.stroke();
      // 도넛 조각만 **딜 순**이다 — 옆 목록(`rows`)은 배치 순이지만, 동그라미는
      // 딜 크기 순으로 이어야 회전 순서만 봐도 「누가 지배하는가」가 읽힌다.
      const donutRows = rows.slice().sort((a, b) => b[1] - a[1]);
      for (const [nm, dmg] of donutRows) {
        const frac = dmg / (d.total || 1);
        const gap = 0.035;                       // 조각 사이 틈 (dataviz 규칙)
        x.strokeStyle = deckColor(d.names, nm);
        x.beginPath();
        x.arc(cxx, cyy, rr, acc + gap / 2, acc + frac * Math.PI * 2 - gap / 2);
        x.stroke();
        acc += frac * Math.PI * 2;
      }
      x.lineWidth = 1;
      x.textAlign = "center";
      x.fillStyle = AMBER; x.font = "700 14px Pretendard, system-ui, sans-serif";
      x.fillText(`${I18N.dmg(d.total)}`, cxx, cyy - 2);
      if (topRow) {
        const [tn, tv] = topRow;
        x.fillStyle = INK; x.font = "9px Pretendard, system-ui, sans-serif";
        let lead = T(tn);
        while (x.measureText(lead).width > DONUT - 22 && lead.length > 2) lead = lead.slice(0, -1);
        if (lead !== tn) lead = lead.slice(0, -1) + "…";
        x.fillText(lead, cxx, cyy + 10);
        x.fillStyle = DIM;
        x.fillText(`${((tv / (d.total || 1)) * 100).toFixed(0)}%`, cxx, cyy + 21);
      }
      x.textAlign = "left";
    }
    const top = Math.max(1, ...rows.map(([, v]) => v));
    for (const [nm, dmg] of rows) {
      y += ROW;
      // 얼굴이 알아볼 만해야 «누구 기록인지»가 한눈에 온다 — 막대를 조금 줄이고
      // 초상화를 키운다.
      const px = ox + RX, pw = 30, ph = 36;
      const im = arts.get(nm);
      x.fillStyle = "#1c2027"; x.fillRect(px, y - 30, pw, ph);
      if (im) {
        x.save();
        x.beginPath(); x.rect(px, y - 30, pw, ph); x.clip();
        // 세로로 긴 초상화(256×512)에서 얼굴 쪽만 — 카드와 같은 잘림 위치
        const sc = pw / im.width;
        x.drawImage(im, px, y - 30, pw, im.height * sc);
        x.restore();
      }
      // 버스트 단계를 이름 앞에 — 편성을 읽을 때 «몇 버스트가 몇 명인지»가 먼저 궁금하다
      const bx0 = px + pw + 7;
      const burst = BURST_ROMAN[byName.get(nm)?.burst] || "?";
      x.fillStyle = "#2b313a"; x.fillRect(bx0, y - 23, 15, 14);
      x.fillStyle = DIM; x.font = "700 9px Pretendard, system-ui, sans-serif";
      x.textAlign = "center"; x.fillText(burst, bx0 + 7.5, y - 13); x.textAlign = "left";

      x.fillStyle = INK; x.font = "12px Pretendard, system-ui, sans-serif";
      const nameW = 100;
      let label = T(nm);
      while (x.measureText(label).width > nameW && label.length > 2) label = label.slice(0, -1);
      if (label !== nm) label = label.slice(0, -1) + "…";
      x.fillText(label, bx0 + 20, y - 12);
      x.fillStyle = INK; x.font = "700 12px Pretendard, system-ui, sans-serif";
      x.textAlign = "right"; x.fillText(`${I18N.dmg(dmg)}`, ox + RW - 42, y - 12);
      x.fillStyle = DIM; x.font = "11px Pretendard, system-ui, sans-serif";
      x.fillText(`${((dmg / (d.total || 1)) * 100).toFixed(1)}%`, ox + RW, y - 12);
      x.textAlign = "left";
      const bx = px + pw + 7, bw = ox + RW - 46 - bx;
      x.fillStyle = "#232830"; x.fillRect(bx, y - 5, bw, 3);
      const w = bw * (dmg / top);
      x.fillStyle = deckColor(d.names, nm);
      x.fillRect(bx, y - 5, w, 3);
      // 그 아래 얇게 평타/스킬. **딜 막대와 같은 길이 안에서** 갈린다 —
      // 전폭으로 두면 딜이 적은 니케도 띠만 길어 «많이 때린 것»처럼 읽힌다.
      const dt = d.detail?.[nm];
      if (dt && dt.total) {
        const nw = w * (dt.normal / dt.total);
        x.fillStyle = "#4cb3ef"; x.fillRect(bx, y - 1, nw, 2);
        x.fillStyle = "#c48218"; x.fillRect(bx + nw, y - 1, w - nw, 2);
      }
    }
  });

  // 맨 아래에는 아무것도 두지 않는다 — «전체 합계»는 제목 줄에 이미 있고,
  // 평타/스킬 범례도 뺐다. 얇은 두 색 띠는 봐서 알 만한 것이라, 한 줄을 더 쓰는
  // 값어치가 없었다.
  return cv;
}

const recFile = (r) => T("니케기록-{v}.png", { v: (r.name || r.label).replace(/[\/:*?"<>|]/g, "_") });

/** 유니온 기록 → 캔버스. **솔로와 별개 함수다** — 솔로는 5덱을 2열로 앉히지만
 *  유니온은 세 줄이 곧 한 출격 묶음이라 위에서 아래로 **한 줄로** 쭉 이어야
 *  「오늘 이렇게 쳤다」가 그대로 읽힌다. 줄마다 어느 보스였는지도 함께 적는다. */
async function unionRecordCanvas(r) {
  const S = 2;
  // 왼쪽에 기여도 도넛 칸을 둔다 — 솔로 기록과 같은 읽는 법이라야 두 장을 나란히
  // 놓고 봐도 눈이 안 헤맨다.
  const PAD = 22, ROW = 40, HEAD = 70, FOOT = 16, DONUT = 104, W = 560;
  const RX = PAD + DONUT + 14;
  const deckRows = (d) => (Object.keys(d.chars || {}).length
    || (d.names || []).filter(Boolean).length);
  // 도넛이 행보다 클 수 있다 — 둘 중 큰 쪽이 그 줄의 높이다
  const deckH = (d) => 30 + Math.max(deckRows(d) * ROW, DONUT) + 16;
  const H = HEAD + r.decks.reduce((a, d) => a + deckH(d), 0) + FOOT;

  const cv = el("canvas");
  cv.width = W * S; cv.height = H * S;
  const x = cv.getContext("2d");
  x.scale(S, S);
  const INK = "#eef1f6", DIM = "#9aa3b2", ROSE = "#ff8ad0", BG = "#14161a", LINE = "#2a2f38";

  x.fillStyle = BG; x.fillRect(0, 0, W, H);
  x.fillStyle = INK; x.font = "700 19px Pretendard, system-ui, sans-serif";
  x.fillText(r.name || r.label, PAD, 34);
  x.fillStyle = ROSE; x.font = "800 20px Pretendard, system-ui, sans-serif";
  x.textAlign = "right";
  x.fillText(`${I18N.dmg(r.total)}`, W - PAD, 34);
  x.textAlign = "left";
  x.fillStyle = DIM; x.font = "500 12px Pretendard, system-ui, sans-serif";
  x.fillText(T("{duration}초 · {v}", { duration: r.duration, v: r.profileName || "" }).trim(), PAD, 52);
  x.strokeStyle = LINE; x.beginPath(); x.moveTo(PAD, 60); x.lineTo(W - PAD, 60); x.stroke();

  const wanted = [...new Set(r.decks.flatMap(
    (d) => (Object.keys(d.chars || {}).length ? Object.keys(d.chars)
                                              : (d.names || []).filter(Boolean))))];
  const arts = new Map();
  await Promise.all(wanted.map(async (nm) => {
    const rec = byName.get(nm);
    if (!rec?.img) return;
    try {
      const im = new Image();
      im.src = artSrc(rec, nm);
      await im.decode();
      arts.set(nm, im);
    } catch { /* 초상화가 없으면 이름만 그린다 */ }
  }));

  let y = HEAD;
  r.decks.forEach((d, i) => {
    // 줄 머리 — 몇 번 줄, 어느 보스, 그 줄 딜
    x.fillStyle = ROSE; x.font = "800 13px Pretendard, system-ui, sans-serif";
    x.fillText(String(i + 1).padStart(2, "0"), PAD, y + 14);
    x.fillStyle = INK; x.font = "700 14px Pretendard, system-ui, sans-serif";
    const boss = d.weak ? (bossOf(d.weak)?.name || d.weak) : "";
    x.fillText(T(boss), PAD + 26, y + 14);
    x.textAlign = "right";
    x.fillStyle = ROSE; x.font = "800 15px Pretendard, system-ui, sans-serif";
    const dealTxt = `${I18N.dmg(d.total)}`;
    x.fillText(dealTxt, W - PAD, y + 14);
    // 숫자 앞에 **그 줄을 치는 속성**을 붙인다 — 줄 머리의 보스 이름만으로는 속성이
    // 안 읽힌다(보스 이름과 속성을 외우고 있어야 하는 그림이 된다).
    //
    // 여기는 보스 속성을 그대로 «수냉약점»처럼 적고 있었다. 그런데 화면의 줄 꼬리표는
    // **치는 속성**(`COUNTER_OF`)을 적는다 — 같은 줄인데 화면과 그림이 서로 다른 속성을
    // 말했다(유저 제보 2026-08-31 «이미지 저장 시 약점 표기가 보스 속성으로 나온다»).
    // 화면과 같은 값을 같은 꼴로 적는다.
    const hitEl = d.weak ? (COUNTER_OF[d.weak] || d.weak) : "";
    if (hitEl) {
      const dw = x.measureText(dealTxt).width;   // 15px 폰트인 지금 재야 맞다
      x.fillStyle = DIM; x.font = "600 12px Pretendard, system-ui, sans-serif";
      x.fillText(T(hitEl), W - PAD - dw - 7, y + 14);
    }
    x.textAlign = "left";
    y += 30;

    const names = Object.keys(d.chars || {}).length
      ? Object.keys(d.chars) : (d.names || []).filter(Boolean);

    // 기여도 도넛 — 솔로 기록과 **같은 읽는 법**이다. 두 장을 나란히 놓고 봐도
    // 눈이 안 헤매야 한다. 조각은 딜 순으로 돌아 「누가 지배하는가」가 회전만 봐도
    // 읽히고, 가운데에는 그 줄 총딜과 1등을 적는다.
    {
      const pairs = names.map((nm) => [nm, (d.chars || {})[nm] || 0])
                         .filter(([, v]) => v > 0);
      const cxx = PAD + DONUT / 2;
      const cyy = y + Math.max(names.length * ROW, DONUT) / 2;
      const rr = DONUT / 2 - 8;
      x.lineWidth = 11;
      x.strokeStyle = "#232830";
      x.beginPath(); x.arc(cxx, cyy, rr, 0, Math.PI * 2); x.stroke();
      let acc = -Math.PI / 2;
      for (const [nm, dmg] of pairs.slice().sort((a, b) => b[1] - a[1])) {
        const frac = dmg / (d.total || 1);
        const gap = 0.035;                        // 조각 사이 틈
        x.strokeStyle = deckColor(d.names, nm);
        x.beginPath();
        x.arc(cxx, cyy, rr, acc + gap / 2, acc + frac * Math.PI * 2 - gap / 2);
        x.stroke();
        acc += frac * Math.PI * 2;
      }
      x.lineWidth = 1;
      x.textAlign = "center";
      x.fillStyle = ROSE; x.font = "700 14px Pretendard, system-ui, sans-serif";
      x.fillText(`${I18N.dmg(d.total)}`, cxx, cyy - 2);
      const topPair = pairs.slice().sort((a, b) => b[1] - a[1])[0];
      if (topPair) {
        const [tn, tv] = topPair;
        x.fillStyle = INK; x.font = "9px Pretendard, system-ui, sans-serif";
        let lead = T(tn);
        while (x.measureText(lead).width > DONUT - 22 && lead.length > 2) lead = lead.slice(0, -1);
        if (lead !== tn) lead = lead.slice(0, -1) + "…";
        x.fillText(lead, cxx, cyy + 10);
        x.fillStyle = DIM;
        x.fillText(`${((tv / (d.total || 1)) * 100).toFixed(0)}%`, cxx, cyy + 21);
      }
      x.textAlign = "left";
    }

    // 막대 기준은 **그 줄 최고딜**이다 — 세 줄을 한 자로 재면 딜 낮은 줄은 죄다
    // 뭉개져서 그 안의 서열이 안 보인다. 줄마다 다시 잡아야 «이 줄에서 누가 컸나»가
    // 읽히고, 줄끼리 비교는 위의 총딜과 도넛이 맡는다.
    const top = Math.max(1, ...names.map((nm) => (d.chars || {})[nm] || 0));
    const BX = RX + 36, BW = W - PAD - 48 - BX;
    for (const nm of names) {
      const im = arts.get(nm);
      // 초상화가 없어도 받침은 깐다 — 이름 왼쪽이 들쭉날쭉하면 훑기 나쁘다
      x.fillStyle = "#1c2027"; x.fillRect(RX, y + 2, 28, 30);
      if (im) {
        x.save();
        x.beginPath(); x.rect(RX, y + 2, 28, 30); x.clip();
        // 얼굴이 오도록 위쪽을 잡는다 (초상화는 세로로 길다)
        x.drawImage(im, RX, y + 2 - 5, 28, 56);
        x.restore();
      }
      x.fillStyle = INK; x.font = "500 13px Pretendard, system-ui, sans-serif";
      let label = T(nm);
      while (x.measureText(label).width > BW - 6 && label.length > 2) label = label.slice(0, -1);
      if (label !== nm) label = label.slice(0, -1) + "…";
      x.fillText(label, BX, y + 17);
      const v = (d.chars || {})[nm];
      if (v != null) {
        x.textAlign = "right";
        x.fillStyle = INK; x.font = "700 13px Pretendard, system-ui, sans-serif";
        x.fillText(`${I18N.dmg(v)}`, W - PAD - 44, y + 17);
        x.fillStyle = DIM; x.font = "11px Pretendard, system-ui, sans-serif";
        x.fillText(`${((v / (d.total || 1)) * 100).toFixed(1)}%`, W - PAD, y + 17);
        x.textAlign = "left";
        // 딜 막대 — 도넛이 «비중»이면 막대는 «크기»다. 도넛 조각과 **같은 색**이라야
        // 왼쪽 동그라미와 오른쪽 목록이 눈에서 이어진다.
        x.fillStyle = "#232830"; x.fillRect(BX, y + 25, BW, 3);
        const bw = BW * (v / top);
        x.fillStyle = deckColor(d.names, nm);
        x.fillRect(BX, y + 25, bw, 3);
        // 평타/스킬은 **막대 길이 안에서** 갈린다 (솔로와 같은 규칙) — 전폭으로 두면
        // 딜이 적은 니케도 띠만 길어 «많이 때린 것»처럼 읽힌다.
        const dt = d.detail?.[nm];
        if (dt && dt.total) {
          const nw = bw * (dt.normal / dt.total);
          x.fillStyle = "#4cb3ef"; x.fillRect(BX, y + 30, nw, 2);
          x.fillStyle = "#c48218"; x.fillRect(BX + nw, y + 30, bw - nw, 2);
        }
      }
      y += ROW;
    }
    // 도넛이 행보다 크면 그 차이만큼 더 내린다 (deckH와 같은 셈이라야 겹치지 않는다)
    y += Math.max(0, DONUT - names.length * ROW);
    y += 16;
    if (i < r.decks.length - 1) {
      x.strokeStyle = LINE; x.beginPath();
      x.moveTo(PAD, y - 8); x.lineTo(W - PAD, y - 8); x.stroke();
    }
  });
  return cv;
}

/** 기록을 그릴 캔버스를 고른다 — 유니온만 제 함수로 간다. */
const recordCanvasFor = (r) =>
  (r?.mode === "union" ? unionRecordCanvas(r) : recordCanvas(r));

async function imageRecord(r) {
  const cv = await recordCanvasFor(r);
  cv.toBlob((blob) => {
    if (!blob) return recMsg(T("이미지를 만들지 못했습니다."), "err");
    const url = URL.createObjectURL(blob);
    const a2 = el("a");
    a2.href = url;
    a2.download = recFile(r);
    a2.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    recMsg(T("이미지를 저장했습니다."), "ok");
  }, "image/png");
}

/** 클립보드에 PNG로. 붙여넣기로 바로 공유할 수 있게 — 저장 → 첨부보다 한 단계 짧다. */
async function copyImageRecord(r) {
  const cv = await recordCanvasFor(r);
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  if (!blob) return recMsg(T("이미지를 만들지 못했습니다."), "err");
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    recMsg(T("이미지를 클립보드에 복사했습니다."), "ok");
  } catch (e) {
    // 비 HTTPS나 권한 없는 브라우저에서는 이미지 클립보드가 막힌다 — 이유를 말한다
    recMsg(T("이미지 복사가 막혔습니다 ({name}) — «이미지 저장»을 쓰세요.", { name: e.name }), "err");
  }
}

// 덱 안 다섯 자리의 색. **역할군이 아니라 «누구»를 가리킨다** — 화력형이 둘이면
// 역할군 색으로는 같은 색이 되어 도넛에서 한 덩어리로 보인다.
// 색은 덱의 **슬롯 순서**에 묶는다(딜 순위가 아니다) — 순위로 묶으면 계산할 때마다
// 색이 서로 바뀌어 «같은 색 = 같은 니케»가 깨진다.
// 검증: `dataviz/scripts/validate_palette.js … --mode dark` 6검사 전부 PASS
// (최악 인접쌍 ΔE 18.8 protan · 20.0 normal).
const DECK_COLORS = ["#c48218", "#168dd9", "#40a35c", "#a05fd0", "#d95f5f"];
const deckColor = (names, name) => {
  const i = (names || []).indexOf(name);
  return DECK_COLORS[(i < 0 ? 0 : i) % DECK_COLORS.length];
};

/** 기록의 편성을 덱으로 되살린다. **덱 구성만 가져온다** — 수치는 되살리지 않는다.
 *  그때의 계정과 지금 계정이 다를 수 있어 옛 수치를 지금 결과로 보여 주면 거짓이 된다.
 *  지금 계정에 없는 니케는 빈 자리로 두고 누가 빠졌는지 말해 준다.
 *
 *  **통째로 덮지 않는다.** 예전에는 5덱을 한 번에 밀어 버려서, 짜 두던 편성을 되돌릴
 *  방법이 없었다. 프리셋과 **같은 시트**로 어느 덱을 어디에 넣을지 고르게 하고,
 *  밀려나는 편성은 빈 덱으로 옮긴다. 기록은 조건을 갖고 있으므로 그것도 되돌린다. */
function loadRecord(r) {
  openPresetLoad({
    name: r.name || r.label,
    kind: "bundle",
    decks: (r.decks || []).map((d) => ({ names: d.names })),
    cond: { code: r.code, duration: r.duration },
  }, { sink: recMsg });
}


// ── 계정 공통 설정 (콘솔 레벨) ──────────────────────────────────────────
// 콘솔(재활용 연구실)은 니케 하나가 아니라 **계정 전체**에 걸린다. 그래서 니케 시트가
// 아니라 계정 고르개 옆 톱니에서 연다. 블라링크 조회에는 자동으로 들어오지만
// 레츠도로 CSV에는 아예 없어서, 손으로 넣을 자리가 필요하다.
// 콘솔(재활용 연구실)은 **세 갈래**다: 공통 하나 · 역할군 셋 · 기업 다섯.
// 블라 조회는 역할군·기업을 각각 dict로 주고, 손으로 넣을 때는 숫자 하나로 퉁칠 수도
// 있다. 그래서 편집기는 두 모양을 **모두** 읽고, 쓸 때는 언제나 dict로 쓴다.
const CONSOLE_DEFAULT = { common_level: 180, class_level: 100, company_level: 100 };
const CONSOLE_MAX = 9999;

/** 지금 계정의 콘솔 값 (동기화 값 위에 수정본을 얹은 것). */
function consoleNow() {
  const c = (mergedProfile()?._account || {}).console || {};
  return { ...CONSOLE_DEFAULT, ...c };
}

/** 스칼라든 dict든 «이 키의 값»을 꺼낸다. */
function conVal(v, key, fallback) {
  if (v == null) return fallback;
  if (typeof v === "number") return v;
  const n = v[key];
  return typeof n === "number" ? n : fallback;
}

/** 콘솔이 **손으로 고쳐졌는가.** 동기화 값과 다르면 톱니에 색이 든다. */
function consoleEdited() {
  const rec = activeRec();
  return !!(rec && rec.edits?._account?.console
            && Object.keys(rec.edits._account.console).length);
}

/** 한 칸을 고친다. 역할군·기업은 **dict 전체를 다시 써서** 다른 칸을 잃지 않는다. */
function setConsole(group, key, value) {
  const rec = activeRec();
  if (!rec) return;
  const now = consoleNow();
  rec.edits._account ||= {};
  const con = (rec.edits._account.console ||= {});
  if (group === "common_level") {
    con.common_level = value;
  } else {
    const keys = group === "class_level" ? CLASS_ORDER : CORP_ORDER;
    const base = now[group];
    const next = {};
    for (const k of keys) next[k] = conVal(base, k, CONSOLE_DEFAULT[group]);
    next[key] = value;
    con[group] = next;
  }
  results = {};                      // 지문이 바뀐다 — 옛 결과를 남기지 않는다
  saveAll();
  buildAcctSheet();
  syncAcctCog();
  renderAll();
}

/** 톱니에 «수정됨» 색. 콘솔을 손대면 바로 보여야 한다 — `renderAll`은 이 버튼을 안 건드린다. */
function syncAcctCog() {
  const cog = $("#acct-cog");
  if (cog) cog.classList.toggle("edited", consoleEdited());
}

function conRow(label, group, key, cur) {
  const r = el("div", "grp-row");
  r.append(el("span", "ol-part", label));
  // **고르개가 아니라 숫자 칸이다.** 상한이 9999라 목록으로 만들면 항목이 만 개가 되어
  // 열리지도, 굴러가지도 않는다. 니케 카드의 콘솔 칸(`conCell`)과 같은 물건으로 맞춘다.
  const inp = el("input", "con-num");
  inp.type = "number";
  inp.min = "0";
  inp.max = String(CONSOLE_MAX);
  inp.step = "1";
  inp.inputMode = "numeric";
  inp.value = String(cur ?? 0);
  const commit = () => {
    const v = Math.max(0, Math.min(CONSOLE_MAX, Math.trunc(Number(inp.value) || 0)));
    inp.value = String(v);
    setConsole(group, key, v);
  };
  inp.onchange = commit;
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } };
  r.append(inp);
  return r;
}

function buildAcctSheet() {
  const body = $("#acct-body");
  if (!body) return;
  body.textContent = "";
  const rec = activeRec();
  $("#acct-sheet-sub").textContent = rec
    ? `${rec.name} · ${T(rec.source)}` + (consoleEdited() ? T(" · 수정됨") : "")
    : T("저장된 계정이 없습니다");
  $("#acct-revert").disabled = !consoleEdited();
  if (!rec) {
    body.append(el("p", "prose prose-sm",
      T("먼저 «내 계정» 탭에서 육성 데이터를 불러오세요.")));
    return;
  }

  const now = consoleNow();
  body.append(group(T("재활용 연구실 (콘솔) — 공통"),
    [conRow(T("공통"), "common_level", null, conVal(now.common_level, null, 180))]));
  body.append(group(T("역할군별"),
    CLASS_ORDER.map((k) => conRow(k, "class_level", k, conVal(now.class_level, k, 100)))));
  body.append(group(T("기업별"),
    CORP_ORDER.map((k) => conRow(k, "company_level", k, conVal(now.company_level, k, 100)))));
  // `**…**`는 마크다운이 아니라 그냥 별표로 보인다 — 강조는 태그로 한다
  const note = el("p", "prose prose-sm");
  note.append(T("블라블라링크 조회에서는 "));
  note.append(el("b", null, "전초기지 정보를 공개"));
  note.append(T("로 둬야 자동으로 들어옵니다. 레츠도로 CSV에는 아예 없습니다. ")
    + T("손대지 않으면 기본값(공통 {common_level} · ", { common_level: CONSOLE_DEFAULT.common_level })
    + T("역할군 {class_level} · 기업 {company_level})으로 ", { class_level: CONSOLE_DEFAULT.class_level, company_level: CONSOLE_DEFAULT.company_level })
    + T("계산합니다."));
  body.append(note);
}

function openAcctSheet() {
  buildAcctSheet();
  $("#acct-sheet").showModal();
}

// ── 계정 탭 ─────────────────────────────────────────────────────────────
function acct(msg, kind = "") {
  const n = $("#acct-msg");
  n.textContent = msg;
  n.className = "acct-msg " + kind;
}

async function copyInto(text, sink, okMsg, failMsg, failKind = "err") {
  try {
    await navigator.clipboard.writeText(text);
    sink(okMsg, "ok");
  } catch {
    // 클립보드 권한이 없는 환경(비 HTTPS 등)에서는 조용히 실패하지 않고 대안을 준다
    const ta = el("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.("copy");
    ta.remove();
    sink(ok ? okMsg : failMsg, ok ? "ok" : failKind);
  }
}
const copyText = (text, okMsg) =>
  copyInto(text, acct, okMsg, T("복사가 막혔습니다 — bookmarklet.js를 직접 여세요."));

/** 사람이 읽을 이름을 만든다. `nikke-raw-1034…` 같은 파일명을 그대로 쓰지 않는다. */
// 계정 이름 길이 상한. 계정 카드의 이름 줄과 상단 고르개가 이 길이까지는 안 깨진다
// (그 위로 가면 카드 머리에서 버튼들을 아래로 밀어낸다).
const NAME_MAX = 24;

/** 이름에 붙일 짧은 시각 도장 (`08-21 07:52`). */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 이미 쓰는 이름이면 뒤에 번호를 붙인다. */
function uniqName(base) {
  const b = String(base || "").trim().slice(0, NAME_MAX);
  if (!b) return "";
  const used = new Set(Object.values(state.profiles).map((r) => r.name));
  if (!used.has(b)) return b;
  for (let i = 2; i < 99; i++) if (!used.has(`${b} ${i}`)) return `${b} ${i}`;
  return b;
}

/** 파일명 → 프로필 기본 이름. 확장자를 떼고 겹치면 번호를 붙인다. */
function fileName(raw) {
  return uniqName(String(raw || "").replace(/\.[^.]+$/, ""));
}

function autoName() {
  const used = new Set(Object.values(state.profiles).map((r) => r.name));
  if (!used.has("내 계정")) return T("내 계정");
  for (let i = 2; i < 99; i++) if (!used.has(T("계정 {i}", { i }))) return T("계정 {i}", { i });
  return T("계정");
}

function addProfile({ profile, notices, source, name, edits, variants }) {
  // 계정 하나가 약 120KB다. 한도(약 5MB)를 기록·결과 캐시와 나눠 쓰므로 여기서 막는다 —
  // 다 차서 저장이 실패하면 **무엇이 안 들어갔는지도 모르게** 된다.
  if (Object.keys(state.profiles).length >= PROFILE_MAX) {
    throw new Error(T("계정은 {PROFILE_MAX}개까지 저장합니다 — ", { PROFILE_MAX })
                    + T("«내 계정» 탭에서 쓰지 않는 계정을 먼저 지우세요."));
  }
  const m = profile._meta || {};
  const id = uid();
  state.profiles[id] = {
    id, name: name || autoName(), openid: m.openid || "", area: m.area ?? null,
    source, fetched_at: m.fetched_at || new Date().toISOString(),
    notices: notices || [], fetched: profile,
    // 불러오기로 들어온 `_edits`만 복원한다 — 없으면 빈 수정 층에서 시작한다.
    edits: (edits && typeof edits === "object")
      ? { ...edits, chars: { ...(edits.chars || {}) } } : { chars: {} },
    // 내보낸 파일에 실려 온 프로필. 모양이 아니면 버린다 — 남의 파일을 그대로 믿지 않는다.
    variants: Array.isArray(variants)
      ? variants.filter((v) => v && typeof v === "object" && v.name)
          .slice(0, VARIANT_MAX)
          .map((v) => ({ id: uid(), name: String(v.name).slice(0, NAME_MAX),
                         edits: { chars: { ...(v.edits?.chars || {}) },
                                  ...(v.edits?._account ? { _account: v.edits._account } : {}) } }))
      : [],
    variantId: "",
  };
  state.settings.profileId = id;
  results = {};                     // 계정이 바뀌면 옛 결과는 의미가 없다
  saveAll();
  renderProfiles(); renderProfilePick(); renderAll();
  return state.profiles[id];
}

async function convertRaw(raw, name) {
  const data = await askWorker({ type: "convert", raw: JSON.stringify(raw), name });
  if (data.type === "error") throw new Error(data.error);
  return data;
}
async function convertCsv(text, name) {
  const data = await askWorker({ type: "convert_csv", text, name });
  if (data.type === "error") throw new Error(data.error);
  return data;
}

/** 넣은 값에서 openid를 뽑아 본다 — **서버(openid_from_input)와 같은 규칙**이다.
 *
 *  보내 놓고 «잘못된 입력»으로 되돌아오는 것은 사람 입장에서 한 번 헛걸음이다.
 *  지표로 보면 조회 실패 셋 중 «잘못된 입력»이 하루 20건대라 여기서 먼저 잡는다.
 *  받는 모양 셋:
 *    https://www.blablalink.com/user?openid=MjkwODAtMTAz…   (URL의 openid= 또는 uid=)
 *    29080-10346314715007941757                             (앞자리-숫자)
 *    10346314715007941757                                   (숫자만)
 *  반환: `{ id }` 또는 `{ err }`(사람에게 그대로 보여 줄 문장). */
function readOpenid(raw) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return { err: T("프로필 주소나 openid를 넣어 주세요.") };
  let s = s0;
  if (s.includes("blablalink.com") || /^https?:/i.test(s)) {
    let q = null;
    try { q = new URL(s).searchParams; } catch { /* 주소 모양이 아니다 */ }
    if (!q) return { err: T("주소를 읽을 수 없습니다 — 프로필 페이지 주소를 그대로 붙여넣어 주세요.") };
    const v = q.get("openid") || q.get("uid");
    if (!v) {
      return { err: T("이 주소에는 «openid=»가 없습니다 — 블라블라링크에서 **내 프로필** 페이지를 연 뒤 그 주소를 붙여넣어 주세요.") };
    }
    s = v;
  } else if (/\s/.test(s0)) {
    return { err: T("빈칸이 섞여 있습니다 — 주소나 openid만 넣어 주세요.") };
  }
  if (!/^\d+$/.test(s)) {
    try { s = atob(s + "=".repeat((4 - (s.length % 4)) % 4)); } catch { /* base64가 아니다 */ }
  }
  const m = /(\d{6,})\s*$/.exec(s);
  if (!m) {
    return { err: /^https?:/i.test(s0)
      ? T("주소의 «openid=» 값을 읽을 수 없습니다 — 주소를 끝까지 복사했는지 확인해 주세요.")
      : T("openid로 읽을 수 없습니다 — 블라블라링크 프로필 주소를 붙여넣는 것이 가장 확실합니다.") };
  }
  return { id: m[1] };
}

async function syncUrl() {
  const url = $("#url-in").value.trim();
  // 서버까지 갔다 오지 않고 여기서 먼저 본다 — 되돌아오는 «잘못된 입력»은 사람에게
  // 그냥 헛걸음이고, 무엇이 잘못됐는지도 안 알려 준다.
  const got = readOpenid(url);
  if (got.err) return acct(got.err, "err");
  const btn = $("#url-go");
  btn.dataset.state = "loading"; btn.disabled = true;
  acct(T("블라블라링크에서 받는 중…"));
  try {
    const raws = await fetchQueued({ url }, (m) => acct(m));
    // 이름에 **닉네임을 못 쓴다.** 남의 계정 닉네임을 주는 라우트가 조회 세션 권한으로는
    // 전부 `220000 not permission`이다 (게임 API·UGC 모두 확인).
    //
    // **openid 꼬리도 안 쓴다.** 예전에는 «블라 41757 (한국)»처럼 뒤 5자리를 붙여
    // 구분했는데, 이 이름이 상단 고르개에 늘 떠 있어서 스크린샷에 그대로 찍혀
    // 올라갔다(실사용 확인). 조회에 쓸 수 없는 조각이라 계정이 뚫리진 않지만,
    // 굳이 계정과 이어지는 숫자를 화면에 남길 이유가 없다. 지역만 쓰고, 같은
    // 지역이 여럿이면 `uniqName`이 뒤에 번호를 붙인다 — 이름은 언제든 바꿀 수 있다.
    //
    // **계정 하나에 지역(한섭·일섭 등)이 여럿 걸릴 수 있다** — raws가 그만큼 온다.
    // 첫 지역만 받으면 나머지 지역은 영영 못 본다(실측: 일섭이 메인인 계정이 한섭으로만
    // 저장되던 버그). 그래서 감지된 지역을 전부 별도 계정으로 저장하고, 이름에 지역을
    // 붙여 구분한다.
    const names = [];
    // 어느 계정이 «지금 보는 계정»이 되나 — `addProfile`이 저장할 때마다 그것으로 옮기므로
    // 그냥 두면 **마지막에 걸린 지역**이 잡힌다. 그건 후보 나열 순서일 뿐이라 뜻이 없다.
    // 니케가 많은 쪽이 본계정이다(동남아 194종 + 글로벌 32종 실측 2026-09-04) — 그것을
    // 마지막에 저장해 잡히게 한다. 나머지도 다 저장되므로 위 고르개에서 바꾸면 된다.
    const sorted = [...raws].sort(
      (a, b) => (a?.characters?.length || 0) - (b?.characters?.length || 0));
    for (const raw of sorted) {
      // 지역 이름표는 사이드카가 한국어로 준다(«한섭»·«대만·홍콩·마카오») — 사전을
      // 태워서 화면 언어로 낸다(2026-09-02 제보: «Saved Accounts가 아직 한국어»).
      const label = uniqName(T("블라 ({v})", { v: T(raw.area_label || "글로벌") }));
      const out = await convertRaw(raw, label);
      const rec = addProfile({ ...out, source: T("블라링크"), name: label });
      names.push(T("{name}(니케 {v}종)", { name: rec.name, v: Object.keys(rec.fetched.chars).length }));
    }
    acct(names.length > 1
      ? T("이 계정에 지역이 {length}개 걸려 있어 각각 저장했습니다 — {v}.", { length: names.length, v: names.join(" · ") })
      : T("{v} 저장했습니다.", { v: names[0] }), "ok");
  } catch (e) {
    acct(String(e.message || e), "err");
  } finally {
    btn.dataset.state = ""; btn.disabled = false;
  }
}

async function importFiles(files) {
  for (const f of files) {
    try {
      const text = await f.text();
      // 레츠도로 CSV — 확장자나 헤더로 알아본다
      if (/\.csv$/i.test(f.name) || text.slice(0, 300).includes('"이름"')) {
        acct(T("{name} 변환 중…", { name: f.name }));
        // CSV에는 계정 닉네임·아이디 칸이 없다 (55칼럼 전부 니케별 값이다).
        // 그나마 사람이 알아볼 단서는 **파일명**이라 그걸 기본 이름으로 쓴다.
        // `addProfile`은 `out.name`을 보는데 변환기는 이름을 돌려주지 않는다 —
        // 따로 넘기지 않으면 파일명을 지어 놓고도 «내 계정»으로 저장된다.
        const csvName = fileName(f.name) || autoName();
        const out = await convertCsv(text, csvName);
        const rec = addProfile({ ...out, source: "letsdoro CSV", name: csvName });
        acct(T("{name} — 니케 {v}종 저장했습니다.", { name: rec.name, v: Object.keys(rec.fetched.chars).length })
             + T(" 이름은 아래 [이름] 버튼으로 바꿀 수 있습니다."), "ok");
        continue;
      }
      const data = JSON.parse(text);
      if (data.characters && data.details) {              // 북마클릿·서버 raw
        acct(T("{name} 변환 중…", { name: f.name }));
        const out = await convertRaw(data, autoName());
        const rec = addProfile({ ...out, source: data._source || "bookmarklet" });
        acct(T("{name} — 니케 {v}종 저장했습니다.", { name: rec.name, v: Object.keys(rec.fetched.chars).length })
             + T(" 이름은 아래 [이름] 버튼으로 바꿀 수 있습니다."), "ok");
      } else if (data.decks && data.total != null) {       // 내보낸 기록
        recordsNow().unshift({ ...data, id: uid() });
        saveAll(); renderRecords();
        acct(T("기록 «{v}»을 불러왔습니다 — 기록 탭에서 보세요.", { v: data.label || f.name }), "ok");
      } else if (data.chars) {                             // 내보낸 계정
        // `_edits`는 원본이 아니라 수정 층이다 — 검증·저장 전에 떼어내
        // `edits`로 되돌린다. 안 떼면 수정본이 `fetched`로 굳는다(내보내기 주석).
        const { _edits: imported, _variants: vars, ...base } = data;
        const v = await askWorker({ type: "validate", profile: JSON.stringify(base) });
        if (!v.ok) throw new Error(v.error);
        addProfile({ profile: base, notices: [], source: "import", edits: imported,
                     variants: vars });
        acct(T("{name} 불러왔습니다.", { name: f.name }), "ok");
      } else if (Array.isArray(data.presets)) {          // 내보낸 프리셋
        // 계정 탭 드롭존에 프리셋 파일을 떨어뜨리는 일은 충분히 있을 만하다 —
        // «모르는 형식»으로 돌려보내지 않고 받아서 프리셋 탭으로 안내한다.
        const n = importPresets(data.presets);
        acct(T("프리셋 {n}개를 가져왔습니다 — «프리셋» 탭에서 보세요.", { n }), "ok");
      } else {
        throw new Error(T("모르는 형식입니다 — ")
                        + T("CSV · raw.json · 내보낸 계정/기록/프리셋이어야 합니다."));
      }
    } catch (e) {
      acct(`${f.name}: ${String(e.message || e)}`, "err");
    }
  }
}

async function resync(rec) {
  if (!HEALTH.fetch) {
    return acct(T("이 서버는 URL 동기화를 끄고 실행됐습니다 — 북마클릿이나 CSV를 쓰세요."), "err");
  }
  if (!rec.openid) {
    return acct(T("이 계정에는 openid가 없어 다시 싱크할 수 없습니다 (CSV·임포트 출처)."), "err");
  }
  if (rec.syncing) return;              // 두 번 눌러 두 번 조회하지 않는다
  rec.syncing = true;
  renderProfiles();
  acct(T("{name} 다시 받는 중…", { name: rec.name }));
  try {
    // area를 같이 보낸다 — 안 보내면 전체 지역을 다시 훑어서, 계정에 지역이 하나
    // 더 늘었을 때 이 계정이 엉뚱한 지역으로 튈 수 있다. 처음 고른 지역에 고정한다.
    const raws = await fetchQueued({ openid: rec.openid, area: rec.area },
      (m) => acct(`${rec.name} — ${m}`));
    const out = await convertRaw(raws[0], rec.name);
    // 최신으로 덮되 **수정본은 남긴다** — 별 레이어라 그대로 살아남는다
    rec.fetched = out.profile;
    rec.notices = out.notices;
    // **이름은 건드리지 않는다.** 사용자가 붙인 이름을 싱크할 때마다 갈아 끼우면
    // 어느 계정이 어느 것이었는지 알 수 없게 된다. 바뀐 건 «최종 업데이트»뿐이다.
    rec.fetched_at = out.profile?._meta?.fetched_at || new Date().toISOString();
    rec.synced_at = new Date().toISOString();
    results = {};
    saveAll(); renderProfiles(); renderAll();
    const n = Object.keys(rec.edits?.chars || {}).length;
    acct(T("최신으로 덮었습니다 ({v}).", { v: when(rec.synced_at) })
         + (n ? T(" 수정본 {n}명은 그대로 유지됩니다.", { n }) : ""), "ok");
  } catch (e) {
    acct(String(e.message || e), "err");
  } finally {
    rec.syncing = false;
    renderProfiles();
  }
}

function renderProfiles() {
  const wrap = $("#prof-list");
  wrap.textContent = "";
  const list = Object.values(state.profiles);
  if (!list.length) {
    wrap.append(el("p", "prose prose-sm",
      T("아직 저장된 계정이 없습니다. 위에서 레츠도로 CSV를 놓거나 북마클릿으로 받아 오세요.")));
    return;
  }
  for (const rec of list) {
    const box = el("div", "prof" + (rec.id === state.settings.profileId ? " on" : ""));
    const top = el("div", "prof-top");
    top.append(el("b", "prof-name", rec.name));
    const nEdit = Object.keys(rec.edits?.chars || {}).length;
    // openid 꼬리는 적지 않는다 — 스크린샷으로 새어 나가던 자리다(위 `블라 (지역)` 주석)
    top.append(el("span", "prof-meta",
      T("{v}종", { v: Object.keys(rec.fetched?.chars || {}).length })
      + T(" · {source} · 수집 {v}", { source: rec.source, v: when(rec.fetched_at) })
      + (rec.synced_at ? T(" · 최종 갱신 {v}", { v: when(rec.synced_at) }) : "")
      + (nEdit ? T(" · 수정 {nEdit}명", { nEdit }) : "")));
    const acts = el("div", "prof-acts");
    acts.append(mkBtn(rec.id === state.settings.profileId ? T("사용 중") : T("사용"), "btn-primary",
      () => {
        state.settings.profileId = rec.id;
        saveAll(); renderProfiles(); renderProfilePick(); renderAll();
      }, rec.id === state.settings.profileId));
    // 다시 싱크는 **가능할 때만** 보인다. CSV·임포트 출처에는 openid가 없고, URL 조회를
    // 끈 서버에서는 눌러 봐야 빨간 오류만 나온다 — 못 하는 일을 버튼으로 두지 않는다.
    // 다시 싱크는 **서버 조회로 받은 계정에만** 단다. 북마클릿으로 받은 것을 서버로
    // 다시 받으면 운영자 세션을 타는 다른 경로가 되고(비공개 계정이면 실패한다),
    // 애초에 북마클릿은 «다시 눌러서» 새로 받는 게 그쪽의 갱신 방법이다.
    if (HEALTH.fetch && rec.openid && rec.source === "블라링크") {
      const b = mkBtn(rec.syncing ? T("받는 중…") : T("다시 싱크"), "btn-ghost",
                      () => resync(rec));
      b.disabled = !!rec.syncing;
      acts.append(b);
    }
    // 내보내기는 **계정에서 받은 원본(fetched)만** `chars`에 담는다. 예전에는
    // `deepMerge(fetched, edits)`를 내보냈는데, 그러면 카드 톱니로 고친 값이 계정
    // 실측값인 것처럼 섞여 나가고 — 다시 불러오면 그게 통째로 `fetched`가 되어
    // **수정본이 원본으로 굳는다.** 실제로 이 파일로 대조하다 드레이크 우코가
    // 44.31%(수정본)로 보여 계산이 어긋난 적이 있다.
    // 수정본은 버리지 않고 `_edits`에 따로 실어 왕복(내보내기→불러오기)을 보존한다.
    acts.append(mkBtn(T("내보내기"), "btn-ghost", () => {
      const doc = { ...rec.fetched };
      if (Object.keys(rec.edits?.chars || {}).length || rec.edits?._account) {
        doc._edits = rec.edits;
      }
      // 저장해 둔 프로필도 같이 싣는다(유저 지시) — `_edits`와 같은 규약으로 «원본이
      // 아닌 층»이라 밑줄을 붙인다. 불러오기가 이걸 되살린다.
      if (variantsOf(rec).length) doc._variants = rec.variants;
      downloadJson(doc, T("니케계정-{name}", { name: rec.name }));
    }));
    acts.append(mkBtn(T("이름 변경"), "btn-ghost", () => {
      askRename(box, T("계정 이름"), rec.name, NAME_MAX, (v) => {
        rec.name = v;
        // 사람이 직접 지은 이름은 자동 정리(아래 openid 꼬리 제거)가 건드리지 않는다
        rec.renamed = true;
        saveAll(); renderProfiles(); renderProfilePick();
      });
    }));
    acts.append(mkBtn(T("삭제"), "btn-ghost", () => {
      // 프로필은 계정 **안에** 들어 있어 같이 사라진다 — 묻기 전에 그렇다고 말한다.
      const nv = variantsOf(rec).length;
      askInline(box, T("«{name}» 계정을 지웁니다. 되돌릴 수 없습니다.", { name: rec.name })
        + (nv ? " " + T("저장해 둔 프로필 {n}개도 함께 지워집니다.", { n: nv }) : ""),
        T("지우기"), () => {
        delete state.profiles[rec.id];
        if (state.settings.profileId === rec.id) state.settings.profileId = "";
        saveAll(); renderProfiles(); renderProfilePick(); renderAll();
        acct(T("«{name}» 계정을 지웠습니다.", { name: rec.name }), "ok");
      });
    }));
    top.append(acts);
    box.append(top);
    for (const n of rec.notices || []) {
      // 가져오기 알림은 **틀과 값이 따로 온다**(`t`·`v`) — 숫자가 박힌 완성 문장은 사전에서
      // 못 찾기 때문이다(2026-09-02, 「Saved Accounts가 아직 한국어」 제보). 옛 알림에는
      // 틀이 없으니 그때는 만들어진 문장을 그대로 쓴다.
      box.append(el("p", "prof-notice" + (n.level === "warn" ? " warn" : ""),
                    n.t ? T(n.t, n.v || {}) : n.text));
      if (n.names?.length) {
        const d = el("details", "prof-names");
        d.append(el("summary", null, T("대상 {length}종 보기", { length: n.names.length })));
        d.append(el("div", "name-chips", n.names.map(T).join(" · ")));
        box.append(d);
      }
    }
    wrap.append(box);
  }
}

function renderProfilePick() {
  syncAcctCog();
  const sel = $("#profile-pick");
  sel.textContent = "";
  const o = el("option", null, "고정값");
  o.value = "";
  sel.append(o);
  for (const rec of Object.values(state.profiles)) {
    const x = el("option", null, rec.name);
    x.value = rec.id;
    sel.append(x);
  }
  sel.value = state.settings.profileId || "";
  renderVariantPick();
}

/** 「프로필」 단추 배선 — 한 번만 건다(`boot`). */
function wireVariant() {
  const sel = $("#variant-pick");
  if (sel) sel.onchange = () => useVariant(activeRec(), sel.value);
  const on = (id, fn) => { const b = $("#" + id); if (b) b.onclick = fn; };
  // 되돌리기 — 고른 프로필을 다시 앉힌다(«기본»이면 비운다). 지우는 것이 아니다.
  on("variant-revert", () => { const r = activeRec(); if (r) useVariant(r, r.variantId); });
  // 저장 — 고른 프로필에 덮어쓴다. «기본»에는 덮어쓸 것이 없어 단추가 안 뜬다.
  on("variant-save", () => {
    const rec = activeRec(), v = curVariant(rec);
    if (!rec || !v) return;
    v.edits = JSON.parse(JSON.stringify(rec.edits || { chars: {} }));
    saveAll(); renderProfilePick();
    flashStatus(T("«{name}»에 저장했습니다.", { name: v.name }));
  });
  // 새 이름으로 — 지금 손댄 것을 새 프로필으로 만든다.
  on("variant-saveas", () => {
    const rec = activeRec();
    if (!rec) return;
    if (variantsOf(rec).length >= VARIANT_MAX) {
      flashStatus(T("프로필은 {v}개까지 저장합니다 — 하나 지우고 다시 해 주세요.", { v: VARIANT_MAX }));
      return;
    }
    askSheet({
      title: T("프로필 이름"), okLabel: T("저장"), max: NAME_MAX,
      msg: T("지금 고쳐 둔 육성값을 이 이름으로 남깁니다."),
      input: T("프로필 {n}", { n: variantsOf(rec).length + 1 }),
      onOk: (name) => {
        const v = { id: uid(), name,
                    edits: JSON.parse(JSON.stringify(rec.edits || { chars: {} })) };
        variantsOf(rec).push(v);
        rec.variantId = v.id;
        saveAll(); renderProfilePick(); renderAll();
        flashStatus(T("«{name}»으로 저장했습니다.", { name }));
      },
    });
  });
  // 지우기 — 프로필만 지운다. 지금 손댄 것은 그대로 두고 «기본»으로 옮긴다.
  on("variant-del", () => {
    const rec = activeRec(), v = curVariant(rec);
    if (!rec || !v) return;
    askSheet({
      title: T("프로필 지우기"), okLabel: T("지우기"), danger: true,
      msg: T("프로필 «{name}»을 지웁니다. 계정 값과 지금 고쳐 둔 것은 그대로입니다.",
             { name: v.name }),
      onOk: () => {
        rec.variants = variantsOf(rec).filter((x) => x.id !== v.id);
        rec.variantId = "";
        saveAll(); renderProfilePick(); renderAll();
        flashStatus(T("프로필 «{name}»을 지웠습니다.", { name: v.name }));
      },
    });
  });
}

/** 「프로필」 고르개와 그 옆 단추들. 계정을 안 골랐으면 통째로 숨는다. */
function renderVariantPick() {
  const field = $("#variant-field"), acts = $("#variant-acts"), sel = $("#variant-pick");
  if (!field || !acts || !sel) return;
  const rec = activeRec();
  field.hidden = acts.hidden = !rec;
  if (!rec) return;
  const list = variantsOf(rec);
  sel.textContent = "";
  const base = el("option", null, T("기본"));
  base.value = "";
  sel.append(base);
  for (const v of list) {
    const o = el("option", null, v.name);
    o.value = v.id;
    sel.append(o);
  }
  // 저장해 둔 것이 지워졌는데 그것을 고르고 있었다면 «기본»으로 돌아간다.
  if (rec.variantId && !list.some((v) => v.id === rec.variantId)) rec.variantId = "";
  sel.value = rec.variantId || "";
  const dirty = variantDirty(rec);
  const cur = curVariant(rec);
  // 손댄 것이 없으면 되돌리기·저장을 안 낸다 — 누를 일이 없는 단추는 안 보이는 편이 낫다.
  $("#variant-revert").hidden = !dirty;
  $("#variant-save").hidden = !dirty || !cur;      // «기본»에는 덮어쓸 것이 없다
  $("#variant-saveas").hidden = !dirty;
  $("#variant-del").hidden = !cur;
  acts.hidden = !dirty && !cur;
}

// ── 니케별 육성 시트 ────────────────────────────────────────────────────
let sheetName = null;

function openSheet(name) {
  const sp = charSpec(name);
  if (!sp) return;
  // 다른 설정창(육성 수정)을 여는 순간 「집어 든」 카드는 뜻을 잃는다 — 안 놓아 두면
  // 이 창을 닫고 나서도 머리글에 ««이름» — 놓을 슬롯을 누르세요»가 계속 떠 있다.
  if (picked) { picked = null; setStatus("", false); }
  sheetName = name;
  const rec = byName.get(name);
  $("#edit-title").textContent = T(name);
  $("#edit-sub").textContent = `${T(rec?.element ?? "")} · ${T(rec?.cls ?? "")} · ${rec?.weapon ?? ""}`
    + (isEdited(name) ? T(" · 수정됨") : "");
  const th = $("#edit-thumb");
  th.textContent = "";
  if (rec?.img) {
    const i = el("img"); i.src = artSrc(rec, name); i.alt = ""; th.append(i);
  }
  buildSheet(name, sp);
  $("#edit-revert").disabled = !isEdited(name);
  $("#edit-sheet").showModal();
}

/** 수정본에 한 값을 쓴다. `rebuild=false`면 여러 값을 연달아 쓸 때 마지막에만 다시 그린다. */
function setEdit(name, path, value, rebuild = true) {
  const rec = activeRec();
  if (!rec) return;
  rec.edits.chars ||= {};
  const e = (rec.edits.chars[name] ||= {});
  let node = e;
  for (const k of path.slice(0, -1)) node = (node[k] ||= {});
  node[path[path.length - 1]] = value;
  results = {};                      // 지문이 바뀐다 — 옛 결과를 남기지 않는다
  saveAll();
  if (rebuild) {
    buildSheet(name, charSpec(name));
    $("#edit-revert").disabled = !isEdited(name);
    renderVariantPick();      // «되돌리기·저장»이 나타날 자리다
    renderAll();
  }
}

function revertChar(name) {
  const rec = activeRec();
  if (!rec?.edits?.chars?.[name]) return;
  delete rec.edits.chars[name];
  results = {};
  saveAll();
  buildSheet(name, charSpec(name));
  $("#edit-revert").disabled = true;
  renderVariantPick();
  renderAll();
}

function buildSheet(name, sp) {
  const rec = byName.get(name);
  const body = $("#edit-body");
  body.textContent = "";

  // ① 돌파 + 코강 — 인게임처럼 한 줄 11칸 (별 3 다음이 코강으로 이어진다)
  const bt = sp.breakthrough ?? 0, core = sp.core_enhancement ?? 0;
  body.append(group(T("돌파 · 코어 강화"), [stepsEl(11, (i) => ({
    label: i <= 3 ? ("★".repeat(i) || "0") : `+${i - 3}`,
    on: i <= 3 ? (core === 0 && bt === i) : core === i - 3,
    star: i <= 3,
    onclick: () => {
      setEdit(name, ["breakthrough"], Math.min(i, 3), false);
      setEdit(name, ["core_enhancement"], Math.max(0, i - 3));
    },
  }))]));

  // ② 스킬 1·2·버스트
  const sk = sp.skill_levels || {};
  const skGrp = el("div", "grp");
  skGrp.append(el("span", "grp-label", "스킬 레벨"));
  // 출시 전 니케는 10에서 못 움직인다 — 카드가 레벨 10 기준이다(유저 지시 2026-09-02).
  const skLocked = !!rec?.preview;
  if (skLocked) skGrp.append(el("p", "grp-note", T("출시 전이라 스킬 레벨 10으로 고정합니다 — 공개된 카드가 레벨 10 수치입니다.")));
  for (const s of ["1", "2", "3"]) {
    const idx = s === "3" ? 2 : Number(s) - 1;
    const info = skillInfo(name, idx);            // 애장품 단계에 맞는 판
    const curLv = sk[s] ?? 1;
    const row = el("div", "grp-row");
    const label = el("span", "ol-part", s === "3" ? T("버스트") : T("스킬{s}", { s }));
    // 이름 + **지금 레벨**의 효과 — 라벨에 올리면 「이게 뭐 하는 스킬인지」가 바로 나온다
    label.title = [T(info?.name), skillEffectText(info, curLv)].filter(Boolean).join("\n");
    row.append(label);
    row.append(stepsEl(10, (i) => ({
      label: String(i + 1), on: curLv === i + 1, off: skLocked,
      // 레벨 버튼 하나하나에 **그 레벨**의 효과를 미리 보여 준다 — 안 눌러도
      // 지나가며 몇 레벨이 좋을지 비교할 수 있다.
      title: [info?.name && `${T(info.name)} (Lv.${i + 1})`, skillEffectText(info, i + 1)]
        .filter(Boolean).join("\n"),
      onclick: skLocked ? null : () => setEdit(name, ["skill_levels", s], i + 1),
    })));
    skGrp.append(row);
  }
  body.append(skGrp);

  // ③ 호감도 · 소장품 · 애장품 · 큐브
  const misc = el("div", "grp");
  misc.append(el("span", "grp-label", "호감도 · 소장품 · 큐브"));
  misc.append(rowSelect(T("호감도"), Array.from({ length: 40 }, (_, i) => [i + 1, `${i + 1}`]),
    sp.affinity ?? 30, (v) => setEdit(name, ["affinity"], Number(v))));
  misc.append(rowSelect(T("소장품"), COLL_STAGES.map((s) => [s, s === "없음" ? T("없음") : s]),
    sp.collection_stage ?? "없음", (v) => setEdit(name, ["collection_stage"], v)));
  if (sp.favorite_stage != null) {
    misc.append(rowSelect(T("애장품"), [[0, T("없음")], [1, T("1단계")], [2, T("2단계")], [3, T("3단계")]],
      sp.favorite_stage, (v) => setEdit(name, ["favorite_stage"], Number(v))));
  }
  const cubes = MAPS?.cube_info || {};
  const cubeNames = Object.keys(cubes).filter((c) => c !== "공통").sort();
  if (cubeNames.length) {
    const curCube = sp.cube?.name ?? "렐릭 베어 큐브";
    const curLv = sp.cube?.level ?? 15;
    misc.append(rowSelect(T("큐브"), cubeNames.map((c) => [c, c]), curCube,
      (v) => setEdit(name, ["cube", "name"], v)));
    // 레벨 0 = **미장착**. 예전엔 1~15만 고를 수 있어 «큐브를 안 낀 니케»를
    // 표현할 방법이 없었고, 그래서 전원 렐릭 베어 Lv15로 계산됐다. 큐브 공통
    // 스킬(안티 코드 HC)이 우월 코드 대미지를 최대 +19.09% 주므로, 우코가 켜지는
    // 니케는 이 허수만으로 딜이 크게 부풀었다(2026-08-24 실측 대조).
    misc.append(rowSelect(T("큐브 레벨"),
      [[0, T("없음")], ...Array.from({ length: 15 }, (_, i) => [i + 1, `${i + 1}`])],
      curLv, (v) => setEdit(name, ["cube", "level"], Number(v))));
    // 이름만 두면 무슨 큐브인지 알 수 없다 — 효능을 그 레벨의 수치로 적어 준다
    misc.append(el("p", "cube-eff", cubeEffect(curCube, curLv)));
  }
  body.append(misc);

  // ④ 장비 4부위 + 오버로드 12줄
  const eq = sp.equipment || {};
  const eqGrp = el("div", "grp");
  eqGrp.append(el("span", "grp-label", "장비 · 오버로드"));
  // 4부위를 한 줄씩 쌓으면 16줄짜리 긴 목록이 된다. 부위마다 한 칸으로 묶어
  // 격자에 올리면 폭에 따라 **2열 또는 4열**로 접힌다.
  const eqGrid = el("div", "eq-grid");
  eqGrp.append(eqGrid);
  PARTS.forEach((part, pi) => {
    const cell = el("div", "eq-part");
    eqGrid.append(cell);
    const cur = eq[part] || {};
    const isCorp = cur.tier == null || cur.tier === "기업";
    const row = el("div", "grp-row");
    row.append(el("span", "ol-part", part));
    row.append(selectEl(equipOptions(rec?.corp), equipValue(cur), (v) => {
      const next = normalizeOl(charSpec(name)._ol);
      // 기업(오버로드) 장비가 아니면 오버로드 줄이 없다 — 함께 비운다. T9 기업은
      // 오버로드와 별개라 여기서도 비워야 한다(§isCorp).
      if (!v.startsWith("기업")) next[pi] = [null, null, null];
      setEdit(name, ["equipment", part], parseEquip(v, rec?.corp), false);
      setEdit(name, ["_ol"], next, false);
      setEdit(name, ["equip_skills"], deriveEquipSkills(next));
    }));
    cell.append(row);

    const ol = normalizeOl(sp._ol);
    for (let li = 0; li < 3; li++) {
      const line = ol[pi][li];
      const r = el("div", "ol-row");
      r.append(selectEl([["", T("빈 줄")], ...OL_OPTS], line?.o ?? "", (v) => {
        const next = normalizeOl(charSpec(name)._ol);
        next[pi][li] = v ? { o: v, l: line?.l ?? 15 } : null;
        setEdit(name, ["_ol"], next, false);
        setEdit(name, ["equip_skills"], deriveEquipSkills(next));
      }, !isCorp));
      r.append(selectEl(Array.from({ length: 15 }, (_, i) => [i + 1, T("{v}단계", { v: i + 1 })]),
        line?.l ?? 15, (v) => {
          const next = normalizeOl(charSpec(name)._ol);
          if (next[pi][li]) next[pi][li].l = Number(v);
          setEdit(name, ["_ol"], next, false);
          setEdit(name, ["equip_skills"], deriveEquipSkills(next));
        }, !isCorp || !line?.o));
      r.append(el("span", "ol-val", line?.o ? `${pct(line.o, line.l)}%` : ""));
      cell.append(r);
    }
  });
  body.append(eqGrp);

  // ⑤ 유도된 합산 — 계산에 실제로 들어가는 값.
  // **항목마다 한 줄**이다. 가운뎃점으로 이어 붙이면 여섯 항목이 한 덩어리로 보여
  // 어떤 수치가 무엇인지 훑을 수가 없다.
  const agg = sp.equip_skills || {};
  const rows = EQUIP_KEYS.filter((k) => {
    const v = agg[k];
    return Array.isArray(v) ? v.length : v;
  }).map((k) => {
    const v = agg[k];
    const li = el("div", "sum-row");
    li.append(el("span", "sum-k", OL_LABEL[k]));
    // 최대 장탄·차지 속도는 줄별로 따로 반올림되므로 합치지 않고 그대로 보여 준다
    li.append(el("b", "sum-v", `${Array.isArray(v) ? v.join(" + ") : v}%`));
    return li;
  });
  const box = el("div", "sum-list");
  if (rows.length) rows.forEach((r) => box.append(r));
  else box.append(el("p", "sum-row", "없음"));
  body.append(group(T("계산에 들어가는 합산"), [box]));
}

/** 큐브가 올리는 스탯 이름만. 고르는 자리에 쓰는 짧은 라벨이다 —
 *  `template`("재장전 속도 {0}% ▲")에서 수치·화살표를 떼고 남긴다.
 *  표가 없거나 문구가 비면 큐브 이름으로 돌아간다. */
function cubeStatLabel(cubeName) {
  // 아래 조건절 떼기는 한국어 문장 규칙이다 — 다른 언어는 큐브 이름으로 보인다
  if (I18N.lang !== "ko") return T(cubeName);
  const t = MAPS?.cube_info?.[cubeName]?.template;
  const s = String(t || "")
    // 조건절을 뗀다 — "전투 시작 시 재장전 속도 {0}% ▲"에서 남길 건 «재장전 속도»뿐이다.
    // 이걸 안 떼면 고르개가 좁아 전부 "전투 시작 시"로만 보인다(실측).
    .replace(/^전투 시작 시\s*/, "")
    .replace(/^\d+발 사격 시\s*/, "")
    .replace(/^착용자의[\s\S]*?때\s*/, "")
    // 수치 자리와 단위·화살표·지속시간 꼬리를 뗀다
    .replace(/\{0\}\s*(%|발|초)?/g, "")
    .replace(/\d+초\s*유지/g, "")
    .replace(/[▲▼]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || cubeName;
}

/** 큐브 효능 한 줄. `cube.json`의 `스킬명`·`template`·레벨별 수치로 문장을 만든다. */
function cubeEffect(cubeName, lv) {
  // 레벨 0은 미장착 — 표에 0이 없어 그대로 두면 `{0}`이 안 채워진 문장이 나온다.
  if (!Number(lv)) return T("미장착 — 큐브 효과 없음");
  const c = MAPS?.cube_info?.[cubeName];
  if (!c) return "";
  const vals = c.values?.[String(lv)];
  const v = Array.isArray(vals) ? vals[0] : vals;
  const tpl = T(String(c.template || ""));          // 현지어 템플릿(사전에 있으면)
  const txt = tpl && v != null ? tpl.replace("{0}", v) : tpl;
  // ▲는 «증가»를 뜻하는데 여기 나오는 값은 전부 증가라 구분에 쓰이지 않는다 — 잡음이다.
  return `${T(c.skill || "")} — ${txt}`.replace(/\s*[▲▼]/g, "").trim();
}

const normalizeOl = (ol) =>
  Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => (ol?.[i]?.[j] ? { ...ol[i][j] } : null)));
const pct = (key, lv) => {
  const t = MAPS?.skill_table?.[key];
  return t ? +(t[(lv || 1) - 1] * 100).toFixed(4) : 0;
};
/** 12줄 → 계산기 equip_skills. profile_convert._equip_skills와 같은 규칙이어야 한다. */
function deriveEquipSkills(ol) {
  const out = {};
  for (const k of EQUIP_KEYS) out[k] = PER_LINE.has(k) ? [] : 0;
  for (const part of ol) {
    for (const line of part) {
      if (!line?.o) continue;
      const v = pct(line.o, line.l);
      if (PER_LINE.has(line.o)) out[line.o].push(v);
      else out[line.o] = +(out[line.o] + v).toFixed(4);
    }
  }
  for (const k of PER_LINE) out[k].sort((a, b) => b - a);
  return out;
}

// T9 기업 장비는 제조사가 캐릭터 기업과 같아야 +30%가 붙는다(calculator/base_stat.py
// _equip_stat). 여기서는 그 매치 보너스를 받는 조합(캐릭터 자기 기업 제조사)만 고를 수
// 있게 한다 — 안 맞는 조합을 시험하고 싶으면 프로필 동기화로 실제 장비를 들여온다.
// 고르개는 **[값, 보이는 글자]** 쌍이다. 값은 `parseEquip`이 다시 읽는 식별자라
// **번역하지 않는다.** 예전에는 값 쪽도 `T()`를 지났다 — 한국어 아닌 화면에서는
// «Mfr. 3»이 나와 `parseEquip`이 못 알아보고 `{tier:"Mfr. 3"}`을 만들었고,
// 오버로드 줄이 잠긴 채 계산기에도 모르는 등급이 갔다(피드백 2026-08-28).
const equipOptions = (corp) => [
  ["없음", T("미장착")],
  ...Array.from({ length: 6 }, (_, i) => [`기업${i}`, T("오버로드 강화 {i}", { i })]),
  ...(corp
    ? Array.from({ length: 6 }, (_, i) => [`T9기업${i}`, T("T9 기업({corp}) 강화 {i}", { corp, i })])
    : []),
  ...Array.from({ length: 9 }, (_, i) => [`T${i + 1}`, T("일반 T{v}", { v: i + 1 })]),
];
const equipValue = (cur) =>
  cur.tier === "없음" ? "없음"
    : cur.tier === "T9" && cur.corp ? `T9기업${cur.level ?? 0}`
    : cur.tier && cur.tier !== "기업" ? cur.tier
    : `기업${cur.level ?? 0}`;

/** 장비 등급으로 성립하는 값. 이 밖의 글자가 들어 있으면 위 버그로 저장된 것이다. */
const EQ_TIERS = new Set(["없음", "기업", ...Array.from({ length: 9 }, (_, i) => `T${i + 1}`)]);

/** 번역문이 등급으로 저장된 옛 수정본을 되돌린다. 숫자 꼬리(«Mfr. 3»의 3)가 강화
 *  단계라 그것만 살리면 원래 값이 나온다. 성립하는 등급은 건드리지 않는다.
 *  ROSTER가 실린 뒤에 부른다 — T9 기업은 제조사를 니케에서 찾아 채워야 한다. */
function repairEquipTiers() {
  let fixed = 0;
  for (const rec of Object.values(state.profiles || {})) {
    for (const [name, e] of Object.entries(rec?.edits?.chars || {})) {
      for (const part of Object.keys(e?.equipment || {})) {
        const cur = e.equipment[part];
        if (!cur || typeof cur.tier !== "string" || EQ_TIERS.has(cur.tier)) continue;
        const n = cur.tier.match(/(\d+)\s*$/);
        e.equipment[part] = !n ? { tier: "없음" }
          : /^T9\D/.test(cur.tier)
            ? { tier: "T9", level: Number(n[1]), corp: byName.get(name)?.corp, _track: "T9" }
            : { tier: "기업", level: Number(n[1]) };
        fixed++;
      }
    }
  }
  if (fixed) { results = {}; saveAll(); }
}
/** 고른 값 → 장비 한 부위.
 *
 *  **기업(오버로드)을 고를 때 `tier`를 반드시 같이 쓴다.** 수정본은 원본에 `deepMerge`로
 *  얹히므로 `{level: N}`만 쓰면 원본의 `tier: "T7"`이 그대로 남아, 고르는 순간 「일반
 *  T7」로 되돌아간 것처럼 보였다(오버로드 줄도 계속 잠겨 있었다). 계산기 쪽 규칙은
 *  `calculator/base_stat.py _equip_stat`이다 — `tier`가 없거나 «기업»이면 오버로드
 *  장비이고 그때만 `level`을 본다. T9 기업은 `tier: "T9"` + `corp` + `level`을 함께
 *  쓴다. 일반·미장착에서는 `level`이 남아 있어도 보지 않는다. */
const parseEquip = (v, corp) =>
  v === "없음" ? { tier: "없음" }
    : v.startsWith("T9기업") ? { tier: "T9", level: Number(v.slice(4)), corp, _track: "T9" }
    : v.startsWith("기업") ? { tier: "기업", level: Number(v.slice(2)) }
    : { tier: v };

// ── 전투력 계산기 ───────────────────────────────────────────────────────────
// 니케 하나의 육성 옵션을 자유로 바꿔 가며 전투력·스탯을 본다. 값은 **계정 계정과
// 분리된 샌드박스**다 — 여기서 무엇을 만져도 계정·덱에는 아무 영향이 없다.
// 계산은 서버(/api/cp)가 한다. 산식은 서버에만 있고 브라우저에는 결과만 온다.
let coop = null;           // 샌드박스 상태. 계정과 무관하게 마음대로 바뀐다
let coopTimer = 0;         // 연타 흡수 — 마지막 조작 후 120ms 지나면 한 번만 보낸다
let coopSeq = 0;           // 늦게 도착한 옛 응답이 새 결과를 덮지 않게
let coopLastCp = null;     // 직전 전투력 — «+XX» 효과의 비교 기준. 캐릭터를 바꾸면 비운다

// 필터 바 DOM은 편성·전투력 계산기가 공유하지만(moveFilterBar), **상태는 안 섞는다**.
// inCoop이 지금 그 DOM이 어느 쪽에 붙어 있는지를 말해 준다 — 바 자체의 클릭 핸들러는
// 한 번만 묶이므로(붙는 곳이 바뀌어도 같은 함수가 계속 불린다), 매번 이 값으로 어느
// state를 읽고 쓸지, 어느 목록을 다시 그릴지 정한다.
let inCoop = false;
const curFilter = () =>
  (inCoop ? state.coopFilter : modeNow() === "union" ? uFilter() : state.filter);

/** 편성 탭의 필터 바를 전투력 계산기로 옮겨 붙인다(또는 되돌린다).
    복제하지 않는 이유: 두 벌이 되면 «표시»가 조용히 갈린다(칩 색깔 등). 대신 **상태**는
    처음부터 둘로 나눠 두고(state.filter / state.coopFilter) 이 함수가 옮길 때마다 바를
    지금 붙는 쪽의 상태로 다시 그린다 — 그래서 편성에서 건 필터가 전투력 계산기까지
    새어 들지 않는다. */
function moveFilterBar(toCoop) {
  inCoop = toCoop;
  const bar = document.querySelector(".filter-bar");
  if (bar) {
    const slot = toCoop ? $("#coop-filter-slot") : document.querySelector(".roster");
    if (slot && bar.parentElement !== slot) {
      if (toCoop) slot.append(bar);
      else slot.prepend(bar);
    }
  }
  // 계정 고르개(+콘솔 톱니)도 같이 옮긴다 — 전투력 계산기도 «어느 계정으로 보나»가
  // 시작값을 정하므로 여기서 바로 바꿀 수 있어야 한다.
  const field = $("#profile-pick")?.closest(".field");
  const cog = $("#acct-cog");
  const home = document.querySelector(".stage-head");
  // 전투력 계산기에서는 **니케 검색 왼쪽**에 붙인다 — 필터 바 맨 앞이 그 자리다
  const slot2 = toCoop ? document.querySelector(".filter-bar") : home;
  // 기준 노드는 **반드시 `home`의 직계 자식**이어야 한다 — 아니면 `insertBefore`가
  // 던진다. 실제로 밟았다: 효과 끄기(✦ `#fx-toggle`)를 머리줄로 옮긴 뒤로 이게
  // `.stage-head`의 자식이 아니게 되어, **전투력 계산기에서 나오는 첫 전환마다
  // 예외**가 났다. 예외가 나면 부르는 쪽(탭 전환)의 남은 일이 통째로 건너뛰어져
  // ⚙이 필터 바에 남고, 피드백 탭으로 나가면 `fbLoad()`가 안 돌아 목록이 비었다.
  // 그래서 «있으면 쓴다»가 아니라 «여기 자식일 때만 쓴다»로 고른다.
  const tabs = document.querySelector("#deck-tabs");
  const at = (sel) => {
    const n = $(sel);
    return n && n.parentElement === home ? n : tabs;
  };
  if (field && slot2 && field.parentElement !== slot2) {
    if (toCoop) {
      const first = slot2.firstElementChild;
      slot2.insertBefore(field, first);
      if (cog) slot2.insertBefore(cog, first);
    } else {
      // 원래 자리로 — index.html의 순서는 «계정 → 유니온명 → LV → ⚙ 콘솔 → 배치모드 →
      // 덱 번호»다. 예전엔 둘 다 «덱 번호» 앞에 꽂아서, 전투력 계산기에 갔다 오면
      // 계정 칸이 줄 끝으로 밀려나 있었다(실측).
      home.insertBefore(field, at("#union-name-wrap"));
    }
  }
  // ⚙은 **따로** 확인한다. 위 조건이 `field`만 보므로, 계정 칸은 제자리인데 ⚙만
  // 필터 바에 남은 상태(위 예외로 실제로 생겼다)에서는 영영 안 돌아왔다.
  if (!toCoop && cog && cog.parentElement !== home) {
    home.insertBefore(cog, at("#fast-toggle-wrap"));
  }
  // 바가 방금 어느 쪽으로 붙었든, 그 상태(curFilter())로 칩·검색어를 다시 맞춘다.
  const q = $("#q");
  if (q) q.value = curFilter().q;
  buildFilters();
}

// 레벨 상한 — 표가 1400까지 있다(실측). 게임이 늘리면 표와 이 값만 올린다.
const LV_MAX = 1400;
// 콘솔(재활용 연구실)은 게임 데이터에 상한이 없다 — 표(RecycleResearchStatTable)는
// 타입별 레벨당 증가치 한 줄뿐이고(공통 hp 450 · 역할군 hp 750/def 5 · 기업 atk 25/def 5)
// 완전히 선형이라 상한을 안 둬도 계산은 어긋나지 않는다. 오타 방지용으로만 두고,
// 세 갈래(공통·역할군·기업) 모두 같은 값을 쓴다(사용자 지시 2026-08-27).
// **니케 레벨(`LV_MAX`)과 다르다** — 그쪽은 스탯 표가 1400까지라 넘기면 표 밖을 읽는다.
const CONSOLE_MAX_LV = 9999;
// 오버로드 줄 라벨 등급 — **12단계부터** 블루, 15단계가 블랙 (유저 확인).
// 11단계는 일반이다. 게임이 바뀌면 이 두 값만 고치면 된다.
const OL_BLUE_FROM = 12;
const OL_BLACK_FROM = 15;
let coopWired = false;

function coopEnsure() {
  moveFilterBar(true);
  if (!coopWired) {
    coopWired = true;
    $("#coop-reset").onclick = () => { if (coop) coopLoad(coop.name); };
    $("#coop-back").onclick = coopBack;
    // **좌우로 끌어서** 앞·뒤 니케로 넘어간다 — 지금 목록(필터 적용분) 순서 그대로.
    const art = $("#coop-screen");
    let dragX = null;
    let dragY = null;
    art.addEventListener("pointerdown", (e) => {
      // 정보판·버튼 위에서 시작한 것은 조작이지 넘김이 아니다
      if (e.target.closest(".cp-side, .cp-rail, .cp-star, .cp-back")) return;
      // 끄는 동안 판 밖 글자까지 파랗게 긁히는 걸 막는다. pointerdown 기본동작이
      // «선택 시작»이라 그것부터 끊고, 이미 잡혀 있던 선택도 지운다.
      e.preventDefault();
      document.body.classList.add("cp-dragging");
      try { getSelection()?.removeAllRanges(); } catch { /* 선택이 없으면 그만 */ }
      dragX = e.clientX; dragY = e.clientY;
      art.classList.add("dragging");
      try { art.setPointerCapture(e.pointerId); } catch { /* 캡처 못 해도 동작한다 */ }
    });
    // 끄는 동안 일러가 손을 따라온다 — 넘어가는 중인지 눈으로 알 수 있게
    art.addEventListener("pointermove", (e) => {
      if (dragX === null) return;
      const dx = e.clientX - dragX;
      if (Math.abs(dx) < Math.abs(e.clientY - dragY)) return;   // 세로면 스크롤이다
      const a = $("#coop-art");
      a.style.transform = `translateX(${dx * 0.35}px)`;
      a.style.opacity = String(Math.max(0.45, 1 - Math.abs(dx) / 420));
    });
    art.addEventListener("dragstart", (e) => e.preventDefault());
    const dragEnd = () => {
      document.body.classList.remove("cp-dragging");
      art.classList.remove("dragging");
      const a = $("#coop-art");
      a.style.transform = "";
      a.style.opacity = "";
    };
    art.addEventListener("pointerup", (e) => {
      try { art.releasePointerCapture(e.pointerId); } catch { /* 이미 풀렸다 */ }
      dragEnd();
      if (dragX === null) return;
      const dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragX = dragY = null;
      // 세로로 더 많이 움직였으면 스크롤이다 — 넘기지 않는다
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) coopStep(dx < 0 ? 1 : -1);
    });
    art.addEventListener("pointercancel", () => { dragX = dragY = null; dragEnd(); });
    $("#coop-eq-x").onclick = () => $("#coop-eq").close();
    renderCoopPool();
  }
  if (!HEALTH.cp) {
    coopMsg(T("전투력 계산기는 서버 계산이 필요합니다 — 지금 서버에 연결할 수 없어 쓸 수 없습니다."),
            "err");
  }
}

/** 아래쪽 니케 고르개. 편성 탭과 **같은 카드**를 쓴다 — 두 화면이 달라 보이면 안 된다. */
function renderCoopPool() {
  const wrap = $("#coop-pool");
  wrap.textContent = "";
  const list = filteredRoster(true, state.coopFilter);
  for (const rec of list) {
    const c = card(rec.name);
    c.onclick = () => coopLoad(rec.name);
    c.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); coopLoad(rec.name); }
    };
    wrap.append(c);
  }
}

/** 소장품·애장품 **인게임 그림** 파일명. 애장품은 캐릭터 전용이라 이름으로,
    소장품(R·SR)은 무기군 공용이라 등급+무기군으로 찾는다. 없으면 null. */
function favIconFile(name, stage) {
  const ic = MAPS?.fav_icons;
  if (!ic || !stage || stage === "없음") return null;
  const short = String(name).split(" : ")[0];
  // 애장품(캐릭터 전용) 그림은 **SR15로 둔 때만** — 단계를 바꾸면 그림도 바뀌어야 한다
  if (stage === "SR15" && ic.by_char?.[short]) return ic.by_char[short];
  const grade = /^SR/.test(stage) ? "SR" : "R";
  const weapon = byName.get(name)?.weapon;
  return ic.by_kind?.[`${grade}_${weapon}`] || null;
}

/** 인게임 장비·큐브·스킬 아이콘 (`scraper/cdn_ui_icons.py` 수집). 없으면 null. */
const uiIcon = (kind, key) => MAPS?.ui_icons?.[kind]?.[key] || null;
const iconImg2 = (file) => {
  if (!file) return null;
  const im = el("img");
  im.src = `image/icon/${file}`;
  im.alt = "";
  im.draggable = false;
  return im;
};
const iconImg = (file, cls) => {
  if (!file) return null;
  const im = el("img", cls);
  im.src = `image/ui/${file}`;
  im.alt = "";
  im.draggable = false;
  return im;
};

function coopMsg(text, level) {
  const n = $("#coop-msg");
  n.textContent = text || "";
  n.className = "acct-msg" + (level === "err" ? " err" : level === "ok" ? " ok" : "");
}

/** 계정 계정(있으면)에서 시작값을 만든다. 없으면 기본값(만렙 육성) 값. */
function coopDefaults(name) {
  const sp = charSpec(name);
  const prof = mergedProfile();
  const con = consoleNow();
  const rec = byName.get(name);
  // 우선순위 3단.
  // ① **이 캐릭터에** 직접 지정한 큐브 — 「육성 수정」 시트의 `sp.cube`.
  //    이전엔 이걸 통째로 무시해서, 캐릭터마다 따로 골라 둬도 전투력 계산기가
  //    조용히 무시하고 계정 집계로 덮어써 「캐릭터를 바꿔도 큐브가 안 바뀐다」로
  //    보였다(사용자 실측 재현).
  // ② 프로필의 «장착 중인 큐브에서 관찰된 종류별 레벨» — 계정 전체 집계라
  //    캐릭터별이 아니다(profile_convert.py `_observed_cubes`). 레벨만 보고
  //    이름은 아이콘 목록 첫 번째로 채웠던 게 예전 버그 — 그 목록은 이 계정과
  //    무관한 게임 전체 표라 항상 같은("렐릭 어설트") 큐브로 고정돼 보였다.
  //    레벨과 이름을 **같은 관찰값**에서 함께 뽑아야 짝이 맞는다.
  // ③ 그마저 없으면(정보 전무) 게임 전체 목록의 첫 큐브.
  const cubes = prof?._account?.cubes || {};
  const cubeEntries = Object.entries(cubes).sort((a, b) => b[1] - a[1]);
  const [obsCubeName, obsCubeLv] = cubeEntries[0] || [];
  // **전투력은 «지금 실제 상태»다.** 편성(딜 시뮬)은 큐브를 갈아끼우는 자원으로 보고
  // 러너 기본값(렐릭 베어 Lv15)을 일괄로 쓰지만, 이 화면은 «내 니케 전투력»이라
  // 안 꼈으면 안 낀 값이 나와야 한다. 그래서 싱크가 사실만 적어 둔 `_cube`를 본다
  // (`_` 접두라 시뮬에는 안 넘어간다 — profile_convert.py 주석).
  // 우선순위: 카드에서 직접 지정 → 인게임 실제 장착(_cube) → 관찰된 보유 → 15.
  const cubeLv = sp?.cube?.level ?? sp?._cube?.level
    ?? (cubeEntries.length ? Number(obsCubeLv) : 15);
  const sk = sp?.skill_levels || {};
  // 계정이 없을 때의 오버로드 — 사이트 고정값과 같은 합계 (부위 배치는 전투력에 무관)
  const defaultOl = [
    [{ o: "element_bonus", l: 10 }, { o: "atk_pct", l: 10 }, { o: "max_ammo_pct", l: 15 }],
    [{ o: "element_bonus", l: 10 }, { o: "atk_pct", l: 10 }, { o: "max_ammo_pct", l: 4 }],
    [{ o: "element_bonus", l: 10 }, null, null],
    [{ o: "element_bonus", l: 10 }, null, null],
  ];
  return {
    name,
    level: Number(prof?._account?.synchro_level) || 200,
    grade: sp?.breakthrough ?? 3,
    core: Math.min(7, sp?.core_enhancement ?? 0),
    affinity: sp?.affinity ?? 30,
    s1: sk["1"] ?? 10, s2: sk["2"] ?? 10, ub: sk["3"] ?? 10,
    cube_lv: cubeLv,
    cube_name: sp?.cube?.name || obsCubeName || Object.keys(MAPS?.ui_icons?.cube || {})[0] || "",
    coll_stage: sp?.collection_stage ?? "SR15",
    // 장비는 **`_eq`(원본: 단계·강화·제조사)** 를 쓴다 — 계산기용 `equipment`는
    // T1~T9의 강화·제조사를 버려서 전투력이 어긋난다 (profile_convert 참고).
    equipment: sp?._eq
      ? JSON.parse(JSON.stringify(sp._eq))
      : Object.fromEntries(PARTS.map((p) => [p, { t: 10, lv: 5, corp: null }])),
    ol: sp ? normalizeOl(sp._ol) : defaultOl,
    corp: rec?.corp || "",
    console: {
      common: conVal(con.common_level, null, 180),
      class: conVal(con.class_level, rec?.cls, 100),
      corp_lv: conVal(con.company_level, rec?.corp, 100),
    },
  };
}

/** 고르는 화면으로 되돌아간다 — 상세 층을 걷는다 (인게임 뒤로가기). */
function coopBack() {
  const dlg = $("#coop-eq");
  if (dlg?.open) dlg.close();
  $("#coop-screen").hidden = true;
  $("#coop-pick").hidden = false;
  coopMsg("");
  renderCoopPool();
  syncRoute();
  // 스크롤을 올려 주지 않으면 목록 중간이 보여 «뒤로 안 갔다»로 읽힌다
  document.querySelector('[data-panel="coop"]').scrollIntoView({ block: "start" });
}

/** 지금 목록 순서에서 앞·뒤 니케로 넘어간다 (인게임 좌우 화살표). */
function coopStep(d) {
  if (!coop) return;
  const list = filteredRoster(true, state.coopFilter);
  if (!list.length) return;
  const i = list.findIndex((r) => r.name === coop.name);
  const next = list[((i < 0 ? 0 : i + d) % list.length + list.length) % list.length];
  if (next) coopLoad(next.name);
}

function coopLoad(name, scroll = false) {
  const first = $("#coop-screen").hidden;
  coop = coopDefaults(name);
  coopLastCp = null;        // 다른 사람으로 바뀌었다 — 이번 값은 비교 대상이 없다
  coopMsg("");
  // 상세가 고르는 화면을 **대신한다** — 인게임처럼 한 번에 하나만 보인다
  $("#coop-pick").hidden = true;
  buildCoop();
  cpKick("열기");
  // 목록에서 처음 들어올 때만 위로 올린다 — 좌우로 넘길 때마다 튀면 안 된다
  if (first || scroll) {
    document.querySelector('[data-panel="coop"]').scrollIntoView({ block: "start" });
  }
  // 니케마다 제 주소를 갖는다 — 링크로 바로 그 니케를 열 수 있고, 좌우로 넘긴 뒤
  // 뒤로 가기가 앞 니케로 돌아간다.
  syncRoute();
}

/** 화면에서만 일어나는 일을 서버 지표에 한 줄 알린다 — **이름만** 간다.
 *
 *  상세 타임라인·기록 저장 같은 것은 서버 요청이 없어서 «무엇을 많이 쓰나»에 아예
 *  안 잡혔다. 서버는 미리 정해 둔 이름만 받고 나머지는 버린다(임의 문자열이 지표
 *  열쇠가 되면 안 된다). 실패해도 조용하다 — 화면과는 무관한 일이다. */
function hit(what) {
  try {
    fetch("/api/hit?e=" + encodeURIComponent(what), { keepalive: true }).catch(() => {});
  } catch { /* 지표는 화면을 막지 않는다 */ }
}

// «왜 계산했나»를 지표에만 실어 보낸다 — 화면을 열자마자 한 번 도는 것과, 사람이
// 옵션을 만져서 다시 도는 것은 뜻이 전혀 다르다(하루 800건이 어느 쪽인지 몰랐다).
// 요청 한 건의 **까닭**만 세고 누구인지는 안 본다.
let coopWhy = "수정";
function cpKick(why = "수정") {
  coopWhy = why;
  clearTimeout(coopTimer);
  coopTimer = setTimeout(cpSend, 120);
}

/** 응답 본문을 JSON으로 읽는다. **JSON이 아니면 사람이 읽을 문장으로 바꾼다.**
 *
 *  서버는 오류도 JSON으로 준다(계약 §0). 그런데 그 **앞에 선 장비**는 아니다 —
 *  터널·프록시·사이드카가 죽었을 때의 502, 개발용 정적 서버의 501은 HTML 오류
 *  페이지다. 그걸 그대로 파싱하면 화면에 «Unexpected token '<', "<!DOCTYPE "…»가
 *  뜬다(실측: 전투력 계산기). 무슨 일이 났는지 알 수 없는 글자를 사용자에게
 *  보여 주는 셈이라, 상태코드를 달아 «연결이 안 된다»고 말해 준다. */
async function readJSON(r) {
  try {
    return await r.json();
  } catch {
    return { error: r.ok ? T("서버 응답을 읽지 못했습니다 ({status})", { status: r.status })
      : T("서버에 연결할 수 없습니다 ({status}) — 잠시 후 다시 시도하세요.", { status: r.status }) };
  }
}

/** JSON POST 한 번. 서버가 error를 돌려주면 그대로 예외로 올린다. */
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await readJSON(r);
  if (j.error) throw new Error(j.error);
  return j;
}

/** 전투력 옆에 «+XX»가 잠깐 떠올랐다 사라진다 — 옵션 하나 바꿀 때마다 바로
 *  체감되게, 인게임 스탯 강화 연출처럼. 늘어나면 파랑, 줄어들면 경고색.
 *  연달아 여러 번 바꾸면 이전 것이 사라지기 전에 새 것이 또 뜰 수 있다 —
 *  그때는 게임에서도 숫자가 겹쳐 뜨므로 자연스럽다. */
function showCpDelta(delta) {
  const numEl = $("#coop-cp");
  const host = numEl?.parentElement;
  if (!host || !delta) return;
  const tag = el("span", "cp-delta-fx" + (delta < 0 ? " down" : ""),
    `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`);
  host.append(tag);
  // 숫자 자릿수가 계속 바뀌므로 고정 좌표로는 못 맞춘다 — **숫자 한가운데** 위로
  // 뜨게 실측해서 놓는다(협전 표시가 오른쪽에 바로 붙어 있어, 옆으로 붙이면 겹친다).
  const hostR = host.getBoundingClientRect(), numR = numEl.getBoundingClientRect();
  tag.style.left = `${numR.left - hostR.left + numR.width / 2}px`;
  tag.addEventListener("animationend", () => tag.remove());
}

async function cpSend() {
  if (!coop) return;
  const rec = byName.get(coop.name);
  const seq = ++coopSeq;
  try {
    // 까닭은 **주소에** 붙인다 — 본문은 사이드카로 그대로 흘러가야 해서 안 건드린다.
    const r = await fetch("/api/cp?why=" + encodeURIComponent(coopWhy), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...coop, cls: rec.cls, weapon: rec.weapon,
        // 서버는 `console.corp`를 연구 레벨로 받는다 — 착용자 기업은 `corp`로 따로 간다
        console: { common: coop.console.common, class: coop.console.class,
                   corp: coop.console.corp_lv },
      }),
    });
    const j = await readJSON(r);
    if (seq !== coopSeq) return;            // 그 사이 값이 또 바뀌었다 — 낡은 응답이다
    if (j.error) throw new Error(j.error);
    // 값이 바뀐 순간에만 «+XX» 효과를 띄운다. 캐릭터를 막 골랐을 때(첫 값)는
    // 비교할 이전 값이 없으니 조용히 넘어간다 — 안 그러면 고르자마자 전투력
    // 전체가 "증가"로 뜬다.
    const prevCp = coopLastCp;
    if (prevCp != null && j.cp !== prevCp) showCpDelta(j.cp - prevCp);
    coopLastCp = j.cp;
    $("#coop-cp").textContent = j.cp.toLocaleString();
    // 협전(레벨 40 고정) 전투력 — 실제 레벨과 무관하게 항상 옆에 보여 준다.
    const w40 = $("#coop-cp40-wrap");
    w40.hidden = j.cp40 == null;
    if (j.cp40 != null) $("#coop-cp40").textContent = j.cp40.toLocaleString();
    $("#coop-hp").textContent = j.hp.toLocaleString();
    $("#coop-atk").textContent = j.atk.toLocaleString();
    $("#coop-def").textContent = j.def.toLocaleString();
    coopMsg(rec.rare !== "SSR"
      ? T("R·SR 등급은 스탯 표가 SSR 기준이라 전투력이 실제보다 높게 나옵니다.") : "",
      rec.rare !== "SSR" ? "err" : "");
  } catch (e) {
    if (seq !== coopSeq) return;
    coopMsg(T("계산 실패 — {v}", { v: String(e.message || e) }), "err");
  }
}

/** 값 하나 바꾸기: 상태 수정 → 열린 탭만 다시 그림 → 재계산 예약. */
function coopSet(fn) { fn(); buildCoopPane(); cpKick(); }

const COOP_TABS = [["equip", T("장비")], ["skill", T("스킬")], ["cube", T("큐브")]];
let coopTab = "equip";

function buildCoop() {
  if (!coop) return;
  const c = coop, rec = byName.get(c.name);
  $("#coop-screen").hidden = false;

  // 전신 일러. 없으면 초상화로 물러난다 (`scraper/cdn_full.py`를 안 돌린 경우)
  const art = $("#coop-art");
  art.textContent = "";
  const img = el("img");
  img.alt = "";
  img.draggable = false;        // 없으면 브라우저 기본 이미지 드래그가 넘김을 삼킨다
  // 스킨을 입고 있으면 그 전신 일러로. **알파 경계도 그 그림 것을 써야 한다** —
  // 2048² 안에서 캐릭터가 앉은 자리가 코스튬마다 달라 기본 경계를 그대로 쓰면
  // 발이 잘리거나 붕 뜬다(`scraper/cdn_costume.py _add_bbox`).
  const cos = costumeOf(rec, c.name);
  const full = cos?.full ? `image/${cos.full}` : rec?.full ? `image/full/${rec.full}` : null;
  const fbb = cos?.full ? cos.fbb : rec?.fbb;
  img.onerror = () => { img.onerror = null; img.src = artSrc(rec, c.name); art.classList.remove("fit"); };
  img.src = full || artSrc(rec, c.name);
  art.classList.toggle("fit", !!(full && fbb));
  if (full && fbb) img.dataset.bb = fbb.join(",");
  else delete img.dataset.bb;
  art.append(img);
  fitCoopArt();
  // 판 내용(장비·스킬·큐브 목록)이 그려진 **뒤에** 한 번 더 맞춘다 — 무대 높이가
  // 판 길이를 따라가므로, 먼저 잰 값으로는 세로 위치가 위에 붙는다. 한 프레임으로도
  // 늦을 수 있어(이미지·글꼴) 판 자체의 높이 변화를 계속 지켜본다.
  settleCoopArt();
  watchCoopSide();

  // 주력 니케 = 즐겨찾기. 카드의 ★와 **같은 상태**를 쓴다
  const star = $("#coop-star");
  const isFav = state.favs.includes(c.name);
  star.classList.toggle("on", isFav);
  star.setAttribute("aria-pressed", String(isFav));
  star.title = isFav ? T("주력 니케 해제") : T("주력 니케로 지정");
  star.onclick = () => { toggleFav(c.name); buildCoop(); };

  const rare = $("#coop-rare");
  rare.textContent = rec?.rare || "";
  rare.className = `cp-rare rare-${String(rec?.rare || "").toLowerCase()}`;
  $("#coop-name").textContent = c.name;

  const lv = $("#coop-lv");
  lv.value = String(c.level);
  lv.onchange = () => {
    c.level = Math.max(1, Math.min(LV_MAX, Number(lv.value) || 1));
    lv.value = String(c.level);
    cpKick();
  };
  buildCoopGrade();
  const steps = $("#coop-lvsteps");
  steps.textContent = "";
  for (const [t, d] of [["-10", -10], ["-1", -1], ["+1", 1], ["+10", 10]]) {
    steps.append(mkBtn(t, "btn-ghost coop-step", () => {
      c.level = Math.max(1, Math.min(LV_MAX, c.level + d));
      lv.value = String(c.level);
      cpKick();
    }));
  }

  buildCoopRail();

  // 호감도 — 인게임에서 레벨 아래 «attraction RANK» 자리
  const attr = $("#coop-attr");
  attr.textContent = "";
  attr.append(el("span", "cp-attr-label", "호감도"));
  attr.append(selectEl(Array.from({ length: 40 }, (_, i) => [i + 1, `${i + 1}`]),
    c.affinity, (v) => coopSet(() => { c.affinity = Number(v); })));

  // 육각 줄 — 인게임 SQUAD 아래 자리. **4칸**: 코드 · 무기 · 역할군 콘솔 · 기업 콘솔.
  // 콘솔 두 칸은 아이콘으로 어느 쪽인지 알리고, 숫자를 눌러 바로 고친다.
  const hex = $("#coop-hex");
  hex.textContent = "";
  // 역할군·기업 아이콘은 **흰 선화**다 — 밝은 칩 위에서 사라지므로 표식을 달아
  // CSS에서 검게 뒤집는다. 속성 아이콘은 제 배경이 있어 손대지 않는다.
  const hexIcon = (file, label, mono) => {
    const h = el("span", "cp-hex");
    const im = iconImg2(file);
    if (im) { if (mono) im.classList.add("mono"); h.append(im); }
    else h.textContent = label || "";
    h.title = label || "";
    return h;
  };
  hex.append(hexIcon(ELEMENT_ICON[rec?.element], rec?.element));
  hex.append(hexIcon(null, rec?.weapon));
  for (const [key, file, label] of [
    ["common", null, T("공통 콘솔 레벨")],
    ["class", CLASS_ICON[rec?.cls], T("{v} 콘솔 레벨", { v: rec?.cls || T("역할군") })],
    ["corp_lv", CORP_ICON[rec?.corp], T("{v} 콘솔 레벨", { v: rec?.corp || T("기업") })],
  ]) {
    const box = el("label", "cp-hex cp-hex-lv");
    box.title = label;
    const im = iconImg2(file);
    if (im) { im.classList.add("mono"); box.append(im); }
    else box.append(el("span", "cp-hex-lb", "공통"));
    const inp = el("input");
    inp.type = "number"; inp.min = "0"; inp.max = String(CONSOLE_MAX_LV);
    inp.value = String(c.console[key]);
    inp.onchange = () => {
      const v = Math.max(0, Math.min(CONSOLE_MAX_LV, Number(inp.value) || 0));
      c.console[key] = v;
      inp.value = String(v);      // 잘린 값을 칸에도 보여 준다
      cpKick();
    };
    box.append(inp);
    hex.append(box);
  }

  const tabs = $("#coop-tabs");
  tabs.textContent = "";
  for (const [key, label] of COOP_TABS) {
    const b = mkBtn(label, `cp-tab${coopTab === key ? " on" : ""}`, () => {
      coopTab = key; buildCoop();
    });
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(coopTab === key));
    tabs.append(b);
  }
  buildCoopPane();
  // 어느 계정에서 왔는지는 위 고르개에 이미 떠 있다 — 여기서는 «여기 바꾼 건
  // 계정·덱에 안 남는다»만 알리면 된다.
  $("#coop-src").textContent = charSpec(c.name)
    ? T("여기서 바꾼 것은 계정·덱에 영향이 없습니다.")
    : T("저장된 계정이 없어 만렙 기본값에서 시작합니다.");
}

/** 스킬 설명 한 줄 — 템플릿의 {0}·{1}…을 **그 레벨의 수치**로 채운다.
 *  레벨을 안 주면(또는 그 레벨 값이 없으면) 자리표시자를 그대로 둔다. */
/** 그 니케의 **지금 애장품 단계**에 맞는 스킬 설명. 애장품은 단계마다 스킬 하나를 갈아 끼우고,
 *  단계는 쌓인다(3단계면 1·2단계 것도 그대로다). 애장품이 없거나 단계가 0이면 기본 설명이다.
 *  계산은 이미 단계별로 돈다 — 여기는 «보이는 글»만 맞추는 자리다(제보 2026-09-02). */
function skillInfo(name, idx) {
  const rec = byName.get(name);
  const base = rec?.skills?.[idx];
  if (!base?.fav) return base;
  const stage = Number(charSpec(name)?.favorite_stage) || 0;
  if (!stage) return base;
  // 지금 단계 이하에서 **가장 높은** 판이 그 자리의 설명이다.
  let pick = null;
  for (const [k, v] of Object.entries(base.fav)) {
    const n = Number(k);
    if (n <= stage && (!pick || n > pick.n)) pick = { n, v };
  }
  if (!pick) return base;
  // 애장품 판 설명은 아직 사전에 없다(수집기가 기본 스킬만 옮긴다) — 외국어 화면에서 한글이 튀느니
  // 번역이 올 때까지 기본 설명을 둔다. 사전에 들어오면 저절로 바뀐다.
  if ((I18N.lang || "ko") !== "ko" && !T.has(pick.v.tpl)) return base;
  return { ...base, ...pick.v, favStage: pick.n };
}

function skillEffectText(info, lv) {
  if (!info?.tpl) return "";
  const vals = info.vals?.[String(lv)] || [];
  return T(info.tpl).replace(/\{(\d+)\}/g,
    (m, i) => (vals[Number(i)] !== undefined ? vals[Number(i)] : m));
}

/** 스킬 하나 — 인게임처럼 **설명과 레벨**을 함께. */
function openSkillModal(idx) {
  const c = coop, rec = byName.get(c.name);
  const key = ["s1", "s2", "ub"][idx];
  const info = skillInfo(c.name, idx);            // 애장품 단계에 맞는 판
  $("#coop-eq-title").textContent = info?.name
    ? `${info.name} — ${[T("스킬1"), T("스킬2"), T("버스트")][idx]}`
    : [T("스킬1"), T("스킬2"), T("버스트")][idx];
  const ico = $("#coop-eq-ico");
  ico.textContent = "";
  const im0 = iconImg(info?.icon);
  if (im0) ico.append(im0);
  const body = $("#coop-eq-body");
  body.textContent = "";

  const lvRow = el("div", "grp");
  lvRow.append(el("span", "grp-label", "레벨"));
  lvRow.append(stepsEl(10, (i) => ({
    label: String(i + 1), on: c[key] === i + 1,
    title: skillEffectText(info, i + 1) || undefined,
    onclick: () => { c[key] = i + 1; cpKick(); buildCoopPane(); openSkillModal(idx); },
  })));
  body.append(lvRow);

  if (info?.tpl) {
    const d = el("div", "grp");
    d.append(el("span", "grp-label", "효과"));
    // 인게임 설명과 같은 읽기 — **지금 레벨의 수치**로 채운다
    const text = skillEffectText(info, c[key]);
    d.append(el("pre", "skill-text", text));
    body.append(d);
  }
  const dlg = $("#coop-eq");
  if (!dlg.open) dlg.showModal();
}

/** 돌파★·코어 — **누르면 바로 다시 그려야 한다.** buildCoop에서만 그리면 조작해도
    별이 그대로 남는다(실측 버그). */
function buildCoopGrade() {
  if (!coop) return;
  const c = coop;
  const gradeWrap = $("#coop-grade");
  gradeWrap.textContent = "";
  for (let i = 1; i <= 3; i++) {
    const b = el("button", "cp-gstar" + (c.grade >= i ? " on" : ""), "★");
    b.type = "button";
    b.title = T("{i}돌파", { i });
    // 누른 별까지만 채운다. 같은 별을 다시 누르면 한 칸 줄어든다.
    b.onclick = () => {
      c.grade = (c.grade === i && c.core === 0) ? i - 1 : i;
      if (c.grade < 3) c.core = 0;      // 코어강화는 3돌파 전제
      buildCoopGrade();
      cpKick();
    };
    gradeWrap.append(b);
  }
  // 코어강화는 **3돌파를 다 채운 뒤에만** 있는 값이라 그때만 보여 준다. 상한은 +7.
  if (c.grade >= 3) {
    const core = el("span", "cp-core" + (c.core ? " on" : ""));
    core.append(el("span", "cp-core-lb", "코어"));
    core.append(selectEl(Array.from({ length: 8 }, (_, i) => [i, i ? `+${i}` : "0"]),
      Math.min(7, c.core), (v) => { c.core = Number(v); buildCoopGrade(); cpKick(); }));
    gradeWrap.append(core);
  }

}

/** 왼쪽 레일(소장품) — **값이 바뀌면 다시 그려야 한다.** 별·색·그림이 단계를 따라간다. */
/** 전신 일러를 «그림이 실제로 있는 자리»에 맞춘다.
 *  원본은 2048² 정사각형인데 캐릭터가 앉은 위치가 제각각이다 — 아래 여백이
 *  0px인 니케도 645px인 니케도 있다(199장 실측). 그래서 예전처럼 «122% 키우고
 *  132px 내린다» 같은 한 값으로는 누구는 발이 잘리고 누구는 붕 떴다.
 *  빌드 때 잰 알파 경계(fbb)로 세로를 꽉 채우고 가로는 그림 중심을 맞춘다. */
function fitCoopArt() {
  const box = $("#coop-art");
  const img = box?.querySelector("img");
  if (!img) return;
  const bb = img.dataset.bb?.split(",").map(Number);
  if (!bb || bb.length !== 4) {                 // 경계를 모르면 CSS 기본값에 맡긴다
    img.style.cssText = "";
    return;
  }
  // 세로로 쌓을 때 상자는 **높이가 0**이다(그림이 절대배치라 안을 못 채운다) —
  // 높이를 여기서 정해 줄 참이므로 폭만 있으면 된다.
  const h = box.clientHeight, w = box.clientWidth;
  if (!w) return;
  const [x0, y0, x1, y1] = bb;
  const iw = x1 - x0, ih = y1 - y0;
  // 좁은 화면에서는 판이 **아래로** 내려간다 — 피할 것이 없다.
  const side = document.querySelector(".cp-side")?.getBoundingClientRect();
  const boxR = box.getBoundingClientRect();
  const stacked = !side || side.top >= boxR.bottom - 4;

  // 세로로 쌓아도 **그림 크기는 그대로**다 — 나란히 놓을 때와 같은 높이를 노리고,
  // 화면이 그보다 좁을 때만 폭에 맞춰 줄인다. 정보판은 그림 아래로 내려간다.
  let scale;
  const screen = box.closest(".cp-screen");
  if (stacked) {
    const target = parseFloat(getComputedStyle(box).getPropertyValue("--cp-art-h")) || h;
    scale = Math.min(target / ih, (w * 0.98) / iw);
    // 정보판이 시작하는 자리 = 그림 높이의 58%. 상체는 트여 있고 **하체는 판이
    // 덮는다** — 전신을 다 그리면서도 위쪽이 쓸데없이 길어지지 않는다.
    screen?.style.setProperty("--cp-clear", `${Math.round(ih * scale * 0.58)}px`);
  } else {
    screen?.style.removeProperty("--cp-clear");
    scale = (box.clientHeight || h) / ih;       // 나란히 놓을 때는 세로를 꽉 채운다
  }
  const size = (img.naturalWidth || 2048) * scale;
  const inkW = iw * scale;
  // 가로는 **정보판을 피해서** 앉힌다.
  //  · 판을 뺀 빈 자리가 그림보다 넓으면 → 그 빈 자리의 한가운데. 화면이 넓어질수록
  //    판 쪽으로 딸려가 오른쪽 구석에 서 있던 걸 고친 것이다(넓은 창에서 실측).
  //  · 빈 자리가 모자라면 → 판 왼쪽 끝에 붙이고 그림 폭의 18%만 판 아래로 밀어
  //    넣는다(인게임과 같은 겹침). 그래도 모자라면 왼쪽 끝까지 물러난다.
  const freeW = Math.max(0, w - side.width);
  const inkLeft = stacked
    ? (w - inkW) / 2
    : (freeW >= inkW ? (freeW - inkW) / 2
                     : Math.max(8, w - side.width + inkW * 0.18 - inkW));
  img.style.height = `${size}px`;
  img.style.width = `${size}px`;
  img.style.top = `${-y0 * scale}px`;
  img.style.left = `${inkLeft - x0 * scale}px`;

  // 세로 — 그림틀은 고정 높이(`--cp-art-h`)인데 무대는 오른쪽 판 길이를 따라
  // 더 길어진다. 틀을 top:0에 두면 니케가 위에 붙고 발밑이 휑하게 남는다
  // (실측: 무대 786px에 그림 680px → 아래 105px 공백). 남는 만큼 내려 **바닥에
  // 서게** 한다. 무대가 그림보다 짧으면 0이라 머리가 잘리지 않는다.
  // 무대 높이는 **오른쪽 판이 정한다.** `screen.clientHeight`만 보면 판 내용이
  // 아직 안 그려진 순간에 0이 잡혀 그대로 위에 붙는다(실측) — 판 실측 높이를 함께 본다.
  // 남는 공간은 **절반만** 내린다. 바닥에 딱 붙이면 이번엔 머리 위가 휑하다 —
  // 위아래로 나눠 두면 어느 쪽으로도 치우치지 않는다.
  const sh = Math.max(screen?.clientHeight || 0, side ? side.height : 0);
  box.style.top = stacked ? "" : `${Math.max(0, (sh - box.clientHeight) / 2)}px`;
}
// 판 크기는 창 폭(모바일 분기)에 따라 한 번 바뀐다 — 그때 다시 맞춘다.
// `fitCoopArt`가 상자 높이를 건드리므로 되먹임으로 도는 걸 막는다.
let fittingArt = false;
const refitArt = () => {
  if (fittingArt) return;
  fittingArt = true;
  try { fitCoopArt(); } finally { requestAnimationFrame(() => { fittingArt = false; }); }
};
if (typeof ResizeObserver === "function") {
  new ResizeObserver(refitArt).observe(document.documentElement);
}
// 무대 높이는 **오른쪽 판 길이**가 정한다. 판은 탭(장비·스킬·큐브)마다, 그리고
// 내용이 그려지면서 높이가 바뀌는데 창 크기는 그대로라 위 관찰자가 못 잡는다 —
// 판을 따로 지켜봐야 세로 가운데 정렬이 뒤늦게라도 맞는다.
/** 판이 다 자랄 때까지 몇 번 더 맞춘다.
 *
 *  관찰자(`watchCoopSide`)만으로는 부족했다 — 판이 커지는 시점이 관찰을 시작하기
 *  전이면 «크기가 변한 적 없는» 상태가 되어 콜백이 오지 않는다(실측: 세로가 계속
 *  위에 붙어 있었다). 프레임·짧은 지연 몇 번이면 글꼴·이미지까지 자리 잡는다. */
function settleCoopArt() {
  requestAnimationFrame(fitCoopArt);
  for (const ms of [120, 400]) setTimeout(fitCoopArt, ms);
}

let cpSideRO = null;
function watchCoopSide() {
  if (typeof ResizeObserver !== "function") return;
  const side = document.querySelector(".cp-side");
  if (!side) return;
  cpSideRO ||= new ResizeObserver(refitArt);
  cpSideRO.disconnect();
  cpSideRO.observe(side);
}

function buildCoopRail() {
  if (!coop) return;
  const c = coop;
  const rail = $("#coop-rail");
  rail.textContent = "";
  const railBox = el("div", "cp-item");
  railBox.append(el("span", "cp-item-label", "소장품"));
  const icon = favIconFile(c.name, c.coll_stage);
  const g = /^(SSR|SR|R)/.exec(c.coll_stage || "");
  const shot = el("div", "cp-item-art" + (icon ? "" : " empty")
    + (g ? ` grade-${g[1].toLowerCase()}` : ""));
  if (icon) {
    const im = el("img");
    im.src = `image/icon/${icon}`;
    im.alt = "";
    im.draggable = false;
    shot.append(im);
  } else {
    shot.textContent = "—";
  }
  railBox.append(shot);
  // 인게임처럼 **별로** 표기한다 — 5레벨당 별 하나(15레벨 = ★★★). 색은 등급색.
  const m = /^(SSR|SR|R)(\d*)$/.exec(c.coll_stage || "");
  if (m) {
    const grade = m[1];
    const lv = m[2] ? Number(m[2]) : 0;
    const stars = el("span", `cp-item-stars grade-${grade.toLowerCase()}`);
    for (let i = 0; i < 3; i++) {
      stars.append(el("i", "cp-star-pip" + (i < Math.floor(lv / 5) ? " on" : "")));
    }
    railBox.append(stars);
  }
  railBox.append(selectEl(COLL_STAGES.map((s) => [s, s]), c.coll_stage, (v) => {
    c.coll_stage = v;
    buildCoopRail();          // 별·색·그림이 고른 단계를 따라간다
    cpKick();
  }));
  rail.append(railBox);
}

/** 부위 하나의 장비 플랫 스탯 — 인게임 «장비 능력치» 칸.
    배율 = 1 + (제조사 일치 0.3) + 0.1×강화. 서버 엔진과 같은 규칙이다. */
function equipFlat(cls, part, cur) {
  const t = Number(cur?.t) || 0;
  const zero = { atk: 0, def: 0, hp: 0 };
  const tbl = MAPS?.equip_stats;
  if (!tbl || t < 1 || !cls) return zero;
  const lv = Math.max(0, Math.min(5, Number(cur.lv) || 0));
  const base = t >= 10 ? tbl["기업"]?.[cls]?.[part]?.["0"] : tbl["일반"]?.[`T${t}`]?.[cls]?.[part];
  if (!base) return zero;
  const mult = t >= 10 ? 1 + 0.1 * lv
    : 1 + (cur.corp && cur.corp === coop?.corp ? 0.3 : 0) + 0.1 * lv;
  return { atk: base.atk * mult, def: base.def * mult, hp: base.hp * mult };
}

/** 스킬 원 하나 — 아이콘 + 오른쪽 아래 레벨 배지. 버스트는 크게 그리고 단계를 얹는다. */
function skTile(key, idx, big) {
  const c = coop, rec = byName.get(c.name);
  const t = el("button", "sk-tile" + (big ? " big" : ""));
  t.type = "button";
  t.title = skillInfo(c.name, idx)?.name || [T("스킬1"), T("스킬2"), T("버스트")][idx];
  const im = iconImg(rec?.skills?.[idx]?.icon, "sk-tile-img");
  if (im) t.append(im);
  else t.append(el("span", "sk-tile-nm", [T("스킬1"), T("스킬2"), T("버스트")][idx]));
  if (big && rec?.burst) {
    const bd = el("span", "sk-burst-badge", BURST_ROMAN[rec.burst] || String(rec.burst));
    t.append(bd);
  }
  t.append(el("span", "tile-lv", String(c[key])));
  t.onclick = () => openSkillModal(idx);
  return t;
}

function buildCoopPane() {
  const pane = $("#coop-pane");
  if (!coop) return;
  pane.textContent = "";
  const c = coop, rec = byName.get(c.name);

  if (coopTab === "equip") {
    // 인게임 장비 화면: 위에 «장비 효과 보기»(합계), 아래로 부위마다
    // 그림 · 장비 능력치(플랫) · 장비 효과(오버로드 줄). 만렙 줄은 반전 강조.
    const sum = {};
    for (const part of c.ol) {
      for (const line of part) {
        if (line?.o) sum[line.o] = +( (sum[line.o] || 0) + pct(line.o, line.l) ).toFixed(4);
      }
    }
    const keys = Object.keys(sum);
    if (keys.length) {
      const head = el("div", "ovl-sum");
      head.append(el("span", "ovl-sum-hd", "장비 효과 보기"));
      const g = el("div", "ovl-sum-grid");
      for (const k of keys) {
        const r = el("div", "ovl-sum-row");
        r.append(el("span", null, T("[{v} 증가]", { v: OL_LABEL[k] })));
        r.append(el("b", null, `${sum[k].toFixed(2)}%`));
        g.append(r);
      }
      head.append(g);
      pane.append(head);
    }

    PARTS.forEach((part, pi) => {
      const cur = c.equipment[part] || { t: 0 };
      const on = Number(cur.t) >= 1;
      const isT10 = Number(cur.t) >= 10;
      const row = el("div", "ovl-part" + (on ? "" : " empty"));

      // 아이콘 — 인게임 장비 타일처럼 왼쪽에 뱃지 둘(위: 오버로드/기업, 아래: 역할군)과
      // 왼쪽 아래 강화 수치를 얹는다.
      const art = el("span", "ovl-art" + (isT10 ? " ovl" : ""));
      const ic = on ? iconImg(uiIcon("equip", `T${cur.t}|${rec?.cls}|${part}`)) : null;
      if (ic) art.append(ic);
      if (on && (isT10 || cur.corp)) {
        const badges = el("span", "ovl-badges");
        const badge = (cls, file) => {
          const b = el("i", "ovl-bg " + cls);
          const im = iconImg2(file);
          if (im) b.append(im);
          badges.append(b);
        };
        // 오버로드(T10)는 인게임 뱃지 그림. 그 아래 단계는 같은 자리에 기업 마크.
        // (인게임엔 역할군 뱃지도 한 칸 더 붙지만, 니케마다 고정이라 뺐다.)
        if (isT10) badge("ol", "icon-overload.png");
        else if (cur.corp) badge("corp", CORP_ICON[cur.corp]);
        art.append(badges);
      }
      art.append(el("span", "ovl-art-lv",
        on ? String(Number(cur.lv) || 0).padStart(2, "0") : "—"));
      row.append(art);

      const cols = el("span", "ovl-cols");

      // 왼쪽 — 부위·단계·강화·제조사를 **여기서 바로** 고친다
      const setup = el("span", "ovl-stat");
      setup.append(el("span", "ovl-hd", part));
      const r1 = el("span", "ovl-set-row");
      r1.append(selectEl(
        [[0, T("미장착")], ...Array.from({ length: 10 }, (_, i) => [i + 1, `T${i + 1}`])],
        Number(cur.t) || 0, (v) => coopSet(() => {
          cur.t = Number(v);
          c.equipment[part] = cur;
          if (Number(v) < 10) c.ol[pi] = [null, null, null];
          if (Number(v) >= 10) cur.corp = null;
        })));
      if (on) {
        r1.append(selectEl(Array.from({ length: 6 }, (_, i) => [i, `+${i}`]),
          Number(cur.lv) || 0, (v) => coopSet(() => { cur.lv = Number(v); })));
      }
      if (on && !isT10) {
        // 제조사는 **같은 줄**에 붙인다 — 아래로 내려가면 카드가 한 칸 커진다.
        // «제조사 없음»은 길어서 줄을 넘기던 이름이라 «일반장비»로 줄였다.
        const cs = selectEl([["", T("일반장비")], ...CORP_ORDER.map((x) => [x, x])],
          cur.corp || "", (v) => coopSet(() => { cur.corp = v || null; }));
        if (!cur.corp) cs.classList.add("plain");
        r1.append(cs);
      }
      setup.append(r1);
      const fl = equipFlat(rec?.cls, part, cur);
      for (const [lab, v] of [["체력", fl.hp], ["공격", fl.atk], ["방어", fl.def]]) {
        if (!v) continue;
        const r = el("span", "ovl-stat-row");
        r.append(el("span", null, lab));
        r.append(el("b", null, Math.round(v).toLocaleString()));
        setup.append(r);
      }
      cols.append(setup);

      // 오른쪽 — 오버로드 3줄. 옵션·단계를 바로 고르고 수치는 등급색으로 보인다.
      const eff = el("span", "ovl-eff");
      eff.append(el("span", "ovl-hd", "장비 효과"));
      for (let li = 0; li < 3; li++) {
        const line = c.ol[pi][li];
        const lv = line?.l ?? 15;
        const tier = !line?.o ? "" : lv >= OL_BLACK_FROM ? " black" : lv >= OL_BLUE_FROM ? " blue" : "";
        const r = el("span", "ovl-eff-row" + tier);
        r.append(selectEl([["", T("빈 줄")], ...OL_OPTS], line?.o ?? "", (v) => coopSet(() => {
          c.ol[pi][li] = v ? { o: v, l: line?.l ?? 15 } : null;
        }), !isT10));
        const lvSel = selectEl(Array.from({ length: 15 }, (_, i) => [i + 1, `${i + 1}`]),
          lv, (v) => coopSet(() => {
            if (c.ol[pi][li]) c.ol[pi][li].l = Number(v);
          }), !isT10 || !line?.o);
        if (line?.o) olLevelHints(lvSel, line.o);
        r.append(lvSel);
        r.append(el("b", null, line?.o ? `${pct(line.o, lv).toFixed(2)}%` : ""));
        eff.append(r);
      }
      cols.append(eff);
      row.append(cols);
      pane.append(row);
    });
    return;
  }

  if (coopTab === "skill") {
    // 인게임 SKILL 상자: 왼쪽에 작은 원 둘(스킬1·2), 오른쪽에 큰 버스트 원.
    // 원마다 오른쪽 아래에 레벨 배지가 붙는다.
    const grid = el("div", "sk-grid");
    const col = el("div", "sk-col");
    ["s1", "s2"].forEach((key, i) => {
      col.append(skTile(key, i, false));
    });
    grid.append(col);
    grid.append(skTile("ub", 2, true));
    pane.append(grid);
    return;
  }

  if (coopTab === "cube") {
    // 인게임 HARMONY CUBE 상자: 큐브 카드 → 스킬 원 → 스탯 → 고르개.
    // 전부 가운데 한 줄기로 세운다 — 왼쪽 붙임과 가운데 정렬이 섞여 어수선했다.
    const wrap = el("div", "cube-pane");
    const card0 = el("div", "cube-card" + (c.cube_lv ? "" : " empty"));
    const cic = c.cube_lv ? iconImg(uiIcon("cube", c.cube_name), "cube-card-img") : null;
    if (cic) card0.append(cic);
    card0.append(el("span", "cube-card-lv", c.cube_lv ? `LV.${c.cube_lv}` : T("없음")));
    wrap.append(card0);

    // 큐브 스킬 원 — 레벨에 따라 스킬 레벨이 오른다. **없는 칸은 아예 안 그린다**
    // (인게임에도 세 번째 칸을 쓰는 큐브가 없다 — 빈 동그라미만 남아 어수선했다).
    const icons = MAPS?.ui_icons?.cube_skill?.[c.cube_name] || [];
    const skInfo = MAPS?.ui_icons?.cube_skill_info?.[c.cube_name] || [];
    const lvs = MAPS?.ui_icons?.cube_levels?.[c.cube_name] || {};
    const ring = el("div", "cube-skills");
    for (let i = 0; i < 3; i++) {
      const lv = (lvs[`level${i + 1}`] || [])[Math.max(0, c.cube_lv - 1)] || 0;
      if (!lv) continue;
      const t = el("div", "cube-sk");
      const nfo = skInfo[i];
      // 설명의 {0}·{1}은 **지금 스킬 레벨의 수치**로 채운다
      const dsc = T(nfo?.desc || "").replace(/\{(\d+)\}/g, (m, k) => {
        const arr = nfo?.vals?.[Number(k)] || [];
        return arr[Math.max(0, lv - 1)] ?? arr[arr.length - 1] ?? m;
      });
      t.title = [nfo?.name && `${T(nfo.name)} (Lv.${lv})`, dsc]
        .filter(Boolean).join(String.fromCharCode(10)) || T("스킬 Lv.{lv}", { lv });
      const im = iconImg(icons[i], "cube-sk-img");
      if (im) t.append(im);
      t.append(el("span", "tile-lv", String(lv)));
      ring.append(t);
    }
    if (ring.childElementCount) wrap.append(ring);

    const st = MAPS?.cube_stats?.[String(c.cube_lv)] || { atk: 0, def: 0, hp: 0 };
    const stats = el("div", "cube-stats");
    for (const [ico, v] of [["공격", st.atk], ["방어", st.def], ["체력", st.hp]]) {
      const r = el("div", "cube-stat");
      r.append(el("span", "cube-stat-k", ico));
      r.append(el("b", null, Number(v).toLocaleString()));
      stats.append(r);
    }
    wrap.append(stats);

    // 고르개 둘은 라벨을 오른쪽 맞춤한 2열 격자로 — 칸 폭이 제각각이면 어수선하다
    const form = el("div", "cube-form");
    const names = Object.keys(MAPS?.ui_icons?.cube || {});
    if (names.length) {
      form.append(el("span", "cube-form-k", "종류"));
      form.append(selectEl(names.map((n) => [n, n]), c.cube_name || names[0],
        (v) => coopSet(() => { c.cube_name = v; })));
    }
    form.append(el("span", "cube-form-k", "레벨"));
    form.append(selectEl(Array.from({ length: 16 }, (_, i) => [i, i ? `${i}` : T("없음")]),
      c.cube_lv, (v) => coopSet(() => { c.cube_lv = Number(v); })));
    wrap.append(form);

    // 큐브는 **종류가 전투력에 영향이 없다** — 17종 전부 스탯·계수 배열이 같다(실측)
    wrap.append(el("p", "cube-note",
      T("큐브는 종류와 무관합니다 — 전투력에는 레벨만 들어갑니다.")));
    pane.append(wrap);
  }
}

function group(label, nodes) {
  const g = el("div", "grp");
  g.append(el("span", "grp-label", label));
  for (const n of [].concat(nodes)) g.append(n);
  return g;
}
function stepsEl(n, f) {
  const wrap = el("div", "steps");
  for (let i = 0; i < n; i++) {
    const s = f(i);
    const b = el("button", "step" + (s.on ? " on" : "") + (s.star ? " star" : ""), s.label);
    b.type = "button";
    // 못 바꾸는 자리 — 출시 전 니케의 스킬 레벨처럼 값이 못 박힌 경우다. 눌리지도, 잡히지도 않는다.
    if (s.off) { b.disabled = true; b.classList.add("off"); }
    b.onclick = s.onclick;
    if (s.title) b.title = s.title;
    wrap.append(b);
  }
  return wrap;
}
/** 오버로드 단계 고르개 — **펼쳤을 때만** 단계마다 수치를 함께 보여 준다.
 *  닫힌 상자는 좁아야 오른쪽 칸(장비 효과)이 안 밀리므로, 여는 순간 라벨을 늘렸다가
 *  고르거나 빠져나오면 숫자만 남긴다. 목록 폭은 브라우저가 가장 긴 항목에 맞춘다. */
function olLevelHints(sel, key) {
  const wide = () => {
    for (const o of sel.options) o.textContent = T("{value}단계 · {v}%", { value: o.value, v: pct(key, Number(o.value)).toFixed(2) });
  };
  const narrow = () => { for (const o of sel.options) o.textContent = o.value; };
  sel.addEventListener("pointerdown", wide);   // 목록이 열리기 전에 끼어든다
  sel.addEventListener("keydown", wide);
  sel.addEventListener("change", narrow);
  sel.addEventListener("blur", narrow);
}

function selectEl(opts, value, onchange, disabled = false) {
  const s = el("select");
  for (const [v, label] of opts) {
    const o = el("option", null, label);
    o.value = String(v);
    s.append(o);
  }
  s.value = String(value);
  s.disabled = disabled;
  s.onchange = () => onchange(s.value);
  return s;
}
function rowSelect(label, opts, value, onchange) {
  const r = el("div", "grp-row");
  r.append(el("span", "ol-part", label));
  r.append(selectEl(opts, value, onchange));
  return r;
}

// ── 필터 패널 (인게임 정렬/필터 구조) ───────────────────────────────────
function buildFilters() {
  sortRow();
  // 버스트 필터도 카드와 같은 인게임 글리프를 쓴다 — 한쪽만 글자면 두 표기가 어긋난다
  multiRow("#f-burst", "burst",
           [["1", ""], ["2", ""], ["3", ""], ["A", ""]], "sq sq-burst",
           (v) => BURST_ICON[v]);
  const have = (k) => new Set(ROSTER.map((r) => r[k]));
  multiRow("#f-class", "cls",
    CLASS_ORDER.filter((v) => have("cls").has(v)).map((v) => [v, v]));
  multiRow("#f-element", "element",
    CODE_ORDER.filter((v) => have("element").has(v)).map((v) => [v, v]));
  multiRow("#f-weapon", "weapon",
    WEAPONS.filter((w) => ROSTER.some((r) => r.weapon === w)).map((v) => [v, v]));
  multiRow("#f-corp", "corp",
    CORP_ORDER.filter((v) => have("corp").has(v)).map((v) => [v, v]));
  // 계산 정확도 — 로스터에 실제로 있는 딱지만 낸다(«검증됨»은 딱지가 없는 것이다).
  {
    curFilter().acc ||= [];              // 옛 저장분에는 없다
    const has = new Set(ROSTER.map((r) => r.status || "verified"));
    multiRow("#f-acc", "acc",
      ACC_ORDER.filter((v) => has.has(v)).map((v) => [v, T(ACC_LABEL[v])]));
  }
  const fi = $("#f-favitem");
  if (fi) {
    fi.classList.toggle("on", curFilter().favItem);
    fi.onclick = () => {
      const f = curFilter();
      f.favItem = !f.favItem;
      fi.classList.toggle("on", f.favItem);
      syncFilterChrome(); saveAll(); renderPools();
    };
  }
  syncFilterChrome();
}

// 숫자로 세는 정렬은 «큰 값부터»가 자연스럽고, 이름은 «가나다순»이 자연스럽다.
// 정렬을 새로 고를 때 그 방향을 기본으로 준다 (같은 칩을 다시 누르면 뒤집힌다).
const DESC_FIRST = new Set(["combat", "elem", "elematk"]);

/** 정렬은 하나만 고른다 (해제 없음). 트리거에 현재 정렬 이름이 뜬다. */
function sortRow() {
  const wrap = $("#f-sort");
  wrap.textContent = "";
  for (const [v, label] of SORTS) {
    const on = curFilter().sort === v;
    const b = el("button", `chip chip-sort${on ? " on" : ""}`
      + (on && curFilter().asc !== false ? " asc" : ""), label);
    b.type = "button";
    // 인게임과 같다: 다른 칩을 누르면 그 기준으로, **같은 칩을 다시 누르면 방향이 뒤집힌다.**
    b.onclick = () => {
      const f = curFilter();
      if (f.sort === v) f.asc = f.asc === false;
      else { f.sort = v; f.asc = !DESC_FIRST.has(v); }
      sortRow();
      syncFilterChrome();
      saveAll(); renderPools();
    };
    wrap.append(b);
  }
}

/** 다중 선택 칩 줄. 누르면 켜지고 다시 누르면 꺼진다 — 아무것도 안 켜면 필터 없음. */
function multiRow(sel, key, opts, cls = "chip", icon = null) {
  const wrap = $(sel);
  if (!wrap) return;
  wrap.textContent = "";
  for (const [v, label] of opts) {
    const b = el("button", cls + (curFilter()[key].includes(v) ? " on" : ""), label);
    b.type = "button";
    // 아이콘 훅 — 글자 대신 인게임 글리프를 넣는 줄(버스트)이 쓴다
    const file = icon && icon(v);
    if (file) {
      const im = el("img");
      im.src = `image/icon/${file}`;
      im.alt = ""; im.draggable = false;
      b.append(im);
      b.title = T("버스트 {v}", { v });
    }
    b.onclick = () => {
      const arr = curFilter()[key];
      const i = arr.indexOf(v);
      if (i === -1) arr.push(v); else arr.splice(i, 1);
      b.classList.toggle("on", arr.includes(v));
      syncFilterChrome();
      saveAll(); renderPools();
    };
    wrap.append(b);
  }
}

/** 트리거 라벨·비우기 노출·즐겨찾기 버튼 상태를 필터 상태와 맞춘다. */
function syncFilterChrome() {
  const f = curFilter();
  const label = Object.fromEntries(SORTS)[f.sort] || T("전투력");
  // 트리거는 **패널 안의 필터만** 센다. 버스트와 즐겨찾기는 위쪽 바에 제 버튼이 있고
  // 켜지면 그 버튼이 파래지므로, 트리거까지 물들이면 무엇이 걸렸는지 되레 헷갈린다.
  const n = f.cls.length + f.element.length + f.weapon.length + f.corp.length
    + (f.favItem ? 1 : 0);
  // 트리거는 인게임처럼 **항상 강조색**이다. 필터가 걸려 있으면 개수를 함께 보여 준다.
  $("#f-trig-label").textContent = n ? `${label} · ${n}` : label;
  const dir = $("#f-dir");
  if (dir) {
    dir.textContent = f.asc === false ? "▼" : "▲";
    dir.title = f.asc === false ? T("내림차순 — 눌러서 오름차순") : T("오름차순 — 눌러서 내림차순");
  }
  $("#f-toggle-wrap").classList.toggle("filtered", n > 0);
  $("#f-toggle").classList.toggle("filtered", n > 0);
  // 비우기는 **패널을 연 동안에만** 보인다. 평소에 떠 있으면 로스터 위에 떠서
  // 카드를 가리고, 무엇을 비우는 버튼인지도 문맥 없이 읽힌다.
  $("#f-clear").hidden = !n || $("#fpanel").hidden;
  const fav = $("#f-fav");
  fav.classList.toggle("on", f.favOnly);
  fav.setAttribute("aria-pressed", String(f.favOnly));
  const only = $("#f-parsed");
  if (only) only.classList.toggle("on", f.parsed);

}

// ── 컨트롤 (고급) ───────────────────────────────────────────────────────
// 계산기가 재현하는 컨트롤은 `context/CONTROL.md`가 정본이다. 여기서는 그중
// **정책으로 켜고 끄는 것**만 다룬다 (명시 시퀀스는 UI로 만들 물건이 아니다).
// 톡톡이·홀드는 차지형(SR·RL) 전용이라 그 무기군에만 줄이 뜬다.
const CHARGE_WEAPONS = new Set(["SR", "RL"]);
const TAP_RATES = [["3.0", T("3.0 (미숙련)")], ["3.3", "3.3"], ["3.6", T("3.6 (숙련)")],
                   ["3.9", "3.9"], ["4.2", T("4.2 (상한)")]];
// 장전컨이 «몇 초 앞서» 엄폐를 시작하나. 코어 기본값과 같아야 한다
// (nikke-calc-rust `timeline/mod.rs` RELOAD_LEAD_DEFAULT). 다르면 화면이 «0.3»을
// 보여 주면서 실제로는 다른 값으로 도는 일이 난다.
const RELOAD_LEAD_DEFAULT = 0.3;
const RELOAD_POLICIES = [["before_fb_end", T("풀버스트 종료 전")],
                         ["into_fb", T("풀버스트 안으로")]];

/** 이 덱에서 계산에 보낼 컨트롤. 슬롯에 없는 이름과 빈 설정은 버린다. */
function ctrlPayload(d) {
  const out = {};
  for (const n of d.names.filter(Boolean)) {
    const c = d.control?.[n];
    if (c && Object.keys(c).length) out[n] = c;
  }
  return Object.keys(out).length ? out : null;
}

function setCtrl(name, key, value, deck = null) {
  // `deck`을 주면 **그 덱에** 쓴다. 안 주면 지금까지대로 «보고 있는 덱»을 찾는다
  // (`ctrlDeck`). 배치모드는 25칸이 한 화면이라 줄마다 버튼이 있는데, 그 버튼이
  // 고른 덱과 «지금 고른 덱»이 다르다 — 실측으로 **남의 덱에 컨트롤이 새겨졌다**
  // (2덱 줄에서 적용했더니 1덱에 없는 니케의 금지가 생겼다). 유니온도 같은 구조다.
  const d = deck || ctrlDeck(name);
  d.control ||= {};
  const c = (d.control[name] ||= {});
  if (value == null) delete c[key];
  else c[key] = value;
  if (!Object.keys(c).length) delete d.control[name];
  saveAll(); buildControl(); refreshSlots(); renderResults();
}

function ctrlToggle(name, key, on, make) {
  setCtrl(name, key, on ? make() : null);
}

// 버스트 주기를 직접 입력하는 중인 니케 — 유효한 값이 들어오기 전까지는 저장하지
// 않으므로, 칩이 켜진 상태를 저장값과 별개로 들고 있어야 한다.
// «주기를 안 쓴다»를 나타내는 값. **서버 계약과 같은 글자여야 한다** — clean.ts가
// 이 문자열만 `null`(주기 없음)로 바꿔 코어에 넘긴다.
const NO_PATTERN = "안 씀";
// «후버» — 코어의 `defer` 토큰. 발사 판정에는 끼지 않고 **정렬만 최후순위로** 민다:
// 같은 단계에 다른 후보가 있으면 그쪽이 먼저 쓰고, 아무도 없으면 평소처럼 쓴다.
// 자리 순서(왼쪽이 먼저)로는 표현되지 않는 값이라 칩으로 둔다.
const DEFER = "defer";
let patDraft = null;

/** 레이어가 이 편성에서 실제로 걸어 주는 주기 — 없으면 null.
 *
 *  로스터의 `pattern_auto`(build.py가 `char_defaults`에서 굽는다)를 코어 `when_ok`와
 *  **같은 어휘로** 읽는다. 화면이 이걸 알아야 주기 칩을 «자동»으로 켜 둔 채 보여 줄 수
 *  있다 — 안내 문장만 있고 칩이 꺼져 있으면 걸린 줄을 모른다(유저 지적 2026-08-30).
 *  판단이 코어와 갈리면 화면이 거짓말을 하므로, 조건 이름을 하나라도 모르면 **없는 셈
 *  친다**(모르는 채로 켜는 것보다 안 켜는 쪽이 덜 틀린다). */
function autoPattern(name, d) {
  const pa = byName.get(name)?.pattern_auto;
  if (!pa || !d) return null;
  const names = (d.names || []).filter(Boolean);
  if (!names.includes(name)) return null;
  const stageOf = (n) => byName.get(n)?.burst;
  // 같은 단계의 다른 동료 — 코어 `same_stage_others`. «A»(전 단계)는 아무 단계와도 같다.
  const sameStage = () => {
    const mine = stageOf(name);
    return names.filter((n) => n !== name && (stageOf(n) === mine || stageOf(n) === "A" || mine === "A"));
  };
  const ok = (cond) => Object.entries(cond || {}).every(([k, v]) => {
    switch (k) {
      case "with_member":     return Array.isArray(v) && v.some((m) => names.includes(m));
      case "with_member_all": return Array.isArray(v) && v.every((m) => names.includes(m));
      case "same_stage_other": return (sameStage().length > 0) === Boolean(v);
      case "same_stage_cd_max": return sameStage().some((n) => (byName.get(n)?.cd ?? 1e9) <= v);
      case "position":        return names.indexOf(name) + 1 === v;
      default:                return false;      // 모르는 조건 — 켜지 않는다
    }
  });
  if (pa.when && !ok(pa.when)) return null;
  for (const r of pa.rules || []) if (ok(r.when)) return r.use;
  return pa.use;
}

/** "1,3,5" 같은 사이클 나열 → 계산기가 받는 값. 못 읽으면 null.
 *  «3의 배수» 같은 말로 된 입력은 받지 않는다 — 형식이 하나면 헷갈릴 게 없다.
 *  배수로 굴리고 싶으면 사이클을 그대로 나열하면 된다 (3,6,9,12…). */
function parsePattern(text) {
  const t = (text || "").trim();
  const xs = t.split(/[,\s]+/).filter(Boolean);
  if (!xs.length || !xs.every((x) => /^\d+$/.test(x))) return null;
  const ns = [...new Set(xs.map(Number))].sort((a, b) => a - b);
  return ns.length <= 40 && ns.every((n) => n >= 1 && n <= 999) ? ns : null;
}

// ── 주기 겹침 검사 ─────────────────────────────────────────────────────────
// 같은 버스트 단계의 두 명이 같은 사이클을 지정하면 그 사이클엔 한 명만 나간다 —
// 지정은 «시간표»라서 겹침은 입력 실수다. 저장하기 전에 막고 어디가 겹치는지 말해 준다.
// (자동으로 걸리는 패턴과는 비교하지 않는다 — 자동은 계산기가 조건을 보고 알아서 피한다.)
const PAT_HORIZON = 40;          // every:N을 펼쳐 볼 사이클 상한

/** 프리셋 이름이면 로스터에 실린 값으로 푼다. 날값은 그대로. */
function resolvePat(name, v) {
  if (typeof v === "string" && !v.startsWith("every:")) {
    return (byName.get(name)?.patterns || {})[v] ?? null;
  }
  return v;
}

function patternCycles(v) {
  if (Array.isArray(v)) return new Set(v);
  if (typeof v === "string" && v.startsWith("every:")) {
    const n = Number(v.slice(6));
    const out = new Set();
    for (let c = n; n >= 1 && c <= PAT_HORIZON; c += n) out.add(c);
    return out;
  }
  return null;
}

/** 이 덱에서 `name`에게 `value`를 지정하면 누구와 겹치나. 없으면 null. */
function patternConflict(name, value) {
  // **그 니케가 들어 있는 덱**을 본다. `deckOf(state.settings.deck)`(=솔로의 지금 덱)을
  // 보고 있었는데, 유니온에서는 그게 전혀 다른 편성이다 — 유니온 줄에서 주기를 걸면
  // **솔로 덱에 있는 남의 주기와 겹친다**며 막혔다. 화면에는 이유도 안 떴으므로
  // (아래 ② — 경고 자리가 딴 데 붙어 있었다) 그냥 «안 눌린다»로 보였다.
  // 사용자 제보: 「유레 탭에서 버스트 주기가 수정이 안 되네. select 변경이 안 되고,
  // 직접 입력으로 채워도 저장이 안 됨」. 실측으로 재현했다 —
  // `patternConflict("미란다","전담")` → `{who:"토브"}`인데 토브는 솔로 덱에만 있었다.
  const d = ctrlDeck(name);
  const me = byName.get(name);
  const mine = patternCycles(resolvePat(name, value));
  if (!me || !mine) return null;
  for (const other of d.names.filter(Boolean)) {
    if (other === name) continue;
    const v = d.control?.[other]?.burst_pattern;
    if (v == null || v === "안 씀") continue;
    const or = byName.get(other);
    if (!or) continue;
    if (!(me.burst === or.burst || me.burst === "A" || or.burst === "A")) continue;
    const theirs = patternCycles(resolvePat(other, v));
    if (!theirs) continue;
    const hit = [...mine].filter((c) => theirs.has(c)).sort((a, b) => a - b);
    if (hit.length) return { who: other, cycles: hit.slice(0, 6) };
  }
  return null;
}

/** 겹치면 경고를 띄우고 true. 저장은 부른 쪽이 건너뛴다. */
function patWarnIf(name, value) {
  const conflict = patternConflict(name, value);
  const w = $("#ctrl-panel .ctrl-pat-warn");
  if (w) {
    w.hidden = !conflict;
    if (conflict) {
      w.textContent = T("{who}의 주기와 겹칩니다 — ", { who: conflict.who })
        + T("{v}번째 풀버스트를 둘 다 지정했습니다.", { v: conflict.cycles.join("·") });
    }
  }
  return !!conflict;
}

/** 저장된 주기 → 입력칸 표기. parsePattern의 역방향이다. */
function patternText(v) {
  if (Array.isArray(v)) return v.join(",");
  if (typeof v === "string" && v.startsWith("every:")) return v.slice(6) + T("의 배수");
  return String(v ?? "");
}

function buildControl() {
  const wrap = $("#ctrl-panel");
  if (!wrap) return;
  const open = ctrlName();
  const d = ctrlDeck(open);
  const name = open && d.names.includes(open) ? open : null;
  wrap.hidden = !name;
  wrap.textContent = "";
  if (!name) return;

  const c = d.control?.[name] || {};
  const rec = byName.get(name);
  const charge = CHARGE_WEAPONS.has(rec?.weapon);
  // 동료 조건이 맞으면 레이어가 자동으로 거는 컨트롤(예: 미란다와 있으면 미하라 엄폐컨).
  // 켜진 채 «자동» 표식으로 보여 주고, 누르면 **이 편성에서만** 해제한다 — 저장값에
  // 명시적 false를 남기면 서버 정제가 통과시키고 엔진 양쪽이 «꺼짐»으로 읽는다.
  // 해제하면 «전부 자동»이 꺼진 상태가 되므로, 그 버튼으로 통째로 자동에 복귀한다.
  // web/build.py `_forced_control` 참고 (`all`: with_member_all=전원, 아니면 하나라도).
  const forced = (rec?.forced_control || [])
    .filter((r) => !r.with.length || (r.all
      ? r.with.every((n) => d.names.includes(n))
      : r.with.some((n) => d.names.includes(n))));
  const forcedKey = (key) => forced.find((r) => r.key === key);
  const autoTag = (chip) => {
    chip.classList.add("forced");
    chip.append(el("span", "ctrl-auto-tag", T("자동")));
  };
  // 자동 칩 공통 툴팁 꼬리 — 지금 상태에 따라 «끄는 법»/«되돌리는 법»을 잇는다.
  const autoTip = (rule, on) => rule.note + " "
    + (on ? T("누르면 이 편성에서만 끕니다. ") : T("지금은 꺼 두었습니다 — 누르면 다시 자동으로 걸립니다. "));

  const head = el("div", "ctrl-head");
  head.append(el("b", null, name));
  head.append(el("span", null, T("{v} · 컨트롤", { v: rec?.weapon || "" })));
  // 「전부 자동」은 **누르는 버튼이자 켜져 있는 상태**다. 아무것도 안 켰을 때
  // 회색으로 죽여 두면 «못 누른다»로 읽혀서, 지금이 자동인지 아닌지가 안 보였다.
  // 아래 칩들과 같은 언어로 — 아무것도 안 켜져 있으면 이쪽에 불이 들어온다.
  const auto = !Object.keys(c).length;
  const off = mkBtn(T("전부 자동"), `ctrl-auto${auto ? " on" : ""}`, () => {
    if (auto) return;
    delete d.control?.[name];
    saveAll(); buildControl(); refreshSlots(); renderResults();
  });
  off.setAttribute("aria-pressed", String(auto));
  off.title = auto ? T("지금 전부 자동입니다") : T("이 니케의 컨트롤을 모두 끕니다");
  head.append(off);
  wrap.append(head);

  const opts = el("div", "ctrl-opts");
  if (charge) {
    const tapForced = forcedKey("tap_fire");
    const tapOn = c.tap_fire === false ? false : (tapForced ? true : !!c.tap_fire);
    const tapChip = ctrlCheck(T("톡톡이"), tapOn, (on) => {
      if (tapForced) setCtrl(name, "tap_fire", on ? null : false);
      else ctrlToggle(name, "tap_fire", on, () => ({ rate: 3.6, release: 0.03 }));
    },
      (tapForced ? autoTip(tapForced, tapOn) : "")
      + T("차지를 끝까지 하지 않고 짧게 눌렀다 떼기를 반복합니다 — ")
      + T("발당 대미지는 낮지만 발사 횟수가 늘어납니다 (차지형 전용)"));
    if (tapForced && tapOn) autoTag(tapChip);
    opts.append(tapChip);
    if (tapOn && (c.tap_fire || tapForced)) {
      // 자동 상태에서는 레이어 값(연사 속도)을 보여 주고, 바꾸면 직접 지정이 된다.
      const cur = c.tap_fire || tapForced?.value || {};
      opts.append(selectEl(TAP_RATES, String(cur.rate ?? 3.6), (v) =>
        setCtrl(name, "tap_fire", { ...cur, rate: Number(v) })));
    }
  }
  // 장전 계열은 한 키(reload)를 두 칩이 나눠 쓴다 — 자동(레이어) 탄충 취소를 해제한
  // 표식도 reload: false 하나다. 켬 동작은 false 위에 dict를 덮으므로 그대로 동작한다.
  const reloadForced = forcedKey("reload");
  const cancelAuto = !!(reloadForced?.value?.cancel_on_full);
  opts.append(ctrlCheck(T("장전컨"), !!c.reload?.policy, (on) =>
    setCtrl(name, "reload", on
      ? { ...(c.reload || {}), policy: "before_fb_end" }
      : (c.reload?.cancel_on_full ? { cancel_on_full: true } : null)),
    T("엄폐로 재장전을 유리한 버프 구간에 밀어 넣습니다 — ")
    + T("버프가 없는 시간에 장전을 끝내 두는 컨트롤입니다")));
  if (c.reload?.policy) {
    const rsel = selectEl(RELOAD_POLICIES, c.reload.policy, (v) =>
      setCtrl(name, "reload", { ...c.reload, policy: v }));
    // 제보(영어) — «풀버스트»가 이 니케 본인이 아니라 다른 3버 니케 얘기인 줄 알았다고 함. 그 오해를
    // 첫 줄에서 바로 잡는다(코어 확인 2026-09-03, timeline/char_state.rs).
    rsel.title = T("«풀버스트»는 이 니케가 3버인지와 무관하게, 스쿼드가 B1→B2→B3를 순서대로 쏜 뒤의 강화 구간을 뜻합니다. «풀버스트 종료 전»은 그 구간이 끝나기 0.3초 전에 엄폐해 재장전을 마쳐, 구간이 끝난 뒤 이어지는 사격을 가득 찬 탄창으로 시작합니다. «풀버스트 안으로»는 다음 풀버스트가 열리는 순간 재장전이 막 끝나도록 미리 엄폐해, 풀버스트 첫 발을 가득 찬 탄창으로 쏩니다 — 첫 사이클은 예측할 대상이 없어 두 번째 풀버스트부터 걸립니다.");
    opts.append(rsel);
    // 몇 초 앞서 장전할지. 기본 0.3초는 «풀버스트가 끝나는 순간 장전이 시작»에 가깝지만,
    // 니케에 따라 더 일찍 시작해야 이득인 경우가 있다 — 풍아스카(아스카 : WILLE)는 섬멸
    // 태세가 끝날 때 강제 재장전 + 예열 속도 -100%(3초)가 걸리는데, **그때 이미 장전
    // 중이면 강제 재장전이 통째로 건너뛰어진다**(코어 timeline/mod.rs `force_reload`).
    // 섬멸 태세는 9초라 풀버스트(10초)보다 먼저 끝나므로 0.3초로는 못 걸친다.
    // 실측(180초·기대값): 0.3초 대비 1.2초 +3.87%, 1.5초 +4.66% (제보 2026-09-04).
    if (c.reload.policy === "before_fb_end") {
      const lead = Number(c.reload.lead ?? RELOAD_LEAD_DEFAULT);
      const n = el("input", "ctrl-at ctrl-lead");
      n.type = "number"; n.min = "0"; n.max = "5"; n.step = "0.1";
      n.inputMode = "decimal";
      n.value = lead.toFixed(1);
      n.title = T("풀버스트가 끝나기 몇 초 전에 엄폐해 장전을 시작할지. 기본 0.3초입니다.")
        + " " + T("장전이 끝나는 시점이 아니라 시작하는 시점입니다 — 장전이 긴 니케는 더 일찍 잡아야 합니다.");
      n.onchange = () => {
        const v = Math.round(Math.min(5, Math.max(0, Number(n.value) || 0)) * 10) / 10;
        // 기본값이면 키를 아예 안 남긴다 — 기본을 실어 보내면 요청 지문이 달라져
        // «안 건드렸는데 결과가 새로 계산»되는 일이 생긴다(무기 전환 칸과 같은 규칙).
        const r = { ...c.reload };
        if (v === RELOAD_LEAD_DEFAULT) delete r.lead; else r.lead = v;
        setCtrl(name, "reload", r);
      };
      const wrap = el("span", "ctrl-at-wrap");
      wrap.append(n, el("span", "ctrl-at-em", T("초 전에 장전")));
      opts.append(wrap);
    }
  }
  const cancelOn = c.reload === false ? false
    : (c.reload?.cancel_on_full ?? cancelAuto);
  const cancelChip = ctrlCheck(T("탄충 취소"), !!cancelOn, (on) => {
    if (cancelAuto && !c.reload) { setCtrl(name, "reload", on ? null : false); return; }
    setCtrl(name, "reload", on
      ? { ...(c.reload || {}), cancel_on_full: true }
      // 직접 지정(장전컨 등)이 남아 있으면 그 안에서 탄충 취소만 끈다 — 레이어가
      // 켠 값은 키를 지우는 걸로는 안 꺼지므로(병합이 레이어 위에 얹힌다) false를 쓴다.
      : (c.reload?.policy
        ? { ...c.reload, cancel_on_full: cancelAuto ? false : undefined }
        : (cancelAuto ? false : null)));
  },
    (reloadForced && cancelAuto ? autoTip(reloadForced, !!cancelOn) : "")
    + T("재장전 중에 스킬의 탄환 충전으로 탄창이 차면 재장전을 끊고 바로 사격합니다"));
  if (cancelAuto && cancelOn && !c.reload) autoTag(cancelChip);
  opts.append(cancelChip);
  // 자동(레이어) 컨트롤이 있는 키는 세 상태를 오간다: 자동 켜짐(저장값 없음) ·
  // 해제(저장값 false — 이 편성에서만 끈다) · 직접 켬(저장값 dict, 자동이 없는 캐릭터).
  // 자동 켜짐에서 누르면 false를 남기고, 해제 상태에서 누르면 그 표식을 지워 자동으로
  // 돌아간다 — 서버 정제(clean)가 false를 통과시키고 엔진 양쪽이 «꺼짐»으로 읽는다.
  const coverForced = forcedKey("cover");
  const holdForced = charge ? forcedKey("hold") : null;
  const coverOn = c.cover === false ? false : (coverForced ? true : !!c.cover);
  const coverChip = ctrlCheck(T("버스트 엄폐컨"), coverOn, (on) => {
    if (on && charge) setCtrl(name, "hold", holdForced ? false : null);
    if (coverForced) setCtrl(name, "cover", on ? null : false);
    else ctrlToggle(name, "cover", on, () => ({ policy: "own_full_burst" }));
  },
    (coverForced ? autoTip(coverForced, coverOn) : "")
    + T("본인 버스트 사이클의 풀버스트 동안 엄폐해 한 발도 쏘지 않습니다 — ")
    + T("발수로 소모되는 버프를 일반 공격에 낭비하지 않으려는 컨트롤입니다")
    + (charge ? T(" (차지형은 홀드가 낫습니다 — 켜면 홀드가 꺼집니다)") : ""));
  if (coverForced && coverOn) autoTag(coverChip);
  opts.append(coverChip);
  if (charge) {
    const holdOn = c.hold === false ? false : (holdForced ? true : !!c.hold);
    const holdChip = ctrlCheck(T("홀드"), holdOn, (on) => {
      if (on) setCtrl(name, "cover", coverForced ? false : null);
      if (holdForced) setCtrl(name, "hold", on ? null : false);
      else ctrlToggle(name, "hold", on, () => ({ policy: "own_full_burst", lead: 0.5 }));
    },
      (holdForced ? autoTip(holdForced, holdOn) : "")
      + T("풀차지 후 떼지 않고 들고 있다가 자기 풀버스트 안에서 발사합니다 — ")
      + T("버프와 차지 배율을 센 한 방에 몰아줍니다 (차지형 전용, 엄폐컨보다 유리 — 켜면 엄폐컨이 꺼집니다)"));
    if (holdForced && holdOn) autoTag(holdChip);
    opts.append(holdChip);
  }
  // 버스트 운용도 같은 줄에 잇는다 — `.ctrl-opts`가 flex-wrap이라 칸이 모자라면
  // 알아서 내려간다.
  //
  // **«선버스트» 칩은 없앴다** (2026-08-27). 같은 단계에서 누가 먼저 나가는지는 이제
  // **편성 자리**가 정한다 — 왼쪽에 선 니케가 먼저다. 인게임 오토 버스트와 같은
  // 규칙이라 따로 배울 것이 없고, 「한 명만 켤 수 있다」 같은 규약도 사라진다.
  // 순서를 바꾸려면 카드를 끌어 자리를 옮기면 된다(버스트 비교도 그렇게 적용한다).

  // 버스트 금지 — 그 니케만 버스트 후보에서 뺀다. «버스트 주기»가 «언제 쓸지»를
  // 정하는 것과 달리 이건 «아예 안 쓴다»다. 쿨이 돌아온 서브딜러가 끼어들어 원하지
  // 않는 단계를 채우는 편성(토브·솔린 덱 등)에서 쓴다. 주기와 같이 켤 이유가 없어
  // 켜면 주기를 끈다.
  // 무기 모드 전환 — **손으로 바꾸는 니케에게만** 뜬다(로스터 `mode_swap`). 열둘은
  // 버스트로 저절로 바뀌므로 고를 것이 없고, 재장전으로 도는 것은 지금 수렐 하나다.
  //
  // 전환 한 번에 **수동 재장전 두 번**이 든다(재장전 → 한 발 쏘고 → 재장전). 그래서
  // «언제 시작할지»가 딜을 가른다. 코어는 어느 쪽이든 **풀버스트 중에는 안 걸고 끝난
  // 뒤로 미룬다** — 재장전으로 풀버스트 딜창을 버리지 않게(계약 2026-08-28).
  if (rec?.mode_swap) {
    const ms = c.weapon_mode_swap;
    const msOn = ms === true || (ms && typeof ms === "object");
    const atNow = ms && typeof ms === "object" && ms.at != null ? Number(ms.at) : null;
    opts.append(ctrlCheck(T("변환 모드"), msOn, (on) => {
      setCtrl(name, "weapon_mode_swap", on ? { policy: "battle_start" } : null);
    }, T("저격 모드로 바꿉니다 — 전환 한 번에 수동 재장전이 두 번 듭니다")));
    if (msOn) {
      const sel = selectEl([["battle_start", T("전투 시작하자마자")], ["at", T("직접 지정")]],
        atNow == null ? "battle_start" : "at", (v) => {
          setCtrl(name, "weapon_mode_swap",
            v === "at" ? { at: atNow ?? 30 } : { policy: "battle_start" });
        });
      opts.append(sel);
      if (atNow != null) {
        const n = el("input", "ctrl-at");
        n.type = "number"; n.min = "0"; n.max = "3600"; n.step = "0.1";
        n.inputMode = "decimal";
        n.value = atNow.toFixed(1);
        n.title = T("이 시각부터 전환을 시작합니다 — 풀버스트와 겹치면 끝난 뒤로 미룹니다");
        n.onchange = () => {
          const v = Math.round(Math.max(0, Number(n.value) || 0) * 10) / 10;
          setCtrl(name, "weapon_mode_swap", { at: v });
        };
        // 숫자칸과 단위는 **한 덩어리다.** 따로 넣으면 `.ctrl-opts`가 flex-wrap이라
        // 자리가 모자랄 때 «초부터»만 다음 줄로 떨어진다(실측).
        const wrap = el("span", "ctrl-at-wrap");
        wrap.append(n, el("span", "ctrl-at-em", T("초부터")));
        opts.append(wrap);
      }
    }
  }

  // (실험실) «풀차지 래치» 칸은 **없앴다**(2026-08-30). 그 ×2의 정체가 밝혀졌다 —
  // 원인 미상의 래치가 아니라 **보스전 버스트 게이지 ×2**였고, 시전자가 한 대라도
  // 맞히면 자동으로 걸린다. 사람이 고를 것이 아니어서 코어가 `control.gauge_latch`를
  // 아예 안 본다(상용 실측: 키를 넣으나 빼나 총딜 +0.000%).

  // (실험실) 인접 HP 펄스 — **옆 아군의 체력을 보고 걸리는 스킬**이 있는 니케에게만.
  //
  // **이제는 백업이다.** 코어가 인게임 판정(최대 체력이 오르면 표시 HP%가 내려가고,
  // 그게 90 이하로 떨어지면 발동)을 그대로 쓰므로 사슬은 **컨트롤 없이 기본으로**
  // 걸린다(코어 2026-08-30). 인게임에 존재할 수 있는 로스터에서는 체력 격차가 최악
  // (명함 플로라 vs 풀코 방어형 이웃)이어도 1.217배라, 스킬1이 6레벨만 넘으면 자리와
  // 무관하게 늘 걸린다 — 커뮤 공략의 «7스 이상 무조건»과도 맞는다(코어 세션 분석
  // 2026-08-30). 안 걸리는 경우는 레벨을 극단적으로 벌려 손으로 넣었을 때뿐이다.
  // 남겨 두는 이유는 «피격 상시»를 가정하고 싶을 때가 있어서다 — 인게임에서는 계속
  // 맞으므로 체력이 실제로 깎이지만 계산기에는 피격 모델이 자체가 없다.
  // 실측(2026-08-30, 코어 두 판 대조): 기본 편성 5종 중 켜고 끄고가 값을 바꾼 것은 0종.
  if (rec?.hp_pulse) {
    const cur = Number(c.adjacent_hp_pulse) || 0;
    opts.append(ctrlCheck(T("인접 HP 펄스"), cur > 0, (on) => {
      setCtrl(name, "adjacent_hp_pulse", on ? 10 : null);
    }, T("옆 아군이 이 주기마다 피격된 것으로 칩니다. 사슬은 이제 컨트롤 없이 기본으로 걸리므로 평소에는 켤 필요가 없습니다 — 인게임처럼 «계속 맞는 중»을 가정하고 싶을 때만 쓰는 백업입니다. 보호막이 10초 유지라 10초 이하면 사실상 상시입니다")));
    if (cur > 0) {
      const n = el("input", "ctrl-at");
      n.type = "number"; n.min = "1"; n.max = "60"; n.step = "1";
      n.inputMode = "numeric";
      n.value = String(cur);
      n.title = T("몇 초마다 맞은 것으로 칠지 — 10초를 권합니다");
      n.onchange = () => {
        const v = Math.min(60, Math.max(1, Math.round(Number(n.value) || 10)));
        setCtrl(name, "adjacent_hp_pulse", v);
      };
      const wrap = el("span", "ctrl-at-wrap");
      wrap.append(n, el("span", "ctrl-at-em", T("초마다")));
      opts.append(wrap);
    }
  }

  // 파츠를 노리나. 기본은 «노린다»(1) — 인게임에서 보통 같이 때린다. 끄면 몸통만 친다:
  // 관통 유닛이 버스트까지 아끼거나, 특정 유닛만 파츠를 치게 하는 편성에서 쓴다.
  // 파츠가 있는 편성에서만 뜻이 있으므로 그때만 보여 준다.
  const hasParts = (battleFor(d).phases || []).some((p) => p.kind === "parts");
  if (hasParts) {
    opts.append(ctrlCheck(T("파츠 안 노림"), c.part_aim === 0, (on) => {
      setCtrl(name, "part_aim", on ? 0 : null);
    }, T("이 니케는 파츠를 노리지 않고 몸통만 칩니다 — 켜지 않으면 파츠를 노립니다")));
  }
  opts.append(ctrlCheck(T("버스트 금지"), c.no_burst === true, (on) => {
    if (on) {
      patDraft = null;
      setCtrl(name, "burst_pattern", null);
    }
    setCtrl(name, "no_burst", on ? true : null);
  }, T("이 니케는 버스트를 쓰지 않습니다 — 쿨이 돌아와도 다른 니케가 대신 씁니다")));

  const deferOn = c.burst_pattern === DEFER;
  // 후버 — 같은 단계에 다른 니케가 있으면 그쪽에 먼저 넘긴다. 자리 순서(왼쪽이
  // 먼저)와 다른 값이다: 자리는 «누가 먼저냐»만 정하는데, 후버는 **매 회차 최후순위**로
  // 밀려 다른 사람이 쓸 수 있는 한 안 쓴다. 같은 단계에 둘뿐이면 상대를 선버로 두는
  // 것과 결과가 같고, 셋 이상일 때 뜻이 갈린다(실측 2026-08-30: 3인 단계에서 총딜 5%).
  opts.append(ctrlCheck(T("후버"), deferOn, (on) => {
    if (on) patDraft = null;
    setCtrl(name, "burst_pattern", on ? DEFER : null);
  }, T("같은 단계에 다른 니케가 있으면 그쪽에 먼저 넘깁니다 — 아무도 못 쓰면 평소처럼 씁니다")));

  // 버스트 주기 — 모든 니케에 뜬다. 알려진 정석(카탈로그)이 있는 캐릭터는 그걸
  // 프리셋으로 주고, 나머지는 직접 입력한다. 켜기 전까지는 자동(조합에 따라 계산기가
  // 정함)이고, «안 씀» 같은 별도 해제 옵션은 없다 — 끄면 그게 자동이다.
  const presets = Object.keys(rec?.patterns || {});
  // 후버는 주기가 아니다 — 주기 칩이 켜진 것으로 보이면 고르개에 «직접»이 뜨고
  // 입력칸에 «defer»가 글자로 박힌다(«안 씀»에서 겪은 것과 같은 자리).
  // 재진입 대기 — **재진입이 실제로 걸리는 편성에서만** 뜬다: 재진입을 가진 니케이고
  // (로스터의 `reenter`, 데이터에서 굽는다) **같은 버스트 단계의 아군이 함께 있을 때**다.
  // 짝이 없으면 재진입 자체가 안 걸리므로(엔진 조건 `has_burst{N}_ally`) 칩을 내도
  // 아무 일도 안 한다 — 없는 선택지를 보여 주지 않는다(유저 지적 2026-08-31).
  // **기본이 켜짐**이라 끌 때만 저장한다 — 저장값 `reenter_wait: false`가 서버에서
  // `config_over.no_reenter_wait_chars`로 실려 간다(코어 계약 2026-08-31 PR#29).
  const sameStageAlly = () => {
    const mine = rec?.burst;
    return d.names.some((n) => {
      if (!n || n === name) return false;
      const st = byName.get(n)?.burst;
      return st === mine || st === "A" || mine === "A";
    });
  };
  if (rec?.reenter && sameStageAlly()) {
    opts.append(ctrlCheck(T("재진입 대기"), c.reenter_wait !== false, (on) => {
      setCtrl(name, "reenter_wait", on ? null : false);
    // 한 문장은 **한 열쇠**다 — `+`로 이으면 추출기가 앞 조각만 가져가 번역이 반쪽 난다.
    }, T("같은 단계 아군의 버스트 쿨타임을 기다렸다 시전해 재진입이 늘 걸리게 합니다 — 끄면 곧바로 시전하고, 쿨이 엇갈린 회차에서는 재진입이 무산됩니다")));
  }

  // 레이어가 이 편성에서 걸어 주는 주기 — 손으로 고른 것이 없을 때만 실제로 걸린다.
  // 걸려 있으면 칩을 **«자동» 표를 달고 켠 채** 보여 준다(엄폐컨 같은 자동 칩과 같은
  // 규약). 안 그러면 「프리카는 민트와 함께면 …」 안내만 있고 화면에는 아무 표시가 없어
  // 걸린 줄을 모른다(유저 지적 2026-08-30).
  const autoPat = autoPattern(name, d);
  const autoOn = autoPat !== null && c.burst_pattern === undefined && !deferOn;
  const patOn = (c.burst_pattern !== undefined && !deferOn) || patDraft === name || autoOn;
  const patChip = ctrlCheck(T("버스트 주기"), patOn, (on) => {
    if (on) {
      if (presets.length && !patternConflict(name, presets[0])) {
        patDraft = null;
        setCtrl(name, "burst_pattern", presets[0]);
      } else if (presets.length) {
        patDraft = name; buildControl(); patWarnIf(name, presets[0]);
      }
      else { patDraft = name; buildControl(); }   // 입력이 유효해질 때까지 저장하지 않는다
    } else {
      patDraft = null;
      // 자동으로 걸려 있던 것을 끄는 자리다 — `null`로 두면 레이어가 다시 걸어
      // 그대로 켜진다. 사람이 «안 걸겠다»고 말한 것은 «안 씀»으로 남긴다.
      setCtrl(name, "burst_pattern", autoOn ? NO_PATTERN : null);
    }
  }, autoOn
    ? T("이 편성에서는 «{v}» 주기가 자동으로 걸립니다 — 누르면 이 편성에서만 끕니다.", { v: T(autoPat) })
    : T("몇 번째 풀버스트에 버스트를 쓸지 정합니다 — 끄면 자동(조합에 따라 계산기가 정함)"));
  if (autoOn) {
    patChip.classList.add("forced");
    patChip.append(el("span", "ctrl-auto-tag", T("자동")));
  }
  opts.append(patChip);
  if (patOn) {
    // «안 씀»은 **고르개에 있는 값**이지 직접 입력이 아니다. 프리셋 목록에 없다는
    // 이유로 «직접»으로 몰면 입력칸이 열리고 거기에 «안 씀»이 글자로 박힌다
    // (유저 지적 2026-08-30 — 다른 값은 안 그런데 이것만 그랬다).
    const manual = c.burst_pattern !== undefined
      && c.burst_pattern !== NO_PATTERN
      && c.burst_pattern !== DEFER
      && !presets.includes(c.burst_pattern);
    if (presets.length) {
      // 자동으로 걸리는 캐릭터(로스터에 안내가 실린 캐릭터)에는 **«안 씀»**을 함께
      // 낸다. 기본이 켜져 있는 셈이라, 끄려면 사람이 반대로 풀 자리가 있어야 한다
      // (유저 지시 2026-08-28). 코어는 «안 씀»을 «주기 없음»으로 읽는다(계약 §4).
      // 이름은 **번역해서 보여 준다** — 값은 한국어 그대로 서버로 가야 하지만(코어가
      // 그 글자로 되찾는다), 화면 글자까지 한국어면 외국어 사용자에게 안 읽힌다
      // (제보 2026-08-30, 영문). 사전에 없으면 T가 원문을 돌려주니 안전하다.
      const PATS = [...presets.map((v) => [v, T(v)]),
                    ...(rec?.pattern_note ? [[NO_PATTERN, T("안 씀")]] : []),
                    ["직접", T("직접 입력")]];
      // 자동으로 걸린 상태면 **그 값이 골라진 것처럼** 보여 준다 — 저장값은 비어 있지만
      // 실제로 걸리는 것이 그것이라, 고르개가 비어 있으면 무엇이 걸렸는지 못 읽는다.
      const cur = manual || patDraft === name ? T("직접") : (autoOn ? autoPat : c.burst_pattern);
      const sel = selectEl(PATS, cur, (v) => {
        if (v === "직접") { patDraft = name; setCtrl(name, "burst_pattern", null); return; }
        if (patWarnIf(name, v)) { sel.value = cur; return; }   // 겹침 — 되돌린다
        patDraft = null;
        setCtrl(name, "burst_pattern", v);
      });
      opts.append(sel);
    }
    if (!presets.length || manual || patDraft === name) {
      const inp = el("input", "ctrl-pat");
      inp.type = "text";
      inp.placeholder = T("예: 1,3,5,9 (몇 번째 풀버스트인지)");
      inp.value = manual ? patternText(c.burst_pattern) : "";
      inp.onchange = () => {
        const v = parsePattern(inp.value);
        const clash = v ? patWarnIf(name, v) : false;
        inp.classList.toggle("bad", (!v && inp.value.trim() !== "") || clash);
        if (v && !clash) {
          patDraft = null;
          setCtrl(name, "burst_pattern", v);
        }
      };
      opts.append(inp);
    }
    // 겹침 경고 자리. **여기 있어야 한다** — `patWarnIf`가 `#ctrl-panel .ctrl-pat-warn`을
    // 찾는데, 이 줄이 `renderRecords()`의 «기록이 없습니다» 가지에 들어가 있었다(첫
    // 커밋부터). 그래서 주기가 막혀도 이유가 화면에 한 번도 안 나왔다.
    const patWarn = el("p", "ctrl-pat-warn");
    patWarn.hidden = true;
    opts.append(patWarn);
  }
  wrap.append(opts);

  wrap.append(el("p", "prose prose-sm",
    T("기본은 전부 자동입니다. 실제로는 한 번에 한 명만 조작할 수 있으니, ")
    + T("여러 명을 동시에 켜면 그만큼 비현실적인 상한이 됩니다.")
    + (rec?.pattern_note ? " " + rec.pattern_note : "")
    + forced.map((r) => " " + r.note).join("")));
}

/** 켜고 끄는 칩. 브라우저 기본 체크박스는 어두운 판에서 흰 상자로 튀어 나온다 —
 *  앱이 이미 쓰는 칩 언어(`.chip` / `.on`)를 그대로 쓴다. */
function ctrlCheck(label, on, onchange, tip) {
  const b = el("button", "chip ctrl-chip" + (on ? " on" : ""), label);
  b.type = "button";
  b.setAttribute("aria-pressed", String(on));
  b.onclick = () => onchange(!on);
  if (tip) b.title = tip;
  return b;
}

// ── 전투 조건 ───────────────────────────────────────────────────────────
// 네 번째 자리는 «어느 상자에 쓰나» — 사이클 다섯은 보스가 아니라 **덱**에 붙는다.
const BT_FIELDS = [
  ["#bt-def", "def", "int"], ["#bt-core", "core_px", "int"],
  ["#bt-corepierce", "core_pierceable", "bool"],
  ["#bt-maxburst", "max_burst_count", "int", "cycle"],
  ["#bt-first", "first_burst_time", "num", "cycle"],
  ["#bt-reenter", "burst_reenter_delay", "num", "cycle"],
  ["#bt-regen", "burst_regen_time", "num", "cycle"],
];

// ── 보스(레이드) 설정 공유 ──────────────────────────────────────────────
// 편성 공유(`/s?c=`)와 **다른 것**이다. 저기는 «내 결과를 보여 주는» 링크이고,
// 이건 «같은 조건으로 재자»고 길드·친구에게 건네는 값이다. 둘 다 만료가 없다(계약 §5).
// 담기는 것은 레이드 설정뿐이다 — 편성도 계정도 안 들어간다.

/** 지금 화면의 설정을 서버가 받는 꼴로. 유니온은 세 줄을 그대로 담는다. */
/** 회차 보스 기본값 통째 — 다섯 보스의 «원래 값»만. 줄 설정은 안 담는다. */
function seasonBossPayload() {
  const sid = unionSeason().id;
  const box = bossDefaults(sid);
  const bosses = {};
  for (const code of UNION_CODES) {
    const b = box[code];
    if (b) bosses[code] = { ...b, phases: cleanPhases(b.phases) };
  }
  return { mode: "union", kind: "season_bosses", season: sid,
           duration: durationNow(), bosses };
}

/** 받은 회차 보스 기본값을 앉힌다. 세 줄은 **건드리지 않는다** — 「세 줄에 다시 적용」을
 *  눌렀을 때만 덮는다(유저 결정). 남의 기본값이 내 줄 설정을 말없이 지우면 안 된다. */
function applySeasonBosses(got) {
  if (!got || got.kind !== "season_bosses" || !got.bosses) {
    return { err: T("회차 보스 설정 코드가 아닙니다.") };
  }
  const sid = UNION_SEASONS.some((x) => x.id === got.season) ? got.season : unionSeason().id;
  const box = bossDefaults(sid);
  let n = 0;
  for (const code of UNION_CODES) {
    const b = got.bosses[code];
    if (!b) continue;
    box[code] = { ...JSON.parse(JSON.stringify(BATTLE_DEFAULT)), ...b };
    for (const k of CYCLE_KEYS) delete box[code][k];
    n++;
  }
  if (!n) return { err: T("코드에 보스 설정이 없습니다.") };
  if (sid !== unionSeason().id) U().season = sid;
  saveAll(); renderBench();
  return { n, season: UNION_SEASONS.find((x) => x.id === sid)?.label || "" };
}

/** 회차 기본값을 세 줄에 부어 준다 — 줄에서 고쳐 둔 것은 사라진다(누를 때만 한다). */
function pourSeasonBosses() {
  uSnap(T("회차 보스 설정 적용"));
  let n = 0;
  for (let i = 0; i < UNION_DECKS; i++) {
    const d = uDeck(i);
    const w = uWeak(d);
    const dft = w && bossDefaults()[w];
    if (!dft) continue;
    pourBossDefault(d, dft);
    n++;
  }
  saveAll(); renderBench(); renderResults();
  return n;
}

/** 시트 안 목록 — 다섯 보스가 «정해졌나/비었나»를 한눈에. 무엇을 주고받는지 보여 준다. */
function renderBossCfgList() {
  // 시트 한 벌을 두 모드가 나눠 쓴다 — 뮤지엄이면 그쪽 목록(시즌 보스 셋)을 그린다. 이 함수는
  // renderAll 경로에서도 불리므로 여기서 가르지 않으면 유니온 다섯이 뮤지엄 시트를 덮는다(실측).
  if (modeNow() === "museum") return renderMuseumCfgList();
  const box = $("#boss-cfg-list");
  if (!box) return;
  box.textContent = "";
  const dft = bossDefaults();
  for (const code of UNION_CODES) {
    const b = dft[code];
    const line = el("div", "preset-line");
    line.append(el("span", "preset-boss", bossOf(code)?.name || code));
    line.append(el("span", "prof-meta", b
      ? T("방어력 {v} · 구간 {n}개", { v: (b.def ?? 0).toLocaleString(), n: (b.phases || []).length })
      : T("아직 안 정했습니다")));
    // **회차 시트를 닫지 않는다.** 닫으면 그 `close`가 쏘는 `history.back()`이
    // **나중에** 도착해, 방금 연 레이드 시트를 도로 닫는다(실측: 뜨자마자 꺼짐).
    // 겹쳐 두면 보스 설정을 닫았을 때 목록으로 돌아오기도 한다 — 온 자리로 돌려보낸다.
    const go = mkBtn(T("고치기"), "btn-ghost", () => openBossCfg(code));
    line.append(go);
    box.append(line);
  }
}

function bossPayload() {
  if (modeNow() === "union") {
    return { mode: "union", duration: durationNow(),
             // **회차를 함께 담는다.** 회차마다 속성에 걸린 랩처가 다르므로, 안 적으면
             // 받는 쪽이 보던 회차에 남의 회차 방어력이 들어간다(유저 지적).
             season: U().season ?? unionSeason().id,
             rows: [...Array(UNION_DECKS).keys()].map((i) => {
               const d = uDeck(i);
               const bt = battleFor(d);
               return { weak: uWeak(d) || null,
                        battle: { ...bt, phases: cleanPhases(bt.phases) } };
             }) };
  }
  // **사이클은 안 담는다** — 덱에 붙는 값이고, 남의 손속도를 받을 이유가 없다(유저 결정).
  const solo = { ...state.battle, phases: cleanPhases(state.battle.phases) };
  for (const k of CYCLE_KEYS) delete solo[k];
  // 뮤지엄은 솔로 꼴에 **보스·주간 버프**를 얹는다 — 어느 보스의 설정인지가 곧 뜻이다.
  if (modeNow() === "museum") {
    return { mode: "museum", duration: durationNow(), code: state.settings.code || null,
             battle: solo, boss: M().boss, weekly: museumWeekly() };
  }
  return { mode: "solo", duration: durationNow(), code: state.settings.code || null,
           battle: solo };
}

/** 받은 설정을 화면에 앉힌다. 반환 `{ err }`이면 아무것도 안 넣었다는 뜻이고,
 *  `{ note }`는 넣었지만 함께 말해 줄 것이 있다는 뜻이다.
 *
 *  **모드가 다르면 안 넣는다** — 세 줄짜리를 솔로 한 벌에 욱여넣으면 어느 줄을 쓸지
 *  우리가 대신 고르는 셈이 된다. */
function bossApply(got) {
  // 회차 보스 기본값 코드는 담는 것이 다르다 — 여기로 오면 넘겨준다. 붙여넣기 칸은
  // 어떤 코드든 받을 수 있어서, 종류를 안 보고 `battle`을 꺼내면 터진다.
  if (got && got.kind === "season_bosses") {
    if (modeNow() !== "union") {
      return { err: T("유니온 레이드 설정 코드입니다 — 유니온에서 가져오세요.") };
    }
    const r = applySeasonBosses(got);
    return r.err ? r : { note: T("회차 보스 기본값 {n}개 — 세 줄은 그대로입니다.", { n: r.n }) };
  }
  const union = modeNow() === "union", museum = modeNow() === "museum";
  if (!!got.rows !== union) {
    return { err: union ? T("솔로 설정 코드입니다 — 솔로에서 가져오세요.")
                        : T("유니온 설정 코드입니다 — 유니온에서 가져오세요.") };
  }
  // 뮤지엄 코드는 뮤지엄에서만, 솔로 코드는 솔로에서만 — 보스·주간 버프가 딸린 설정을
  // 솔로 한 벌에 넣으면 방어력이 엉뚱한 보스의 것이 된다.
  if (!union && (got.mode === "museum") !== museum) {
    return { err: museum ? T("솔로 설정 코드입니다 — 솔로에서 가져오세요.")
                         : T("뮤지엄 설정 코드입니다 — 뮤지엄에서 가져오세요.") };
  }
  // **전투 시간을 먼저 받는다** — 아래 `partsToPhases`가 «전투 내내»를 그 길이로
  // 깔기 때문이다. 나중에 받으면 옛 길이로 깔린 채 남는다.
  if (got.duration) state.settings.duration = got.duration;
  const dur = got.duration || durationNow();
  const put = (dst, src) => {
    // 코드가 우리가 아는 꼴이 아니면 `src`가 없다. 터뜨리지 말고 그 줄만 건너뛴다 —
    // 화면에 붉은 자바스크립트 오류가 뜨는 것보다 «코드가 이상하다»가 낫다.
    if (!src || typeof src !== "object") return false;
    Object.assign(dst, {
      ...src,
      optimal_range_weapons: [...(src.optimal_range_weapons || [])],
      weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff, ...(src.weapon_coeff || {}) },
      phases: cleanPhases(src.phases),
    });
    // 합치기 전에 만들어진 코드는 파츠를 체크·주기로 담고 있다 — 같은 뜻의 구간으로.
    partsToPhases(dst, dur);
    return true;
  };
  let note = null;
  if (union) {
    // **보낸 회차로 옮겨 간다.** 회차마다 속성에 걸린 랩처가 달라, 지금 보던 회차에
    // 그대로 쓰면 남의 회차 방어력이 엉뚱한 랩처에 붙는다(유저 지적).
    // **지금 보고 있는 회차**와 견준다. `U().season`은 한 번도 안 고른 사람에게 비어
    // 있어서, 그걸로 견주면 같은 회차인데도 «옮겨 넣었습니다»가 뜬다(실측).
    if (got.season != null && got.season !== unionSeason().id) {
      const known = got.season === CUSTOM_SEASON
        || UNION_SEASONS.some((x) => x.id === got.season);
      if (known) {
        U().season = got.season;
        note = T("{v} 회차로 옮겨 넣었습니다.", { v: unionSeason().label || String(got.season) });
      } else {
        // 우리 판에 없는 회차(그쪽이 «직접 회차»를 썼거나 우리보다 새 판이다).
        // 옮기지 않고 지금 회차에 넣되, 보스를 확인하라고 말한다.
        note = T("모르는 회차의 설정입니다 — 지금 회차에 넣었습니다. 보스를 확인하세요.");
      }
    }
    got.rows.forEach((r, i) => {
      if (i >= UNION_DECKS) return;
      const d = uDeck(i);
      put((d.battle ||= {}), r.battle);
      if (r.weak) { d.weak = r.weak; seasonPicks()[i] = r.weak; }
    });
  } else if (museum) {
    // **보낸 보스로 옮겨 간다** — 보스마다 설정 상자가 따로라, 지금 보스에 그대로 쓰면
    // 남의 보스 방어력이 엉뚱한 보스에 붙는다. 속성은 보스가 정하므로 `code`는 안 받는다.
    if (got.boss && museumStage(got.boss) && got.boss !== M().boss) {
      museumSetBoss(got.boss);
      note = T("{v} 보스로 옮겨 넣었습니다.", { v: T(museumStage().boss) });
    }
    if (got.weekly !== undefined && got.weekly !== null && Number.isFinite(Number(got.weekly))) {
      M().weekly[M().boss] = Number(got.weekly);
    }
    put(state.battle, got.battle);
  } else {
    if (!put(state.battle, got.battle)) return { err: T("코드에 보스 설정이 없습니다.") };
    if (got.code) state.settings.code = got.code;
  }
  saveAll();
  buildBattle();
  renderAll();
  return note ? { note } : {};
}

/** 붙여넣은 것에서 코드만 꺼낸다 — 주소째 붙여넣는 것이 사람의 손버릇이다. */
function bossCodeOf(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/[?&]c=([A-Za-z0-9_-]{4,16})/) || s.match(/^([A-Za-z0-9_-]{4,16})$/);
  return m ? m[1] : null;
}

/** «코드 [복사]» 줄 여럿. 값은 읽기 전용 칸에 넣어 눌러서 고를 수도 있게 둔다 —
 *  자동 복사는 하지 않는다(사용자가 복사해 둔 것을 말없이 덮어쓰기 때문이다). */
function shareCopyRows(pairs, sink) {
  const box = el("div", "share-copy");
  for (const [label, value] of pairs) {
    const row = el("div", "share-copy-row");
    row.append(el("span", "share-copy-label", label));
    const inp = el("input", "share-copy-val");
    inp.type = "text";
    inp.readOnly = true;
    inp.value = value;
    inp.setAttribute("aria-label", label);
    inp.onclick = () => inp.select();
    row.append(inp);
    row.append(mkBtn(T("복사하기"), "btn-ghost", () => copyInto(value, sink,
      T("{v}를 복사했습니다.", { v: label }),
      T("복사가 막혔습니다 — 직접 골라서 복사하세요."))));
    box.append(row);
  }
  return [box];
}

function bossNote(text, kind = "", sel = "#bt-share-note") {
  const n = $(sel);
  if (!n) return;
  n.className = "bt-share-note" + (kind ? " " + kind : "");
  n.textContent = "";
  n.append(...(typeof text === "string" ? [document.createTextNode(text)] : text));
}

/** `/b?c=<코드>`로 들어왔다 — 그 설정을 앉히고 주소에서 코드를 뗀다.
 *
 *  편성 공유(`/s?c=`)와 달리 **보여 줄 화면이 따로 없다.** 설정은 레이드 설정 패널의
 *  값이므로, 받아서 앉히고 «가져왔다»고 말해 주면 그것으로 끝이다. */
/** 링크로 받은 회차 보스 설정을 **먼저 보여 준다.** 켠 것만 넣는다(유저 지시).
 *
 *  코드에 든 다섯을 그대로 앉히는 것이 아니라, 무엇이 들었는지(방어력·구간 개수)를
 *  적어 두고 고르게 한다. 남이 준 링크 하나로 내 기본값이 통째로 갈리면 «되돌리기»를
 *  찾게 되는데, 기본값에는 되돌리기가 없다. */
function openBossLinkSheet(got, { rec = false, code = "" } = {}) {
  const dlg = $("#bosslink-sheet"), list = $("#bosslink-list");
  if (!dlg || !list) return;
  // 시트 한 벌을 두 자리가 나눠 쓴다 — 링크로 받은 코드와 «보스 추천 설정». 담기는 것도
  // 고르는 방법도 같고 **어디서 왔는지만** 다르므로, 머리글과 문단만 갈아 끼운다.
  const t = $("#bosslink-t");
  if (t) t.textContent = rec ? T("보스 추천 설정") : T("받은 회차 보스 설정");
  const pr = $("#bosslink-prose"), pRecWrap = $("#bosslink-recwrap");
  if (pr) pr.hidden = rec;
  if (pRecWrap) pRecWrap.hidden = !rec;
  const pCode = $("#bosslink-code");
  if (pCode) {
    pCode.hidden = !(rec && code);
    // 코드는 **칩으로 세운다** — 문장 안에 그냥 적으면 묻혀서 안 보인다(유저 지시).
    // 받아 적어 두면 「보스 셋팅 공유」에서 같은 것을 다시 열 수 있는 값이다.
    pCode.textContent = "";
    if (rec && code) pCode.append(T("현재 코드"), " ", el("b", "rec-code", code));
  }
  const codes = UNION_CODES.filter((c) => got.bosses?.[c]);
  const on = new Set(codes);
  const label = UNION_SEASONS.find((x) => x.id === got.season)?.label;
  const msg = $("#bosslink-msg");
  if (msg) {
    msg.textContent = label && got.season !== unionSeason().id
      ? T("{v} 회차 설정입니다 — 가져오면 그 회차로 옮겨 갑니다.", { v: label })
      : "";
  }
  const draw = () => {
    list.textContent = "";
    for (const c of codes) {
      const b = got.bosses[c] || {};
      const line = el("div", "preset-line");
      const chk = el("input");
      chk.type = "checkbox"; chk.checked = on.has(c);
      chk.onchange = () => { if (chk.checked) on.add(c); else on.delete(c); sync(); };
      line.append(chk);
      line.append(el("span", "preset-boss", bossOf(c)?.name || c));
      line.append(el("span", "prof-meta",
        T("방어력 {v} · 구간 {n}개", { v: (b.def ?? 0).toLocaleString(),
                                       n: (b.phases || []).length })));
      list.append(line);
    }
  };
  const okBtn = $("#bosslink-ok"), noneBtn = $("#bosslink-none");
  const sync = () => {
    if (okBtn) okBtn.disabled = !on.size;
    if (noneBtn) noneBtn.textContent = on.size ? T("전부 끄기") : T("전부 켜기");
  };
  if (noneBtn) noneBtn.onclick = () => {
    if (on.size) on.clear(); else codes.forEach((c) => on.add(c));
    draw(); sync();
  };
  if (okBtn) okBtn.onclick = () => {
    const bosses = {};
    for (const c of on) bosses[c] = got.bosses[c];
    const r = applySeasonBosses({ ...got, bosses });
    dlg.close();
    flashStatus(r.err || (rec
      ? T("보스 {n}개를 추천 설정으로 넣었습니다 — 덱은 세 줄에 새로 배치해야 합니다.", { n: r.n })
      : T("회차 보스 기본값 {n}개를 가져왔습니다 — 세 줄은 그대로입니다.", { n: r.n })));
  };
  const x = $("#bosslink-x");
  if (x) x.onclick = () => dlg.close();
  draw(); sync();
  if (!dlg.open) dlg.showModal();
}

async function loadBossLink(code) {
  try {
    const r = await fetch(`/api/boss?c=${encodeURIComponent(code)}`);
    const j = await readJSON(r);
    if (!r.ok || j.error) throw new Error(j.error || T("가져오기 실패"));
    // 보낸 쪽이 유니온이면 받는 쪽도 유니온이어야 한다 — 모드부터 맞춘다.
    // **회차 보스 기본값 코드도 유니온 것이다.** 그 코드에는 `rows`가 없어서 `rows`만
    // 보면 솔로로 읽고, 솔로에는 없는 `battle`을 꺼내다 터진다(실측 `/b?c=d432zs` —
    // «Cannot read properties of undefined (reading 'optimal_range_weapons')»).
    const isSeason = j.kind === "season_bosses";
    const want = (j.rows || isSeason) ? "union"
      : j.mode === "museum" ? "museum" : "solo";
    if (want !== modeNow() && (want !== "union" || unionOn())) setMode(want, { warp: false });
    if (isSeason && modeNow() !== "union") {
      // 유니온이 꺼져 있으면 앉힐 자리가 없다 — 조용히 실패하지 않고 그렇다고 말한다.
      throw new Error(T("유니온 레이드 설정 코드입니다 — 유니온에서 가져오세요."));
    }
    // **회차 코드는 바로 안 넣는다**(유저 지시 2026-08-29). 남이 준 링크 하나로 내
    // 기본값 다섯이 말없이 갈리면 놀란다 — 무엇이 들었는지 보여 주고 고르게 한다.
    if (isSeason) { openBossLinkSheet(j); return; }
    const r2 = bossApply(j);
    flashStatus(r2.err
      || T("보스 설정을 가져왔습니다 — 다시 계산하세요.") + (r2.note ? " " + r2.note : ""));
  } catch (e) {
    flashStatus(String(e.message || T("가져오기 실패")));
  } finally {
    clearShareUrl();                 // 새로 고쳐도 같은 일이 되풀이되지 않게
  }
}

/** 「보스 추천 설정」 — 추천 코드를 받아 **모달만 연다.** 바로 앉히지 않는 이유는
 *  링크로 받은 코드와 같다(openBossLinkSheet): 기본값에는 되돌리기가 없어서, 무엇이
 *  들어가는지 보여 주고 고르게 한다. */
async function openBossRec(btn) {
  if (btn) btn.disabled = true;
  try {
    // **코드는 서버가 든다**(관리 화면에서 갈아 끼운다) — 회차가 바뀌어도 사이트를 다시
    // 굽지 않는다. 설정까지 한 번에 받아 오므로 여기서 `/api/boss?c=`를 또 부르지 않는다.
    const r = await fetch("/api/boss/rec");
    const j = await readJSON(r);
    if (!r.ok || j.error) throw new Error(j.error || T("가져오기 실패"));
    if (!j.code) throw new Error(T("아직 추천 설정이 없습니다."));
    const got = j.cfg;
    if (!got || got.kind !== "season_bosses" || !got.bosses) {
      throw new Error(T("회차 보스 설정 코드가 아닙니다."));
    }
    openBossLinkSheet(got, { rec: true, code: j.code });
  } catch (e) {
    flashStatus(String(e.message || T("가져오기 실패")));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** 내보내기·가져오기 한 벌을 붙인다. 같은 일을 하는 자리가 둘이다 —
 *  레이드 설정 패널 안(솔로에서 쓴다)과 유니온 하단 시트(세 줄을 통째로). */
function wireBossShare(ids = {}) {
  const { ex: exId = "bt-export", im: imId = "bt-import",
          inp: inpId = "bt-code", note = "#bt-share-note",
          // `payload`를 주면 그것을 보낸다 — 회차 보스 기본값처럼 담는 것이 다를 때 쓴다.
          payload = bossPayload, after = null } = ids;
  const ex = $("#" + exId), im = $("#" + imId), inp = $("#" + inpId);
  if (!ex || !im || !inp) return;
  ex.onclick = async () => {
    ex.disabled = true;
    bossNote(T("만드는 중…"), "", note);
    try {
      const r = await fetch("/api/boss", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const j = await readJSON(r);
      if (!r.ok || j.error) throw new Error(j.error || T("공유 실패"));
      const url = `${location.origin}/b?c=${j.code}`;
      // **가만히 있다가 복사되지 않게 한다**(유저 지시 2026-08-28). 예전에는 만들자마자
      // 클립보드를 덮어써서, 딴 것을 복사해 두고 코드를 만들면 그게 날아갔다.
      // 코드와 주소를 나란히 놓고 **누를 때만** 복사한다.
      bossNote(shareCopyRows([[T("코드"), j.code], [T("주소"), url]],
                             (m, k) => bossNote(m, k, note)), "ok", note);
    } catch (e) {
      bossNote(String(e.message || T("공유 실패")), "err", note);
    } finally {
      ex.disabled = false;
    }
  };
  const pull = async () => {
    const code = bossCodeOf(inp.value);
    if (!code) { bossNote(T("코드가 아닙니다 — 6글자 코드나 공유 주소를 넣으세요."), "err", note); return; }
    im.disabled = true;
    bossNote(T("가져오는 중…"), "", note);
    try {
      const r = await fetch(`/api/boss?c=${encodeURIComponent(code)}`);
      const j = await readJSON(r);
      if (!r.ok || j.error) throw new Error(j.error || T("가져오기 실패"));
      const r2 = (ids.apply || bossApply)(j);
      if (r2.err) { bossNote(r2.err, "err", note); return; }
      inp.value = "";
      bossNote(T("설정을 가져왔습니다 — 다시 계산하세요.") + (r2.note ? " " + r2.note : ""), "ok", note);
    } catch (e) {
      bossNote(String(e.message || T("가져오기 실패")), "err", note);
    } finally {
      im.disabled = false;
    }
  };
  im.onclick = pull;
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); pull(); } };
}

/** 보스 구간 줄들을 다시 그린다. 값은 `battleNow().phases`가 든다 — 화면이 곧 그 값이다. */
/** 손속도 단계. 값은 **초**이고, 라벨에 그 값을 그대로 보여 준다 — 이름만 있으면
 *  몇 초인지 몰라 고를 수가 없다(유저). 세 개로 안 맞는 사람은 직접 넣는다.
 *
 *  «고수/보통/초보»라고 부르지 않는다(유저 지시 2026-08-29). 손속도는 잘하고 못하고가
 *  아니라 **얼마나 느리게 눌리느냐**일 뿐이고, 등급으로 부르면 기본값을 고른 사람이
 *  «나는 초보인가»를 읽게 된다. 기준을 기본으로 두고 나머지는 «느림»으로 잰다. */
const SWITCH_STEPS = () => [
  [0.1, T("기본 (0.1초)")],
  [0.25, T("느림 (0.25초)")],
  [0.4, T("많이 느림 (0.4초)")],
];

/** 「버스트 손속도」 — 고르개와 숫자칸이 **같은 값 하나**를 본다.
 *  단계를 고르면 숫자가 따라가고, 숫자를 직접 넣으면 고르개가 «직접»으로 넘어간다. */
function buildSwitchSpeed() {
  const box = $("#bt-switch");
  if (!box) return;
  const cyBox = cycleNow();
  const cur = cyBox.burst_switch_delay ?? BATTLE_DEFAULT.burst_switch_delay;
  const steps = SWITCH_STEPS();
  const isStep = steps.some(([v]) => v === cur);
  box.textContent = "";
  // 「직접」은 **지금 값이 단계에 없을 때만** 목록에 둔다 — 있지도 않은 상태를 고를 수
  // 있게 두면 눌러도 아무 일이 없어 고장으로 보인다.
  box.append(selectEl([...steps, ...(isStep ? [] : [[cur, T("직접")]])], cur, (v) => {
    cyBox.burst_switch_delay = Number(v);
    syncBattleChrome(); saveAll(); buildSwitchSpeed(); renderAll();
  }));
  const n = el("input");
  n.type = "number"; n.min = "0"; n.max = "3"; n.step = "0.05";
  n.inputMode = "decimal";
  n.value = cur;
  n.onchange = () => {
    const raw = Number(n.value);
    const v = Math.min(3, Math.max(0, Number.isFinite(raw) ? raw : BATTLE_DEFAULT.burst_switch_delay));
    cyBox.burst_switch_delay = v;
    syncBattleChrome(); saveAll(); buildSwitchSpeed(); renderAll();
  };
  box.append(n);
}

function buildPhases() {
  const box = $("#bt-phases");
  if (!box) return;
  const b = battleNow();
  b.phases ||= [];
  box.textContent = "";
  if (!b.phases.length) {
    box.append(el("p", "bt-ph-none", T("구간이 없습니다 — 처음부터 끝까지 평소대로 칩니다.")));
  }
  b.phases.forEach((p, i) => {
    const row = el("div", "bt-ph");
    row.dataset.k = p.kind;
    row.append(selectEl(PHASE_KINDS.map(([v, l]) => [v, T(l)]), p.kind, (v) => {
      p.kind = v; saveAll(); buildPhases(); renderResults();
    }));
    // **0.1초 단위**다. 늘 «30.0»처럼 소수 한 자리를 적어 둔다 — «30»만 보이면 초 단위로만
    // 넣는 줄 안다(유저 지시). 코어도 이 값을 실수로 받는다(계약 §4).
    const TICK = (v) => Math.round(Math.max(0, Number(v) || 0) * 10) / 10;
    const numIn = (key, ph) => {
      const n = el("input");
      n.type = "number"; n.min = "0"; n.max = "3600"; n.step = "0.1";
      n.inputMode = "decimal";
      n.placeholder = ph;
      n.value = TICK(p[key]).toFixed(1);
      n.onchange = () => {
        p[key] = TICK(n.value);
        // 뒤집힌 채로 두지 않는다 — 코어가 버리는 값을 화면에 남겨 두면 «넣었는데 왜
        // 안 먹지»가 된다. 끝이 시작보다 앞이면 **한 눈금** 뒤로 민다.
        if (p.t1 <= p.t0) p.t1 = TICK(p.t0 + 0.1);
        saveAll(); buildPhases(); renderResults();
      };
      return n;
    };
    row.append(numIn("t0", "0.0"), el("em", null, "~"), numIn("t1", "10.0"), el("em", null, T("초")));
    // 적정거리 줄에만 무기군 칩이 붙는다 — 그 창 동안 적정거리가 되는 무기군이다.
    if (p.kind === "range") {
      p.weapons ||= [];
      const chips = el("div", "chips bt-ph-w");
      for (const w of WEAPONS) {
        const on = p.weapons.includes(w);
        const c = el("button", "chip" + (on ? " on" : ""), w);
        c.type = "button";
        // 위에서 이미 켠 무기군은 판 내내 적정이라 여기서 끌 수 없다 — 켜진 채로 잠근다.
        if (battleNow().optimal_range_weapons.includes(w)) {
          c.classList.add("on");
          c.disabled = true;
          c.title = T("위에서 판 내내 적정거리로 켜 두었습니다.");
        } else {
          c.onclick = () => {
            const i = p.weapons.indexOf(w);
            if (i === -1) p.weapons.push(w); else p.weapons.splice(i, 1);
            c.classList.toggle("on", p.weapons.includes(w));
            saveAll(); renderResults();
          };
        }
        chips.append(c);
      }
      row.append(chips);
    }
    const x = el("button", "bt-ph-x", "✕");
    x.type = "button";
    x.title = T("이 구간 지우기");
    x.onclick = () => { b.phases.splice(i, 1); saveAll(); buildPhases(); renderResults(); };
    row.append(x);
    box.append(row);
  });
}

/** 난수 줄 — 기대값(기본) · 확률(매번 다른 판) · 확률(시드 고정).
 *  «시드 고정»일 때만 숫자 칸이 뜬다. 값은 그 화면의 레이드 설정 상자에 산다
 *  (유니온은 줄마다 제 상자라 줄별로 따로 잡힌다). */
function buildRng() {
  const sel = $("#bt-rng-mode"), row = $("#bt-seed-row"), num = $("#bt-seed"), note = $("#bt-rng-note");
  const runsRow = $("#bt-runs-row"), runsNum = $("#bt-runs");
  if (!sel) return;
  const b = battleNow();
  const mode = b.rng_mode || "expected";
  sel.value = mode;
  if (num) num.value = String(Math.max(0, Math.round(Number(b.seed) || 0)));
  if (runsNum) runsNum.value = String(Math.max(2, Math.min(20, Math.round(Number(b.runs) || BATTLE_DEFAULT.runs))));
  const paint = () => {
    const m = battleNow().rng_mode || "expected";
    if (row) row.hidden = m !== "seed";
    if (runsRow) runsRow.hidden = m !== "spread";
    if (note) {
      note.textContent = m === "expected"
        ? T("늘 같은 값이 나옵니다 — 덱끼리 비교할 때 쓰세요.")
        : m === "random"
          ? T("누를 때마다 다른 판입니다 — 쓴 시드는 결과 줄에 적힙니다.")
          : m === "seed"
            ? T("적은 시드로 굴립니다 — 같은 판을 다시 볼 때 쓰세요.")
            : T("여러 판을 돌려 가장 낮은 판과 가장 높은 판을 함께 보여 줍니다.");
    }
  };
  sel.onchange = () => {
    battleNow().rng_mode = sel.value;
    paint(); syncBattleChrome(); saveAll(); renderAll();
  };
  if (num) {
    num.onchange = () => {
      const v = Math.max(0, Math.min(2147483647, Math.round(Number(num.value) || 0)));
      num.value = String(v);
      battleNow().seed = v;
      syncBattleChrome(); saveAll(); renderAll();
    };
  }
  if (runsNum) {
    runsNum.onchange = () => {
      // 상한 20회(유저 결정 2026-09-02, 처음엔 10) — 서버 clean.ts·코어와 같은 수다.
      const v = Math.max(2, Math.min(20, Math.round(Number(runsNum.value) || BATTLE_DEFAULT.runs)));
      runsNum.value = String(v);
      battleNow().runs = v;
      syncBattleChrome(); saveAll(); renderAll();
    };
  }
  paint();
}

function buildBattle() {
  const durIn = $("#duration");
  if (durIn) durIn.value = String(durationNow());
  buildPhases();
  for (const [sel, key, kind, scope] of BT_FIELDS) {
    const n = $(sel);
    if (!n) continue;
    const box = scope === "cycle" ? cycleNow() : battleNow();
    if (kind === "bool") n.checked = !!box[key];
    else n.value = box[key] ?? BATTLE_DEFAULT[key];
    n.onchange = () => {
      const raw = kind === "bool" ? n.checked : Number(n.value);
      let v = raw;
      if (kind !== "bool") {
        const lo = Number(n.min || 0), hi = Number(n.max || Infinity);
        v = Math.min(hi, Math.max(lo, Number.isFinite(raw) ? raw : BATTLE_DEFAULT[key]));
        if (kind === "int") v = Math.round(v);
        n.value = v;
      }
      box[key] = v;
      syncBattleChrome(); syncCycleChrome(); saveAll(); renderAll();
    };
  }
  buildSwitchSpeed();
  buildGaugeLab();
  buildRng();
  const wrap = $("#bt-range");
  wrap.textContent = "";
  for (const w of WEAPONS) {
    const b = el("button", "chip" + (battleNow().optimal_range_weapons.includes(w) ? " on" : ""), w);
    b.type = "button";
    b.onclick = () => {
      const arr = battleNow().optimal_range_weapons;
      const i = arr.indexOf(w);
      if (i === -1) arr.push(w); else arr.splice(i, 1);
      b.classList.toggle("on", arr.includes(w));
      syncBattleChrome(); saveAll(); renderAll();
    };
    wrap.append(b);
  }
  // 무기군 평타 계수 — 실전에서 탄퍼짐으로 새는 탄의 보정. 항상 6칸 전부 보여 주고
  // 기본값을 칸 옆에 적는다 (SG만 0.9, 근거는 BATTLE_DEFAULT 주석).
  const cw = $("#bt-coeff");
  if (cw) {
    cw.textContent = "";
    for (const w of WEAPONS) {
      const lab = el("label", "coeff-item");
      // 기본값은 라벨 옆에 흐리게 — 별도 줄을 쓰면 좁은 화면에서 두 줄로 꺾인다
      const name = el("span", "coeff-name", w);
      const def = el("em", "", BATTLE_DEFAULT.weapon_coeff[w].toFixed(2));
      def.title = T("기본값");
      name.append(def);
      const inp = el("input", "");
      inp.type = "number"; inp.min = "0.1"; inp.max = "1.5"; inp.step = "0.05";
      inp.inputMode = "decimal";
      inp.value = battleNow().weapon_coeff[w];
      inp.onchange = () => {
        let v = Number(inp.value);
        if (!Number.isFinite(v)) v = BATTLE_DEFAULT.weapon_coeff[w];
        v = Math.min(1.5, Math.max(0.1, v));
        inp.value = v;
        battleNow().weapon_coeff[w] = v;
        syncBattleChrome(); saveAll(); renderAll();
      };
      lab.append(name, inp);
      cw.append(lab);
    }
  }
  syncBattleChrome();
}

/** 레이드 설정이 «기본에서 벗어났나». 뮤지엄은 방어력 기본이 솔로의 31,784가 아니라
 *  **그 보스 레벨의 값**이라, 그것과 같으면 벗어난 게 아니다 — 안 그러면 별표가 늘 켜져 있다. */
function battleChanged() {
  let sig = battleSig();
  if (modeNow() === "museum") {
    const auto = museumDefAt(museumBossLv(museumCfgBoss || M().boss));
    // 사이클 키는 덱 것이라 여기 상자에서는 뜻이 없다 — 기본값 상자에는 아예 없어 늘 «바뀜»으로 잡혔다.
    const parts = sig.split(",").filter((s) => !CYCLE_KEYS.some((k) => s.startsWith(k + "="))
                                             && !(auto && battleNow().def === auto && s.startsWith("def=")));
    sig = parts.join(",") || "def";
  }
  return sig !== "def";
}

/** 버스트 게이지 실누적 + 카메라.
 *
 *  이 스위치가 켜지면 코어는 **위 두 칸을 아예 안 본다**(`first_burst_time`·
 *  `burst_regen_time`) — 히트가 만든 게이지가 100%에 닿는 순간이 1단계다. 그래서
 *  칸을 그냥 두지 않고 흐리게 죽인다. 안 그러면 숫자를 고쳐도 결과가 안 바뀌는 것을
 *  버그로 읽는다.
 *
 *  카메라 칸은 **안 낸다**(유저 결정 2026-08-29). 가운데(3번) 자리로 못 박고
 *  `battlePayload()`가 그 이름을 실어 보낸다 — 거기 이유를 적어 뒀다. */
function buildGaugeLab() {
  const cy = cycleNow();
  const on = cy.burst_gauge_mode === "accumulate";
  const chk = $("#bt-gauge-acc");
  if (chk) {
    chk.checked = on;
    chk.onchange = () => {
      cycleNow().burst_gauge_mode = chk.checked ? "accumulate" : "fixed";
      buildGaugeLab(); syncBattleChrome(); saveAll(); renderAll();
    };
  }
  // 실누적이 안 쓰는 칸을 흐리게. `disabled`로 잠그지는 않는다 — 껐을 때 쓰던 값을
  // 그대로 다시 쓰는 편이 낫고, 잠그면 값이 폼에서 사라져 보인다.
  for (const sel of ["#bt-first", "#bt-regen"]) {
    const n = $(sel);
    if (n) n.closest(".bt-row")?.classList.toggle("bt-row-moot", on);
  }
}

/** 사이클 칸이 기본값과 다른가. 레이드 설정과 따로 본다 — 되돌리기 단추가 둘이다. */
function cycleChangedOf(box) {
  if (!box) return false;
  return CYCLE_KEYS.some((k) => (box[k] ?? BATTLE_DEFAULT[k]) !== BATTLE_DEFAULT[k]);
}
const cycleChanged = () => cycleChangedOf(cycleNow());

/** 사이클만 기본값으로. **레이드 설정은 안 건드린다** — 유니온에서는 둘이 한 상자
 *  (줄의 `battle`)에 살아서, 통째로 갈면 방어력·코어까지 날아간다. */
function resetCycle() {
  const box = cycleNow();
  if (!box) return;
  for (const k of CYCLE_KEYS) box[k] = BATTLE_DEFAULT[k];
  delete box._swV;                       // 손속도 이관 판번호 — 기본값으로 돌아갔으니 새로 찍는다
  buildBattle(); syncCycleChrome(); syncBattleChrome();
  saveAll(); renderAll();
}

function syncCycleChrome() {
  const b = $("#cycle-clear");
  if (b) b.hidden = !cycleChanged();
}

function syncBattleChrome() {
  const changed = battleChanged();
  // 트리거는 «무엇을 여는 버튼인지»를 말해야 한다. 값(180초)만 적으면 정체를 알 수 없다.
  $("#bt-trig-label").textContent = changed ? T("레이드 설정 *") : T("레이드 설정");
  $("#bt-toggle").classList.toggle("filtered", changed);
  const mrl = $("#museum-raid-label");
  if (mrl && !museumCfgBoss) {
    mrl.textContent = changed ? T("레이드 설정 *") : T("레이드 설정");
    $("#museum-raid")?.classList.toggle("filtered", changed);
  }
  $("#bt-clear").hidden = !changed || $("#btpanel").hidden;
}

function resetBattle() {
  const box = { ...BATTLE_DEFAULT, optimal_range_weapons: [],
                weapon_coeff: { ...BATTLE_DEFAULT.weapon_coeff } };
  // 유니온은 설정이 **줄마다** 따로다 — 지금 패널이 보고 있는 줄을 되돌린다.
  // 예전 공용 상자(U().battle)에 쓰면 화면이 그대로라 「눌러도 아무 일도 안 난다」가
  // 된다(실측). 그 상자는 이제 새 줄에 값을 심을 때의 씨앗으로만 남는다.
  if (bossCfgCode) bossDefaults()[bossCfgCode] = box;
  else if (museumCfgBoss) {
    for (const k of CYCLE_KEYS) delete box[k];
    const def = museumDefAt(museumBossLv(museumCfgBoss));
    if (def) box.def = def;
    M().bossDefaults[museumCfgBoss] = box;
  }
  else if (modeNow() === "union") uDeck(uBattleRow).battle = box;
  else state.battle = box;
  // 뮤지엄의 «기본값»은 그 보스 레벨의 방어력이다 — 솔로 기본(31,784)이 아니다.
  if (modeNow() === "museum" && !museumCfgBoss) museumSyncDef();
  // 전투 시간은 `battleNow()`이 아니라 `state.settings`에 있다 — 예전에는 여기서
  // 안 되돌려서, «기본값»을 눌러도 예전에 저장해 둔 시간(160초 등)이 그대로
  // 남았다. 레이드 설정 패널 안에 있는 입력이니 같이 되돌린다.
  if (modeNow() === "union") U().duration = 180; else state.settings.duration = 180;
  const dur = $("#duration");
  if (dur) dur.value = String(durationNow());
  buildBattle();
  saveAll(); renderAll();
}

function clearFilters() {
  const f = curFilter();
  // 패널의 «비우기»는 **패널 것만** 비운다 — 위쪽 바의 버스트·즐겨찾기는 건드리지 않는다.
  f.cls = []; f.element = []; f.weapon = []; f.corp = []; f.acc = []; f.favItem = false;
  buildFilters();
  saveAll(); renderPools();
}

// ── 편성 공유 ───────────────────────────────────────────────────────────
// 남에게 주는 것은 **편성과 표시용 딜 수치뿐**이다. 닉네임(`profileName`)·계정 지문
// (`profileSig`)·기본값 이탈 목록(`notes`)·니케별 내역(`detail`)은 담지 않는다.
// `notes`에는 `equip_skills.charge_speed_pct: 0 → 9.26`처럼 **장비 실수치가 문장으로**
// 들어 있어서, 그대로 올리면 «편성만 공유한다»가 사실이 아니게 된다.
// 서버도 같은 화이트리스트로 다시 짓지만(`share_clean`), 애초에 브라우저를 떠나지
// 않는 것이 맞다 — 여기가 첫 번째 문이다.
//
// 받는 쪽이 가져가는 것은 **편성뿐**이다. 컨트롤(운용)도 보내지 않으므로 가져온 덱은
// «전부 자동»으로 들어간다.

/** 공유본에 보스·레이드 설정을 담을까. 유니온에서만 뜻이 있고 **기본은 담는다** —
 *  유니온 편성은 «어느 보스를 어떤 조건으로 쳤나»까지가 한 벌이라, 편성만 건네면
 *  받는 사람이 같은 수치를 못 낸다. 담기 싫으면 체크를 끈다. */
const shareBossOn = () => state.settings.shareBoss !== false;

function sharePayload(r) {
  const out = {
    v: SHARE_V,
    code: r.code || null,
    duration: r.duration,
    total: r.total,
    decks: r.decks.map((d) => {
      const one = { names: [...d.names], total: d.total, chars: { ...(d.chars || {}) } };
      if (d.weak) one.weak = d.weak;      // 그 줄이 친 보스
      // 보스·레이드 설정은 **켜 두었을 때만** 담는다(유저 지시 2026-08-28). 받는 쪽은
      // 「편성만」과 「편성 + 보스 설정」을 고를 수 있으므로, 담겼는지가 곧 그 선택지의
      // 유무다 — 늘 담으면 «편성만 주고 싶다»를 표현할 방법이 없다.
      if (shareBossOn() && d.battle) {
        one.battle = { ...d.battle, phases: cleanPhases(d.battle.phases) };
      }
      return one;
    }),
  };
  if (shareBossOn() && (r.mode || modeNow()) === "union") {
    out.season = r.season ?? U().season ?? unionSeason().id;
  }
  // **어느 콘텐츠의 편성인가.** 안 실으면 받는 쪽이 지금 보고 있는 모드로 짐작해야
  // 하고, 유니온 편성이 솔로 덱에 들어가 버린다(실측). 없으면 솔로다 — 예전 링크는
  // 그대로 산다.
  //
  // `r.mode`가 없는 것은 **이 열쇠가 생기기 전에 저장된 기록**이다. 기록 목록은
  // 애초에 모드별로 갈려 있으므로(recordsNow), 지금 서 있는 모드가 곧 그 기록의
  // 모드다 — 유니온 목록에서 고른 것이 솔로 기록일 수는 없다.
  if ((r.mode || modeNow()) === "union") out.mode = "union";
  // 뮤지엄은 보스·주간 버프·시작 스텝까지 — 받는 쪽이 같은 스텝을 세려면 이 셋이 있어야 한다.
  if ((r.mode || modeNow()) === "museum") {
    out.mode = "museum";
    out.boss = r.boss ?? M().boss;
    out.weekly = r.weekly ?? museumWeekly();
  }
  return out;
}

const shareUrl = (code) => `${location.origin}/s?c=${encodeURIComponent(code)}`;

/** 공유본을 서버에 올리고 링크 상자를 `out`에 그린다. 문구는 `sink`가 받는다. */
async function makeShare(r, out, sink) {
  if (!HEALTH.share) {
    sink(T("이 서버는 공유 저장소가 꺼져 있습니다 — 링크를 만들 수 없습니다."), "err");
    return;
  }
  if (!r.decks.length) {
    sink(T("공유할 계산 결과가 없습니다 — 먼저 계산하세요."), "err");
    return;
  }
  sink(T("공유 링크를 만드는 중…"));
  try {
    const res = await fetch("/api/share", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sharePayload(r)),
    });
    const j = await readJSON(res);
    if (j.error) throw new Error(j.error);
    renderShareOut(out, j.code, sink);
    // 링크는 이미 만들어져 화면에 떠 있다 — 복사가 막힌 것은 오류가 아니라 안내다
    await copyInto(shareUrl(j.code), sink,
      T("공유 링크를 복사했습니다."),
      T("링크를 만들었습니다 — 복사가 막혀 있어 아래 주소를 직접 복사하세요."), "warn");
  } catch (e) {
    sink(T("공유에 실패했습니다 — {v}", { v: String(e.message || e) }), "err");
  }
}

/** 만든 링크 상자. 주소·복사·삭제. **주소는 서버가 아니라 여기서 짓는다** —
 *  서버가 지으려면 프록시 헤더(`X-Forwarded-Host`)를 믿어야 한다. */
function renderShareOut(out, code, sink) {
  if (!out) return;
  out.hidden = false;
  out.textContent = "";
  const url = shareUrl(code);
  const row = el("div", "share-row");
  const inp = el("input", "share-url");
  inp.type = "text";
  inp.readOnly = true;
  inp.value = url;
  inp.setAttribute("aria-label", T("공유 링크"));
  inp.onclick = () => inp.select();
  row.append(inp);
  row.append(mkBtn(T("복사"), "btn-primary", () => copyInto(url, sink,
    T("공유 링크를 복사했습니다."), T("복사가 막혔습니다 — 주소를 직접 복사하세요."))));
  row.append(mkBtn(T("링크 삭제"), "btn-ghost", () => {
    askInline(out, T("이 링크를 지금 지웁니다. 받은 사람은 더 이상 열 수 없습니다."), T("지우기"),
      async () => {
    try {
      const res = await fetch("/api/unshare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await readJSON(res);
      if (j.error) throw new Error(j.error);
      out.hidden = true;
      out.textContent = "";
      sink(j.deleted ? T("링크를 지웠습니다.") : T("이미 사라진 링크입니다."), "ok");
    } catch (e) {
      sink(T("삭제에 실패했습니다 — {v}", { v: String(e.message || e) }), "err");
    }
      });
  }));
  out.append(row);
  out.append(el("p", "prose prose-sm",
    T("이 링크에는 편성과 딜 수치만 담겨 있습니다 — 계정 정보와 계정 이름은 올라가지 않습니다.")));
  // **기한이 없다고 «영원히 산다»고 말하지 않는다.** 오래된 것은 나중에 손으로 솎을 수
  // 있고(`deploy/share_prune.py`), 그때 「없어질 리 없다던 링크」가 되면 그게 더 나쁘다.
  out.append(el("p", "prose prose-sm",
    T("따로 기한은 없지만, 아주 오래된 링크는 나중에 정리될 수 있습니다.")));
}

// ── 미미르 편성 코드 받기 (`/m?c=…`) ────────────────────────────────────

/** 미미르 편성 코드를 푼다. base64로 감싼 JSON이다.
 *
 *  **모드는 코드 안의 `type`이 정한다** — "union"이면 유니온, "solo"면 솔로다.
 *  줄 수로 넘겨짚지 않는다: 솔로도 5덱을 다 안 채울 수 있어서 «3줄이면 유니온»이
 *  틀린다(유저 지적). `type`이 없거나 모르는 값이면 **추측하지 않고 거절한다.**
 *
 *  니케는 이름이 아니라 게임 내부 번호(`name_code`)로 온다. 사이트마다 표기가
 *  달라도 번호는 게임 것이라 흔들리지 않는다 — 그래서 이걸로 맞춘다.
 */
function decodeMimir(raw) {
  let doc;
  try {
    // 코드가 주소를 타고 오므로 URL-safe base64도 받아 준다.
    const b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    doc = JSON.parse(new TextDecoder().decode(bytes));   // 한글이 들었다 — atob만으로는 깨진다
  } catch {
    throw new Error(T("코드를 읽을 수 없습니다 — 미미르에서 복사한 코드가 맞는지 확인해 주세요."));
  }
  const mode = doc?.type === "union" ? "union" : doc?.type === "solo" ? "solo" : null;
  if (!mode) throw new Error(T("이 코드가 솔로인지 유니온인지 적혀 있지 않습니다."));
  if (!Array.isArray(doc.squads) || !doc.squads.length) {
    throw new Error(T("코드에 편성이 없습니다."));
  }
  const unknown = [];
  const decks = doc.squads.map((sq) => ({
    names: (Array.isArray(sq) ? sq : []).map((c) => {
      const nm = byCode.get(c);
      if (!nm && c != null) unknown.push(c);       // 조용히 지우지 않는다 — 몇 명인지 말한다
      return nm || null;
    }),
  }));
  return { mode, decks, elements: doc.elements || null, unknown };
}

/** 프리셋 탭의 «미미르에서 가져오기». 주소로 들어오는 길(`/m?c=…`)과 **같은 화면**으로
 *  이어 준다 — 붙여넣은 것이 코드든 주소든 코드만 뽑아 그 길로 보낸다.
 *
 *  링크는 지금 보고 있는 모드를 따라간다(솔로 ↔ 유니온) — 유니온을 보는 사람에게
 *  솔로 덱 구성 페이지를 주면 거기서 짠 코드가 이 화면에서 «솔로»로 들어온다. */
function wireMimirImport() {
  const link = $("#mimir-link");
  if (link) {
    link.href = modeNow() === "union"
      ? "https://nikkemimir.xyz/#/union-deck-builder"
      : "https://nikkemimir.xyz/#/deck-builder";
  }
  const inp = $("#mimir-code"), go = $("#mimir-go");
  if (!inp || !go || go.dataset.wired) return;
  go.dataset.wired = "1";
  const run = () => {
    const raw = inp.value.trim();
    if (!raw) { mimirMsg(T("코드를 붙여넣으세요."), "err"); return; }
    // 주소째 붙여넣어도 받는다 — `?c=`·`#c=` 뒤가 코드다.
    let code = raw;
    const m = /[?&#]c=([^&\s]+)/.exec(raw);
    if (m) code = decodeURIComponent(m[1]);
    mimirMsg("");
    inp.value = "";
    loadMimir(code);
  };
  go.onclick = run;
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } };
}

function mimirMsg(text, kind) {
  const n = $("#mimir-msg");
  if (!n) return;
  n.textContent = text || "";
  n.className = "acct-msg" + (kind ? " " + kind : "");
}

/** 미미르 코드로 들어왔을 때. 공유 화면을 그대로 쓰되 문구만 이 출처에 맞춘다. */
function loadMimir(code) {
  openShareTab();
  clearShareUrl();          // 새로 고치면 이 화면이 아니게 — 성공·실패를 가리지 않는다
  const cond = $("#share-cond"), note = $("#share-note"), mnote = $("#mimir-note");
  const body = $("#share-body"), acts = $("#share-acts");
  if (note) note.hidden = true;                       // 공유 링크 안내(딜 수치·가져오는 것)는 여기 해당 없다
  let m;
  try {
    m = decodeMimir(code);
  } catch (e) {
    if (cond) cond.textContent = T("미미르 편성 코드");
    if (body) body.textContent = "";
    if (acts) acts.hidden = true;
    if (mnote) { mnote.hidden = true; }
    shareMsg(e.message, "warn");
    return;
  }
  // 받는 쪽 모드가 다르면 먼저 맞춘다 — 안 그러면 유니온 편성이 솔로 덱으로 들어간다.
  if (m.mode !== modeNow() && (m.mode !== "union" || unionOn())) {
    setMode(m.mode, { warp: false });
    openShareTab();                                   // setMode가 편성 탭으로 보낸다 — 되돌아온다
  }
  renderMimir(m);
}

function renderMimir(m) {
  const cond = $("#share-cond"), mnote = $("#mimir-note");
  const body = $("#share-body"), acts = $("#share-acts");
  const unit = m.mode === "union" ? T("줄") : T("덱");
  if (cond) {
    cond.textContent = T("미미르 편성 · {v}", { v: m.mode === "union" ? T("유니온 레이드") : T("솔로 레이드") })
      + T(" · {length}{v}", { length: m.decks.length, v: unit })
      + (m.elements?.length ? " · " + m.elements.map(T).join(" · ") : "");
  }
  if (mnote) {
    mnote.hidden = false;
    mnote.textContent =
      T("미미르에서 온 편성입니다. 담겨 있는 것은 니케 조합뿐이라 스킬 레벨·장비·큐브·돌파는 들어오지 않습니다.")
      + (m.mode === "union" && m.elements?.length
        ? T(" 줄마다 적힌 속성은 약점이라 최신 회차({v})의 랩처로 넣습니다.",
            { v: UNION_SEASONS[UNION_SEASONS.length - 1].label })
        : "");
  }
  shareMsg(m.unknown.length
    ? T("모르는 니케 {length}명은 빈 자리로 둡니다.", { length: m.unknown.length })
    : "", m.unknown.length ? "warn" : "");
  // 공유본과 **같은 모양**으로 빚어 기존 가져오기 경로에 그대로 태운다.
  // 유니온의 `elements`는 그 줄의 **약점 속성**이다 — 회차마다 속성에 걸린 랩처가
  // 달라서 회차를 함께 정해야 뜻이 산다. 최신 회차에 넣는다(유저 결정).
  const latest = UNION_SEASONS[UNION_SEASONS.length - 1];
  const sh = {
    title: (n) => T("미미르 {n}{v} 가져오기", { n, v: unit }),
    season: m.mode === "union" ? latest.id : null,
    decks: m.decks.map((d, i) => ({
      names: d.names,
      ...(m.mode === "union" && UNION_CODES.includes(m.elements?.[i])
        ? { weak: m.elements[i] } : {}),
    })),
  };
  const extra = (i) => (sh.decks[i].weak ? { weak: sh.decks[i].weak, season: sh.season } : null);
  if (acts) {
    acts.hidden = false;
    const all = $("#share-all");
    const n = Math.min(m.decks.length, deckCountNow());
    if (all) {
      all.textContent = T("{n}{v} 전부 가져오기", { n, v: unit });
      all.onclick = () => openShareAllSheet(sh);
    }
  }
  if (!body) return;
  body.textContent = "";
  m.decks.forEach((d, i) => {
    // `rec-deck-faces` — 덱 블록은 [도넛][행목록] 두 칸 격자라 그냥 넣으면 얼굴 줄이
    // 첫 칸에 갇힌다. 캡처 기록이 같은 문제를 이 클래스로 이미 풀어 뒀다.
    const blk = el("div", "rec-deck rec-deck-faces mimir-deck");
    const head = el("div", "rec-deck-h");
    head.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
    const w = sh.decks[i].weak;
    if (w) head.append(el("span", "preset-boss", bossOf(w)?.name || w));
    blk.append(head);
    // 이름만 늘어놓으면 «누가 들었는지»가 한눈에 안 온다 — 프리셋과 같은 얼굴 띠를 쓴다
    // (`faceStrip`이 이름표까지 붙인다). 모르는 니케는 «?» 칸으로 남아 눈에 띈다.
    blk.append(faceStrip(d.names));
    const bar = el("div", "share-deck-act");
    bar.append(mkBtn(T("이 {v} 가져오기", { v: unit }), "btn-primary",
      () => sharePickBox(i, d.names, blk, extra(i))));
    blk.append(bar);
    body.append(blk);
  });
}

// ── 공유된 편성 받기 ────────────────────────────────────────────────────

/** 공유 화면으로 들어간다. 탭은 이때 처음 나타난다 — 평소에는 없는 탭이다. */
function openShareTab() {
  const tab = $("#tab-share");
  if (!tab) return;
  tab.hidden = false;
  tab.click();
}

async function loadShared(code) {
  openShareTab();
  // 주소는 **곧바로** 지운다. 목적이 «새로 고치면 이 화면이 아니게»이므로 성공·실패를
  // 가리지 않는다 — 만료된 링크도 새로 고침에서 오류를 되풀이하지 않아야 한다.
  clearShareUrl();
  shareMsg(T("공유된 편성을 받는 중…"));
  try {
    const res = await fetch(`/api/share?c=${encodeURIComponent(code)}`);
    const j = await readJSON(res);
    if (j.error) throw new Error(j.error);
    shared = j;
    // 공유본이 **어느 콘텐츠의 편성인지** 스스로 말한다(없으면 솔로). 받는 쪽 모드가
    // 다르면 먼저 맞춰 준다 — 안 그러면 유니온 편성이 솔로 덱으로 들어간다(실측).
    const want = j.mode === "union" ? "union" : j.mode === "museum" ? "museum" : "solo";
    if (want !== modeNow() && (want !== "union" || unionOn())) {
      setMode(want, { warp: false });
      openShareTab();                    // setMode가 편성 탭으로 보낸다 — 되돌아온다
    }
    // 뮤지엄 공유본은 보스까지 맞춘다 — «가져오기»가 그 보스의 5덱으로 들어가야 한다.
    if (want === "museum" && j.boss && museumStage(j.boss) && j.boss !== M().boss) {
      museumSetBoss(j.boss);
      openShareTab();
    }
    shareMsg("");
    renderShared();
  } catch (e) {
    shared = null;
    const body = $("#share-body");
    if (body) body.textContent = "";
    const cond = $("#share-cond");
    if (cond) cond.textContent = "—";
    shareMsg(String(e.message || e), "err");
  }
}

/** 들어올 이름 목록이 **내 어느 덱과 부딪치는가**.
 *
 *  대상 덱 자신은 통째로 덮어쓰므로 충돌이 아니다 — 그걸 세면 「내 02덱에 있는 앨리스를
 *  02덱으로 가져오는데 충돌」이라는 거짓 경고가 뜬다. 솔로레이드는 덱 간 중복이
 *  불가하므로, 다른 덱에 있는 같은 니케는 그 덱에서 비워야 한다. */
function shareConflicts(names, target) {
  const out = [];
  const want = new Set(names.filter(Boolean));
  state.decks.forEach((d, di) => {
    if (di === target) return;
    (d.names || []).forEach((n, si) => {
      if (n && want.has(n)) out.push({ name: n, deck: di, slot: si });
    });
  });
  return out;
}

/** 공유된 덱 하나를 내 덱 `target`에 넣는다. 공유는 운용을 담지 않으므로 컨트롤은 빈다. */
const importSharedDeck = (target, names) => importMapped([{ names, target }]);

/** 을/를. 니케 이름이 문장에 끼는 자리라 하나로 고정할 수 없다 —
 *  «앨리스을 비웠습니다»가 된다. 마지막 글자에 종성이 있으면 «을». */
/** 이/가. 같은 이유다 — «홍련 : 흑영가 받습니다»가 된다. */
function ga(word) {
  const ch = String(word ?? "").trim().slice(-1);
  const c = ch.charCodeAt(0);
  const jong = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return jong ? "이" : "가";
}

/** 은/는. `eul`과 같은 이유로 필요하다 — «미하라 : 본딩 체인는»이 된다. */
function eun(word) {
  const ch = String(word ?? "").trim().slice(-1);
  const c = ch.charCodeAt(0);
  const jong = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return jong ? "은" : "는";
}

function eul(word) {
  const ch = String(word ?? "").trim().slice(-1);
  const c = ch.charCodeAt(0);
  const jong = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return jong ? "을" : "를";
}

/** 이름 목록을 짧게. 다섯 명을 다 적으면 문장이 두 줄을 넘어 정작 요점이 안 읽힌다. */
const briefNames = (ns) => (ns.length <= 3
  ? ns.map(T).join(" · ")
  : T("{v} 외 {v1}명", { v: ns.slice(0, 2).map(T).join(" · "), v1: ns.length - 2 }));

// ── 주소와 화면 ─────────────────────────────────────────────────────────
// **SPA는 그대로다.** 구조를 바꾸는 것이 아니라 위에 주소 한 겹을 얹는다 — 탭을 눌러도
// 페이지는 다시 뜨지 않고, `pushState`가 주소창 글자만 바꾼다. 뒤로 가기(`popstate`)는
// 탭을 누른 것과 **같은 코드**를 부른다. 서버 왕복도, 상태를 실어 나르는 일도 없다.
// 정본은 계속 방문자 localStorage다.
//
// 주소는 **경로형**이다(`/result`). 서버가 «`/api/`가 아니고 확장자 없는 경로 →
// index.html» 폴백을 주므로(계약 §3) 새로고침·직접 링크로도 그 화면에 선다.
// 깊이가 2인 주소(`/deck/3`)가 있어 index.html에 `<base href="/">`가 필요하다 —
// 자산 링크가 전부 상대경로라 기준이 `/deck/`가 되면 통째로 404다. 공유 링크
// `/s?c=…`는 지금 모양 그대로 둔다(SITE.md §5).
//
// 화면 이름은 **언어 중립 영문 슬러그**다 — 주소에 한글이 드러나면 언어마다 링크가
// 달라진다. 기본 화면(솔로 편성 1덱)은 `/`다. 유니온은 `union`을 앞에 붙여 모드까지
// 주소가 들고 있게 한다 — 안 그러면 새로고침에 솔로로 떨어진다.
const ROUTE_TAB = {
  deck: "deck", result: "result", records: "log", presets: "preset",
  power: "coop", account: "account", feedback: "feedback",
};
const TAB_ROUTE = Object.fromEntries(Object.entries(ROUTE_TAB).map(([slug, tab]) => [tab, slug]));

/** 주소에 싣는 니케 조각. 로스터가 들고 오는 **영문 슬러그**(`rapi-red-hood`)를 쓴다 —
 *  그림 파일 이름과 같은 슬러그라 주소와 자산이 한 규칙으로 움직인다(web/build.py).
 *
 *  신원 자체는 여전히 한국어 이름이다(계산 요청·프로필·공유가 전부 그 키다) — 여기서만
 *  주소용 이름으로 바꿔 싣고 읽을 때 되돌린다. 사전에 없는 니케는 한국어 이름을 그대로
 *  싣고, 읽을 때도 **두 가지를 다 받는다** — 옛 링크가 죽지 않게. */
const nameToSeg = (name) => byName.get(name)?.slug || encodeURIComponent(name);
const segToName = (seg) => {
  if (!seg) return null;
  const bySlug = ROSTER.find((r) => r.slug && r.slug === seg.toLowerCase());
  if (bySlug) return bySlug.name;
  let want;
  try { want = decodeURIComponent(seg); } catch { return null; }
  return byName.has(want) ? want : null;
};

// 주소를 화면에 되돌리는 동안 참. 이때 일어나는 탭 전환은 히스토리에 안 쌓는다 —
// 안 그러면 뒤로 가기 한 번이 항목을 새로 만들어 앞으로 나아가지 못한다.
let routing = false;

/** 지금 서 있는 탭. */
const tabNow = () => document.querySelector(".tab.on")?.dataset.tab || "deck";

/** 지금 화면을 경로로. 기본값은 적지 않는다 — 주소가 짧아야 읽힌다.
 *
 *      /            편성(솔로 1덱)      /result     /records   /presets
 *      /deck/3      편성 3덱            /power      /account   /feedback
 *      /deck/grid   배치모드            /power/<니케> 그 니케의 전투력 계산 화면
 *                                       /union · /union/result · …
 */
function routePath() {
  const union = modeNow() === "union";
  const slug = TAB_ROUTE[tabNow()] || "deck";
  const parts = [];
  if (union) parts.push("union");
  if (modeNow() === "museum") parts.push("museum");   // 그 뒤는 솔로와 같은 문법(/museum/deck/3)
  // 아레나는 화면이 하나뿐이라 주소도 `/arena` 하나다 — 덱 번호도 배치모드도 없다.
  if (modeNow() === "arena") return "/arena";
  if (slug === "power") {
    parts.push(slug);
    // **보이는 것**을 적는다. `coop`은 뒤로 나가도 남아 있어서(coopBack이 화면만
    // 감춘다) 그걸로 판단하면 고르는 화면에서도 니케 주소가 찍힌다.
    if ($("#coop-screen")?.hidden === false && coop) parts.push(nameToSeg(coop.name));
  } else if (slug !== "deck") {
    parts.push(slug);
  } else if (!union) {
    // 배치모드는 25칸이 한 화면에 있어 «지금 고른 덱»이 없다 — 둘을 같이 적으면
    // 돌아왔을 때 어느 쪽이 이겼는지 모호해진다. 유니온은 세 줄이 통째로 한 화면이라
    // 고른 덱이라는 개념 자체가 없다.
    // **1덱도 적는다.** `/`를 1덱으로 쓰면 링크가 가리키는 화면과 열리는 화면이
    // 달라진다 — `/`는 덱 번호를 안 담으므로 저장해 둔 덱이 뜬다(실측: 3덱에서 1덱을
    // 누르면 `/`가 되는데 그 링크를 다시 열면 5덱이 떴다). `/`는 «첫 진입»이지
    // «1덱»이 아니다.
    if (fastMode) parts.push("deck", "grid");
    else parts.push("deck", String((state.settings.deck || 0) + 1));
  }
  return "/" + parts.join("/");
}

/** 지금 화면을 주소에 적는다. `replace`면 히스토리 항목을 더하지 않는다. */
function syncRoute(replace = false) {
  if (routing) return;
  // 공유 열람 화면은 주소를 갖지 않는다 — 링크로 한 번 보는 화면이고 페이로드는
  // 메모리에만 있다(`clearShareUrl` 주석과 같은 이유). 주소를 적어 봐야 새로
  // 고치면 빈 화면이 된다.
  if (tabNow() === "share") return;
  // 우리 것이 아닌 질의문은 그대로 들고 간다 — 이관 미리보기처럼 밖에서 붙여 주는
  // 값이 라우팅 한 번에 조용히 날아가면 안 된다. 공유 코드만 뗀다(화면 주소가 아니다).
  const q = new URLSearchParams(location.search);
  q.delete("c");
  const qs = q.toString();
  const url = routePath() + (qs ? "?" + qs : "");
  if (url === location.pathname + location.search) return;   // 같은 주소면 쌓지 않는다
  try { history[replace ? "replaceState" : "pushState"](null, "", url); }
  catch { /* 파일 프로토콜 등 */ }
}

/** 주소에 적힌 화면으로 선다. 뒤로/앞으로 가기와 첫 로딩이 함께 쓴다. */
function applyRoute() {
  // 방금 «뒤로 가기»가 시트를 닫는 데 쓰였으면 화면은 안 옮긴다 — 닫으면서 주소가
  // 바뀐 것이 아니므로 여기서 또 그리면 헛일이고, 되감기(`history.back()`)가 만드는
  // popstate까지 화면 전환으로 읽힌다.
  if (routeSkip) { routeSkip = false; return; }
  const segs = location.pathname.split("/").filter(Boolean);
  const wantUnion = segs[0] === "union";
  const wantMuseum = segs[0] === "museum";
  const wantArena = segs[0] === "arena";
  const head = wantUnion || wantMuseum || wantArena ? 1 : 0;
  const slug = segs[head] || "deck";
  routing = true;
  try {
    // 모드가 먼저다 — `setMode`가 편성 탭으로 되돌리므로 탭보다 앞서야 한다.
    const m = wantUnion && unionOn() ? "union" : wantMuseum ? "museum"
      : wantArena ? "arena" : "solo";
    if (m !== modeNow()) setMode(m, { warp: false });
    // 덱 번호·배치모드는 솔로와 뮤지엄이 같은 문법이다
    if (modeNow() !== "union" && slug === "deck") {
      const rest = segs[head + 1];
      const grid = rest === "grid";
      if (grid !== fastMode) setFastMode(grid);
      const n = Number(rest);
      if (!grid && Number.isInteger(n) && n >= 1 && n <= DECK_COUNT) {
        state.settings.deck = n - 1;
      }
    }
    // 모르는 이름은 첫 화면으로 떨어뜨린다 — 오타난 링크에 빈 화면을 주지 않는다.
    document.querySelector(`.tab[data-tab="${ROUTE_TAB[slug] || "deck"}"]`)?.click();
    if (slug === "power") {
      // `/power/라피 : 레드 후드` → 그 니케를 열고, `/power` → 고르는 화면으로.
      // 모르는 이름은 조용히 고르는 화면이다(오타난 링크에 빈 판을 주지 않는다).
      const want = segToName(segs[head + 1]);
      if (want) coopLoad(want, true);
      else if ($("#coop-screen")?.hidden === false) coopBack();
    }
  } finally {
    routing = false;
  }
  saveAll();
  renderAll();
  // 주소가 지금 화면과 어긋나면 바로잡는다 — 없는 덱 번호(`/deck/9`), 모르는 화면
  // 이름(`/nonsense`), 옛 한국어 니케 주소가 여기서 정리된다. `replaceState`라
  // 히스토리에 «아무 일도 안 일어나는 한 번»이 생기지 않는다.
  //
  // 맨 처음의 `/`만 예외다 — 아무것도 안 했는데 주소가 `/deck/5`로 바뀌면 놀란다.
  if (location.pathname !== "/" && location.pathname !== routePath()) syncRoute(true);
}

/** 뒤로/앞으로 가기를 화면 전환으로 잇는다. */
function wireRoute() {
  addEventListener("popstate", applyRoute);
}

/** 방금 popstate가 «시트 닫기»에 쓰였나 — `applyRoute`가 건너뛸 표. */
let routeSkip = false;
/** 우리가 히스토리에 밀어 넣은 시트 항목 수. */
let sheetPushed = 0;
/** 방금 «시트를 닫아서» 되감는 중인가.
 *
 *  시트를 닫으면 밀어 넣었던 항목을 `history.back()`으로 되감는데, 그 popstate가
 *  **아래에 겹쳐 있던 시트까지 닫아 버렸다**(실측: 회차 시트에서 «고치기»로 연 보스
 *  설정을 닫으면 회차 시트도 함께 닫혔다). 되감기는 내가 쏜 것이니 «뒤로 가기»로
 *  세면 안 된다 — 이 표로 한 번 건너뛴다. */
let sheetRewind = false;

/** **뒤로 가기 = 시트 닫기.**
 *
 *  모바일에서 팝업이 떠 있을 때 뒤로 가기를 누르면 팝업만 닫히길 기대하는데, 지금은
 *  사이트를 통째로 떠났다(피드백 2026-08-27). 손버릇이 그렇게 굳어 있어서, 시트 안에서
 *  뭘 고치다가 한 번 잘못 누르면 그대로 나가진다.
 *
 *  여는 곳을 하나도 안 고치려고 `showModal`을 감싼다. 닫는 것은 **`close` 이벤트**로
 *  잡는다 — `<form method="dialog">`로 닫는 시트(육성 수정·계정 설정)는 JS `close()`를
 *  거치지 않아서, 메서드를 감싸면 그 둘을 놓친다.
 *
 *  타임라인 뷰어는 제 몫을 이미 들고 있다(`timeline.js`) — 두 번 밀어 넣지 않게 뺀다.
 *  **`wireRoute`보다 먼저 등록해야 한다**(리스너는 등록 순서대로 불린다). */
/** 검색창 안내를 **여러 문장으로 돌린다.**
 *
 *  한 줄에 다 적었더니 좁은 화면에서 뒤가 잘려 «자음도 된다»는 말이 안 보였다(유저 지적).
 *  흐르는 글자(마키)는 읽기가 더 어렵다 — 짧은 문장 셋을 번갈아 보여 준다.
 *  **비어 있고 초점이 없을 때만** 바꾼다. 타이핑 중에 글자가 움직이면 방해가 된다. */
function wireSearchHint(sel) {
  const n = $(sel);
  if (!n) return;
  const hints = [T("니케 검색"), T("자음도 됩니다 — ㅁㅎㄹ"), T("별명도 됩니다 — 도로롱")];
  let i = 0;
  n.placeholder = hints[0];
  setInterval(() => {
    if (n.value || document.activeElement === n) return;
    i = (i + 1) % hints.length;
    n.placeholder = hints[i];
  }, 2600);
}

function wireSheetBack() {
  const mine = (d) => d instanceof HTMLDialogElement && d.id !== "tlv-sheet";
  const openOrig = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...a) {
    const was = this.open;
    openOrig.apply(this, a);
    if (!was && this.open && mine(this)) {
      try { history.pushState({ sheet: ++sheetPushed }, ""); } catch { /* file: */ }
    }
  };
  // `close`는 버블링하지 않는다 — 캡처로 받는다.
  document.addEventListener("close", (e) => {
    if (!mine(e.target)) return;
    // 뒤로 가기가 닫은 것이면 되감을 것이 없다. **표를 요소에 남긴다** — `close()`가
    // 쏘는 `close` 이벤트는 그 자리에서가 아니라 **나중에** 오므로, 전역 깃발을
    // 세웠다 지우면 이벤트가 도착할 때는 이미 지워져 있다(그래서 겹쳐 둔 시트가
    // 한 번에 둘 다 닫혔다).
    if (e.target.dataset.backClose) { delete e.target.dataset.backClose; return; }
    if (!sheetPushed) return;
    // ✕·Esc·확인으로 닫았으면 밀어 넣은 항목을 되감는다. 안 그러면 히스토리에
    // «눌러도 아무 일도 안 일어나는 뒤로 가기»가 쌓인다.
    sheetPushed--;
    routeSkip = true;
    sheetRewind = true;
    // 되감기가 안 도는 자리(file: 등)에서 표가 남으면 **다음 진짜 뒤로 가기**를
    // 잡아먹는다. 한 박자 뒤에 스스로 푼다.
    setTimeout(() => { sheetRewind = false; }, 400);
    try { history.back(); } catch { /* file: */ }
  }, true);
  // **바깥을 눌러도 닫힌다.** 시트에서 사람이 기본으로 기대하는 동작인데 `<dialog>`는
  // 해 주지 않는다. 이걸로 닫는 네 갈래가 다 갖춰진다 — ✕ · Esc · 바깥 · 뒤로 가기.
  //
  // **자리로 판단한다.** `e.target === dialog`만 보면 시트 안쪽의 빈 자리(패딩)를 눌러도
  // 대상이 dialog라 닫혀 버린다. 누른 점이 시트 상자 밖일 때만 닫는다.
  document.addEventListener("click", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDialogElement) || !d.open || !mine(d)) return;
    const r = d.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right
        && e.clientY >= r.top && e.clientY <= r.bottom) return;
    d.close();
  });
  addEventListener("popstate", () => {
    // 내가 쏜 되감기면 아래 시트를 건드리지 않는다 — 겹쳐 둔 것이 함께 닫힌다.
    if (sheetRewind) { sheetRewind = false; return; }
    const open = [...document.querySelectorAll("dialog[open]")].filter(mine);
    if (!open.length) return;
    const top = open[open.length - 1];   // 여럿 겹쳐 있으면 맨 위 하나만
    sheetPushed = Math.max(0, sheetPushed - 1);
    top.dataset.backClose = "1";
    top.close();
    routeSkip = true;
  });
}

/** 주소에서 공유 코드를 뗀다. **화면을 띄우자마자 부른다.**
 *
 *  공유 화면은 «링크를 눌러 한 번 보는 화면»이다. 주소에 코드가 남아 있으면 새로
 *  고칠 때마다 이 화면으로 돌아와, 평소 화면으로 가려면 매번 탭을 다시 눌러야 한다.
 *  주소를 지우면 새로 고침이 평소 화면으로 간다 — 링크 원본은 받은 사람이 카톡·
 *  디스코드에 그대로 갖고 있으므로 잃는 것이 없다.
 *
 *  화면 자체는 지우지 않는다. 이미 받아 둔 편성이 메모리에 남아 있어서, 주소가
 *  정리된 뒤에도 덱을 하나씩 이어서 가져올 수 있다.
 *
 *  `pushState`가 아니라 `replaceState`다 — 히스토리에 항목을 더하면 뒤로 가기가
 *  «아무 일도 안 일어나는 한 번»을 먹는다. */
function clearShareUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has("c")) return;
  // **`c`만 뗀다.** 예전엔 질의문을 통째로 지웠는데, 그러면 화면 주소(`?t=…`)까지
  // 같이 날아가 공유 링크를 한 번 열었다가 다른 탭으로 가면 주소가 비어 버린다.
  q.delete("c");
  const qs = q.toString();
  try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); }
  catch { /* 파일 프로토콜 등 */ }
}

/** 가져온 결과를 사람 문장으로. 「몇 명 들어갔고, 어디서 비웠고, 누가 빠졌는지」 */
function importReport(res) {
  const parts = [T("{count}명을 넣었습니다.", { count: res.count })];
  if (res.shifted?.length) {
    parts.push(T("원래 있던 편성은 {v}", { v: res.shifted.map((x) => T("{v}덱→{v1}덱", { v: x.from + 1, v1: x.to + 1 })).join(" · ") })
               + T("으로 옮겼습니다."));
  }
  if (res.lost?.length) {
    parts.push(T("빈 덱이 없어 {v}의 편성은 사라졌습니다.", { v: res.lost.map((t) => T("{v}덱", { v: t + 1 })).join(" · ") }));
  }
  if (res.moved.length) {
    // 니케마다 «이름(N덱)»을 늘어놓으면 같은 덱 번호가 다섯 번 반복된다 — 덱으로 묶는다
    const byDeck = new Map();
    for (const c of res.moved) {
      if (!byDeck.has(c.deck)) byDeck.set(c.deck, []);
      byDeck.get(c.deck).push(c.name);
    }
    const where = [...byDeck.entries()].sort((a, b) => a[0] - b[0])
      .map(([d, ns]) => T("{v}덱에서 {v1}", { v: d + 1, v1: briefNames([...new Set(ns)]) }));
    const list = where.join(", ");
    parts.push(T("덱 간 중복이라 {list}{v} 비웠습니다.", { list, v: eul(list) }));
  }
  if (res.missing.length) {
    const who = [...new Set(res.missing)];
    parts.push(T("내 계정에 없는 {length}명은 빈 자리입니다 — {v}.", { length: who.length, v: briefNames(who) }));
  }
  // 공유본 **자체가** 덱 간 중복을 갖고 있을 수 있다 — 사이트는 중복 편성도 경고만 하고
  // 저장을 허용한다. 편성 탭의 중복 경고를 보기 전에 여기서 먼저 말해 준다.
  if (res.dup?.length) {
    parts.push(T("공유된 편성에 덱 간 중복이 있습니다 — {v}.", { v: briefNames(res.dup) })
               + T(" 솔로레이드에서는 불가능한 편성이니 한쪽을 바꿔야 합니다."));
  }
  parts.push(T("수치는 내 계정으로 다시 계산해야 합니다."));
  return parts.join(" ");
}

/** 대상 덱 고르개. 덱 블록 안에서 펼친다 — 모달로 띄우면 원본 편성이 가려진다. */
function sharePickBox(srcIdx, names, host, extra = null) {
  // 열려 있던 고르개를 다시 누르면 접는다. 다만 **이미 가져온 결과 상자**는 «열린 고르개»가
  // 아니다 — 그걸 접기로 세면 다른 덱으로 한 번 더 가져올 수가 없다.
  const open = host.querySelector(".share-pick:not(.done)");
  for (const x of document.querySelectorAll(".share-pick")) x.remove();
  if (open) return;

  const box = el("div", "share-pick");
  box.append(el("p", "share-pick-h",
    T("«{v}» 편성을 내 어느 덱으로 가져올까요?", { v: String(srcIdx + 1).padStart(2, "0") })));
  const inNames = names.filter(Boolean);
  box.append(el("p", "share-pick-src", inNames.map(T).join(" · ") || T("빈 덱")));

  let target = state.settings.deck;
  const rows = el("div", "share-targets");
  const foot = el("div", "share-pick-foot");
  const go = mkBtn(T("가져오기"), "btn-amber", () => {
    // `extra`는 미미르처럼 **편성 말고도 딸려 오는 것**이다(약점 속성). 없으면 예전 그대로.
    if (extra?.season != null && extra.season !== unionSeason().id
        && UNION_SEASONS.some((x) => x.id === extra.season)) {
      U().season = extra.season;
    }
    const res = extra?.weak
      ? importMapped([{ names, target, weak: extra.weak }])
      : importSharedDeck(target, names);
    const kind = res.missing.length || res.moved.length ? "warn" : "ok";
    const text = T("«내 {v}덱»에 {v1}", { v: target + 1, v1: importReport(res) });
    // 결과는 **누른 자리에** 남긴다 — 아래쪽 덱에서 누른 사람은 화면 맨 위 문구를 못 본다
    box.textContent = "";
    box.className = `share-pick done ${kind}`;
    box.append(el("p", "share-pick-done", text));
    shareMsg(text, kind);
  });

  const paint = () => {
    rows.textContent = "";
    // **지금 모드의 덱**을 대상으로 삼는다. 유니온에서 가져왔는데 솔로 덱에 들어가면
    // 「가져왔다는데 화면엔 없다」가 된다(실측).
    for (let i = 0; i < deckCountNow(); i++) {
      const mine = (deckAt(i)?.names || []).filter(Boolean);
      const hit = shareConflicts(names, i);
      const row = el("button", "share-target" + (i === target ? " on" : ""));
      row.type = "button";
      row.setAttribute("aria-pressed", String(i === target));
      row.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
      const mid = el("span", "share-target-mid");
      mid.append(el("span", "share-target-now", mine.length ? mine.join(" · ") : T("빈 덱")));
      const note = el("span", "share-target-note" + (hit.length ? " warn" : ""));
      if (hit.length) {
        const from = [...new Set(hit.map((c) => c.deck))].sort((a, b) => a - b);
        note.textContent = T("충돌 {length}명 — {v}", { length: hit.length, v: from.map((x) => x + 1 + T("덱")).join(" · ") })
          + T("에서 비웁니다");
      } else {
        note.textContent = T("충돌 없음");
      }
      mid.append(note);
      row.append(mid);
      row.onclick = () => { target = i; paint(); go.textContent = T("{v}덱에 가져오기", { v: i + 1 }); };
      rows.append(row);
    }
  };
  paint();
  box.append(rows);

  const missing = inNames.filter((n) => !haveChar(n));
  if (missing.length) {
    box.append(el("p", "share-pick-note",
      T("내 계정에 없는 {length}명은 빈 자리로 들어갑니다 — {v}.", { length: missing.length, v: missing.map((n) => T(n)).join(" · ") })));
  }
  go.textContent = T("{v}덱에 가져오기", { v: target + 1 });
  foot.append(mkBtn(T("취소"), "btn-ghost", () => box.remove()));
  foot.append(go);
  box.append(foot);
  host.append(box);
}

/** 내 계정에 있는 것만 남긴 5칸 배열. 없는 니케는 **빈 자리**로 둔다. */
function fitNames(names, missing) {
  const kept = [];
  for (const nm of (names || []).slice(0, SLOTS)) {
    if (!nm) { kept.push(null); continue; }
    if (haveChar(nm)) kept.push(nm);
    else { kept.push(null); if (missing) missing.push(nm); }
  }
  while (kept.length < SLOTS) kept.push(null);
  return kept;
}

/** 공유된 덱 여러 개를 내 같은 번호 덱에 덮는다. `which`는 덱 번호 목록(없으면 전부). */
/** 공유본에 보스·레이드 설정이 들어 있나 — 「편성 + 보스 설정」을 고를 수 있는지. */
const sharedHasBoss = (sh) =>
  // `battle`(레이드 설정)뿐 아니라 `weak`(약점 속성)만 있어도 «보스가 담긴» 것이다 —
  // 미미르 코드는 줄마다 약점 속성만 싣는다. 속성이 곧 그 회차의 랩처다(bossOf).
  modeNow() === "union" && (sh?.decks || []).some((d) => d && (d.battle || d.weak));

function importSharedAll(sh, which, withBoss = false) {
  const all = [...Array(Math.min(sh.decks.length, deckCountNow())).keys()];
  const idx = (which && which.length ? [...which] : all).sort((a, b) => a - b);
  // **회차를 먼저 옮긴다.** 회차마다 속성에 걸린 랩처가 달라, 지금 보던 회차에 그대로
  // 넣으면 남의 회차 방어력이 엉뚱한 랩처에 붙는다(보스 공유와 같은 이유).
  if (withBoss && sh.season != null && sh.season !== unionSeason().id) {
    const known = sh.season === CUSTOM_SEASON || UNION_SEASONS.some((x) => x.id === sh.season);
    if (known) U().season = sh.season;
  }
  return importMapped(idx.map((i) => ({
    names: sh.decks[i]?.names,
    target: i,
    ...(withBoss ? { weak: sh.decks[i]?.weak, battle: sh.decks[i]?.battle } : {}),
  })));
}

/** **편성을 내 덱에 넣는 단 하나의 경로.** 공유·프리셋이 모두 이걸 부른다 —
 *  덱 간 중복 처리를 두 벌 두면 한쪽만 고쳐져서 조용히 갈린다.
 *
 *  `entries` = `[{names, target}]`
 *
 *  - 내 계정에 없는 니케는 **빈 자리**로 둔다 (자리를 당기지 않는다 — 누가 비었는지 보여야 한다)
 *  - **대상 덱에 있던 편성은 버리지 않고 빈 덱으로 옮긴다.** 3덱에 넣는다고 3덱에 짜
 *    두었던 편성이 사라지면, 되돌릴 방법이 없다. 빈 덱이 없을 때만 사라진다(그때는 말해 준다)
 *  - **덮이지 않는 덱에서만** 같은 니케를 비운다. 덱을 하나씩 넣으면 앞서 넣은 덱에서
 *    다시 비우는 일이 생긴다(들어오는 편성 안에 같은 니케가 두 번 있으면)
 *  - **컨트롤은 비운다.** 공유도 프리셋도 운용을 담지 않으므로 «전부 자동»에서 시작한다
 *  - `opts.cond`가 있으면 약점 코드·전투 시간까지 되돌린다. **기록만** 이걸 쓴다 —
 *    기록은 «그 조건에서 이 수치가 나왔다»는 뜻이라 조건을 떼면 수치를 읽을 수 없다
 *
 *  결과 캐시는 따로 지우지 않아도 된다: 지문(`fingerprint`)에 `names`가 들어 있어서
 *  이름이 바뀐 덱은 자동으로 «계산 안 된 덱»이 된다. */
function importMapped(entries, opts = {}) {
  const missing = [], moved = [];
  const union = modeNow() === "union";
  const nDecks = deckCountNow();
  const incoming = new Map();          // 내 덱 번호 → 이름 5칸
  // 유니온은 «어느 보스를 어떤 조건으로» 까지가 한 편성이다 — 따로 실어 둔다.
  const extra = new Map();
  for (const e of entries || []) {
    const t = Number(e?.target);
    if (!Number.isInteger(t) || t < 0 || t >= nDecks) continue;
    incoming.set(t, fitNames(e.names, missing));
    if (union && (e.weak || e.battle)) extra.set(t, { weak: e.weak, battle: e.battle });
  }
  if (!incoming.size) return { count: 0, decks: 0, missing, moved, dup: [], shifted: [], lost: [] };

  // 밀려나는 편성을 먼저 옮긴다. **비우는 것보다 먼저** 해야 한다 — 옮긴 덱도 «덮이지
  // 않는 덱»이 되어 아래 중복 비우기의 대상이 되어야 하기 때문이다.
  const { shifted, lost } = shiftDisplaced([...incoming.keys()]);

  const want = new Set([...incoming.values()].flat().filter(Boolean));
  for (let i = 0; i < nDecks; i++) {
    if (incoming.has(i)) continue;
    const d = deckAt(i);
    d.names.forEach((nm, si) => {
      if (!nm || !want.has(nm)) return;
      moved.push({ name: nm, deck: i, slot: si });
      d.names[si] = null;
      if (d.control) delete d.control[nm];   // 덱에서 빠진 니케의 운용은 따라다니지 않는다
    });
  }

  let count = 0;
  for (const [i, names] of incoming) {
    const d = deckAt(i);
    d.names = names;
    d.control = {};
    // 큐브는 **칸에 붙어** 있어 이름만 갈면 앞 편성이 쓰던 것이 새 니케 밑에 남는다.
    // 계정이 그 니케에 끼워 둔 큐브로 채우고, 모르면 기본값으로 되돌린다(유저 지시
    // 2026-08-30 — 제보 «프리셋 불러올 때 큐브가 적용되지 않음»).
    d.cubes = names.map((nm) => (nm ? equippedCube(nm) : null));
    count += names.filter(Boolean).length;
    // 보스·레이드 설정은 **있을 때만** 덮는다. 옛 프리셋(편성만 담긴 것)을 불러왔다고
    // 지금 걸어 둔 보스가 지워지면 안 된다.
    const ex = extra.get(i);
    // 회차의 기억(`seasonPicks`)에도 남긴다 — 안 남기면 회차를 갔다 오는 순간
    // 방금 가져온 보스가 사라진다(회차를 바꿀 때 기억으로 다시 맞추기 때문).
    if (ex?.weak && UNION_CODES.includes(ex.weak)) { d.weak = ex.weak; seasonPicks()[i] = ex.weak; }
    if (ex?.battle) d.battle = JSON.parse(JSON.stringify(ex.battle));
  }

  if (opts.cond) applyCond(opts.cond.code, opts.cond.duration);

  if (!union) state.settings.deck = [...incoming.keys()].sort((a, b) => a - b)[0] ?? 0;
  else uBattleRow = [...incoming.keys()].sort((a, b) => a - b)[0] ?? 0;
  ctrlOpen = null; picked = null;
  saveAll(); renderAll();

  const seen = new Map();
  for (const nm of [...incoming.values()].flat()) if (nm) seen.set(nm, (seen.get(nm) || 0) + 1);
  const dup = [...seen].filter(([, c]) => c > 1).map(([nm]) => nm);
  return { count, decks: incoming.size, missing, moved, dup, shifted, lost };
}

/** 대상 덱에 있던 편성을 빈 덱으로 옮긴다. 반환: 옮긴 목록과 옮길 자리가 없던 덱.
 *
 *  빈 덱을 앞에서부터 쓰고, **대상으로 지정된 덱은 자리로 쓰지 않는다** — 곧 덮일
 *  자리에 옮겨 두면 옮긴 의미가 없다. 미리보기(`planDisplaced`)와 **같은 규칙**이어야
 *  한다: 화면이 「5덱으로 옮깁니다」라고 했으면 실제로 5덱에 있어야 한다. */
function shiftDisplaced(targets) {
  const set = new Set(targets);
  const free = [...Array(deckCountNow()).keys()]
    .filter((i) => !set.has(i) && !deckAt(i).names.some(Boolean));
  const shifted = [], lost = [];
  for (const t of [...set].sort((a, b) => a - b)) {
    const d = deckOf(t);
    if (!d.names.some(Boolean)) continue;
    const to = free.shift();
    if (to === undefined) { lost.push(t); continue; }
    const dst = deckOf(to);
    dst.names = [...d.names];
    dst.control = structuredClone(d.control || {});
    // 큐브도 함께 옮긴다 — 안 옮기면 밀려난 편성이 남의 칸에 앉아 큐브만 바뀐다.
    dst.cubes = structuredClone(d.cubes || Array(SLOTS).fill(null));
    d.names = Array(SLOTS).fill(null);
    d.control = {};
    d.cubes = Array(SLOTS).fill(null);
    shifted.push({ from: t, to });
  }
  return { shifted, lost };
}

/** 대상 덱이 겹치지 않게 자리를 다시 나눈다.
 *
 *  「내 2덱」을 골랐는데 다른 행이 이미 2덱을 쓰고 있으면, **방금 고른 쪽을 살리고**
 *  그 행을 빈 자리로 밀어낸다. 「겹칩니다, 다시 고르세요」로 막으면 사용자가 순서를
 *  스스로 풀어야 한다 — 자리는 어차피 남아 있으므로 화면이 풀어 주는 게 맞다.
 *
 *  `keep`은 방금 손댄 행이다. 그 행의 선택은 건드리지 않는다.
 *  밀어낼 자리는 **비어 있는 덱을 먼저** 고른다 — 짜 둔 편성이 덮일 확률을 줄인다.
 *  (행 수는 덱 수를 넘지 않으므로 자리는 늘 남는다.) */
function dedupeTargets(pick, on, keep) {
  const order = [keep, ...pick.map((_, k) => k).filter((k) => k !== keep)];
  const used = new Set();
  for (const k of order) {
    if (!on[k]) continue;
    if (!used.has(pick[k])) { used.add(pick[k]); continue; }
    const cand = [...Array(deckCountNow()).keys()].filter((x) => !used.has(x));
    const to = cand.find((x) => !deckAt(x).names.some(Boolean)) ?? cand[0];
    if (to === undefined) continue;                 // 자리가 없다 — 경고가 대신 잡는다
    pick[k] = to;
    used.add(to);
  }
}

/** 옮김 계획을 **미리** 계산한다 (실제로 옮기지는 않는다). 시트의 미리보기가 쓴다. */
function planDisplaced(targets) {
  const set = new Set(targets);
  const free = [...Array(deckCountNow()).keys()]
    .filter((i) => !set.has(i) && !deckAt(i).names.some(Boolean));
  const shifted = [], lost = [];
  for (const t of [...set].sort((a, b) => a - b)) {
    if (!deckOf(t).names.some(Boolean)) continue;
    const to = free.shift();
    if (to === undefined) lost.push(t);
    else shifted.push({ from: t, to });
  }
  return { shifted, lost };
}

/** 전부 가져오기 시트. **되돌릴 수 없는 조작이라 미리 보여 준다** —
 *  어느 덱이 덮이고, 어느 덱에서 누가 비워지고, 누가 빠지는지. */
function openShareAllSheet(sh) {
  const dlg = $("#share-sheet");
  const body = $("#share-sheet-body");
  const go = $("#share-sheet-go");
  if (!dlg || !body || !go) return;
  const n = Math.min(sh.decks.length, deckCountNow());
  const pick = new Set([...Array(n).keys()]);          // 기본은 전부 고른 상태
  // 보스 설정이 담겨 있으면 **받는 쪽이 고른다**(유저 지시 2026-08-28) — 남의 보스
  // 조건이 내 화면을 말없이 덮으면 안 되고, 그렇다고 늘 빼면 유니온 편성은 뜻이
  // 반만 온다. 기본은 «함께»다.
  const hasBoss = sharedHasBoss(sh);
  let withBoss = hasBoss;

  const paint = () => {
    const t = $("#share-sheet-t");
    // 제목은 **어디서 온 편성인지**를 말한다. 공유 링크가 아닌 것(미미르)이 «공유된»으로
    // 뜨면 출처를 잘못 알려 주는 셈이다 — 부르는 쪽이 제목을 줄 수 있게 열어 둔다.
    if (t) t.textContent = sh.title ? sh.title(n) : T("공유된 {n}덱 가져오기", { n });
    body.textContent = "";
    body.append(el("p", "prose prose-sm",
      T("고른 덱이 내 같은 번호 덱을 덮습니다. 들어가는 것은 편성뿐이고 컨트롤은")
      + T(" «전부 자동»이 됩니다 — 수치는 편성 탭에서 다시 계산하세요.")));
    if (hasBoss) {
      body.append(el("p", "prose prose-sm",
        T("이 공유본에는 보스와 레이드 설정도 담겨 있습니다 — 무엇을 가져올지 고르세요.")));
      const opt = el("div", "share-boss-opt");
      for (const [v, label] of [[true, T("편성 + 보스 설정")], [false, T("편성만")]]) {
        const chip = el("button", "chip" + (withBoss === v ? " on" : ""), label);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(withBoss === v));
        chip.title = v ? T("어느 줄에 어느 보스를 올렸는지와 그 줄의 방어력·구간까지 들어갑니다")
                       : T("지금 걸어 둔 보스와 레이드 설정은 그대로 둡니다");
        chip.onclick = () => { withBoss = v; paint(); };
        opt.append(chip);
      }
      body.append(opt);
    }

    const list = el("div", "share-pairs");
    for (let i = 0; i < n; i++) {
      const on = pick.has(i);
      const src = (sh.decks[i].names || []).filter(Boolean);
      const mine = (state.decks[i]?.names || []).filter(Boolean);
      const row = el("button", "share-pair" + (on ? " on" : ""));
      row.type = "button";
      row.setAttribute("aria-pressed", String(on));
      row.append(el("span", "share-pair-ck", on ? "✓" : ""));
      row.append(el("span", "rec-no", String(i + 1).padStart(2, "0")));
      const mid = el("span", "share-pair-mid");
      mid.append(el("span", "share-pair-src", src.join(" · ") || T("빈 덱")));
      mid.append(el("span", "share-pair-dst" + (on ? " on" : ""),
        on ? T("내 {v}덱을 덮습니다 — 지금 {v1}", { v: i + 1, v1: mine.length ? mine.map((n) => T(n)).join(" · ") : T("빈 덱") })
           : T("가져오지 않습니다 — 내 {v}덱은 그대로", { v: i + 1 })));
      row.append(mid);
      row.onclick = () => { if (on) pick.delete(i); else pick.add(i); paint(); };
      list.append(row);
    }
    body.append(list);

    // 미리보기 — 고른 조합이 무엇을 비우고 무엇을 빈 자리로 남기는가
    const idx = [...pick].sort((a, b) => a - b);
    const names = idx.flatMap((i) => (sh.decks[i].names || []).filter(Boolean));
    const missing = [...new Set(names.filter((x) => !haveChar(x)))];
    const want = new Set(names.filter(haveChar));
    const emptied = new Map();
    for (let i = 0; i < deckCountNow(); i++) {
      if (pick.has(i)) continue;
      for (const nm of (deckAt(i)?.names || [])) {
        if (!nm || !want.has(nm)) continue;
        if (!emptied.has(i)) emptied.set(i, []);
        emptied.get(i).push(nm);
      }
    }
    const notes = el("div", "share-sheet-notes");
    if (emptied.size) {
      const where = [...emptied.entries()].sort((a, b) => a[0] - b[0])
        .map(([d, ns]) => T("{v}덱에서 {v1}", { v: d + 1, v1: briefNames([...new Set(ns)]) })).join(", ");
      notes.append(el("p", "share-pick-note warn",
        T("덱 간 중복이라 {where}{v} 비웁니다.", { where, v: eul(where) })));
    }
    if (missing.length) {
      notes.append(el("p", "share-pick-note",
        T("내 계정에 없는 {length}명은 빈 자리로 들어갑니다 — {v}.", { length: missing.length, v: briefNames(missing) })));
    }
    if (!pick.size) {
      notes.append(el("p", "share-pick-note warn", "가져올 덱을 하나 이상 고르세요."));
    }
    body.append(notes);

    go.disabled = !pick.size;
    go.textContent = pick.size === n ? T("{n}덱 전부 가져오기", { n }) : T("{size}덱 가져오기", { size: pick.size });
  };
  paint();

  const close = () => dlg.close();
  $("#share-sheet-x").onclick = close;
  $("#share-sheet-cancel").onclick = close;
  go.onclick = () => {
    const idx = [...pick].sort((a, b) => a - b);
    if (!idx.length) return;
    close();
    const res = importSharedAll(sh, idx, hasBoss && withBoss);
    shareMsg(T("내 {decks}덱에 {v}", { decks: res.decks, v: importReport(res) }),
             res.missing.length || res.moved.length || res.dup?.length ? "warn" : "ok");
  };
  if (!dlg.open) dlg.showModal();
}

function renderShared() {
  const sh = shared;
  const body = $("#share-body");
  const acts = $("#share-acts");
  const cond = $("#share-cond");
  if (!sh || !body) return;
  if (cond) {
    cond.textContent = T("{v} · {duration}초 · {length}덱", { v: sh.code || T("속성 없음"), duration: sh.duration, length: sh.decks.length })
      + T(" · 합계 {v}", { v: I18N.dmg(sh.total) });
  }
  if (acts) {
    acts.hidden = false;
    const all = $("#share-all");
    const n = Math.min(sh.decks.length, deckCountNow());
    if (all) {
      all.textContent = T("{n}{v} 전부 가져오기", { n, v: modeNow() === "union" ? T("줄") : T("덱") });
      all.onclick = () => openShareAllSheet(sh);
    }
  }
  body.textContent = "";
  body.append(recDetail(sh, {
    deckAction: (i, blk) => {
      const bar = el("div", "share-deck-act");
      bar.append(mkBtn(T("이 덱 가져오기"), "btn-primary",
        () => sharePickBox(i, sh.decks[i].names, blk)));
      blk.append(bar);
    },
  }));
}

/** 약점 코드 표시(아이콘·괄호 색)를 `state`에 맞춘다.
 *
 *  **고르개의 값만 바꾸면 안 된다.** 기록·프리셋·공유를 불러올 때 `#code`의 value만
 *  넣으면 아이콘과 괄호 색이 옛 속성 그대로 남는다 — 화면이 서로 다른 말을 한다. */
function syncCodeIco() {
  // 모서리 괄호도 같이 물들인다 (CSS가 `data-code`로 색을 고른다)
  $("#code")?.closest(".brackets")?.setAttribute("data-code", state.settings.code || "");
  const ico = $("#code-ico");
  if (!ico) return;
  const f = ELEMENT_ICON[state.settings.code];
  ico.hidden = !f;
  if (f) { ico.src = `image/icon/${f}`; ico.alt = state.settings.code; }
}

/** 편성 조건(약점 코드·전투 시간)을 한꺼번에 적용한다. 기록·프리셋·공유가 함께 쓴다. */
function applyCond(code, duration) {
  if (code != null) {
    if (modeNow() === "union") U().code = code; else state.settings.code = code;
    const sel = $("#code");
    if (sel) sel.value = code;
    syncCodeIco();
  }
  if (duration != null) {
    setDuration(Math.min(600, Math.max(10, Number(duration) || 180)));
    const dur = $("#duration");
    if (dur) dur.value = durationNow();
  }
}

// ── 초기화 ──────────────────────────────────────────────────────────────
function bindChrome() {
  const sel = $("#code");
  for (const c of CODES) {
    const o = el("option", null, c || T("속성 없음"));
    o.value = c;
    sel.append(o);
  }
  sel.value = state.settings.code;
  syncCodeIco();
  sel.onchange = () => {
    state.settings.code = sel.value;
    syncCodeIco(); saveAll(); renderAll();
  };

  const dur = $("#duration");
  dur.value = durationNow();
  dur.onchange = () => {
    setDuration(Math.min(600, Math.max(10, Number(dur.value) || 180)));
    dur.value = durationNow();
    syncBattleChrome(); saveAll(); renderAll();
  };

  $("#profile-pick").onchange = (e) => {
    state.settings.profileId = e.target.value;
    saveAll(); renderProfiles(); renderAll();
    // 전투력 계산기는 시작값을 계정에서 가져온다 — 계정이 바뀌면 다시 불러온다
    if (coop && !$("#coop-screen").hidden) coopLoad(coop.name);
  };
  $("#acct-cog").onclick = () => openAcctSheet();
  // 연출 끄기 — 누르는 즉시 반영한다. 다음 새로고침까지 기다릴 이유가 없다.
  $("#fx-toggle").onclick = () => {
    state.settings.fx = !fxOn();
    saveAll();
    applyFx();
  };
  $("#dororong-toggle").onclick = () => {
    state.settings.dororong = !dororongOn();
    saveAll();
    applyDororongTheme();
  };
  document.addEventListener("visibilitychange", () => {
    syncDororongPlayground({ immediate: !document.hidden });
  });
  window.matchMedia?.("(prefers-reduced-motion: reduce)")
    ?.addEventListener?.("change", () => syncDororongPlayground());
  $("#acct-revert").onclick = () => {
    const rec = activeRec();
    if (!rec?.edits?._account) return;
    delete rec.edits._account.console;
    if (!Object.keys(rec.edits._account).length) delete rec.edits._account;
    results = {};
    saveAll(); buildAcctSheet(); syncAcctCog(); renderAll();
  };
  // 고르기 시트 — 검색·필터 지우기·닫기. 목록은 renderPick()이 그린다.
  $("#ctrl-x").onclick = closeUnionCtrl;
  $("#ctrl-sheet")?.addEventListener("close", () => { if (uCtrlOpen) closeUnionCtrl(); });
  $("#ctrl-sheet")?.addEventListener("click", (e) => {
    if (e.target === $("#ctrl-sheet")) closeUnionCtrl();
  });
  $("#raid-x").onclick = closeRowBattle;
  $("#raid-sheet")?.addEventListener("close", () => {
    // ESC로 닫아도 패널은 제자리로 돌아가야 한다.
    // **보스 기본값으로 연 경우도 반드시 정리한다** — `uBattleOpen`만 보고 넘기면
    // `bossCfgCode`가 남아, 다음에 «줄 레이드 설정»을 열었을 때 제목만 줄이고 실제로는
    // 보스 기본값을 고치게 된다(실측). 조용히 엉뚱한 상자를 고치는 종류라 제일 나쁘다.
    //
    // 깃발을 하나씩 세는 대신 **패널이 집을 떠나 있으면** 정리한다. 뮤지엄 5덱
    // 레이드 설정(`openMuseumBattle`)은 세 깃발을 모두 비우고 열어서, 깃발만 보면
    // Esc로 닫았을 때 정리가 건너뛰어지고 패널이 모달 자리에 열린 채 남았다(실측).
    // 여는 길이 또 늘어도 여기는 손댈 것이 없다 — 문 닫는 자리에서 한 번에 본다.
    const bp = $("#btpanel");
    if (uBattleOpen || bossCfgCode || museumCfgBoss !== null
        || (bp && !bp.hidden) || $("#raid-host")?.contains(bp)) closeRowBattle();
    // 겹쳐 둔 회차 시트가 뒤에 남아 있으면 방금 고친 값으로 목록을 새로 그린다.
    if ($("#boss-cfg-sheet")?.open) renderBossCfgList();
  });
  $("#raid-sheet")?.addEventListener("click", (e) => {
    if (e.target === $("#raid-sheet")) closeRowBattle();
  });
  // 솔로 고르기 시트 — 유니온 것과 같은 규약, 다른 물건이다.
  $("#deck-pick-x").onclick = closeDeckPick;
  $("#deck-pick-sheet")?.addEventListener("close", () => { deckPickAt = null; pickBorrow = null; });
  $("#deck-pick-sheet")?.addEventListener("click", (e) => {
    if (e.target === $("#deck-pick-sheet")) closeDeckPick();
  });
  let deckPickTimer = 0;
  $("#deck-pick-q").oninput = (e) => {
    deckPickFilter().q = e.target.value;
    saveAll();
    clearTimeout(deckPickTimer);
    deckPickTimer = setTimeout(renderDeckPick, 140);
  };
  $("#deck-pick-clear").onclick = () => {
    const f = deckPickFilter();
    f.q = ""; f.burst = []; f.element = [];
    saveAll(); renderDeckPick();
  };
  $("#pick-x").onclick = closePick;
  $("#pick-sheet")?.addEventListener("close", () => { pickAt = null; });
  // 바깥(백드롭)을 눌러도 닫힌다 — dialog는 그 자리도 자기 자신으로 잡힌다
  $("#pick-sheet")?.addEventListener("click", (e) => {
    if (e.target === $("#pick-sheet")) closePick();
  });
  // 로스터 검색칸과 같은 처리 — 시트 안이라 한 번에 보이는 카드가 적어 덜 느껴질
  // 뿐, 그리는 목록은 같다. 이어 치는 동안은 미루고 멈춘 뒤 한 번만 그린다.
  let pickTimer = 0;
  $("#pick-q").oninput = (e) => {
    pickFilter().q = e.target.value;
    saveAll();
    clearTimeout(pickTimer);
    pickTimer = setTimeout(renderPick, 140);
  };
  $("#pick-clear").onclick = () => {
    const f = pickFilter();
    f.q = ""; f.burst = []; f.element = [];
    saveAll(); renderPick();
  };
  $("#deck-calc").onclick = () => calcDecks([state.settings.deck], true, "deck");
  $("#deck-fbc").onclick = () => fbcRun(state.settings.deck);
  $("#deck-fbc-undo").onclick = fbcUndoApply;
  const calcAll = (e) => calcDecks([...Array(deckCountNow()).keys()],
                                   e.currentTarget.dataset.force === "1", "all");
  $("#deck-calc-all").onclick = calcAll;
  $("#growth-open").onclick = growthOpen;
  $("#deck-growth").onclick = growthOpen;
  $("#deck-lab").onclick = () => labOpen(state.settings.deck);
  $("#lab-open").onclick = () => labOpen(null);
  $("#deck-swap").onclick = () => recoOpen(state.settings.deck, null);
  $("#deck-goto-result").onclick = () => document.querySelector('.tab[data-tab="result"]')?.click();
  $("#res-calc").onclick = calcAll;
  $("#fast-calc-all").onclick = calcAll;
  $("#fast-toggle").onclick = () => setFastMode(!fastMode);
  for (const b of document.querySelectorAll(".mode-btn")) {
    b.onclick = () => setMode(b.dataset.mode);
  }
  wireUnion();
  $("#whatsnew-x").onclick = () => $("#whatsnew-sheet").close();
  $("#whatsnew-ok").onclick = () => $("#whatsnew-sheet").close();
  // ✕(또는 ESC)로 닫으면 **아무것도 기록하지 않는다** — 다음에 또 뜬다.
  // 공지는 「봤다」를 자동으로 가정하면 안 되는 내용이라서다.
  $("#history-x").onclick = () => $("#history-sheet").close();
  // 옛 주소 안내 — 닫으면 **그 날 하루만** 접힌다(날짜를 적어 둔다). 아주 끄지
  // 않는 것은 아직 안 옮긴 사람에게 다시 말해야 해서다. 기간이 지나면 이 블록과
  // index.html의 `#movebar`를 함께 지운다.
  {
    const bar = $("#movebar");
    if (bar) {
      // **옛 주소에서만 뜬다.** 이미 딜도로로 들어온 사람에게는 할 말이 없다
      // (유저 지시 2026-08-30). 그 주소가 내려가면 이 블록째 지운다.
      const OLD_HOST = "nikkedeck.tetra-pantone.ts.net";
      const day = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      const seen = load(LS.movebar, null);
      bar.hidden = location.hostname !== OLD_HOST || seen === day();
      $("#movebar-x").onclick = () => { save(LS.movebar, day()); bar.hidden = true; };
      $("#movebar-help").onclick = () => {
        document.querySelector('.tab[data-tab="account"]')?.click();
        $("#backup-card")?.scrollIntoView({ block: "center" });
      };
      $("#movebar-fb").onclick = () => document.querySelector('.tab[data-tab="feedback"]')?.click();
    }
  }
  $("#history-open").onclick = () => openHistory("notice");
  // «다시 보지 않기»는 누르는 즉시 기록하고 닫는다(체크 후 또 닫게 하지 않는다).
  $("#notice-dismiss").onclick = () => {
    save(LS.notice, NOTICE_ID);
    $("#history-sheet").close();
  };
  $("#rec-save").onclick = saveRecord;
  $("#rec-saved-x").onclick = () => $("#rec-saved-sheet").close();
  $("#rec-saved-stay").onclick = () => $("#rec-saved-sheet").close();
  $("#rec-saved-go").onclick = () => {
    $("#rec-saved-sheet").close();
    document.querySelector('.tab[data-tab="log"]')?.click();
  };
  // 내보내기가 있으면 불러오기도 있어야 한다 — 파일 드롭 경로는 이미 기록을 알아보므로
  // 같은 처리기(`importFiles`)에 파일만 넘긴다.
  $("#rec-import").onclick = () => $("#rec-file").click();
  // 타임라인 파일은 기록과 규격이 달라(뷰어 내보내기 JSON) 뷰어가 직접 받는다
  $("#tlv-open").onclick = () => window.TimelineViewer && TimelineViewer.openFile();
  $("#rec-file").onchange = (e) => {
    const fs = [...(e.target.files || [])];
    e.target.value = "";
    if (fs.length) importFiles(fs);
  };
  $("#deck-clear").onclick = () => {
    deckOf(state.settings.deck).names = Array(SLOTS).fill(null);
    saveAll(); renderAll();
  };
  $("#deck-clear-all").onclick = () => {
    // **모드를 타는 버튼이다.** 예전에는 `deckOf`·`DECK_COUNT`(솔로 전용)를 써서
    // 유니온에서는 빈 솔로 덱을 세다 `heads`가 0이 되어 **아무 일도 안 일어났다**
    // (제보 2026-08-29). 솔로 덱이 차 있었다면 보고 있지도 않은 덱을 비웠을 것이다.
    const n = deckCountNow();
    const union = modeNow() === "union";
    // 발판 바로 아래에 묻는다 — 무엇이 비워지는지가 위에 그대로 보인다
    const heads = [...Array(n).keys()]
      .reduce((a, i) => a + (deckAt(i)?.names || []).filter(Boolean).length, 0);
    if (!heads) return;
    if (union) {
      // 유니온은 **줄을 골라** 비운다 — 줄별 «비우기» 단추를 뺀 대신이다(유저 지시 2026-09-02). 기본은 전부.
      const rows = [...Array(n).keys()].map((i) => ({ i, heads: (deckAt(i)?.names || []).filter(Boolean).length }))
        .filter((r) => r.heads);
      askRows($("#deck-ask"), T("비울 줄을 고르세요 — 보스는 그대로 둡니다."),
        rows.map((r) => ({ i: r.i, label: T("{v}번 줄 · {n}명", { v: r.i + 1, n: r.heads }) })),
        T("비우기"), (picked) => {
          if (!picked.length) return;
          uSnap(picked.length === rows.length ? T("전부 비우기") : T("{v}번 줄 비우기", { v: picked.map((i) => i + 1).join("·") }));
          for (const i of picked) { const d = deckAt(i); d.names = Array(SLOTS).fill(null); d.control = {}; }
          saveAll(); renderAll();
        });
      return;
    }
    askInline($("#deck-ask"),
      T("{n}{unit} {heads}명을 전부 비웁니다.", { n, unit: union ? T("줄") : T("덱"), heads }),
      T("비우기"), () => {
        // **누르는 시점의 모드로 다시 센다.** 확인이 떠 있는 동안 화면을 옮길 수 있는데,
        // 열 때 잡아 둔 개수로 지우면 보고 있지도 않은 덱을 건드린다.
        uSnap(T("전부 비우기"));      // 유니온에서만 남는다 — 되돌리기로 살릴 수 있게
        const m = deckCountNow();
        for (let i = 0; i < m; i++) deckAt(i).names = Array(SLOTS).fill(null);
        saveAll(); renderAll();
      });
  };

  // 한 글자마다 카드 이백 장을 다시 그리면 타이핑이 끊긴다(실측 2026-08-30:
  // 1920px·198장에서 renderPools 155ms — 세 글자면 0.5초가 통째로 멎는다).
  // 이어 치는 동안은 미루고 **멈춘 뒤 한 번만** 그린다. 값 자체는 바로 넣어 두므로
  // 그 사이 다른 곳에서 필터를 읽어도 최신이다.
  let qTimer = 0;
  $("#q").oninput = (e) => {
    curFilter().q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(renderPools, 140);
  };

  // 정렬·필터 패널은 **누를 때만** 뜬다. 로스터 위에 떠서 자리를 밀지 않는다.
  const fp = $("#fpanel"), ft = $("#f-toggle");
  const showPanel = (on) => {
    fp.hidden = !on;
    ft.setAttribute("aria-expanded", String(on));
    syncFilterChrome();          // «비우기»가 패널을 따라 나타났다 사라진다
  };
  showPanel(false);
  // 방향 버튼은 패널을 열지 않는다 — 정렬만 뒤집는다
  $("#f-dir").onclick = (e) => {
    e.stopPropagation();
    const f = curFilter();
    f.asc = f.asc === false;
    sortRow(); syncFilterChrome(); saveAll(); renderPools();
  };
  ft.onclick = (e) => {
    e.stopPropagation();
    const willOpen = fp.hidden;
    $("#btpanel").hidden = true;                 // 둘이 겹쳐 뜨면 서로를 가린다
    $("#bt-toggle").setAttribute("aria-expanded", "false");
    showPanel(willOpen);
  };
  // 바깥을 누르거나 Esc면 닫는다
  document.addEventListener("pointerdown", (e) => {
    if (!fp.hidden && !e.target.closest(".fwrap")) showPanel(false);
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") showPanel(false); });

  $("#f-clear").onclick = (e) => { e.stopPropagation(); clearFilters(); };

  // 전투 조건 패널 — 필터와 같은 방식으로 누를 때만 뜬다
  const bp = $("#btpanel"), bt = $("#bt-toggle");
  const showBattle = (on) => {
    bp.hidden = !on;
    bt.setAttribute("aria-expanded", String(on));
    syncBattleChrome();
  };
  showBattle(false);
  bt.onclick = (e) => {
    e.stopPropagation();
    const willOpen = bp.hidden;
    $("#fpanel").hidden = true;
    $("#f-toggle").setAttribute("aria-expanded", "false");
    showBattle(willOpen);
  };
  document.addEventListener("pointerdown", (e) => {
    // 유니온에서는 패널이 줄 밑으로 옮겨 가 .fwrap 바깥에 산다 — 패널 자신과
    // 줄의 «레이드» 버튼도 «바깥»으로 치면 열자마자 닫힌다.
    if (!bp.hidden && !e.target.closest(".fwrap, #btpanel, .row-raid")) showBattle(false);
  });
  // Esc로도 닫는다 — 바깥 누르기만 있으면 «닫았는데 안 닫힌다»가 된다. 필터 패널과
  // 같은 처리다(위). `<dialog>`는 브라우저가 알아서 닫아 주지만 이쪽은 hidden 패널이라
  // 직접 받아야 한다. 모달이 떠 있으면 그쪽이 먼저다 — 여기서 가로채지 않는다.
  //
  // 솔로 컨트롤 패널도 같이 받는다. 그쪽은 닫는 길이 «같은 버튼을 다시 누르기» 하나뿐이라
  // Esc가 안 먹었다(유니온에서는 모달이라 브라우저가 닫아 준다).
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (!bp.hidden) { showBattle(false); return; }
    if (ctrlOpen) { ctrlOpen = null; renderAll(); buildControl(); }
  });
  // 패널이 화면 가운데 뜨므로 «기본값»도 패널 안에 있어야 한다 — 트리거 옆에 남으면
  // 패널과 떨어진 자리에서 홀로 떠 무엇을 되돌리는 버튼인지 알 수 없다.
  // 「기본값」은 이제 **머리줄 안**에 있다(마크업). 예전엔 패널 밖에 있어 여기서 끌어다
  // 맨 위에 붙였는데, 그러면 제목줄 위에 단추 하나가 더 생겨 아래가 밀린다(유저 지적).
  $("#bt-clear").onclick = (e) => { e.stopPropagation(); resetBattle(); };
  const cyClear = $("#cycle-clear");
  if (cyClear) cyClear.onclick = (e) => { e.stopPropagation(); resetCycle(); };
  $("#f-fav").onclick = () => {
    const f = curFilter();
    f.favOnly = !f.favOnly;
    syncFilterChrome(); saveAll(); renderPools();
  };
  $("#f-parsed").onclick = () => {
    const f = curFilter();
    f.parsed = !f.parsed;
    syncFilterChrome(); saveAll(); renderPools();
  };

  for (const tab of document.querySelectorAll(".tab")) {
    tab.onclick = () => {
      for (const t of document.querySelectorAll(".tab")) {
        const on = t === tab;
        t.classList.toggle("on", on);
        t.setAttribute("aria-selected", String(on));
      }
      for (const p of document.querySelectorAll(".panel")) {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      }
      // **화면이 바뀐 직후에 적는다** — 이 한 줄이 «뒤로 가기 = 이전 화면»을 만든다.
      // 아래 화면별 뒷일(필터 바 옮기기·목록 불러오기)보다 **앞**에 두는 것이
      // 중요하다: 그중 하나가 던지면 주소만 조용히 안 따라와, 뒤로 가기가 화면을
      // 건너뛴다(실제로 `moveFilterBar`가 던져서 겪었다).
      syncRoute();
      // 필터 바는 «전투력 계산기냐 아니냐»로만 갈린다 — 다른 탭 조건을 사이에 끼우면
      // else가 그쪽에 붙어 버려, coopEnsure()가 옮겨 놓은 바를 바로 되돌린다(실측:
      // 피드백 탭을 넣으면서 이 else를 뺏겨 전투력 계산기에서 필터가 사라졌고,
      // inCoop이 false로 남아 편성 쪽 「계산 가능」 필터가 목록까지 잘랐다).
      if (tab.dataset.tab === "coop") coopEnsure();
      else moveFilterBar(false);
      // 아레나(알파)는 제 파일이 그린다 — 없으면(빌드에서 빠졌으면) 조용히 넘어간다.
      if (tab.dataset.tab === "arena") window.Arena?.ensure();
      if (tab.dataset.tab === "feedback") fbLoad();
      if (tab.dataset.tab === "deck") markOverflow();
      else if (picked) {
        // 카드를 «집어 든» 채로 다른 탭으로 나가면, 그 상태를 알리던 머리글의
        // 「«이름» — 놓을 슬롯을 누르세요」 배지가 **탭을 넘어서도 남는다**
        // (실측: 전역 상태 표시라 다른 화면을 보는 동안에도 계속 떠 있었다).
        // 편성 화면을 벗어나는 순간 집어 든 것 자체가 뜻을 잃으므로 놓아 준다.
        picked = null;
        setStatus("", false);
      }
      if (tab.dataset.tab === "log") {
        // **탭을 직접 눌러 들어올 때는 필터를 늘 «전체»로 되돌린다.**
        // 「솔레덱 훔쳐오기」가 이 탭으로 옮기면서 recKind를 "shot"으로 바꿔
        // 두는데, 그건 그 버튼 하나만의 의도다 — 리셋 없이 두면 그 뒤로
        // 이 탭에 다시 들어올 때마다 계속 "솔레 기록"만 보이고 시뮬 기록이
        // 통째로 안 보여서 «이전 기록이 사라졌다»처럼 보인다(실측: 재현됨).
        // 순서상 이 리셋이 먼저 돌고, 훔쳐오기 자신의 `recKind = "shot"`이
        // 그 뒤에 한 번 더 실행돼 원하는 필터로 남는다 — 그 버튼은 그대로 동작한다.
        recKind = "all";
        renderRecords();
      }
    };
  }

  $("#boss-pick-x")?.addEventListener("click", closeBossPick);
  $("#boss-pick-sheet")?.addEventListener("close", () => { bossPickRow = null; });

  $("#url-go").onclick = syncUrl;
  const drop = $("#drop"), fin = $("#file-in");
  drop.onclick = () => fin.click();
  drop.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fin.click(); }
  };
  fin.onchange = () => { if (fin.files.length) importFiles([...fin.files]); fin.value = ""; };
  for (const ev of ["dragenter", "dragover"]) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  }
  for (const ev of ["dragleave", "drop"]) {
    drop.addEventListener(ev, () => drop.classList.remove("over"));
  }
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) importFiles([...e.dataTransfer.files]);
  });

  $("#edit-revert").onclick = () => { if (sheetName) revertChar(sheetName); };

  // ── 프리셋 ──
  $("#preset-save-single").onclick = () => openPresetSave("single");
  $("#preset-save-bundle").onclick = () => openPresetSave("bundle");
  $("#rec-compare").onclick = openCompare;
  $("#preset-export-all").onclick = exportAllPresets;
  const pfin = $("#preset-file");
  $("#preset-import").onclick = () => pfin.click();
  pfin.onchange = () => {
    if (pfin.files.length) importPresetFiles([...pfin.files]);
    pfin.value = "";
  };

  const sb = $("#share-boss");
  if (sb) {
    sb.checked = shareBossOn();
    sb.onchange = () => { state.settings.shareBoss = sb.checked; saveAll(); };
  }

  // ── 공유 링크 만들기 (결과 탭) ──
  $("#res-share").onclick = () => {
    const { decks, total, mode } = collectDecks();
    const sink = (m, k) => msgAt("#res-share-msg", m, k);
    makeShare({ code: state.settings.code, duration: durationNow(), decks, total, mode },
              $("#res-share-out"), sink);
  };

  addEventListener("resize", markOverflow);
}

// ── 새 소식 ─────────────────────────────────────────────────────────────
// 중요한 변경이 생기면 다시 온 사람에게 팝업으로 알린다. 배열 순서 = 시간순
// (오래된 게 위) — 새 항목은 맨 끝에 추가한다. `v`는 그 항목까지의 누적
// 버전표라 저장된 값과 정확히 일치하는 항목**부터** 안 보여 준다(그 뒤가 새 것).
const CHANGELOG = [
  { v: "2026-08-23-fastmode", items: [
    "배치모드 — 5덱 25칸을 한 화면에서 빠르게 채우는 전용 화면을 추가했습니다.",
    "니케 얼굴을 인게임과 같은 정사각 카드로 보여줍니다.",
    "덱 순서를 드래그로 바꿀 수 있습니다(배치모드 줄 번호·01~05 탭 모두).",
  ] },
];

// ── 계산 로직 변경 내역 ──────────────────────────────────────────────────
// 상단 배너(«로직 변경 내역»)가 여는 목록. 공지(NOTICES)와 별개로 **계산 로직이
// 바뀐 것만** 계속 쌓는다 — 새 날짜 블록을 맨 앞에, 같은 날짜면 항목을 앞에 추가.
// 항목은 «무엇이 어떻게 계산에 달라지는가»까지 적는다(사용자가 수치 변화의 이유를
// 여기서 찾는다).
// **아직 서버에 없는 항목은 여기 적지 않는다.** 「이렇게 바뀌었습니다」라고 써 놓고
// 숫자가 안 바뀌면 그게 제일 나쁘다 — 유저는 계산이 틀렸다고 읽는다. 코어를 올리는
// 배포에서 아래 «코어 올릴 때» 블록을 이 목록 맨 앞으로 옮긴다.
//
// 코어 올릴 때 되살릴 것 (2026-08-27 기준 로컬에만 있음):
//
//  · **버스트 체인에 걸리는 시간을 현실화했습니다** — 지금까지는 게이지가 수정 불가능한
//    평균 2초로 차고, 그 뒤 1버→2버 0.1초 · 2버→3버 0.1초 · 3버→풀버스트 0.05초 만에
//    풀버스트가 열리는 근사였습니다(버스트를 «누르는 시간»이 사실상 없던 셈). 이제
//    단계 사이 0.5초, 3버→풀버스트 0.367초가 걸리는 것으로 바꾸고(버스트 연출·입력 시간을
//    반영한 근사), 게이지 재충전 기본값은 1.0초로 재보정했습니다(표준 팀 3분 14버스트 유지).
//    충전이 아무리 빨라도 체인+풀버스트 시간이 바닥이라 3분에 약 15버스트를 넘지
//    못합니다. 버스트로 발동하는 버프들의 타이밍이 그만큼 뒤로 밀려 대부분의 덱에서
//    총딜이 소폭 달라집니다(−0.1~−5%대).
//
//  · **버스트 게이지 충전이 충전 요소를 반영합니다** — 지금까지는 풀버스트가 끝나면
//    고정 2초 뒤에 게이지가 차는 근사였는데, 이제 충전 속도 버프(그레이브·네온 : 비전
//    아이·마나·아니스 : 스타)가 재충전을 앞당기고, «버스트 게이지 N% 충전» 즉시
//    충전(헬름·로산나·리틀 머메이드·맥스웰 : 오디너리 미케닉·신데렐라 : 크리스탈
//    웨이브)이 남은 충전을 그만큼 당깁니다. 체인·풀버스트 중의 충전은 게임처럼
//    버려집니다. 게이지가 회전 병목인 덱에서만 딜이 달라집니다(±수%).
const CALC_CHANGES = [
  // K 장탄 중복 — **코어와 같은 배포로만 나간다**(데이터만으로는 숫자가 안 바뀐다:
  // 옛 코어는 `same_effect_no_stack`을 무시한다). 위 규약 「아직 서버에 없는 항목은
  // 여기 적지 않는다」 그대로다.
  { date: "2026-09-05", items: [
    "**K «정의 실현»의 최대 장탄 수 감소가 다른 최대 장탄 감소와 겹치지 않습니다** — 스킬 원문에 " +
      "«동일 효과 중복 불가»가 적혀 있는데 계산기가 그걸 안 보고 프리바티 «EX 매거진» 같은 다른 " +
      "장탄 감소와 합쳐 왔습니다. 이제 더 큰 것 하나만 적용합니다. 종전에는 둘이 합쳐져 프리바티 " +
      "탄창이 1발로 계산되는 바람에 «마지막 탄환 명중 시» 효과가 매 발 터졌습니다 — 그 편성에서 " +
      "프리바티·K 딜과 «한 명을 바꾼다면?» 순위가 부풀어 있었습니다. K와 다른 장탄 감소가 함께 " +
      "든 편성만 값이 달라집니다.",
  ] },
  { date: "2026-09-04", items: [
    "**차임의 «나의 왕» 버프가 크라운에게 고정 적용됩니다** — 소원·일과 보고·충심 셋 다입니다. " +
      "종전에는 편성 중 공격력이 가장 높은 니케에게 들어가서 딜러 수치가 부풀고 크라운은 줄어 " +
      "있었습니다. 크라운이 없는 편성에서는 이 버프가 걸리지 않습니다.",
    "",
    "**샷건 평타가 버스트 게이지를 채우는 양에 무기군 평타 계수를 곱합니다** — 계수(기본 SG 0.9)가 " +
      "대미지에만 붙고 게이지에는 안 붙던 것을 바로잡았습니다. 빗나간 펠릿은 게이지도 못 채웁니다. " +
      "실험실의 «실누적 게이지»에서만 걸리고(기본 설정은 게이지가 시간으로 찹니다), 샷건이 든 " +
      "편성의 버스트 회차가 조금 줄어듭니다. SMG는 아직 안 걸었습니다 — 추후 개선 예정입니다.",
    "",
    "**«라플라스 : 얼티밋 히어로» 모드를 영상 실측에 맞췄습니다** — 세 가지입니다. ① 모드 탄창이 " +
      "120발로 고정돼 있어 모드가 짧게 끝났습니다. 이제 최대 장탄 수 증가를 받습니다(+69%면 203발). " +
      "② 모드 연사를 초당 20발에서 24.5발로 고쳤습니다. ③ 모드 사격이 버스트 게이지를 채우는 양을 " +
      "실제 수준으로 줄였습니다 — 전에는 로켓런처 기준이라 버스트가 훨씬 자주 돌았습니다. ③은 " +
      "실험실의 «실누적 게이지»에서만 걸립니다(기본 설정은 게이지가 시간으로 차서 이 값을 안 봅니다). " +
      "본계정 유니온 3분 기준으로 실누적은 138.4억·풀버스트 15회 → 112.9억·12회가 되고, " +
      "기본 설정은 라플라스 본인이 2~3% 오릅니다.",
    "",
    "**«아스카 : WILLE»의 「긴급 수복」을 실제 동작대로 고쳤습니다** — 섬멸 태세가 끝나는 순간 " +
      "**이미 재장전 중이면** 「탄환 제거(강제 재장전)」와 「재장전 속도 고정」이 걸리지 않습니다. " +
      "예열 속도 ▼(3초)와 회복은 그대로 걸립니다. 강제 재장전은 예열을 0으로 끊어 3초 남짓 거의 " +
      "못 쏘게 만드는데, 미리 재장전해 두면 그것을 피하고 예열이 절반쯤 남은 채 이어집니다. " +
      "재장전 속도 고정은 다른 재장전 버프와 더하지 않는 고정값(재장전 0.93초)으로 계산합니다.",
    "",
    "**예열이 식는 시간(1초 → 2초)은 «아스카 : WILLE»에게만 겁니다** — 처음에 이 값을 머신건 " +
      "전체에 걸었다가 되돌렸습니다. 다른 머신건은 종전과 값이 같습니다.",
    "",
    "**위 컨트롤은 «장전컨 — 풀버스트 종료 1.5~1.9초 전»으로 재현합니다** — 재장전 속도 버프가 " +
      "없는 편성에서는 재장전이 태세 종료에 못 걸쳐서 손해입니다.",
  ] },
  { date: "2026-09-03", items: [
    "**전투력 계산기의 SR·R 니케 전투력이 내려갑니다** — 오늘 등급별 기본 스탯 표를 넣으면서 딜 계산은 " +
      "바로잡혔는데 전투력 계산기가 옛 표를 보고 있었습니다. 이제 같은 표를 씁니다. SSR 니케는 값이 " +
      "바뀌지 않고, SR·R 니케는 그동안 SSR 곡선으로 부풀어 있던 만큼 내려가 인게임 표시와 맞아집니다.",
    "**렐릭 퀀텀 큐브의 «버스트 게이지 충전 속도 ▲»가 이제 계산에 반영됩니다** — 미구현 표시가 낡아 있어 " +
      "붙어 있던 효과였습니다. 버스트 게이지 실누적 기준으로만 걸리고(고정 버스트에서는 이 효과가 없습니다), " +
      "게이지가 병목인 편성일수록 더 오릅니다.",
    "**SR·R 니케의 기본 스탯이 등급에 맞게 낮아졌습니다** — 레벨별 기본 스탯 표에 등급 구분이 없어서 " +
      "SR·R 니케가 SSR 곡선을 그대로 쓰고 있었습니다. 이제 등급별 표를 씁니다. 레벨 400 기준으로 " +
      "공격력·방어력이 약 10%, 체력이 약 23% 내려갑니다. 미카·아이기스처럼 «시전자 기준» 버프를 주는 " +
      "니케는 아군에게 주는 버프도 그만큼 줄어듭니다. SSR 니케는 값이 바뀌지 않습니다.",
    "**그레이브의 재장전이 두 번에 나눠 찹니다** — 재장전 한 번이 탄창의 절반만 채우는 니케인데 " +
      "전탄이 차는 것으로 계산하고 있었습니다. 지속 화력이 조금 내려갑니다.",
    "**산탄으로 나가는 «무기 변경» 모드도 평타 계수를 받습니다** — 탄이 여러 발로 쪼개져 나가는 " +
      "무기는 실제로 일부가 빗나가서, 계산은 무기군마다 계수(기본 설정 SG ×0.9 · SMG ×0.8)를 " +
      "평타에 곱해 왔습니다. 무기를 바꾼 동안의 사격만 이 보정에서 빠져 있었습니다. 60초 기준으로 " +
      "드레이크 : 그레이트 빌런 −8.1% · K −4.7%가 내려갑니다(편성에 따라 다릅니다).",
    "**모드의 무기 종류 표기만 보고 걸던 것을 바로잡았습니다** — 그 표기는 발사 방식을 흉내 내려고 " +
      "붙인 이름이라 탄퍼짐의 근거가 못 됩니다. 라플라스의 「라플라스 버스터」와 라플라스 : 얼티밋 " +
      "히어로의 「일렉트릭 파워 풀 풀 차지」는 원문이 «관통 특화»라고 적은 한 줄기 광선인데 " +
      "기관단총으로 적혀 있어 계수를 받고 있었습니다. 이제 **여러 발로 쪼개 쏘는 모드에만** " +
      "겁니다. 오늘 잠깐 내려갔던 라플라스 · 라플라스 : 얼티밋 히어로 · 목단 · 타키나는 원래 " +
      "값으로 돌아왔습니다.",
  ] },
  { date: "2026-09-02", items: [
    "**«버스트 게이지 실누적»이 기본이 됐습니다** — 실험실 딱지를 떼고 처음부터 켜 둡니다. " +
      "쏜 만큼 게이지가 차서 100%에 1버스트가 열리는 방식이라, «첫 버스트»와 «풀버스트 후 " +
      "재충전» 칸을 쓰지 않습니다. 이미 쓰고 계시던 분의 설정은 그대로 둡니다 — 안 켜 두셨다면 " +
      "예전처럼 돕니다. 값이 이상해 보이면 체크를 빼서 고정 버스트로 돌리시면 됩니다.",
    "**무기를 바꾸는 스킬이 «최대 장탄 수»를 쓰지 않았습니다** — 바뀐 무기의 장탄이 매 순간 다시 " +
      "차서 재장전이 영영 오지 않았습니다. 은화 : 택티컬 업의 1발 모드가 10초에 19발을 쏘고 " +
      "있었는데 이제 5발입니다(한 발 쏘고 재장전). E.H.와 신데렐라 : 크리스탈 웨이브도 " +
      "같습니다. 장탄이 적은 모드일수록 많이 내려갑니다.",
    "**원문과 어긋나 있던 스킬 값 여섯 가지를 바로잡았습니다** — 홍련 : 흑영의 「화무십일홍 · " +
      "파죽」 3단계와 「만개」 차지 대미지가 구판 수치(원문의 0.885배)로 남아 있어 **올라갑니다**. " +
      "라피 : 레드 후드의 「유탄 폭발」은 레벨을 안 보고 1레벨 값에 묶여 있어 만렙에서 " +
      "**올라갑니다**. 루드밀라 : 윈터 오너는 공격력과 재장전 속도 값이 서로 뒤바뀌어 있었고, " +
      "아니스 : 스타의 「슈팅 스타」는 차지 시간 고정 값이 비어 있었으며, 신데렐라의 「무결한 " +
      "유리」는 사라져야 할 버프가 남고 남아야 할 버프가 끊겼습니다. 소다 : 트윙클링 바니의 " +
      "「골든 칩 N 중첩」 조건은 전부 1씩 적었습니다.",
    "**속성이 붙은 디버프가 아무 보스에나 걸리던 것을 고쳤습니다** — 「풍압 코드 적에게」처럼 " +
      "적 속성이 붙은 효과가 보스 속성과 상관없이 늘 걸렸습니다. 브리드 : 사일런트 트랙의 " +
      "「기동」·「전도」가 여기 해당해, 팀 전원의 모든 대미지에 곱해지는 «받는 대미지 27.2%p»가 " +
      "풍압 보스가 아닐 때도 들어갔습니다. 이브와 마르차나 : 마린 스터디도 같았습니다. " +
      "이제 보스 속성이 맞을 때만 걸립니다 — 맞는 보스에서는 그대로 강하고, 아닌 보스에서는 " +
      "값이 내려갑니다.",
    "**은화 : 택티컬 업이 내려갑니다** — 적에게 거는 «받는 대미지 ▲»가 두 항목으로 들어가 " +
      "두 겹(최대 +55.7%)으로 걸렸습니다. 원문은 «명중한 대상에게» 하나뿐이라 한 겹으로 " +
      "고쳤습니다. 또 스킬2의 크리티컬 확률은 «동일 스쿼드 아군»에게만 가는데 편성 전원이 " +
      "받고 있었습니다 — 같은 스쿼드(앱솔루트)가 함께 있을 때만 갑니다.",
    "**엠마 : 택티컬 업의 크리티컬 대미지도 같았습니다** — 「포메이션 LT」가 동일 스쿼드 " +
      "한정인데 편성 전원에게 갔습니다.",
    "**레이블의 «자신 제외» 공격력 버프를 본인도 받고 있었습니다** — 「연애의 달콤함」은 " +
      "자신을 뺀 아군 전체에게 가는 버프입니다.",
    "**아비스타는 사라져야 할 버프 둘이 안 사라졌습니다** — 「애프터 쇼」는 풀 버스트에 " +
      "들어가면 사라지는데 계속 켜져 있었고, 스타 게이저도 안 없어져 그 상태를 조건으로 하는 " +
      "「애프터 글러우」가 내내 켜져 있었습니다. 아비스타가 든 편성이 내려갑니다.",
  ] },
  { date: "2026-09-01", items: [
    "**레이븐의 버스트가 파츠에도 맞습니다** — 「템페스트」는 스킬 원문이 «적 전체(파츠 " +
      "포함)»인데 파츠 판정이 빠져 있었습니다. 파츠를 켜 둔 보스에서 레이븐이 든 편성이 " +
      "조금 오릅니다(레이븐 본인 딜 기준 +0.1~0.3%). 파츠가 없는 보스에서는 값이 그대로입니다.",
    "**레이븐은 파츠를 넣어야 제 값이 나옵니다** — 급소 공략(파츠 대미지↑)과 일점 " +
      "공격(파츠 파괴 뒤 지속 피해↑)이 파츠에 걸려 있어서, 레이드 설정의 «보스 구간»에 " +
      "파츠를 안 넣으면 덱 총딜이 낮게 나옵니다. 넣었을 때 오르는 폭은 **상시 파츠 " +
      "+2~12%**, **파츠 구간 둘 +1~5%**, **구간에 파괴까지 넣으면 +6~18%**로 편성에 따라 " +
      "다릅니다(파츠 대미지를 팀에 대 주는 로산나 : 시크 오션을 넣으면 위쪽입니다). " +
      "다만 넣은 뒤에도 조준은 «맞거나 안 맞거나»로만 세므로 그만큼은 근사입니다.",
    "**보스가 자리를 옮기는 구간을 넣을 수 있습니다** — 레이드 설정의 «보스 구간»에서 " +
      "종류를 «적정거리»로 고르고, 그 시간 동안 적정거리가 되는 무기군을 고릅니다. " +
      "위 «적정거리 적용 무기군»에서 켠 무기군은 판 내내 적정이고, 이 구간은 **나머지 " +
      "무기군에만** 걸립니다. 구간이 겹치면 먼저 시작한 쪽이 이깁니다. 구간을 안 넣으면 " +
      "값은 예전과 같습니다.",
    "**레오나와 에이드 : 에이전트 바니의 «적정거리 확장»은 계산에 들어가지 않습니다** — " +
      "계산기는 거리를 재지 않고 «적정거리 적용 무기군»을 직접 고르는 방식이라, 「적정거리를 " +
      "넓힌다」를 걸 자리가 없습니다. 두 니케를 편성에 넣으면 그 표시가 함께 뜹니다. " +
      "그 효과를 감안해 재려면 «적정거리 적용 무기군»에서 해당 무기군을 켜 두시면 됩니다.",
  ] },
  { date: "2026-08-30", items: [
    "**재진입 니케는 짝의 버스트 쿨을 기다렸다 씁니다** — 같은 단계 짝의 버스트가 아직 " +
      "안 돌아왔으면 기다렸다 시전해 재진입이 늘 걸리게 합니다(실전 운용과 같습니다). " +
      "기본으로 켜져 있고, 카드 아래 «컨트롤»의 **«재진입 대기»**에서 끌 수 있습니다 — " +
      "끄면 곧바로 시전하고 쿨이 엇갈린 회차에서는 재진입이 무산됩니다. 재진입 니케가 든 " +
      "편성은 이 기본값 때문에 값이 조금 움직입니다.",
    "**재진입 니케 둘을 함께 편성하면 계산이 멈추던 것을 고쳤습니다** — 체인이 1단계에 " +
      "갇혀 풀버스트가 한 번도 안 돌고 딜이 크게 낮게 나왔습니다. 그 사이에 계산해 " +
      "기록해 두신 값이 있으면 다시 계산해 주세요.",
    "**버스트 재진입이 계산에 들어갑니다** — 아비스타 · 앨리스 : 원더랜드 바니 · " +
      "루피 : 윈터 쇼퍼 · 티아 · 차임 · 바이퍼(애장품 3단계). 같은 버스트 단계의 아군이 " +
      "함께 편성돼 있으면 **그 아군도 이어서 버스트를 씁니다**(1 → 1 → 2 → 3처럼). " +
      "풀버스트 횟수와 주기는 그대로이고, 늘어나는 것은 그 아군의 버스트 한 번입니다. " +
      "그래서 오르는 폭은 **짝이 누구냐**에 달렸습니다 — 실측한 편성에서는 약 +1~3%였고, " +
      "버스트 효과가 큰 니케와 짝이면 그만큼 더 오릅니다. 같은 단계 아군이 없으면 걸리지 " +
      "않습니다.",
    "**계산 누락 수정** — 다음 효과가 계산에 적용되지 않고 있어 수정했습니다. 예상 딜 " +
      "변화는 **스킬 10 · 장비 없음 · 3인 편성 기준 본인 딜**이라, 편성과 스펙에 따라 " +
      "다를 수 있습니다.",
    "**목단** — 스킬1 추가 대미지. 무기 변경(버스트) 중 일반 공격 5회 명중마다 들어갑니다. " +
      "버스트를 쓰는 편성에서 약 **+38%**이고, 버스트를 안 쓰는 편성은 변화가 없습니다.",
    "**그레이브** — 버스트의 무한 장탄과 과열 강화. 버스트 10초 동안 재장전 없이 쏘고, 그 " +
      "동안 명중을 쌓아 과열 II·III(공격력·공격 대미지 ▲)가 걸립니다. 본인 딜이 약 " +
      "**+30%**, 그 편성 전체로는 약 +7% 오릅니다. 명중 횟수를 세기 시작하는 지점은 " +
      "근사입니다.",
    "**베스티 : 택티컬 업** — 은화 : 택티컬 업과 함께 편성했을 때의 스킬2 연계. 대상이 아래 " +
      "«받는 대미지 ▲» 상태일 때 발사체 폭발 대미지가 강해집니다. 그 편성에서 오릅니다.",
    "",
    "**니케 99명을 새로 계산할 수 있습니다** — 그동안 편성에 넣으면 «계산할 수 없다»고 " +
      "나오던 니케들입니다. 계산이 그 니케의 핵심을 아직 다루지 못하는 경우에는 카드에 " +
      "«미지원» 표가 붙습니다. 니케 목록의 필터 → «계산 정확도»에서 걸러 볼 수 있습니다.",
    "**쿠루미 · 베스티 · 은화 : 택티컬 업을 새로 계산할 수 있습니다** — 그동안은 편성에 넣어도 " +
      "계산되지 않던 셋이라, 위와 달리 «얼마나 오른다»가 아니라 처음부터 아래 효과가 들어간 " +
      "값입니다.",
    "**쿠루미** — 스킬2 추가 대미지. 풀버스트 중 36회 명중했을 때, 대상이 해킹(지속 대미지) " +
      "상태면 들어갑니다.",
    "**베스티** — 버스트 «미사일 컨테이너». 컨테이너 2기가 1초 간격으로 18초 동안 때립니다. " +
      "크리티컬은 아직 안 들어가는 근사입니다.",
    "**은화 : 택티컬 업** — 버스트 모드로 맞힌 대상에게 «받는 대미지 ▲»가 10초 걸립니다. " +
      "그 대상을 때리는 **아군 전체의 딜**이 함께 오릅니다.",
    "",
    "**차지 대미지 «배율» 버프 합성 방식을 인게임에 맞췄습니다** — 소장품 SR·RL의 " +
      "«차지 대미지 ▲»가 배율이 아니라 평문으로 섞이고 있었습니다. 무버프 실측값에 " +
      "맞춰 갈라 냈습니다. 차지로 때리는 니케(소장품 SR·RL을 낀 경우)의 값이 조금 " +
      "오릅니다.",
    "**일반 공격 전용 크리티컬이 스킬 피해에는 안 붙습니다** — 헬름의 «진두지휘»처럼 " +
      "«일반 공격»에만 걸리는 크리 버프가 스킬 피해에까지 합산되고 있었습니다. 인게임과 " +
      "같게 갈라 냈습니다. 헬름·율리아가 든 편성에서 스킬 비중이 큰 니케의 값이 조금 " +
      "내려갑니다(−0.7~−2.6%). 그 밖의 편성은 변화 없습니다.",
    "**불러온 편성의 큐브가 계정 장착분으로 바뀝니다** — 프리셋·기록·공유 링크를 불러올 때 " +
      "칸 큐브를 그 니케가 인게임에서 끼고 있는 것으로 채웁니다(안 낀 니케는 기본값). " +
      "이전에는 그 덱에 남아 있던 앞 편성의 큐브를 그대로 써서 값이 달랐습니다.",
    "**플로라의 «시공증» 사슬이 인게임 판정 그대로 기본 적용됩니다** — 플로라 스킬2는 «옆 " +
      "아군의 체력이 깎이면 → 보호막 → 시공증(공격력)»으로 이어집니다. 이제 인게임과 같은 " +
      "기준(옆 아군의 **표시 체력%가 90 이하로 내려가면** 발동)으로 판정합니다. 계정에서 " +
      "받은 스펙이면 스킬1이 6레벨만 넘어도 **편성 자리와 상관없이 항상** 걸립니다. " +
      "컨트롤을 켤 필요가 없어졌고, 플로라를 넣은 편성은 값이 오릅니다.",
    "**플로라의 버스트 주기에 «홀수 주기»가 생겼습니다** — 1·3·5…번째 풀버스트에만 씁니다. " +
      "«짝수 주기»(2·4·6…)와 짝입니다.",
    "**버스트 주기 목록이 늘었습니다** — 마스트 : 로망틱 메이드에 «마크마 크크마 크크마 크크마 크마», " +
      "플로라에 «짝수 주기»(2·4·6…)입니다. 고르면 그 회차에만 버스트를 쓰므로 총딜이 달라집니다.",
  ] },
  { date: "2026-08-29", items: [
    "**버스트 게이지 실누적(실험실)의 아군 충전 계산이 확정됐습니다** — 지금까지는 근사 " +
      "상수로 어림잡고, 원인을 모르는 «풀차지 래치»를 손으로 켜게 했습니다. 이제 아군이 " +
      "받는 양은 **«그 니케의 히트당 충전량 × 버프%»**로 정확히 계산합니다. 손으로 켜던 " +
      "래치의 정체는 **보스전 버스트 게이지 2배**였고, 한 대라도 맞히면 자동으로 걸리는 " +
      "것이라 **컨트롤의 «풀차지 래치» 칸을 없앴습니다**(켜 두셨어도 결과는 같습니다). " +
      "**실누적을 켜 둔 편성은 값이 조금 달라집니다** — 끄고 쓰시면 예전 그대로입니다.",
    "**리버렐리오의 딜이 실제보다 낮게 나오던 것을 고쳤습니다** — 리버렐리오는 «차지 속도 " +
      "증가 효과 면역»을 가지고 있는데, 그 면역이 **장비(오버로드)와 큐브의 차지 속도까지** " +
      "막고 있었습니다. 이제 면역은 **스킬로 걸리는 버프에만** 걸리고 장비·큐브 차지 속도는 " +
      "그대로 들어갑니다. **리버렐리오를 넣은 편성은 값이 오릅니다** — 렐릭 부스트 큐브 " +
      "15레벨만 끼워도 +1.2%이고, 차지 속도 오버로드를 두른 리버렐리오는 훨씬 더 오릅니다. " +
      "다른 니케의 계산은 하나도 안 바뀝니다. 인게임 실측 대조는 아직입니다.",
    "**버스트 손속도 기본이 0.1초입니다** — 어제 0.25초로 뒀던 것을 되돌립니다. " +
      "사람이 실제로 누르는 속도에 이쪽이 가깝고, 0.25초로 두면 풀버스트가 한 회 " +
      "통째로 날아갑니다(같은 덱 180초 기준 실누적 13회 → 12회, 고정 15회 → 14회). " +
      "**손대지 않으셨다면 총딜이 오릅니다**(실누적 +4.3%, 고정 +1.6%). " +
      "예전에 0.25초로 저장돼 있던 설정은 한 번 0.1초로 옮겨집니다 — 일부러 0.25초를 " +
      "고르셨다면 «버스트 사이클»에서 다시 넣어 주세요.",
    "**버스트 게이지를 쏜 만큼 채워 계산할 수 있습니다(실험실)** — «버스트 사이클»의 " +
      "«버스트 게이지 실누적»입니다. 켜면 «첫 버스트»와 «풀버스트 후 재충전»을 쓰지 않고, " +
      "실제로 맞힌 히트가 게이지를 만들어 100%에 1버스트가 열립니다. 풀버스트 횟수와 " +
      "버스트 시각이 편성에 따라 달라지므로 **총딜이 크게 달라질 수 있습니다** " +
      "(끄면 예전 그대로입니다). 아직 실험 중이라 기본은 꺼짐입니다.",
    "**무기 모드를 바꾸는 니케를 계산에 넣을 수 있습니다** — 지금은 신데렐라 : 크리스탈 " +
      "웨이브뿐입니다. 컨트롤에서 «변환 모드»를 켜면 저격 모드로 바꿔 계산하고, " +
      "«전투 시작하자마자»와 «몇 초부터» 중에 고릅니다. 전환 한 번에 수동 재장전이 두 번 " +
      "들어 그만큼 딜이 빕니다 — 켜면 총딜이 달라집니다(끄면 예전 그대로입니다). " +
      "풀버스트 중에는 걸지 않고 끝난 뒤로 미룹니다.",
  ] },
  { date: "2026-08-28", items: [
    "**보스 구간이 계산에 반영됩니다** — «레이드 설정»의 속성저지·족자패턴·파츠 구간을 " +
      "넣어 둔 편성은 총딜이 달라집니다. 타임라인에도 그 구간이 띠로 그려집니다.",
    "**다른 언어로 보면서 손으로 고른 장비 등급을 바로잡았습니다** — 그 니케는 스탯과 " +
      "총딜이 달라집니다. 오버로드 장비를 골라도 옵션 줄이 잠겨 있던 것도 함께 고쳤습니다.",
    "**버스트 손속도를 고를 수 있습니다** — «레이드 설정 → 버스트 사이클 (고급)»에서 " +
      "고수(0.1초) · 보통(0.25초) · 초보(0.4초) 중에 고르거나 직접 넣습니다. 기본은 " +
      "보통입니다. 180초 기준 풀버스트가 15회가 되느냐 14회가 되느냐가 여기서 갈립니다.",
    "**풀버스트 횟수는 손속도만으로 정해지지 않습니다** — 버스트 게이지가 차는 속도에도 " +
      "좌우되고, 그건 편성과 버프에 따라 다릅니다. 손속도는 참고로 보시고, 실제 횟수는 " +
      "타임라인에서 확인하세요 — 아직 완벽하지 않습니다.",
    "**풀버스트 후 재충전이 다시 2초입니다** — 어제 1초로 바꿨던 것을 되돌렸습니다. " +
      "게이지 충전이 병목인 일부 편성에서만 총딜이 조금 달라집니다. " +
      "«레이드 설정 → 버스트 사이클 (고급)»에서 직접 정할 수도 있습니다.",
    "**파츠 보스에서 «파츠 대미지▲» 스킬이 평타·지속 피해에도 붙습니다** — 지금까지 " +
      "스킬 피해에만 붙어 총딜이 낮게 나왔습니다. 그 스킬이 있는 니케(레이븐 · " +
      "로산나 : 시크 오션 · 스노우 화이트 : 헤비암즈 등)를 파츠 보스에 쓰면 값이 오릅니다.",
    "**레이븐의 쇼크웨이브 지속 피해가 스택만큼 커집니다** — 지금까지 스택과 상관없이 " +
      "한 겹으로만 계산해 총딜이 실제보다 낮게 나왔습니다. 레이븐이 든 편성은 값이 오릅니다.",
  ] },
  { date: "2026-08-27", items: [
    "**아인의 홀드가 계산에 반영됩니다** — 지금까지 반영되지 않았습니다. 자동으로는 " +
      "에이다·미란다가 **모두** 있을 때만 걸리니, 다른 편성에서 쓰려면 직접 켜 주세요.",
    "**레드 후드를 3버로 고정해 계산합니다** — 지금까지 총딜이 실제보다 높게 나왔습니다.",
  ] },
];

// ── 공지 ─────────────────────────────────────────────────────────────────
// 새 소식과 달리 **쿠키가 아니라 localStorage에 "다시 보지 않기"를 체크했을
// 때만** 기록한다. 그냥 닫으면(X·확인·ESC 전부 포함) 다음 방문에 또 뜬다 —
// 공지는 "봤다"를 자동으로 가정하면 안 되는 내용이라서다. id를 바꾸면
// 예전에 다시 보지 않기를 눌렀던 사람에게도 새로 뜬다.
// 공지는 **날짜별로 쌓는다.** 새 날짜를 맨 앞에 추가하고, 오래된 항목은 그 날짜
// 블록째 지우면 된다. `NOTICE_ID`는 «다시 보지 않기»를 무효화하는 기준이라 새
// 날짜를 넣을 때마다 함께 올린다 — 그래야 이미 닫아 둔 사람에게도 새로 뜬다.
//
// 다만 **이미 나간 줄의 문구를 고칠 때는 올리지 않는다**(유저 지시 2026-08-28).
// 틀린 숫자 하나 고치자고 ID를 올리면 닫아 둔 사람 전부에게 «새 공지»로 다시 뜬다.
// 올리는 것은 **새로 알릴 내용이 생겼을 때**뿐이다.
// 2026-09-06으로 올린다 — 북미 지역이 빠져 있던 것을 고쳤다. «없는 계정»을 본 북미 유저가
// 다시 시도해야 하므로 팝업으로 알린다. (2026-09-05는 «보스 추천 설정»이었다.)
// (2026-09-04 블록의 장전컨 UI 줄을 넣을 때는 유저 지시로 안 올렸다 — 그건 화면만 늘어난 것이었다.)
const NOTICE_ID = "2026-09-06";
const NOTICE_TITLE = T("업데이트 안내");
// **유저가 알아야 할 것만 쓴다.** 한 줄에 «무엇이 달라졌나»와 «내가 뭘 하면 되나»까지다.
//   쓰지 않는 것: 왜 그랬는가(버그 원인·내부 구조), 어떻게 고쳤는가, 배포·데이터 사정,
//   «잠정»·«근본 수정 전까지» 같은 우리 쪽 일정. 그건 커밋 메시지와 코드 주석의 몫이다.
//   유저에게 말하면 «이 사이트 못 믿겠다»만 남는다.
// 날짜와 상관없이 **목록 맨 위에 붙박이로** 두는 줄. 지금은 공동성명 하나뿐이고,
// 성명이 끝나면 이 배열을 비우면 된다(상단 띠배너 `#stmt-bar`도 같이 지운다).
const NOTICE_PINNED = [
  "**「승리의 여신: 니케」 경쟁 콘텐츠 공정성 회복을 위한 이용자 공동성명** — " +
    "[성명문 보기](https://gall.dcinside.com/mgallery/board/view/?id=gov&no=6116829)",
];
const NOTICES = [
  // 북미 지역 추가 — 북미 제보 넷(2026-09-05~06)이 전부 «없는 계정»을 봤다. 지역 82를
  // 한국 계정으로만 찔러 보고 «빈 지역»이라 뺐던 것이 북미였다. 동남아(09-04) 공지와 같은 꼴.
  { date: "2026-09-06", items: [
    "**북미(NA) 서버 계정도 계정 조회가 됩니다.**",
  ] },
  // 보스 추천 설정 — 유저 지시 2026-09-05(문구·출처 링크까지 유저가 정했다).
  { date: "2026-09-05", items: [
    "**«보스 추천 설정»이 생겼습니다** — 유니온 레이드 아래 «실험실» 옆입니다. 우리 기본값은 " +
      "실제 보스와 차이가 커서, 커뮤니티에서 많이 쓰이는 추천 설정을 다섯 보스에 한 번에 넣을 수 " +
      "있게 했습니다. 누르면 무엇이 들어가는지 먼저 보여 주고 **켠 것만** 들어갑니다 — 오른쪽 " +
      "세 줄은 그대로라 **덱은 세 줄에 새로 배치해야 합니다.** 추천 설정은 계속 갱신될 수 " +
      "있습니다. 설정 출처: [아카라이브 니케 채널](https://arca.live/b/nikketgv/181416755)",
  ] },
  // 장전컨 앞당김 — 유저 지시 2026-09-04 «공지 업데이트내역에 넣어둬. 대신 공지아이디는 바꾸지말고».
  // **NOTICE_ID를 안 올린 새 날짜 블록이다** — 내역을 열어 본 사람만 본다(팝업은 안 뜬다).
  { date: "2026-09-04", items: [
    "**샷건의 버스트 게이지에도 무기 계수를 적용합니다** — 현재 계산기는 샷건 명중률 모델이 없어, " +
      "대미지와 마찬가지로 버스트 게이지에도 무기 계수를 곱합니다(빗나간 펠릿은 게이지도 " +
      "못 채웁니다). 실험실 «실누적 게이지»에서 샷건이 든 편성의 버스트 회차가 조금 줄 수 " +
      "있습니다. 기본 설정은 바뀌지 않습니다.",
    "",
    "**보스가 크면 SMG 계수를 올려 주세요** — 「레이드 설정」의 무기군 평타 계수는 탄퍼짐으로 " +
      "빗나가는 탄을 보정하는 값이라 보스 크기에 따라 달라집니다. 덩치가 큰 보스에서는 SMG를 " +
      "1.0 가까이 올려 주세요 — 이번 유니온 보스에서 볼륨은 0.8을 곱하면 실측의 0.72배, " +
      "안 곱하면 0.90배였습니다. **SMG는 추후 개선 예정입니다.**",
    "",
    "**«라플라스 : 얼티밋 히어로»의 모드 사격을 실측대로 고쳤습니다** — 「일렉트릭 파워 풀 풀 " +
      "차지」 모드 탄창에 최대 장탄 수 증가가 반영되고(120발 고정 → 최대 장탄 +69%면 203발), " +
      "모드 연사가 초당 24.5발이 됩니다. 기본 설정에서는 **라플라스 본인 딜이 2~3% 오릅니다.** " +
      "실험실의 «실누적 게이지»를 켠 경우에는 모드 사격이 버스트 게이지를 덜 채우게 되어 버스트가 " +
      "덜 돌고 편성 총딜이 약 18% 내려갑니다.",
    "",
    "**바로잡습니다 — 앞서 올린 「볼륨·리타·헬름 : 아쿠아마린·도라의 버스트 쿨타임 감소」 변경을 " +
      "되돌렸습니다. 죄송합니다.** 스킬 원문이 「하위 효과 중복 적용」이라고 적고 있는데 그 반대로 " +
      "고쳤습니다. 지금은 이전 계산으로 돌아왔으니, 그 사이에 보신 값은 무시하셔도 됩니다.",
    "",
    "**«아스카 : WILLE» 재장전 컨트롤이 계산에 들어갑니다** — 섬멸 태세가 끝나기 직전에 미리 " +
      "재장전해 두면 강제 재장전과 재장전 속도 고정이 걸리지 않고, 예열이 절반쯤 남은 채로 이어서 " +
      "쏩니다(아스카 : WILLE에게만 적용됩니다). 컨트롤에서 «장전컨 — 풀버스트 종료 1.5~1.9초 전»으로 " +
      "켜 보세요. **재장전 속도 버프가 있는 편성에서만 이득입니다** — 크라운을 낀 편성에서 아스카 " +
      "딜이 +5~8%, 버프가 없는 편성에서는 오히려 내려갑니다.",
    "",
    "**동남아(SEA) 서버 계정도 계정 조회가 됩니다** — 그동안 동남아 서버를 찾아보지 않아서, " +
      "동남아 계정으로 조회하면 같은 아이디에 딸린 글로벌 계정만 받아졌습니다. 이제 자동으로 " +
      "찾습니다. 한 아이디가 여러 서버에 걸려 있으면 **걸린 서버를 전부 계정으로 저장하고**, " +
      "니케가 많은 쪽을 먼저 띄웁니다 — 위 계정 고르개에서 바꿀 수 있습니다.",
    "",
    "**바로잡습니다 — 앞서 잠시 올라간 판에서 실수로 «모든 머신건»의 예열 냉각 시간을 " +
      "바꿨습니다. 죄송합니다.** 지금은 되돌렸습니다. 다른 머신건은 종전과 값이 같고, " +
      "«아스카 : WILLE»에게만 적용됩니다.",
    "",
    "**장전컨에 «몇 초 전에 장전»이 생겼습니다** — 컨트롤에서 장전컨을 켜고 «풀버스트 종료 전»을 " +
      "고르면, 풀버스트가 끝나기 몇 초 전에 엄폐할지 직접 넣을 수 있습니다(기본 0.3초 — 그대로 두면 " +
      "지금까지와 같습니다). 장전이 긴 니케는 더 일찍 시작해야 이득인 경우가 있습니다 — " +
      "«아스카 : WILLE»이 그렇습니다(위 항목 참고).",
  ] },
  // 실험실 — 유저 승인 문장(2026-09-03 «일단 넣어»). 큐브 문장은 같은 날 «개수 제한 없이»로 고침(NOTICE_ID 안 올림 — 문구만).
  { date: "2026-09-03", items: [
    "**«실험실»이 생겼습니다 — 큐브 최적화 · 컨트롤 자동 탐색** — 솔로·뮤지엄은 왼쪽 단추, 유니온은 아래 " +
      "«육성 효율표» 옆 «실험실»에서 엽니다. 큐브 최적화는 내 계정이 가진 큐브(보유 레벨) 중 딜에 닿는 것만 골라 " +
      "자리마다 넣어 보고 가장 높은 것을 고릅니다. 컨트롤 자동 탐색은 니케마다 켤 수 있는 조작(톡톡이·장전컨·" +
      "탄충 취소·엄폐컨/홀드·후버·버스트 금지 등)을 하나씩 바꿔 보며 총딜이 더 안 오를 때까지 갑니다. 계산상 가장 " +
      "높은 것을 고를 뿐, 그 조작을 실제로 해낼 수 있는지는 따지지 않습니다. 적용한 뒤 «되돌리기»로 원래대로 돌릴 " +
      "수 있습니다.",
  ] },
  { date: "2026-09-02", items: [
    "**«드레이크 : 그레이트 빌런»을 미리 넣어 두었습니다** — 아직 출시 전이라 명단에 «출시 전»으로 " +
      "서 있고, 계정에 없어도 편성에 넣어 계산해 볼 수 있습니다. 공개된 카드로만 계산하므로 스킬 " +
      "레벨은 10·10·10으로 고정하고, 육성은 장비 5강·소장품 SR15·7코강을 기본으로 깔아 두었습니다 " +
      "(카드 톱니에서 고칠 수 있습니다). 정식 출시 때 값이 바뀔 수 있습니다.",
    "",
    "**«한 명을 바꾼다면?»이 생겼습니다** — 편성 왼쪽 단추(유니온은 줄마다)를 누르고 자리를 " +
      "고르면, 그 자리에 넣을 수 있는 니케를 내 계정 스펙으로 전부 돌려 순위와 «지금 사람 대비 " +
      "+/−»를 보여 줍니다. «넣기»를 누르면 바로 들어가고, 다른 덱에 있던 니케면 자리를 맞바꿉니다.",
    "",
    "**«육성 효율표»가 생겼습니다** — 스킬·돌파/코어·장비 강화·오버로드 옵션·소장품·애장품을 " +
      "«목표까지» 또는 «딱 몇 개» 올린다고 했을 때, 지금 편성에서 누구를 올리는 게 딜이 제일 " +
      "오르는지 내 계정 스펙으로 돌려 순위로 보여 줍니다. 솔로·뮤지엄은 왼쪽 단추, 유니온은 아래 " +
      "«보스 셋팅 공유» 옆입니다.",
    "",
    "**유니온 줄이 짧아졌습니다** — 줄마다 있던 «프리셋 저장»·«비우기»는 아래 «프리셋 묶음 저장»·" +
      "«전부 비우기»에서 줄을 골라 하는 방식으로 합쳤습니다.",
    "",
    "**계산 속도를 다시 개선했습니다** — 직전 판 대비 약 1.6배, 초기 모델 대비 약 80배 " +
      "빠릅니다. 계산 결과는 이전과 완전히 같습니다.",
    "",
    "**폭 보기 굴림 횟수를 20회까지 늘렸습니다** — 일단 20회로 돌려 보고, 서버 부담에 " +
      "따라 추후 10~15회로 내려올 수 있습니다.",
  ] },
  { date: "2026-09-01", items: [
    "**기록 이름을 바꿀 수 있습니다** — 기록마다 «이름 변경»이 생겼습니다. 저장할 때 " +
      "자동으로 붙는 이름 대신 «키리 넣은 판»처럼 알아볼 이름을 달아 두세요.",
    "",
    "**유니온 기록 이름의 속성 표기를 바로잡았습니다** — 「S44 유니온 · 작수풍」의 세 " +
      "글자가 **보스 속성**으로 적혀 있었습니다. 이제 기록 이미지와 같이 **데려갈 속성**" +
      "(그 보스에게 우월한 속성)으로 적습니다. 이미 저장해 두신 기록의 이름은 그대로 " +
      "두었습니다 — 헷갈리면 «이름 변경»으로 고쳐 쓰시면 됩니다.",
    "",
    "**기존 주소에서 데이터를 아직 못 옮기셨다면** " +
      "[https://nikkedeck.tetra-pantone.ts.net/account]" +
      "(https://nikkedeck.tetra-pantone.ts.net/account) 로 들어가 «전체 데이터 " +
      "내보내기»를 누르고, 받은 파일을 여기 «내 계정 → 백업»의 «전체 데이터 가져오기»에 " +
      "넣으시면 됩니다. 기존 주소의 다른 화면은 이제 이곳으로 넘어오고, " +
      "**기존 주소는 며칠 안에 아예 닫습니다** — 옮기실 데이터가 있으면 그 전에 받아 두세요.",
    "",
    "**보스가 자리를 옮기는 구간을 넣을 수 있습니다** — 레이드 설정의 «보스 구간»에서 " +
      "종류를 «적정거리»로 고르고, 그 시간 동안 적정거리가 되는 무기군을 고르세요. " +
      "위 «적정거리 적용 무기군»에서 켠 무기군은 판 내내 적정이고, 이 구간은 **나머지 " +
      "무기군에만** 걸립니다. 구간이 겹치면 먼저 시작한 쪽이 이깁니다.",
  ] },
  { date: "2026-08-31", items: [
    "**여러 번 굴려 «운의 폭»을 볼 수 있습니다** — 레이드 설정의 «크리 판정»에서 «여러 번 " +
      "굴려 폭 보기»를 고르면 2~10판을 돌려 **가장 낮은 판 ~ 가장 높은 판**을 결과에 함께 " +
      "적습니다. 덱 막대 아래에 폭 막대가 서고, 얼굴 카드에는 그 니케가 얼마나 흔들리는지 " +
      "«±8%»처럼 붙습니다. 폭은 크리·코어 명중·확률 스킬이 판마다 달라져서 생깁니다.",
    "",
    "**크리를 실제로 굴려 볼 수 있습니다** — 레이드 설정의 «크리 판정»에서 고릅니다. " +
      "기본은 지금까지와 같은 «평균으로 계산»이라 아무것도 안 바뀌고, «실제로 굴리기»를 " +
      "고르면 크리가 뜨고 안 뜨고에 따라 값이 흔들립니다. 마스트 창의 한 방처럼 «크리가 " +
      "떴냐»가 중요한 편성에서 운의 폭을 볼 때 쓰세요. 시드를 적어 두면 같은 판을 다시 " +
      "볼 수 있고, 버스트 순서 비교는 언제나 평균으로 돕니다.",
    "",
    "**결과 화면에서 누가 얼마를 냈는지 한눈에 보입니다** — 덱 막대 위에 다섯 명의 " +
      "얼굴과 각자 딜이 함께 뜹니다. 카드 테두리 색이 아래 막대 조각과 짝이라 어느 " +
      "조각이 누구인지 바로 읽힙니다. 자세한 수치는 «덱별 상세»에 그대로 있습니다.",
    "",
    "**미미르에서 짠 편성을 프리셋 탭에서 바로 가져옵니다** — 미미르 덱 구성에서 상단 " +
      "QR코드 버튼을 누르고 «현재 덱 코드 복사하기»를 누른 다음, 프리셋 탭 맨 아래 칸에 " +
      "붙여넣으면 됩니다. 솔로·유니온 각각의 덱 구성 페이지로 가는 링크도 그 자리에 " +
      "있습니다.",
    "",
    "**유니온 기록을 이미지로 저장할 때 속성 표기가 화면과 같아졌습니다** — 줄마다 " +
      "«그 줄을 치는 속성»을 적습니다(화면의 줄 꼬리표와 같은 값입니다).",
    "",
    "⚔️ **아레나(PVP)를 열었습니다** — 위가 상대, 아래가 내 편성입니다. 계정의 육성값과 " +
      "큐브·스킬 레벨 그대로 5대5 한 판을 돌려 보고, 끝나면 리플레이로 다시 볼 수 있습니다. " +
      "**아직 알파라 그냥 재미로만 보세요** — 값은 정확하지 않고, 알파 단계에서는 피드백을 " +
      "받지 않습니다.",
  ] },
  { date: "2026-08-30", items: [
    "📣 **혹시 뮤지엄에서 21스텝을 넘겨 보셨나요?** — 스텝 문턱은 **20스텝까지만** 원본 " +
      "자료가 있습니다. 그 뒤와 HALL 2·3은 저희가 이어 그린 값이라 실제와 다를 수 있습니다. " +
      "**보스 · 스텝 번호 · 그때 그 덱의 누적 딜** 세 가지를 피드백에 남겨 주시면 그대로 " +
      "표에 넣겠습니다. 스텝이 막 오른 순간의 숫자가 가장 좋고, «알트아이젠 9스텝에 452억»처럼 " +
      "한 줄이면 충분합니다. 지금 가장 아쉬운 곳은 HALL 3(하베스터 · 크리스탈 챔버 · " +
      "인디빌리아)입니다.",
    "",
    "**상세 타임라인의 버스트 마커가 겹쳐도 읽힙니다** — 한 체인의 1·2·3버는 1초 안에 " +
      "연달아 서서 축 위에서 얼굴이 포개졌습니다. 이제 겹친 자리에 **몇 개인지** 숫자가 붙고, " +
      "마우스를 올리면 그 무리가 오른쪽으로 펼쳐집니다(빼면 다시 접힙니다). 축 왼쪽 위 " +
      "«▼ 전체보기»를 누르면 1·2·3단계가 아래로 세 줄로 갈라져 전부 한눈에 보입니다 — 고른 " +
      "값은 다음에 열 때도 그대로입니다.",
    "**유니온 기록 이름에 세 줄의 속성이 들어갑니다** — 「S44 유니온 · 3줄 · 1조」이던 것이 " +
      "「S44 유니온 · 작수풍 · 1조」가 됩니다. 줄 순서대로 한 글자씩입니다. 한국어 화면에서만이고, " +
      "이미 저장해 둔 기록의 이름은 그대로입니다 — 이름은 언제든 고쳐 쓸 수 있습니다.",
    "**자동으로 걸리는 버스트 주기가 이제 화면에 보입니다** — 프리카를 민트와 함께 넣는 것처럼 " +
      "조합에 따라 계산기가 주기를 걸어 주는 니케는, 카드 아래 «컨트롤»의 «버스트 주기»가 " +
      "«자동» 표를 달고 켜진 채로 보입니다. 어떤 주기가 걸렸는지 그 옆에 뜨고, 누르면 이 " +
      "편성에서만 끌 수 있습니다.",
    "**공유 링크가 하루 만에 사라지지 않습니다** — 지금까지는 만든 지 24시간이 지나면 " +
      "열리지 않았습니다. 이제 그대로 남습니다. 링크에 담기는 것은 예전과 같이 편성과 딜 " +
      "수치뿐이고, 필요 없어지면 공유 상자에서 직접 지울 수 있습니다.",
    "**니케 목록을 «계산 정확도»로 걸러 볼 수 있습니다** — 필터를 열면 «계산 정확도» 줄에 " +
      "표시 없음 · 확인중 · 미지원 · 계산 오류 칩이 있습니다. «표시 없음»만 고르면 표가 붙은 " +
      "니케가 빠집니다. 역할군·속성처럼 여러 개를 함께 고를 수 있고, 아무것도 안 고르면 " +
      "전부 나옵니다.",
    "**프리셋·기록을 불러오면 큐브가 내 계정의 장착분으로 채워집니다** — 지금까지는 그 덱에 " +
      "있던 앞 편성의 큐브가 그대로 남아, 불러온 니케가 엉뚱한 큐브로 계산됐습니다. 인게임에서 " +
      "큐브를 안 낀 니케는 기본값(렐릭 베어 Lv15)으로 들어가고, 카드의 큐브 칸에서 언제든 " +
      "바꿀 수 있습니다.",
    "**플로라의 «시공증»이 컨트롤 없이 기본으로 걸립니다** — 인게임과 같은 기준(옆 아군의 " +
      "표시 체력%가 90 이하로 내려가면 발동)으로 판정합니다. 계정에서 받은 스펙이면 " +
      "**편성 자리와 상관없이 항상** 걸립니다.",
    "**플로라에 «홀수 주기»가 생겼습니다** — 1·3·5…번째 풀버스트에만 씁니다. 카드 아래 " +
      "«컨트롤 → 버스트 주기»에서 «짝수 주기»와 함께 고를 수 있습니다.",
    "**버스트 주기 목록이 늘었습니다** — 마스트 : 로망틱 메이드에 «마크마 크크마 크크마 크크마 크마», " +
      "플로라에 «짝수 주기»(2·4·6…)입니다. 주기 이름은 몇 번째 풀버스트에 누가 쓰는지 " +
      "그린 것입니다 — 마=본인, 크=같은 단계의 다른 니케. 카드 아래 «컨트롤 → 버스트 " +
      "주기»에서 고릅니다.",
    "**고친 육성값을 이름 붙여 저장해 두고 갈아 끼울 수 있습니다** — 위 «계정» 옆에 " +
      "«프로필» 칸이 생겼습니다. 카드 톱니로 육성을 고치면 그 옆에 **되돌리기·저장·새 " +
      "저장** 단추가 나타납니다. «새 저장»으로 남겨 두면 나중에 골라서 그대로 다시 " +
      "쓸 수 있고, «기본»을 고르면 계정에서 받은 값 그대로 계산합니다. 계정을 여러 벌 " +
      "만들 필요가 없습니다.",
    "**프로필은 계정 안에 붙어 있습니다** — 그 계정을 지우면 **저장해 둔 프로필도 " +
      "함께 지워집니다.** 지우기 전에 몇 개가 같이 사라지는지 물어봅니다. 계정을 " +
      "«내보내기»로 파일에 담으면 프로필도 같이 담기고, 그 파일을 다시 불러오면 " +
      "그대로 되살아납니다.",
    "**상세 타임라인에 풀버스트 번호가 붙었습니다** — 위 축의 풀버스트 띠마다 «#1 · #2 · #3»이 " +
      "적힙니다. 띠에 마우스를 올리면 «3번째 풀버스트 — 10.00초»가, 버스트 얼굴 마커에 올리면 " +
      "그 버스트가 여는 «(#3 풀버스트)»가 함께 뜹니다.",
    "**영문·일문·중문 화면에 한글이 남던 곳을 정리했습니다** — 편성 안내문(«계산 오류 : …»)이 " +
      "통째로 한국어였던 것, 피드백 게시판의 «익명»·«운영자», 안내 문구 속 니케 이름입니다.",
    "**프리셋·기록의 폴더 단추 색을 맞췄습니다** — 어두운 판 위에 흰 단추만 떠 있었습니다.",
  ] },
  { date: "2026-08-29", items: [
    "**«버스트 게이지 실누적»(실험실)의 아군 충전 계산이 확정됐습니다** — 아군이 받는 " +
      "양은 이제 **«버프를 건 니케의 히트당 충전량 × 버프%»**로 계산합니다. 커뮤니티와 " +
      "원작자 실측으로 공식이 확정된 것을 그대로 옮겼습니다(크라운 550발·375발 재현). " +
      "**손으로 켜던 «풀차지 래치» 칸은 없어졌습니다** — 그 두 배의 정체가 «보스전 " +
      "버스트 게이지 2배»였고, 버퍼가 한 대라도 맞히면 자동으로 걸립니다. 켜 두셨던 " +
      "설정은 알아서 정리됩니다.",
    "**실누적을 켠 편성만 값이 조금 달라집니다** — 특히 아니스 : 스타·그레이브처럼 " +
      "버스트 충전 속도를 아군에게 거는 니케가 든 덱입니다. **기본(고정) 모드는 " +
      "아무것도 안 바뀝니다.**",
    "**윈도우에서 자음 검색이 안 걸리던 것을 고쳤습니다** — 자음만 연달아 치면 윈도우 " +
      "한글 입력기가 둘을 붙여 버립니다(ㅂ+ㅅ → ㅄ). 그래서 「베스티」를 찾으려고 " +
      "«ㅂㅅㅌ»를 쳐도 실제로는 «ㅄㅌ»가 들어가 아무것도 안 나왔습니다. 이제 붙은 채로도 " +
      "찾습니다 — «ㅄㅌ» 베스티, «ㄿㅈ» 라푼젤, «ㅇㅇㄳ» 아이기스처럼요. 맥은 원래 " +
      "안 붙어서 예전과 같습니다.",
    "**뮤지엄 스텝 계산기가 열렸습니다(BETA)** — 오른쪽 위 «뮤지엄»입니다. HALL을 고르고 " +
      "왼쪽 보스 카드를 «보스» 칸에 끌어다(또는 눌러) 놓으면, 덱 다섯의 딜을 스텝으로 바꿔 " +
      "**합산 스텝**을 보여 줍니다(덱당 최대 28, 합 140). 덱·설정·프리셋·기록은 솔로와 따로 " +
      "저장되고, 덱 다섯은 보스마다 따로 남습니다.",
    "**보스마다 아군 버프가 붙습니다** — HALL 톱니 옆의 «기본»은 항상 들어가고, «주간»은 " +
      "고르개에서 «+ …»를 고르면 더해집니다. 보스 카드의 톱니는 그 HALL 보스의 기본값이고, " +
      "보스를 배치하면 덱 다섯의 레이드 설정에 들어갑니다.",
    "**베타입니다** — 스텝 문턱은 추정치라 실제와 조금 다를 수 있고, 문제가 있을 수 있습니다. " +
      "업데이트가 수시로 이루어져 **화면 구성이 계속 바뀔 수 있습니다.**",
    "",
    "**레이드 설정 «보스 구간»에 «전투 내내 코어»가 생겼습니다** — «전투 내내 파츠» 옆입니다. " +
      "코어가 처음부터 끝까지 열린 보스에 쓰세요. 코어 크기는 따로 정해야 합니다.",
    "**도로롱 모드를 유니온·뮤지엄에서도 켤 수 있습니다** — 솔로에서 켰으면 그대로 따라갑니다.",
    "**상세 타임라인 «상시 효과»에 영문 키가 그대로 뜨던 것을 고쳤습니다.**",
    "",
    "**유니온 레이드에 «회차 보스 설정»이 생겼습니다** — 왼쪽 보스 카드의 톱니를 누르면 " +
      "그 회차 그 보스의 **기본값**을 정해 둘 수 있습니다. 레이드 설정에서 정하는 값이 " +
      "전부 들어갑니다. 줄에 보스를 **배치하면 이 기본값이 들어가고**, 그 줄에서 고친 것은 " +
      "**그 줄에만** 남습니다 — 기본값은 그대로입니다. 다시 배치하면 기본값으로 돌아옵니다.",
    "**회차 보스 설정 다섯을 통째로 주고받을 수 있습니다** — «회차» 고르개 옆 톱니입니다. " +
      "받은 코드는 기본값만 바꾸고 세 줄은 그대로 둡니다. 세 줄에 부어 넣고 싶으면 " +
      "«세 줄에 다시 적용»을 누르세요.",
    "",
    "**프리셋과 기록을 내가 만든 폴더로 정리할 수 있습니다** — «단일/묶음»(기록은 " +
      "«시뮬/솔레») 옆의 «+»로 폴더를 만들고, 카드를 끌어다 폴더에 놓으면 들어갑니다. " +
      "빼려면 «전체» 같은 원래 칩에 놓으면 됩니다. 폴더는 열 개까지 만들 수 있고, " +
      "폴더를 지워도 안에 있던 것은 지워지지 않습니다.",
    "**프리셋 목록이 첫 줄만 보입니다** — 묶음 하나가 다섯 줄을 차지해 목록이 길었습니다. " +
      "«+4덱 더 보기»를 누르면 펼쳐집니다.",
    "**신데렐라 : 크리스탈 웨이브의 무기 모드 전환을 넣을 수 있습니다** — 컨트롤의 " +
      "«변환 모드»입니다. 전환에 수동 재장전이 두 번 들어가는 것까지 계산에 들어갑니다.",
    "",
    "**상세 타임라인 뷰어에서 딜에 마우스를 올리면 자세히 보입니다** — 맨 위 «다섯 합산» " +
      "그래프에 올리면 그 순간의 합계와 사람별 딜이, 오른쪽 «총딜»에 올리면 누적 합계와 " +
      "사람별 딜이 평타·스킬로 나뉘어 나옵니다.",
    "**한국어가 아닌 화면에서 스킬·버프 이름이 한글로 남던 것을 고쳤습니다** — 상세 타임라인의 " +
      "«스킬 딜 내역»과 «상시 효과»입니다.",
    "**유니온 레이드에서 «전부 비우기»가 듣지 않던 것을 고쳤습니다** — 누르면 세 줄이 " +
      "비워지고, 되돌리기로 살릴 수 있습니다.",
    "",
    "",
    "**버스트 게이지를 쏜 만큼 채워 보는 «실험실»이 열렸습니다** — «버스트 사이클»에서 " +
      "«버스트 게이지 실누적»을 켜면, 정해진 초가 아니라 **실제로 맞힌 총알**이 게이지를 " +
      "채워 100%에 1버스트가 열립니다. 게이지가 병목인 편성일수록 총딜이 많이 달라집니다. " +
      "풀차지가 게이지를 더 주는 것은 **가운데(3번) 자리에 둔 니케**뿐입니다 — 화면이 " +
      "그쪽을 보고 있기 때문입니다.",
    "**실험실은 기본이 꺼짐이고, 켜지 않으면 결과가 달라지지 않습니다** — 아직 맞춰 가는 " +
      "중이라 값이 바뀔 수 있습니다.",
    "",
    "**버스트 손속도 기본이 0.1초로 돌아왔고, 이름도 바꿨습니다** — «고수/보통/초보» 대신 " +
      "«기본(0.1초) · 느림(0.25초) · 많이 느림(0.4초)»입니다. 손속도는 잘하고 못하고가 " +
      "아니라 얼마나 느리게 눌리느냐일 뿐입니다. 0.25초로 두면 풀버스트가 한 회 통째로 " +
      "날아가서 기본을 되돌렸습니다 — **손대지 않으셨다면 총딜이 조금 오릅니다.** " +
      "예전에 0.25초로 저장돼 있던 설정은 한 번 0.1초로 옮겨집니다.",
    "",
    "**다른 니케 사이트로 가는 길이 위 메뉴에 생겼습니다** — «MIMIR»는 덱 빌딩과 니케 " +
      "데이터 관리, «솔레 금서고»는 솔로레이드 결과 기록입니다.",
    "**미미르에서 짠 편성을 여기로 바로 가져올 수 있게 됩니다** — 미미르 쪽에 연동 " +
      "기능이 붙으면, 거기서 만든 편성이 이 계산기의 덱으로 그대로 들어옵니다. " +
      "유니온 편성은 줄마다 적힌 약점 속성에 맞춰 최신 회차의 랩처까지 함께 앉습니다.",
  ] },
  { date: "2026-08-28", items: [
    "**보스 구간을 넣을 수 있습니다** — «레이드 설정»의 «보스 구간»에서 시간대를 정합니다. " +
      "**속성저지**는 그 시간 동안 약점에 우월한 니케만 딜이 들어가고, **족자패턴**은 아무 " +
      "딜도 안 들어갑니다. 여러 구간을 넣을 수 있고, 계산과 타임라인에 그대로 반영됩니다. " +
      "둘 다 대미지만 0이라 재장전·버스트 게이지·버프는 평소대로 흐릅니다.",
    "**파츠도 «보스 구간»에서 함께 정합니다** — 파츠가 떠 있는 시간대입니다. 구간이 **끝나는 " +
      "시각이 파츠 파괴**라, 일점 공격이나 사쿠라 : 블룸 인 서머처럼 파괴에 반응하는 스킬이 " +
      "거기서 터집니다. 전투 내내 파츠가 있는 보스는 «전투 내내 파츠»를 누르면 됩니다. " +
      "파츠를 안 노릴 니케는 컨트롤에서 «파츠 안 노림»을 켜면 몸통만 칩니다.",
    "**버스트 손속도를 고를 수 있습니다** — «레이드 설정 → 버스트 사이클 (고급)»에서 " +
      "고수(0.1초) · 보통(0.25초) · 초보(0.4초) 중에 고르거나 직접 넣습니다. 기본은 " +
      "보통입니다. 180초 기준 풀버스트가 15회가 되느냐 14회가 되느냐가 여기서 갈립니다.",
    "**풀버스트 후 재충전 시간을 정할 수 있습니다** — «버스트 사이클 (고급)»에 있습니다. " +
      "기본 2초이고, 0으로 두면 쿨만 돌아오는 즉시 다음 체인이 열립니다.",
    "",
    "**«보스 셋팅 공유»가 어느 줄에 어느 보스를 올렸는지까지 담습니다** — 받으면 세 줄의 " +
      "보스와 그 줄의 레이드 설정이 그대로 들어갑니다. 레이드 설정은 지금처럼 **줄마다 " +
      "따로**입니다 — 같은 보스를 두 줄이 쳐도 줄마다 다르게 넣을 수 있습니다.",
    "**한국어가 아닌 화면에서 장비를 손으로 고르면 잘못 저장되던 것을 고쳤습니다** — " +
      "오버로드 장비를 골라도 옵션 줄이 잠겨 있었고, 그 니케의 스탯도 어긋난 채 " +
      "계산됐습니다. 저장돼 있던 것은 접속하면 자동으로 바로잡힙니다.",
    "",
    "**보스 설정을 코드로 주고받을 수 있습니다** — «레이드 설정» 맨 아래 «설정 공유»를 " +
      "누르면 짧은 코드와 주소가 나옵니다. 받은 사람은 같은 자리에 코드를 넣거나 주소를 " +
      "열면 방어력·코어·파츠·적정거리·계수가 그대로 들어갑니다. 유니온은 회차와 세 줄의 " +
      "보스·설정이 함께 담겨, 받는 쪽도 같은 회차로 열립니다.",
    "**공유 코드가 영문·숫자만 씁니다** — 대문자로 쳐도 소문자로 쳐도 같이 열립니다. " +
      "편성 공유 코드도 같습니다.",
    "",
    "**검색이 화면에 보이는 이름으로도 됩니다** — 다른 언어로 보고 있으면 그 언어의 이름을 " +
      "그대로 쳐서 찾을 수 있습니다. 한국어에서는 자음(ㅁㅎㄹ)과 별명(도로롱)이 그대로 됩니다.",
    "**이름순 정렬이 보고 있는 언어를 따릅니다** — 영어로 보면 알파벳순, 일본어·중국어도 " +
      "그 언어의 순서로 섭니다.",
    "",
    "**버스트 비교에서 «적용»을 누르면 바로 다시 계산합니다** — 자리가 바뀌면 총딜이 " +
      "비어 버려서 «적용이 안 됐나» 싶던 것을 고쳤습니다. «되돌리기»도 같습니다.",
    "**유니온 레이드에서 버스트 주기가 저장되지 않던 것을 고쳤습니다** — 이제 골라도 " +
      "직접 입력해도 그대로 남습니다. 같은 줄에서 주기가 겹칠 때는 왜 막히는지 함께 뜹니다.",
    "",
    "**니케 9명을 새로 넣었습니다** — 2B · 메어리 : 베이 갓데스 · 사쿠라 · 솔린 · 아리아 · " +
      "앤 : 미라클 페어리 · 클레이 · 폴리 · 엑시아. 편성에 넣고 계산할 수 있습니다.",
    "**계산을 얼마나 믿을 수 있는지 표시합니다** — 그 니케만의 사정이 있는 경우 카드에 «!» " +
      "표가 붙습니다. 계산이 그 니케의 핵심을 아직 다루지 못하거나(미지원), 계산이 틀린 것으로 " +
      "확인됐거나(계산 오류), 지금 손보는 중(확인중)일 때입니다. 무엇이 어떻게 부정확한지는 " +
      "편성 화면과 결과 화면에 적힙니다.",
    "",
    "**상세 타임라인 뷰어(베타)를 엽니다** — 결과 화면에서 덱 카드의 «딜 타임라인»을 펼치면 " +
      "«상세 타임라인 뷰어» 버튼이 있습니다. 초 단위로 누가 언제 무엇을 했는지, 버프가 " +
      "언제 걸렸는지 볼 수 있습니다.",
    "뷰어 맨 위에 **다섯 명을 합친 딜 그래프**가 생겼습니다 — 색깔별로 쌓여 있어 어느 " +
      "구간에서 누가 얼마나 넣었는지 한눈에 보입니다. 얼굴을 끌어 줄 순서를 바꾸면 쌓인 " +
      "순서도 따라 바뀝니다. 오른쪽 아래 «단축키»에 조작법이 적혀 있습니다.",
    "뷰어는 **계산기가 낸 값을 그대로 그립니다** — 아직 더 다듬는 중이라 값이 바뀔 수 있습니다.",
    "",
    "**피드백에 댓글을 달 수 있습니다** — 글 아래 칸에 바로 남기면 됩니다. 비공개 글은 " +
      "«비밀번호로 보기»로 연 뒤에 달 수 있고, 운영자 댓글도 같은 자리에 붙습니다.",
    "**남긴 글에 진행 표가 붙습니다** — 검토중 · 반영완료 · 답변완료. 목록에서 바로 보입니다.",
  ] },
  { date: "2026-08-27", items: [
    "**계산 로직을 손보는 기간입니다** — 계산값이 계속 바뀔 수 있습니다. 무엇이 " +
      "바뀌었는지는 화면 맨 위 «로직 변경 내역»에서 볼 수 있습니다.",
    // 뷰어 공지는 2026-08-28 블록으로 옮겼다 — `NIKKE_NO_TIMELINE=1`은 **로컬 빌드에만**
    // 걸려 있고 서버는 그냥 `python3 web/build.py`를 돌리므로, 배포판에는 뷰어가 늘 실려
    // 나가고 있었다(2026-08-27 상용 실측: 버튼도 응답의 `timeline`도 정상).
    "**자동으로 걸리는 컨트롤을 끌 수 있습니다** — 컨트롤 패널에서 «자동» 표식이 붙은 " +
      "칩(아인·에이다 홀드, 미하라 엄폐 등)을 누르면 그 편성에서만 꺼집니다. " +
      "«전부 자동»으로 되돌립니다.",
    "",
    "**버스트 비교를 추가했습니다** — 편성 화면의 «버스트 비교»를 누르면 버스트 순서와 " +
      "금지를 조합해 돌려 보고, 지금보다 딜이 높은 편성을 알려 줍니다. «적용»을 누르면 " +
      "그 순서대로 편성 자리가 바뀌고, «되돌리기»로 되돌립니다.",
    "**버스트 순서는 편성 자리로 정합니다** — 같은 단계에서는 왼쪽에 선 니케가 먼저 " +
      "씁니다(인게임 오토와 같습니다). 컨트롤의 «선버스트» 체크는 없앴고, 켜 두셨던 " +
      "편성은 같은 순서가 되도록 자리를 옮겨 두었습니다 — 계산값은 그대로입니다.",
    "**라피 : 레드 후드를 편성에 맞춰 봅니다** — 1버 아군이 없으면 라피가 1버로 갑니다. " +
      "버스트 비교와 편성 경고가 이제 그 편성을 그대로 봅니다.",
    "**검색이 초성과 별명을 받습니다** — 「ㅁㅎㄹ」로 미하라를, 「수렐루」로 " +
      "신데렐라 : 크리스탈 웨이브를 찾습니다. 「클디젤」·「르나린디」 같은 줄임말도 되고, " +
      "별명도 초성으로 걸립니다. **없는 별명은 피드백으로 알려 주세요.**",
    "**콘솔 레벨을 9999까지 넣을 수 있습니다** — 공통·역할군·기업 세 갈래 모두입니다. " +
      "값은 목록에서 고르는 대신 직접 칩니다.",
    "**9/4 유니온 레이드 회차를 미리 넣었습니다** — 유니온 화면에서 회차를 고르면 " +
      "이번 보스 다섯(레이턴스·툼스톤·모더니아·리빌드 빅 토르소·애니힐리오)이 " +
      "속성대로 뜹니다.",
    "**화면마다 주소가 생겼습니다** — 뒤로 가기가 이전 화면으로 가고, 새로고침해도 보던 " +
      "화면 그대로입니다. 주소를 복사해 그 화면을 바로 열 수 있습니다.",
    "**캡처 판독이 후보를 다 보여 줍니다** — 다른 칸이 먼저 가져간 니케도 «다른 칸에 있음»" +
      "으로 표시되어 목록에 남습니다.",
  ] },
  { date: "2026-08-26", items: [
    "**계산 속도를 약 50배 개선했습니다** — 덱 계산이 몇 초씩 걸리던 것이 이제 1초 안에 " +
      "끝납니다. 계산 결과는 이전과 완전히 같습니다.",
    "**계산은 이제 서버에서만 처리합니다** — 브라우저 계산과 «계산 처리» 선택 버튼은 " +
      "없어졌습니다.",
  ] },
  { date: "2026-08-25", items: [
    "**DILDORO를 오픈합니다 — 새 주소는 [https://dildoro.com](https://dildoro.com) 입니다.** 기존 주소는 브라우저 " +
      "저장 데이터 이전을 위해 이번 솔로 레이드 기간 동안 유지합니다.",
    "**도메인이 달라 저장 데이터는 자동으로 따라오지 않습니다** — 기존 주소의 «내 계정» " +
      "맨 위에서 «전체 데이터 내보내기»를 누르고, [https://dildoro.com](https://dildoro.com)의 «내 계정»에서 그 파일을 " +
      "가져오세요.",
    "**사이트 이름을 니케덱랩에서 DILDORO로 변경했습니다** — 계산 기능과 브라우저 저장 " +
      "방식은 그대로입니다.",
    "**도로롱 모드를 추가했습니다** — 오른쪽 위의 작은 도로롱 버튼으로 흰색·분홍색 테마를 " +
      "켜고 끌 수 있으며, 선택은 이 브라우저에 저장됩니다. 화면을 돌아다니는 도로롱은 " +
      "마우스나 터치로 잡아 던질 수 있습니다.",
    "",
    "**영어·일본어·중국어(번체)를 지원합니다** — 브라우저 언어에 맞춰 자동으로 바뀌고, " +
      "맨 아래 언어 버튼으로 직접 고를 수도 있습니다. 니케·스킬·랩처 이름은 인게임 " +
      "표기를 그대로 씁니다. 어색한 번역은 «피드백»으로 알려 주세요.",
    "",
    "**유니온 레이드 베타를 엽니다** — 위쪽에서 «유니온 레이드»로 바꾸면 세 줄을 " +
      "한 번에 짜고 계산할 수 있습니다. 회차별 보스를 골라 두면 줄마다 약점이 " +
      "따라오고, 레이드 설정도 줄별로 따로 줍니다.",
    "아직 **준비 중이라 계산 용도로만** 써 주세요 — 보스별 세부 설정 등 남은 것이 " +
      "있고, 화면과 값이 더 바뀔 수 있습니다.",
    "«내 계정» 탭에서 **다시 싱크**를 한 번 눌러 주세요 — 유니온 정보가 그때 " +
      "들어옵니다. 전에 싱크해 둔 계정에는 없던 것이라, 누르기 전에는 상단 " +
      "유니온 자리가 비어 보입니다.",
    "**피드백을 많이 주세요.** 어색한 곳, 안 되는 곳, 있었으면 하는 것 무엇이든 " +
      "«피드백» 탭에 적어 주시면 반영합니다. 문제가 있어도 그쪽으로 알려 주세요.",
    "",
    "연출이 어지러우면 **오른쪽 위 SOLO/UNION 스위치 옆의 ✦를 눌러 무거운 애니메이션을 " +
      "끌 수 있습니다** — 끄면 튀는 것 없이 조용히 결과만 바뀝니다. 솔로·유니온 공용이라 " +
      "한 번만 꺼 두면 됩니다.",
  ] },
  { date: "2026-08-24", items: [
    "「투사체 폭발 대미지 ▲」는 **원래 무기가 RL인 니케만** 받습니다 — 무기 변경으로 " +
      "RL이 된 사격(나유타 등)에는 적용되지 않도록 고쳤습니다. 실측 대조로 확인했습니다.",
    "**차지 배율 계산을 수정했습니다** — 무기의 풀차지 배율과 「차지 대미지 ▲」 버프는 " +
      "곱이 아니라 **가산**(%p 합)입니다. 인게임 차징 표기·솔로 레이드 전투 기록 대조로 " +
      "확인했으며, **차지 대미지 버프를 받는 SR·RL**일수록 총딜이 내려갑니다 — 실측 " +
      "편성 예: 프리카 −20% · 민트 −14% · 스노우 화이트 : 헤비암즈 −13% · " +
      "디젤 : 윈터 스위츠 −3% · 네온 : 비전 아이 −2% (버프·오버로드 구성에 따라 다름).",
    "**큐브 버그를 수정했습니다** — 편성 화면에 보이는 큐브가 항상 계산에 쓰입니다. " +
      "이전에는 큐브 칸을 건드리지 않은 니케가 프로필의 장착 상태(미장착 포함)로 " +
      "계산되는 경우가 있었습니다.",
    "",
    "니케 그림이 **지금 입고 있는 코스튬(스킨)**으로 나옵니다 — 블라블라링크에서 " +
      "장착 중인 코스튬을 함께 받아와 편성 카드·배치 모드 얼굴·전투력 계산기 " +
      "전신 일러까지 그대로 바뀝니다. 외형뿐이라 **계산에는 아무 영향이 없습니다**.",
    "",
    "레이드 설정에 **무기군 평타 계수**를 추가했습니다 — 실전에서 탄퍼짐으로 빗나가는 " +
      "탄을 보정합니다. 이번 솔로 레이드 실측(전투 기록 대조) 기준 기본값은 " +
      "**SG 0.90 · SMG 0.80**, 나머지는 1.00이며 언제든 조절할 수 있습니다.",
    "계수는 **평타에만** 적용됩니다 — 스킬·버스트 대미지, 변신 모드(나유타 나래신장 " +
      "등)의 공격은 조준 판정이라 보정하지 않습니다. 기본값 상태에서는 SG·SMG가 " +
      "포함된 편성의 총딜이 이전보다 낮아집니다.",
    "",
    "편성 화면에서 **큐브를 칸마다 따로** 지정할 수 있습니다 — 카드 아래에서 종류와 " +
      "레벨을 고르면 그 자리에 적용되고, 니케를 옮기거나 덱 순서를 바꿔도 함께 " +
      "따라갑니다.",
    "큐브 레벨에 **미장착**을 추가했습니다 — 큐브를 끼지 않은 상태 그대로도 " +
      "계산할 수 있습니다.",
    "«전투력 계산기»는 블라블라링크에서 받아온 **실제 장착 중인 큐브**를 그대로 " +
      "보여줍니다. 편성 계산과 달리 지금 상태 그대로입니다.",
    "",
    "컨트롤에 **버스트 금지**를 추가했습니다 — 쿨이 돌아와도 그 니케는 버스트를 " +
      "쓰지 않아, 원하지 않는 니케가 끼어드는 것을 막을 수 있습니다.",
    "",
    "«내 계정» 탭에서 **다시 싱크**를 한 번 눌러 주세요 — 큐브 장착 정보와 " +
      "코스튬(스킨) 정보가 이번 갱신부터 들어옵니다.",
  ] },
  { date: "2026-08-23", items: [
    "재장전 딜레이를 인게임 실측값(CDN) 기반으로 정교화했습니다 — 탄 소진 후 재장전 " +
      "시작·복귀에 실제 딜레이(대부분 0.2초)가 반영되어 총딜이 소폭 낮아질 수 있습니다.",
    "클립식 SG·RL(누아르·드레이크·바이퍼·네온·페퍼·슈가·메이든·프로덕트 23·" +
      "소다 : 트윙클링 바니·센티·루마니·아니스·자칼·트리나)에 '원클립 재장전' " +
      "컨트롤을 추가했습니다 — 한 클립만 채우고 사격으로 복귀합니다.",
    "차지 무기(SR·RL)에도 재장전 시작 지연(신규 +0.2초)이 반영되어, 해당 무기 비중이 " +
      "큰 편성은 총딜이 더 크게(실측 -10~17%대 사례 있음) 줄어들 수 있습니다.",
    "아니스 : 스타·리버렐리오·네온 : 비전 아이는 위 신규 시작 지연(+0.2초)이 " +
      "똑같이 붙는 대신, 수동으로 걸려 있던 재장전 복귀 지연이 0.5초 → 0.2초로 " +
      "줄어듭니다(-0.3초). 둘을 더하면 순 -0.1초 — 0.3초 이득이 아니라 소폭 " +
      "빨라지는 정도입니다.",
  ] },
];

/** 공지의 `**굵게**`와 `[표시](https://주소)`만 안전하게 조각으로 만든다.
 *  링크는 새 탭으로 열고, `innerHTML`은 쓰지 않는다. */
function noticeLinkParts(text) {
  const out = [];
  const pattern = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > cursor) out.push(document.createTextNode(text.slice(cursor, match.index)));
    const link = el("a", "notice-link", match[1]);
    link.href = match[2];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    out.push(link);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) out.push(document.createTextNode(text.slice(cursor)));
  return out;
}

function boldParts(text) {
  const out = [];
  for (const [i, part] of String(text).split("**").entries()) {
    if (!part) continue;
    const pieces = noticeLinkParts(part);
    if (i % 2) {
      const bold = el("b");
      bold.append(...pieces);
      out.push(bold);
    } else out.push(...pieces);
  }
  return out;
}

// ── 피드백 게시판 ──────────────────────────────────────────────────────
// 서버가 있어야 도는 기능이다 — 정적 서빙(로컬 미리보기)에서는 목록이 비고
// 전송이 실패하는데, 그 사실을 문구로 말해 준다. 목록은 30개씩 끊어 내려받는다.
const FB_PAGE = 30;
let fbOldest = null;   // 마지막으로 받은 글의 ts — «더 보기»의 기준점

// 이 브라우저가 쓴 비공개 글의 {id: 비밀번호} — 본인 기기에서는 비번 재입력 없이
// 자동으로 펼쳐 보인다. 서버는 누가 썼는지 모른다(익명 유지).
const fbMine = () => load(LS.fbMine, {});

/** 날짜 한 조각 — 목록에도 댓글에도 같은 꼴이어야 «언제»가 한눈에 이어진다. */
const fbWhen = (ts) => new Date(ts * 1000).toLocaleDateString("ko-KR",
  { month: "numeric", day: "numeric" });

/** 운영자가 단 표(검토중·반영완료·답변완료). 없으면 아무것도 안 만든다 —
 *  표가 없는 것이 기본이라 «표 없음» 배지를 달면 목록이 배지로 도배된다. */
function fbStatusChip(status) {
  if (!status) return null;
  const chip = el("span", "fb-status", status);
  chip.dataset.k = status;
  return chip;
}

/** 댓글 한 줄. 운영자 댓글은 이름 대신 **색으로** 갈린다 — 목록에서 «답이 왔나»가
 *  이름을 읽기 전에 보여야 한다. */
function fbComment(cm) {
  const row = el("div", "fb-comment" + (cm.admin ? " admin" : ""));
  row.append(el("span", "fb-cmeta", `${T(cm.nick)} · ${fbWhen(cm.ts)}`));
  const b = el("span", "fb-cbody");
  b.textContent = cm.body;                      // **textContent** — 남이 쓴 글이다
  row.append(b);
  return row;
}

/** 댓글 칸 + 달기.
 *
 *  `pw`는 비공개 글을 열 때 쓴 비밀번호다. 서버가 댓글마다 **다시 대조**하므로
 *  열어 본 사람만 그 글에 댓글을 달 수 있다(공개 글은 `null`이고 누구나 단다).
 *  비밀번호를 화면에 담아 두지는 않는다 — 이 함수가 닫힐 때까지의 변수일 뿐이다. */
function fbCommentBox(div, it, pw) {
  const wrap = el("div", "fb-comments");
  for (const cm of it.comments || []) wrap.append(fbComment(cm));

  const form = el("form", "fb-cform");
  const nick = el("input", "fb-cnick");
  // 「(선택)」까지 넣으면 이 좁은 칸에서 «닉네임 (»으로 잘린다 — 비어 있으면
  // 익명이 되는 것은 글쓰기 칸과 같은 규약이라 굳이 안 적는다.
  nick.type = "text"; nick.maxLength = 12; nick.placeholder = T("닉네임");
  // 한 줄 칸이면 긴 답글을 쓸 때 **쓴 것이 안 보인다**(제보 2026-08-30). 글쓰기 칸과
  // 같이 아래로 끌어 늘릴 수 있는 상자로 둔다. 엔터는 줄바꿈이 되므로(상자니까)
  // 빠르게 보내던 사람을 위해 Ctrl/⌘+Enter를 남긴다.
  const inp = el("textarea", "fb-cinput");
  inp.rows = 2; inp.maxLength = 500; inp.placeholder = T("댓글 남기기 (1~500자)");
  inp.onkeydown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  };
  const send = el("button", "btn btn-ghost", "달기");
  send.type = "submit";
  send.title = T("Ctrl+Enter로도 보냅니다");
  const note = el("span", "fb-note", "");
  form.append(inp, nick, send, note);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = inp.value.trim();
    if (!body) { note.textContent = T("내용을 적어 주세요."); return; }
    send.disabled = true;
    note.textContent = T("보내는 중…");
    try {
      const r = await fetch("/api/board/comment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, body, nick: nick.value, pw: pw || "" }),
      });
      const j = await readJSON(r);
      if (!r.ok || j.error) throw new Error(j.error || T("전송 실패"));
      inp.value = "";
      note.textContent = "";
      // 방금 단 것을 **그 자리에서** 보여 준다 — 목록을 통째로 다시 받으면 열어 둔
      // 비공개 글이 도로 잠기고, 읽던 자리를 잃는다.
      const mine = { id: "", ts: Date.now() / 1000,
                     nick: (nick.value.trim() || "익명").slice(0, 12), body, admin: 0 };
      it.comments = [...(it.comments || []), mine];
      form.before(fbComment(mine));
    } catch (err) {
      note.textContent = String(err.message || T("전송 실패 — 잠시 후 다시 시도해 주세요."));
    } finally {
      send.disabled = false;
    }
  };
  wrap.append(form);
  div.append(wrap);
}

function fbFill(div, it, pw = null) {
  div.textContent = "";
  const meta = el("div", "fb-meta",
    `${it.private ? "🔒 " : ""}${T(it.nick)} · ${fbWhen(it.ts)}`);
  const chip = fbStatusChip(it.status);
  if (chip) meta.append(" ", chip);
  div.append(meta);
  const body = el("div", "fb-body"); body.textContent = it.body; div.append(body);
  if (it.reply) {
    const r = el("div", "fb-reply"); r.textContent = it.reply;
    div.append(r);
  }
  fbCommentBox(div, it, pw);
}

async function fbUnlock(div, it, pw, note) {
  try {
    const r = await fetch("/api/board/view", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, pw }),
    });
    // 본문은 **한 번만** 읽을 수 있다 — 읽고 나서 판단한다.
    const j = await readJSON(r);
    if (!r.ok || j.error) throw new Error(j.error || T("열람 실패"));
    // **비밀번호를 넘겨준다** — 연 사람이 그대로 댓글을 달 수 있어야 한다.
    // 서버가 댓글마다 다시 대조하므로 이 값이 열쇠 노릇을 한다.
    fbFill(div, j, pw);
    return true;
  } catch (err) {
    if (note) note.textContent = String(err.message);
    return false;
  }
}

function fbItem(it) {
  const div = el("div", "fb-item");
  if (!it.private) { fbFill(div, it); return div; }
  // 비공개 글 — 껍데기 + 열람 버튼. 내 브라우저가 기억하는 비번이 있으면 자동 열람
  const when = new Date(it.ts * 1000).toLocaleDateString("ko-KR",
    { month: "numeric", day: "numeric" });
  const meta = el("div", "fb-meta", T("🔒 비공개 · {nick} · {when}", { nick: T(it.nick), when })
    + (it.has_reply ? T(" · 답변 있음") : "")
    + (it.ncomment ? T(" · 댓글 {n}", { n: it.ncomment }) : ""));
  const chip = fbStatusChip(it.status);
  if (chip) meta.append(" ", chip);
  div.append(meta);
  const note = el("span", "fb-note", "");
  const btn = el("button", "btn btn-ghost", "비밀번호로 보기");
  btn.type = "button";
  btn.title = T("열면 본문·답변이 보이고 댓글도 달 수 있습니다");
  btn.onclick = async () => {
    const pw = prompt(T("이 글을 쓸 때 정한 비밀번호"));
    if (pw) await fbUnlock(div, it, pw, note);
  };
  div.append(btn, note);
  const mine = fbMine()[it.id];
  if (mine) fbUnlock(div, it, mine, null);
  return div;
}

async function fbLoad(more = false) {
  const box = $("#fb-list");
  try {
    const q = more && fbOldest ? `?before=${fbOldest}&n=${FB_PAGE}` : `?n=${FB_PAGE}`;
    const r = await fetch("/api/board" + q);
    if (!r.ok) throw new Error();
    const items = (await readJSON(r)).items || [];
    if (!more) box.textContent = "";
    if (!more && !items.length) {
      box.append(el("p", "fb-note", "아직 글이 없습니다 — 첫 제보를 남겨 주세요."));
    }
    for (const it of items) box.append(fbItem(it));
    if (items.length) fbOldest = items[items.length - 1].ts;
    // 한 페이지를 꽉 채워 왔으면 더 있을 가능성이 있다 — 버튼을 계속 보여 준다
    $("#fb-more").hidden = items.length < FB_PAGE;
  } catch {
    if (!more) {
      box.textContent = "";
      box.append(el("p", "fb-note",
        T("목록을 불러오지 못했습니다 — 서버가 꺼져 있으면 피드백도 쉽니다.")));
    }
  }
}

function wireFeedback() {
  const form = $("#fb-form");
  if (!form) return;
  $("#fb-more").onclick = () => fbLoad(true);
  $("#fb-private").onchange = () => { $("#fb-pw").hidden = !$("#fb-private").checked; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const note = $("#fb-note");
    const body = $("#fb-body").value.trim();
    if (body.length < 2) { note.textContent = T("내용을 2자 이상 적어 주세요."); return; }
    note.textContent = T("보내는 중…");
    try {
      const r = await fetch("/api/board", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick: $("#fb-nick").value,
                               body, web: $("#fb-web").value,
                               private: $("#fb-private").checked,
                               pw: $("#fb-pw").value }),
      });
      const j = await readJSON(r);
      if (!r.ok) throw new Error(j.error || T("전송 실패"));
      if ($("#fb-private").checked && j.id) {
        // 이 브라우저에서는 비번 없이 자기 글·답변을 보게 기억해 둔다
        const m = fbMine(); m[j.id] = $("#fb-pw").value; save(LS.fbMine, m);
      }
      note.textContent = T("등록됐습니다. 감사합니다!");
      $("#fb-body").value = "";
      fbLoad();
    } catch (err) {
      note.textContent = String(err.message || T("전송 실패 — 잠시 후 다시 시도해 주세요."));
    }
  };
}

/** 공지 확인 — 저장된 NOTICE_ID가 지금 것과 다르면(다시 보지 않기를 안 눌렀거나, 새 공지가
 *  나왔으면) «업데이트» 탭으로 «내역» 시트를 연다. 날짜 블록을 최신순으로 모두 보여 준다. */
function checkNotice() {
  if (load(LS.notice, null) === NOTICE_ID) return;
  openHistory("notice");
}

const HISTORY_KINDS = [["notice", T("업데이트")], ["calclog", T("계산 로직 내역")]];

/** «내역» 시트 — 업데이트 안내(NOTICES)·계산 로직 변경 내역(CALC_CHANGES)을 탭으로 가른다.
 *  본문 두 목록은 열 때 한 번만 채우고, 탭 전환은 보이기·감추기만 한다(둘 다 몇십 줄 안팎이라
 *  다시 그릴 이유가 없다). 헤더 아래 상시 배너에 있던 두 단추를 걷어내며 하나로 합쳤다
 *  (유예 기간 끝, 2026-09-03 — 유저 지시로 «내역» 하나에서 탭으로 나눠 본다). */
let historyKind = "notice";
function historyKinds() {
  const bar = $("#history-kinds");
  if (!bar) return;
  bar.textContent = "";
  for (const [key, label] of HISTORY_KINDS) {
    const b = mkBtn(label, "rec-kind" + (historyKind === key ? " on" : ""), () => { historyKind = key; historyKinds(); });
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(historyKind === key));
    bar.append(b);
  }
  $("#notice-list").hidden = historyKind !== "notice";
  $("#calclog-list").hidden = historyKind !== "calclog";
  // «다시 보지 않기»는 업데이트 안내에만 의미가 있다 — 자동으로 뜨는 건 그 목록뿐이다.
  $("#history-foot").hidden = historyKind !== "notice";
  $("#history-t").textContent = historyKind === "notice" ? T("업데이트 내역") : T("계산 로직 변경 내역");
}

function historyList(sec, box, pinned) {
  box.textContent = "";
  // 붙박이 줄 — 날짜 위, 목록 맨 앞. 날짜 블록에 넣으면 새 공지가 쌓일 때마다 밀린다.
  if (pinned && pinned.length) {
    const ul = el("ul", "steps-list notice-pin");
    for (const item of pinned) {
      const li = el("li");
      li.append(...boldParts(T(item)));
      ul.append(li);
    }
    box.append(ul);
  }
  for (const s of sec) {
    box.append(el("h4", "notice-date", s.date));
    // 빈 문자열은 그룹 구분자 — 영향도가 다른 항목 사이를 살짝 띄운다
    // (ul을 나누면 .steps-list의 기본 아래 여백이 간격이 된다)
    let ul = null;
    for (const item of s.items) {
      if (item === "") { ul = null; continue; }
      if (!ul) { ul = el("ul", "steps-list"); box.append(ul); }
      const li = el("li");
      li.append(...boldParts(T(item)));
      ul.append(li);
    }
  }
}

/** «내역»을 **지금 연다** — «다시 보지 않기»를 눌렀든 말든. 한 번 껐다고 다시 볼 길이 없으면
 *  안 된다. `kind`로 시작 탭을 고른다("notice" | "calclog", 기본 "notice"). */
function openHistory(kind) {
  historyKind = kind === "calclog" ? "calclog" : "notice";
  historyList(NOTICES, $("#notice-list"), NOTICE_PINNED);
  historyList(CALC_CHANGES, $("#calclog-list"));
  historyKinds();
  const dlg = $("#history-sheet");
  if (dlg && !dlg.open) dlg.showModal();
}

/** 새 소식 팝업. **처음 오는 사람은 조용히 최신 버전만 기록하고 넘어간다** —
 *  겪어 본 적 없는 «이전»과 비교하는 변경 목록은 그 사람에게는 의미가 없다. */
function checkWhatsNew() {
  const latest = CHANGELOG.at(-1).v;
  const seen = load(LS.whatsNew, null);
  if (seen === null) { save(LS.whatsNew, latest); return; }
  if (seen === latest) return;
  const at = CHANGELOG.findIndex((c) => c.v === seen);
  // 모르는 버전표(옛 형식·손상)면 무엇을 놓쳤는지 알 길이 없다 — 최신 것만 보여준다.
  const unseen = at === -1 ? CHANGELOG.slice(-1) : CHANGELOG.slice(at + 1);
  if (!unseen.length) { save(LS.whatsNew, latest); return; }
  const list = $("#whatsnew-list");
  list.textContent = "";
  for (const item of unseen.flatMap((c) => c.items)) list.append(el("li", null, item));
  save(LS.whatsNew, latest);
  const dlg = $("#whatsnew-sheet");
  if (dlg && !dlg.open) dlg.showModal();
}

async function boot() {
  // 사전이 먼저다 — 아래 render들이 만드는 글자가 전부 `T()`를 지난다.
  await I18N.ready;
  I18N.apply(document.body);             // index.html의 정적 글자
  I18N.mountPicker($("#lang-pick"));
  renderBackupCard();
  // 계정이 하나라도 있으면 동기화 절은 접어 둔다 — 다 끝난 절차다.
  wireFold("sync-fold", !Object.keys(load(LS.profiles, {})).length);
  wireFold("backup-fold", false);
  delete document.documentElement.dataset.i18n;   // 사전이 입혀졌다 — 본문을 연다
  const saved = load(LS.settings, {});
  // 저장된 필터가 기본값을 덮는다 — «계산 가능만»을 기본 켜짐으로 바꿨을 때
  // 이미 false로 저장해 둔 사람은 계속 꺼진 채로 보였다. 판번호로 1회만 바로잡는다.
  const FILTER_V = 4;
  const savedFilter = saved._filter || {};
  if (saved._filterV !== FILTER_V) {
    // v2까지는 단일 선택("all" 또는 값 하나)이었다. 배열 모델로 옮기고
    // «계산 가능만»은 기본값(켜짐)을 다시 쓰게 한다.
    delete savedFilter.parsed;
    for (const k of ["burst", "cls", "element", "weapon"]) {
      const v = savedFilter[k];
      savedFilter[k] = Array.isArray(v) ? v : (v && v !== "all" ? [v] : []);
    }
    // v3까지 있던 정렬(등급·한계돌파·호감도)을 골라 뒀다면 갈 곳이 없다 — 기본으로 되돌린다
    if (savedFilter.sort && !SORTS.some(([k]) => k === savedFilter.sort)) {
      delete savedFilter.sort;
    }
    // v3까지 숫자 정렬은 비교기 자체가 내림차순이라 `asc`의 뜻이 반대였다.
    // 저장된 방향을 그대로 쓰면 ▼인데 작은 값이 위로 온다 — 기본으로 되돌린다.
    delete savedFilter.asc;
    saved._filterV = FILTER_V;
  }
  state.settings._filterV = FILTER_V;
  Object.assign(state.filter, savedFilter);
  state.filter.q = "";                       // 검색어는 세션마다 비운다
  // 전투력 계산기 필터는 별도 판번호 없이 그대로 복원한다 — v4 이전 이관 대상이던
  // 옛 필드(단일 선택 등)가 애초에 존재한 적이 없어 마이그레이션이 필요 없다.
  Object.assign(state.coopFilter, saved._coopFilter || {});
  state.coopFilter.q = "";
  // 고르기 시트 필터도 판번호 없이 그대로 복원한다 — 검색어만 세션마다 비운다.
  Object.assign(state.pickFilter, saved._pickFilter || {});
  state.pickFilter.q = "";
  state.favs = saved._favs || [];
  delete saved._filter; delete saved._coopFilter; delete saved._pickFilter; delete saved._favs;
  // 유니온 상자는 settings에 섞지 않는다 — 꺼내서 자기 자리에 둔다. 뮤지엄도 같다.
  state.union = saved._union || null;
  delete saved._union;
  state.museum = saved._museum || null;
  delete saved._museum;
  Object.assign(state.settings, saved);
  // 연출 스위치는 화면이 그려지기 전에 새겨야 한다 — 나중에 켜면 첫 화면만 한 번
  // 튀고 꺼진다(끈 사람에게는 그 한 번이 제일 거슬린다).
  applyFx();
  applyDororongTheme();
  state.decks = load(LS.decks, []);
  // 큐브칸은 나중에 생긴 필드다 — 예전에 저장된 덱에는 없으므로 여기서 채운다.
  // 길이가 어긋난 채로 두면 `place()`의 자리 교환이 조용히 어긋난다.
  for (const d of state.decks) {
    if (!d) continue;
    d.cubes = Array.from({ length: SLOTS }, (_, i) => d.cubes?.[i] ?? null);
  }
  results = load(LS.results, {});
  state.profiles = load(LS.profiles, {});
  // `syncing`은 **조회하는 동안만** 참인 임시 깃발인데 저장까지 따라 들어간다.
  // 조회 중에 새로고침하거나 탭을 닫으면 참인 채로 남아, 그 계정이 영영
  // 「받는 중…」으로 보이고 다시 누를 수도 없다(그 자리에서 return한다).
  // 불러올 때 무조건 내린다 — 페이지가 새로 뜬 시점에 진행 중인 조회는 없다.
  for (const rec of Object.values(state.profiles)) delete rec.syncing;
  // 예전 형식(«블라 41757 (한국)») 이름에서 openid 꼬리를 떼어 준다 — 그 숫자가
  // 스크린샷으로 새어 나가던 자리다. 이름은 표시용이라 지워도 잃는 정보가 없다.
  //
  // **사람이 직접 지은 이름은 건드리지 않는다**(`renamed`). 그 표식이 없던 시절에
  // 저장된 것은 구분할 방법이 없는데, 이 꼴(«블라»+숫자+괄호)로 직접 지었다면
  // 그건 자기 openid 꼬리를 손으로 적은 것이라 어차피 지우는 편이 맞다.
  for (const rec of Object.values(state.profiles)) {
    if (rec?.renamed || typeof rec?.name !== "string") continue;
    const cleaned = rec.name.replace(/^블라\s+\d{4,8}\s*\(/, "블라 (");
    if (cleaned !== rec.name) rec.name = cleaned;
  }
  state.records = load(LS.records, []);
  state.presets = load(LS.presets, []);
  // 저장분이 게이지 열쇠를 들고 있었나 — 아래 마이그레이션이 이걸 봐야 «안 건드린 사람»과
  // «끄고 쓰던 사람»을 새 기본값(켬)에서 지켜 낼 수 있다. 펼치고 나면 구분이 사라진다.
  const savedHadGauge = !!(saved._battle && "burst_gauge_mode" in saved._battle);
  state.battle = { ...BATTLE_DEFAULT, ...(saved._battle || {}) };
  state.battle.optimal_range_weapons = Array.isArray(state.battle.optimal_range_weapons)
    ? battleNow().optimal_range_weapons : [];
  // 계수 옵션이 생기기 전 저장분은 weapon_coeff가 없다 — 기본값으로 채운다
  // 모드 복원은 여기서 **판정하지 않는다** — `HEALTH`가 비동기로 오므로 이 시점에는
  // 유니온이 켜졌는지 알 수 없다(성급히 판정하면 새로고침마다 솔로로 떨어진다).
  // 판정은 health를 받은 뒤 `applyHealth()`가 한다.
  state.battle.weapon_coeff = {
    ...BATTLE_DEFAULT.weapon_coeff,
    ...(state.battle.weapon_coeff && typeof state.battle.weapon_coeff === "object"
        ? battleNow().weapon_coeff : {}),
  };
  delete saved._battle;
  // 나중에 생긴 전투 필드 채우기. **`state.battle`을 새로 만든 뒤라야 한다** — 앞에서
  // 채우면 바로 아래 `{ ...BATTLE_DEFAULT, ...saved._battle }`가 옛 저장분으로 덮어써서
  // 채운 것이 사라진다(실제로 `burst_regen_time`이 그랬다).
  //
  // 버스트 게이지 실누적이 기본이 됐다(2026-09-02). **옛 저장분은 그대로 둔다** — 그때
   // 기본은 «끔»이었으니, 키가 없는 상자는 «끔»으로 못 박아야 값이 안 바뀐다. 한 번만 돈다.
  if (state.settings._gaugeV !== 1) {
    // **이미 쓰던 사람인가.** 저장분이 하나라도 있으면 그렇다 — 처음 온 사람만 새 기본값을 받는다.
    let returning = false;
    try {
      returning = [LS.decks, LS.settings, LS.presets, LS.records].some((k) => localStorage.getItem(k) !== null);
    } catch { returning = false; }
    if (returning) {
      // 열쇠가 **없을 때만** 끔으로 못 박는다 — 켜 두고 쓰던 사람의 선택을 뺏으면 안 된다.
      const pin = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { for (const x of o) pin(x); return; }
        if (("first_burst_time" in o || "burst_regen_time" in o) && !("burst_gauge_mode" in o)) {
          o.burst_gauge_mode = "fixed";
        }
        for (const v of Object.values(o)) pin(v);
      };
      pin(state.decks); pin(state.union); pin(state.museum); pin(state.presets);
      // `state.battle`은 이미 기본값과 펼쳐진 뒤라 열쇠가 «있다»— 저장분에 있었는지로 판단한다.
      if (!savedHadGauge) state.battle.burst_gauge_mode = "fixed";
      // 사이클 상자를 **아직 만든 적 없는 덱**도 있다(버스트 사이클 시트를 한 번도 안 연 사람).
      // 지금 만들어 두지 않으면 나중에 `cycleOf`가 새 기본값(켬)으로 채운다 — 안 건드렸는데
      // 사이클이 바뀌는 것이 바로 막으려는 일이다.
      const pinDecks = (list) => {
        for (const d of list || []) {
          if (!d) continue;
          const had = d.cycle && "burst_gauge_mode" in d.cycle;
          d.cycle ||= {};
          if (!had) d.cycle.burst_gauge_mode = "fixed";
          for (const k of CYCLE_KEYS) if (!(k in d.cycle)) d.cycle[k] = BATTLE_DEFAULT[k];
        }
      };
      pinDecks(state.decks);
      for (const box of Object.values(state.museum?.decks || {})) pinDecks(box);
    }
    state.settings._gaugeV = 1;
  }
  // 보스 구간: 옛 저장분에는 없다. 없으면 빈 목록이 기본이다.
  state.battle.phases ||= [];
  for (const d of state.union?.decks || []) if (d?.battle) d.battle.phases ||= [];
  // 파츠는 「보스 구간」 한 곳에서만 정한다(2026-08-28). 체크·주기로 저장돼 있던 것을
  // 같은 뜻의 구간으로 옮긴다 — 안 옮기면 그 사람들 파츠가 조용히 사라진다.
  partsToPhases(state.battle, state.settings.duration ?? 180);
  for (const d of state.union?.decks || []) partsToPhases(d?.battle, state.union?.duration ?? 180);
  // 폐기된 컨트롤 `gauge_latch`를 한 번 털어낸다(2026-08-30). 화면에서 칸은 없앴지만
  // **예전에 켜 둔 사람의 저장값은 그대로 실려 간다** — 코어가 버리므로 결과는 같지만,
  // 지문에 남아 «안 건드렸는데 다시 계산»이 나고 컨트롤 상자가 괜히 안 비어 있게 된다.
  //
  // **빈 상자는 지운다.** 컨트롤이 하나라도 있으면 카메라 유도(컨트롤 켠 1명이 차지
  // 무기면 그 사람)에 걸린다 — 래치만 켜 뒀던 니케는 상자를 비워야 원래대로 돌아간다.
  {
    let n = 0;
    const wash = (d) => {
      const c = d?.control;
      if (!c) return;
      for (const nm of Object.keys(c)) {
        if (!c[nm] || c[nm].gauge_latch === undefined) continue;
        delete c[nm].gauge_latch;
        n++;
        if (!Object.keys(c[nm]).length) delete c[nm];
      }
    };
    for (const d of state.decks || []) wash(d);
    for (const d of state.union?.decks || []) wash(d);
    for (const box of Object.values(M()?.decks || {})) for (const d of box || []) wash(d);
    for (const pr of state.presets || []) (pr?.decks || [pr]).forEach(wash);
    if (n) saveAll();
  }

  // 버스트 주기 이름이 숫자 목록에서 **회차 그림**으로 바뀌었다(2026-08-30).
  // 「마크마 크크마…」는 몇 번째 풀버스트에 누가 쓰는지를 그대로 읽는다(마=본인,
  // 크=같은 단계의 다른 니케). 이름이 곧 저장값이고 **코어가 이름으로 되찾으므로**,
  // 옛 이름을 든 저장분은 옮기지 않으면 «등록되지 않은 이름»으로 계산이 죽는다.
  {
    const PAT_RENAME = {
      "1,3,5,9,11,14": "마크마 크마크 크크마 크마크 크마",
      "1,3,6,9,12,14": "마크마 크크마 크크마 크크마 크마",
    };
    let n = 0;
    const rename = (d) => {
      const c = d?.control;
      if (!c) return;
      for (const nm of Object.keys(c)) {
        const to = PAT_RENAME[c[nm]?.burst_pattern];
        if (to) { c[nm].burst_pattern = to; n++; }
      }
    };
    for (const d of state.decks || []) rename(d);
    for (const d of state.union?.decks || []) rename(d);
    for (const box of Object.values(M()?.decks || {})) for (const d of box || []) rename(d);
    for (const pr of state.presets || []) (pr?.decks || [pr]).forEach(rename);
    if (n) { results = {}; saveAll(); }
  }
  // 사이클이 **덱 것**이 되기 전에는 `state.battle` 한 벌을 5덱이 같이 썼다. 지금 값을
  // 다섯 덱에 그대로 심어 아무도 값을 잃지 않게 한다(2026-08-28).
  for (let i = 0; i < DECK_COUNT; i++) {
    const d = deckOf(i);
    if (d.cycle) continue;
    d.cycle = {};
    for (const k of CYCLE_KEYS) {
      d.cycle[k] = state.battle[k] ?? BATTLE_DEFAULT[k];
    }
  }
  // 「버스트 손속도」 기본값 이관. 판번호를 쓰는 이유는 **새로 고른 사람을 다음
  // 새로고침에 또 밀어내지 않기** 위해서다.
  //   v1(2026-08-28) 0.1 → 0.25   v2(2026-08-29) 0.25 → 0.1
  // 옛 기본값과 **똑같은 값만** 옮긴다. 일부러 그 값을 고른 사람도 같이 옮겨지지만,
  // 안 옮기면 손댄 적 없는 사람이 «기본값이 아닌 값»을 든 채로 남아 패널에 «*»가
  // 붙는다(그 편이 더 나쁘다). 바뀐 것은 공지에 적는다.
  //
  // **사이클 상자까지 돈다.** v1은 `state.battle`과 유니온 줄만 돌아서, 솔로의
  // `d.cycle`은 이관 전 값(0.1)을 그대로 든 채 남아 있었다 — 위 씨앗 넣기가 이관보다
  // 먼저 돌기 때문이다. 여기서 셋을 다 돈다.
  const SWITCH_V = 2;
  const swBoxes = [state.battle,
                   ...Array.from({ length: DECK_COUNT }, (_, i) => deckOf(i).cycle),
                   ...(state.union?.decks || []).map((d) => d?.battle)];
  for (const b of swBoxes) {
    if (!b || b._swV === SWITCH_V) continue;
    if (b.burst_switch_delay === 0.25) b.burst_switch_delay = BATTLE_DEFAULT.burst_switch_delay;
    b._swV = SWITCH_V;
  }
  // 재충전 시간: 하루 동안 «비움 = 코어 기본»으로 뒀던 탓에 `null`이 저장된 것이 있다.
  // 칸이 빈 채로 보이지 않게 기본값으로 채운다.
  if (state.battle.burst_regen_time == null) state.battle.burst_regen_time = BATTLE_DEFAULT.burst_regen_time;
  for (const d of state.union?.decks || []) {
    if (d?.battle && d.battle.burst_regen_time == null) {
      d.battle.burst_regen_time = BATTLE_DEFAULT.burst_regen_time;
    }
  }
  for (let i = 0; i < DECK_COUNT; i++) {
    const d = deckOf(i);
    d.calcState = null; d.error = null;
    d.names = (d.names || []).slice(0, SLOTS);
    while (d.names.length < SLOTS) d.names.push(null);
  }
  // 옛 «선버스트» 플래그 → 자리 순서. 한 번만 하면 되지만 매번 돌려도 값이 같다
  // (플래그가 없으면 아무것도 안 한다). 프리셋·공유 링크는 컨트롤을 담지 않아
  // 이 두 곳이면 남는 데가 없다.
  // 뮤지엄 덱(보스마다 5덱)도 같은 손질을 받는다 — 모양은 museumDecks()가 맞춘다.
  const museumAll = Object.keys(state.museum?.decks || {}).flatMap((b) => state.museum.decks[b] || []);
  for (const d of museumAll) { if (d) { d.calcState = null; d.error = null; } }
  let moved = false;
  for (const d of [...state.decks, ...(state.union?.decks || []), ...museumAll]) {
    if (d && burstFirstToOrder(d)) moved = true;
  }
  if (moved) saveAll();
  state.settings.deck = Math.min(DECK_COUNT - 1, Math.max(0, state.settings.deck || 0));

  const [roster, maps, health, museum] = await Promise.all([
    fetch("roster.json").then((r) => r.json()),
    fetch("profile_maps.json").then((r) => r.json()).catch(() => null),
    fetch("/api/health").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // 뮤지엄 표 — 없어도 앱은 뜬다(뮤지엄 화면이 «데이터 없음»을 말한다)
    fetch("museum.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  MUSEUM = museum && museum.stages ? museum : null;
  ROSTER = roster.chars;
  for (const r of ROSTER) byName.set(r.name, r);
  // 게임 내부 번호 → 니케. 바깥 사이트 편성 코드가 이 번호로 온다(미미르).
  byCode.clear();
  for (const r of ROSTER) if (r.code) byCode.set(r.code, r.name);
  repairEquipTiers();
  TOP_ATK_CASTERS = new Set(roster.top_atk_casters || []);
  TOP_ATK_BUFFS = roster.top_atk_buffs || {};
  SELF_BURST_ATK = roster.self_burst_atk || {};
  DEALER_ATK_FLAT = roster.dealer_atk_flat || {};
  SELF_FB_ATK = roster.self_fb_atk || {};
  LOW_ATK_CASTERS = new Set(roster.low_atk_casters || []);
  LOW_ATK_BUFFS = roster.low_atk_buffs || {};
  ADJ_CASTERS = new Set(roster.adjacent_casters || []);
  ADJ_BUFFS = roster.adjacent_buffs || {};
  CDR_CASTERS = new Set(roster.cdr_casters || []);
  // 별명 사전 — `web/alias.json`(손 등록)과 이름에서 뽑은 것이 합쳐져 구워져 온다.
  ALIAS_BAKED = roster.alias || {};
  // «X 해제» 이름 → 그 «X». 타임라인 뷰어가 «본체(번역) + 해제»로 조립한다.
  REMOVE_OF = roster.remove_of || {};
  dropSearchKeys();
  // 관리 화면에서 넣은 별명은 뒤늦게 얹어도 된다 — 첫 화면을 붙잡아 두지 않는다.
  loadServerAlias();
  MAPS = maps;
  if (health) HEALTH = health;

  // 이제야 유니온 가용 여부를 안다. 꺼져 있으면(상용) 저장된 모드가 union이어도
  // 솔로로 내린다 — 만드는 중인 화면이 상용에서 열리면 안 된다.
  if (state.settings.mode === "union" && !unionOn()) state.settings.mode = "solo";
  // 뮤지엄에서 닫았으면 뮤지엄으로 연다 — 솔로 상자가 다 실린 **뒤**에 갈아 끼운다.
  if (state.settings.mode === "museum") museumEnter();
  renderMode();
  buildBattle();

  $("#sync-url").hidden = !HEALTH.fetch;
  renderEngine();

  // 북마클릿 — 소스를 그대로 읽어 javascript: URL로 만든다.
  // 끌어 놓기가 막히는 환경이 흔해서 복사 경로를 둘 더 준다.
  fetch("bookmarklet.js").then((r) => r.text()).then((src) => {
    const href = "javascript:" + encodeURIComponent(src);
    $("#bm-link").href = href;
    $("#bm-copy").onclick = () => copyText(href,
      T("북마클릿 주소를 복사했습니다 — 북마크를 만들어 URL 칸에 붙여넣으세요."));
    $("#bm-copy-raw").onclick = () => copyText(src,
      T("콘솔용 코드를 복사했습니다 — blablalink.com 탭에서 F12 → Console에 붙이고 Enter."));
  }).catch(() => { $("#bm-link").removeAttribute("href"); });

  buildFilters();
  buildBattle();
  bindChrome();
  renderProfilePick();
  wireVariant();
  renderProfiles();
  renderRecords();
  renderPresets();
  // 배치모드를 켜 둔 채로 새로고침했으면 그대로 열린다 — ROSTER가 막 채워진
  // 뒤(위)라 여기서 해야 renderAll()의 로스터 격자가 온전히 그려진다.
  fastMode = !!state.settings.fastMode;
  applyFastModeDom(fastMode);
  renderAll();
  // 아레나로 바로 들어왔으면(`/arena` 새로고침·직접 링크) 여기서 한 번 그린다 —
  // 주소를 읽는 `applyRoute`는 이 위에서 돌고, 그때는 ROSTER가 아직 비어 있어
  // 카드가 «그림도 배지도 없는 빈 상자»로 나온다(실측).
  if (modeNow() === "arena") window.Arena?.ensure();

  // 공유 저장소가 없는 서버에서는 만들 수 없다 — 버튼을 감춘다
  $("#res-share").hidden = !HEALTH.share;

  // `/s?c=<코드>`로 들어왔나. **경로가 아니라 질의문이다** — `index.html`의 자산 링크가
  // 전부 상대경로라서 `/s/<코드>`로 서빙하면 `/s/app.js`를 찾아 전부 404가 된다.
  shotWire();
  const phAll = $("#bt-phase-all");
  if (phAll) {
    // 파츠 구간을 **하나로 갈아 끼운다** — 여러 개가 있는 채로 «내내»를 더하면
    // 무엇이 실제로 도는지 알 수 없다. 「전투 내내」는 그 한 줄이 전부라는 뜻이다.
    phAll.onclick = () => {
      const b = battleNow();
      b.phases = [...(b.phases || []).filter((p) => p.kind !== "parts"),
                  { kind: "parts", t0: 0, t1: durationNow() }];
      saveAll(); buildPhases(); renderResults();
    };
  }
  // «전투 내내 코어» — 파츠와 같은 규칙으로 코어 구간을 하나로 갈아 끼운다. 코어 «크기»는
  // 위 칸(core_px)이 드는 값이라, 0이면 창을 열어도 코어가 없다 — 그때는 그 말을 해 준다.
  const coreAll = $("#bt-core-all");
  if (coreAll) {
    coreAll.onclick = () => {
      const b = battleNow();
      b.phases = [...(b.phases || []).filter((p) => p.kind !== "core"),
                  { kind: "core", t0: 0, t1: durationNow() }];
      saveAll(); buildPhases(); renderResults();
      if (!b.core_px) flashStatus(T("코어 크기가 0입니다 — 위 «코어 크기»를 정해야 코어가 생깁니다."));
    };
  }
  const phAdd = $("#bt-phase-add");
  if (phAdd) {
    phAdd.onclick = () => {
      const b = battleNow();
      b.phases ||= [];
      if (b.phases.length >= PHASE_MAX) return;
      // 마지막 구간 뒤에 붙인다 — 새 줄이 목록 한가운데 끼어들면 어디가 새 것인지 모른다.
      const t0 = b.phases.length ? Math.max(...b.phases.map((p) => p.t1)) : 0;
      // 기본은 **속성저지**다 — 족자패턴은 보통 한 번인데 속성저지는 두세 번 나온다
      // (유저). 자주 넣는 쪽을 기본으로 두면 종류를 다시 고르는 손이 줄어든다.
      b.phases.push({ kind: "element_gate", t0, t1: t0 + 10 });
      saveAll(); buildPhases(); renderResults();
    };
  }
  wireBossShare();
  wireBossShare({ ex: "boss-all-export", im: "boss-all-import",
                  inp: "boss-all-code", note: "#boss-all-note" });
  // ── 회차 보스 기본값 (왼쪽 TARGETS 위 톱니) ───────────────────────────
  // 시트 한 벌을 유니온(회차 다섯)·뮤지엄(시즌 셋)이 나눠 쓴다 — 담는 것과 앉히는 것만 모드가 가른다.
  wireBossShare({
    ex: "boss-cfg-make", im: "boss-cfg-load", inp: "boss-cfg-in", note: "#boss-cfg-msg",
    payload: () => (modeNow() === "museum" ? museumSeasonPayload() : seasonBossPayload()),
    apply: (j) => {
      if (modeNow() === "museum") {
        const r = applyMuseumBosses(j);
        if (r.err) return r;
        renderMuseumCfgList();
        return { note: T("{v} 보스 {n}개를 받았습니다.", { v: r.season, n: r.n }) };
      }
      const r = applySeasonBosses(j);
      if (r.err) return r;
      renderBossCfgList();
      return { note: T("{v} 보스 {n}개를 받았습니다.", { v: r.season, n: r.n }) };
    },
  });
  const cfgBtn = $("#boss-cfg-share");
  const mCfgBtn = $("#museum-cfg-share");
  if (mCfgBtn) mCfgBtn.onclick = openSeasonCfgSheet;
  if (cfgBtn) {
    cfgBtn.onclick = openSeasonCfgSheet;
    $("#boss-cfg-x").onclick = () => $("#boss-cfg-sheet")?.close();
    const pour = $("#boss-cfg-apply");
    if (pour) pour.onclick = () => {
      if (modeNow() === "museum") {
        const n = pourMuseumBoss();
        bossNote(n ? T("배치한 보스에 적용했습니다.") : T("적용할 보스 기본값이 없습니다."), n ? "ok" : "err", "#boss-cfg-msg");
        return;
      }
      const n = pourSeasonBosses();
      bossNote(n ? T("세 줄 중 {n}줄에 적용했습니다.", { n })
                 : T("적용할 보스 기본값이 없습니다."), n ? "ok" : "err", "#boss-cfg-msg");
    };
  }
  const bossRecBtn = $("#boss-rec");
  if (bossRecBtn) bossRecBtn.onclick = () => openBossRec(bossRecBtn);
  const shareAll = $("#boss-share-all");
  if (shareAll) {
    shareAll.onclick = () => {
      bossNote("", "", "#boss-all-note");
      $("#boss-all-code").value = "";
      $("#boss-sheet").showModal();
    };
    $("#boss-sheet-x").onclick = () => $("#boss-sheet").close();
  }
  const code = new URLSearchParams(location.search).get("c");
  // `/b?c=`는 **보스 설정**이다(편성 공유 `/s?c=`와 질의문 이름이 같아 경로로 가른다).
  // 보여 줄 화면이 따로 없으므로 평소 화면을 그대로 열고, 설정만 앉힌다.
  if (code && location.pathname.replace(/\/+$/, "") === "/b") {
    applyRoute();
    loadBossLink(code);
  } else if (code && location.pathname.replace(/\/+$/, "") === "/m") {
    // `/m?c=`는 **미미르 편성 코드**다. 우리 서버를 거치지 않고 코드 안에 편성이
    // 통째로 들었으므로 받아 풀기만 하면 된다.
    loadMimir(code);
  } else if (code) {
    // 공유 링크로 들어왔으면 그 화면이 먼저다 — 주소의 화면 이름보다 링크가 세다.
    // 여기서는 주소를 손대지 않는다(`clearShareUrl`이 코드만 뗀다).
    loadShared(code);
  } else {
    // **첫 화면의 주소는 손대지 않는다.** 저장해 둔 배치모드·덱 번호를 여기서 주소에
    // 적으면 `/`로 들어온 사람이 아무것도 안 했는데 `/deck/5`를 보게 된다 — 그 화면은
    // localStorage가 이미 복원하므로 주소가 말할 필요가 없다. 주소는 **사람이 화면을
    // 옮겼을 때부터** 따라간다.
    applyRoute();
  }
  for (const sel of ["#q", "#pick-q", "#deck-pick-q"]) wireSearchHint(sel);
  homeCycleBlock();    // 사이클 블록의 제자리는 시트다 — 마크업상 패널 안에 있다
  const cyTrig = $("#cy-toggle");
  if (cyTrig) cyTrig.onclick = () => openCycleSheet();
  const cyX = $("#cycle-x");
  if (cyX) cyX.onclick = () => $("#cycle-sheet")?.close();
  const btClose = $("#bt-close");
  if (btClose) btClose.onclick = () => $("#bt-toggle")?.click();

  wireSheetBack();     // **`wireRoute`보다 먼저** — 시트 닫기가 화면 전환보다 앞선다
  wireRoute();
  wireFeedback();
  renderMode();
  checkNotice();
  checkWhatsNew();
}

/** 덱 두 개의 편성을 «딜 순으로 세워 위아래로» 맞대어 놓는다.
 *
 *  1등끼리, 2등끼리 나란히 붙여 놓으면 «누가 누구 자리를 대신했는가»가 한눈에 읽힌다.
 *  같은 사람이면 위아래가 같은 얼굴이고, 바뀐 자리만 색으로 드러난다.
 *  캡처에서 만든 기록처럼 니케별 딜이 없으면 편성 순서를 그대로 쓴다.
 */
function cmpFaces(da, db) {
  const dmg = (d, n) => Number((d.chars || {})[n]) || 0;
  const rank = (d) => deckNames(d).slice().sort((p, q) => dmg(d, q) - dmg(d, p));
  /** 딜을 모르는 쪽은 **상대 순서를 따라간다.**
   *  둘 다 딜 순으로 세우는 게 원칙이지만, 한쪽이 캡처 기록이면 그쪽엔 세울 기준이
   *  없다. 그때 각자 편성 순서대로 두면 같은 다섯 명인데도 위아래가 어긋나
   *  «누가 누구 자리인지»가 안 보인다. 같은 사람을 세로로 맞추는 게 낫다. */
  const follow = (d, order) => {
    const mine = deckNames(d);
    const set = new Set(mine);
    const head = order.filter((n) => set.has(n));
    return [...head, ...mine.filter((n) => !head.includes(n))];
  };
  let A, B;
  if (hasChars(da)) {
    A = rank(da);
    B = hasChars(db) ? rank(db) : follow(db, A);
  } else if (hasChars(db)) {
    B = rank(db);
    A = follow(da, B);
  } else {
    A = deckNames(da).slice();
    B = follow(db, A);
  }
  const sa = new Set(A), sb = new Set(B);
  const n = Math.max(A.length, B.length);

  const grid = el("div", "cmp-rank");
  grid.style.gridTemplateColumns = `auto repeat(${n}, minmax(0, 1fr))`;
  const line = (list, other, key, cls, ranked) => {
    grid.append(el("span", "cmp-rank-k", key));
    for (let i = 0; i < n; i++) {
      const nm = list[i];
      const cell = el("div", "cmp-rcell");
      if (!nm) { grid.append(cell); continue; }
      const kept = other.has(nm);
      const f = el("div", "cmp-face " + (kept ? "" : cls));
      // 딜을 모르는 쪽에 «위»를 붙이면 없는 순위를 지어내는 것이다
      f.title = `${ranked ? T("{v}위", { v: i + 1 }) : T("{v}번째", { v: i + 1 })} · ${nm}`
        + (kept ? "" : cls === "out" ? T(" (빠짐)") : T(" (새로)"));
      const rec = byName.get(nm);
      if (rec?.img) {
        const im = el("img");
        im.src = artSrc(rec, nm);
        im.alt = nm;
        im.loading = "lazy";
        im.decoding = "async";
        im.draggable = false;
        f.append(im);
      } else {
        f.append(el("span", "cmp-face-none", nm.slice(0, 1)));
      }
      cell.append(f);
      grid.append(cell);
    }
  };
  line(A, sb, T("기준"), "out", hasChars(da));
  line(B, sa, T("비교"), "in", hasChars(db));
  return grid;
}

/** 짝 없는 덱 — 딜 순으로 한 줄. 비교 화면의 다른 줄과 같은 크기로 맞춘다. */
function cmpLoneFaces(d) {
  const dmg = (n) => Number((d.chars || {})[n]) || 0;
  const names = deckNames(d).slice().sort((p, q) => dmg(q) - dmg(p));
  const grid = el("div", "cmp-rank");
  grid.style.gridTemplateColumns = `auto repeat(${names.length}, minmax(0, 1fr))`;
  grid.append(el("span", "cmp-rank-k", "편성"));
  for (const nm of names) {
    const cell = el("div", "cmp-rcell");
    const f = el("div", "cmp-face");
    f.title = nm;
    const rec = byName.get(nm);
    if (rec?.img) {
      const im = el("img");
      im.src = artSrc(rec, nm);
      im.alt = nm;
      im.loading = "lazy";
      im.decoding = "async";
      im.draggable = false;
      f.append(im);
    } else {
      f.append(el("span", "cmp-face-none", nm.slice(0, 1)));
    }
    cell.append(f);
    grid.append(cell);
  }
  return grid;
}

// «지금 몇 명»을 세는 통로 — 페이지가 열려 있는 동안만 붙어 있는다.
// **아무것도 보내지 않는다.** 서버가 15초마다 주석 한 줄을 흘려보낼 뿐이고, 세는
// 것은 열려 있는 연결 수다(서버 metrics.ts).
//
// **탭이 몇 개든 브라우저 하나는 하나로 센다.** 탭마다 통로를 열면 «세 탭 띄운 한
// 사람»이 3이 된다. 그래서 탭끼리 자리를 양보한다 — localStorage에 «지금 내가 맡고
// 있다, 시각»을 12초짜리 임대처럼 적어 두고, 살아 있는 임대가 있으면 다른 탭은 안
// 연다. 맡은 탭이 닫히면 임대가 낡아 다음 탭이 이어받는다.
//
// **이 쪽지는 서버로 안 간다.** 서버가 아는 것은 여전히 연결 수뿐이라 사람을 이어
// 붙일 값이 없다. 보내는 순간 그건 쿠키와 같은 것이 되므로 보내지 않는다.
try {
  if (typeof EventSource === "function") {
    const LEASE = "nikke.live.lease";
    const LEASE_MS = 12000;
    const me = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let live = null;
    let liveId = "";
    // 떠날 때 «나 갔다»를 한 통 부친다. 스트림을 닫는 것만으로는 앞단 프록시 때문에 서버가 늦게
    // 알아채 «접속 중» 숫자가 잠깐 부풀었다(실측 2026-09-02: 새로고침 여섯 번에 +3). 답은 안 받는다.
    const sayBye = () => {
      if (!liveId) return;
      try {
        navigator.sendBeacon?.("/api/live/bye",
          new Blob([JSON.stringify({ id: liveId })], { type: "application/json" }));
      } catch { /* 못 부쳐도 시간이 지나면 사라진다 */ }
      liveId = "";
    };
    const readLease = () => {
      try { return JSON.parse(localStorage.getItem(LEASE) || "null"); } catch { return null; }
    };
    const holdLease = () => {
      try { localStorage.setItem(LEASE, JSON.stringify({ id: me, ts: Date.now() })); } catch { /* 사생활 보호 모드 */ }
    };
    const mine = () => {
      const v = readLease();
      return !v || v.id === me || (Date.now() - (v.ts || 0)) > LEASE_MS;
    };
    const tick = () => {
      // **뺏지 않는다.** 맡은 탭이 살아 있는 동안은 그대로 두고, 그 탭이 닫혀 임대가
      // 낡았을 때만 이어받는다 — 탭을 옮길 때마다 뺏으면 연결이 끊겼다 붙어 숫자가 튄다.
      if (!mine()) {
        if (live) { sayBye(); live.close(); live = null; }
        return;
      }
      holdLease();
      if (!live) {
        // 번호를 **먼저** 정해 들고 간다 — 서버가 알려 줄 때까지 기다리면 그 사이에 새로 고쳤을 때
        // 제 번호를 몰라 «떠난다»를 못 보낸다(실측 2026-09-02: 여섯 번 중 세 번만 갔다).
        liveId = crypto.randomUUID ? crypto.randomUUID() : "";
        live = new EventSource("/api/live" + (liveId ? `?id=${encodeURIComponent(liveId)}` : ""));
        live.onerror = () => { /* EventSource가 알아서 다시 붙는다 */ };
        // 번호를 못 만드는 환경이면 서버가 첫 쪽지로 알려 준 것을 받는다.
        live.addEventListener("id", (e) => { if (!liveId) liveId = String(e.data || ""); });
      }
    };
    tick();
    setInterval(tick, 5000);
    addEventListener("pagehide", () => {
      sayBye();
      if (live) { live.close(); live = null; }
      // 내가 맡고 있었으면 쪽지를 지운다 — 다음 탭이 12초 안 기다리고 바로 이어받는다.
      try { if (readLease()?.id === me) localStorage.removeItem(LEASE); } catch { /* 무시 */ }
    });
  }
} catch { /* 지원 안 하면 그만이다 */ }

boot();
