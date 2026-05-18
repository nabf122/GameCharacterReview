import { useMemo, useState } from 'react';

const initialDolls = [
  {
    id: 1,
    dollName: '토로로',
    star: '5',
    affiliation: '그리폰',
    position: '돌격',
    element: '물리',
    recommendedWeapon: '돌격소총(AR)',
    recommendedGear: '치명 세트 + 공격력 모듈',
    imageUrl: 'https://placehold.co/320x180?text=TORORO',
    note: '범용성이 좋고 초중반 진행이 안정적',
  },
  {
    id: 2,
    dollName: '수오미',
    star: '5',
    affiliation: '그리폰',
    position: '지원',
    element: '냉기',
    recommendedWeapon: '기관단총(SMG)',
    recommendedGear: '속도 세트 + 생존 모듈',
    imageUrl: 'https://placehold.co/320x180?text=SUOMI',
    note: '파티 안정성을 크게 올려주는 지원형',
  },
];

const emptyForm = {
  dollName: '',
  star: '5',
  affiliation: '',
  position: '돌격',
  element: '물리',
  recommendedWeapon: '',
  recommendedGear: '',
  imageUrl: '',
  note: '',
};

function App() {
  const [dolls, setDolls] = useState(initialDolls);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [screen, setScreen] = useState('manage');
  const [query, setQuery] = useState('');
  const [starFilter, setStarFilter] = useState('all');

  const summary = useMemo(() => {
    const fiveStarCount = dolls.filter((doll) => doll.star === '5').length;
    return { total: dolls.length, fiveStarCount };
  }, [dolls]);

  const filteredDolls = useMemo(() => {
    return dolls.filter((doll) => {
      const matchStar = starFilter === 'all' || doll.star === starFilter;
      const keyword = query.trim().toLowerCase();
      const matchQuery =
        !keyword ||
        doll.dollName.toLowerCase().includes(keyword) ||
        doll.affiliation.toLowerCase().includes(keyword) ||
        doll.position.toLowerCase().includes(keyword) ||
        doll.element.toLowerCase().includes(keyword);

      return matchStar && matchQuery;
    });
  }, [dolls, query, starFilter]);

  const onChangeForm = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    return (
      form.dollName.trim() &&
      form.affiliation.trim() &&
      form.recommendedWeapon.trim() &&
      form.recommendedGear.trim()
    );
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    const payload = {
      dollName: form.dollName.trim(),
      star: form.star,
      affiliation: form.affiliation.trim(),
      position: form.position,
      element: form.element,
      recommendedWeapon: form.recommendedWeapon.trim(),
      recommendedGear: form.recommendedGear.trim(),
      imageUrl: form.imageUrl.trim(),
      note: form.note.trim(),
    };

    if (editingId) {
      setDolls((prev) => prev.map((doll) => (doll.id === editingId ? { ...doll, ...payload } : doll)));
      resetForm();
      return;
    }

    const newDoll = {
      id: Date.now(),
      ...payload,
    };
    setDolls((prev) => [newDoll, ...prev]);
    resetForm();
  };

  const onEdit = (doll) => {
    setScreen('manage');
    setEditingId(doll.id);
    setForm({
      dollName: doll.dollName,
      star: doll.star,
      affiliation: doll.affiliation,
      position: doll.position,
      element: doll.element,
      recommendedWeapon: doll.recommendedWeapon,
      recommendedGear: doll.recommendedGear,
      imageUrl: doll.imageUrl,
      note: doll.note,
    });
  };

  const onDelete = (id) => {
    setDolls((prev) => prev.filter((doll) => doll.id !== id));
    if (editingId === id) {
      resetForm();
    }
  };

  const renderList = (items, readOnly = false) => (
    <ul className="list">
      {items.map((doll) => (
        <li key={doll.id} className="item">
          <img
            className="thumbnail"
            src={doll.imageUrl || 'https://placehold.co/320x180?text=No+Image'}
            alt={`${doll.dollName} 이미지`}
          />

          <div className="content">
            <div className="titleRow">
              <strong>{doll.dollName}</strong>
              <span className="badge">{doll.star}성</span>
            </div>
            <p>소속: {doll.affiliation}</p>
            <p>
              포지션/속성: {doll.position} · {doll.element}
            </p>
            <p>추천 장착 무기: {doll.recommendedWeapon}</p>
            <p>추천 장비: {doll.recommendedGear}</p>
            <p className="note">메모: {doll.note || '없음'}</p>
          </div>

          {!readOnly && (
            <div className="itemActions">
              <button type="button" className="button small" onClick={() => onEdit(doll)}>
                수정
              </button>
              <button type="button" className="button small danger" onClick={() => onDelete(doll.id)}>
                삭제
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <main className="container">
      <header className="header">
        <h1>소녀전선2: 망명 인형 관리</h1>
        <p>인형 정보를 등록/수정/삭제하고, 조회 화면에서 검색 및 필터링할 수 있습니다.</p>
        <p className="summary">
          총 {summary.total}기 · 5성 {summary.fiveStarCount}기
        </p>
      </header>

      <nav className="screenTabs" aria-label="화면 전환">
        <button
          type="button"
          className={`tab ${screen === 'manage' ? 'active' : ''}`}
          onClick={() => setScreen('manage')}
        >
          관리 화면
        </button>
        <button
          type="button"
          className={`tab ${screen === 'browse' ? 'active' : ''}`}
          onClick={() => setScreen('browse')}
        >
          조회 화면
        </button>
      </nav>

      {screen === 'manage' ? (
        <>
          <section className="panel">
            <h2>{editingId ? '인형 정보 수정' : '인형 정보 등록'}</h2>
            <form className="form" onSubmit={onSubmit}>
              <label>
                인형명
                <input name="dollName" value={form.dollName} onChange={onChangeForm} placeholder="예: 네메시스" required />
              </label>

              <label>
                성급
                <select name="star" value={form.star} onChange={onChangeForm}>
                  <option value="3">3성</option>
                  <option value="4">4성</option>
                  <option value="5">5성</option>
                </select>
              </label>

              <label>
                소속
                <input name="affiliation" value={form.affiliation} onChange={onChangeForm} placeholder="예: 엘모호" required />
              </label>

              <label>
                포지션
                <select name="position" value={form.position} onChange={onChangeForm}>
                  <option>돌격</option>
                  <option>지원</option>
                  <option>저격</option>
                  <option>방어</option>
                </select>
              </label>

              <label>
                속성
                <select name="element" value={form.element} onChange={onChangeForm}>
                  <option>물리</option>
                  <option>화염</option>
                  <option>냉기</option>
                  <option>전기</option>
                </select>
              </label>

              <label>
                추천 장착 무기
                <input
                  name="recommendedWeapon"
                  value={form.recommendedWeapon}
                  onChange={onChangeForm}
                  placeholder="예: 저격소총(SR)"
                  required
                />
              </label>

              <label className="full">
                추천 장비
                <input
                  name="recommendedGear"
                  value={form.recommendedGear}
                  onChange={onChangeForm}
                  placeholder="예: 치명 세트 + 관통 모듈"
                  required
                />
              </label>

              <label className="full">
                이미지 URL
                <input
                  name="imageUrl"
                  value={form.imageUrl}
                  onChange={onChangeForm}
                  placeholder="https://..."
                />
              </label>

              <label className="full">
                메모
                <input
                  name="note"
                  value={form.note}
                  onChange={onChangeForm}
                  placeholder="운용 팁, 시너지 조합 등"
                />
              </label>

              <div className="actions full">
                <button type="submit" className="button primary">
                  {editingId ? '수정 저장' : '인형 추가'}
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
            <h2>인형 목록 (관리)</h2>
            {renderList(dolls)}
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>인형 조회</h2>
          <div className="filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="인형명/소속/포지션/속성 검색"
            />
            <select value={starFilter} onChange={(event) => setStarFilter(event.target.value)}>
              <option value="all">전체 성급</option>
              <option value="3">3성</option>
              <option value="4">4성</option>
              <option value="5">5성</option>
            </select>
          </div>

          <p className="resultInfo">조회 결과 {filteredDolls.length}건</p>
          {renderList(filteredDolls, true)}
        </section>
      )}
    </main>
  );
}

export default App;
