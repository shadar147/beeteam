// BeeTeam — Грейды: справочник + режим редактирования

// ── helpers ──
function gradeCode(idx) { return window.BT_GRADES.levels[idx - 1]?.code || `IC${idx}`; }
function gradeName(idx) { return window.BT_GRADES.levels[idx - 1]?.name || ''; }
function blockName(discId, id) { return window.BT_GRADES.blockName(discId, id); }

const ICON_CHOICES = ['fields', 'layers', 'spark', 'check', 'settings', 'team', 'target', 'scale'];

// ═══════════════════════════════════════════════════════════════════
//  GRADES SCREEN
// ═══════════════════════════════════════════════════════════════════
function GradesScreen() {
  const G = window.BT_GRADES;
  const [disc, setDisc] = React.useState('backend');
  const [tab, setTab] = React.useState('matrix');
  const [track, setTrack] = React.useState('main');
  const [openCell, setOpenCell] = React.useState(null);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [newDisc, setNewDisc] = React.useState(false);
  const [, force] = React.useReducer(x => x + 1, 0);

  const addons = G.addonsOf(disc);
  const addonIds = Object.keys(addons);
  React.useEffect(() => { if (track !== 'main' && !addons[track]) setTrack('main'); }, [disc]);

  const headcount = Object.values(G.members).filter(m => m.discipline === disc).length;

  // ── вход в режим редактирования: клонируем дисциплину + уровни ──
  function enterEdit() {
    const d = G.disc(disc);
    const order = (d.order || G.BLOCK_IDS).slice();
    setDraft({
      discId: disc,
      label: d.label, desc: d.desc, icon: d.icon,
      order,
      blockNames: { ...d.blockNames },
      matrix: order.reduce((a, id) => { a[id] = (d.matrix[id] || []).slice(); return a; }, {}),
      levels: G.levels.map(l => ({ ...l })),
    });
    setTrack('main');
    setEditing(true);
  }
  function saveEdit() {
    const d = G.disc(draft.discId);
    d.label = draft.label; d.desc = draft.desc; d.icon = draft.icon;
    d.order = draft.order.slice();
    d.blockNames = { ...draft.blockNames };
    d.matrix = draft.order.reduce((a, id) => { a[id] = draft.matrix[id].slice(); return a; }, {});
    // обновляем подпись в списке дисциплин
    const item = G.discList.find(x => x.id === draft.discId);
    if (item) { item.label = draft.label; item.desc = draft.desc; item.icon = draft.icon; }
    // уровни — общие
    draft.levels.forEach((l, i) => Object.assign(G.levels[i], l));
    setEditing(false); setDraft(null); force();
  }
  function cancelEdit() { setEditing(false); setDraft(null); }

  const setD = (patch) => setDraft(s => ({ ...s, ...patch }));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Грейды{editing && <span className="edit-tag">режим редактирования</span>}</h1>
          <p className="page-sub">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing ? (
            <React.Fragment>
              <button className="btn"><Icon name="download" size={14} /> Экспорт</button>
              <button className="btn btn-primary" onClick={enterEdit}><Icon name="edit" size={14} /> Редактировать</button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button className="btn" onClick={cancelEdit}>Отмена</button>
              <button className="btn btn-primary" onClick={saveEdit}><Icon name="check" size={14} /> Сохранить</button>
            </React.Fragment>
          )}
        </div>
      </div>

      {editing && (
        <div className="edit-banner">
          <Icon name="edit" size={15} />
          <div style={{ flex: 1 }}>
            Редактируется дисциплина <b>«{draft.label}»</b>. Кликните по ячейке, чтобы изменить описание; названия блоков и уровней меняются прямо в таблице.
            Изменения применятся к новым ревью; прошлые — не затрагиваются.
          </div>
        </div>
      )}

      {/* Выбор дисциплины */}
      <div className="disc-tabs">
        {G.discList.map(dd => (
          <button key={dd.id} className={`disc-tab ${disc === dd.id ? 'on' : ''}`}
                  onClick={() => !editing && setDisc(dd.id)}
                  style={editing && dd.id !== disc ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
            <span className="disc-ic"><Icon name={dd.icon} size={16} /></span>
            <span className="disc-meta">
              <span className="disc-label">{dd.label}</span>
              <span className="disc-desc">{dd.desc}</span>
            </span>
          </button>
        ))}
        {!editing && (
          <button className="disc-tab add" onClick={() => setNewDisc(true)}>
            <span className="disc-ic"><Icon name="plus" size={16} /></span>
            <span className="disc-meta"><span className="disc-label">Новая дисциплина</span>
              <span className="disc-desc">Своя матрица и треки</span></span>
          </button>
        )}
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="seg">
          <button className={tab === 'levels' ? 'on' : ''} onClick={() => setTab('levels')}>Уровни</button>
          <button className={tab === 'matrix' ? 'on' : ''} onClick={() => setTab('matrix')}>Матрица</button>
          {!editing && <button className={tab === 'bands' ? 'on' : ''} onClick={() => setTab('bands')}>Вилки</button>}
        </div>
        {tab === 'matrix' && !editing && (
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button className={track === 'main' ? 'on' : ''} onClick={() => setTrack('main')}>Основной</button>
            {addonIds.map(aid => (
              <button key={aid} className={track === aid ? 'on' : ''} onClick={() => setTrack(aid)}>{addons[aid].label}-трек</button>
            ))}
            {addonIds.length === 0 && <button disabled style={{ opacity: 0.4 }}>нет доп-треков</button>}
          </div>
        )}
        {tab !== 'matrix' && !editing && <span className="pill" style={{ marginLeft: 'auto' }}>{headcount} чел. в дисциплине</span>}
      </div>

      {/* редактор шапки дисциплины */}
      {editing && (
        <div className="card disc-editor">
          <div className="de-icon-pick">
            {ICON_CHOICES.map(ic => (
              <button key={ic} className={`de-ic ${draft.icon === ic ? 'on' : ''}`} onClick={() => setD({ icon: ic })}>
                <Icon name={ic} size={16} />
              </button>
            ))}
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <div className="field-label">Название дисциплины</div>
              <input className="input" value={draft.label} onChange={e => setD({ label: e.target.value })} />
            </div>
            <div>
              <div className="field-label">Описание</div>
              <input className="input" value={draft.desc} onChange={e => setD({ desc: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {tab === 'levels' && (editing ? <LevelsEditor draft={draft} setDraft={setDraft} /> : <GradeLevels />)}
      {tab === 'matrix' && (editing
        ? <MatrixEditor draft={draft} setDraft={setDraft} onOpenCell={setOpenCell} />
        : <GradeMatrix disc={disc} track={track} onOpenCell={setOpenCell} />)}
      {tab === 'bands' && !editing && <SalaryBands />}

      {openCell && (
        editing
          ? <CellEditor cell={openCell} draft={draft} setDraft={setDraft} onClose={() => setOpenCell(null)} />
          : <CellDetail cell={openCell} disc={disc} track={track} onClose={() => setOpenCell(null)} />
      )}
      {newDisc && <NewDisciplineModal onClose={() => setNewDisc(false)} onCreate={(id) => { setNewDisc(false); setDisc(id); force(); }} />}
    </div>
  );
}

// ── Tab: Уровни (просмотр) ──
function GradeLevels() {
  const G = window.BT_GRADES;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="info-banner">
        <Icon name="spark" size={16} />
        <div><b style={{ fontWeight: 600 }}>Принцип продвижения</b><br />
          <span style={{ color: 'var(--ink-3)' }}>Для перехода на следующий уровень сотрудник должен стабильно проявлять компетенции L+1 минимум 3–6 месяцев, а не эпизодически.</span></div>
      </div>
      {G.levels.map((l, i) => (
        <div key={l.code} className="grade-level-row">
          <div className="glr-code"><span className="grade-chip" data-lvl={i + 1}>{l.code}</span></div>
          <div className="glr-name">
            <div className="n">{l.name}</div>
            <div className="x">{l.exp}{l.mgr && <span className="pill pill-info" style={{ height: 17, fontSize: 10, marginLeft: 8 }}>+ менедж. трек</span>}</div>
          </div>
          <div className="glr-col"><div className="lbl">Автономность</div><div className="v">{l.autonomy}</div></div>
          <div className="glr-col"><div className="lbl">Масштаб влияния</div><div className="v">{l.scope}</div></div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Уровни (редактор) ──
function LevelsEditor({ draft, setDraft }) {
  const setLvl = (i, patch) => setDraft(s => ({ ...s, levels: s.levels.map((l, j) => j === i ? { ...l, ...patch } : l) }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="info-banner">
        <Icon name="layers" size={15} />
        <div style={{ color: 'var(--ink-3)' }}>Уровни общие для всех дисциплин. Изменения коснутся всей системы грейдов.</div>
      </div>
      {draft.levels.map((l, i) => (
        <div key={i} className="grade-level-row editing">
          <div className="glr-code"><span className="grade-chip" data-lvl={i + 1}>{l.code}</span></div>
          <div>
            <div className="field-label">Название</div>
            <input className="input" value={l.name} onChange={e => setLvl(i, { name: e.target.value })} />
            <input className="input" value={l.exp} onChange={e => setLvl(i, { exp: e.target.value })} style={{ marginTop: 6, fontSize: 12 }} />
          </div>
          <div>
            <div className="field-label">Автономность</div>
            <textarea className="textarea" rows={2} value={l.autonomy} onChange={e => setLvl(i, { autonomy: e.target.value })} style={{ minHeight: 0 }} />
          </div>
          <div>
            <div className="field-label">Масштаб влияния</div>
            <textarea className="textarea" rows={2} value={l.scope} onChange={e => setLvl(i, { scope: e.target.value })} style={{ minHeight: 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Матрица (просмотр) ──
function GradeMatrix({ disc, track, onOpenCell }) {
  const G = window.BT_GRADES;
  if (track === 'main') {
    const blocks = G.blocksOf(disc);
    const matrix = G.matrixOf(disc);
    return (
      <div className="matrix-wrap">
        <div className="matrix" style={{ gridTemplateColumns: `180px repeat(7, minmax(150px, 1fr))` }}>
          <div className="mx-corner">Блок · уровень</div>
          {G.levels.map((l, i) => (
            <div key={l.code} className="mx-head" data-lvl={i + 1}>
              <span className="mx-head-code">{l.code}</span><span className="mx-head-name">{l.name}</span>
            </div>
          ))}
          {blocks.map(b => (
            <React.Fragment key={b.id}>
              <div className="mx-block">{b.name}</div>
              {matrix[b.id].map((cell, i) => (
                <div key={i} className={`mx-cell ${cell === 'Не требуется.' ? 'na' : ''}`}
                     onClick={() => cell !== 'Не требуется.' && onOpenCell({ block: b.id, level: i + 1 })}>{cell}</div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="mx-hint">Сотрудник уровня N владеет всеми компетенциями ≤N. Клик по ячейке — детали.</div>
      </div>
    );
  }
  const t = G.addonsOf(disc)[track];
  return (
    <div className="matrix-wrap">
      <div className="info-banner" style={{ marginBottom: 14 }}>
        <Icon name="layers" size={16} />
        <div><b style={{ fontWeight: 600 }}>{t.label} — дополнительный трек</b><br />
          <span style={{ color: 'var(--ink-3)' }}>{t.note}</span></div>
      </div>
      <div className="matrix" style={{ gridTemplateColumns: `180px repeat(${t.levelNames.length}, minmax(160px, 1fr))` }}>
        <div className="mx-corner">Блок · уровень</div>
        {t.levelNames.map((n, i) => {
          const parts = n.split(' ');
          return <div key={i} className="mx-head track"><span className="mx-head-code">{parts[0]}</span><span className="mx-head-name">{parts.slice(1).join(' ')}</span></div>;
        })}
        {t.blocks.map(b => (
          <React.Fragment key={b.id}>
            <div className="mx-block">{b.name}</div>
            {b.cells.map((cell, i) => <div key={i} className="mx-cell" onClick={() => onOpenCell({ block: b.id, level: i + 1 })}>{cell}</div>)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Матрица (редактор) ──
function MatrixEditor({ draft, setDraft, onOpenCell }) {
  const G = window.BT_GRADES;
  const order = draft.order;

  const renameBlock = (id, name) => setDraft(s => ({ ...s, blockNames: { ...s.blockNames, [id]: name } }));
  const move = (i, dir) => setDraft(s => {
    const o = s.order.slice(); const j = i + dir;
    if (j < 0 || j >= o.length) return s;
    [o[i], o[j]] = [o[j], o[i]]; return { ...s, order: o };
  });
  const del = (id) => setDraft(s => {
    const o = s.order.filter(x => x !== id);
    const m = { ...s.matrix }; delete m[id];
    const bn = { ...s.blockNames }; delete bn[id];
    return { ...s, order: o, matrix: m, blockNames: bn };
  });
  const addBlock = () => setDraft(s => {
    const id = 'b' + Date.now().toString(36);
    return { ...s, order: [...s.order, id], blockNames: { ...s.blockNames, [id]: 'Новый блок' },
      matrix: { ...s.matrix, [id]: Array(7).fill('') } };
  });

  return (
    <div className="matrix-wrap">
      <div className="matrix editing" style={{ gridTemplateColumns: `220px repeat(7, minmax(150px, 1fr))` }}>
        <div className="mx-corner">Блок · уровень</div>
        {G.levels.map((l, i) => (
          <div key={l.code} className="mx-head" data-lvl={i + 1}>
            <span className="mx-head-code">{l.code}</span><span className="mx-head-name">{draft.levels[i].name}</span>
          </div>
        ))}
        {order.map((id, bi) => (
          <React.Fragment key={id}>
            <div className="mx-block edit">
              <div className="mb-controls">
                <button className="mb-btn" onClick={() => move(bi, -1)} disabled={bi === 0} title="вверх">↑</button>
                <button className="mb-btn" onClick={() => move(bi, 1)} disabled={bi === order.length - 1} title="вниз">↓</button>
                <button className="mb-btn danger" onClick={() => del(id)} title="удалить"><Icon name="trash" size={12} /></button>
              </div>
              <input className="input mb-input" value={draft.blockNames[id]} onChange={e => renameBlock(id, e.target.value)} />
            </div>
            {draft.matrix[id].map((cell, i) => (
              <div key={i} className={`mx-cell editable ${!cell ? 'empty' : ''}`} onClick={() => onOpenCell({ block: id, level: i + 1 })}>
                <span className="cell-text">{cell || 'добавить…'}</span>
                <span className="cell-pencil"><Icon name="edit" size={12} /></span>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={addBlock}><Icon name="plus" size={14} /> Добавить блок компетенций</button>
    </div>
  );
}

// ── Cell editor (modal) ──
function CellEditor({ cell, draft, setDraft, onClose }) {
  const text = draft.matrix[cell.block][cell.level - 1];
  const [val, setVal] = React.useState(text);
  const save = () => {
    setDraft(s => ({ ...s, matrix: { ...s.matrix, [cell.block]: s.matrix[cell.block].map((c, i) => i === cell.level - 1 ? val : c) } }));
    onClose();
  };
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal-card" style={{ width: 'min(560px, 95vw)' }}>
          <div className="modal-head">
            <div>
              <div className="modal-sub">{gradeCode(cell.level)} · {gradeName(cell.level)} · {draft.label}</div>
              <div className="modal-title">{draft.blockNames[cell.block]}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>
          <div className="modal-body">
            <div className="field-label">Что должен демонстрировать сотрудник на этом уровне</div>
            <textarea className="textarea" rows={5} autoFocus value={val} onChange={e => setVal(e.target.value)}
                      placeholder="Опишите компетенцию как наблюдаемое поведение…" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setVal('Не требуется.')}>Отметить «не требуется»</button>
              <button className="btn btn-sm" onClick={() => setVal('')}>Очистить</button>
            </div>
            <div className="info-banner" style={{ marginTop: 16 }}>
              <Icon name="spark" size={15} />
              <div style={{ color: 'var(--ink-3)' }}>Формулируйте как наблюдаемое поведение («проектирует…», «оптимизирует…»), а не как знание.</div>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" onClick={save}><Icon name="check" size={14} /> Применить</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── Cell detail (просмотр) ──
function CellDetail({ cell, disc, track, onClose }) {
  const G = window.BT_GRADES;
  let title, levelLabel, text;
  if (track === 'main') {
    title = G.blockName(disc, cell.block);
    levelLabel = `${gradeCode(cell.level)} · ${gradeName(cell.level)}`;
    text = G.matrixOf(disc)[cell.block][cell.level - 1];
  } else {
    const t = G.addonsOf(disc)[track];
    const b = t.blocks.find(x => x.id === cell.block);
    title = b.name; levelLabel = t.levelNames[cell.level - 1]; text = b.cells[cell.level - 1];
  }
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal-card" style={{ width: 'min(520px, 95vw)' }}>
          <div className="modal-head">
            <div><div className="modal-sub">{levelLabel} · {G.disc(disc).label}</div><div className="modal-title">{title}</div></div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>{text}</p>
            <div className="info-banner" style={{ marginTop: 18 }}>
              <Icon name="check" size={16} />
              <div style={{ color: 'var(--ink-3)' }}>Сотрудник этого уровня владеет также всеми компетенциями уровней ниже.</div>
            </div>
          </div>
          <div className="modal-foot">
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Используется в ревью и в плане роста сотрудника</span>
            <button className="btn btn-sm"><Icon name="edit" size={13} /> Редактировать</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── Новая дисциплина (modal) ──
function NewDisciplineModal({ onClose, onCreate }) {
  const G = window.BT_GRADES;
  const [label, setLabel] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [icon, setIcon] = React.useState('layers');
  const [base, setBase] = React.useState('backend');
  const canCreate = label.trim().length >= 2;

  const create = () => {
    const id = 'disc' + Date.now().toString(36);
    const src = G.disc(base);
    const order = (src.order || G.BLOCK_IDS).slice();
    G.disciplines[id] = {
      id, label: label.trim(), desc: desc.trim() || 'Новая дисциплина', icon,
      order,
      blockNames: { ...src.blockNames },
      matrix: order.reduce((a, bid) => { a[bid] = (src.matrix[bid] || Array(7).fill('')).slice(); return a; }, {}),
      addons: {},
    };
    G.discList.push({ id, label: label.trim(), desc: desc.trim() || 'Новая дисциплина', icon });
    onCreate(id);
  };

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal-card" style={{ width: 'min(560px, 95vw)' }}>
          <div className="modal-head">
            <div><div className="modal-sub">Карьерная лестница нового направления</div><div className="modal-title">Новая дисциплина</div></div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <div className="field-label">Иконка</div>
              <div className="de-icon-pick">
                {ICON_CHOICES.map(ic => (
                  <button key={ic} className={`de-ic ${icon === ic ? 'on' : ''}`} onClick={() => setIcon(ic)}><Icon name={ic} size={16} /></button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <div className="field-label">Название *</div>
              <input className="input" autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Например, Data Engineering" />
            </div>
            <div className="form-group">
              <div className="field-label">Описание</div>
              <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Чем занимается направление" />
            </div>
            <div className="form-group">
              <div className="field-label">Скопировать структуру блоков из</div>
              <select className="select" value={base} onChange={e => setBase(e.target.value)}>
                {G.discList.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
                Возьмём названия и тексты блоков как основу — потом отредактируете под направление.
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" disabled={!canCreate} onClick={create}
                    style={canCreate ? {} : { opacity: 0.5, cursor: 'not-allowed' }}>
              <Icon name="plus" size={14} /> Создать и редактировать
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── Tab: Вилки ──
function SalaryBands() {
  const G = window.BT_GRADES;
  return (
    <React.Fragment>
      <div className="info-banner" style={{ marginBottom: 14 }}>
        <Icon name="shield" size={16} />
        <div><b style={{ fontWeight: 600 }}>Вид лида: полосы без точных окладов</b><br />
          <span style={{ color: 'var(--ink-3)' }}>Вилки общие для всех дисциплин на одном грейде. Доп-треки дают надбавку сверху. Точные цифры — у HR-администратора.</span></div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="band-row head"><div>Грейд</div><div>Полоса (нижняя → медиана → верхняя)</div><div>Ширина</div></div>
        {G.levels.map((l, i) => {
          const b = G.bands[l.code];
          const width = Math.round((b.high - b.low) * 100);
          return (
            <div key={l.code} className="band-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="grade-chip sm" data-lvl={i + 1}>{l.code}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</span>
              </div>
              <div className="band-track">
                <div className="band-fill" />
                <span className="band-tick low" /><span className="band-tick mid" /><span className="band-tick high" />
                <span className="band-mid-label">медиана</span>
              </div>
              <div className="mono num" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>±{Math.round(width / 2)}%</div>
            </div>
          );
        })}
      </div>
      <div className="card" style={{ padding: 18, marginTop: 14 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Дополнительные компоненты</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
          <div>• <b>Годовой бонус:</b> IC1–IC4 до 1 оклада (KPI команды), IC5+ до 2 окладов</div>
          <div>• <b>Доп-треки:</b> Go / Rust / iOS / Android и др. дают надбавку к основному грейду дисциплины</div>
          <div>• <b>Премия за сертификации:</b> Cloud / AI — разовая выплата</div>
          <div>• <b>Ревью зарплаты:</b> плановое раз в 12 мес, внеплановое — при подтверждении грейда</div>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { GradesScreen, gradeCode, gradeName, blockName });
