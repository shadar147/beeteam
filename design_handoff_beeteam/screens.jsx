// BeeTeam — экраны: Login, TeamList, EmployeeProfile, MeetingDrawer

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, accent }) {
  const [email, setEmail] = React.useState('e.glebov@beeteam.io');
  const [pwd, setPwd] = React.useState('••••••••••');
  const [showPwd, setShowPwd] = React.useState(false);
  const [remember, setRemember] = React.useState(true);

  return (
    <div className="login-shell">
      <div className="login-art">
        <div className="hive" />
        <div className="hex-grid">
          <i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className="login-art-inner">
          <div className="logo" style={{ fontSize: 16 }}>
            <span className="logo-mark">B</span> BeeTeam
          </div>
          <div className="login-quote">
            <span className="accent">1-2-1, которые не теряются.</span><br />
            История разговоров, настроение команды и развитие — в одном рабочем пространстве.
          </div>
          <div className="login-foot">
            <span>© BeeTeam 2026</span>
            <span style={{ color: 'var(--line-strong)' }}>·</span>
            <span>Политика конфиденциальности</span>
            <span style={{ color: 'var(--line-strong)' }}>·</span>
            <span>Безопасность</span>
          </div>
        </div>
      </div>

      <div className="login-form-wrap">
        <div className="login-form">
          <h1>С возвращением</h1>
          <p className="lede">Войдите в рабочее пространство своей команды.</p>

          <div className="stack">
            <div>
              <label className="field-label">Корпоративная почта</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="name@company.com" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="field-label">Пароль</label>
                <span className="tiny-link">Забыли пароль?</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPwd ? 'text' : 'password'}
                       value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" />
                <button className="btn btn-ghost btn-icon btn-sm"
                  style={{ position: 'absolute', right: 4, top: 4 }}
                  onClick={() => setShowPwd(v => !v)} aria-label="show password">
                  <Icon name={showPwd ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </div>

            <label className="check" style={{ padding: '6px 0', userSelect: 'none' }}
                   onClick={() => setRemember(v => !v)}>
              <span className={`box ${remember ? '' : ''}`} style={remember ? {background: 'var(--accent)', borderColor: 'var(--accent-strong)'} : {}}>
                {remember && <svg width="9" height="5" viewBox="0 0 9 5" style={{display:'block'}}>
                  <path d="M1 2.5 3.5 4.5 8 0.5" stroke="#1A1100" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
              </span>
              <span className="lbl" style={{ fontSize: 13 }}>Оставаться в системе на этом устройстве</span>
            </label>

            <button className="btn btn-primary btn-lg" onClick={onLogin}
                    style={{ width: '100%', justifyContent: 'center' }}>
              Войти <Icon name="arrow" size={16} />
            </button>
          </div>

          <div className="divider">или</div>

          <button className="ad-btn" onClick={onLogin}>
            <span className="ad-tile"><i /><i /><i /><i /></span>
            Войти через Active Directory
          </button>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 22, lineHeight: 1.5 }}>
            <Icon name="shield" size={12} /> Доменная учётная запись синхронизируется автоматически.
            Если вы не нашли свою команду — обратитесь к HR-администратору.
          </p>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  APP SHELL (Sidebar + Topbar)
// ═══════════════════════════════════════════════════════════════════
function Sidebar({ route, setRoute, user }) {
  const nav = [
    { id: 'team',     label: 'Моя команда', icon: 'team',    count: 8 },
    { id: 'calendar', label: 'Календарь',   icon: 'calendar', count: 4 },
    { id: 'grades',   label: 'Грейды',      icon: 'layers' },
    { id: 'fields',   label: 'Конструктор полей', icon: 'fields' },
    { id: 'export',   label: 'Экспорт',     icon: 'download' },
  ];
  const admin = [
    { id: 'admin-team', label: 'Команды', icon: 'team' },
    { id: 'admin-leads', label: 'Лиды',  icon: 'user' },
    { id: 'admin-settings', label: 'Настройки', icon: 'settings' },
  ];

  const goto = (id) => {
    if (id === 'team' || id === 'profile') setRoute({ name: id === 'team' ? 'team' : route.name });
    else setRoute({ name: id });
  };

  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
        <div className="logo">
          <span className="logo-mark">B</span> BeeTeam
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" title="Уведомления">
          <Icon name="bell" size={15} />
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Команда</div>
        {nav.map(item => (
          <div key={item.id}
               className={`nav-item ${(route.name === item.id || (item.id === 'team' && route.name === 'profile')) ? 'active' : ''}`}
               onClick={() => goto(item.id)}>
            <Icon className="nav-icon" name={item.icon} size={16} />
            {item.label}
            {item.count != null && <span className="nav-count">{item.count}</span>}
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Администрирование</div>
        {admin.map(item => (
          <div key={item.id}
               className={`nav-item ${route.name === item.id ? 'active' : ''}`}
               onClick={() => goto(item.id)}>
            <Icon className="nav-icon" name={item.icon} size={16} />
            {item.label}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 10, borderRadius: 10,
          border: '1px solid var(--line)', background: 'var(--bg-elev)'
        }}>
          <Avatar name={user.name} hue={42} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>{user.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{user.role}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" title="Выйти">
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  TEAM LIST
// ═══════════════════════════════════════════════════════════════════
function TeamList({ data, onOpenMember, onScheduleMeeting }) {
  const [q, setQ] = React.useState('');
  const [tab, setTab] = React.useState('all');
  const [showFilter, setShowFilter] = React.useState(false);
  const [showAddEmp, setShowAddEmp] = React.useState(false);
  const [filter, setFilter] = React.useState({ role: 'all', tenure: 'all', mood: 'all', tags: [], since: 'all' });
  const filterCount = (filter.role !== 'all' ? 1 : 0) + (filter.tenure !== 'all' ? 1 : 0) +
                      (filter.mood !== 'all' ? 1 : 0) + filter.tags.length + (filter.since !== 'all' ? 1 : 0);

  const today = data.today;
  const team = data.team;

  // metrics
  const overdue = team.filter(m => daysBetween(today, m.lastMeet) > 21).length;
  const scheduledThisWeek = team.filter(m =>
    m.nextMeet && daysBetween(m.nextMeet, today) >= 0 && daysBetween(m.nextMeet, today) <= 7).length;
  const avgMood = (
    team.reduce((s, m) => s + m.moodTrend[m.moodTrend.length - 1], 0) / team.length
  ).toFixed(1);
  const totalNotes = 42;

  const filtered = team.filter(m => {
    if (q && !(m.name.toLowerCase().includes(q.toLowerCase()) || m.role.toLowerCase().includes(q.toLowerCase()))) return false;
    if (tab === 'overdue') return daysBetween(today, m.lastMeet) > 21;
    if (tab === 'this-week') return m.nextMeet && daysBetween(m.nextMeet, today) >= 0 && daysBetween(m.nextMeet, today) <= 7;
    if (tab === 'attention') return m.status !== 'ok';
    return true;
  });

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Моя команда</h1>
          <p className="page-sub">8 человек · Платформенный отдел · Q2 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn">
            <Icon name="download" size={14} /> Экспорт в Excel
          </button>
          <button className="btn" onClick={() => setShowAddEmp(true)}>
            <Icon name="plus" size={14} /> Сотрудник
          </button>
          <button className="btn btn-primary" onClick={() => onScheduleMeeting()}>
            <Icon name="plus" size={14} /> Новая 1-2-1
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat">
          <div className="lbl">На этой неделе</div>
          <div className="val num">{scheduledThisWeek}</div>
          <div className="sub">запланировано встреч</div>
          <span className="accent-dot" />
        </div>
        <div className="stat">
          <div className="lbl">Просрочены</div>
          <div className="val num" style={{ color: overdue > 0 ? 'var(--miss)' : 'var(--ink)' }}>{overdue}</div>
          <div className="sub">{overdue ? 'давно не виделись' : 'все встречи в графике'}</div>
        </div>
        <div className="stat">
          <div className="lbl">Среднее настроение</div>
          <div className="val num">{avgMood}<span style={{fontSize:14,color:'var(--ink-3)',marginLeft:4}}>/10</span></div>
          <div className="sub">↑ +0.4 за месяц</div>
        </div>
        <div className="stat">
          <div className="lbl">Заметок за квартал</div>
          <div className="val num">{totalNotes}</div>
          <div className="sub">по всей команде</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input">
          <Icon name="search" />
          <input className="input" placeholder="Поиск по имени или роли"
                 value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="seg">
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>Все</button>
          <button className={tab === 'this-week' ? 'on' : ''} onClick={() => setTab('this-week')}>На этой неделе</button>
          <button className={tab === 'overdue' ? 'on' : ''} onClick={() => setTab('overdue')}>Просрочены</button>
          <button className={tab === 'attention' ? 'on' : ''} onClick={() => setTab('attention')}>Требуют внимания</button>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button className={`btn btn-sm ${filterCount > 0 ? 'btn-filter-on' : ''}`} onClick={() => setShowFilter(v => !v)}>
            <Icon name="filter" size={13} /> Фильтр
            {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
          </button>
          {showFilter && (
            <FilterPopover value={filter} onChange={setFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
      </div>

      <div className="team-table">
        <div className="tt-row head">
          <div>Сотрудник</div>
          <div>Последняя 1-2-1</div>
          <div>Следующая встреча</div>
          <div>Настроение, тренд</div>
          <div>Статус</div>
          <div></div>
        </div>
        {filtered.map(m => {
          const lastAgo = daysBetween(today, m.lastMeet);
          const nextIn  = m.nextMeet ? daysBetween(m.nextMeet, today) : null;
          const meet = m.moodTrend[m.moodTrend.length - 1];
          const max = Math.max(...m.moodTrend);
          return (
            <div key={m.id} className="tt-row" onClick={() => onOpenMember(m)}>
              <div className="tt-name">
                <Avatar name={m.name} hue={m.hue} size="md" />
                <div className="meta">
                  <div className="n">{m.name}</div>
                  <div className="r">
                    <span className="role-text">{m.role}</span>
                    {m.tags.map(t => (
                      <span key={t} className="pill pill-accent" style={{ height: 18, fontSize: 10.5 }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="tt-last">
                <div className="d">{fmtShort(m.lastMeet)} 2026</div>
                <div className="ago">{relativeAgo(m.lastMeet, today)}</div>
              </div>
              <div className="tt-last">
                <div className="d">{m.nextMeet ? `${fmtShort(m.nextMeet)} 2026` : '—'}</div>
                <div className="ago">{m.nextMeet ? relativeAgo(m.nextMeet, today) : 'не назначено'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mood-trend">
                  {m.moodTrend.map((v, i) => (
                    <i key={i} style={{
                      height: `${4 + v * 1.4}px`,
                      opacity: 0.35 + (i / m.moodTrend.length) * 0.65,
                      background: v >= 7 ? 'var(--accent)' : v >= 5 ? 'var(--warn)' : 'var(--miss)'
                    }} />
                  ))}
                </span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {meet.toFixed(1)}
                </span>
              </div>
              <div>
                {m.status === 'ok'   && <span className="pill pill-ok">   <span className="dot" /> В графике</span>}
                {m.status === 'warn' && <span className="pill pill-warn"> <span className="dot" /> Внимание</span>}
                {m.status === 'miss' && <span className="pill pill-miss"> <span className="dot" /> Просрочена</span>}
              </div>
              <div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); }}>
                  <Icon name="more" size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 18,
        padding: '14px 18px',
        background: 'var(--bg-tint)',
        border: '1px dashed var(--line-strong)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 12,
        color: 'var(--ink-3)',
        fontSize: 13,
      }}>
        <Icon name="plus" size={14} />
        <span>Добавить сотрудника в команду — он получит приглашение по email</span>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowAddEmp(true)}>Добавить</button>
      </div>

      {showAddEmp && <AddEmployeeModal onClose={() => setShowAddEmp(false)} />}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  EMPLOYEE PROFILE
// ═══════════════════════════════════════════════════════════════════
function EmployeeProfile({ data, member, history, onBack, onOpenMeeting, onStartMeeting, onStartReview }) {
  const today = data.today;
  const [calMonth, setCalMonth] = React.useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = React.useState(history.find(h => h.state === 'done'));
  const [tab, setTab] = React.useState('history');

  // build month grid
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startDow = (firstDay.getDay() + 6) % 7; // понедельник = 0
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const daysPrev = new Date(calMonth.getFullYear(), calMonth.getMonth(), 0).getDate();

  const cells = [];
  for (let i = startDow; i > 0; i--) {
    cells.push({ date: new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, daysPrev - i + 1), dim: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(calMonth.getFullYear(), calMonth.getMonth(), d), dim: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), dim: true });
  }

  const meetingOn = (date) => history.find(h => sameDay(h.date, date));

  const sorted = [...history].sort((a, b) => b.date - a.date);

  return (
    <div className="content">
      <div className="topbar-crumbs" style={{ marginBottom: 14 }}>
        <span onClick={onBack} style={{ cursor: 'default' }}>← Моя команда</span>
        <span className="sep">/</span>
        <span className="cur">{member.name}</span>
      </div>

      <div className="profile-header">
        <Avatar name={member.name} hue={member.hue} size="xl" />
        <div>
          <h2 className="profile-name">{member.name}</h2>
          <div className="profile-meta">
            <span>{member.role}</span><span className="sep">·</span>
            <span>с {member.joined}</span><span className="sep">·</span>
            <span>{member.email}</span><span className="sep">·</span>
            <span>{member.tz}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {window.BT_GRADES && window.BT_GRADES.members[member.id] && (
              <span className="pill pill-accent" style={{ fontWeight: 600 }}>
                <Icon name="layers" size={11} /> {gradeCode(window.BT_GRADES.members[member.id].grade)} {gradeName(window.BT_GRADES.members[member.id].grade)}
                {window.BT_GRADES.members[member.id].target > window.BT_GRADES.members[member.id].grade &&
                  <span style={{ opacity: 0.7 }}>→ {gradeCode(window.BT_GRADES.members[member.id].target)}</span>}
              </span>
            )}
            <span className="pill pill-ok"><span className="dot" /> В графике</span>
            <span className="pill"><Icon name="clock" size={11} /> 12 встреч за год</span>
            <span className="pill pill-accent"><Icon name="spark" size={11} /> Настроение {member.moodTrend[member.moodTrend.length-1]}/10</span>
            {member.tags.map(t => <span key={t} className="pill pill-info">{t}</span>)}
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn">
            <Icon name="mail" size={14} /> Написать
          </button>
          <button className="btn">
            <Icon name="download" size={14} /> Экспорт
          </button>
          <button className="btn btn-primary" onClick={onStartMeeting}>
            <Icon name="plus" size={14} /> Начать 1-2-1
          </button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>История 1-2-1</button>
        <button className={tab === 'grade' ? 'on' : ''} onClick={() => setTab('grade')}>Грейд</button>
        <button className={tab === 'goals' ? 'on' : ''} onClick={() => setTab('goals')}>Цели и развитие</button>
        <button className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>Поля встреч</button>
        <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Файлы</button>
      </div>

      {tab === 'grade'  && <GradeTab  member={member} onStartReview={onStartReview} />}
      {tab === 'goals'  && <GoalsTab  member={member} />}
      {tab === 'fields' && <FieldsTab member={member} />}
      {tab === 'files'  && <FilesTab  member={member} />}

      {tab === 'history' && (
      <div className="profile-grid">
        {/* Calendar + selected meeting detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="calendar">
            <div className="cal-head">
              <div className="cal-month">
                {RU_MONTHS_FULL[calMonth.getMonth()]} <small>{calMonth.getFullYear()}</small>
              </div>
              <div className="cal-nav">
                <button className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>
                  <Icon name="chevronL" size={14} />
                </button>
                <button className="btn btn-sm" onClick={() => setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
                  Сегодня
                </button>
                <button className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>
                  <Icon name="chevronR" size={14} />
                </button>
              </div>
            </div>
            <div className="cal-grid">
              {RU_DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
              {cells.map((c, i) => {
                const meeting = meetingOn(c.date);
                const isToday = sameDay(c.date, today);
                const isSel = selected && sameDay(selected.date, c.date);
                return (
                  <div key={i}
                       className={`cal-day ${c.dim ? 'dim' : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`}
                       onClick={() => meeting && setSelected(meeting)}>
                    <span className="n">{c.date.getDate()}</span>
                    {meeting && (
                      <span className={`ev ${meeting.state}`}>
                        <span style={{flexShrink:0}}>
                          {meeting.state === 'done' && '✓'}
                          {meeting.state === 'planned' && '○'}
                          {meeting.state === 'miss' && '✕'}
                        </span>
                        <span className="ev-label">
                          {meeting.state === 'planned' ? 'план' : meeting.state === 'miss' ? 'пропуск' : '1-2-1'}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected meeting detail */}
          {selected && selected.state === 'done' && (
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className="pill pill-ok"><span className="dot" /> Завершена</span>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                  1-2-1 · {fmtLong(selected.date)} · {selected.durationMin} мин
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => onOpenMeeting(selected)}>
                    <Icon name="edit" size={13} /> Редактировать
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm"><Icon name="more" size={14} /></button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div>
                  <div className="field-label">Настроение</div>
                  <div style={{ fontSize: 28 }}>{selected.mood} <span style={{ fontSize: 14, color: 'var(--ink-3)', verticalAlign: 'middle' }}>{selected.moodScore}/10</span></div>
                </div>
                <div>
                  <div className="field-label">Отношения в команде</div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{selected.relationships || '—'}</div>
                </div>
              </div>

              <NoteBlock title="Что блокирует / проблемы" text={selected.blockers} />
              <NoteBlock title="Цели на следующий период" text={selected.goals} />
              <NoteBlock title="Фидбек сотруднику" text={selected.feedbackTo} />
              <NoteBlock title="Фидбек от сотрудника" text={selected.feedbackFrom} />
              {selected.development && selected.development.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div className="field-label">Развитие и обучение</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.55 }}>
                    {selected.development.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {selected && selected.state === 'planned' && (
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span className="pill pill-info"><span className="dot" /> Запланирована</span>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                  1-2-1 · {fmtLong(selected.date)} · {selected.durationMin} мин
                </span>
              </div>
              <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: '6px 0 14px' }}>
                Встреча начнётся {relativeAgo(selected.date, today)}. Заметки появятся после проведения.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={onStartMeeting}>
                  <Icon name="send" size={13} /> Провести сейчас
                </button>
                <button className="btn">Перенести</button>
                <button className="btn btn-ghost">Отменить</button>
              </div>
            </div>
          )}
        </div>

        {/* Right-side feed */}
        <div className="feed history-feed">
          <div className="feed-head">
            <div className="feed-title">История встреч</div>
            <span className="pill">{history.length} всего</span>
          </div>
          <div className="feed-list">
            {sorted.map(m => {
              const active = selected && selected.id === m.id;
              return (
                <div key={m.id} className={`feed-item ${active ? 'active' : ''}`}
                     onClick={() => setSelected(m)}>
                  <div className="feed-date">
                    <div className="d">{m.date.getDate()}</div>
                    <div className="m">{RU_MONTHS[m.date.getMonth()]}</div>
                  </div>
                  <div className="feed-body">
                    <div className="row1">
                      <span className="ttl">
                        {m.state === 'planned' ? 'Запланирована' :
                         m.state === 'miss' ? 'Перенесена' : '1-2-1 встреча'}
                      </span>
                      {m.state === 'done' && m.mood && <span style={{ fontSize: 14 }}>{m.mood}</span>}
                      {m.state === 'planned' && <span className="pill pill-info" style={{ height: 18, fontSize: 10.5 }}>скоро</span>}
                      {m.state === 'miss' && <span className="pill pill-miss" style={{ height: 18, fontSize: 10.5 }}>пропуск</span>}
                    </div>
                    <div className="preview">
                      {m.state === 'done' ? (m.blockers || m.goals || '—') :
                       m.state === 'planned' ? `Запланирована на ${m.durationMin} минут. Откройте чтобы добавить тезисы.` :
                       'Встреча была перенесена. Назначьте новую дату.'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function NoteBlock({ title, text }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="field-label">{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{text}</div>
    </div>
  );
}

Object.assign(window, { LoginScreen, Sidebar, TeamList, EmployeeProfile });
