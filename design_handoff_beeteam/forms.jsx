// BeeTeam — модалки добавления: сотрудник, команда

// ═══════════════════════════════════════════════════════════════════
//  ADD EMPLOYEE MODAL
// ═══════════════════════════════════════════════════════════════════
function AddEmployeeModal({ onClose, defaultTeam = 'Платформа' }) {
  const [step, setStep] = React.useState(1);
  const [vals, setVals] = React.useState({
    method: 'invite',
    fullName: '',
    email: '',
    role: '',
    team: defaultTeam,
    lead: 'auto',
    customLead: 'Анна Лебедева',
    startDate: '01.06.2026',
    tz: 'Europe/Moscow',
    tags: [],
    template: 'default',
    cadence: '2w',
    onboardingMentor: '',
  });
  const set = (k, v) => setVals(s => ({ ...s, [k]: v }));
  const toggleTag = (t) => setVals(s => ({ ...s, tags: s.tags.includes(t) ? s.tags.filter(x => x !== t) : [...s.tags, t] }));

  const canNext = step === 1
    ? vals.fullName.length >= 3 && /@/.test(vals.email) && vals.role.length >= 2
    : true;

  const initials = vals.fullName
    ? vals.fullName.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
    : '?';

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal-card" style={{ width: 'min(680px, 95vw)' }}>

          <div className="modal-head">
            <div>
              <div className="modal-title">Добавить сотрудника</div>
              <div className="modal-sub">В команду «{vals.team}» · шаг {step} из 2</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="modal-steps">
            <div className={`mstep ${step >= 1 ? 'on' : ''} ${step === 1 ? 'cur' : ''}`}>
              <span className="mstep-n">1</span> Сотрудник
            </div>
            <div className="mstep-line" />
            <div className={`mstep ${step >= 2 ? 'on' : ''} ${step === 2 ? 'cur' : ''}`}>
              <span className="mstep-n">2</span> Настройки 1-2-1
            </div>
          </div>

          <div className="modal-body">
            {step === 1 && (
              <React.Fragment>
                {/* Метод добавления */}
                <div className="form-group">
                  <div className="field-label">Способ добавления</div>
                  <div className="method-grid">
                    {[
                      { id: 'invite', icon: 'mail',  label: 'Пригласить по email', desc: 'Сотрудник сам заполнит профиль' },
                      { id: 'ad',     icon: 'shield', label: 'Из Active Directory', desc: 'Подтянуть из корпоративного каталога' },
                      { id: 'manual', icon: 'edit',  label: 'Создать вручную',     desc: 'Без отправки приглашения' },
                    ].map(m => (
                      <div key={m.id} className={`method-card ${vals.method === m.id ? 'on' : ''}`}
                           onClick={() => set('method', m.id)}>
                        <Icon name={m.icon} size={18} />
                        <div className="mc-l">{m.label}</div>
                        <div className="mc-d">{m.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Профиль */}
                <div className="form-group" style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 84, height: 84, borderRadius: 24,
                    background: vals.fullName ? `oklch(0.92 0.05 ${(vals.fullName.charCodeAt(0) * 7) % 360})` : 'var(--bg-tint)',
                    color: 'var(--ink)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, fontWeight: 600, letterSpacing: '0.01em',
                    border: '1px dashed var(--line-strong)',
                    flexShrink: 0,
                    cursor: 'default',
                  }}>
                    {vals.fullName ? initials : <Icon name="user" size={32} stroke={1.5} />}
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="field-label">ФИО *</div>
                      <input className="input" autoFocus value={vals.fullName} onChange={e => set('fullName', e.target.value)}
                             placeholder="Иван Иванов" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="field-label">Корпоративная почта *</div>
                      <input className="input" type="email" value={vals.email} onChange={e => set('email', e.target.value)}
                             placeholder="i.ivanov@beeteam.io" />
                    </div>
                  </div>
                </div>

                {/* Роль и команда */}
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                  <div>
                    <div className="field-label">Должность *</div>
                    <input className="input" value={vals.role} onChange={e => set('role', e.target.value)}
                           placeholder="например, Middle Frontend" />
                  </div>
                  <div>
                    <div className="field-label">Команда</div>
                    <select className="select" value={vals.team} onChange={e => set('team', e.target.value)}>
                      <option>Платформа</option>
                      <option>Команда роста</option>
                      <option>Mobile</option>
                      <option>Data Platform</option>
                      <option>Internal Tooling</option>
                      <option>QA</option>
                    </select>
                  </div>
                </div>

                {/* Лид (auto from team / custom) + дата + ТЗ */}
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.9fr', gap: 12 }}>
                  <div>
                    <div className="field-label">Кто проводит 1-2-1</div>
                    {vals.lead === 'auto' ? (
                      <div className="lead-auto-chip">
                        <Avatar name="Евгений Глебов" hue={42} size="sm" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Евгений Глебов</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>лид команды «{vals.team}»</div>
                        </div>
                        <button className="tiny-link" style={{ fontSize: 11.5 }} onClick={() => set('lead', 'custom')}>
                          Изменить
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div className="input-with-avatar" style={{ flex: 1, minWidth: 0 }}>
                          <Avatar name={vals.customLead} hue={42} size="sm" />
                          <select className="select" value={vals.customLead} onChange={e => set('customLead', e.target.value)}
                                  style={{ paddingLeft: 38 }}>
                            <option>Анна Лебедева</option>
                            <option>Ирина Власова</option>
                            <option>Артём Соловьёв</option>
                            <option>Никита Лазарев</option>
                            <option>Мария Соколова</option>
                          </select>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => set('lead', 'auto')}>Сбросить</button>
                      </div>
                    )}
                    {vals.lead === 'custom' && (
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.45 }}>
                        Матричный случай: 1-2-1 ведёт ментор, а не лид команды.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="field-label">Дата старта</div>
                    <input className="input" value={vals.startDate} onChange={e => set('startDate', e.target.value)}
                           placeholder="ДД.ММ.ГГГГ" />
                  </div>
                  <div>
                    <div className="field-label">Часовой пояс</div>
                    <select className="select" value={vals.tz} onChange={e => set('tz', e.target.value)}>
                      <option>Europe/Moscow</option>
                      <option>Europe/Berlin</option>
                      <option>Europe/Lisbon</option>
                      <option>Asia/Tbilisi</option>
                      <option>Asia/Almaty</option>
                      <option>Asia/Yerevan</option>
                    </select>
                  </div>
                </div>

                {/* Теги */}
                <div className="form-group">
                  <div className="field-label">Теги (опционально)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['Onboarding', 'Mentor', 'Promotion', 'Lead Track', 'Burnout risk', 'Performance', 'PIP'].map(t => (
                      <button key={t} className={`chip ${vals.tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            )}

            {step === 2 && (
              <React.Fragment>
                <div className="form-group">
                  <div className="field-label">Шаблон полей для 1-2-1</div>
                  <div className="template-list">
                    {[
                      { id: 'default',    name: 'Базовый набор',         desc: '11 полей · по умолчанию' },
                      { id: 'onboarding', name: 'Onboarding 90 дней',    desc: '9 полей · акцент на адаптацию', badge: 'рекомендовано' },
                      { id: 'review',     name: 'Performance review',    desc: '16 полей · для квартального ревью' },
                      { id: 'custom',     name: 'Создать кастомный',      desc: 'Скопируется из базового набора' },
                    ].map(t => (
                      <div key={t.id} className={`tpl-row ${vals.template === t.id ? 'on' : ''}`}
                           onClick={() => set('template', t.id)}>
                        <span className="tpl-radio" />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                            {t.badge && <span className="pill pill-accent" style={{ height: 18, fontSize: 10 }}>{t.badge}</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{t.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <div className="field-label">Регулярность встреч 1-2-1</div>
                  <div className="seg" style={{ width: 'auto' }}>
                    <button className={vals.cadence === '1w' ? 'on' : ''} onClick={() => set('cadence', '1w')}>Раз в неделю</button>
                    <button className={vals.cadence === '2w' ? 'on' : ''} onClick={() => set('cadence', '2w')}>Раз в две недели</button>
                    <button className={vals.cadence === '4w' ? 'on' : ''} onClick={() => set('cadence', '4w')}>Раз в месяц</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
                    Первая встреча будет запланирована на <b style={{ color: 'var(--ink-2)' }}>{vals.cadence === '1w' ? '8 июня' : vals.cadence === '2w' ? '15 июня' : '29 июня'}</b> в 11:00.
                  </div>
                </div>

                {vals.tags.includes('Onboarding') && (
                  <div className="form-group">
                    <div className="field-label">Назначить ментора (для онбординга)</div>
                    <select className="select" value={vals.onboardingMentor} onChange={e => set('onboardingMentor', e.target.value)}>
                      <option value="">— не назначать —</option>
                      <option>Анна Лебедева · Senior Frontend</option>
                      <option>Игорь Петров · Backend Engineer</option>
                      <option>Елена Воронцова · Project Manager</option>
                    </select>
                  </div>
                )}

                <div className="info-banner" style={{ marginTop: 8 }}>
                  <Icon name="spark" size={16} />
                  <div style={{ flex: 1 }}>
                    {vals.method === 'invite' && (
                      <React.Fragment>
                        <b style={{ fontWeight: 600 }}>На {vals.email || 'указанный email'} придёт приглашение.</b><br />
                        <span style={{ color: 'var(--ink-3)' }}>Сотрудник заполнит данные сам — вы получите уведомление.</span>
                      </React.Fragment>
                    )}
                    {vals.method === 'ad' && (
                      <React.Fragment>
                        <b style={{ fontWeight: 600 }}>Данные подтянутся из Active Directory.</b><br />
                        <span style={{ color: 'var(--ink-3)' }}>Профиль будет создан и синхронизирован в течение 5 минут.</span>
                      </React.Fragment>
                    )}
                    {vals.method === 'manual' && (
                      <React.Fragment>
                        <b style={{ fontWeight: 600 }}>Профиль будет создан без приглашения.</b><br />
                        <span style={{ color: 'var(--ink-3)' }}>Сотрудник не получит доступа, пока вы не отправите инвайт позже.</span>
                      </React.Fragment>
                    )}
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>

          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <div style={{ display: 'flex', gap: 8 }}>
              {step === 2 && <button className="btn" onClick={() => setStep(1)}>Назад</button>}
              {step === 1 ? (
                <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(2)}
                        style={canNext ? {} : { opacity: 0.5, cursor: 'not-allowed' }}>
                  Далее <Icon name="arrow" size={14} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={onClose}>
                  <Icon name="check" size={14} />
                  {vals.method === 'invite' ? 'Отправить приглашение' :
                   vals.method === 'ad' ? 'Подтянуть из AD' : 'Создать профиль'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  ADD TEAM MODAL
// ═══════════════════════════════════════════════════════════════════
function AddTeamModal({ onClose }) {
  const [vals, setVals] = React.useState({
    name: '',
    mission: '',
    color: 'F5A524',
    icon: 'auto',
    lead: '',
    members: [],
    template: 'default',
    cadence: '2w',
    visibility: 'private',
  });
  const set = (k, v) => setVals(s => ({ ...s, [k]: v }));
  const toggleMember = (id) => setVals(s => ({
    ...s, members: s.members.includes(id) ? s.members.filter(x => x !== id) : [...s.members, id]
  }));

  const palette = ['F5A524', '3D6DCB', '2D8F5C', '7A5AE0', 'C04A3B', '0FAF8C', 'BA4FBC'];
  const candidates = [
    { id: 't1', name: 'Анна Лебедева',    role: 'Senior Frontend', hue: 28 },
    { id: 't2', name: 'Игорь Петров',     role: 'Backend Engineer', hue: 200 },
    { id: 't4', name: 'Дмитрий Кузнецов', role: 'Product Designer', hue: 145 },
    { id: 't5', name: 'Елена Воронцова',  role: 'Project Manager', hue: 12 },
    { id: 't6', name: 'Тимур Хасанов',    role: 'Junior Frontend', hue: 260 },
    { id: 't7', name: 'Светлана Морозова', role: 'DevOps', hue: 175 },
    { id: 't8', name: 'Алексей Романов',  role: 'Backend Engineer', hue: 90 },
  ];

  const canSubmit = vals.name.length >= 2 && vals.lead.length > 0;
  const initials = vals.name ? vals.name.slice(0, 2).toUpperCase() : 'NT';

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal-card" style={{ width: 'min(720px, 95vw)' }}>

          <div className="modal-head">
            <div>
              <div className="modal-title">Новая команда</div>
              <div className="modal-sub">Создайте отдельное пространство для регулярных 1-2-1</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="modal-body">
            {/* Identity */}
            <div className="form-group" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div className="team-mark" style={{ background: `#${vals.color}22`, borderColor: `#${vals.color}55`, color: `#${vals.color}` }}>
                {initials}
              </div>
              <div style={{ flex: 1 }}>
                <div className="field-label">Название команды *</div>
                <input className="input" autoFocus value={vals.name} onChange={e => set('name', e.target.value)}
                       placeholder="Например, Команда роста" />
                <div className="field-label" style={{ marginTop: 12 }}>Цвет</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {palette.map(c => (
                    <button key={c}
                            className={`swatch ${vals.color === c ? 'on' : ''}`}
                            style={{ background: `#${c}` }}
                            onClick={() => set('color', c)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="field-label">Миссия / описание</div>
              <textarea className="textarea" rows={2} value={vals.mission} onChange={e => set('mission', e.target.value)}
                        placeholder="Чем занимается команда, в чём её основной вклад в продукт" />
            </div>

            <div className="form-group">
              <div className="field-label">Лид команды *</div>
              <div className="lead-pick">
                {[
                  { name: 'Евгений Глебов', hue: 42,  role: 'Senior Lead, 6 лет в компании' },
                  { name: 'Ирина Власова', hue: 320, role: 'Lead, Команда роста' },
                  { name: 'Артём Соловьёв', hue: 200, role: 'Lead, Mobile' },
                  { name: 'Никита Лазарев', hue: 145, role: 'Lead, Data Platform' },
                  { name: '— назначу позже —', hue: null, role: 'Команда будет без лида до назначения' },
                ].map(l => (
                  <div key={l.name} className={`lead-pick-item ${vals.lead === l.name ? 'on' : ''}`}
                       onClick={() => set('lead', l.name)}>
                    {l.hue != null
                      ? <Avatar name={l.name} hue={l.hue} />
                      : <div className="avatar" style={{ background: 'var(--bg-tint)', color: 'var(--ink-4)' }}>
                          <Icon name="user" size={16} stroke={1.5} />
                        </div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{l.role}</div>
                    </div>
                    <span className="tpl-radio" />
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div className="field-label" style={{ marginBottom: 0 }}>Стартовый состав</div>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>выбрано <b className="mono num">{vals.members.length}</b></span>
              </div>
              <div className="members-grid">
                {candidates.map(c => (
                  <div key={c.id} className={`member-chip ${vals.members.includes(c.id) ? 'on' : ''}`}
                       onClick={() => toggleMember(c.id)}>
                    <Avatar name={c.name} hue={c.hue} size="sm" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{c.role}</div>
                    </div>
                    {vals.members.includes(c.id) && <Icon name="check" size={13} />}
                  </div>
                ))}
                <div className="member-chip add" onClick={() => {}}>
                  <Icon name="plus" size={14} />
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-3)' }}>Пригласить нового</span>
                </div>
              </div>
            </div>

            <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="field-label">Шаблон полей по умолчанию</div>
                <select className="select" value={vals.template} onChange={e => set('template', e.target.value)}>
                  <option value="default">Базовый набор · 11 полей</option>
                  <option value="onboarding">Onboarding · 9 полей</option>
                  <option value="review">Performance review · 16 полей</option>
                </select>
              </div>
              <div>
                <div className="field-label">Регулярность 1-2-1</div>
                <select className="select" value={vals.cadence} onChange={e => set('cadence', e.target.value)}>
                  <option value="1w">Раз в неделю</option>
                  <option value="2w">Раз в две недели</option>
                  <option value="4w">Раз в месяц</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <div className="field-label">Видимость команды</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>
                Управляет тем, что видят роли <b style={{ color: 'var(--ink-2)' }}>выше</b> лида.
                Лид и сотрудники команды всегда видят свои встречи целиком.
              </div>
              <div className="vis-grid">
                {[
                  { id: 'private', icon: 'shield', label: 'Приватная',         desc: 'Дефолт. Никто извне команды не видит содержание.' },
                  { id: 'hr',      icon: 'user',   label: 'Видна HR',          desc: 'HR видит агрегаты (без текста заметок).' },
                  { id: 'org',     icon: 'team',   label: 'Видна организации', desc: 'Скип-уровень видит детали (с согласием).' },
                ].map(v => (
                  <div key={v.id} className={`vis-card ${vals.visibility === v.id ? 'on' : ''}`}
                       onClick={() => set('visibility', v.id)}>
                    <Icon name={v.icon} size={15} />
                    <div className="vc-l">{v.label}</div>
                    <div className="vc-d">{v.desc}</div>
                  </div>
                ))}
              </div>

              <div className="vis-matrix">
                <div className="vm-head">
                  <div>Роль</div>
                  <div>Видит факт встреч</div>
                  <div>Видит метрики</div>
                  <div>Видит заметки</div>
                </div>
                {[
                  { role: 'Сотрудник', who: 'свои встречи', met: '✓', not: '✓', priv: '✓', hr: '✓', org: '✓' },
                  { role: 'Лид команды', who: 'вся команда', met: '✓', not: '✓', priv: '✓', hr: '✓', org: '✓' },
                  { role: 'HR-админ', who: '', metPriv: '○', notPriv: '✕', metHr: '✓', notHr: '✕', metOrg: '✓', notOrg: '○' },
                  { role: 'Skip-уровень (CTO)', who: '', metPriv: '✕', notPriv: '✕', metHr: '○', notHr: '✕', metOrg: '✓', notOrg: '✓' },
                ].map((r, i) => {
                  const v = vals.visibility;
                  let metric, notes;
                  if (i < 2) { metric = '✓'; notes = '✓'; }
                  else if (r.role === 'HR-админ') {
                    metric = v === 'private' ? '○' : '✓';
                    notes  = v === 'org' ? '○' : '✕';
                  } else { // CTO
                    metric = v === 'private' ? '✕' : v === 'hr' ? '○' : '✓';
                    notes  = v === 'org' ? '✓' : '✕';
                  }
                  const factVisible = i < 2 ? true : v !== 'private';
                  return (
                    <div key={r.role} className="vm-row">
                      <div className="vm-role">
                        <span>{r.role}</span>
                        {r.who && <span className="vm-who">{r.who}</span>}
                      </div>
                      <div className={`vm-cell ${factVisible ? 'yes' : 'no'}`}>
                        {factVisible ? <Icon name="check" size={12} /> : '—'}
                      </div>
                      <div className={`vm-cell ${metric === '✓' ? 'yes' : metric === '○' ? 'part' : 'no'}`}>
                        {metric === '✓' ? <Icon name="check" size={12} /> : metric === '○' ? 'агрегат' : '—'}
                      </div>
                      <div className={`vm-cell ${notes === '✓' ? 'yes' : notes === '○' ? 'part' : 'no'}`}>
                        {notes === '✓' ? <Icon name="check" size={12} /> : notes === '○' ? 'по согласию' : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={onClose}
                    style={canSubmit ? {} : { opacity: 0.5, cursor: 'not-allowed' }}>
              <Icon name="check" size={14} /> Создать команду
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { AddEmployeeModal, AddTeamModal });
