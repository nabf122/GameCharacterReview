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
  imageUrl: '',
});

const API_BASE = '/api';

const buffCategories = [
  { key: 'attack', label: '공격/화력', keywords: ['공격력', '공격', '화력', '대미지', '데미지', '피해량', '주는 피해'] },
  { key: 'crit', label: '크리티컬', keywords: ['크리티컬', '치명타', '크확', '크뎀'] },
  { key: 'hit', label: '명중', keywords: ['명중'] },
  { key: 'ammo', label: '장탄/탄환', keywords: ['장탄', '탄환', '탄창', '최대 장탄'] },
  { key: 'reload', label: '재장전', keywords: ['재장전', '장전'] },
  { key: 'burst', label: '버스트 회전', keywords: ['버스트 게이지', '버스트 쿨타임', '쿨타임 감소', '풀 버스트', '쿨타임'] },
  { key: 'shield', label: '보호막', keywords: ['보호막', '배리어'] },
  { key: 'recover', label: '회복', keywords: ['회복', '체력 회복', '치유'] },
  { key: 'defense', label: '방어/피해 감소', keywords: ['방어', '피해 감소', '받는 피해', '피해를 완화', '엄폐물'] },
  { key: 'speed', label: '속도/차지', keywords: ['차지', '공격 속도', '속도'] },
];

const allyTargetWords = ['아군', '아군 전체', '전체', '스쿼드', '팀', '동료', '파티'];
const selfTargetWords = ['자신', '자기', '본인', '자신의', '자신에게'];
const skillLabels = [
  ['skill1', '1스킬'],
  ['skill2', '2스킬'],
  ['burstSkill', '버스트'],
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
  ]
    .join(' ')
    .toLowerCase()
    .includes(keyword);
};

const extractPercentTotal = (text) => {
  const matches = text.match(/\d+(?:\.\d+)?\s*%/g) || [];
  return matches.reduce((total, match) => total + Number.parseFloat(match), 0);
};

const createBuffBucket = () => ({
  total: 0,
  withPercent: 0,
  percentTotal: 0,
  sources: [],
});

const detectSkillBuffs = (nikke, skillLabel, text) => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const targets = [];
  if (allyTargetWords.some((word) => normalizedText.includes(word))) {
    targets.push('ally');
  }
  if (selfTargetWords.some((word) => normalizedText.includes(word))) {
    targets.push('self');
  }

  const matchedCategories = buffCategories.filter((category) =>
    category.keywords.some((keyword) => normalizedText.includes(keyword)),
  );

  if (!targets.length || !matchedCategories.length) {
    return [];
  }

  const percentTotal = extractPercentTotal(normalizedText);
  return targets.flatMap((target) =>
    matchedCategories.map((category) => ({
      target,
      category,
      percentTotal,
      source: `${nikke.name} · ${skillLabel}`,
      text: normalizedText,
    })),
  );
};

