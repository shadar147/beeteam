// BeeTeam — Drawer для проведения 1-2-1 с кастомными полями

const DEFAULT_FIELDS = [
  { id: 'mood',     type: 'mood',      title: 'Настроение / самочувствие', required: true,  hint: 'Выберите эмодзи и оцените от 1 до 10' },
  { id: 'prev',     type: 'longtext',  title: 'Что было сделано с прошлой встречи', placeholder: 'Краткие итоги прогресса…' },
  { id: 'blockers', type: 'longtext',  title: 'Что блокирует / проблемы', required: true,  placeholder: 'Где нужна помощь?' },
  { id: 'goals',    type: 'longtext',  title: 'Цели на следующий период', placeholder: 'Что хотим закрыть до следующей 1-2-1' },
  { id: 'feedToEm', type: 'longtext',  title: 'Фидбек сотруднику', placeholder: 'Что отметили хорошее, что зону роста' },
  { id: 'feedFromEm', type: 'longtext', title: 'Фидбек от сотрудника', placeholder: 'Что хочется поменять в работе / команде / процессе' },
  { id: 'dev',      type: 'checklist', title: 'Развитие и обучение',
    options: ['Менторство', 'Курс / книга', 'Внутренний митап', 'Конференция', 'Side-project']
  },
  { id: 'rel',      type: 'longtext',  title: 'Отношения в команде', placeholder: 'Есть ли трения, с кем выстраивается сотрудничество' },
  { id: 'comp',     type: 'competency', title: 'Проявленные компетенции', hint: 'Отметьте, что сотрудник проявил — это попадёт в свидетельства для ревью' },
  { id: 'tags',     type: 'select',    title: 'Тип встречи', options: ['Регулярная', 'Performance review', 'Скип-уровень', 'Кризисная'] },
  { id: 'next',     type: 'date',      title: 'Дата следующей встречи' },
  { id: 'attach',   type: 'file',      title: 'Вложения' },
];

function MeetingDrawer({ member, fieldsConfig, onClose, today }) {
  const [mood, setMood] = React.useState('🙂');
  const [moodScore, setMoodScore] = React.useState(7);
  const [vals, setVals] = React.useState({});
  const [tab, setTab] = React.useState('fill');
  const [logged, setLogged] = React.useState([]); // свидетельства, отмеченные в этой встрече

  const gd = window.BT_GRADES && window.BT_GRADES.members[member.id];
  window.__btDrawerDisc = gd ? gd.discipline : null;

  const fields = fieldsConfig || DEFAULT_FIELDS;

  const set = (id, v) => setVals(s => ({ ...s, [id]: v }));

  const completedCount = fields.filter(f => {
    if (f.type === 'mood') return moodScore != null;
    return vals[f.id] != null && (Array.isArray(vals[f.id]) ? vals[f.id].length : vals[f.id]);
  }).length;

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <Avatar name={member.name} hue={member.hue} size="md" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
              1-2-1 c {member.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {fmtLong(today)} · идёт сейчас · 12:30–13:15
            </div>
          </div>
          <span className="pill pill-warn"><span className="dot" /> Идёт сейчас</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 20px', background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
        }}>
          <div className="seg">
            <button className={tab === 'fill' ? 'on' : ''} onClick={() => setTab('fill')}>Заполнение</button>
            <button className={tab === 'comp' ? 'on' : ''} onClick={() => setTab('comp')}>
              Компетенции{logged.length > 0 && <span className="filter-count" style={{ marginLeft: 4 }}>{logged.length}</span>}
            </button>
            <button className={tab === 'config' ? 'on' : ''} onClick={() => setTab('config')}>Поля встречи</button>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
            <span className="mono num">{completedCount}/{fields.length}</span> полей заполнено · автосохранение
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: 999,
              background: 'var(--ok)', marginLeft: 6, verticalAlign: 'middle'
            }} />
          </div>
        </div>

        <div className="drawer-body">
          {tab === 'fill' && (
            <div>
              {fields.map(f => (
                <FieldBlock key={f.id} field={f}
                            value={f.type === 'mood' ? { mood, moodScore } : vals[f.id]}
                            onChange={(v) => {
                              if (f.type === 'mood') {
                                if (v.mood != null) setMood(v.mood);
                                if (v.moodScore != null) setMoodScore(v.moodScore);
                              } else set(f.id, v);
                            }} />
              ))}
            </div>
          )}
          {tab === 'comp' && <CompetencyPanel member={member} gd={gd} logged={logged} setLogged={setLogged} />}
          {tab === 'config' && <FieldsConfig fields={fields} />}
        </div>

        <div className="drawer-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost">Сохранить как черновик</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Закрыть</button>
            <button className="btn btn-primary" onClick={onClose}>
              <Icon name="check" size={14} /> Завершить и сохранить
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

