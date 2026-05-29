// BeeTeam — раскрытые флоу:
//   • CalendarScreen (Месяц / Неделя / Список)
//   • FieldsLibraryScreen (глобальные шаблоны полей)
//   • GoalsTab / FieldsTab / FilesTab (вкладки в профиле)
//   • FilterPopover (фильтр для списка команды)
//   • AdminTeams / AdminLeads / AdminSettings

// ═══════════════════════════════════════════════════════════════════
//  CALENDAR — все 1-2-1 команды
// ═══════════════════════════════════════════════════════════════════
function CalendarScreen({ data, onOpenMember }) {
  const today = data.today;
  const [calMonth, setCalMonth] = React.useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = React.useState('month');
  const [filterStatus, setFilterStatus] = React.useState('all');

  // Собираем все события: запланированные + последние + 2 синтетических из истории
  const allEvents = React.useMemo(() => {
    const evs = [];
    data.team.forEach(m => {
      if (m.nextMeet) evs.push({ id: `${m.id}-next`, member: m, date: m.nextMeet, state: 'planned' });
      if (m.lastMeet) evs.push({ id: `${m.id}-last`, member: m, date: m.lastMeet, state: m.status === 'miss' ? 'miss' : 'done' });
      const base = m.lastMeet.getTime();
      for (let i = 1; i <= 2; i++) {
        evs.push({ id: `${m.id}-h${i}`, member: m, date: new Date(base - i * 14 * 86400000), state: 'done' });
      }
    });
    return evs;
  }, [data]);

  const filtered = allEvents.filter(e => filterStatus === 'all' ? true : e.state === filterStatus);

  // Сетка месяца
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const daysPrev = new Date(calMonth.getFullYear(), calMonth.getMonth(), 0).getDate();
  const cells = [];
  for (let i = startDow; i > 0; i--) {
    cells.push({ date: new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, daysPrev - i + 1), dim: true });
  }
  for (let dn = 1; dn <= daysInMonth; dn++) {
    cells.push({ date: new Date(calMonth.getFullYear(), calMonth.getMonth(), dn), dim: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), dim: true });
  }

  const eventsOn = (date) => filtered.filter(e => sameDay(e.date, date));

  const upcoming = filtered
    .filter(e => e.state === 'planned' && daysBetween(e.date, today) >= 0 && daysBetween(e.date, today) <= 21)
    .sort((a, b) => a.date - b.date);

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Календарь</h1>
          <p className="page-sub">Все 1-2-1 встречи команды · 8 человек · {RU_MONTHS_FULL[calMonth.getMonth()]} {calMonth.getFullYear()}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icon name="download" size={14} /> .ics</button>
          <button className="btn btn-primary"><Icon name="plus" size={14} /> Запланировать</button>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="seg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Месяц</button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Неделя</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Список</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>
            <Icon name="chevronL" size={14} />
          </button>
          <button className="btn btn-sm" onClick={() => setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Сегодня</button>
          <button className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>
            <Icon name="chevronR" size={14} />
          </button>
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button className={filterStatus === 'all' ? 'on' : ''} onClick={() => setFilterStatus('all')}>Все</button>
          <button className={filterStatus === 'planned' ? 'on' : ''} onClick={() => setFilterStatus('planned')}>Запланировано</button>
          <button className={filterStatus === 'done' ? 'on' : ''} onClick={() => setFilterStatus('done')}>Проведено</button>
          <button className={filterStatus === 'miss' ? 'on' : ''} onClick={() => setFilterStatus('miss')}>Пропущено</button>
        </div>
      </div>

      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(280px,1fr)', gap: 18 }}>
          <div className="calendar" style={{ padding: 16 }}>
            <div className="cal-grid cal-grid-big">
              {RU_DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
              {cells.map((c, i) => {
                const evs = eventsOn(c.date);
                const isToday = sameDay(c.date, today);
                return (
                  <div key={i} className={`cal-day big ${c.dim ? 'dim' : ''} ${isToday ? 'today' : ''}`}>
                    <span className="n">{c.date.getDate()}</span>
                    {evs.slice(0, 3).map(e => (
                      <span key={e.id} className={`ev ev-row ${e.state}`} onClick={() => onOpenMember(e.member)}>
                        <span className="ev-dot" />
                        <span className="ev-label">{e.member.name.split(' ')[0]} {e.member.name.split(' ')[1][0]}.</span>
                      </span>
                    ))}
                    {evs.length > 3 && <span className="ev ev-more">+{evs.length - 3} ещё</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>Ближайшие встречи</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>3 недели вперёд</div>
              {upcoming.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Ничего не запланировано</div>
              ) : upcoming.map(e => (
                <div key={e.id} className="upcoming" onClick={() => onOpenMember(e.member)}>
                  <div className="ud">
                    <div className="dd">{e.date.getDate()}</div>
                    <div className="mm">{RU_MONTHS[e.date.getMonth()]}</div>
                  </div>
                  <Avatar name={e.member.name} hue={e.member.hue} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.member.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                      {relativeAgo(e.date, today)} · 11:00–11:45
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>Загрузка по неделе</div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 60 }}>
                {[2, 3, 1, 4, 2, 0, 0].map((n, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: `${n * 12 + 4}px`,
                      background: i === 4 ? 'var(--accent)' : 'var(--accent-soft)',
                      borderRadius: 4, marginBottom: 4,
                      border: '1px solid ' + (i === 4 ? 'var(--accent-strong)' : 'rgba(245,165,36,0.2)')
                    }} />
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {RU_DOW[i]}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.5 }}>
                Пятница перегружена 4 встречами — рассмотрите перенос одной на ср/чт.
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>Легенда</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ev-dot" style={{ background: 'var(--info)' }} /> Запланирована
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ev-dot" style={{ background: 'var(--ok)' }} /> Проведена
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ev-dot" style={{ background: 'var(--miss)' }} /> Пропущена
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {[...filtered].sort((a, b) => b.date - a.date).map((e, i) => (
            <div key={e.id} className="cal-list-row" onClick={() => onOpenMember(e.member)}
                 style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }}>
              <div className="ud">
                <div className="dd">{e.date.getDate()}</div>
                <div className="mm">{RU_MONTHS[e.date.getMonth()]}</div>
              </div>
              <Avatar name={e.member.name} hue={e.member.hue} size="md" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>1-2-1 c {e.member.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {e.member.role} · {relativeAgo(e.date, today)} · 11:00–11:45
                </div>
              </div>
              <span className={`pill ${e.state === 'planned' ? 'pill-info' : e.state === 'miss' ? 'pill-miss' : 'pill-ok'}`}>
                <span className="dot" />
                {e.state === 'planned' ? 'Запланирована' : e.state === 'miss' ? 'Пропуск' : 'Завершена'}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={(ev) => ev.stopPropagation()}>
                <Icon name="more" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {view === 'week' && <WeekView today={today} weekStart={getWeekStart(today)} events={filtered} onOpenMember={onOpenMember} />}
    </div>
  );
}

function getWeekStart(d) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function WeekView({ today, weekStart, events, onOpenMember }) {
  const [start, setStart] = React.useState(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i); return d;
  });
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  return (
    <div className="card week-card">
      <div className="week-head">
        <div className="hour-corner">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { const d = new Date(start); d.setDate(d.getDate() - 7); setStart(d); }}>
            <Icon name="chevronL" size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { const d = new Date(start); d.setDate(d.getDate() + 7); setStart(d); }}>
            <Icon name="chevronR" size={13} />
          </button>
        </div>
        {days.map((d, i) => (
          <div key={i} className={`whd ${sameDay(d, today) ? 'today' : ''}`}>
            <div className="dow">{RU_DOW[i]}</div>
            <div className="dn">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="week-body">
        {hours.map(h => (
          <React.Fragment key={h}>
            <div className="hour-lbl">{String(h).padStart(2, '0')}:00</div>
            {days.map(d => {
              const slot = h === 11 ? events.filter(e => sameDay(e.date, d)) : [];
              return (
                <div key={d.toISOString() + h} className="hour-cell">
                  {slot.map(e => (
                    <div key={e.id} className={`week-ev ${e.state}`} onClick={() => onOpenMember(e.member)}>
                      <Avatar name={e.member.name} hue={e.member.hue} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div className="we-n">{e.member.name.split(' ')[0]}</div>
                        <div className="we-t">11:00 · 45 мин</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  FIELDS LIBRARY — глобальные шаблоны полей
// ═══════════════════════════════════════════════════════════════════
function FieldsLibraryScreen() {
  const presets = [
    { id: 'default',    name: 'Базовый набор',         desc: 'Используется по умолчанию для всех 1-2-1', count: 11, system: true, used: 'Платформенный отдел · Команда роста · 32 человека' },
    { id: 'review',     name: 'Performance review',    desc: 'Расширенный набор для квартального ревью', count: 16, used: '8 человек · применяется раз в квартал' },
    { id: 'onboarding', name: 'Onboarding 90 дней',    desc: 'Для новичков, акцент на адаптацию',         count: 9,  used: '2 сотрудника на испытательном' },
    { id: 'skip',       name: 'Скип-уровень',          desc: 'Встречи через уровень с лидом лида',        count: 7,  used: 'CTO ↔ Senior Engineers' },
    { id: 'exit',       name: 'Exit-интервью',          desc: 'При увольнении сотрудника',                count: 8, system: true, used: 'Архивный шаблон' },
  ];
  const [active, setActive] = React.useState('default');

  const extendedFields = (id) => {
    if (id === 'review') return [
      { title: 'Самооценка по компетенциям', type: 'scale', required: true },
      { title: 'Оценка от лида по компетенциям', type: 'scale', required: true },
      { title: 'Достижения за квартал', type: 'longtext', required: true },
      { title: 'Зоны роста', type: 'longtext' },
      { title: 'Грейд / повышение', type: 'select', options: ['Сохранить', 'Повысить', 'PIP'] },
      { title: 'Календарь активности', type: 'file' },
      ...DEFAULT_FIELDS.slice(0, 10),
    ];
    if (id === 'onboarding') return [
      { title: 'Адаптация: что помогает / мешает', type: 'longtext', required: true },
      { title: 'Менторская поддержка', type: 'select', options: ['Достаточно','Нужно больше','Не назначен'], required: true },
      { title: 'Понимание процессов', type: 'scale' },
      { title: 'Понимание продукта', type: 'scale' },
      { title: 'Первые задачи — впечатления', type: 'longtext' },
      { title: 'Цели на месяц', type: 'longtext' },
      { title: 'Чего не хватает в команде', type: 'longtext' },
      { title: 'Настроение', type: 'mood' },
      { title: 'Следующая встреча', type: 'date' },
    ];
    if (id === 'skip') return [
      { title: 'Как ощущается работа с прямым руководителем', type: 'longtext', required: true },
      { title: 'Что мешает делать работу лучше', type: 'longtext' },
      { title: 'Карьерные планы', type: 'longtext' },
      { title: 'Что хочется сказать топ-менеджменту', type: 'longtext' },
      { title: 'Конфиденциальность', type: 'select', options: ['Можно делиться','Только в агрегате','Анонимно'] },
      { title: 'Настроение', type: 'mood' },
      { title: 'Следующая встреча', type: 'date' },
    ];
    if (id === 'exit') return [
      { title: 'Причина ухода', type: 'select', options: ['Карьерный рост','Релокация','Зарплата','Менеджмент','Профвыгорание','Другое'], required: true },
      { title: 'Что не работало в команде', type: 'longtext', required: true },
      { title: 'Что было хорошо', type: 'longtext' },
      { title: 'Обратная связь руководителю', type: 'longtext' },
      { title: 'Будущий контакт', type: 'select', options: ['Готов помогать','OK','Не контактировать'] },
      { title: 'Knowledge transfer план', type: 'file' },
      { title: 'Дата последнего рабочего дня', type: 'date', required: true },
      { title: 'Согласие на публикацию ответов в HR-отчёте', type: 'select', options: ['Да','Нет'] },
    ];
    return DEFAULT_FIELDS;
  };

  const fields = extendedFields(active);
  const cur = presets.find(p => p.id === active);

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Конструктор полей</h1>
          <p className="page-sub">Шаблоны полей для разных типов 1-2-1 встреч в рабочем пространстве</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icon name="download" size={14} /> Экспорт шаблона</button>
          <button className="btn btn-primary"><Icon name="plus" size={14} /> Новый шаблон</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {presets.map(p => (
            <div key={p.id} className={`preset-item ${active === p.id ? 'on' : ''}`} onClick={() => setActive(p.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
                {p.system && <span className="pill" style={{ height: 18, fontSize: 10 }}>system</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>{p.desc}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {p.count} полей
              </div>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 4 }}>
            <Icon name="plus" size={13} /> Создать шаблон
          </button>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{cur.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
                Изменения применятся к новым встречам. Существующие останутся как были.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm"><Icon name="copy" size={13} /> Дублировать</button>
              <button className="btn btn-sm">Назначить командам</button>
              {!cur.system && <button className="btn btn-ghost btn-icon btn-sm"><Icon name="trash" size={13} /></button>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 22 }}>
            <div>
              <div className="field-label">Применяется к</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{cur.used.split(' · ')[0]}</div>
            </div>
            <div>
              <div className="field-label">Версия</div>
              <div style={{ fontSize: 13, fontWeight: 500 }} className="mono">v3.{active === 'default' ? '14' : '02'}</div>
            </div>
            <div>
              <div className="field-label">Обновлено</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>12 мая 2026 · Е. Глебов</div>
            </div>
          </div>

          {fields.map((f, i) => (
            <div key={f.id || i} className="field-row">
              <span className="mono num">{String(i + 1).padStart(2, '0')}</span>
              <span className="grip">⋮⋮</span>
              <div className="fr-meta">
                <div className="fr-t">
                  {f.title} {f.required && <span style={{ color: 'var(--miss)' }}>*</span>}
                </div>
                <div className="fr-d">
                  <span className="type-tag">{labelForType(f.type)}</span>
                  {f.placeholder && <span className="muted">{f.placeholder}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon name="copy" size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon name="trash" size={13} /></button>
            </div>
          ))}

          <button className="btn" style={{ marginTop: 12 }}>
            <Icon name="plus" size={14} /> Добавить поле
          </button>

          <div className="info-banner" style={{ marginTop: 22 }}>
            <Icon name="spark" size={16} />
            <div style={{ flex: 1 }}>
              <b style={{ fontWeight: 600 }}>Где используется</b><br />
              <span style={{ color: 'var(--ink-3)' }}>{cur.used}</span>
            </div>
            <button className="btn btn-sm">Назначить</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  PROFILE TAB — Цели и развитие
// ═══════════════════════════════════════════════════════════════════
function GoalsTab({ member }) {
  const isAnna = member.id === 't1';

  const okrs = isAnna ? [
    { id: 'o1', title: 'Миграция админ-кабинета на новый дизайн-кит', kr: '12 / 19 экранов', progress: 64, status: 'ontrack', due: '30 июн 2026' },
    { id: 'o2', title: 'Снизить p75 time-to-interactive в основном флоу', kr: 'p75: 2.4s → 1.9s, цель 1.5s', progress: 30, status: 'risk', due: '30 июн 2026' },
    { id: 'o3', title: 'Менторская программа: 2 ревью / месяц с Тимуром', kr: '4 / 4 ревью', progress: 100, status: 'done', due: '18 мая 2026' },
  ] : [
    { id: 'o1', title: `Цели на квартал для ${member.name.split(' ')[0]}`, kr: 'обновляется', progress: 50, status: 'ontrack', due: '30 июн 2026' },
    { id: 'o2', title: 'Закрыть техдолг по своему домену', kr: '6 / 11 тикетов', progress: 55, status: 'ontrack', due: '30 июн 2026' },
  ];

  const grow = isAnna ? [
    { title: 'Frontend Masters: Advanced React Patterns', kind: 'Курс',        status: 'in_progress', when: 'Прогресс 60%' },
    { title: 'Доклад на внутренний митап: микрофронтенды',   kind: 'Доклад',     status: 'planned',     when: 'Конец Q2' },
    { title: 'Designing Data-Intensive Applications',         kind: 'Книга',      status: 'in_progress', when: 'Глава 4 / 12' },
    { title: 'AWS Cloud Practitioner',                        kind: 'Сертификат', status: 'planned',     when: 'Q3 2026' },
    { title: 'Менторство Тимура',                             kind: 'Менторство', status: 'done',        when: 'Завершено в мае' },
  ] : [
    { title: 'Курс по своему стэку', kind: 'Курс', status: 'in_progress', when: 'обновится' },
    { title: 'Доклад на внутренний митап', kind: 'Доклад', status: 'planned', when: 'Q3 2026' },
  ];

  return (
    <div className="profile-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="section-h">
            <div>
              <div className="section-title">Цели на Q2 2026</div>
              <div className="section-sub">{okrs.length} цели · обновлено 11 мая</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm">Прошлые кварталы</button>
              <button className="btn btn-sm"><Icon name="plus" size={13} /> Добавить</button>
            </div>
          </div>

          {okrs.map(g => (
            <div key={g.id} className="okr">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{g.title}</span>
                <span className={`pill ${g.status === 'done' ? 'pill-ok' : g.status === 'risk' ? 'pill-miss' : 'pill-info'}`}>
                  <span className="dot" />
                  {g.status === 'done' ? 'Готово' : g.status === 'risk' ? 'Под риском' : 'В работе'}
                </span>
              </div>
              <div className="okr-bar">
                <div className="okr-bar-fill" style={{
                  width: `${g.progress}%`,
                  background: g.status === 'done' ? 'var(--ok)' : g.status === 'risk' ? 'var(--miss)' : 'var(--accent)'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
                <span><b className="mono num" style={{ color: 'var(--ink-2)' }}>{g.progress}%</b> · {g.kr}</span>
                <span>дедлайн: {g.due}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="section-h">
            <div>
              <div className="section-title">План развития</div>
              <div className="section-sub">Курсы, доклады, менторство</div>
            </div>
            <button className="btn btn-sm"><Icon name="plus" size={13} /> Добавить</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {grow.map((g, i) => (
              <div key={i} className="dev-item">
                <span className={`dev-dot ${g.status}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span className="pill" style={{ height: 18, fontSize: 10.5 }}>{g.kind}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{g.when}</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>Карьерный трек</div>
          <div className="career">
            <div className="career-step done">
              <div className="cs-dot" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Middle Frontend</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>2023 — июнь 2024</div>
              </div>
            </div>
            <div className="career-step current">
              <div className="cs-dot" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Senior Frontend
                  <span className="pill pill-accent" style={{ height: 18, fontSize: 10, marginLeft: 6 }}>текущий</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>с июня 2024 · 23 мес.</div>
              </div>
            </div>
            <div className="career-step next">
              <div className="cs-dot" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Lead Frontend</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>цель — Q4 2026</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Менторство</div>
          {isAnna ? (
            <div className="mentor-row">
              <Avatar name="Тимур Хасанов" hue={260} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Тимур Хасанов</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Junior Frontend · подопечный с янв 2026</div>
              </div>
              <span className="pill pill-ok"><span className="dot" /> Активно</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Не назначено</div>
          )}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Компетенции</div>
          {[
            ['Технические навыки', 8],
            ['Коммуникация', 9],
            ['Менторство', 7],
            ['Самостоятельность', 9],
            ['Influence', 6],
          ].map(([label, val]) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--ink-2)' }}>{label}</span>
                <span className="mono num" style={{ color: 'var(--ink-3)' }}>{val}/10</span>
              </div>
              <div className="okr-bar"><div className="okr-bar-fill" style={{ width: `${val * 10}%`, background: 'var(--accent)' }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  PROFILE TAB — Поля встреч (per-employee override)
// ═══════════════════════════════════════════════════════════════════
function FieldsTab({ member }) {
  const [preset, setPreset] = React.useState('default');
  const fields = DEFAULT_FIELDS;

  return (
    <div>
      <div className="info-banner" style={{ marginBottom: 14 }}>
        <Icon name="spark" size={16} />
        <div style={{ flex: 1 }}>
          <b style={{ fontWeight: 600 }}>Поля встреч для {member.name.split(' ')[0]}</b><br />
          <span style={{ color: 'var(--ink-3)' }}>
            По умолчанию подтягиваются из выбранного шаблона. Локальные изменения применяются только к встречам с этим сотрудником.
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="section-title">Шаблон для встреч</div>
            <div className="section-sub">11 полей · можно добавлять, скрывать, переупорядочивать</div>
          </div>
          <select className="select" value={preset} onChange={e => setPreset(e.target.value)}
                  style={{ width: 'auto', height: 34, fontSize: 12.5 }}>
            <option value="default">Базовый набор</option>
            <option value="review">Performance review</option>
            <option value="onboarding">Onboarding 90 дней</option>
            <option value="custom">Кастомный для {member.name.split(' ')[0]}</option>
          </select>
          <button className="btn btn-sm"><Icon name="copy" size={13} /> Скопировать как кастомный</button>
        </div>

        {fields.map((f, i) => (
          <div key={f.id} className="field-row">
            <span className="mono num">{String(i + 1).padStart(2, '0')}</span>
            <span className="grip">⋮⋮</span>
            <div className="fr-meta">
              <div className="fr-t">{f.title} {f.required && <span style={{ color: 'var(--miss)' }}>*</span>}</div>
              <div className="fr-d"><span className="type-tag">{labelForType(f.type)}</span></div>
            </div>
            <span className="pill" style={{ height: 20, fontSize: 10.5 }}>из шаблона</span>
            <button className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
            <button className="btn btn-ghost btn-icon btn-sm"><Icon name="copy" size={13} /></button>
            <button className="btn btn-ghost btn-icon btn-sm"><Icon name="trash" size={13} /></button>
          </div>
        ))}

        <button className="btn" style={{ marginTop: 12 }}>
          <Icon name="plus" size={14} /> Добавить локальное поле
        </button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  PROFILE TAB — Файлы
// ═══════════════════════════════════════════════════════════════════
function FilesTab({ member }) {
  const d = (y, mo, day) => new Date(y, mo - 1, day);
  const isAnna = member.id === 't1';

  const files = isAnna ? [
    { id: 'f1', name: 'ADR-014_shared-state.md',        size: '12 KB',  date: d(2026, 5, 11), kind: 'doc',   meet: '1-2-1 от 11 мая', author: 'Анна' },
    { id: 'f2', name: 'screen_admin_dashboard.png',     size: '1.2 MB', date: d(2026, 5, 11), kind: 'img',   meet: '1-2-1 от 11 мая', author: 'Анна' },
    { id: 'f3', name: 'demo_recording_admin.mp4',       size: '48 MB',  date: d(2026, 4, 27), kind: 'video', meet: '1-2-1 от 27 апр', author: 'Е. Глебов' },
    { id: 'f4', name: 'roadmap_q2_anna.xlsx',           size: '64 KB',  date: d(2026, 4, 13), kind: 'sheet', meet: '1-2-1 от 13 апр', author: 'Е. Глебов' },
    { id: 'f5', name: 'mentorship_plan_timur.pdf',      size: '184 KB', date: d(2026, 3, 30), kind: 'pdf',   meet: '1-2-1 от 30 мар', author: 'Анна' },
    { id: 'f6', name: 'okr_q2_draft.docx',              size: '92 KB',  date: d(2026, 3, 16), kind: 'doc',   meet: '1-2-1 от 16 мар', author: 'Анна' },
    { id: 'f7', name: 'feedback_360_anna_q1.pdf',       size: '256 KB', date: d(2026, 3,  2), kind: 'pdf',   meet: 'Q1 review',       author: 'HR' },
  ] : [
    { id: 'f1', name: 'goals_q2.docx',     size: '48 KB',  date: d(2026, 5, 14), kind: 'doc',   meet: 'Последняя встреча', author: member.name.split(' ')[0] },
    { id: 'f2', name: 'screen.png',        size: '420 KB', date: d(2026, 4, 27), kind: 'img',   meet: '1-2-1 от 27 апр',   author: 'Е. Глебов' },
    { id: 'f3', name: 'notes.md',          size: '8 KB',   date: d(2026, 4, 13), kind: 'doc',   meet: '1-2-1 от 13 апр',   author: 'Е. Глебов' },
  ];

  const [view, setView] = React.useState('list');
  const [kindFilter, setKindFilter] = React.useState('all');

  const visible = files.filter(f => kindFilter === 'all' || f.kind === kindFilter);

  const totalSize = (() => {
    let kb = 0;
    files.forEach(f => {
      const [n, u] = f.size.split(' ');
      const v = parseFloat(n);
      kb += u === 'MB' ? v * 1024 : v;
    });
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  })();

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={kindFilter === 'all' ? 'on' : ''} onClick={() => setKindFilter('all')}>Все · {files.length}</button>
          <button className={kindFilter === 'doc' ? 'on' : ''} onClick={() => setKindFilter('doc')}>Документы</button>
          <button className={kindFilter === 'img' ? 'on' : ''} onClick={() => setKindFilter('img')}>Изображения</button>
          <button className={kindFilter === 'video' ? 'on' : ''} onClick={() => setKindFilter('video')}>Видео</button>
          <button className={kindFilter === 'pdf' ? 'on' : ''} onClick={() => setKindFilter('pdf')}>PDF</button>
          <button className={kindFilter === 'sheet' ? 'on' : ''} onClick={() => setKindFilter('sheet')}>Таблицы</button>
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Список</button>
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>Плитки</button>
        </div>
        <button className="btn btn-sm"><Icon name="download" size={13} /> Скачать .zip</button>
      </div>

      <div className="card" style={{
        padding: 16, marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 18,
        background: 'var(--bg-tint)'
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Всего</div>
          <div className="mono num" style={{ fontSize: 18, fontWeight: 700 }}>{files.length} <span style={{ color: 'var(--ink-3)', fontSize: 13, fontWeight: 500 }}>файлов</span></div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Объём</div>
          <div className="mono num" style={{ fontSize: 18, fontWeight: 700 }}>{totalSize}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Последний</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtShort(files[0].date)} 2026</div>
        </div>
        <div style={{ marginLeft: 'auto', maxWidth: 420, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Файлы хранятся в защищённом облаке. Доступ — только у участников 1-2-1 и HR-администратора.
        </div>
      </div>

      {view === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="file-row head">
            <div></div>
            <div>Файл</div>
            <div>Из встречи</div>
            <div>Автор</div>
            <div>Размер</div>
            <div></div>
          </div>
          {visible.map(f => (
            <div key={f.id} className="file-row">
              <div className={`file-icon ${f.kind}`}>
                <FileGlyph kind={f.kind} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{fmtLong(f.date)}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{f.meet}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{f.author}</div>
              <div className="mono num" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{f.size}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="download" size={13} /></button>
                <button className="btn btn-ghost btn-icon btn-sm"><Icon name="more" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {visible.map(f => (
            <div key={f.id} className="file-tile">
              <div className={`file-tile-thumb ${f.kind}`}>
                <FileGlyph kind={f.kind} size={36} />
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{fmtShort(f.date)} · {f.size}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 18, padding: '20px 18px',
        background: 'var(--bg-tint)',
        border: '1px dashed var(--line-strong)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 14,
        color: 'var(--ink-3)', fontSize: 13
      }}>
        <Icon name="paperclip" size={16} />
        <span>Перетащите файлы сюда или прикрепите их во время следующей 1-2-1.</span>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }}>Выбрать файлы</button>
      </div>
    </div>
  );
}

function FileGlyph({ kind, size = 20 }) {
  const map = {
    doc: 'DOC', img: 'IMG', video: 'MP4', sheet: 'XLS', pdf: 'PDF',
  };
  return <span className="mono" style={{ fontSize: size === 36 ? 13 : 10, fontWeight: 700, letterSpacing: '0.04em' }}>{map[kind] || 'FILE'}</span>;
}


// ═══════════════════════════════════════════════════════════════════
//  FILTER POPOVER — для списка команды
// ═══════════════════════════════════════════════════════════════════
function FilterPopover({ value, onChange, onClose }) {
  const v = value;
  const set = (patch) => onChange({ ...v, ...patch });
  const toggleTag = (t) => set({ tags: v.tags.includes(t) ? v.tags.filter(x => x !== t) : [...v.tags, t] });

  return (
    <React.Fragment>
      <div className="popover-scrim" onClick={onClose} />
      <div className="popover">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Фильтры</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="field-label">Роль</div>
          <select className="select" value={v.role} onChange={e => set({ role: e.target.value })}>
            <option value="all">Все роли</option>
            <option>Frontend</option>
            <option>Backend</option>
            <option>QA</option>
            <option>Design</option>
            <option>DevOps</option>
            <option>PM</option>
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="field-label">Стаж в компании</div>
          <div className="seg" style={{ width: '100%' }}>
            <button className={v.tenure === 'all' ? 'on' : ''} onClick={() => set({ tenure: 'all' })} style={{ flex: 1 }}>Все</button>
            <button className={v.tenure === 'new' ? 'on' : ''} onClick={() => set({ tenure: 'new' })} style={{ flex: 1 }}>&lt; 1 года</button>
            <button className={v.tenure === 'mid' ? 'on' : ''} onClick={() => set({ tenure: 'mid' })} style={{ flex: 1 }}>1–3 года</button>
            <button className={v.tenure === 'sen' ? 'on' : ''} onClick={() => set({ tenure: 'sen' })} style={{ flex: 1 }}>3+ года</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="field-label">Тренд настроения</div>
          <div className="seg" style={{ width: '100%' }}>
            <button className={v.mood === 'all' ? 'on' : ''} onClick={() => set({ mood: 'all' })} style={{ flex: 1 }}>Все</button>
            <button className={v.mood === 'up' ? 'on' : ''} onClick={() => set({ mood: 'up' })} style={{ flex: 1 }}>↑ растёт</button>
            <button className={v.mood === 'flat' ? 'on' : ''} onClick={() => set({ mood: 'flat' })} style={{ flex: 1 }}>→ ровно</button>
            <button className={v.mood === 'down' ? 'on' : ''} onClick={() => set({ mood: 'down' })} style={{ flex: 1 }}>↓ падает</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="field-label">Теги</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Mentor', 'Promotion', 'Lead Track', 'Onboarding', 'Burnout risk', 'PIP', 'Performance'].map(t => (
              <button key={t}
                className={`chip ${v.tags.includes(t) ? 'on' : ''}`}
                onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="field-label">Последняя 1-2-1</div>
          <div className="seg" style={{ width: '100%' }}>
            <button className={v.since === 'all' ? 'on' : ''} onClick={() => set({ since: 'all' })} style={{ flex: 1 }}>Все</button>
            <button className={v.since === 'w1' ? 'on' : ''} onClick={() => set({ since: 'w1' })} style={{ flex: 1 }}>&lt; 1 нед.</button>
            <button className={v.since === 'w2' ? 'on' : ''} onClick={() => set({ since: 'w2' })} style={{ flex: 1 }}>&lt; 2 нед.</button>
            <button className={v.since === 'w4' ? 'on' : ''} onClick={() => set({ since: 'w4' })} style={{ flex: 1 }}>&gt; 4 нед.</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onChange({ role: 'all', tenure: 'all', mood: 'all', tags: [], since: 'all' })}>
            Сбросить
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Применить
          </button>
        </div>
      </div>
    </React.Fragment>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  ADMIN: Команды
// ═══════════════════════════════════════════════════════════════════
function AdminTeams() {
  const [showAdd, setShowAdd] = React.useState(false);
  const teams = [
    { id: 't1', name: 'Платформа',         lead: 'Евгений Глебов',   members: 8, leadHue: 42,  newcount: 1, mood: 7.4,  status: 'ok' },
    { id: 't2', name: 'Команда роста',     lead: 'Ирина Власова',    members: 6, leadHue: 320, newcount: 0, mood: 7.8,  status: 'ok' },
    { id: 't3', name: 'Mobile',            lead: 'Артём Соловьёв',   members: 5, leadHue: 200, newcount: 2, mood: 6.9,  status: 'warn' },
    { id: 't4', name: 'Data Platform',     lead: 'Никита Лазарев',   members: 4, leadHue: 145, newcount: 0, mood: 8.1,  status: 'ok' },
    { id: 't5', name: 'Internal Tooling',  lead: '— не назначен —',  members: 3, leadHue: null, newcount: 0, mood: null,  status: 'miss' },
    { id: 't6', name: 'QA',                lead: 'Мария Соколова',   members: 4, leadHue: 320, newcount: 0, mood: 7.2,  status: 'ok' },
  ];

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Команды</h1>
          <p className="page-sub">6 команд · 30 сотрудников · 5 активных лидов</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icon name="download" size={14} /> Экспорт</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Новая команда</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat"><div className="lbl">Команд</div><div className="val num">6</div><div className="sub">в рабочем пространстве</div></div>
        <div className="stat"><div className="lbl">Сотрудников</div><div className="val num">30</div><div className="sub">из них 3 новых</div></div>
        <div className="stat"><div className="lbl">Без лида</div><div className="val num" style={{ color: 'var(--miss)' }}>1</div><div className="sub">требует назначения</div></div>
        <div className="stat"><div className="lbl">Avg. настроение</div><div className="val num">7.5<span style={{ fontSize: 14, color: 'var(--ink-3)', marginLeft: 4 }}>/10</span></div><div className="sub">↑ +0.2 за месяц</div></div>
      </div>

      <div className="team-table" style={{ marginTop: 8 }}>
        <div className="tt-row head" style={{ gridTemplateColumns: 'minmax(200px,1.4fr) 1.2fr 80px 80px 140px 44px' }}>
          <div>Команда</div><div>Лид</div><div>Сотрудников</div><div>Настроение</div><div>Статус</div><div></div>
        </div>
        {teams.map(t => (
          <div key={t.id} className="tt-row" style={{ gridTemplateColumns: 'minmax(200px,1.4fr) 1.2fr 80px 80px 140px 44px' }}>
            <div className="tt-name">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--bg-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--ink-2)',
              }} className="mono">{t.name.slice(0, 2).toUpperCase()}</div>
              <div className="meta">
                <div className="n">{t.name}</div>
                <div className="r">{t.newcount > 0 && <span className="pill pill-info" style={{ height: 18, fontSize: 10.5 }}>+{t.newcount} новых</span>}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {t.leadHue != null
                ? <React.Fragment><Avatar name={t.lead} hue={t.leadHue} size="sm" /><span style={{ fontSize: 13 }}>{t.lead}</span></React.Fragment>
                : <span style={{ fontSize: 13, color: 'var(--miss)', fontStyle: 'italic' }}>{t.lead}</span>}
            </div>
            <div className="mono num" style={{ fontSize: 14, fontWeight: 600 }}>{t.members}</div>
            <div>
              {t.mood != null
                ? <span className="mono num" style={{ fontSize: 13, fontWeight: 600 }}>{t.mood.toFixed(1)}</span>
                : <span style={{ color: 'var(--ink-4)' }}>—</span>}
            </div>
            <div>
              {t.status === 'ok' && <span className="pill pill-ok"><span className="dot" /> В графике</span>}
              {t.status === 'warn' && <span className="pill pill-warn"><span className="dot" /> Внимание</span>}
              {t.status === 'miss' && <span className="pill pill-miss"><span className="dot" /> Без лида</span>}
            </div>
            <div><button className="btn btn-ghost btn-icon btn-sm"><Icon name="more" size={14} /></button></div>
          </div>
        ))}
      </div>

      {showAdd && <AddTeamModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  ADMIN: Лиды
// ═══════════════════════════════════════════════════════════════════
function AdminLeads() {
  const leads = [
    { name: 'Евгений Глебов',   role: 'Lead, Платформа',         hue: 42,   teamSize: 8, on12: 87, lastActive: 'только что',   risk: 'low' },
    { name: 'Ирина Власова',     role: 'Lead, Команда роста',    hue: 320,  teamSize: 6, on12: 92, lastActive: '5 мин назад',  risk: 'low' },
    { name: 'Артём Соловьёв',    role: 'Lead, Mobile',           hue: 200,  teamSize: 5, on12: 64, lastActive: '2 дн. назад',  risk: 'med' },
    { name: 'Никита Лазарев',    role: 'Lead, Data Platform',    hue: 145,  teamSize: 4, on12: 78, lastActive: 'вчера',         risk: 'low' },
    { name: 'Мария Соколова',    role: 'Lead, QA',                hue: 320,  teamSize: 4, on12: 41, lastActive: '8 дн. назад',  risk: 'high' },
  ];

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Лиды</h1>
          <p className="page-sub">5 активных лидов · средняя дисциплина 1-2-1 — 72%</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icon name="mail" size={14} /> Рассылка</button>
          <button className="btn btn-primary"><Icon name="plus" size={14} /> Назначить лида</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="lead-row head">
          <div>Лид</div><div>Команда</div><div>Дисциплина 1-2-1</div><div>Последняя активность</div><div>Риск</div><div></div>
        </div>
        {leads.map(l => (
          <div key={l.name} className="lead-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <Avatar name={l.name} hue={l.hue} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{l.role}</div>
              </div>
            </div>
            <div className="mono num" style={{ fontSize: 13 }}>{l.teamSize} чел.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 12 }}>
              <div className="okr-bar" style={{ flex: 1 }}>
                <div className="okr-bar-fill" style={{ width: `${l.on12}%`, background: l.on12 < 50 ? 'var(--miss)' : l.on12 < 75 ? 'var(--warn)' : 'var(--ok)' }} />
              </div>
              <span className="mono num" style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>{l.on12}%</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{l.lastActive}</div>
            <div>
              {l.risk === 'low'  && <span className="pill pill-ok"><span className="dot" /> Низкий</span>}
              {l.risk === 'med'  && <span className="pill pill-warn"><span className="dot" /> Средний</span>}
              {l.risk === 'high' && <span className="pill pill-miss"><span className="dot" /> Высокий</span>}
            </div>
            <div><button className="btn btn-ghost btn-icon btn-sm"><Icon name="more" size={14} /></button></div>
          </div>
        ))}
      </div>

      <div className="info-banner" style={{ marginTop: 16 }}>
        <Icon name="shield" size={16} />
        <div>
          <b style={{ fontWeight: 600 }}>Что значит «дисциплина 1-2-1»</b><br />
          <span style={{ color: 'var(--ink-3)' }}>
            % сотрудников команды, с которыми лид провёл 1-2-1 за последние 30 дней. Цель — &gt; 80% для здорового регулярного ритма.
          </span>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  ADMIN: Настройки рабочего пространства
// ═══════════════════════════════════════════════════════════════════
function AdminSettings() {
  const [sec, setSec] = React.useState('general');
  const [autoReminder, setAutoReminder] = React.useState(true);
  const [allowExport, setAllowExport] = React.useState(true);
  const [requireMood, setRequireMood] = React.useState(true);
  const [retention, setRetention] = React.useState('forever');
  const [cadence, setCadence] = React.useState('2w');

  const sections = [
    { id: 'general',  label: 'Общие',       icon: 'settings' },
    { id: 'access',   label: 'Доступ и безопасность', icon: 'shield' },
    { id: 'integrations', label: 'Интеграции', icon: 'team' },
    { id: 'data',     label: 'Данные и приватность', icon: 'fields' },
    { id: 'billing',  label: 'Тариф',       icon: 'star' },
  ];

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">Рабочее пространство · «BeeTeam · Платформа»</p>
        </div>
        <button className="btn btn-primary"><Icon name="check" size={14} /> Сохранить изменения</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map(s => (
            <div key={s.id} className={`nav-item ${sec === s.id ? 'active' : ''}`} onClick={() => setSec(s.id)}>
              <Icon className="nav-icon" name={s.icon} size={15} /> {s.label}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sec === 'general' && (
            <React.Fragment>
              <div className="card" style={{ padding: 22 }}>
                <div className="section-title" style={{ marginBottom: 4 }}>Идентификация</div>
                <div className="section-sub" style={{ marginBottom: 16 }}>Название рабочего пространства, домены, логотип</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div className="field-label">Название</div>
                    <input className="input" defaultValue="BeeTeam · Платформа" />
                  </div>
                  <div>
                    <div className="field-label">Домен входа</div>
                    <input className="input" defaultValue="beeteam.io" />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 22 }}>
                <div className="section-title" style={{ marginBottom: 16 }}>Регулярность 1-2-1 по умолчанию</div>
                <div className="seg" style={{ width: 'auto' }}>
                  <button className={cadence === '1w' ? 'on' : ''} onClick={() => setCadence('1w')}>Раз в неделю</button>
                  <button className={cadence === '2w' ? 'on' : ''} onClick={() => setCadence('2w')}>Раз в две недели</button>
                  <button className={cadence === '4w' ? 'on' : ''} onClick={() => setCadence('4w')}>Раз в месяц</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.5 }}>
                  Лиды могут изменить ритм для конкретного сотрудника на странице профиля.
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <SettingsRow label="Автонапоминания лидам" desc="Письмо за 24 часа до плановой 1-2-1 и при просрочке"
                             value={autoReminder} onChange={setAutoReminder} />
                <SettingsRow label="Поле «Настроение» обязательно" desc="Сотрудник не сможет завершить встречу без оценки"
                             value={requireMood} onChange={setRequireMood} />
                <SettingsRow label="Экспорт в Excel доступен лидам" desc="Иначе только HR-администратор"
                             value={allowExport} onChange={setAllowExport} last />
              </div>
            </React.Fragment>
          )}

          {sec === 'access' && (
            <React.Fragment>
              <div className="card" style={{ padding: 22 }}>
                <div className="section-title" style={{ marginBottom: 14 }}>SSO и аутентификация</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--line)', borderRadius: 10, marginBottom: 10 }}>
                  <div className="ad-tile" style={{ width: 18, height: 18 }}><i /><i /><i /><i /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Active Directory</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Подключено · sync 3 мин назад</div>
                  </div>
                  <span className="pill pill-ok"><span className="dot" /> Активно</span>
                  <button className="btn btn-sm">Настроить</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px dashed var(--line)', borderRadius: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--bg-tint)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>SAML SSO</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Не настроено</div>
                  </div>
                  <button className="btn btn-sm">Подключить</button>
                </div>
              </div>

              <div className="card" style={{ padding: 22 }}>
                <div className="section-title" style={{ marginBottom: 4 }}>Доступ к чужим командам</div>
                <div className="section-sub" style={{ marginBottom: 14 }}>Кто может видеть заметки и историю встреч</div>
                <div className="check on" onClick={() => {}}>
                  <span className="box" />
                  <div><div style={{ fontSize: 13.5 }}>Лид видит только свою команду</div>
                       <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Рекомендуется по умолчанию</div></div>
                </div>
                <div className="check" onClick={() => {}}>
                  <span className="box" />
                  <div><div style={{ fontSize: 13.5 }}>HR-администратор видит все встречи</div>
                       <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Только агрегированную статистику</div></div>
                </div>
                <div className="check" onClick={() => {}}>
                  <span className="box" />
                  <div><div style={{ fontSize: 13.5 }}>CTO видит скип-уровень встречи</div>
                       <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Доступ только к шаблону «Скип-уровень»</div></div>
                </div>
              </div>
            </React.Fragment>
          )}

          {sec === 'integrations' && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-title" style={{ marginBottom: 14 }}>Интеграции</div>
              {[
                { name: 'Google Calendar', desc: 'Двусторонняя синхронизация событий 1-2-1', status: 'connected' },
                { name: 'Slack',            desc: 'Уведомления о встречах в личку', status: 'connected' },
                { name: 'Outlook / Exchange', desc: 'Корпоративный календарь', status: 'available' },
                { name: 'Jira',             desc: 'Линковать цели на эпики и задачи', status: 'available' },
                { name: 'Webhooks',         desc: 'Отправлять события 1-2-1 во внешние системы', status: 'available' },
              ].map(it => (
                <div key={it.name} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 14, border: '1px solid var(--line)', borderRadius: 10,
                  marginBottom: 8,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-tint)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{it.desc}</div>
                  </div>
                  {it.status === 'connected'
                    ? <span className="pill pill-ok"><span className="dot" /> Подключено</span>
                    : <button className="btn btn-sm">Подключить</button>}
                </div>
              ))}
            </div>
          )}

          {sec === 'data' && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Срок хранения заметок 1-2-1</div>
              <div className="section-sub" style={{ marginBottom: 14 }}>После увольнения сотрудника</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  ['forever', 'Хранить бессрочно', 'Удалить можно только вручную'],
                  ['y3', '3 года', 'Стандарт для большинства юрисдикций'],
                  ['y1', '1 год', 'Минимум для отчётности'],
                  ['m6', '6 месяцев', 'Жёсткий режим приватности'],
                ].map(([v, l, d]) => (
                  <div key={v} className={`check ${retention === v ? 'on' : ''}`} onClick={() => setRetention(v)}>
                    <span className="box" />
                    <div><div style={{ fontSize: 13.5 }}>{l}</div>
                         <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d}</div></div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 18, padding: 14,
                background: 'var(--miss-soft)',
                border: '1px solid rgba(192,74,59,0.2)',
                borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 12,
                fontSize: 12.5, color: 'var(--miss)',
              }}>
                <Icon name="shield" size={16} />
                <div style={{ flex: 1, color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--miss)' }}>Опасная зона.</b> Удалить все заметки 1-2-1 нельзя восстановить.
                </div>
                <button className="btn btn-sm" style={{ color: 'var(--miss)' }}>Удалить всё</button>
              </div>
            </div>
          )}

          {sec === 'billing' && (
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <span className="pill pill-accent" style={{ height: 28, padding: '0 12px', fontSize: 13 }}>Business</span>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                  до 50 сотрудников · ежемесячный платёж · следующий счёт 01 июн
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 22 }}>
                <div className="stat">
                  <div className="lbl">Сотрудников</div>
                  <div className="val num">30<span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/50</span></div>
                  <div className="sub">60% от лимита</div>
                </div>
                <div className="stat">
                  <div className="lbl">К оплате 1 июн</div>
                  <div className="val num">₽ 22 500</div>
                  <div className="sub">750 ₽ × 30</div>
                </div>
                <div className="stat">
                  <div className="lbl">Способ оплаты</div>
                  <div className="val" style={{ fontSize: 16 }}>•••• 4242</div>
                  <div className="sub">Visa, до 12/27</div>
                </div>
              </div>

              <button className="btn">Сменить тариф</button>
              <button className="btn btn-ghost" style={{ marginLeft: 8 }}>История платежей</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsRow({ label, desc, value, onChange, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 22px',
      borderBottom: last ? 'none' : '1px solid var(--line-2)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        className={`switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}>
        <span className="thumb" />
      </button>
    </div>
  );
}

Object.assign(window, {
  CalendarScreen, FieldsLibraryScreen,
  GoalsTab, FieldsTab, FilesTab,
  FilterPopover,
  AdminTeams, AdminLeads, AdminSettings,
});