function App() {
  const [nikkes, setNikkes] = useState([]);
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [squadIds, setSquadIds] = useState([]);
  const [screen, setScreen] = useState('squad');
  const [query, setQuery] = useState('');
  const [burstFilter, setBurstFilter] = useState('all');
  const [manageQuery, setManageQuery] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [importingSkills, setImportingSkills] = useState(false);
  const [importMessage, setImportMessage] = useState('');

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
      const matchesBurst = burstFilter === 'all' || nikke.burst === burstFilter;
      return matchesBurst && matchesNikkeKeyword(nikke, keyword);
    });
  }, [burstFilter, nikkes, query]);

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
      allyTotal: 0,
      selfTotal: 0,
    };

    buffCategories.forEach((category) => {
      summary.ally[category.key] = { ...createBuffBucket(), label: category.label };
      summary.self[category.key] = { ...createBuffBucket(), label: category.label };
    });

    squad.forEach((nikke) => {
      skillLabels.forEach(([field, skillLabel]) => {
        detectSkillBuffs(nikke, skillLabel, nikke[field] || '').forEach((buff) => {
          const bucket = summary[buff.target][buff.category.key];
          bucket.total += 1;
          bucket.sources.push({
            source: buff.source,
            text: buff.text,
            percentTotal: buff.percentTotal,
          });

          if (buff.percentTotal > 0) {
            bucket.withPercent += 1;
            bucket.percentTotal += buff.percentTotal;
          }

          if (buff.target === 'ally') {
            summary.allyTotal += 1;
          } else {
            summary.selfTotal += 1;
          }
        });
      });
    });

    return {
      ...summary,
      allyEntries: Object.values(summary.ally).filter((entry) => entry.total > 0),
      selfEntries: Object.values(summary.self).filter((entry) => entry.total > 0),
    };
  }, [squad]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
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
      imageUrl: form.imageUrl.trim(),
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
      imageUrl: nikke.imageUrl || '',
    });
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
    const x = Math.min(Math.max(rect.left + rect.width / 2, 180), viewportWidth - 180);
    const showAbove = rect.bottom + 280 > viewportHeight && rect.top > 280;

    setTooltip({
      nikke,
      x,
      y: showAbove ? rect.top - 8 : rect.bottom + 8,
      placement: showAbove ? 'top' : 'bottom',
    });
  };

  const hideTooltip = () => setTooltip(null);

  const renderSkillTooltip = (nikke, className = 'skillTooltip') => (
    <div className={className} role="tooltip">
      <strong>{nikke.name}</strong>
      <p>
        <span>정보</span>
        {nikke.rarity} · {nikke.manufacturer} · {nikke.classType} · {nikke.burst} · {nikke.code} · {nikke.weapon}
      </p>
      <p>
        <span>역할</span>
        {nikke.squadRole || '입력된 역할 정보가 없습니다.'}
      </p>
      <p>
        <span>1스킬</span>
        {nikke.skill1 || '입력된 1스킬 정보가 없습니다.'}
      </p>
      <p>
        <span>2스킬</span>
        {nikke.skill2 || '입력된 2스킬 정보가 없습니다.'}
      </p>
      <p>
        <span>버스트</span>
        {nikke.burstSkill || '입력된 버스트 스킬 정보가 없습니다.'}
      </p>
    </div>
  );

  const renderNikkeImage = (nikke, className = 'portrait') => (
    <div
      className="imageTooltipWrap"
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
        src={nikke.imageUrl || 'https://placehold.co/360x240?text=NIKKE'}
        alt={`${nikke.name} 이미지`}
      />
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
          {renderNikkeImage(nikke, 'tileImage')}
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
                        <strong>{nikke.name}</strong>
                        <span>
                          {nikke.burst} · {nikke.classType}
                        </span>
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
                  아군 {squadBuffAnalysis.allyTotal}개 · 자기 강화 {squadBuffAnalysis.selfTotal}개
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
                    <p className="emptyBuff">아군 대상 버프 키워드가 없습니다.</p>
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
                    <p className="emptyBuff">자기 강화 키워드가 없습니다.</p>
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
            <div className="filters">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름/기업/병과/코드/무기/스킬 검색"
              />
              <select value={burstFilter} onChange={(event) => setBurstFilter(event.target.value)}>
                <option value="all">전체 버스트</option>
                {bursts.map((burst) => (
                  <option key={burst}>{burst}</option>
                ))}
              </select>
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
              <label className="full">
                1스킬
                <textarea
                  name="skill1"
                  value={form.skill1}
                  onChange={updateForm}
                  placeholder="1스킬 효과를 입력하세요"
                  rows={3}
                />
              </label>
              <label className="full">
                2스킬
                <textarea
                  name="skill2"
                  value={form.skill2}
                  onChange={updateForm}
                  placeholder="2스킬 효과를 입력하세요"
                  rows={3}
                />
              </label>
              <label className="full">
                버스트 스킬
                <textarea
                  name="burstSkill"
                  value={form.burstSkill}
                  onChange={updateForm}
                  placeholder="버스트 스킬 효과를 입력하세요"
                  rows={3}
                />
              </label>
              <label className="full">
                이미지 URL
                <input name="imageUrl" value={form.imageUrl} onChange={updateForm} placeholder="https://..." />
              </label>
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
              <button type="button" className="button" onClick={importSsrSkillsFromNamuWiki} disabled={importingSkills}>
                {importingSkills ? '가져오는 중...' : '나무위키 SSR 스킬 가져오기'}
              </button>
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
