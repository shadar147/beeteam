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
    async fn seeded_lead_password_hash_is_valid_argon2(pool: PgPool) {
        seed_demo(&pool).await.unwrap();
        let hash: (String,) =
            sqlx::query_as("SELECT password_hash FROM users WHERE email = 'e.glebov@beeteam.io'")
                .fetch_one(&pool).await.unwrap();
        assert!(hash.0.starts_with("$argon2id$"), "got: {}", hash.0);
        assert_ne!(hash.0, "!seed-no-login");
    }
}
