import { useEffect, useMemo, useState } from 'react';

const manufacturers = ['엘리시온', '미실리스', '테트라', '필그림', '어브노멀'];
const classes = ['화력형', '방어형', '지원형'];
const bursts = ['버스트 I', '버스트 II', '버스트 III'];
const codes = ['작열', '수냉', '전격', '철갑', '풍압'];
const weapons = ['AR', 'SMG', 'MG', 'SG', 'SR', 'RL'];
const rarities = ['SSR', 'SR', 'R'];
const squadCategoryDefs = [
  { key: 'soloRaid', label: '솔로 레이드', squadCount: 5 },
  { key: 'unionRaid', label: '유니온 레이드', squadCount: 3 },
  { key: 'arena', label: '아레나', squadCount: 3 },
];

const initialNikkes = [
  {
    id: 1,
    name: '리타',
    rarity: 'SSR',
    manufacturer: '미실리스',
    classType: '지원형',
    burst: '버스트 I',
    code: '철갑',
    weapon: 'SMG',
    squadRole: '쿨타임 감소와 엄폐물 회복으로 장기전 안정성을 높입니다.',
    skill1: '아군 전체 장탄 수와 공격 관련 효율을 보조합니다.',
    skill2: '엄폐물 체력을 회복해 전투 지속력을 높입니다.',
    burstSkill: '버스트 쿨타임 감소와 공격력 상승으로 풀 버스트 회전을 앞당깁니다.',
    imageUrl: 'https://placehold.co/360x240?text=Liter',
  },
  {
    id: 2,
    name: '센티',
    rarity: 'SSR',
    manufacturer: '미실리스',
    classType: '방어형',
    burst: '버스트 II',
    code: '철갑',
    weapon: 'RL',
    squadRole: '보호막과 버스트 게이지 수급으로 스쿼드 템포를 보조합니다.',
    skill1: '로켓 런처 공격으로 버스트 게이지 수급을 도와줍니다.',
    skill2: '아군에게 보호막을 제공해 피해를 완화합니다.',
    burstSkill: '방어 보조 효과로 전열 안정성을 올립니다.',
    imageUrl: 'https://placehold.co/360x240?text=Centi',
  },
  {
    id: 3,
    name: '모더니아',
    rarity: 'SSR',
    manufacturer: '필그림',
    classType: '화력형',
    burst: '버스트 III',
    code: '작열',
    weapon: 'MG',
    squadRole: '광역 지속 화력으로 일반 전투와 보스전 모두에 기여합니다.',
    skill1: '명중과 공격 성능을 끌어올려 지속 딜링을 강화합니다.',
    skill2: '다수의 적을 상대할 때 누적 화력을 높입니다.',
    burstSkill: '넓은 범위를 지속 공격해 다수 전투에서 강력합니다.',
    imageUrl: 'https://placehold.co/360x240?text=Modernia',
  },
  {
    id: 4,
    name: '홍련',
    rarity: 'SSR',
    manufacturer: '필그림',
    classType: '화력형',
    burst: '버스트 III',
    code: '전격',
    weapon: 'AR',
    squadRole: '높은 순간 화력으로 메인 딜러 슬롯에 배치하기 좋습니다.',
    skill1: '공격 누적 효과로 장기 교전 화력을 높입니다.',
    skill2: '체력 조건에 따라 추가 공격 성능을 얻습니다.',
    burstSkill: '강력한 광역 피해로 적 웨이브를 빠르게 정리합니다.',
    imageUrl: 'https://placehold.co/360x240?text=Scarlet',
  },
  {
    id: 5,
    name: '라피',
    rarity: 'SR',
    manufacturer: '엘리시온',
    classType: '화력형',
    burst: '버스트 III',
    code: '작열',
    weapon: 'AR',
    squadRole: '초반 캠페인 진행용 보급형 딜러로 활용할 수 있습니다.',
    skill1: '기본 공격 성능을 보조해 안정적으로 피해를 줍니다.',
    skill2: '자신의 전투 능력을 강화해 초반 진행을 돕습니다.',
    burstSkill: '단일 대상에게 집중 피해를 주는 초반용 버스트입니다.',
    imageUrl: 'https://placehold.co/360x240?text=Rapi',
  },
];

const createEmptyForm = () => ({
  name: '',
  rarity: 'SSR',
  manufacturer: manufacturers[0],
  classType: classes[0],
  burst: bursts[0],
  burstCooldown: '',
  code: codes[0],
  weapon: weapons[0],
  favoriteItemAvailable: false,
  squadRole: '',
  skill1: '',
  skill2: '',
  burstSkill: '',
  buffEffects: [],
  imageUrl: '',
  faceImageUrl: '',
  fullImageUrl: '',
});

const API_BASE = '/api';

const buffEffectTypes = [
  { key: 'attackUp', label: '공격력 증가', kind: 'buff' },
  { key: 'attackDown', label: '공격력 감소', kind: 'debuff' },
  { key: 'critRateUp', label: '크리티컬 증가', kind: 'buff' },
  { key: 'critDamageUp', label: '크리티컬 대미지 증가', kind: 'buff' },
  { key: 'coreDamageUp', label: '코어대미지 증가', kind: 'buff' },
  { key: 'attackDamageUp', label: '공격 대미지 증가', kind: 'buff' },
  { key: 'partsDamageUp', label: '파츠 대미지 증가', kind: 'buff' },
  { key: 'pierceDamageUp', label: '관통 대미지 증가', kind: 'buff' },
  { key: 'dotDamageUp', label: '지속 대미지 증가', kind: 'buff' },
  { key: 'ignoreDefenseDamageUp', label: '방어력 무시 대미지 증가', kind: 'buff' },
  { key: 'projectileDamageUp', label: '투사체 대미지 증가', kind: 'buff' },
  { key: 'interruptionPartDamageUp', label: '저지부위 대미지 증가', kind: 'buff' },
  { key: 'chargeDamageUp', label: '차지 대미지 증가', kind: 'buff' },
  { key: 'elementDamageUp', label: '우월코드 대미지 증가', kind: 'buff' },
  { key: 'distributedDamageUp', label: '분배 대미지 증가', kind: 'buff' },
  { key: 'accuracyUp', label: '명중률 증가', kind: 'utility' },
  { key: 'defenseUp', label: '방어력 증가', kind: 'utility' },
  { key: 'defenseDown', label: '방어력 감소', kind: 'debuff' },
  { key: 'chargeSpeedUp', label: '차지 속도 증가', kind: 'utility' },
  { key: 'attackSpeedUp', label: '공격 속도 증가', kind: 'utility' },
  { key: 'reloadSpeedUp', label: '재장전 속도 증가', kind: 'utility' },
  { key: 'heal', label: '체력 회복', kind: 'utility' },
  { key: 'barrier', label: '보호막', kind: 'utility' },
  { key: 'maxAmmoUp', label: '최대 장탄 수 증가', kind: 'utility' },
  { key: 'ammoCharge', label: '탄환 충전', kind: 'utility' },
  { key: 'burstCooldownDown', label: '버스트 쿨타임 감소', kind: 'utility' },
  { key: 'damageTakenUp', label: '받는 대미지 증가', kind: 'debuff' },
];

