use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;
use sqlx::PgPool;

/// Idempotent demo seed. No-op if a workspace already exists.
pub async fn seed_demo(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    let existing: (i64,) = sqlx::query_as("SELECT count(*) FROM workspaces")
        .fetch_one(&mut *tx)
        .await?;
    if existing.0 > 0 {
        return Ok(()); // tx drops and rolls back — no-op
    }

    // Workspace
    let ws: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO workspaces (name, domain, default_cadence) \
         VALUES ($1, $2, '2w'::cadence) RETURNING id",
    )
    .bind("BeeTeam")
    .bind("beeteam.io")
    .fetch_one(&mut *tx)
    .await?;
    let ws_id = ws.0;

    // Lead user (password hash filled by the Auth plan; placeholder for now)
    let lead: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO users (workspace_id, email, password_hash, name, role, hue) \
         VALUES ($1, $2, $3, $4, 'lead'::user_role, $5) RETURNING id",
    )
    .bind(ws_id)
    .bind("e.glebov@beeteam.io")
    .bind(seed_hash("demo1234")) // demo lead password: demo1234
    .bind("Евгений Глебов")
    .bind(40)
    .fetch_one(&mut *tx)
    .await?;
    let lead_id = lead.0;

    // Base field template
    let tpl: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO field_templates (workspace_id, name, description, system, version, updated_by) \
         VALUES ($1, 'Базовый', 'Стандартный набор полей 1-2-1', true, '1.0', 'system') RETURNING id",
    )
    .bind(ws_id)
    .fetch_one(&mut *tx)
    .await?;
    let tpl_id = tpl.0;

    let base_fields: [(&str, &str, &str); 6] = [
        ("mood", "Настроение", ""),
        ("longtext", "Блокеры", "Что мешает в работе?"),
        ("longtext", "Цели", "Над чем работаем?"),
        ("longtext", "Фидбек", "Фидбек к / от"),
        ("longtext", "Развитие", "План развития"),
        ("longtext", "Отношения", "Как в команде?"),
    ];
    for (i, (ty, title, ph)) in base_fields.iter().enumerate() {
        sqlx::query(
            "INSERT INTO field_defs (template_id, ord, type, title, placeholder) \
             VALUES ($1, $2, $3::field_type, $4, $5)",
        )
        .bind(tpl_id)
        .bind(i as i32)
        .bind(*ty)
        .bind(*title)
        .bind(opt(*ph))
        .execute(&mut *tx)
        .await?;
    }

    // Team
    let team: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO teams (workspace_id, name, mission, color, lead_id, default_template_id, default_cadence, visibility) \
         VALUES ($1, 'Платформенный отдел', 'Платформа и инфраструктура продукта', '#F5A524', $2, $3, '2w'::cadence, 'private'::visibility) RETURNING id",
    )
    .bind(ws_id)
    .bind(lead_id)
    .bind(tpl_id)
    .fetch_one(&mut *tx)
    .await?;
    let team_id = team.0;

    // 8 team members (ported from data.js)
    // (name, role, email, joined_display, tz, mood_trend, status, tags, hue, joined_iso)
    let members: [(&str, &str, &str, &str, &str, [i32; 7], &str, &[&str], i32, &str); 8] = [
        ("Анна Лебедева", "Senior Frontend", "a.lebedeva@beeteam.io", "14 янв 2023", "Europe/Moscow", [7,8,8,7,9,9,8], "ok", &["Mentor"], 28, "2023-01-14"),
        ("Игорь Петров", "Backend Engineer", "i.petrov@beeteam.io", "02 мар 2022", "Europe/Moscow", [6,6,7,7,7,6,7], "ok", &[], 200, "2022-03-02"),
        ("Мария Соколова", "QA Lead", "m.sokolova@beeteam.io", "08 авг 2021", "Europe/Moscow", [8,8,9,7,6,7,7], "warn", &["Promotion"], 320, "2021-08-08"),
        ("Дмитрий Кузнецов", "Product Designer", "d.kuznecov@beeteam.io", "18 окт 2023", "Europe/Berlin", [7,7,8,9,9,8,9], "ok", &[], 145, "2023-10-18"),
        ("Елена Воронцова", "Project Manager", "e.voroncova@beeteam.io", "04 фев 2020", "Europe/Moscow", [9,9,8,8,9,9,9], "ok", &["Lead Track"], 12, "2020-02-04"),
        ("Тимур Хасанов", "Junior Frontend", "t.hasanov@beeteam.io", "12 янв 2026", "Europe/Moscow", [5,6,5,6,7,6,7], "warn", &["Onboarding"], 260, "2026-01-12"),
        ("Светлана Морозова", "DevOps Engineer", "s.morozova@beeteam.io", "21 май 2022", "Asia/Tbilisi", [7,6,5,5,4,5,4], "miss", &["Burnout risk"], 175, "2022-05-21"),
        ("Алексей Романов", "Backend Engineer", "a.romanov@beeteam.io", "07 ноя 2024", "Europe/Moscow", [6,7,7,8,8,8,8], "ok", &[], 90, "2024-11-07"),
    ];

    let mut anna_id: Option<uuid::Uuid> = None;
    let mut member_ids: Vec<(uuid::Uuid, &str)> = Vec::new(); // (id, status)
    for m in members.iter() {
        let trend: Vec<i32> = m.5.to_vec();
        let tags: Vec<String> = m.7.iter().map(|s| s.to_string()).collect();
        let joined_date = chrono::NaiveDate::parse_from_str(m.9, "%Y-%m-%d").expect("seed: valid join date");
        let row: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members \
             (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue, joined_date) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::member_status,$10,$11,$12) RETURNING id",
        )
        .bind(ws_id).bind(team_id)
        .bind(m.0).bind(m.1).bind(m.2).bind(m.3).bind(m.4)
        .bind(&trend).bind(m.6).bind(&tags).bind(m.8).bind(joined_date)
        .fetch_one(&mut *tx)
        .await?;
        if m.0 == "Анна Лебедева" {
            anna_id = Some(row.0);
        }
        member_ids.push((row.0, m.6));
    }

    let now = chrono::Utc::now();
    let day = chrono::Duration::days(1);

    // Anna's 6 detailed meetings, re-dated as offsets (days) from now.
    // (days_offset, state, duration, mood, mood_score, blockers, goals, feedback_to, feedback_from, development[], relationships)
    {
        let aid = anna_id.expect("seed: 'Анна Лебедева' must be among the seeded members");
        type Mtg = (i64, &'static str, i32, Option<&'static str>, Option<i32>, &'static str, &'static str, &'static str, &'static str, &'static [&'static str], &'static str);
        let history: [Mtg; 6] = [
            (-7, "done", 45, Some("🙂"), Some(8),
             "Долгое ревью PR от соседней команды по платежному модулю — стопает релиз. Договорились эскалировать к Игорю.",
             "Закрыть до конца квартала миграцию старого админ-кабинета на новый дизайн-кит. Подготовить ADR по shared-state библиотеке.",
             "Отличная работа на демо в пятницу — клиенты отметили скорость интерфейса. Продолжай.",
             "Хотелось бы больше времени на R&D в спринте, хотя бы один день в две недели.",
             &["Курс по архитектуре React-приложений (Frontend Masters)","Доклад на внутренний митап про микрофронтенды"],
             "С командой всё ровно, с Тимуром выстроила менторский ритм."),
            (-21, "done", 50, Some("😐"), Some(6),
             "Спорный технический выбор по новому фичефлаг-сервису. Не хватает alignment c платформенной командой.",
             "Согласовать архитектуру нового админ-кабинета. Сделать onboarding гайд для Тимура.",
             "Ты сильно вытянула собес на прошлой неделе — кандидат принял оффер.",
             "Хочу прозрачности по бюджету на конференции в Q3.",
             &["Системный дизайн: книга \"Designing Data-Intensive Applications\""],
             "С продактами иногда долго согласовываются изменения скоупа."),
            (-35, "done", 40, Some("🙂"), Some(8),
             "Ничего критичного. Ожидаем доступы в стейджинг от безопасности.",
             "Подготовка к Q2 планированию. Сформулировать критерии успеха для редизайна.",
             "Хорошо отыграла роль на план-сессии — задала тон команде.",
             "Думаю над сменой грейда — хотелось бы понять трек на ближайшие 6 мес.",
             &["Внутренний leadership-трек"], ""),
            (-49, "done", 35, Some("😄"), Some(9),
             "Нет блокеров.", "Релиз новой страницы аналитики до конца месяца.",
             "Спасибо за помощь с релизом — без тебя бы не выкатили.",
             "Всё ок. Хочется больше технических вызовов.", &[],
             "С командой отлично, с дизайнером Дмитрием выстроилась хорошая синергия."),
            (7, "planned", 45, None, None, "", "", "", "", &[], ""),
            (-63, "miss", 30, None, None, "", "", "", "", &[], ""),
        ];
        for h in history.iter() {
            let date = now + day * (h.0 as i32);
            let dev: Vec<String> = h.9.iter().map(|s| s.to_string()).collect();
            sqlx::query(
                "INSERT INTO meetings \
                 (workspace_id, member_id, date, state, duration_min, mood, mood_score, \
                  blockers, goals, feedback_to, feedback_from, development, relationships) \
                 VALUES ($1,$2,$3,$4::meeting_state,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            )
            .bind(ws_id).bind(aid).bind(date).bind(h.1).bind(h.2)
            .bind(h.3).bind(h.4)
            .bind(opt(h.5)).bind(opt(h.6)).bind(opt(h.7)).bind(opt(h.8))
            .bind(&dev).bind(opt(h.10))
            .execute(&mut *tx)
            .await?;
        }
    }

    // Every member (except Anna) gets a recent "last" (done) + an upcoming "next" (planned),
    // keyed off status so team stats are non-empty and varied.
    for (mid, status) in member_ids.iter() {
        if Some(*mid) == anna_id { continue; }
        let (last_off, next_off): (i64, Option<i64>) = match *status {
            "warn" => (-16, Some(4)),
            "miss" => (-30, None),
            _ => (-5, Some(9)),
        };
        sqlx::query(
            "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
             VALUES ($1, $2, $3, 'done'::meeting_state, 45)",
        )
        .bind(ws_id).bind(mid).bind(now + day * (last_off as i32))
        .execute(&mut *tx).await?;

        if let Some(n) = next_off {
            sqlx::query(
                "INSERT INTO meetings (workspace_id, member_id, date, state, duration_min) \
                 VALUES ($1, $2, $3, 'planned'::meeting_state, 45)",
            )
            .bind(ws_id).bind(mid).bind(now + day * (n as i32))
            .execute(&mut *tx).await?;
        }
    }

    // ── Goals tab: OKRs (goals) + dev plan (development_items) + competencies ──
    // Anna is the showcase profile (ported from flows.jsx GoalsTab).
    let aid = anna_id.expect("seed: Anna must exist");

    // (quarter, title, key_result, progress, status, due_days_from_now)
    let anna_okrs: [(&str, &str, &str, i32, &str, i64); 3] = [
        ("Q2 2026", "Ускорить ключевые экраны", "LCP < 1.5s на 90% сессий", 60, "ontrack", 40),
        ("Q2 2026", "Дизайн-система v2", "Покрыть 80% компонентов токенами", 35, "risk", 25),
        ("Q1 2026", "Онбординг джунов", "2 ментируемых вышли на self-review", 100, "done", -10),
    ];
    for o in anna_okrs.iter() {
        sqlx::query(
            "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
             VALUES ($1,$2,$3,$4,$5,$6,$7::goal_status,$8)",
        )
        .bind(ws_id).bind(aid).bind(o.0).bind(o.1).bind(o.2).bind(o.3).bind(o.4)
        .bind(now + day * (o.5 as i32))
        .execute(&mut *tx).await?;
    }

    // (title, kind, status, note, ord)
    let anna_dev: [(&str, &str, &str, &str, i32); 5] = [
        ("Advanced React Performance", "Курс", "in_progress", "Прогресс 60%", 0),
        ("Доклад на внутреннем митапе", "Доклад", "planned", "Тема: rendering budget", 1),
        ("Designing Data-Intensive Applications", "Книга", "in_progress", "Глава 4 / 12", 2),
        ("AWS Solutions Architect", "Сертификат", "planned", "", 3),
        ("Менторство двух джунов", "Менторство", "done", "Q1 завершён", 4),
    ];
    for d in anna_dev.iter() {
        sqlx::query(
            "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
             VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(ws_id).bind(aid).bind(d.0).bind(d.1).bind(d.2).bind(opt(d.3)).bind(d.4)
        .execute(&mut *tx).await?;
    }

    // (label, score, ord) — competency bars 0..10
    let anna_comp: [(&str, i32, i32); 5] = [
        ("Frontend архитектура", 9, 0),
        ("Коммуникация", 8, 1),
        ("Менторство", 8, 2),
        ("Системный дизайн", 6, 3),
        ("Бэкенд", 5, 4),
    ];
    for c in anna_comp.iter() {
        sqlx::query(
            "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(ws_id).bind(aid).bind(c.0).bind(c.1).bind(c.2)
        .execute(&mut *tx).await?;
    }

    // Anna's files (one linked to her most recent done meeting → meeting_label).
    let anna_last_done: Option<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM meetings WHERE member_id = $1 AND state = 'done' ORDER BY date DESC LIMIT 1",
    ).bind(aid).fetch_optional(&mut *tx).await?;
    let anna_meeting_id = anna_last_done.map(|r| r.0);

    // (name, mime, kind, size_bytes, uploaded_by, days_ago, link_to_meeting)
    let anna_files: [(&str, &str, &str, i64, &str, i64, bool); 7] = [
        ("Итоги 1-2-1.pdf", "application/pdf", "pdf", 184_320, "Евгений Глебов", 7, true),
        ("План развития Q2.docx", "application/vnd.openxmlformats", "doc", 41_984, "Анна Лебедева", 9, false),
        ("Скрин дашборда.png", "image/png", "img", 612_400, "Анна Лебедева", 12, false),
        ("Метрики LCP.xlsx", "application/vnd.ms-excel", "sheet", 28_672, "Анна Лебедева", 14, false),
        ("Демо рефактора.mp4", "video/mp4", "video", 8_388_608, "Анна Лебедева", 20, false),
        ("Архитектура DS v2.pdf", "application/pdf", "pdf", 256_000, "Анна Лебедева", 28, false),
        ("Заметки ретро.docx", "application/vnd.openxmlformats", "doc", 18_944, "Анна Лебедева", 33, false),
    ];
    for f in anna_files.iter() {
        let meeting_bind = if f.6 { anna_meeting_id } else { None };
        sqlx::query(
            "INSERT INTO files (workspace_id, member_id, meeting_id, name, mime, kind, size_bytes, storage_key, uploaded_by, created_at) \
             VALUES ($1,$2,$3,$4,$5,$6::file_kind,$7,$8,$9,$10)",
        )
        .bind(ws_id).bind(aid).bind(meeting_bind)
        .bind(f.0).bind(f.1).bind(f.2).bind(f.3)
        .bind(format!("seed/{}", f.0))
        .bind(f.4).bind(now - day * (f.5 as i32))
        .execute(&mut *tx).await?;
    }

    // ── Base set for the other 7 members so their tabs aren't empty ──
    let base_comp: [(&str, i32); 5] = [
        ("Профессионализм", 7), ("Коммуникация", 6), ("Командная работа", 7),
        ("Инициатива", 5), ("Развитие", 6),
    ];
    for (mid, _status) in member_ids.iter() {
        if Some(*mid) == anna_id { continue; }

        sqlx::query(
            "INSERT INTO goals (workspace_id, member_id, quarter, title, key_result, progress, status, due) \
             VALUES ($1,$2,'Q2 2026','Цель квартала','Ключевой результат',45,'ontrack'::goal_status,$3)",
        )
        .bind(ws_id).bind(mid).bind(now + day * 30)
        .execute(&mut *tx).await?;

        sqlx::query(
            "INSERT INTO development_items (workspace_id, member_id, title, kind, status, note, ord) \
             VALUES ($1,$2,'Внутренний курс','Курс','in_progress','Прогресс 40%',0)",
        )
        .bind(ws_id).bind(mid).execute(&mut *tx).await?;

        for (i, c) in base_comp.iter().enumerate() {
            sqlx::query(
                "INSERT INTO competencies (workspace_id, member_id, label, score, ord) \
                 VALUES ($1,$2,$3,$4,$5)",
            )
            .bind(ws_id).bind(mid).bind(c.0).bind(c.1).bind(i as i32)
            .execute(&mut *tx).await?;
        }

        for (i, (name, mime, kind, size)) in [
            ("Заметки 1-2-1.pdf", "application/pdf", "pdf", 96_000_i64),
            ("План на квартал.docx", "application/vnd.openxmlformats", "doc", 22_528_i64),
        ].iter().enumerate() {
            sqlx::query(
                "INSERT INTO files (workspace_id, member_id, name, mime, kind, size_bytes, storage_key, uploaded_by, created_at) \
                 VALUES ($1,$2,$3,$4,$5::file_kind,$6,$7,'Евгений Глебов',$8)",
            )
            .bind(ws_id).bind(mid).bind(name).bind(mime).bind(kind).bind(size)
            .bind(format!("seed/{name}")).bind(now - day * (10 * (i as i32 + 1)))
            .execute(&mut *tx).await?;
        }
    }

    tx.commit().await?;
    Ok(())
}

fn opt(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

/// Argon2id hash used to seed the demo lead's password (demo1234).
fn seed_hash(plain: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .expect("seed: hashing must succeed")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn seed_is_idempotent_and_loads_team(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        seed_demo(&pool).await.unwrap(); // second call is a no-op

        let members: (i64,) = sqlx::query_as("SELECT count(*) FROM team_members")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(members.0, 8);

        let meetings: (i64,) = sqlx::query_as("SELECT count(*) FROM meetings")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(meetings.0, 19);

        let fields: (i64,) = sqlx::query_as("SELECT count(*) FROM field_defs")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(fields.0, 6);

        let dated: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM team_members WHERE joined_date IS NOT NULL")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(dated.0, 8);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn seed_populates_goals_files_dev_competencies(pool: PgPool) {
        seed_demo(&pool).await.unwrap();

        let anna: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM team_members WHERE name = 'Анна Лебедева'")
                .fetch_one(&pool).await.unwrap();

        let okrs: (i64,) = sqlx::query_as("SELECT count(*) FROM goals WHERE member_id = $1")
            .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(okrs.0, 3, "Anna OKRs");

        let dev: (i64,) =
            sqlx::query_as("SELECT count(*) FROM development_items WHERE member_id = $1")
                .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(dev.0, 5, "Anna dev-items");

        let comp: (i64,) =
            sqlx::query_as("SELECT count(*) FROM competencies WHERE member_id = $1")
                .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(comp.0, 5, "Anna competencies");

        let files: (i64,) = sqlx::query_as("SELECT count(*) FROM files WHERE member_id = $1")
            .bind(anna.0).fetch_one(&pool).await.unwrap();
        assert_eq!(files.0, 7, "Anna files");

        let bare: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM team_members tm \
             WHERE NOT EXISTS (SELECT 1 FROM goals g WHERE g.member_id = tm.id) \
                OR NOT EXISTS (SELECT 1 FROM competencies c WHERE c.member_id = tm.id) \
                OR NOT EXISTS (SELECT 1 FROM files f WHERE f.member_id = tm.id)",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(bare.0, 0, "no member has an empty Goals or Files tab");

        let linked: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM files WHERE member_id = $1 AND meeting_id IS NOT NULL",
        ).bind(anna.0).fetch_one(&pool).await.unwrap();
        assert!(linked.0 >= 1, "at least one Anna file linked to a meeting");
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn seeded_lead_password_hash_is_valid_argon2(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let hash: (String,) =
            sqlx::query_as("SELECT password_hash FROM users WHERE email = 'e.glebov@beeteam.io'")
                .fetch_one(&pool).await.unwrap();
        assert!(hash.0.starts_with("$argon2id$"), "got: {}", hash.0);
        assert_ne!(hash.0, "!seed-no-login");
    }
}
