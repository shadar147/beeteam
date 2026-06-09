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

    let base_fields: [(&str, &str, &str); 7] = [
        ("mood", "Настроение", ""),
        ("longtext", "Блокеры", "Что мешает в работе?"),
        ("longtext", "Цели", "Над чем работаем?"),
        ("longtext", "Фидбек сотруднику", "Что хочется отметить и улучшить"),
        ("longtext", "Фидбек от сотрудника", "Что говорит сотрудник"),
        ("longtext", "Развитие", "По пункту на строку"),
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
            .bind(format!("seed/{mid}/{name}")).bind(now - day * (10 * (i as i32 + 1)))
            .execute(&mut *tx).await?;
        }
    }

    // ── Grade framework (read-only foundation) ──
    // (code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high)
    let levels: [(&str, &str, &str, &str, &str, bool, f64, f64, f64); 7] = [
        ("IC1", "Trainee", "0–6 мес", "Работает под плотным менторством", "Учебные задачи, pet-проекты", false, 0.78, 1.0, 1.25),
        ("IC2", "Junior", "6 мес–1.5 г", "Делает задачи по чёткому ТЗ с ревью", "Отдельные тикеты", false, 0.73, 1.0, 1.27),
        ("IC3", "Middle", "1.5–3 года", "Самостоятельно решает типовые задачи", "Фича целиком", false, 0.78, 1.0, 1.22),
        ("IC4", "Middle+", "3–5 лет", "Автономен в рамках сервиса", "Несколько связанных фич, модуль", false, 0.85, 1.0, 1.15),
        ("IC5", "Senior", "5+ лет", "Принимает архитектурные решения в своей зоне", "Сервис или подсистема", true, 0.86, 1.0, 1.14),
        ("IC6", "Staff / Tech Lead", "7+ лет", "Определяет технические стандарты команды", "Несколько сервисов, кросс-команды", true, 0.85, 1.0, 1.15),
        ("IC7", "Principal", "10+ лет", "Задаёт технологическое направление", "Весь домен, архитектура компании", true, 0.87, 1.0, 1.13),
    ];
    for (i, l) in levels.iter().enumerate() {
        sqlx::query(
            "INSERT INTO grade_levels (workspace_id, ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(ws_id).bind((i + 1) as i32)
        .bind(l.0).bind(l.1).bind(l.2).bind(l.3).bind(l.4).bind(l.5).bind(l.6).bind(l.7).bind(l.8)
        .execute(&mut *tx).await?;
    }

    // Shared block cells (identical across disciplines).
    let ai_cells: [&str; 7] = [
        "Использует AI-ассистента для объяснения кода и поиска ошибок.",
        "Применяет AI в ежедневной работе. Критически проверяет результат.",
        "Prompt engineering с контекстом и ролью. Выстроенный AI-workflow.",
        "Project instructions, multi-step workflows. Промпты с примерами и constraints.",
        "Настраивает AI-workflow для команды: shared prompts, MCP, CLI.",
        "AI-стратегия команды: delegation, security, multi-agent подходы.",
        "Определяет AI-стратегию компании, governance и стандарты.",
    ];
    let impact_cells: [&str; 7] = [
        "Учится у команды, задаёт вопросы. Влияние в пределах своих задач.",
        "Помогает на стендапах, аккуратно ведёт тикеты.",
        "Помогает джунам, участвует в обсуждениях. Влияет на свою фичу.",
        "Менторит 1–2 человек, выступает на внутренних обсуждениях.",
        "Менторская программа, доклады. Влияет на несколько команд и найм.",
        "Определяет инженерную культуру, развивает лидов.",
        "Формирует tech-бренд компании, влияет на стратегию найма.",
    ];

    // One discipline = (key, label, icon, desc, [(block_key, block_name, [7 cells]); 6]).
    // Block order: stack, core, arch, infra, ai, impact. ai/impact reuse the shared arrays.
    // Ported verbatim from design_handoff_beeteam/grades-data.js (blockNames + matrix per
    // discipline). A cell whose text is exactly "Не требуется." becomes required=false / NULL text.
    type Disc = (&'static str, &'static str, &'static str, &'static str, [(&'static str, &'static str, [&'static str; 7]); 6]);
    let backend: Disc = (
        "backend", "Backend", "fields", "Серверная разработка, API, данные, нагрузка.",
        [
            ("stack", "Серверный стек", [
                "Знает синтаксис языка, ООП, MVC. Пишет простой CRUD под руководством.",
                "Уверенно пишет на проде. ORM, миграции, валидация, очереди. Покрывает тестами.",
                "Самостоятельно проектирует REST API. Service container, events, middleware. Рефакторит legacy.",
                "Оптимизирует performance (N+1, кеш-слой). Сложные запросы и query builders. Профилирование.",
                "Архитектурные паттерны (DDD, hexagonal, CQRS). Проектирует сложные доменные модели.",
                "Определяет стандарты кодирования команды. Сложные code review. Пишет RFC.",
                "Задаёт технологическую стратегию платформы. Решения уровня всего домена.",
            ]),
            ("core", "Базы данных и хранилища", [
                "Базовый SQL (SELECT/JOIN). Понимает, что такое таблица и индекс.",
                "Пишет рабочие запросы, делает миграции. Транзакции, базовые constraints.",
                "Проектирует схемы БД. Осознанно использует индексы и кеш.",
                "Оптимизирует через EXPLAIN. Партиционирование, шардирование. Очереди.",
                "Схемы для high-load. Выбор СУБД. Репликация.",
                "Стратегия data layer: consistency, миграции без downtime, governance.",
                "Дата-стратегия бизнеса: data lake, compliance, долгосрочная архитектура.",
            ]),
            ("arch", "Архитектура и системный дизайн", [
                "Не требуется.",
                "Понимает REST, HTTP-методы, статус-коды, клиент-серверную модель.",
                "Проектирует API для своей фичи. SOLID, базовые паттерны.",
                "Декомпозирует фичу на сервисы. Trade-offs. Distributed tracing.",
                "Системы из нескольких сервисов. Event-driven, CQRS, Saga, API Gateway.",
                "Архитектор на уровне продукта: распределённые системы под бизнес.",
                "Стратегия архитектуры всей компании, участие в C-level решениях.",
            ]),
            ("infra", "Инфраструктура и DevOps", [
                "Базовые Linux-команды. Запуск через docker-compose.",
                "Docker на уровне пользователя. Переменные окружения, .env.",
                "Пишет Dockerfile. Понимает CI/CD. Базовый мониторинг.",
                "CI под свой сервис. Ansible-плейбуки. Blue-green deploy.",
                "Infrastructure as Code. Canary deploy. On-call, алертинг.",
                "DevOps-культура команды: observability, SLO/SLI, incident management.",
                "Инфраструктурная стратегия компании, выбор облака, cost.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    let frontend: Disc = (
        "frontend", "Frontend", "layers", "Клиентская разработка, UI, производительность интерфейса.",
        [
            ("stack", "JS/TS и фреймворк", [
                "Знает JS-синтаксис, DOM, события. Пишет простые компоненты по образцу.",
                "Уверенно работает с фреймворком (React/Vue): state, props, хуки. Пишет тесты по образцу.",
                "Самостоятельно делает фичу: роутинг, формы, работа с API, состояние.",
                "TypeScript на уровне дженериков. Оптимизация ре-рендеров, мемоизация, code-splitting.",
                "Проектирует слой данных (RTK/React Query). Сложные паттерны состояния. SSR/SSG.",
                "Определяет фронт-стандарты команды: линтеры, code style, дизайн-токены.",
                "Задаёт фронтенд-направление компании, выбор технологий на годы.",
            ]),
            ("core", "UI, вёрстка, стили", [
                "Базовая вёрстка HTML/CSS, flex. Адаптив по образцу.",
                "Семантика, grid, адаптив, базовая анимация. Понимает box model.",
                "Сложные layout. Доступность (a11y) базово. Анимации и переходы.",
                "Дизайн-система на практике. WCAG/a11y осознанно. Кросс-браузерность.",
                "Проектирует UI-kit и компонентную библиотеку. Перф рендера, CLS/LCP.",
                "Стандарты UI и a11y на уровне компании. Аудит и метрики качества интерфейса.",
                "Видение UI-платформы организации.",
            ]),
            ("arch", "Архитектура фронта", [
                "Не требуется.",
                "Понимает компонентную модель, поток данных сверху вниз.",
                "Структурирует фичу на компоненты. Понимает разделение слоёв.",
                "Декомпозиция на модули, lazy-загрузка, контракты с API.",
                "Микрофронтенды, module federation, design-system архитектура.",
                "Архитектор фронт-платформы: монорепо, shared-пакеты, контракты.",
                "Стратегия фронт-архитектуры всей компании.",
            ]),
            ("infra", "Сборка и CI", [
                "Запускает проект, npm-скрипты.",
                "Понимает сборщик (Vite/Webpack), .env, dev/prod build.",
                "Настраивает сборку, базовый CI (lint, test, build).",
                "Оптимизация бандла, tree-shaking, CI-пайплайн фичи.",
                "E2E в CI, preview-деплои, Lighthouse-бюджеты.",
                "Определяет фронт-CI и метрики перфа на уровне команды.",
                "Инфраструктура доставки фронта в организации.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    let mobile: Disc = (
        "mobile", "Mobile", "spark", "Мобильная разработка iOS/Android, релизы в сторы.",
        [
            ("stack", "Платформа (язык/SDK)", [
                "Знает базовый синтаксис платформы, lifecycle экрана.",
                "Пишет экраны, работает с сетью и хранением по образцу.",
                "Самостоятельная фича: работа с API, кеш, локальная БД.",
                "Многопоточность, корутины/async, оптимизация памяти и батареи.",
                "Глубокое знание платформы: профилирование, нативные модули.",
                "Определяет мобильные стандарты команды.",
                "Технологическое направление мобайла в компании.",
            ]),
            ("core", "UI и навигация", [
                "Простые экраны по макету.",
                "Списки, формы, базовая навигация.",
                "Сложная навигация, состояния экранов, анимации.",
                "Дизайн-система, адаптив под устройства, accessibility.",
                "UI-kit, кастомные компоненты, перф скролла и анимаций.",
                "Стандарты UI и a11y на уровне продукта.",
                "Видение мобильного UI-фреймворка организации.",
            ]),
            ("arch", "Архитектура приложения", [
                "Не требуется.",
                "Понимает разделение UI и логики.",
                "MVVM/MVI на практике, DI базово.",
                "Модульность, чистая архитектура, контракты с API.",
                "Многомодульное приложение, feature-флаги, offline-first.",
                "Архитектор мобильной платформы: shared-код, KMP.",
                "Стратегия мобильной архитектуры компании.",
            ]),
            ("infra", "Релизы и сборка", [
                "Собирает debug-сборку локально.",
                "Понимает подпись, build variants, .env.",
                "Настраивает CI-сборку, базовые тесты.",
                "Fastlane, автосборки, beta-дистрибуция (TestFlight/Firebase).",
                "Release-пайплайн, поэтапная раскатка, crash-мониторинг.",
                "Определяет релизный процесс команды.",
                "Инфраструктура доставки мобильных приложений в организации.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    let qa: Disc = (
        "qa", "QA", "check", "Обеспечение качества, тест-дизайн, автоматизация.",
        [
            ("stack", "Автоматизация тестов", [
                "Запускает готовые автотесты, читает отчёты.",
                "Пишет простые UI/API-автотесты по образцу.",
                "Самостоятельно автоматизирует сценарии, page objects.",
                "Стабильные автотесты, борьба с flaky, параллельный прогон.",
                "Проектирует фреймворк автоматизации, переиспользуемые слои.",
                "Определяет стандарты автоматизации команды.",
                "Стратегия автоматизации качества компании.",
            ]),
            ("core", "Тест-дизайн", [
                "Выполняет тест-кейсы по чек-листу.",
                "Пишет тест-кейсы, репортит баги с шагами.",
                "Тест-дизайн: классы эквивалентности, граничные значения.",
                "Риск-ориентированное тестирование, тест-аналитика требований.",
                "Стратегия тестирования продукта, метрики покрытия.",
                "Определяет процессы QA в команде.",
                "Видение качества на уровне организации.",
            ]),
            ("arch", "Стратегия качества", [
                "Не требуется.",
                "Понимает пирамиду тестирования.",
                "Различает unit/integration/e2e, где что применять.",
                "Проектирует тест-стратегию для фичи, contract-тесты.",
                "Shift-left, quality gates, тест-окружения как код.",
                "Архитектор процессов качества: метрики, SLA багов.",
                "Стратегия качества всей компании.",
            ]),
            ("infra", "Окружения и CI", [
                "Запускает тесты в готовом окружении.",
                "Понимает тест-данные, стенды, .env.",
                "Настраивает прогон тестов в CI.",
                "Управляет тест-окружениями, моками, тест-данными.",
                "Параллельные прогоны, отчётность, флаки-дашборды в CI.",
                "Определяет CI/CD-гейты качества команды.",
                "Инфраструктура качества в организации.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    let devops: Disc = (
        "devops", "DevOps", "settings", "Инфраструктура, надёжность, CI/CD, observability.",
        [
            ("stack", "IaC и оркестрация", [
                "Базовые Linux-команды, docker-compose.",
                "Пишет Dockerfile, понимает реестры образов.",
                "Kubernetes базово: деплои, сервисы. Helm по образцу.",
                "Terraform/Ansible, модули IaC, secrets-менеджмент.",
                "Проектирует кластеры, автоскейлинг, multi-env IaC.",
                "Определяет IaC-стандарты компании, GitOps.",
                "Инфраструктурная стратегия организации.",
            ]),
            ("core", "Сети, хранилища, БД", [
                "Понимает порты, DNS, HTTP базово.",
                "Сети контейнеров, volume, базовое хранилище.",
                "Балансировка, TLS, бэкапы. Реплики БД.",
                "VPC/подсети, service mesh базово, отказоустойчивые хранилища.",
                "Проектирует сеть и хранение для high-load, DR-планы.",
                "Стратегия сети и данных на уровне компании.",
                "Долгосрочная инфраструктура хранения и связности.",
            ]),
            ("arch", "Архитектура надёжности", [
                "Не требуется.",
                "Понимает, что такое доступность и мониторинг.",
                "Алертинг, дашборды, базовые health-checks.",
                "SLO/SLI, error budget, graceful degradation.",
                "Проектирует отказоустойчивость, multi-AZ, chaos-тесты.",
                "Архитектор надёжности: incident management, postmortems.",
                "Стратегия надёжности всей компании.",
            ]),
            ("infra", "CI/CD пайплайны", [
                "Запускает готовый пайплайн.",
                "Правит CI-конфиг по образцу.",
                "Строит пайплайн сборки и деплоя сервиса.",
                "Blue-green/canary, автоматические откаты.",
                "Многоступенчатые пайплайны, прогрессивная доставка.",
                "Определяет CI/CD-платформу команды.",
                "Стратегия доставки в организации.",
            ]),
            ("ai", "AI-инструменты", ai_cells),
            ("impact", "Командное влияние", impact_cells),
        ],
    );

    for (d_ord, disc) in [backend, frontend, mobile, qa, devops].iter().enumerate() {
        let drow: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO disciplines (workspace_id, key, label, icon, description, ord) \
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        )
        .bind(ws_id).bind(disc.0).bind(disc.1).bind(disc.2).bind(disc.3).bind(d_ord as i32)
        .fetch_one(&mut *tx).await?;
        for (b_ord, (bkey, bname, cells)) in disc.4.iter().enumerate() {
            let brow: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO grade_blocks (discipline_id, key, name, ord) VALUES ($1,$2,$3,$4) RETURNING id",
            )
            .bind(drow.0).bind(*bkey).bind(*bname).bind(b_ord as i32)
            .fetch_one(&mut *tx).await?;
            for (lvl, text) in cells.iter().enumerate() {
                let required = *text != "Не требуется.";
                let stored: Option<&str> = if required { Some(*text) } else { None };
                sqlx::query(
                    "INSERT INTO matrix_cells (block_id, level_ord, text, required) VALUES ($1,$2,$3,$4)",
                )
                .bind(brow.0).bind((lvl + 1) as i32).bind(stored).bind(required)
                .execute(&mut *tx).await?;
            }
        }
    }

    // ── Member grades (slice #2): 6 engineers graded; designer + PM left ungraded ──
    // (member_name, discipline_key, grade, target?, compa, ready_months, mgr,
    //  next_review_offset_days, last_review_offset_days?, [stack,core,arch,infra,ai,impact])
    type MG = (&'static str, &'static str, i32, Option<i32>, f64, i32, bool, i64, Option<i64>, [i32; 6]);
    let member_grades: [MG; 6] = [
        ("Анна Лебедева",     "frontend", 5, Some(6), 0.62, 4, false,  30, Some(-45), [6, 5, 5, 4, 6, 5]),
        ("Игорь Петров",      "backend",  4, Some(5), 0.48, 2, false,  12, Some(-20), [4, 5, 4, 4, 3, 3]),
        ("Мария Соколова",    "qa",       5, None,    0.55, 0, true,   22, Some(-14), [5, 6, 5, 4, 4, 6]),
        ("Тимур Хасанов",     "frontend", 2, Some(3), 0.35, 2, false,  21, None,      [3, 3, 2, 2, 3, 2]),
        ("Светлана Морозова", "devops",   4, None,    0.52, 0, false,   5, Some(-30), [5, 4, 4, 6, 4, 4]),
        ("Алексей Романов",   "backend",  3, Some(4), 0.58, 3, false,  27, Some(-60), [4, 3, 3, 3, 4, 3]),
    ];
    const BLOCK_KEYS: [&str; 6] = ["stack", "core", "arch", "infra", "ai", "impact"];
    for mg in member_grades.iter() {
        let member: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM team_members WHERE name = $1 AND team_id = $2")
                .bind(mg.0).bind(team_id)
                .fetch_one(&mut *tx).await?;
        let disc: (uuid::Uuid,) =
            sqlx::query_as("SELECT id FROM disciplines WHERE key = $1 AND workspace_id = $2")
                .bind(mg.1).bind(ws_id)
                .fetch_one(&mut *tx).await?;
        let next_review = (now + day * mg.7 as i32).date_naive();
        let last_review = mg.8.map(|d| (now + day * d as i32).date_naive());
        let grow: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO member_grades \
             (member_id, discipline_id, grade_ord, target_ord, compa, ready_months, mgr_track, next_review, last_review) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        )
        .bind(member.0).bind(disc.0).bind(mg.2).bind(mg.3).bind(mg.4)
        .bind(mg.5).bind(mg.6).bind(next_review).bind(last_review)
        .fetch_one(&mut *tx).await?;
        for (i, bkey) in BLOCK_KEYS.iter().enumerate() {
            let block: (uuid::Uuid,) =
                sqlx::query_as("SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2")
                    .bind(*bkey).bind(disc.0)
                    .fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO member_block_levels (member_grade_id, block_id, level_ord) VALUES ($1,$2,$3)",
            )
            .bind(grow.0).bind(block.0).bind(mg.9[i])
            .execute(&mut *tx).await?;
        }
    }

    // ── Grade evidence for Анна (slice #3), tied to her recent done meetings ──
    {
        let aid = anna_id.expect("seed: Anna must exist");
        let fe: (uuid::Uuid,) = sqlx::query_as(
            "SELECT id FROM disciplines WHERE key = 'frontend' AND workspace_id = $1",
        ).bind(ws_id).fetch_one(&mut *tx).await?;
        let done: Vec<(uuid::Uuid,)> = sqlx::query_as(
            "SELECT id FROM meetings WHERE member_id = $1 AND state = 'done' ORDER BY date DESC",
        ).bind(aid).fetch_all(&mut *tx).await?;
        let m0 = done.get(0).map(|r| r.0);
        let m1 = done.get(1).map(|r| r.0);
        let ev: [(&str, i32, &str, Option<uuid::Uuid>, &str); 6] = [
            ("arch",   6, "demonstrated", m0, "Спроектировала миграцию админ-кабинета — декомпозиция на модули, ADR по shared-state."),
            ("impact", 5, "demonstrated", m0, "Менторский ритм с Тимуром — 4/4 ревью за месяц."),
            ("arch",   6, "partial",      m1, "Начала проектировать модульную систему фичефлагов, не хватило alignment с платформой."),
            ("impact", 5, "demonstrated", m1, "Сильно вытянула собеседование — кандидат принял оффер."),
            ("stack",  6, "demonstrated", m0, "Задала критерии успеха редизайна, выступила как tech-owner на план-сессии."),
            ("ai",     6, "demonstrated", m1, "Настроила shared prompts и MCP-сервер для команды фронтенда."),
        ];
        for (bkey, level, status, meeting, note) in ev.iter() {
            let block: (uuid::Uuid,) = sqlx::query_as(
                "SELECT id FROM grade_blocks WHERE key = $1 AND discipline_id = $2",
            ).bind(*bkey).bind(fe.0).fetch_one(&mut *tx).await?;
            sqlx::query(
                "INSERT INTO grade_evidence (member_id, meeting_id, block_id, level_ord, status, note, created_by) \
                 VALUES ($1,$2,$3,$4,$5::evidence_status,$6,$7)",
            )
            .bind(aid).bind(*meeting).bind(block.0).bind(*level).bind(*status).bind(*note).bind(lead_id)
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
        assert_eq!(fields.0, 7);

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
                OR NOT EXISTS (SELECT 1 FROM development_items d WHERE d.member_id = tm.id) \
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
    async fn seed_loads_grade_framework(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let levels: (i64,) = sqlx::query_as("SELECT count(*) FROM grade_levels").fetch_one(&pool).await.unwrap();
        assert_eq!(levels.0, 7, "7 levels");
        let disc: (i64,) = sqlx::query_as("SELECT count(*) FROM disciplines").fetch_one(&pool).await.unwrap();
        assert_eq!(disc.0, 5, "5 disciplines");
        // each discipline has 6 blocks → 30 blocks; each block 7 cells → 210 cells.
        let blocks: (i64,) = sqlx::query_as("SELECT count(*) FROM grade_blocks").fetch_one(&pool).await.unwrap();
        assert_eq!(blocks.0, 30, "6 blocks × 5 disciplines");
        let cells: (i64,) = sqlx::query_as("SELECT count(*) FROM matrix_cells").fetch_one(&pool).await.unwrap();
        assert_eq!(cells.0, 210, "30 blocks × 7 levels");
        // backend/arch/IC1 is "Не требуется." → required=false
        let not_req: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM matrix_cells mc \
             JOIN grade_blocks b ON b.id = mc.block_id \
             JOIN disciplines d ON d.id = b.discipline_id \
             WHERE d.key='backend' AND b.key='arch' AND mc.level_ord=1 AND mc.required=false",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(not_req.0, 1, "backend/arch/IC1 not required");
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn seed_loads_member_grades(pool: PgPool) {
        seed_demo(&pool).await.unwrap();

        let grades: (i64,) = sqlx::query_as("SELECT count(*) FROM member_grades")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(grades.0, 6, "6 engineers graded");

        let levels: (i64,) = sqlx::query_as("SELECT count(*) FROM member_block_levels")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(levels.0, 36, "6 members × 6 blocks");

        let mismatched: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM member_grades mg \
             WHERE (SELECT count(*) FROM member_block_levels mbl WHERE mbl.member_grade_id = mg.id) \
                <> (SELECT count(*) FROM grade_blocks gb WHERE gb.discipline_id = mg.discipline_id)",
        )
        .fetch_one(&pool).await.unwrap();
        assert_eq!(mismatched.0, 0, "block-level count matches discipline blocks");

        let designer: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM member_grades mg \
             JOIN team_members tm ON tm.id = mg.member_id \
             WHERE tm.name = 'Дмитрий Кузнецов'",
        )
        .fetch_one(&pool).await.unwrap();
        assert_eq!(designer.0, 0, "designer has no grade");
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

    #[sqlx::test(migrations = "./migrations")]
    async fn seed_loads_grade_evidence(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let n: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM grade_evidence ge \
             JOIN team_members tm ON tm.id = ge.member_id \
             WHERE tm.name = 'Анна Лебедева'",
        ).fetch_one(&pool).await.unwrap();
        assert!(n.0 >= 4, "Анна has seeded evidence");
    }
}