const effectTypeMap = Object.fromEntries(buffEffectTypes.map((type) => [type.key, type]));
const skillOptions = ['1스킬', '2스킬', '버스트'];
const effectTimingOptions = [
  { value: 'always', label: '상시' },
  { value: 'fullBurst', label: '풀 버스트' },
  { value: 'nonFullBurst', label: '풀 버스트 외' },
];
const effectTimingMap = Object.fromEntries(effectTimingOptions.map((timing) => [timing.value, timing]));
const targetOptions = [
  { value: 'ally', label: '아군' },
  { value: 'self', label: '자신' },
  { value: 'enemy', label: '적' },
];
const skillTextFields = [
  { name: 'skill1', label: '1스킬', placeholder: '1스킬 원문/메모를 입력하세요' },
  { name: 'skill2', label: '2스킬', placeholder: '2스킬 원문/메모를 입력하세요' },
  { name: 'burstSkill', label: '버스트 스킬', placeholder: '버스트 스킬 원문/메모를 입력하세요' },
];

const createEmptySquadCategories = () =>
  Object.fromEntries(squadCategoryDefs.map((category) => [category.key, Array.from({ length: category.squadCount }, () => [])]));

const normalizeSquadIds = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map(Number).filter(Boolean).slice(0, 5);
  }

  return [];
};

const normalizeSquadCategories = (payload) => {
  const normalized = createEmptySquadCategories();

  if (Array.isArray(payload)) {
    normalized.soloRaid[0] = normalizeSquadIds(payload);
    return normalized;
  }

  squadCategoryDefs.forEach((category) => {
    const groups = Array.isArray(payload?.[category.key]) ? payload[category.key] : [];
    normalized[category.key] = Array.from({ length: category.squadCount }, (_, index) => normalizeSquadIds(groups[index] || []));
  });

  return normalized;
};

const setSquadIdsInCategories = (categories, categoryKey, squadIndex, ids) => {
  const next = normalizeSquadCategories(categories);
  next[categoryKey][squadIndex] = normalizeSquadIds(ids);
  return next;
};

const analyzeSquadComposition = (squad) => {
  const burstCounts = bursts.reduce((counts, burst) => {
    counts[burst] = squad.filter((nikke) => nikke.burst === burst).length;
    return counts;
  }, {});

  const codeCounts = codes.reduce((counts, code) => {
    counts[code] = squad.filter((nikke) => nikke.code === code).length;
    return counts;
  }, {});

  return {
    checks: [
      { label: '5명', passed: squad.length === 5 },
      { label: '버스트 I', passed: burstCounts['버스트 I'] > 0 },
      { label: '버스트 II', passed: burstCounts['버스트 II'] > 0 },
      { label: '버스트 III', passed: burstCounts['버스트 III'] > 0 },
    ],
    codeCounts: codes.map((code) => ({ label: code, count: codeCounts[code] })),
  };
};

const effectRules = [
  { label: '버스트 쿨타임 감소', kind: 'utility', names: ['버스트 스킬 재사용 시간'], directions: ['▼'] },
  { label: '재장전 속도', kind: 'utility', names: ['재장전 속도'], directions: ['▲'] },
  { label: '재장전 시간 감소', kind: 'utility', names: ['재장전 시간'], directions: ['▼'] },
  { label: '체력 회복', kind: 'utility', names: ['체력 회복', '엄폐물 체력 회복'], directions: [] },
  { label: '회복량 증가', kind: 'utility', names: ['받는 체력 회복량', '체력 회복량'], directions: ['▲'] },
  { label: '최대 장탄 수', kind: 'utility', names: ['최대 장탄 수'], directions: ['▲'] },
  { label: '탄환 충전', kind: 'utility', names: ['탄환 충전'], directions: ['▲', '충전'] },
  { label: '명중률', kind: 'utility', names: ['명중률'], directions: ['▲'] },
  { label: '방어력 증가', kind: 'utility', names: ['방어력', '시전자 기준 방어력'], directions: ['▲'] },
  { label: '방어력 감소', kind: 'debuff', names: ['방어력'], directions: ['▼'] },
  { label: '최대 체력', kind: 'utility', names: ['최대 체력', '최대 체력만'], directions: ['▲'] },
  { label: '차지 속도', kind: 'utility', names: ['차지 속도'], directions: ['▲'] },
  { label: '공격 속도', kind: 'utility', names: ['공격 속도'], directions: ['▲'] },
  { label: '보호막', kind: 'utility', names: ['아군 공용 보호막', '보호막'], directions: ['보호막'] },
  { label: '시전자 기준 공격력 증가', kind: 'buff', names: ['시전자 기준 공격력'], directions: ['▲'] },
  { label: '우월코드 공격 대미지', kind: 'buff', names: ['우월 코드 공격 대미지', '우월코드 공격 대미지'], directions: ['▲'] },
  { label: '방어력 무시 대미지', kind: 'buff', names: ['방어력 무시 대미지'], directions: ['▲'] },
  { label: '저지 부위 공격 대미지', kind: 'buff', names: ['저지 부위 공격 대미지', '저지부위 공격 대미지'], directions: ['▲'] },
  { label: '파츠 대미지', kind: 'buff', names: ['파츠 대미지'], directions: ['▲'] },
  { label: '관통 대미지', kind: 'buff', names: ['관통 대미지'], directions: ['▲'] },
  { label: '차지 대미지', kind: 'buff', names: ['차지 대미지'], directions: ['▲'] },
  { label: '공격 대미지', kind: 'buff', names: ['공격 대미지'], directions: ['▲'] },
  { label: '분배 대미지', kind: 'buff', names: ['분배 대미지'], directions: ['▲'] },
  { label: '크리티컬 확률', kind: 'buff', names: ['크리티컬 확률'], directions: ['▲'] },
  { label: '크리티컬 대미지', kind: 'buff', names: ['크리티컬 대미지'], directions: ['▲'] },
  { label: '지속 대미지', kind: 'buff', names: ['지속 대미지'], directions: ['▲'] },
  { label: '공격력', kind: 'buff', names: ['공격력'], directions: ['▲'] },
  { label: '공격력 감소', kind: 'debuff', names: ['공격력'], directions: ['▼'] },
  { label: '받는 대미지', kind: 'debuff', names: ['받는 대미지'], directions: ['▲'] },
];

