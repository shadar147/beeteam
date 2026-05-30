use chrono::TimeZone;
use sqlx::PgPool;

/// Idempotent demo seed. No-op if a workspace already exists.
pub async fn seed_demo(pool: &PgPool) -> Result<(), sqlx::Error> {
    let existing: (i64,) = sqlx::query_as("SELECT count(*) FROM workspaces")
        .fetch_one(pool)
        .await?;
    if existing.0 > 0 {
        return Ok(());
    }

    let mut tx = pool.begin().await?;

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
    .bind("!seed-no-login") // replaced by Auth plan with a real argon2 hash
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
        .bind(*ph)
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
    // (name, role, email, joined, tz, mood_trend, status, tags, hue)
    let members: [(&str, &str, &str, &str, &str, [i32; 7], &str, &[&str], i32); 8] = [
        ("Анна Лебедева", "Senior Frontend", "a.lebedeva@beeteam.io", "14 янв 2023", "Europe/Moscow", [7,8,8,7,9,9,8], "ok", &["Mentor"], 28),
        ("Игорь Петров", "Backend Engineer", "i.petrov@beeteam.io", "02 мар 2022", "Europe/Moscow", [6,6,7,7,7,6,7], "ok", &[], 200),
        ("Мария Соколова", "QA Lead", "m.sokolova@beeteam.io", "08 авг 2021", "Europe/Moscow", [8,8,9,7,6,7,7], "warn", &["Promotion"], 320),
        ("Дмитрий Кузнецов", "Product Designer", "d.kuznecov@beeteam.io", "18 окт 2023", "Europe/Berlin", [7,7,8,9,9,8,9], "ok", &[], 145),
        ("Елена Воронцова", "Project Manager", "e.voroncova@beeteam.io", "04 фев 2020", "Europe/Moscow", [9,9,8,8,9,9,9], "ok", &["Lead Track"], 12),
        ("Тимур Хасанов", "Junior Frontend", "t.hasanov@beeteam.io", "12 янв 2026", "Europe/Moscow", [5,6,5,6,7,6,7], "warn", &["Onboarding"], 260),
        ("Светлана Морозова", "DevOps Engineer", "s.morozova@beeteam.io", "21 май 2022", "Asia/Tbilisi", [7,6,5,5,4,5,4], "miss", &["Burnout risk"], 175),
        ("Алексей Романов", "Backend Engineer", "a.romanov@beeteam.io", "07 ноя 2024", "Europe/Moscow", [6,7,7,8,8,8,8], "ok", &[], 90),
    ];

    let mut anna_id: Option<uuid::Uuid> = None;
    for m in members.iter() {
        let trend: Vec<i32> = m.5.to_vec();
        let tags: Vec<String> = m.7.iter().map(|s| s.to_string()).collect();
        let row: (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO team_members \
             (workspace_id, team_id, name, role, email, joined, tz, mood_trend, status, tags, hue) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::member_status,$10,$11) RETURNING id",
        )
        .bind(ws_id).bind(team_id)
        .bind(m.0).bind(m.1).bind(m.2).bind(m.3).bind(m.4)
        .bind(&trend).bind(m.6).bind(&tags).bind(m.8)
        .fetch_one(&mut *tx)
        .await?;
        if m.0 == "Анна Лебедева" {
            anna_id = Some(row.0);
        }
    }

    // Anna's meeting history (ported from data.js annaHistory).
    // (year, month, day, state, duration, mood, mood_score, blockers, goals, feedback_to, feedback_from, development[], relationships)
    if let Some(aid) = anna_id {
        type Mtg = (i32, u32, u32, &'static str, i32, Option<&'static str>, Option<i32>, &'static str, &'static str, &'static str, &'static str, &'static [&'static str], &'static str);
        let history: [Mtg; 6] = [
            (2026,5,11,"done",45,Some("🙂"),Some(8),
             "Долгое ревью PR от соседней команды по платежному модулю — стопает релиз. Договорились эскалировать к Игорю.",
             "Закрыть до конца квартала миграцию старого админ-кабинета на новый дизайн-кит. Подготовить ADR по shared-state библиотеке.",
             "Отличная работа на демо в пятницу — клиенты отметили скорость интерфейса. Продолжай.",
             "Хотелось бы больше времени на R&D в спринте, хотя бы один день в две недели.",
             &["Курс по архитектуре React-приложений (Frontend Masters)","Доклад на внутренний митап про микрофронтенды"],
             "С командой всё ровно, с Тимуром выстроила менторский ритм."),
            (2026,4,27,"done",50,Some("😐"),Some(6),
             "Спорный технический выбор по новому фичефлаг-сервису. Не хватает alignment c платформенной командой.",
             "Согласовать архитектуру нового админ-кабинета. Сделать onboarding гайд для Тимура.",
             "Ты сильно вытянула собес на прошлой неделе — кандидат принял оффер.",
             "Хочу прозрачности по бюджету на конференции в Q3.",
             &["Системный дизайн: книга \"Designing Data-Intensive Applications\""],
             "С продактами иногда долго согласовываются изменения скоупа."),
            (2026,4,13,"done",40,Some("🙂"),Some(8),
             "Ничего критичного. Ожидаем доступы в стейджинг от безопасности.",
             "Подготовка к Q2 планированию. Сформулировать критерии успеха для редизайна.",
             "Хорошо отыграла роль на план-сессии — задала тон команде.",
             "Думаю над сменой грейда — хотелось бы понять трек на ближайшие 6 мес.",
             &["Внутренний leadership-трек"], ""),
            (2026,3,30,"done",35,Some("😄"),Some(9),
             "Нет блокеров.","Релиз новой страницы аналитики до конца месяца.",
             "Спасибо за помощь с релизом — без тебя бы не выкатили.",
             "Всё ок. Хочется больше технических вызовов.", &[],
             "С командой отлично, с дизайнером Дмитрием выстроилась хорошая синергия."),
            (2026,5,25,"planned",45,None,None,"","","","",&[],""),
            (2026,3,16,"miss",30,None,None,"","","","",&[],""),
        ];
        for h in history.iter() {
            let date = chrono::Utc
                .with_ymd_and_hms(h.0, h.1, h.2, 12, 0, 0)
                .single()
                .expect("valid date");
            let dev: Vec<String> = h.11.iter().map(|s| s.to_string()).collect();
            sqlx::query(
                "INSERT INTO meetings \
                 (workspace_id, member_id, date, state, duration_min, mood, mood_score, \
                  blockers, goals, feedback_to, feedback_from, development, relationships) \
                 VALUES ($1,$2,$3,$4::meeting_state,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            )
            .bind(ws_id).bind(aid).bind(date).bind(h.3).bind(h.4)
            .bind(h.5).bind(h.6)
            .bind(opt(h.7)).bind(opt(h.8)).bind(opt(h.9)).bind(opt(h.10))
            .bind(&dev).bind(opt(h.12))
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(())
}

fn opt(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
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
        assert_eq!(meetings.0, 6);

        let fields: (i64,) = sqlx::query_as("SELECT count(*) FROM field_defs")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(fields.0, 6);
    }
}
