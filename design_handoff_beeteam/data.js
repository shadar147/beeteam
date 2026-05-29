// BeeTeam — sample data for the prototype
// Lead's perspective: команда из 8 человек, история 1-2-1 встреч

window.BT_DATA = (function() {
  const today = new Date(2026, 4, 18); // 18 мая 2026
  const d = (y, m, day) => new Date(y, m - 1, day);

  const team = [
    {
      id: 't1', name: 'Анна Лебедева', role: 'Senior Frontend',
      hue: 28, joined: '14 янв 2023',
      lastMeet: d(2026, 5, 11), nextMeet: d(2026, 5, 25),
      moodTrend: [7, 8, 8, 7, 9, 9, 8], status: 'ok', tags: ['Mentor'],
      email: 'a.lebedeva@beeteam.io', tz: 'Europe/Moscow'
    },
    {
      id: 't2', name: 'Игорь Петров', role: 'Backend Engineer',
      hue: 200, joined: '02 мар 2022',
      lastMeet: d(2026, 5, 14), nextMeet: d(2026, 5, 28),
      moodTrend: [6, 6, 7, 7, 7, 6, 7], status: 'ok', tags: [],
      email: 'i.petrov@beeteam.io', tz: 'Europe/Moscow'
    },
    {
      id: 't3', name: 'Мария Соколова', role: 'QA Lead',
      hue: 320, joined: '08 авг 2021',
      lastMeet: d(2026, 4, 24), nextMeet: d(2026, 5, 22),
      moodTrend: [8, 8, 9, 7, 6, 7, 7], status: 'warn', tags: ['Promotion'],
      email: 'm.sokolova@beeteam.io', tz: 'Europe/Moscow'
    },
    {
      id: 't4', name: 'Дмитрий Кузнецов', role: 'Product Designer',
      hue: 145, joined: '18 окт 2023',
      lastMeet: d(2026, 5, 12), nextMeet: d(2026, 5, 26),
      moodTrend: [7, 7, 8, 9, 9, 8, 9], status: 'ok', tags: [],
      email: 'd.kuznecov@beeteam.io', tz: 'Europe/Berlin'
    },
    {
      id: 't5', name: 'Елена Воронцова', role: 'Project Manager',
      hue: 12, joined: '04 фев 2020',
      lastMeet: d(2026, 5, 6), nextMeet: d(2026, 5, 20),
      moodTrend: [9, 9, 8, 8, 9, 9, 9], status: 'ok', tags: ['Lead Track'],
      email: 'e.voroncova@beeteam.io', tz: 'Europe/Moscow'
    },
    {
      id: 't6', name: 'Тимур Хасанов', role: 'Junior Frontend',
      hue: 260, joined: '12 янв 2026',
      lastMeet: d(2026, 4, 30), nextMeet: d(2026, 5, 21),
      moodTrend: [5, 6, 5, 6, 7, 6, 7], status: 'warn', tags: ['Onboarding'],
      email: 't.hasanov@beeteam.io', tz: 'Europe/Moscow'
    },
    {
      id: 't7', name: 'Светлана Морозова', role: 'DevOps Engineer',
      hue: 175, joined: '21 май 2022',
      lastMeet: d(2026, 3, 30), nextMeet: d(2026, 5, 19),
      moodTrend: [7, 6, 5, 5, 4, 5, 4], status: 'miss', tags: ['Burnout risk'],
      email: 's.morozova@beeteam.io', tz: 'Asia/Tbilisi'
    },
    {
      id: 't8', name: 'Алексей Романов', role: 'Backend Engineer',
      hue: 90, joined: '07 ноя 2024',
      lastMeet: d(2026, 5, 13), nextMeet: d(2026, 5, 27),
      moodTrend: [6, 7, 7, 8, 8, 8, 8], status: 'ok', tags: [],
      email: 'a.romanov@beeteam.io', tz: 'Europe/Moscow'
    },
  ];

  // история встреч с Анной Лебедевой (t1)
  const annaHistory = [
    {
      id: 'm-a1', date: d(2026, 5, 11), state: 'done', durationMin: 45,
      title: '1-2-1 c Анной',
      mood: '🙂', moodScore: 8,
      blockers: 'Долгое ревью PR от соседней команды по платежному модулю — стопает релиз. Договорились эскалировать к Игорю.',
      goals: 'Закрыть до конца квартала миграцию старого админ-кабинета на новый дизайн-кит. Подготовить ADR по shared-state библиотеке.',
      feedbackTo: 'Отличная работа на демо в пятницу — клиенты отметили скорость интерфейса. Продолжай.',
      feedbackFrom: 'Хотелось бы больше времени на R&D в спринте, хотя бы один день в две недели.',
      development: ['Курс по архитектуре React-приложений (Frontend Masters)', 'Доклад на внутренний митап про микрофронтенды'],
      relationships: 'С командой всё ровно, с Тимуром выстроила менторский ритм.'
    },
    {
      id: 'm-a2', date: d(2026, 4, 27), state: 'done', durationMin: 50,
      title: '1-2-1 c Анной',
      mood: '😐', moodScore: 6,
      blockers: 'Спорный технический выбор по новому фичефлаг-сервису. Не хватает alignment c платформенной командой.',
      goals: 'Согласовать архитектуру нового админ-кабинета. Сделать onboarding гайд для Тимура.',
      feedbackTo: 'Ты сильно вытянула собес на прошлой неделе — кандидат принял оффер.',
      feedbackFrom: 'Хочу прозрачности по бюджету на конференции в Q3.',
      development: ['Системный дизайн: книга "Designing Data-Intensive Applications"'],
      relationships: 'С продактами иногда долго согласовываются изменения скоупа.'
    },
    {
      id: 'm-a3', date: d(2026, 4, 13), state: 'done', durationMin: 40,
      title: '1-2-1 c Анной',
      mood: '🙂', moodScore: 8,
      blockers: 'Ничего критичного. Ожидаем доступы в стейджинг от безопасности.',
      goals: 'Подготовка к Q2 планированию. Сформулировать критерии успеха для редизайна.',
      feedbackTo: 'Хорошо отыграла роль на план-сессии — задала тон команде.',
      feedbackFrom: 'Думаю над сменой грейда — хотелось бы понять трек на ближайшие 6 мес.',
      development: ['Внутренний leadership-трек'],
      relationships: ''
    },
    {
      id: 'm-a4', date: d(2026, 3, 30), state: 'done', durationMin: 35,
      title: '1-2-1 c Анной',
      mood: '😄', moodScore: 9,
      blockers: 'Нет блокеров.',
      goals: 'Релиз новой страницы аналитики до конца месяца.',
      feedbackTo: 'Спасибо за помощь с релизом — без тебя бы не выкатили.',
      feedbackFrom: 'Всё ок. Хочется больше технических вызовов.',
      development: [],
      relationships: 'С командой отлично, с дизайнером Дмитрием выстроилась хорошая синергия.'
    },
    {
      id: 'm-a5', date: d(2026, 5, 25), state: 'planned', durationMin: 45, title: '1-2-1 c Анной'
    },
    {
      id: 'm-a6', date: d(2026, 3, 16), state: 'miss', durationMin: 30, title: '1-2-1 c Анной (перенесена)'
    },
  ];

  return { today, team, annaHistory };
})();