const normalizeEffectName = (name) => name.replace(/\s+/g, ' ').trim();

const normalizeEffectDirection = (direction) => {
  const text = String(direction || '');
  if (text.includes('회복')) return '회복';
  if (text.includes('충전')) return '충전';
  if (text.includes('보호막')) return '보호막';
  return text;
};

const findEffectRule = (name, direction) => {
  const normalizedName = normalizeEffectName(name);
  const normalizedDirection = normalizeEffectDirection(direction);
  if (normalizedDirection === '회복') {
    return effectRules.find((rule) => rule.label === '체력 회복');
  }
  if (normalizedDirection === '보호막') {
    return effectRules.find((rule) => rule.label === '보호막');
  }

  return effectRules.find(
    (rule) =>
      rule.names.some((candidate) => {
        const normalizedCandidate = normalizeEffectName(candidate);
        return normalizedName === normalizedCandidate || normalizedName.endsWith(`: ${normalizedCandidate}`) || normalizedName.endsWith(normalizedCandidate);
      }) &&
      (!rule.directions.length || rule.directions.includes(normalizedDirection)),
  );
};

const getSegmentTarget = (textBeforeEffect, kind, sourceName, effectTail = '') => {
  if (kind === 'debuff') {
    return '적';
  }

  if (String(effectTail).includes('아군')) {
    return '아군';
  }

  const context = textBeforeEffect.slice(-120);
  const allyIndex = Math.max(context.lastIndexOf('아군'), context.lastIndexOf('전체에게'));
  const selfIndex = Math.max(context.lastIndexOf('자신에게'), context.lastIndexOf('자신을'));
  if (selfIndex > allyIndex) {
    return sourceName;
  }

  return '아군';
};

const parseEffectNumber = (value) => Number.parseFloat(String(value || '').replace(/[^\d.]/g, '')) || 0;

const displayNikkeName = (nikke) => `${nikke.favoriteItemAvailable ? '💜 ' : ''}${nikke.name}`;

const formatBurstCooldown = (value) => {
  const cooldown = Number.parseFloat(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(cooldown) && cooldown > 0 ? `${Number.isInteger(cooldown) ? cooldown : cooldown}초` : '';
};

const getSkillFieldLabel = (field, nikke) => {
  if (field.name !== 'burstSkill') {
    return field.label;
  }

  const cooldown = formatBurstCooldown(nikke.burstCooldown);
  return cooldown ? `${field.label}(${cooldown})` : field.label;
};

const getSkillDescriptionLength = (nikke) => skillTextFields.reduce((total, field) => total + String(nikke[field.name] || '').length, 0);

const getSkillTooltipDensityClass = (nikke) => {
  const skillDescriptionLength = getSkillDescriptionLength(nikke);

  if (skillDescriptionLength > 1800) {
    return ' compressed';
  }

  if (skillDescriptionLength > 1100) {
    return ' compact';
  }

  return '';
};

const estimateSkillTooltipFontSize = (nikke, tooltipWidth, viewportHeight) => {
  const columnCount = tooltipWidth >= 720 ? 3 : tooltipWidth >= 500 ? 2 : 1;
  const availableHeight = viewportHeight - 24;
  const contentWidth = tooltipWidth / columnCount - 20;
  const estimatedCharsPerLine = Math.max(14, Math.floor(contentWidth / 6.2));
  const estimatedLines = skillTextFields.reduce((total, field) => {
    const text = String(nikke[field.name] || '');
    if (!text) {
      return total;
    }

    return (
      total +
      text
        .split('\n')
        .map((line) => Math.max(1, Math.ceil(line.length / estimatedCharsPerLine)))
        .reduce((sum, lineCount) => sum + lineCount, 0)
    );
  }, 0);
  const targetFontSize = (availableHeight - 46) / Math.max(1, estimatedLines) / 1.16;

  return Math.max(7, Math.min(12.8, targetFontSize));
};

const normalizeEffectTiming = (timing) => (effectTimingMap[timing] ? timing : 'always');

const getEffectTimingLabel = (timing) => effectTimingMap[normalizeEffectTiming(timing)].label;

const groupEffectsByTiming = (effects) =>
  effectTimingOptions
    .map((timing) => ({
      ...timing,
      effects: effects.filter((effect) => normalizeEffectTiming(effect.timing) === timing.value),
    }))
    .filter((group) => group.effects.length);

const inferEffectTiming = (segment) => {
  if (/풀\s*버스트\s*타임(?:이|가)?\s*(?:아닐|아닌|제외|외|종료|끝)/u.test(segment)) {
    return 'nonFullBurst';
  }

  if (/풀\s*버스트\s*타임|풀\s*버스트/u.test(segment)) {
    return 'fullBurst';
  }

  if (/\[지속\]|지속/u.test(segment)) {
    return 'always';
  }

  return 'always';
};

const isHealTriggeredEffect = (segment) => /회복\s*효과\s*적용\s*시/u.test(segment);

const inferEffectsFromSkillText = (nikke) => {
  const detected = new Map();

  skillTextFields.forEach((field) => {
    const text = nikke[field.name] || '';
    text
      .split('■')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .forEach((segment) => {
        const bracketPattern = /\[([^\]\d]+?)\s+(\d+(?:\.\d+)?)(%|초|발)\s*([▲▼])\]/gu;
        const resultPattern = /\[([^\]\d]+?)\s+(\d+(?:\.\d+)?)(%|초|발)\s*([^\]]*(?:회복|충전|보호막))\]/gu;
        const durationPattern = /\[(\d+(?:\.\d+)?초 유지)\]/u;
        const matches = [...segment.matchAll(bracketPattern), ...segment.matchAll(resultPattern)].sort((a, b) => (a.index || 0) - (b.index || 0));
        const timing = inferEffectTiming(segment);
        const healTriggered = isHealTriggeredEffect(segment);

        matches.forEach((match) => {
          const [, rawName, amount, unit, direction] = match;
          const rule = findEffectRule(rawName, direction);
          if (!rule) {
            return;
          }

          const textBeforeEffect = segment.slice(0, match.index || 0);
          const kind = healTriggered && rule.kind === 'buff' ? 'utility' : rule.kind;
          const target = getSegmentTarget(textBeforeEffect, kind, nikke.name, direction);
          if (target === nikke.name) {
            return;
          }

          const textAfterEffect = segment.slice((match.index || 0) + match[0].length);
          const duration = textAfterEffect.match(durationPattern)?.[1] || '';
          const value = `${amount}${unit}`;
          detected.set(`${kind}-${rule.label}-${value}-${target}-${duration}-${timing}`, {
            label: rule.label,
            kind,
            source: nikke.name,
            target,
            value,
            duration,
            timing,
          });
        });
      });
  });

  return [...detected.values()];
};

