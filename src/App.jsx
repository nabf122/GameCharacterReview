import { useEffect, useMemo, useState } from 'react';

const manufacturers = ['엘리시온', '미실리스', '테트라', '필그림', '어브노멀'];
const classes = ['화력형', '방어형', '지원형'];
const bursts = ['버스트 I', '버스트 II', '버스트 III'];
const codes = ['작열', '수냉', '전격', '철갑', '풍압'];
const weapons = ['AR', 'SMG', 'MG', 'SG', 'SR', 'RL'];
const rarities = ['SSR', 'SR', 'R'];

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
  code: codes[0],
  weapon: weapons[0],
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
  { key: 'damageTakenUp', label: '받는 대미지 증가', kind: 'debuff' },
];

const effectTypeMap = Object.fromEntries(buffEffectTypes.map((type) => [type.key, type]));
const skillOptions = ['1스킬', '2스킬', '버스트'];
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
    nikke.burst,
    nikke.squadRole,
    nikke.skill1,
    nikke.skill2,
    nikke.burstSkill,
    ...(nikke.buffEffects || []).map((effect) => `${effectTypeMap[effect.type]?.label || effect.type} ${effect.value || ''} ${effect.note || ''}`),
  ]
    .join(' ')
    .toLowerCase()
    .includes(keyword);
};

const createBuffBucket = () => ({
  total: 0,
  percentTotal: 0,
  sources: [],
});

const createEmptyEffect = () => ({
  id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  skill: skillOptions[0],
  target: 'ally',
  type: buffEffectTypes[0].key,
  value: '',
  note: '',
});