function FieldBlock({ field, value, onChange }) {
  return (
    <div className="f-block">
      <div className="f-block-h">
        <span className="title">{field.title}</span>
        {field.required && <span className="req">*</span>}
        <span className="opt">{labelForType(field.type)}</span>
      </div>
      {field.hint && <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>{field.hint}</div>}
      <FieldControl field={field} value={value} onChange={onChange} />
    </div>
  );
}

function labelForType(t) {
  return {
    text: 'короткий текст',
    longtext: 'длинный текст',
    scale: 'шкала 1–10',
    mood: 'настроение',
    checklist: 'чек-лист',
    select: 'выпадающий',
    date: 'дата',
    file: 'вложение',
    competency: 'грейд-тег',
  }[t] || t;
}

function FieldControl({ field, value, onChange }) {
  const t = field.type;

  if (t === 'text') {
    return <input className="input" placeholder={field.placeholder || ''}
                  value={value || ''} onChange={e => onChange(e.target.value)} />;
  }
  if (t === 'longtext') {
    return <textarea className="textarea" rows={3} placeholder={field.placeholder || ''}
                     value={value || ''} onChange={e => onChange(e.target.value)} />;
  }
  if (t === 'scale') {
    return (
      <div className="scale">
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    );
  }
  if (t === 'mood') {
    const v = value || {};
    return (
      <div>
        <div className="mood-pick" style={{ marginBottom: 10 }}>
          {['😞','😐','🙂','😄','🤩'].map(e => (
            <button key={e} className={v.mood === e ? 'on' : ''} onClick={() => onChange({ mood: e })}>{e}</button>
          ))}
        </div>
        <div className="scale">
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} className={v.moodScore === n ? 'on' : ''} onClick={() => onChange({ moodScore: n })}>{n}</button>
          ))}
        </div>
      </div>
    );
  }
  if (t === 'checklist') {
    const list = value || [];
    const toggle = (o) => onChange(list.includes(o) ? list.filter(x => x !== o) : [...list, o]);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 2 }}>
        {field.options.map(o => (
          <div key={o} className={`check ${list.includes(o) ? 'on' : ''}`} onClick={() => toggle(o)}>
            <span className="box" />
            <span className="lbl">{o}</span>
          </div>
        ))}
      </div>
    );
  }
  if (t === 'select') {
    return (
      <select className="select" value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— выберите —</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === 'date') {
    return <input className="input" type="text" value={value || ''} placeholder="ДД.ММ.ГГГГ"
                  onChange={e => onChange(e.target.value)} style={{ maxWidth: 200 }} />;
  }
  if (t === 'file') {
    return (
      <div className="attach">
        <Icon name="paperclip" size={14} />
        Перетащите файлы сюда или
        <span className="tiny-link">выберите вручную</span>
      </div>
    );
  }
  if (t === 'competency') {
    return <InlineCompetencyTagger value={value} onChange={onChange} />;
  }
  return null;
}