const analyzeSquadEffects = (squad) => {
  const effects = {
    buff: new Map(),
    debuff: new Map(),
    utility: new Map(),
  };
  const addEffect = (effect) => {
    const timing = normalizeEffectTiming(effect.timing);
    const key = `${effect.kind}-${effect.source}-${effect.label}-${timing}`;
    const group = effects[effect.kind];
    if (!group) {
      return;
    }

    const normalizedEffect = { ...effect, timing };
    const savedEffect = group.get(key);
    if (!savedEffect || parseEffectNumber(normalizedEffect.value) > parseEffectNumber(savedEffect.value)) {
      group.set(key, normalizedEffect);
    }
  };

  squad.forEach((nikke) => {
    inferEffectsFromSkillText(nikke).forEach((effect) => {
      addEffect(effect);
    });

    (nikke.buffEffects || []).forEach((effect) => {
      const type = effectTypeMap[effect.type];
      if (
        !type ||
        ![
          'attackUp',
          'attackDown',
          'critRateUp',
          'critDamageUp',
          'attackDamageUp',
          'ignoreDefenseDamageUp',
          'dotDamageUp',
          'elementDamageUp',
          'distributedDamageUp',
          'interruptionPartDamageUp',
          'partsDamageUp',
          'pierceDamageUp',
          'chargeDamageUp',
          'damageTakenUp',
          'accuracyUp',
          'defenseUp',
          'defenseDown',
          'chargeSpeedUp',
          'attackSpeedUp',
          'reloadSpeedUp',
          'heal',
          'barrier',
          'maxAmmoUp',
          'ammoCharge',
          'burstCooldownDown',
        ].includes(effect.type)
      ) {
        return;
      }

      const kind = type.kind === 'utility' ? 'utility' : type.kind === 'debuff' ? 'debuff' : effect.target === 'self' ? 'self' : 'buff';
      if (kind === 'self') {
        return;
      }
      addEffect({
        label: type.label,
        kind,
        source: nikke.name,
        target: kind === 'debuff' ? '적' : kind === 'self' ? nikke.name : '아군',
        value: effect.value ? `${effect.value}%` : '',
        timing: normalizeEffectTiming(effect.timing),
      });
    });
  });

  return {
    buff: [...effects.buff.values()],
    debuff: [...effects.debuff.values()],
    utility: [...effects.utility.values()],
  };
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'API 요청에 실패했습니다.');
  }

  return payload;
};

const matchesNikkeKeyword = (nikke, keyword) => {
  if (!keyword) {
    return true;
  }

  return [
    nikke.name,
    nikke.manufacturer,
    nikke.classType,
    nikke.code,
    nikke.weapon,
    nikke.favoriteItemAvailable ? '애장품' : '',
    nikke.burst,
    nikke.squadRole,
    nikke.skill1,
    nikke.skill2,
    nikke.burstSkill,
    ...(nikke.buffEffects || []).map(
      (effect) => `${effectTypeMap[effect.type]?.label || effect.type} ${effect.value || ''} ${getEffectTimingLabel(effect.timing)} ${effect.note || ''}`,
    ),
  ]
    .join(' ')
    .toLowerCase()
    .includes(keyword);
};

const createEmptyEffect = () => ({
  id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  skill: skillOptions[0],
  target: 'ally',
  type: buffEffectTypes[0].key,
  timing: effectTimingOptions[0].value,
  value: '',
  note: '',
});