function App() {
  const [nikkes, setNikkes] = useState([]);
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [squadIds, setSquadIds] = useState([]);
  const [screen, setScreen] = useState('squad');
  const [query, setQuery] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [selectedRarities, setSelectedRarities] = useState([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [selectedBursts, setSelectedBursts] = useState([]);
  const [manageQuery, setManageQuery] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [importingSkills, setImportingSkills] = useState(false);
  const [importingDildoro, setImportingDildoro] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState('');

  useEffect(() => {
    const loadNikkes = async () => {
      try {
        setLoading(true);
        const [loadedNikkes, loadedSquadIds] = await Promise.all([requestJson('/nikkes'), requestJson('/squad')]);
        setNikkes(loadedNikkes);
        setSquadIds(loadedSquadIds);
        setApiError('');
      } catch (error) {
        setNikkes(initialNikkes);
        setSquadIds([1, 2, 3, 4]);
        setApiError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadNikkes();
  }, []);

  const squad = useMemo(
    () => squadIds.map((id) => nikkes.find((nikke) => nikke.id === id)).filter(Boolean),
    [nikkes, squadIds],
  );

  const filteredNikkes = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return nikkes.filter((nikke) => {
      const matchesRarity = !selectedRarities.length || selectedRarities.includes(nikke.rarity);
      const matchesManufacturer = !selectedManufacturers.length || selectedManufacturers.includes(nikke.manufacturer);
      const matchesCode = !selectedCodes.length || selectedCodes.includes(nikke.code);
      const matchesBurst = !selectedBursts.length || selectedBursts.includes(nikke.burst);

      return matchesRarity && matchesManufacturer && matchesCode && matchesBurst && matchesNikkeKeyword(nikke, keyword);
    });
  }, [nikkes, query, selectedBursts, selectedCodes, selectedManufacturers, selectedRarities]);

  const filteredManagedNikkes = useMemo(() => {
    const keyword = manageQuery.trim().toLowerCase();
    return nikkes.filter((nikke) => matchesNikkeKeyword(nikke, keyword));
  }, [manageQuery, nikkes]);

  const squadAnalysis = useMemo(() => {
    const burstCounts = bursts.reduce((counts, burst) => {
      counts[burst] = squad.filter((nikke) => nikke.burst === burst).length;
      return counts;
    }, {});

    const classCounts = classes.reduce((counts, classType) => {
      counts[classType] = squad.filter((nikke) => nikke.classType === classType).length;
      return counts;
    }, {});

    const checks = [
      { label: '5명 편성', passed: squad.length === 5 },
      { label: '버스트 I 포함', passed: burstCounts['버스트 I'] > 0 },
      { label: '버스트 II 포함', passed: burstCounts['버스트 II'] > 0 },
      { label: '버스트 III 포함', passed: burstCounts['버스트 III'] > 0 },
      { label: '화력형 2명 이상', passed: classCounts['화력형'] >= 2 },
      { label: '지원형 또는 방어형 포함', passed: classCounts['지원형'] + classCounts['방어형'] > 0 },
    ];

    return { burstCounts, classCounts, checks };
  }, [squad]);

  const squadBuffAnalysis = useMemo(() => {
    const summary = {
      ally: {},
      self: {},
      debuff: {},
      allyTotal: 0,
      selfTotal: 0,
      debuffTotal: 0,
    };

    buffEffectTypes.forEach((type) => {
      const bucket = { ...createBuffBucket(), label: type.label };
      if (type.kind === 'debuff') {
        summary.debuff[type.key] = bucket;
        return;
      }

      summary.ally[type.key] = { ...bucket };
      summary.self[type.key] = { ...bucket };
    });

    squad.forEach((nikke) => {
      (nikke.buffEffects || []).forEach((effect) => {
        const type = effectTypeMap[effect.type];
        if (!type) {
          return;
        }

        const group = type.kind === 'debuff' ? 'debuff' : effect.target === 'self' ? 'self' : 'ally';
        const bucket = summary[group][type.key];
        if (!bucket) {
          return;
        }

        const value = Number.parseFloat(effect.value) || 0;
        bucket.total += 1;
        bucket.percentTotal += value;
        bucket.sources.push({
          source: `${nikke.name} · ${effect.skill || '스킬'}`,
          text: `${type.label} ${value || 0}%${effect.note ? ` · ${effect.note}` : ''}`,
          percentTotal: value,
        });

        if (group === 'ally') {
          summary.allyTotal += 1;
        } else if (group === 'self') {
          summary.selfTotal += 1;
        } else {
          summary.debuffTotal += 1;
        }
      });
    });

    return {
      ...summary,
      allyEntries: Object.values(summary.ally).filter((entry) => entry.total > 0),
      selfEntries: Object.values(summary.self).filter((entry) => entry.total > 0),
      debuffEntries: Object.values(summary.debuff).filter((entry) => entry.total > 0),
    };
  }, [squad]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleFilterValue = (setter, value) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const clearRosterFilters = () => {
    setQuery('');
    setQueryInput('');
    setSelectedRarities([]);
    setSelectedManufacturers([]);
    setSelectedCodes([]);
    setSelectedBursts([]);
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
      code: form.code,
      weapon: form.weapon,
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
    setScreen('manage');
    setEditingId(nikke.id);
    setImageUploadMessage('');
    setForm({
      name: nikke.name,
      rarity: nikke.rarity,
      manufacturer: nikke.manufacturer,
      classType: nikke.classType,
      burst: nikke.burst,
      code: nikke.code,
      weapon: nikke.weapon,
      squadRole: nikke.squadRole,
      skill1: nikke.skill1 || '',
      skill2: nikke.skill2 || '',
      burstSkill: nikke.burstSkill || '',
      buffEffects: Array.isArray(nikke.buffEffects) ? nikke.buffEffects : [],
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

  const saveSquadIds = async (nextIds) => {
    setSquadIds(nextIds);

    try {
      const savedIds = await requestJson('/squad', {
        method: 'PUT',
        body: JSON.stringify({ ids: nextIds }),
      });
      setSquadIds(savedIds);
      setApiError('');
    } catch (error) {
      setApiError(error.message);
    }
  };

  const deleteNikke = async (id) => {
    try {
      await requestJson(`/nikkes/${id}`, { method: 'DELETE' });
      setNikkes((prev) => prev.filter((nikke) => nikke.id !== id));
      setSquadIds((prev) => prev.filter((squadId) => squadId !== id));
      setApiError('');
    } catch (error) {
      setApiError(error.message);
    }

    if (editingId === id) {
      resetForm();
    }
  };

  const addToSquad = (id) => {
    if (squadIds.includes(id) || squadIds.length >= 5) {
      return;
    }

    saveSquadIds([...squadIds, id]);
  };

  const placeInSquad = (id, slotIndex) => {
    const withoutDragged = squadIds.filter((squadId) => squadId !== id);

    if (slotIndex >= withoutDragged.length) {
      saveSquadIds([...withoutDragged, id].slice(0, 5));
      return;
    }

    const next = [...withoutDragged];
    next.splice(slotIndex, 0, id);
    saveSquadIds(next.slice(0, 5));
  };

  const removeFromSquad = (id) => {
    saveSquadIds(squadIds.filter((squadId) => squadId !== id));
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

  const importDildoroData = async () => {
    try {
      setImportingDildoro(true);
      setImportMessage('');
      const result = await requestJson('/import/dildoro', { method: 'POST' });
      setNikkes(result.nikkes);
      setApiError('');
      setImportMessage(
        `Dildoro SSR ${result.total}명 적용 완료: 신규 ${result.created}명, 업데이트 ${result.updated}명, 제외 ${result.skipped}명`,
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

  const dropOnSlot = (event, slotIndex) => {
    event.preventDefault();
    const droppedId = Number(
      event.dataTransfer.getData('application/x-nikke-id') || event.dataTransfer.getData('text/plain') || draggingId,
    );

    if (droppedId && nikkes.some((nikke) => nikke.id === droppedId)) {
      placeInSquad(droppedId, slotIndex);
    }

    setDraggingId(null);
    setDragOverSlot(null);
  };

  const handleSlotDragOver = (event, slotIndex) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slotIndex);
  };

  const toggleSquadSelection = (id) => {
    if (squadIds.includes(id)) {
      removeFromSquad(id);
      return;
    }

    addToSquad(id);
  };

  const showTooltip = (event, nikke) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = Math.min(380, viewportWidth - 24);
    const tooltipHeight = Math.min(420, viewportHeight - 24);
    const x = Math.min(Math.max(rect.left + rect.width / 2, tooltipWidth / 2 + 12), viewportWidth - tooltipWidth / 2 - 12);
    const showAbove = rect.bottom + tooltipHeight > viewportHeight && rect.top > tooltipHeight;

    setTooltip({
      nikke,
      x,
      y: showAbove ? Math.max(12, rect.top - 8) : Math.min(rect.bottom + 8, viewportHeight - 12),
      placement: showAbove ? 'top' : 'bottom',
    });
  };

  const hideTooltip = () => setTooltip(null);

  const renderSkillTooltip = (nikke, className = 'skillTooltip') => (
    <div className={className} role="tooltip">
      <strong>{nikke.name}</strong>
      {skillTextFields.some((field) => nikke[field.name]) ? (
        skillTextFields.map((field) =>
          nikke[field.name] ? (
            <p key={field.name}>
              <span>{field.label}</span>
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
  );

  const renderNikkeImage = (nikke, className = 'portrait', imageSource = nikke.fullImageUrl || nikke.imageUrl) => (
    <div
      className={`imageTooltipWrap ${className === 'tileImage' ? 'faceImageWrap' : ''}`}
      onMouseEnter={(event) => showTooltip(event, nikke)}
      onMouseMove={(event) => showTooltip(event, nikke)}
      onMouseLeave={hideTooltip}
      onFocus={(event) => showTooltip(event, nikke)}
      onBlur={hideTooltip}
    >
      <img
        className={className}
        draggable
        onDragStart={(event) => startDrag(event, nikke.id)}
        onDragEnd={() => setDraggingId(null)}
        src={imageSource || nikke.faceImageUrl || 'https://placehold.co/360x240?text=NIKKE'}
        alt={`${nikke.name} 이미지`}
      />
      <div className="imageInfoOverlay" aria-hidden="true">
        <strong>{nikke.name}</strong>
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
    const cardDragProps = {
      draggable: true,
      onDragStart: (event) => startDrag(event, nikke.id),
      onDragEnd: () => {
        setDraggingId(null);
        setDragOverSlot(null);
      },
    };

    if (mode === 'squad') {
      return (
        <li
          key={nikke.id}
          className={`nikkeTile ${selected ? 'selected' : ''} ${draggingId === nikke.id ? 'dragging' : ''}`}
          aria-label={`${nikke.name} 편성 후보`}
          onClick={() => toggleSquadSelection(nikke.id)}
          {...cardDragProps}
        >
          {renderNikkeImage(nikke, 'tileImage', nikke.faceImageUrl || nikke.imageUrl || nikke.fullImageUrl)}
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
            <strong>{nikke.name}</strong>
            <span className="badge rarity">{nikke.rarity}</span>
            <span className="badge">{nikke.burst}</span>
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

      <nav className="screenTabs" aria-label="화면 전환">
        <button type="button" className={`tab ${screen === 'squad' ? 'active' : ''}`} onClick={() => setScreen('squad')}>
          스쿼드 구성
        </button>
        <button type="button" className={`tab ${screen === 'manage' ? 'active' : ''}`} onClick={() => setScreen('manage')}>
          니케 관리
        </button>
      </nav>

      {(loading || apiError) && (
        <div className={`apiStatus ${apiError ? 'error' : ''}`}>
          {loading ? 'DB에서 니케 정보를 불러오는 중입니다.' : `API 오류: ${apiError}`}
        </div>
      )}

      {screen === 'squad' ? (
        <div className="squadWorkspace">
          <section className="panel squadPanel">
            <div className="sectionHeader">
              <div>
                <h2>현재 스쿼드</h2>
              </div>
              <button type="button" className="button ghost" onClick={clearSquad} disabled={!squad.length}>
                스쿼드 비우기
              </button>
            </div>

            <div className="squadSlots">
              {Array.from({ length: 5 }).map((_, index) => {
                const nikke = squad[index];

                return (
                  <div
                    key={nikke?.id || `empty-${index}`}
                    className={`slot ${nikke ? 'filled' : ''} ${dragOverSlot === index ? 'dragOver' : ''}`}
                    onDragOver={(event) => handleSlotDragOver(event, index)}
                    onDragEnter={() => setDragOverSlot(index)}
                    onDragLeave={() => setDragOverSlot(null)}
                    onDrop={(event) => dropOnSlot(event, index)}
                  >
                    {nikke ? (
                      <>
                        {renderNikkeImage(nikke, 'slotImage')}
                        <button type="button" onClick={() => removeFromSquad(nikke.id)}>
                          제거
                        </button>
                      </>
                    ) : (
                      <span>
                        여기로 드롭
                        <br />
                        빈 슬롯 {index + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="analysisGrid">
              <div>
                <h3>버스트 분포</h3>
                {bursts.map((burst) => (
                  <p key={burst}>
                    {burst}: {squadAnalysis.burstCounts[burst]}명
                  </p>
                ))}
              </div>
              <div>
                <h3>병과 분포</h3>
                {classes.map((classType) => (
                  <p key={classType}>
                    {classType}: {squadAnalysis.classCounts[classType]}명
                  </p>
                ))}
              </div>
              <div>
                <h3>구성 체크</h3>
                {squadAnalysis.checks.map((check) => (
                  <p key={check.label} className={check.passed ? 'passed' : 'failed'}>
                    {check.passed ? '✓' : '•'} {check.label}
                  </p>
                ))}
              </div>
            </div>

            <div className="buffSummary">
              <div className="buffHeader">
                <h3>버프 총합</h3>
                <span>
                  아군 {squadBuffAnalysis.allyTotal}개 · 자기 {squadBuffAnalysis.selfTotal}개 · 디버프{' '}
                  {squadBuffAnalysis.debuffTotal}개
                </span>
              </div>
              <div className="buffColumns">
                <div>
                  <strong>아군 버프</strong>
                  {squadBuffAnalysis.allyEntries.length ? (
                    squadBuffAnalysis.allyEntries.map((entry) => (
                      <details key={`ally-${entry.label}`} className="buffItem">
                        <summary>
                          {entry.label}
                          <span>{entry.percentTotal ? `${entry.percentTotal}% / ${entry.total}개` : `${entry.total}개`}</span>
                        </summary>
                        {entry.sources.map((source, index) => (
                          <p key={`${source.source}-${index}`}>
                            <b>{source.source}</b>
                            {source.text}
                          </p>
                        ))}
                      </details>
                    ))
                  ) : (
                    <p className="emptyBuff">아군 대상 버프 효과가 없습니다.</p>
                  )}
                </div>
                <div>
                  <strong>자기 강화</strong>
                  {squadBuffAnalysis.selfEntries.length ? (
                    squadBuffAnalysis.selfEntries.map((entry) => (
                      <details key={`self-${entry.label}`} className="buffItem">
                        <summary>
                          {entry.label}
                          <span>{entry.percentTotal ? `${entry.percentTotal}% / ${entry.total}개` : `${entry.total}개`}</span>
                        </summary>
                        {entry.sources.map((source, index) => (
                          <p key={`${source.source}-${index}`}>
                            <b>{source.source}</b>
                            {source.text}
                          </p>
                        ))}
                      </details>
                    ))
                  ) : (
                    <p className="emptyBuff">자기 강화 효과가 없습니다.</p>
                  )}
                </div>
                <div>
                  <strong>적 디버프</strong>
                  {squadBuffAnalysis.debuffEntries.length ? (
                    squadBuffAnalysis.debuffEntries.map((entry) => (
                      <details key={`debuff-${entry.label}`} className="buffItem">
                        <summary>
                          {entry.label}
                          <span>{entry.percentTotal ? `${entry.percentTotal}% / ${entry.total}개` : `${entry.total}개`}</span>
                        </summary>
                        {entry.sources.map((source, index) => (
                          <p key={`${source.source}-${index}`}>
                            <b>{source.source}</b>
                            {source.text}
                          </p>
                        ))}
                      </details>
                    ))
                  ) : (
                    <p className="emptyBuff">적 대상 디버프 효과가 없습니다.</p>
                  )}
                </div>
              </div>
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
              <div className="filterGroup">
                <span>등급</span>
                <div className="filterButtons">
                  {rarities.map((rarity) => (
                    <button
                      key={rarity}
                      type="button"
                      className={`filterChip ${selectedRarities.includes(rarity) ? 'active' : ''}`}
                      aria-pressed={selectedRarities.includes(rarity)}
                      onClick={() => toggleFilterValue(setSelectedRarities, rarity)}
                    >
                      {rarity}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filterGroup">
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
            <p className="resultInfo">후보 {filteredNikkes.length}명</p>
            <ul className="tileList">{filteredNikkes.map((nikke) => renderNikkeCard(nikke, 'squad'))}</ul>
          </section>
        </div>
      ) : (
        <>
          <section className="panel">
            <h2>{editingId ? '니케 정보 수정' : '니케 등록'}</h2>
            <form className="form" onSubmit={submitNikke}>
              <label>
                니케명
                <input name="name" value={form.name} onChange={updateForm} placeholder="예: 앨리스" required />
              </label>
              <label>
                등급
                <select name="rarity" value={form.rarity} onChange={updateForm}>
                  {rarities.map((rarity) => (
                    <option key={rarity}>{rarity}</option>
                  ))}
                </select>
              </label>
              <label>
                기업
                <select name="manufacturer" value={form.manufacturer} onChange={updateForm}>
                  {manufacturers.map((manufacturer) => (
                    <option key={manufacturer}>{manufacturer}</option>
                  ))}
                </select>
              </label>
              <label>
                병과
                <select name="classType" value={form.classType} onChange={updateForm}>
                  {classes.map((classType) => (
                    <option key={classType}>{classType}</option>
                  ))}
                </select>
              </label>
              <label>
                버스트
                <select name="burst" value={form.burst} onChange={updateForm}>
                  {bursts.map((burst) => (
                    <option key={burst}>{burst}</option>
                  ))}
                </select>
              </label>
              <label>
                코드
                <select name="code" value={form.code} onChange={updateForm}>
                  {codes.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
              <label>
                무기
                <select name="weapon" value={form.weapon} onChange={updateForm}>
                  {weapons.map((weapon) => (
                    <option key={weapon}>{weapon}</option>
                  ))}
                </select>
              </label>
              <label className="full">
                스쿼드 역할/메모
                <input
                  name="squadRole"
                  value={form.squadRole}
                  onChange={updateForm}
                  placeholder="예: 버스트 쿨타임 감소, 메인 딜러, 보호막 지원"
                  required
                />
              </label>
              <div className="effectEditor full">
                <div className="effectEditorHeader">
                  <strong>버프/디버프 효과</strong>
                  <button type="button" className="button small" onClick={addEffect}>
                    효과 추가
                  </button>
                </div>
                {form.buffEffects.length ? (
                  form.buffEffects.map((effect) => {
                    const selectedType = effectTypeMap[effect.type];
                    const isDebuff = selectedType?.kind === 'debuff';
                    return (
                      <div key={effect.id} className="effectRow">
                        <label>
                          스킬
                          <select value={effect.skill} onChange={(event) => updateEffect(effect.id, 'skill', event.target.value)}>
                            {skillOptions.map((skill) => (
                              <option key={skill}>{skill}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          대상
                          <select
                            value={isDebuff ? 'enemy' : effect.target}
                            onChange={(event) => updateEffect(effect.id, 'target', event.target.value)}
                            disabled={isDebuff}
                          >
                            {targetOptions.map((target) => (
                              <option key={target.value} value={target.value}>
                                {target.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          효과 종류
                          <select value={effect.type} onChange={(event) => updateEffect(effect.id, 'type', event.target.value)}>
                            {buffEffectTypes.map((type) => (
                              <option key={type.key} value={type.key}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          수치(%)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={effect.value}
                            onChange={(event) => updateEffect(effect.id, 'value', event.target.value)}
                            placeholder="예: 66"
                          />
                        </label>
                        <label>
                          메모
                          <input
                            value={effect.note || ''}
                            onChange={(event) => updateEffect(effect.id, 'note', event.target.value)}
                            placeholder="조건/유지 시간"
                          />
                        </label>
                        <button type="button" className="button danger small effectRemove" onClick={() => removeEffect(effect.id)}>
                          삭제
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="emptyBuff">입력된 효과가 없습니다. 효과 추가를 눌러 버프/디버프 수치를 등록하세요.</p>
                )}
              </div>
              <details className="skillTextEditor full">
                <summary>원문 스킬 메모</summary>
                <div className="skillTextGrid">
                  {skillTextFields.map((field) => (
                    <label key={field.name}>
                      {field.label}
                      <textarea
                        name={field.name}
                        value={form[field.name]}
                        onChange={updateForm}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <label className="full">
                이미지 URL 또는 업로드 경로
                <input name="imageUrl" value={form.imageUrl} onChange={updateForm} placeholder="https://... 또는 /uploads/name.png" />
              </label>
              <div className="imageUpload full">
                <label>
                  캐릭터 이미지 파일
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadCharacterImage} disabled={uploadingImage} />
                </label>
                {form.imageUrl && (
                  <img className="imagePreview" src={form.imageUrl} alt="업로드 이미지 미리보기" />
                )}
                <span>{uploadingImage ? '업로드 중...' : imageUploadMessage || 'JPG, PNG, WebP, GIF 파일을 저장할 수 있습니다.'}</span>
              </div>
              <div className="actions full">
                <button type="submit" className="button primary">
                  {editingId ? '수정 저장' : '니케 추가'}
                </button>
                {editingId && (
                  <button type="button" className="button ghost" onClick={resetForm}>
                    수정 취소
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="sectionHeader">
              <div>
                <h2>등록된 니케</h2>
                <p>검색어는 니케명, 기업, 병과, 코드, 무기, 버스트, 스킬 정보에 적용됩니다.</p>
              </div>
              <div className="importActions">
                <button type="button" className="button" onClick={importDildoroData} disabled={importingDildoro || importingSkills}>
                  {importingDildoro ? '적용 중...' : 'Dildoro SSR 적용'}
                </button>
                <button type="button" className="button ghost" onClick={importSsrSkillsFromNamuWiki} disabled={importingSkills || importingDildoro}>
                  {importingSkills ? '가져오는 중...' : '나무위키 원문 스킬 가져오기'}
                </button>
              </div>
            </div>
            {importMessage && <p className="importMessage">{importMessage}</p>}
            <div className="filters single">
              <input value={manageQuery} onChange={(event) => setManageQuery(event.target.value)} placeholder="등록된 니케 검색" />
            </div>
            <p className="resultInfo">검색 결과 {filteredManagedNikkes.length}명</p>
            <ul className="cardList">{filteredManagedNikkes.map((nikke) => renderNikkeCard(nikke, 'manage'))}</ul>
          </section>
        </>
      )}
      {tooltip && (
        <div
          className={`floatingTooltip ${tooltip.placement === 'top' ? 'above' : ''}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {renderSkillTooltip(tooltip.nikke, 'skillTooltip visible')}
        </div>
      )}
    </main>
  );
}

export default App;
