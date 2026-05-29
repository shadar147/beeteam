// BeeTeam — вкладка профиля «Грейд» (дисциплино-зависимая)

function GradeTab({ member, onStartReview }) {
  const G = window.BT_GRADES;
  const gd = G.members[member.id];
  const [track, setTrack] = React.useState('main');

  if (!gd) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px', background: 'var(--bg-tint)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="layers" size={22} stroke={1.5} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>Грейд не назначен</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>Эта роль использует другую карьерную лестницу (дизайн / менеджмент).</div>
      </div>
    );
  }

  const discId = gd.discipline;
  const discipline = G.disc(discId);
  const blocks = G.blocksOf(discId);
  const matrix = G.matrixOf(discId);
  const addons = G.addonsOf(discId);
  const addonIds = Object.keys(addons);
  const ev = G.evidence[member.id] || [];
  const isPromoReady = gd.target > gd.grade;
  const blocksForNext = blocks.filter(b => (gd.blockLevels[b.id] || 0) < gd.target);

  return (
    <div className="grade-tab">
      {/* Заголовок грейда */}
      <div className="card grade-hero">
        <div className="gh-current">
          <span className="grade-chip xl" data-lvl={gd.grade}>{gradeCode(gd.grade)}</span>
          <div>
            <div className="gh-name">{gradeName(gd.grade)}</div>
            <div className="gh-sub">
              <span className="pill" style={{ height: 18, fontSize: 10.5, marginRight: 6 }}>
                <Icon name={discipline.icon} size={10} /> {discipline.label}
              </span>
              текущий грейд{gd.mgrTrack && ' · менеджерский трек'}
            </div>
          </div>
        </div>

        {isPromoReady ? (
          <div className="gh-progress">
            <div className="gh-arrow"><Icon name="arrow" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Цель: {gradeCode(gd.target)} {gradeName(gd.target)}</span>
                <span className="pill pill-accent" style={{ height: 20, flexShrink: 0 }}>
                  <Icon name="clock" size={11} /> {gd.readyMonths}/3–6 мес
                </span>
              </div>
              <div className="readiness-bar">
                <div className="readiness-fill" style={{ width: `${Math.min(gd.readyMonths / 6 * 100, 100)}%` }} />
                <span className="readiness-min" style={{ left: '50%' }} title="минимум 3 мес" />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                {gd.readyMonths >= 3 ? 'Достаточно свидетельств для постановки на ближайшее ревью.'
                  : `Ещё ${3 - gd.readyMonths} мес стабильного проявления до порога ревью.`}
              </div>
            </div>
          </div>
        ) : (
          <div className="gh-progress" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            <Icon name="check" size={16} /> Уверенно держит уровень. Цель на повышение не выставлена.
          </div>
        )}

        <div className="gh-meta">
          <div className="ghm"><div className="lbl">Ближайшее ревью</div><div className="v">{fmtLong(gd.nextReview)}</div></div>
          <div className="ghm"><div className="lbl">Прошлое ревью</div><div className="v">{gd.lastReview ? fmtLong(gd.lastReview) : 'не проводилось'}</div></div>
          <button className="btn btn-primary btn-sm" onClick={onStartReview}><Icon name="target" size={13} /> Открыть ревью</button>
        </div>
      </div>

      {/* Переключатель трека: основной + доп-треки дисциплины */}
      <div className="seg" style={{ marginTop: 18, marginBottom: 14 }}>
        <button className={track === 'main' ? 'on' : ''} onClick={() => setTrack('main')}>Основной грейд</button>
        {addonIds.map(aid => {
          const lvl = gd.addons[aid] || 0;
          return (
            <button key={aid} className={track === aid ? 'on' : ''} onClick={() => lvl && setTrack(aid)}
                    disabled={!lvl} style={!lvl ? { opacity: 0.4 } : {}}>
              {addons[aid].label} {lvl ? `· L${lvl}` : '· не заявлен'}
            </button>
          );
        })}
        {addonIds.length === 0 && <button disabled style={{ opacity: 0.4 }}>нет доп-треков</button>}
      </div>

      <div className="grade-grid">
        {/* Левая */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {track === 'main' ? (
            <React.Fragment>
              <div className="card" style={{ padding: 22 }}>
                <div className="section-h">
                  <div>
                    <div className="section-title">Профиль по блокам</div>
                    <div className="section-sub">Дисциплина {discipline.label} · текущий уровень против цели {gradeCode(gd.target)}</div>
                  </div>
                </div>
                {blocks.map(b => {
                  const cur = gd.blockLevels[b.id] || 0;
                  const ahead = cur > gd.grade;
                  const behind = cur < gd.target;
                  return (
                    <div key={b.id} className="block-prog">
                      <div className="bp-top">
                        <span className="bp-name">{b.name}</span>
                        <span className={`bp-lvl ${ahead ? 'ahead' : behind ? 'behind' : 'ok'}`}>
                          {gradeCode(cur)}{ahead && <Icon name="trend" size={11} />}
                        </span>
                      </div>
                      <div className="bp-track">
                        {G.levels.map((l, i) => {
                          const n = i + 1;
                          let cls = '';
                          if (n <= cur) cls = ahead && n > gd.grade ? 'fill ahead' : 'fill';
                          else if (n <= gd.target) cls = 'target';
                          return <span key={n} className={`bp-seg ${cls}`} title={l.code} />;
                        })}
                        <span className="bp-marker grade" style={{ left: `calc(${(gd.grade - 0.5) / 7 * 100}% )` }} title="грейд" />
                      </div>
                    </div>
                  );
                })}
                <div className="bp-legend">
                  <span><i className="sw fill" /> освоено</span>
                  <span><i className="sw ahead" /> выше грейда</span>
                  <span><i className="sw target" /> цель</span>
                  <span><i className="sw marker" /> текущий грейд</span>
                </div>
              </div>

              {isPromoReady && blocksForNext.length > 0 && (
                <div className="card" style={{ padding: 22 }}>
                  <div className="section-title" style={{ marginBottom: 4 }}>Что показать для {gradeCode(gd.target)}</div>
                  <div className="section-sub" style={{ marginBottom: 14 }}>Конкретные компетенции из матрицы {discipline.label}</div>
                  {blocksForNext.map(b => {
                    const targetText = matrix[b.id][gd.target - 1];
                    const evCount = ev.filter(e => e.block === b.id && e.level >= gd.target).length;
                    return (
                      <div key={b.id} className="grow-item">
                        <div className={`grow-check ${evCount > 0 ? 'partial' : ''}`}>
                          {evCount > 0 ? <Icon name="check" size={12} /> : null}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{b.name} → {gradeCode(gd.target)}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{targetText}</div>
                          {evCount > 0 && (
                            <div style={{ fontSize: 11.5, color: 'var(--ok)', marginTop: 4, fontWeight: 500 }}>
                              {evCount} свидетельств(а) зафиксировано в 1-2-1
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          ) : (
            <TrackProfile discId={discId} track={track} level={gd.addons[track]} />
          )}
        </div>

        {/* Правая */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ padding: 22 }}>
            <div className="section-h">
              <div><div className="section-title">Свидетельства из 1-2-1</div><div className="section-sub">Накапливаются на встречах</div></div>
              <span className="pill">{ev.length}</span>
            </div>
            {ev.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.</div>
            ) : (
              <div className="ev-timeline">
                {ev.map(e => (
                  <div key={e.id} className="ev-item">
                    <div className={`ev-marker ${e.status}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span className="pill pill-accent" style={{ height: 18, fontSize: 10 }}>{blockName(discId, e.block)} · {gradeCode(e.level)}</span>
                        {e.status === 'partial' && <span className="pill pill-warn" style={{ height: 18, fontSize: 10 }}>частично</span>}
                        <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>{fmtShort(e.date)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{e.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div className="section-title" style={{ marginBottom: 4 }}>Позиция в полосе</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>{gradeCode(gd.grade)} · вид лида, без точных окладов</div>
            <div className="compa-band">
              <div className="cb-fill" />
              <span className="cb-tick" style={{ left: '0%' }}><i />нижняя</span>
              <span className="cb-tick mid" style={{ left: '50%' }}><i />медиана</span>
              <span className="cb-tick" style={{ left: '100%' }}><i />верхняя</span>
              <span className="cb-marker" style={{ left: `${gd.compa * 100}%` }} title="позиция сотрудника" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 22, lineHeight: 1.5 }}>
              {gd.compa < 0.4 ? 'В нижней части полосы — есть пространство для роста внутри грейда.'
                : gd.compa < 0.66 ? 'Около медианы грейда — соответствует уровню.'
                : 'В верхней части полосы — близко к потолку грейда, основной рост через повышение.'}
            </div>
          </div>

          {G.reviews[member.id] && (
            <div className="card" style={{ padding: 22 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>История ревью</div>
              {G.reviews[member.id].map(r => (
                <div key={r.id} className="review-hist">
                  <div className={`rh-badge ${r.decision}`}>
                    {r.decision === 'promote' ? <Icon name="trend" size={13} /> : r.decision === 'pip' ? <Icon name="flag" size={13} /> : <Icon name="check" size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.period}</span>
                      {r.decision === 'promote'
                        ? <span className="pill pill-ok" style={{ height: 18, fontSize: 10 }}>{gradeCode(r.fromGrade)} → {gradeCode(r.toGrade)}</span>
                        : r.decision === 'pip'
                        ? <span className="pill pill-miss" style={{ height: 18, fontSize: 10 }}>PIP</span>
                        : <span className="pill" style={{ height: 18, fontSize: 10 }}>сохранён {gradeCode(r.toGrade)}</span>}
                      <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>{fmtShort(r.date)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 4 }}>{r.summary}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── профиль доп-трека ──
function TrackProfile({ discId, track, level }) {
  const t = window.BT_GRADES.addonsOf(discId)[track];
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="info-banner" style={{ marginBottom: 16 }}>
        <Icon name="layers" size={16} />
        <div><b style={{ fontWeight: 600 }}>{t.label}: уровень {t.levelNames[level - 1]}</b><br />
          <span style={{ color: 'var(--ink-3)' }}>{t.note}</span></div>
      </div>
      {t.blocks.map(b => (
        <div key={b.id} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{b.name}</div>
          <div className="bp-track" style={{ marginBottom: 10, gridTemplateColumns: `repeat(${b.cells.length}, 1fr)` }}>
            {b.cells.map((_, i) => (
              <span key={i} className={`bp-seg ${i + 1 <= level ? 'fill' : ''}`} title={t.levelNames[i]} />
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, padding: 12, background: 'var(--bg-tint)', borderRadius: 10 }}>
            <b style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Текущий уровень</b>
            <div style={{ marginTop: 4 }}>{b.cells[level - 1]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { GradeTab });
