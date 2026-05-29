// BeeTeam — root App + routing + Tweaks integration

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#F5A524",
  "density": "regular",
  "dark": false,
  "showStats": true,
  "role": "lead"
}/*EDITMODE-END*/;

function applyAccent(hex) {
  // derive accent-strong + soft
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  // simple strong = darken via mix; soft = light tint
  root.style.setProperty('--accent-strong', shade(hex, -22));
  root.style.setProperty('--accent-soft', tint(hex, 88));
  root.style.setProperty('--accent-text', shade(hex, -55));
}
function shade(hex, p) {
  const { r, g, b } = hex2rgb(hex);
  const t = p < 0 ? 0 : 255;
  const amt = Math.abs(p) / 100;
  const mix = (c) => Math.round((t - c) * amt + c);
  return rgb2hex(mix(r), mix(g), mix(b));
}
function tint(hex, p) {
  return shade(hex, p);
}
function hex2rgb(h) {
  h = h.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function rgb2hex(r,g,b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [authed, setAuthed] = React.useState(false);
  const [route, setRoute] = React.useState({ name: 'team' });
  const [drawer, setDrawer] = React.useState(null); // { member } or null
  const [modal, setModal] = React.useState(null); // 'addEmp' | 'addTeam' | null
  const [review, setReview] = React.useState(null); // { member } or null

  const data = window.BT_DATA;

  React.useEffect(() => {
    applyAccent(t.accent);
    document.documentElement.dataset.theme = t.dark ? 'dark' : 'light';
    document.documentElement.dataset.density = t.density;
  }, [t.accent, t.dark, t.density]);

  const user = { name: 'Евгений Глебов', role: 'Lead, Platform team', email: 'e.glebov@beeteam.io' };

  const openMember = (m) => setRoute({ name: 'profile', memberId: m.id });
  const openMeeting = (mtg) => setDrawer({ member: data.team.find(m => m.id === 't1'), meeting: mtg });

  const member = route.memberId ? data.team.find(m => m.id === route.memberId) : null;
  const history = member && member.id === 't1' ? data.annaHistory : (member ? syntheticHistory(member, data.today) : []);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} accent={t.accent} />;
  }

  return (
    <div className="app-shell" data-screen-label="App shell">
      <Sidebar route={route} setRoute={setRoute} user={user} />
      <main className="main">
        <div className="topbar">
          <div className="topbar-crumbs">
            {route.name === 'profile' ? (
              <React.Fragment>
                <span style={{ cursor: 'default' }} onClick={() => setRoute({ name: 'team' })}>Моя команда</span>
                <span className="sep">/</span>
                <span className="cur">{member ? member.name : ''}</span>
              </React.Fragment>
            ) : (
              <span className="cur">{routeLabel(route.name)}</span>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-icon btn-sm" title="Помощь">?</button>
            <button className="btn btn-ghost btn-icon btn-sm" title="Поиск"><Icon name="search" size={14} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => openMeeting()}>
              <Icon name="plus" size={13} /> Новая 1-2-1
            </button>
          </div>
        </div>

        {route.name === 'team' && (
          <TeamList data={data}
                    onOpenMember={openMember}
                    onScheduleMeeting={() => openMeeting()} />
        )}
        {route.name === 'profile' && member && (
          <EmployeeProfile data={data}
                           member={member}
                           history={history}
                           onBack={() => setRoute({ name: 'team' })}
                           onOpenMeeting={(m) => setDrawer({ member, meeting: m })}
                           onStartMeeting={() => setDrawer({ member })}
                           onStartReview={() => setReview({ member })} />
        )}
        {route.name === 'calendar'  && <CalendarScreen data={data} onOpenMember={openMember} />}
        {route.name === 'grades'    && <GradesScreen />}
        {route.name === 'fields'    && <FieldsLibraryScreen />}
        {route.name === 'export'    && <ExportScreen />}
        {route.name === 'admin-team'    && <AdminTeams />}
        {route.name === 'admin-leads'   && <AdminLeads />}
        {route.name === 'admin-settings'&& <AdminSettings />}
      </main>

      {drawer && (
        <MeetingDrawer member={drawer.member}
                       today={data.today}
                       onClose={() => setDrawer(null)} />
      )}

      {modal === 'addEmp'  && <AddEmployeeModal onClose={() => setModal(null)} />}
      {modal === 'addTeam' && <AddTeamModal     onClose={() => setModal(null)} />}

      {review && <PerformanceReview member={review.member} onClose={() => setReview(null)} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Бренд и тема" />
        <TweakColor label="Акцент" value={t.accent}
                    options={['#F5A524', '#2A6FDB', '#1F8A5B', '#7A5AE0', '#E5484D']}
                    onChange={(v) => setTweak('accent', v)} />
        <TweakToggle label="Тёмная тема" value={t.dark}
                     onChange={(v) => setTweak('dark', v)} />
        <TweakSection label="Плотность" />
        <TweakRadio label="Density" value={t.density}
                    options={['compact', 'regular', 'cozy']}
                    onChange={(v) => setTweak('density', v)} />
        <TweakSection label="Главный экран" />
        <TweakToggle label="Показывать метрики" value={t.showStats}
                     onChange={(v) => setTweak('showStats', v)} />
        <TweakButton label="Открыть профиль Анны"
                     onClick={() => { setAuthed(true); setRoute({ name: 'profile', memberId: 't1' }); }} />
        <TweakButton label="Открыть форму 1-2-1"
                     onClick={() => { setAuthed(true); openMeeting(); }} />
        <TweakButton label="Открыть календарь команды"
                     onClick={() => { setAuthed(true); setRoute({ name: 'calendar' }); }} />
        <TweakButton label="Открыть конструктор полей"
                     onClick={() => { setAuthed(true); setRoute({ name: 'fields' }); }} />
        <TweakButton label="Открыть грейды (матрица)"
                     onClick={() => { setAuthed(true); setRoute({ name: 'grades' }); }} />
        <TweakButton label="Открыть Performance Review (Анна)"
                     onClick={() => { setAuthed(true); setReview({ member: data.team.find(m => m.id === 't1') }); }} />
        <TweakButton label="Форма: добавить сотрудника"
                     onClick={() => { setAuthed(true); setModal('addEmp'); }} />
        <TweakButton label="Форма: новая команда"
                     onClick={() => { setAuthed(true); setModal('addTeam'); }} />
        <TweakButton label="Показать экран логина"
                     onClick={() => setAuthed(false)} />
      </TweaksPanel>
    </div>
  );
}

function routeLabel(name) {
  return {
    team: 'Моя команда',
    calendar: 'Календарь',
    grades: 'Грейды',
    fields: 'Конструктор полей',
    export: 'Экспорт данных',
    'admin-team': 'Админ · Команды',
    'admin-leads': 'Админ · Лиды',
    'admin-settings': 'Админ · Настройки',
  }[name] || name;
}

function PlaceholderScreen({ icon, label }) {
  return (
    <div className="content">
      <div style={{
        maxWidth: 520, margin: '80px auto 0',
        background: 'var(--bg-elev)', border: '1px dashed var(--line-strong)',
        borderRadius: 16, padding: 36,
        textAlign: 'center', color: 'var(--ink-3)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
          background: 'var(--accent-soft)', color: 'var(--accent-strong)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon name={icon} size={26} stroke={1.5} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)' }}>{label}</h2>
        <p style={{ fontSize: 13.5, margin: 0 }}>Этот раздел появится в следующих итерациях. Пока сфокусированы на ключевом флоу 1-2-1.</p>
      </div>
    </div>
  );
}

function ExportScreen() {
  const [scope, setScope] = React.useState('team');
  const [from, setFrom] = React.useState('01.04.2026');
  const [to, setTo] = React.useState('18.05.2026');
  const [fields, setFields] = React.useState(['mood','blockers','goals','feedTo','feedFrom']);
  const toggleF = (f) => setFields(s => s.includes(f) ? s.filter(x => x !== f) : [...s, f]);
  const all = [
    ['mood','Настроение'],
    ['blockers','Блокеры'],
    ['goals','Цели'],
    ['feedTo','Фидбек сотруднику'],
    ['feedFrom','Фидбек от сотрудника'],
    ['dev','Развитие'],
    ['rel','Отношения'],
    ['tags','Теги'],
  ];

  return (
    <div className="content" style={{ maxWidth: 920 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Экспорт в Excel</h1>
          <p className="page-sub">Выгрузка истории 1-2-1 встреч в формате .xlsx</p>
        </div>
        <button className="btn btn-primary"><Icon name="download" size={14} /> Сформировать файл</button>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="field-label">Что выгружаем</div>
          <div className="seg" style={{ marginTop: 2 }}>
            <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>Вся команда</button>
            <button className={scope === 'person' ? 'on' : ''} onClick={() => setScope('person')}>Один сотрудник</button>
            <button className={scope === 'period' ? 'on' : ''} onClick={() => setScope('period')}>Сводный отчёт</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <div className="field-label">Период с</div>
            <input className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="field-label">по</div>
            <input className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="field-label">Колонки в файле</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
            {all.map(([id, label]) => (
              <div key={id} className={`check ${fields.includes(id) ? 'on' : ''}`} onClick={() => toggleF(id)}>
                <span className="box" />
                <span className="lbl">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          padding: 14, background: 'var(--bg-tint)',
          border: '1px solid var(--line)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 13, color: 'var(--ink-2)',
        }}>
          <Icon name="download" size={16} />
          <div style={{ flex: 1 }}>
            <b style={{ fontWeight: 600 }}>1-2-1_платформа_{from.replaceAll('.','-')}_{to.replaceAll('.','-')}.xlsx</b>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              {scope === 'team' ? '~ 42 встречи · 8 сотрудников' : scope === 'person' ? '~ 6 встреч' : 'сводная статистика по команде'}
              {' · '}{fields.length} колонок
            </div>
          </div>
          <span className="pill pill-accent">.xlsx</span>
        </div>
      </div>
    </div>
  );
}

// синтетическая история для остальных сотрудников
function syntheticHistory(m, today) {
  const out = [];
  const base = today.getTime();
  for (let i = 0; i < 5; i++) {
    out.push({
      id: `mh-${m.id}-${i}`,
      date: new Date(base - (i * 14 + 2) * 86400000),
      state: i === 4 ? 'miss' : 'done',
      durationMin: 30 + (i % 3) * 5,
      title: `1-2-1 c ${m.name.split(' ')[0]}`,
      mood: ['🙂','😄','😐','🤩','😞'][i % 5],
      moodScore: m.moodTrend[m.moodTrend.length - 1 - i] || 7,
      blockers: 'Заметки сохранены в системе. Откройте, чтобы посмотреть содержание встречи.',
      goals: '',
      feedbackTo: '',
      feedbackFrom: '',
      development: [],
      relationships: '',
    });
  }
  out.unshift({
    id: `mh-${m.id}-next`, date: m.nextMeet, state: 'planned',
    durationMin: 45, title: `1-2-1 c ${m.name.split(' ')[0]}`,
  });
  return out;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
