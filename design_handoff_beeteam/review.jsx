// BeeTeam — Performance Review (полный флоу: самооценка + оценка лида + калибровка + решение)

function PerformanceReview({ member, onClose }) {
  const G = window.BT_GRADES;
  const gd = G.members[member.id];
  const ev = G.evidence[member.id] || [];
  const discId = gd.discipline;
  const blocks = G.blocksOf(discId);
  const matrix = G.matrixOf(discId);
  const steps = ['prep', 'assess', 'calibrate', 'decision'];
  const [step, setStep] = React.useState(0);

  // самооценка сотрудника (симуляция); оценка лида — интерактивная
  const selfScores = React.useMemo(() => {
    const s = {};
    blocks.forEach(b => { s[b.id] = Math.min((gd.blockLevels[b.id] || gd.grade) + (Math.random() > 0.6 ? 1 : 0), 7); });
    return s;
  }, [member.id]);
  const [leadScores, setLeadScores] = React.useState(() => ({ ...gd.blockLevels }));
  const setLead = (b, v) => setLeadScores(s => ({ ...s, [b]: v }));

  const [decision, setDecision] = React.useState(gd.target > gd.grade ? 'promote' : 'hold');
  const [summary, setSummary] = React.useState('');

  const avgLead = (blocks.reduce((a, b) => a + leadScores[b.id], 0) / blocks.length);
  const meetsNext = blocks.filter(b => leadScores[b.id] >= gd.target).length;

  const period = 'H1 2026';
  const toGrade = decision === 'promote' ? Math.min(gd.grade + 1, 7) : gd.grade;
  const discipline = G.disc(discId);

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap review-wrap">
        <div className="modal-card review-card">

          <div className="modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={member.name} hue={member.hue} size="md" />
              <div>
                <div className="modal-title">Performance Review · {member.name}</div>
                <div className="modal-sub">{period} · {discipline.label} · {gradeCode(gd.grade)} {gradeName(gd.grade)} · ведёт Е. Глебов</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>

          {/* step rail */}
          <div className="review-rail">
            {[
              ['prep', 'Подготовка', 'flag'],
              ['assess', 'Оценка по блокам', 'layers'],
              ['calibrate', 'Калибровка', 'scale'],
              ['decision', 'Решение', 'award'],
            ].map(([id, label, icon], i) => (
              <div key={id} className={`rr-step ${step === i ? 'cur' : ''} ${step > i ? 'done' : ''}`}
                   onClick={() => setStep(i)}>
                <span className="rr-num">{step > i ? <Icon name="check" size={13} /> : <Icon name={icon} size={14} />}</span>
                <span className="rr-label">{label}</span>
              </div>
            ))}
          </div>

          <div className="modal-body review-body">
            {step === 0 && <ReviewPrep member={member} gd={gd} ev={ev} selfScores={selfScores} blocks={blocks} discId={discId} />}
            {step === 1 && (
              <ReviewAssess gd={gd} ev={ev} selfScores={selfScores} leadScores={leadScores} setLead={setLead} blocks={blocks} matrix={matrix} discId={discId} />
            )}
            {step === 2 && <ReviewCalibrate member={member} gd={gd} avgLead={avgLead} blocks={blocks} discId={discId} />}
            {step === 3 && (
              <ReviewDecision member={member} gd={gd} decision={decision} setDecision={setDecision}
                              summary={summary} setSummary={setSummary} meetsNext={meetsNext} toGrade={toGrade} blocks={blocks} />
            )}
          </div>

          <div className="modal-foot">
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {step === 1 && <span><b className="mono num" style={{ color: 'var(--ink-2)' }}>{meetsNext}/{blocks.length}</b> блоков на уровне {gradeCode(gd.target)}</span>}
              {step === 0 && <span>Самооценка получена · {ev.length} свидетельств в истории</span>}
              {step === 2 && <span>Сравнение с сотрудниками того же грейда</span>}
              {step === 3 && <span>После сохранения решение уйдёт на согласование HR</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Назад</button>}
              {step < 3
                ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Далее <Icon name="arrow" size={14} /></button>
                : <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={14} /> Завершить ревью</button>}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── Шаг 1: Подготовка ──
function ReviewPrep({ member, gd, ev, selfScores, blocks, discId }) {
  return (
    <div className="review-prep">
      <div className="rp-cards">
        <div className="card" style={{ padding: 18 }}>
          <div className="rp-icon"><Icon name="target" size={18} /></div>
          <div className="rp-big">{gradeCode(gd.grade)} → {gd.target > gd.grade ? gradeCode(gd.target) : gradeCode(gd.grade)}</div>
          <div className="rp-lbl">{gd.target > gd.grade ? 'кандидат на повышение' : 'подтверждение грейда'}</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="rp-icon"><Icon name="clock" size={18} /></div>
          <div className="rp-big">{gd.readyMonths} мес</div>
          <div className="rp-lbl">стабильного проявления L+1</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="rp-icon"><Icon name="spark" size={18} /></div>
          <div className="rp-big">{ev.length}</div>
          <div className="rp-lbl">свидетельств из 1-2-1</div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Самооценка сотрудника</div>
        <div className="section-sub" style={{ marginBottom: 16 }}>Получена {fmtLong(new Date(2026, 4, 20))} · сотрудник не видит вашу оценку до завершения</div>
        <div className="self-grid">
          {blocks.map(b => (
            <div key={b.id} className="self-row">
              <span className="sr-name">{b.name}</span>
              <span className="grade-chip sm" data-lvl={selfScores[b.id]}>{gradeCode(selfScores[b.id])}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Сводка свидетельств из 1-2-1</div>
        {ev.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Нет зафиксированных свидетельств.</div> :
          ev.map(e => (
            <div key={e.id} className="ev-summary-row">
              <span className={`ev-marker ${e.status}`} />
              <span className="pill pill-accent" style={{ height: 18, fontSize: 10 }}>{blockName(discId, e.block)} · {gradeCode(e.level)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1 }}>{e.note}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{fmtShort(e.date)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Шаг 2: Оценка лида по блокам ──
function ReviewAssess({ gd, ev, selfScores, leadScores, setLead, blocks, matrix, discId }) {
  return (
    <div className="review-assess">
      <div className="info-banner" style={{ marginBottom: 16 }}>
        <Icon name="layers" size={16} />
        <div style={{ color: 'var(--ink-3)' }}>
          Оцените каждый блок по матрице. <b style={{ color: 'var(--ink-2)' }}>○</b> самооценка сотрудника,
          <b style={{ color: 'var(--ink-2)' }}> ●</b> ваша оценка. Цель грейда — {gradeCode(gd.target)}.
        </div>
      </div>
      {blocks.map(b => {
        const self = selfScores[b.id];
        const lead = leadScores[b.id];
        const evCount = ev.filter(e => e.block === b.id).length;
        const gap = self - lead;
        return (
          <div key={b.id} className="assess-block">
            <div className="ab-head">
              <div>
                <div className="ab-name">{b.name}</div>
                {evCount > 0 && <div className="ab-ev">{evCount} свидетельств в 1-2-1</div>}
              </div>
              {gap !== 0 && (
                <span className={`pill ${Math.abs(gap) >= 2 ? 'pill-miss' : 'pill-warn'}`} style={{ height: 20 }}>
                  расхождение {gap > 0 ? `+${gap}` : gap}
                </span>
              )}
              {gap === 0 && <span className="pill pill-ok" style={{ height: 20 }}><span className="dot" /> совпадает</span>}
            </div>
            <div className="grade-scale">
              {G.levels.map((l, i) => {
                const n = i + 1;
                const isSelf = self === n;
                const isLead = lead === n;
                const isTarget = n === gd.target;
                return (
                  <button key={n} className={`gs-btn ${isLead ? 'lead' : ''} ${isTarget ? 'target' : ''}`}
                          onClick={() => setLead(b.id, n)} title={`${l.code} ${l.name}`}>
                    <span className="gs-code">{l.code}</span>
                    {isSelf && <span className="gs-self" title="самооценка">○</span>}
                  </button>
                );
              })}
            </div>
            <div className="ab-desc">{matrix[b.id][lead - 1]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Шаг 3: Калибровка ──
function ReviewCalibrate({ member, gd, avgLead, blocks, discId }) {
  const G = window.BT_GRADES;
  // пиры того же грейда И той же дисциплины
  const peers = Object.entries(G.members)
    .filter(([id, m]) => m.grade === gd.grade && m.discipline === discId && id !== member.id)
    .map(([id, m]) => {
      const md = window.BT_DATA.team.find(t => t.id === id);
      const avg = blocks.reduce((a, b) => a + (m.blockLevels[b.id] || m.grade), 0) / blocks.length;
      return { id, name: md ? md.name : id, hue: md ? md.hue : 0, avg, compa: m.compa, target: m.target };
    });
  const all = [
    { id: member.id, name: member.name, hue: member.hue, avg: avgLead, compa: gd.compa, target: gd.target, me: true },
    ...peers,
  ].sort((a, b) => b.avg - a.avg);

  return (
    <div className="review-calibrate">
      <div className="info-banner" style={{ marginBottom: 16 }}>
        <Icon name="scale" size={16} />
        <div style={{ color: 'var(--ink-3)' }}>
          Калибровка выравнивает оценки между лидами, чтобы {gradeCode(gd.grade)} у одного лида значил то же, что у другого.
          Сравнение по сотрудникам того же грейда.
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Распределение по грейду {gradeCode(gd.grade)}</div>
        <div className="section-sub" style={{ marginBottom: 18 }}>{G.disc(discId).label} · средний уровень по блокам · {all.length} человек</div>
        {all.map(p => (
          <div key={p.id} className={`calib-row ${p.me ? 'me' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200, flexShrink: 0 }}>
              <Avatar name={p.name} hue={p.hue} size="sm" />
              <span style={{ fontSize: 13, fontWeight: p.me ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}{p.me && ' (в ревью)'}
              </span>
            </div>
            <div className="calib-track">
              <div className="calib-fill" style={{ width: `${(p.avg - 1) / 6 * 100}%` }} />
              <span className="calib-val mono num">{p.avg.toFixed(1)}</span>
            </div>
            {p.target > gd.grade
              ? <span className="pill pill-info" style={{ height: 18, fontSize: 10 }}>→ {gradeCode(p.target)}</span>
              : <span className="pill" style={{ height: 18, fontSize: 10 }}>стабилен</span>}
          </div>
        ))}
        <div className="calib-scale">
          {window.BT_GRADES.levels.map((l, i) => <span key={l.code} style={{ flex: 1 }}>{l.code}</span>)}
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <Icon name="spark" size={18} />
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {avgLead >= gd.target
            ? `Средний уровень выше целевого ${gradeCode(gd.target)} — кандидат сильнее медианы своего грейда. Повышение обосновано.`
            : `Средний уровень между ${gradeCode(gd.grade)} и ${gradeCode(gd.target)} — типично для кандидата в переходной фазе.`}
        </div>
      </div>
    </div>
  );
}

// ── Шаг 4: Решение ──
function ReviewDecision({ member, gd, decision, setDecision, summary, setSummary, meetsNext, toGrade, blocks }) {
  const options = [
    { id: 'hold', icon: 'check', label: `Сохранить ${gradeCode(gd.grade)}`, desc: 'Уровень подтверждён, повышения пока нет' },
    { id: 'promote', icon: 'trend', label: `Повысить до ${gradeCode(Math.min(gd.grade + 1, 7))}`, desc: 'Стабильно проявляет компетенции следующего уровня' },
    { id: 'pip', icon: 'flag', label: 'План улучшения (PIP)', desc: 'Есть проседания, нужен фокус-план на квартал' },
  ];
  return (
    <div className="review-decision">
      <div className="dec-grid">
        {options.map(o => (
          <div key={o.id} className={`dec-card ${decision === o.id ? 'on ' + o.id : ''}`} onClick={() => setDecision(o.id)}>
            <div className="dec-icon"><Icon name={o.icon} size={18} /></div>
            <div className="dec-label">{o.label}</div>
            <div className="dec-desc">{o.desc}</div>
          </div>
        ))}
      </div>

      {decision === 'promote' && (
        <div className="card salary-impact" style={{ padding: 22, marginTop: 16 }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Влияние на вилку</div>
          <div className="section-sub" style={{ marginBottom: 18 }}>При повышении {gradeCode(gd.grade)} → {gradeCode(toGrade)} (вид лида, без точных окладов)</div>
          <div className="impact-band">
            <div className="ib-from">
              <div className="ib-lbl">сейчас · {gradeCode(gd.grade)}</div>
              <div className="compa-band sm">
                <div className="cb-fill" />
                <span className="cb-marker" style={{ left: `${gd.compa * 100}%` }} />
              </div>
              <div className="ib-pos">{gd.compa < 0.5 ? 'ниже медианы' : 'около медианы'}</div>
            </div>
            <Icon name="arrow" size={20} />
            <div className="ib-to">
              <div className="ib-lbl">после · {gradeCode(toGrade)}</div>
              <div className="compa-band sm">
                <div className="cb-fill" />
                <span className="cb-marker accent" style={{ left: '22%' }} />
              </div>
              <div className="ib-pos">вход в новую полосу (нижняя часть)</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16, lineHeight: 1.5 }}>
            Повышение сбрасывает позицию в нижнюю часть новой, более высокой полосы — это нормально.
            Внеплановое ревью зарплаты запускается автоматически при подтверждении грейда.
          </div>
        </div>
      )}

      {decision === 'pip' && (
        <div className="card" style={{ padding: 22, marginTop: 16, borderColor: 'rgba(192,74,59,0.3)' }}>
          <div className="section-title" style={{ marginBottom: 4, color: 'var(--miss)' }}>Фокус-план на квартал</div>
          <div className="section-sub" style={{ marginBottom: 14 }}>Блоки ниже целевого уровня</div>
          {blocks.filter(b => (gd.blockLevels[b.id] || 0) < gd.grade).map(b => (
            <div key={b.id} className="check" style={{ cursor: 'default' }}>
              <span className="box" /><span className="lbl">{b.name} — дотянуть до {gradeCode(gd.grade)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <div className="field-label">Резюме ревью</div>
        <textarea className="textarea" rows={4} value={summary} onChange={e => setSummary(e.target.value)}
                  placeholder="Ключевые достижения, обоснование решения, договорённости на следующий период…" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
          <Icon name="shield" size={14} />
          Сотрудник увидит резюме и финальное решение после согласования с HR.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PerformanceReview });
