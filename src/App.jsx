import { useMemo, useState } from 'react';

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
    imageUrl: 'https://placehold.co/360x240?text=CentI',
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

const emptyForm = {
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

  imageUrl: '',
};

function App() {
  const [nikkes, setNikkes] = useState(initialNikkes);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [squadIds, setSquadIds] = useState([1, 2, 3, 4]);
  const [screen, setScreen] = useState('squad');
  const [query, setQuery] = useState('');
  const [burstFilter, setBurstFilter] = useState('all');
  const [manageQuery, setManageQuery] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  const squad = useMemo(
    () => squadIds.map((id) => nikkes.find((nikke) => nikke.id === id)).filter(Boolean),
    [nikkes, squadIds],
  );

  const filteredNikkes = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return nikkes.filter((nikke) => {
      const matchesBurst = burstFilter === 'all' || nikke.burst === burstFilter;
      return matchesNikkeKeyword(nikke, keyword) && matchesBurst;
    });
  }, [burstFilter, nikkes, query]);

  const filteredManagedNikkes = useMemo(() => {
    const keyword = manageQuery.trim().toLowerCase();
    return nikkes.filter((nikke) => matchesNikkeKeyword(nikke, keyword));
  }, [manageQuery, nikkes]);

      const matchesQuery =
        !keyword ||
        nikke.name.toLowerCase().includes(keyword) ||
        nikke.manufacturer.toLowerCase().includes(keyword) ||
        nikke.classType.toLowerCase().includes(keyword) ||
        nikke.code.toLowerCase().includes(keyword) ||
        nikke.weapon.toLowerCase().includes(keyword);
      const matchesBurst = burstFilter === 'all' || nikke.burst === burstFilter;

      return matchesQuery && matchesBurst;
    });
  }, [burstFilter, nikkes, query]);

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

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submitNikke = (event) => {
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

    if (editingId) {
      setNikkes((prev) => prev.map((nikke) => (nikke.id === editingId ? { ...nikke, ...payload } : nikke)));
      resetForm();
      return;
    }

    setNikkes((prev) => [{ id: Date.now(), ...payload }, ...prev]);
    resetForm();
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
      imageUrl: nikke.imageUrl,
    });
  };

  const deleteNikke = (id) => {
    setNikkes((prev) => prev.filter((nikke) => nikke.id !== id));
    setSquadIds((prev) => prev.filter((squadId) => squadId !== id));

    if (editingId === id) {
      resetForm();
    }
  };

  const addToSquad = (id) => {
    setSquadIds((prev) => {
      if (prev.includes(id) || prev.length >= 5) {
        return prev;
      }

      return [...prev, id];
    });
  };

  const placeInSquad = (id, slotIndex) => {
    setSquadIds((prev) => {
      const withoutDragged = prev.filter((squadId) => squadId !== id);

      if (slotIndex >= withoutDragged.length) {
        return [...withoutDragged, id].slice(0, 5);
      }

      const next = [...withoutDragged];
      next.splice(slotIndex, 0, id);
      return next.slice(0, 5);
    });
  };

  const removeFromSquad = (id) => {
    setSquadIds((prev) => prev.filter((squadId) => squadId !== id));
  };

  const clearSquad = () => setSquadIds([]);

  const startDrag = (event, id) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(id));
    setDraggingId(id);
  };

  const dropOnSlot = (event, slotIndex) => {
    event.preventDefault();
    const droppedId = Number(event.dataTransfer.getData('text/plain') || draggingId);

    if (droppedId) {
      placeInSquad(droppedId, slotIndex);
    }

    setDraggingId(null);
    setDragOverSlot(null);
  };

  const renderSkillTooltip = (nikke) => (
    <div className="skillTooltip" role="tooltip">
      <strong>{nikke.name} 스킬</strong>
      <p><span>1스킬</span>{nikke.skill1 || '입력된 1스킬 정보가 없습니다.'}</p>
      <p><span>2스킬</span>{nikke.skill2 || '입력된 2스킬 정보가 없습니다.'}</p>
      <p><span>버스트</span>{nikke.burstSkill || '입력된 버스트 스킬 정보가 없습니다.'}</p>
    </div>
  );

  const renderNikkeImage = (nikke, className = 'portrait') => (
    <div className="imageTooltipWrap">
      <img
        className={className}
        draggable
        onDragStart={(event) => startDrag(event, nikke.id)}
        onDragEnd={() => setDraggingId(null)}
        src={nikke.imageUrl || 'https://placehold.co/360x240?text=NIKKE'}
        alt={`${nikke.name} 이미지`}
      />
      {renderSkillTooltip(nikke)}
    </div>
  );

  const renderNikkeCard = (nikke, mode = 'manage') => {
    const selected = squadIds.includes(nikke.id);

    return (
      <li key={nikke.id} className={`nikkeCard ${selected ? 'selected' : ''}`}>
        {renderNikkeImage(nikke)}
        <img
          className="portrait"
          src={nikke.imageUrl || 'https://placehold.co/360x240?text=NIKKE'}
          alt={`${nikke.name} 이미지`}
        />
        <div className="cardBody">
          <div className="titleRow">
            <strong>{nikke.name}</strong>
            <span className="badge rarity">{nikke.rarity}</span>
            <span className="badge">{nikke.burst}</span>
          </div>
          <p>{nikke.manufacturer} · {nikke.classType} · {nikke.code} · {nikke.weapon}</p>
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
          <p>니케 풀을 등록하고 5인 스쿼드를 구성하며 버스트/병과 균형을 확인하세요.</p>
        </div>
        <div className="summaryGrid" aria-label="스쿼드 요약">
          <span>보유 니케 <strong>{nikkes.length}</strong></span>
          <span>편성 인원 <strong>{squad.length}/5</strong></span>
          <span>SSR <strong>{nikkes.filter((nikke) => nikke.rarity === 'SSR').length}</strong></span>
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

      {screen === 'squad' ? (
        <>
          <section className="panel">
            <div className="sectionHeader">
              <div>
                <h2>현재 스쿼드</h2>
                <p>니케 이미지를 슬롯으로 드래그앤드롭해 최대 5명까지 편성할 수 있습니다.</p>
                <p>최대 5명까지 편성할 수 있습니다.</p>
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
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setDragOverSlot(index)}
                    onDragLeave={() => setDragOverSlot(null)}
                    onDrop={(event) => dropOnSlot(event, index)}
                  >
                    {nikke ? (
                      <>
                        {renderNikkeImage(nikke, 'slotImage')}
                  <div key={nikke?.id || `empty-${index}`} className={`slot ${nikke ? 'filled' : ''}`}>
                    {nikke ? (
                      <>
                        <img src={nikke.imageUrl || 'https://placehold.co/240x160?text=NIKKE'} alt={`${nikke.name} 이미지`} />
                        <strong>{nikke.name}</strong>
                        <span>{nikke.burst} · {nikke.classType}</span>
                        <button type="button" onClick={() => removeFromSquad(nikke.id)}>제거</button>
                      </>
                    ) : (
                      <span>여기로 드롭<br />빈 슬롯 {index + 1}</span>
                      <span>빈 슬롯 {index + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="analysisGrid">
              <div>
                <h3>버스트 분포</h3>
                {bursts.map((burst) => (
                  <p key={burst}>{burst}: {squadAnalysis.burstCounts[burst]}명</p>
                ))}
              </div>
              <div>
                <h3>병과 분포</h3>
                {classes.map((classType) => (
                  <p key={classType}>{classType}: {squadAnalysis.classCounts[classType]}명</p>
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
          </section>

          <section className="panel">
            <div className="sectionHeader">
              <div>
                <h2>니케 선택</h2>
                <p>이미지를 스쿼드 슬롯으로 드래그하거나 버튼으로 편성하세요.</p>
                <p>검색과 버스트 필터로 편성 후보를 좁혀보세요.</p>
              </div>
            </div>
            <div className="filters">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름/기업/병과/코드/무기/스킬 검색"
                placeholder="이름/기업/병과/코드/무기 검색"
              />
              <select value={burstFilter} onChange={(event) => setBurstFilter(event.target.value)}>
                <option value="all">전체 버스트</option>
                {bursts.map((burst) => <option key={burst}>{burst}</option>)}
              </select>
            </div>
            <p className="resultInfo">후보 {filteredNikkes.length}명</p>
            <ul className="cardList">{filteredNikkes.map((nikke) => renderNikkeCard(nikke, 'squad'))}</ul>
          </section>
        </>
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
                  {rarities.map((rarity) => <option key={rarity}>{rarity}</option>)}
                </select>
              </label>
              <label>
                기업
                <select name="manufacturer" value={form.manufacturer} onChange={updateForm}>
                  {manufacturers.map((manufacturer) => <option key={manufacturer}>{manufacturer}</option>)}
                </select>
              </label>
              <label>
                병과
                <select name="classType" value={form.classType} onChange={updateForm}>
                  {classes.map((classType) => <option key={classType}>{classType}</option>)}
                </select>
              </label>
              <label>
                버스트
                <select name="burst" value={form.burst} onChange={updateForm}>
                  {bursts.map((burst) => <option key={burst}>{burst}</option>)}
                </select>
              </label>
              <label>
                코드
                <select name="code" value={form.code} onChange={updateForm}>
                  {codes.map((code) => <option key={code}>{code}</option>)}
                </select>
              </label>
              <label>
                무기
                <select name="weapon" value={form.weapon} onChange={updateForm}>
                  {weapons.map((weapon) => <option key={weapon}>{weapon}</option>)}
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
                <input
                  name="skill1"
                  value={form.skill1}
                  onChange={updateForm}
                  placeholder="1스킬 효과를 입력하세요"
                />
              </label>
              <label className="full">
                2스킬
                <input
                  name="skill2"
                  value={form.skill2}
                  onChange={updateForm}
                  placeholder="2스킬 효과를 입력하세요"
                />
              </label>
              <label className="full">
                버스트 스킬
                <input
                  name="burstSkill"
                  value={form.burstSkill}
                  onChange={updateForm}
                  placeholder="버스트 스킬 효과를 입력하세요"
                />
              </label>
              <label className="full">
                이미지 URL
                <input name="imageUrl" value={form.imageUrl} onChange={updateForm} placeholder="https://..." />
              </label>
              <div className="actions full">
                <button type="submit" className="button primary">{editingId ? '수정 저장' : '니케 추가'}</button>
                {editingId && <button type="button" className="button ghost" onClick={resetForm}>수정 취소</button>}
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="sectionHeader">
              <div>
                <h2>등록된 니케</h2>
                <p>검색어는 니케명, 기업, 병과, 코드, 무기, 버스트, 스킬 정보에 적용됩니다.</p>
              </div>
            </div>
            <div className="filters single">
              <input
                value={manageQuery}
                onChange={(event) => setManageQuery(event.target.value)}
                placeholder="등록된 니케 검색"
              />
            </div>
            <p className="resultInfo">검색 결과 {filteredManagedNikkes.length}명</p>
            <ul className="cardList">{filteredManagedNikkes.map((nikke) => renderNikkeCard(nikke, 'manage'))}</ul>
            <h2>등록된 니케</h2>
            <ul className="cardList">{nikkes.map((nikke) => renderNikkeCard(nikke, 'manage'))}</ul>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