function App() {
  const [nikkes, setNikkes] = useState([]);
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [squadCategories, setSquadCategories] = useState(createEmptySquadCategories);
  const [activeCategory, setActiveCategory] = useState(squadCategoryDefs[0].key);
  const [activeSquadIndex, setActiveSquadIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [selectedManufacturers, setSelectedManufacturers] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [selectedBursts, setSelectedBursts] = useState([]);
  const [selectedWeapons, setSelectedWeapons] = useState([]);
  const [manageQuery, setManageQuery] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [importingSkills, setImportingSkills] = useState(false);
  const [importingFavoriteItemSkills, setImportingFavoriteItemSkills] = useState(false);
  const [importingDildoro, setImportingDildoro] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState('');

  useEffect(() => {
    const loadNikkes = async () => {
      try {
        setLoading(true);
        const [loadedNikkes, loadedSquadCategories] = await Promise.all([requestJson('/nikkes'), requestJson('/squad')]);
        setNikkes(loadedNikkes);
        setSquadCategories(normalizeSquadCategories(loadedSquadCategories));
        setApiError('');
      } catch (error) {
        setNikkes(initialNikkes);
        setSquadCategories(setSquadIdsInCategories(createEmptySquadCategories(), 'soloRaid', 0, [1, 2, 3, 4]));
        setApiError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadNikkes();
  }, []);

  const activeCategoryDef = squadCategoryDefs.find((category) => category.key === activeCategory) || squadCategoryDefs[0];
  const categorySquads = squadCategories[activeCategory] || [];
  const squadIds = categorySquads[activeSquadIndex] || [];
  const categoryUsedIds = useMemo(() => new Set(categorySquads.flat()), [categorySquads]);
  const squad = useMemo(() => squadIds.map((id) => nikkes.find((nikke) => nikke.id === id)).filter(Boolean), [nikkes, squadIds]);

  const filteredNikkes = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return nikkes.filter((nikke) => {
      const matchesRarity = nikke.rarity === 'SSR';
      const matchesManufacturer = !selectedManufacturers.length || selectedManufacturers.includes(nikke.manufacturer);
      const matchesCode = !selectedCodes.length || selectedCodes.includes(nikke.code);
      const matchesBurst = !selectedBursts.length || selectedBursts.includes(nikke.burst);
      const matchesWeapon = !selectedWeapons.length || selectedWeapons.includes(nikke.weapon);

      return matchesRarity && matchesManufacturer && matchesCode && matchesBurst && matchesWeapon && matchesNikkeKeyword(nikke, keyword);
    });
  }, [nikkes, query, selectedBursts, selectedCodes, selectedManufacturers, selectedWeapons]);

  const filteredManagedNikkes = useMemo(() => {
    const keyword = manageQuery.trim().toLowerCase();
    return nikkes.filter((nikke) => matchesNikkeKeyword(nikke, keyword));
  }, [manageQuery, nikkes]);

  const updateForm = (event) => {
    const { checked, name, type, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const toggleFilterValue = (setter, value) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const clearRosterFilters = () => {
    setQuery('');
    setQueryInput('');
    setSelectedManufacturers([]);
    setSelectedCodes([]);
    setSelectedBursts([]);
    setSelectedWeapons([]);
  };

  const searchRoster = (event) => {
    event.preventDefault();
    setQuery(queryInput.trim());
  };

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setImageUploadMessage('');
  };

  const submitNikke = async (event) => {
    event.preventDefault();

    if (!form.name.trim() || !form.squadRole.trim()) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      rarity: form.rarity,
      manufacturer: form.manufacturer,
      classType: form.classType,
      burst: form.burst,
      burstCooldown: form.burstCooldown,
      code: form.code,
      weapon: form.weapon,
      favoriteItemAvailable: Boolean(form.favoriteItemAvailable),
      squadRole: form.squadRole.trim(),
      skill1: form.skill1.trim(),
      skill2: form.skill2.trim(),
      burstSkill: form.burstSkill.trim(),
      buffEffects: form.buffEffects
        .filter((effect) => effect.type && effect.value !== '')
        .map((effect) => ({
          id: effect.id || String(Date.now()),
          skill: effect.skill,
          target: effectTypeMap[effect.type]?.kind === 'debuff' ? 'enemy' : effect.target,
          type: effect.type,
          timing: normalizeEffectTiming(effect.timing),
          value: String(effect.value).trim(),
          note: String(effect.note || '').trim(),
        })),
      imageUrl: form.imageUrl.trim(),
      faceImageUrl: form.faceImageUrl.trim(),
      fullImageUrl: form.fullImageUrl.trim(),
    };

    try {
      if (editingId) {
        const updatedNikke = await requestJson(`/nikkes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNikkes((prev) => prev.map((nikke) => (nikke.id === editingId ? updatedNikke : nikke)));
        resetForm();
        setApiError('');
        return;
      }

      const createdNikke = await requestJson('/nikkes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNikkes((prev) => [createdNikke, ...prev]);
      resetForm();
      setApiError('');
    } catch (error) {
      setApiError(error.message);
    }
  };

  const editNikke = (nikke) => {
    setEditingId(nikke.id);
    setImageUploadMessage('');
    setForm({
      name: nikke.name,
      rarity: nikke.rarity,
      manufacturer: nikke.manufacturer,
      classType: nikke.classType,
      burst: nikke.burst,
      burstCooldown: nikke.burstCooldown || '',
      code: nikke.code,
      weapon: nikke.weapon,
      favoriteItemAvailable: Boolean(nikke.favoriteItemAvailable),
      squadRole: nikke.squadRole,
      skill1: nikke.skill1 || '',
      skill2: nikke.skill2 || '',
      burstSkill: nikke.burstSkill || '',
      buffEffects: Array.isArray(nikke.buffEffects)
        ? nikke.buffEffects.map((effect) => ({ ...effect, timing: normalizeEffectTiming(effect.timing) }))
        : [],
      imageUrl: nikke.imageUrl || '',
      faceImageUrl: nikke.faceImageUrl || '',
      fullImageUrl: nikke.fullImageUrl || '',
    });
  };

  const addEffect = () => {
    setForm((prev) => ({ ...prev, buffEffects: [...prev.buffEffects, createEmptyEffect()] }));
  };

  const updateEffect = (id, field, value) => {
    setForm((prev) => ({
      ...prev,
      buffEffects: prev.buffEffects.map((effect) => {
        if (effect.id !== id) {
          return effect;
        }

        const next = { ...effect, [field]: value };
        if (field === 'type' && effectTypeMap[value]?.kind === 'debuff') {
          next.target = 'enemy';
        }
        return next;
      }),
    }));
  };

  const removeEffect = (id) => {
    setForm((prev) => ({ ...prev, buffEffects: prev.buffEffects.filter((effect) => effect.id !== id) }));
  };

  const uploadCharacterImage = async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const body = new FormData();
    body.append('image', file);

    try {
      setUploadingImage(true);
      setImageUploadMessage('');
      const response = await fetch(`${API_BASE}/uploads/images`, {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '이미지 업로드에 실패했습니다.');
      }

      setForm((prev) => ({ ...prev, imageUrl: payload.imageUrl }));
      setImageUploadMessage(`${file.name} 업로드 완료`);
      setApiError('');
    } catch (error) {
      setImageUploadMessage('');
      setApiError(error.message);
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const saveSquadIds = async (nextIds, squadIndex = activeSquadIndex) => {
    const nextCategories = setSquadIdsInCategories(squadCategories, activeCategory, squadIndex, nextIds);
    setSquadCategories(nextCategories);
    setActiveSquadIndex(squadIndex);

    try {
      const savedCategories = await requestJson('/squad', {
        method: 'PUT',
        body: JSON.stringify({ categories: nextCategories }),
      });
      setSquadCategories(normalizeSquadCategories(savedCategories));
      setApiError('');
    } catch (error) {
      setApiError(error.message);
    }
  };

  const deleteNikke = async (id) => {
    try {
      await requestJson(`/nikkes/${id}`, { method: 'DELETE' });
      setNikkes((prev) => prev.filter((nikke) => nikke.id !== id));
      setSquadCategories((prev) =>
        Object.fromEntries(Object.entries(prev).map(([category, squads]) => [category, squads.map((ids) => ids.filter((squadId) => squadId !== id))])),
      );
      setApiError('');
    } catch (error) {
      setApiError(error.message);
    }

    if (editingId === id) {
      resetForm();
    }
  };

  const addToSquad = (id, squadIndex = activeSquadIndex) => {
    const targetIds = categorySquads[squadIndex] || [];
    if (targetIds.includes(id) || categoryUsedIds.has(id) || targetIds.length >= 5) {
      return;
    }

    saveSquadIds([...targetIds, id], squadIndex);
  };

  const placeInSquad = (id, slotIndex, squadIndex = activeSquadIndex) => {
    const targetIds = categorySquads[squadIndex] || [];
    const withoutDragged = targetIds.filter((squadId) => squadId !== id);

    if (slotIndex >= withoutDragged.length) {
      saveSquadIds([...withoutDragged, id].slice(0, 5), squadIndex);
      return;
    }

    const next = [...withoutDragged];
    next.splice(slotIndex, 0, id);
    saveSquadIds(next.slice(0, 5), squadIndex);
  };

  const removeFromSquad = (id, squadIndex = activeSquadIndex) => {
    const targetIds = categorySquads[squadIndex] || [];
    saveSquadIds(targetIds.filter((squadId) => squadId !== id), squadIndex);
  };

  const clearSquad = () => saveSquadIds([]);

  const importSsrSkillsFromNamuWiki = async () => {
    try {
      setImportingSkills(true);
      setImportMessage('');
      const result = await requestJson('/import/namuwiki/ssr-skills', { method: 'POST' });
      setNikkes(result.nikkes);
      setApiError('');
      setImportMessage(`SSR ${result.imported}명 스킬 정보를 가져왔습니다.${result.failed ? ` 실패 ${result.failed}명` : ''}`);
    } catch (error) {
      setApiError(error.message);
    } finally {
      setImportingSkills(false);
    }
  };

  const importFavoriteItemSkillsFromNamuWiki = async () => {
    try {
      setImportingFavoriteItemSkills(true);
      setImportMessage('');
      const result = await requestJson('/import/namuwiki/favorite-item-skills', { method: 'POST' });
      setNikkes(result.nikkes);
      setApiError('');
      setImportMessage(`애장품 ${result.imported}명 스킬 정보를 가져왔습니다.${result.failed ? ` 실패 ${result.failed}명` : ''}`);
    } catch (error) {
      setApiError(error.message);
    } finally {
      setImportingFavoriteItemSkills(false);
    }
  };

  const importNikkeData = async () => {
    try {
      setImportingDildoro(true);
      setImportMessage('');
      const result = await requestJson('/import/nikke', { method: 'POST' });
      setNikkes(result.nikkes);
      setApiError('');
      setImportMessage(
        `NIKKE SSR ${result.total}명 적용 완료: 신규 ${result.created}명, 업데이트 ${result.updated}명, 제외 ${result.skipped}명`,
      );
    } catch (error) {
      setApiError(error.message);
    } finally {
      setImportingDildoro(false);
    }
  };

  const startDrag = (event, id) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-nikke-id', String(id));
    event.dataTransfer.setData('text/plain', String(id));
    setDraggingId(id);
  };

  const dropOnSlot = (event, slotIndex, squadIndex = activeSquadIndex) => {
    event.preventDefault();
    const droppedId = Number(
      event.dataTransfer.getData('application/x-nikke-id') || event.dataTransfer.getData('text/plain') || draggingId,
    );
    const targetIds = categorySquads[squadIndex] || [];

    if (droppedId && nikkes.some((nikke) => nikke.id === droppedId) && (targetIds.includes(droppedId) || !categoryUsedIds.has(droppedId))) {
      placeInSquad(droppedId, slotIndex, squadIndex);
    }

    setDraggingId(null);
    setDragOverSlot(null);
  };

  const handleSlotDragOver = (event, slotIndex, squadIndex = activeSquadIndex) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverSlot(`${squadIndex}-${slotIndex}`);
  };

  const toggleSquadSelection = (id) => {
    if (squadIds.includes(id)) {
      removeFromSquad(id);
      return;
    }

    addToSquad(id);
  };

  const showTooltip = (event, nikke) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportGap = 12;
    const tooltipWidth = Math.min(980, viewportWidth - viewportGap * 2);
    const fontSize = estimateSkillTooltipFontSize(nikke, tooltipWidth, viewportHeight);

    setTooltip({
      nikke,
      width: tooltipWidth,
      fontSize,
    });
  };

  const hideTooltip = () => setTooltip(null);

  const renderSkillTooltip = (nikke, className = 'skillTooltip') => (
    <div className={`${className}${getSkillTooltipDensityClass(nikke)}`} role="tooltip">
      <strong>{displayNikkeName(nikke)}</strong>
      <div className="skillTooltipBody">
        {skillTextFields.some((field) => nikke[field.name]) ? (
          skillTextFields.map((field) =>
            nikke[field.name] ? (
              <p key={field.name}>
                <span>{getSkillFieldLabel(field, nikke)}</span>
                {nikke[field.name]}
              </p>
            ) : null,
          )
        ) : (
          <p>
            <span>스킬</span>
            입력된 스킬 설명이 없습니다.
          </p>
        )}
      </div>
    </div>
  );

  const renderNikkeImage = (nikke, className = 'portrait', imageSource = nikke.fullImageUrl || nikke.imageUrl, showSkillTooltip = true) => (
    <div
      className={`imageTooltipWrap ${className === 'tileImage' || className === 'slotImage' ? 'faceImageWrap' : ''}`}
      onMouseEnter={showSkillTooltip ? (event) => showTooltip(event, nikke) : undefined}
      onMouseMove={showSkillTooltip ? (event) => showTooltip(event, nikke) : undefined}
      onMouseLeave={showSkillTooltip ? hideTooltip : undefined}
      onFocus={showSkillTooltip ? (event) => showTooltip(event, nikke) : undefined}
      onBlur={showSkillTooltip ? hideTooltip : undefined}
    >
      <img
        className={className}
        draggable
        onDragStart={(event) => startDrag(event, nikke.id)}
        onDragEnd={() => setDraggingId(null)}
        src={imageSource || nikke.faceImageUrl || 'https://placehold.co/360x240?text=NIKKE'}
        alt={`${displayNikkeName(nikke)} 이미지`}
      />
      <div className="imageInfoOverlay" aria-hidden="true">
        <strong>{displayNikkeName(nikke)}</strong>
        <span>
          {nikke.rarity} · {nikke.burst}
        </span>
        <span>
          {nikke.manufacturer} · {nikke.classType}
        </span>
        <span>
          {nikke.code} · {nikke.weapon}
        </span>
      </div>
    </div>
  );

  const renderNikkeCard = (nikke, mode = 'manage') => {
    const selected = squadIds.includes(nikke.id);
    const unavailable = mode === 'squad' && !selected && categoryUsedIds.has(nikke.id);
    const cardDragProps = {
      draggable: !unavailable,
      onDragStart: (event) => {
        if (!unavailable) {
          startDrag(event, nikke.id);
        }
      },
      onDragEnd: () => {
        setDraggingId(null);
        setDragOverSlot(null);
      },
    };

    if (mode === 'squad') {
      return (
        <li
          key={nikke.id}
          className={`nikkeTile ${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''} ${draggingId === nikke.id ? 'dragging' : ''}`}
          aria-label={`${displayNikkeName(nikke)} 편성 후보`}
          onClick={() => {
            if (!unavailable) {
              toggleSquadSelection(nikke.id);
            }
          }}
          {...cardDragProps}
        >
          {renderNikkeImage(nikke, 'tileImage', nikke.faceImageUrl || nikke.imageUrl || nikke.fullImageUrl, false)}
          {nikke.favoriteItemAvailable && <span className="tileFavoriteBadge">애장품</span>}
          {unavailable && <span className="tileUnavailableBadge">다른 편성</span>}
        </li>
      );
    }

    return (
      <li
        key={nikke.id}
        className={`nikkeCard ${selected ? 'selected' : ''} ${draggingId === nikke.id ? 'dragging' : ''}`}
        {...cardDragProps}
      >
        {renderNikkeImage(nikke)}
        <div className="cardBody">
          <div className="titleRow">
            <strong>{displayNikkeName(nikke)}</strong>
            <span className="badge rarity">{nikke.rarity}</span>
            <span className="badge">{nikke.burst}</span>
            {nikke.favoriteItemAvailable && <span className="badge favorite">애장품</span>}
          </div>
          <p>
            {nikke.manufacturer} · {nikke.classType} · {nikke.code} · {nikke.weapon}
          </p>
          <p className="note">{nikke.squadRole}</p>
        </div>
        <div className="cardActions">
          {mode === 'squad' ? (
            selected ? (
              <button type="button" className="button ghost small" onClick={() => removeFromSquad(nikke.id)}>
                편성 해제
              </button>
            ) : (
              <button type="button" className="button small" onClick={() => addToSquad(nikke.id)} disabled={squad.length >= 5}>
                편성 추가
              </button>
            )
          ) : (
            <>
              <button type="button" className="button small" onClick={() => editNikke(nikke)}>
                수정
              </button>
              <button type="button" className="button danger small" onClick={() => deleteNikke(nikke.id)}>
                삭제
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <main className="container">
      <header className="hero">
        <div>
          <p className="eyebrow">Goddess of Victory: NIKKE</p>
          <h1>승리의 여신: 니케 스쿼드 빌더</h1>
          <p>니케 이미지를 드래그해 5인 스쿼드를 구성하고, 이미지 hover로 스킬 정보를 확인하세요.</p>
        </div>
        <div className="summaryGrid" aria-label="스쿼드 요약">
          <span>
            보유 니케 <strong>{nikkes.length}</strong>
          </span>
          <span>
            편성 인원 <strong>{squad.length}/5</strong>
          </span>
          <span>
            SSR <strong>{nikkes.filter((nikke) => nikke.rarity === 'SSR').length}</strong>
          </span>
        </div>
      </header>

      {(loading || apiError) && (
        <div className={`apiStatus ${apiError ? 'error' : ''}`}>
          {loading ? 'DB에서 니케 정보를 불러오는 중입니다.' : `API 오류: ${apiError}`}
        </div>
      )}

      <div className="importActions" aria-label="데이터 가져오기">
        <button type="button" className="button ghost" onClick={importNikkeData} disabled={importingDildoro}>
          {importingDildoro ? 'NIKKE 데이터 가져오는 중' : 'NIKKE 데이터 가져오기'}
        </button>
        <button type="button" className="button ghost" onClick={importSsrSkillsFromNamuWiki} disabled={importingSkills}>
          {importingSkills ? 'SSR 스킬 가져오는 중' : 'SSR 스킬 가져오기'}
        </button>
        <button
          type="button"
          className="button"
          onClick={importFavoriteItemSkillsFromNamuWiki}
          disabled={importingFavoriteItemSkills}
        >
          {importingFavoriteItemSkills ? '애장품 스킬 가져오는 중' : '애장품 스킬 가져오기'}
        </button>
      </div>

      {importMessage && <p className="importMessage">{importMessage}</p>}

      <div className="squadWorkspace">
          <section className="panel squadPanel">
            
            <div className="categoryTabs" aria-label="콘텐츠 선택">
              {squadCategoryDefs.map((category) => {
                const filledCount = (squadCategories[category.key] || []).filter((ids) => ids.length > 0).length;
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={`categoryTab ${activeCategory === category.key ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCategory(category.key);
                      setActiveSquadIndex(0);
                      setDragOverSlot(null);
                    }}
                  >
                    {category.label}
                    <span>
                      {filledCount}/{category.squadCount}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sectionHeader">
              <button type="button" className="button ghost" onClick={clearSquad} disabled={!squad.length}>
                전체 스쿼드 편성 비우기
              </button>
            </div>

            <div className="squadStack">
              {categorySquads.map((ids, squadIndex) => {
                const squadNikkes = ids.map((id) => nikkes.find((nikke) => nikke.id === id)).filter(Boolean);
                const compositionAnalysis = analyzeSquadComposition(squadNikkes);
                const effectChecks = analyzeSquadEffects(squadNikkes);
                const isActiveSquad = activeSquadIndex === squadIndex;

                return (
                  <section
                    key={`${activeCategory}-${squadIndex}`}
                    className={`squadBlock ${isActiveSquad ? 'active' : ''}`}
                    onClick={() => setActiveSquadIndex(squadIndex)}
                  >
                    <div className="squadBlockHeader">
                      <h3>{squadIndex + 1} 스쿼드</h3>
                      <button
                        type="button"
                        className="button ghost small"
                        onClick={(event) => {
                          event.stopPropagation();
                          saveSquadIds([], squadIndex);
                        }}
                        disabled={!squadNikkes.length}
                      >
                        비우기
                      </button>
                    </div>

                    <div className="squadSlots compact">
                      {Array.from({ length: 5 }).map((_, slotIndex) => {
                        const nikke = squadNikkes[slotIndex];
                        const slotKey = `${squadIndex}-${slotIndex}`;

                        return (
                          <div
                            key={nikke?.id || `empty-${squadIndex}-${slotIndex}`}
                            className={`slot ${nikke ? 'filled' : ''} ${dragOverSlot === slotKey ? 'dragOver' : ''}`}
                            onDragOver={(event) => handleSlotDragOver(event, slotIndex, squadIndex)}
                            onDragEnter={() => setDragOverSlot(slotKey)}
                            onDragLeave={() => setDragOverSlot(null)}
                            onDrop={(event) => dropOnSlot(event, slotIndex, squadIndex)}
                          >
                            {nikke ? (
                              <>
                                {renderNikkeImage(nikke, 'slotImage', nikke.faceImageUrl || nikke.imageUrl || nikke.fullImageUrl)}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeFromSquad(nikke.id, squadIndex);
                                  }}
                                >
                                  제거
                                </button>
                              </>
                            ) : (
                              <span>빈 슬롯 {slotIndex + 1}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="compositionCheck compositionSummary">
                      <h3>구성 체크</h3>
                      <div className="checkList">
                        {compositionAnalysis.checks.map((check) => (
                          <span key={check.label} className={check.passed ? 'passed' : 'failed'}>
                            {check.passed ? '✓' : '•'} {check.label}
                          </span>
                        ))}
                        {compositionAnalysis.codeCounts.map(({ label, count }) => (
                          <span key={label}>
                            {label} {count}
                          </span>
                        ))}
                      </div>
                    </div>

                    <details className="squadAnalysisDetails" defaultOpen={isActiveSquad}>
                      <summary>효과 체크</summary>
                      <div className="squadAnalysisBody">
                        <div className="effectCheckGrid">
                          {[
                            ['버프 체크', effectChecks.buff, 'buffEffect'],
                            ['디버프 체크', effectChecks.debuff, 'debuffEffect'],
                            ['유틸리티 체크', effectChecks.utility, 'utilityEffect'],
                          ].map(([title, effects, className]) => (
                            <div key={title} className="compositionCheck effectCheck">
                              <h3>{title}</h3>
                              <div className="effectTimingGroupList">
                                {effects.length ? (
                                  groupEffectsByTiming(effects).map((group) => (
                                    <div key={group.value} className="effectTimingGroup">
                                      <strong>{group.label}</strong>
                                      <div className="checkList effectList">
                                        {group.effects.map((effect) => (
                                          <span
                                            key={`${effect.kind}-${effect.target}-${effect.label}-${effect.value}-${effect.duration || ''}-${effect.timing}-${effect.source}`}
                                            className={className}
                                          >
                                            {effect.label}
                                            {effect.value ? ` ${effect.value}` : ''}
                                            {effect.duration ? ` (${effect.duration})` : ''} · {effect.source}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span>없음</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="panel rosterPanel">
            <div className="sectionHeader">
              <div>
                <h2>니케 선택</h2>
              </div>
            </div>
            <div className="rosterFilters">
              <form className="searchRow" onSubmit={searchRoster}>
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="이름/기업/병과/코드/무기/스킬 검색"
                />
                <button type="submit" className="button">
                  검색
                </button>
                <button type="button" className="button ghost" onClick={clearRosterFilters}>
                  초기화
                </button>
              </form>
              <div className="filterGroup manufacturerFilterGroup">
                <span>제조사</span>
                <div className="filterButtons">
                  {manufacturers.map((manufacturer) => (
                    <button
                      key={manufacturer}
                      type="button"
                      className={`filterChip ${selectedManufacturers.includes(manufacturer) ? 'active' : ''}`}
                      aria-pressed={selectedManufacturers.includes(manufacturer)}
                      onClick={() => toggleFilterValue(setSelectedManufacturers, manufacturer)}
                    >
                      {manufacturer}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filterGroup">
                <span>무기</span>
                <div className="filterButtons">
                  {weapons.map((weapon) => (
                    <button
                      key={weapon}
                      type="button"
                      className={`filterChip ${selectedWeapons.includes(weapon) ? 'active' : ''}`}
                      aria-pressed={selectedWeapons.includes(weapon)}
                      onClick={() => toggleFilterValue(setSelectedWeapons, weapon)}
                    >
                      {weapon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filterGroup">
                <span>속성</span>
                <div className="filterButtons">
                  {codes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`filterChip ${selectedCodes.includes(code) ? 'active' : ''}`}
                      aria-pressed={selectedCodes.includes(code)}
                      onClick={() => toggleFilterValue(setSelectedCodes, code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filterGroup">
                <span>버스트</span>
                <div className="filterButtons">
                  {bursts.map((burst) => (
                    <button
                      key={burst}
                      type="button"
                      className={`filterChip ${selectedBursts.includes(burst) ? 'active' : ''}`}
                      aria-pressed={selectedBursts.includes(burst)}
                      onClick={() => toggleFilterValue(setSelectedBursts, burst)}
                    >
                      {burst}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="resultInfo">미선택 {filteredNikkes.filter((nikke) => !categoryUsedIds.has(nikke.id)).length} 니케</p>
            <ul className="tileList">{filteredNikkes.map((nikke) => renderNikkeCard(nikke, 'squad'))}</ul>
          </section>
        </div>
      {tooltip && (
        <div
          className="floatingTooltip"
          style={{
            '--tooltip-width': `${tooltip.width}px`,
            '--tooltip-font-size': `${tooltip.fontSize}px`,
          }}
        >
          {renderSkillTooltip(tooltip.nikke, 'skillTooltip visible')}
        </div>
      )}
    </main>
  );
}

export default App;