// Инлайн-теггер компетенций (поле-тип в форме встречи)
function InlineCompetencyTagger({ value, onChange }) {
  const G = window.BT_GRADES;
  const list = value || [];
  const [block, setBlock] = React.useState('');
  if (!G) return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Матрица грейдов не загружена.</div>;
  const discId = window.__btDrawerDisc;
  if (!discId) return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>У сотрудника не назначен грейд — теги недоступны.</div>;
  const blocks = G.blocksOf(discId);
  const add = (lvl) => {
    if (!block) return;
    onChange([...list, { block, level: lvl, status: 'demonstrated' }]);
    setBlock('');
  };
  return (
    <div className="inline-comp">
      {list.length > 0 && (
        <div className="ic-tags">
          {list.map((c, i) => (
            <span key={i} className="pill pill-accent" style={{ height: 22 }}>
              {blockName(discId, c.block)} · {gradeCode(c.level)}
              <button className="ic-x" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="ic-add">
        <select className="select" value={block} onChange={e => setBlock(e.target.value)} style={{ flex: 1, height: 34, fontSize: 12.5 }}>
          <option value="">— блок компетенции —</option>
          {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="ic-levels" style={block ? {} : { opacity: 0.4, pointerEvents: 'none' }}>
          {G.levels.map((l, i) => (
            <button key={l.code} className="ic-lvl" onClick={() => add(i + 1)} title={l.name}>{l.code}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Панель компетенций (вкладка в drawer) ───
function CompetencyPanel({ member, gd, logged, setLogged }) {
  const G = window.BT_GRADES;
  const [block, setBlock] = React.useState('');
  const [note, setNote] = React.useState('');

  if (!G || !gd) {
    return <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>У сотрудника не назначен грейд (другая карьерная лестница).</div>;
  }

  const discId = gd.discipline;
  const discipline = G.disc(discId);
  const blocks = G.blocksOf(discId);
  const matrix = G.matrixOf(discId);

  const addTag = (lvl) => {
    if (!block) return;
    setLogged([...logged, { id: 'l' + Date.now(), block, level: lvl, note: note.trim(), status: 'demonstrated' }]);
    setBlock(''); setNote('');
  };

  const growthBlocks = blocks.filter(b => (gd.blockLevels[b.id] || 0) < gd.target);

  return (
    <div>
      <div className="comp-hero">
        <span className="grade-chip" data-lvl={gd.grade}>{gradeCode(gd.grade)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{gradeName(gd.grade)} · {discipline.label}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {gd.target > gd.grade
              ? <React.Fragment>цель — {gradeCode(gd.target)} · стабильно {gd.readyMonths} мес</React.Fragment>
              : 'подтверждает текущий уровень'}
          </div>
        </div>
        {gd.target > gd.grade && <span className="pill pill-accent"><Icon name="target" size={11} /> кандидат на {gradeCode(gd.target)}</span>}
      </div>

      {gd.target > gd.grade && growthBlocks.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="field-label">Что важно увидеть для {gradeCode(gd.target)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {growthBlocks.map(b => (
              <button key={b.id} className={`growth-hint ${block === b.id ? 'on' : ''}`} onClick={() => setBlock(b.id)}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{b.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>{matrix[b.id][gd.target - 1]}</span>
                <Icon name="plus" size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="field-label">Отметить проявленную компетенцию</div>
        <select className="select" value={block} onChange={e => setBlock(e.target.value)} style={{ marginBottom: 8 }}>
          <option value="">— выберите блок —</option>
          {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className="input" value={note} onChange={e => setNote(e.target.value)}
               placeholder="Что конкретно проявил (контекст для ревью)…" style={{ marginBottom: 10 }} />
        <div className="field-label">Уровень проявления</div>
        <div className="comp-levels" style={block ? {} : { opacity: 0.4, pointerEvents: 'none' }}>
          {G.levels.map((l, i) => (
            <button key={l.code} className="cl-btn" onClick={() => addTag(i + 1)} title={l.name}>
              <span className="grade-chip sm" data-lvl={i + 1}>{l.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-label">Отмечено в этой встрече ({logged.length})</div>
      {logged.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 0' }}>
          Пока ничего. Свидетельства накапливаются от встречи к встрече — так видно, стабильно сотрудник проявляет уровень или эпизодически.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logged.map((c, i) => (
            <div key={c.id} className="logged-row">
              <span className={`ev-marker ${c.status}`} />
              <span className="pill pill-accent" style={{ height: 18, fontSize: 10 }}>{blockName(discId, c.block)} · {gradeCode(c.level)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1 }}>{c.note || 'без заметки'}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setLogged(logged.filter((_, j) => j !== i))}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Конструктор полей внутри drawer ───
function FieldsConfig({ fields }) {
  return (
    <div>
      <div style={{
        background: 'var(--accent-soft)',
        border: '1px solid rgba(245,165,36,0.25)',
        borderRadius: 12,
        padding: 14,
        display: 'flex', gap: 12,
        marginBottom: 18,
        color: 'var(--accent-text)',
        fontSize: 13,
      }}>
        <Icon name="spark" size={16} />
        <div>
          <b style={{ fontWeight: 600 }}>Кастомные поля</b><br />
          Эти поля используются только для встреч с этим сотрудником. По умолчанию подтягиваются из дефолтного сидера, вы можете добавлять, скрывать и переупорядочивать.
        </div>
      </div>

      {fields.map((f, i) => (
        <div key={f.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px',
          border: '1px solid var(--line)',
          borderRadius: 10,
          background: 'var(--bg-elev)',
          marginBottom: 8,
        }}>
          <span className="mono" style={{ width: 22, fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>
            {String(i+1).padStart(2,'0')}
          </span>
          <span style={{ color: 'var(--ink-3)', cursor: 'grab', userSelect: 'none' }}>⋮⋮</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {f.title} {f.required && <span style={{ color: 'var(--miss)' }}>*</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{labelForType(f.type)}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="copy" size={13} /></button>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="trash" size={13} /></button>
        </div>
      ))}

      <button className="btn" style={{ marginTop: 4 }}>
        <Icon name="plus" size={14} /> Добавить поле
      </button>
    </div>
  );
}

Object.assign(window, { MeetingDrawer, DEFAULT_FIELDS, labelForType, CompetencyPanel });
