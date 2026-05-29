// BeeTeam — система грейдов по ДИСЦИПЛИНАМ (направлениям)
// Каждая дисциплина (Backend / Frontend / Mobile / QA / DevOps) — свой основной трек
// со своей матрицей компетенций и своими доп-треками. Сотрудник крепится к дисциплине.
// Валюта абстрактная: вилки — позиция в полосе, без точных окладов.

window.BT_GRADES = (function () {
  const d = (y, m, day) => new Date(y, m - 1, day);

  // ── Уровни IC1–IC7 (общие коды для всех дисциплин) ──
  const levels = [
    { code: 'IC1', name: 'Trainee',  exp: '0–6 мес',     autonomy: 'Работает под плотным менторством',            scope: 'Учебные задачи, pet-проекты',       mgr: false },
    { code: 'IC2', name: 'Junior',   exp: '6 мес–1.5 г', autonomy: 'Делает задачи по чёткому ТЗ с ревью',         scope: 'Отдельные тикеты',                  mgr: false },
    { code: 'IC3', name: 'Middle',   exp: '1.5–3 года',  autonomy: 'Самостоятельно решает типовые задачи',        scope: 'Фича целиком',                      mgr: false },
    { code: 'IC4', name: 'Middle+',  exp: '3–5 лет',     autonomy: 'Автономен в рамках сервиса',                  scope: 'Несколько связанных фич, модуль',   mgr: false },
    { code: 'IC5', name: 'Senior',   exp: '5+ лет',      autonomy: 'Принимает архитектурные решения в своей зоне', scope: 'Сервис или подсистема',            mgr: true },
    { code: 'IC6', name: 'Staff / Tech Lead', exp: '7+ лет', autonomy: 'Определяет технические стандарты команды', scope: 'Несколько сервисов, кросс-команды', mgr: true },
    { code: 'IC7', name: 'Principal', exp: '10+ лет',    autonomy: 'Задаёт технологическое направление',          scope: 'Весь домен, архитектура компании',  mgr: true },
  ];

  const bands = {
    IC1: { low: 0.78, mid: 1.0, high: 1.25 }, IC2: { low: 0.73, mid: 1.0, high: 1.27 },
    IC3: { low: 0.78, mid: 1.0, high: 1.22 }, IC4: { low: 0.85, mid: 1.0, high: 1.15 },
    IC5: { low: 0.86, mid: 1.0, high: 1.14 }, IC6: { low: 0.85, mid: 1.0, high: 1.15 },
    IC7: { low: 0.87, mid: 1.0, high: 1.13 },
  };

  // Постоянные id блоков — у каждой дисциплины свои названия и текст
  const BLOCK_IDS = ['stack', 'core', 'arch', 'infra', 'ai', 'impact'];

  // ── Общие блоки AI и Влияние (одинаковы для всех дисциплин) ──
  const aiCells = [
    'Использует AI-ассистента для объяснения кода и поиска ошибок.',
    'Применяет AI в ежедневной работе. Критически проверяет результат.',
    'Prompt engineering с контекстом и ролью. Выстроенный AI-workflow.',
    'Project instructions, multi-step workflows. Промпты с примерами и constraints.',
    'Настраивает AI-workflow для команды: shared prompts, MCP, CLI.',
    'AI-стратегия команды: delegation, security, multi-agent подходы.',
    'Определяет AI-стратегию компании, governance и стандарты.',
  ];
  const impactCells = [
    'Учится у команды, задаёт вопросы. Влияние в пределах своих задач.',
    'Помогает на стендапах, аккуратно ведёт тикеты.',
    'Помогает джунам, участвует в обсуждениях. Влияет на свою фичу.',
    'Менторит 1–2 человек, выступает на внутренних обсуждениях.',
    'Менторская программа, доклады. Влияет на несколько команд и найм.',
    'Определяет инженерную культуру, развивает лидов.',
    'Формирует tech-бренд компании, влияет на стратегию найма.',
  ];

  // ───────────────────────── ДИСЦИПЛИНЫ ─────────────────────────
  const disciplines = {
    // ════ BACKEND ════
    backend: {
      id: 'backend', label: 'Backend', icon: 'fields',
      desc: 'Серверная разработка, API, данные, нагрузка.',
      blockNames: { stack: 'Серверный стек', core: 'Базы данных и хранилища', arch: 'Архитектура и системный дизайн', infra: 'Инфраструктура и DevOps', ai: 'AI-инструменты', impact: 'Командное влияние' },
      matrix: {
        stack: [
          'Знает синтаксис языка, ООП, MVC. Пишет простой CRUD под руководством.',
          'Уверенно пишет на проде. ORM, миграции, валидация, очереди. Покрывает тестами.',
          'Самостоятельно проектирует REST API. Service container, events, middleware. Рефакторит legacy.',
          'Оптимизирует performance (N+1, кеш-слой). Сложные запросы и query builders. Профилирование.',
          'Архитектурные паттерны (DDD, hexagonal, CQRS). Проектирует сложные доменные модели.',
          'Определяет стандарты кодирования команды. Сложные code review. Пишет RFC.',
          'Задаёт технологическую стратегию платформы. Решения уровня всего домена.',
        ],
        core: [
          'Базовый SQL (SELECT/JOIN). Понимает, что такое таблица и индекс.',
          'Пишет рабочие запросы, делает миграции. Транзакции, базовые constraints.',
          'Проектирует схемы БД. Осознанно использует индексы и кеш.',
          'Оптимизирует через EXPLAIN. Партиционирование, шардирование. Очереди.',
          'Схемы для high-load. Выбор СУБД. Репликация.',
          'Стратегия data layer: consistency, миграции без downtime, governance.',
          'Дата-стратегия бизнеса: data lake, compliance, долгосрочная архитектура.',
        ],
        arch: [
          'Не требуется.',
          'Понимает REST, HTTP-методы, статус-коды, клиент-серверную модель.',
          'Проектирует API для своей фичи. SOLID, базовые паттерны.',
          'Декомпозирует фичу на сервисы. Trade-offs. Distributed tracing.',
          'Системы из нескольких сервисов. Event-driven, CQRS, Saga, API Gateway.',
          'Архитектор на уровне продукта: распределённые системы под бизнес.',
          'Стратегия архитектуры всей компании, участие в C-level решениях.',
        ],
        infra: [
          'Базовые Linux-команды. Запуск через docker-compose.',
          'Docker на уровне пользователя. Переменные окружения, .env.',
          'Пишет Dockerfile. Понимает CI/CD. Базовый мониторинг.',
          'CI под свой сервис. Ansible-плейбуки. Blue-green deploy.',
          'Infrastructure as Code. Canary deploy. On-call, алертинг.',
          'DevOps-культура команды: observability, SLO/SLI, incident management.',
          'Инфраструктурная стратегия компании, выбор облака, cost.',
        ],
        ai: aiCells, impact: impactCells,
      },
      addons: {
        go: { id: 'go', label: 'Go', levelNames: ['Go-L1 Начальный', 'Go-L2 Базовый', 'Go-L3 Продвинутый', 'Go-L4 Экспертный', 'Go-L5 Архитектор'],
          note: 'Go в микросервисной части. Доп-трек к Backend — можно быть Senior без Go. Надбавка Go-L2+.',
          blocks: [
            { id: 'lang', name: 'Язык Go', cells: ['Читает Go-код, знает синтаксис.', 'Пишет сервисы: goroutines, channels, context.', 'Идиоматичный Go, concurrency-паттерны, pprof.', 'sync.Pool, generics, сложные рефакторинги.', 'Определяет Go-стандарты компании.'] },
            { id: 'eco', name: 'Экосистема', cells: ['go mod, запуск проекта.', 'Стандартная библиотека, роутеры, gRPC базово.', 'net/http vs фреймворк, gRPC с proto.', 'Shared-библиотеки, миграции версий.', 'Список одобренных библиотек и паттернов.'] },
          ] },
        rust: { id: 'rust', label: 'Rust', levelNames: ['Rust-L1 Начальный', 'Rust-L2 Базовый', 'Rust-L3 Продвинутый', 'Rust-L4 Экспертный', 'Rust-L5 Архитектор'],
          note: 'Rust для performance-critical модулей. Редкий стек, надбавка выше Go.',
          blocks: [
            { id: 'lang', name: 'Язык Rust', cells: ['Читает код, понимает ownership базово.', 'Result/Option, pattern matching, lifetimes.', 'Traits, generics, async/await (tokio).', 'unsafe где оправдано, макросы, FFI.', 'Определяет Rust-стандарты, где он оправдан.'] },
            { id: 'eco', name: 'Экосистема', cells: ['cargo, сборка проекта.', 'serde, tokio, простые CLI.', 'Библиотеки, feature flags, workspace.', 'Контрибутит в крейты, профилирование.', 'Набор одобренных крейтов, менторство.'] },
          ] },
      },
    },

    // ════ FRONTEND ════
    frontend: {
      id: 'frontend', label: 'Frontend', icon: 'layers',
      desc: 'Клиентская разработка, UI, производительность интерфейса.',
      blockNames: { stack: 'JS/TS и фреймворк', core: 'UI, вёрстка, стили', arch: 'Архитектура фронта', infra: 'Сборка и CI', ai: 'AI-инструменты', impact: 'Командное влияние' },
      matrix: {
        stack: [
          'Знает JS-синтаксис, DOM, события. Пишет простые компоненты по образцу.',
          'Уверенно работает с фреймворком (React/Vue): state, props, хуки. Пишет тесты по образцу.',
          'Самостоятельно делает фичу: роутинг, формы, работа с API, состояние.',
          'TypeScript на уровне дженериков. Оптимизация ре-рендеров, мемоизация, code-splitting.',
          'Проектирует слой данных (RTK/React Query). Сложные паттерны состояния. SSR/SSG.',
          'Определяет фронт-стандарты команды: линтеры, code style, дизайн-токены.',
          'Задаёт фронтенд-направление компании, выбор технологий на годы.',
        ],
        core: [
          'Базовая вёрстка HTML/CSS, flex. Адаптив по образцу.',
          'Семантика, grid, адаптив, базовая анимация. Понимает box model.',
          'Сложные layout. Доступность (a11y) базово. Анимации и переходы.',
          'Дизайн-система на практике. WCAG/a11y осознанно. Кросс-браузерность.',
          'Проектирует UI-kit и компонентную библиотеку. Перф рендера, CLS/LCP.',
          'Стандарты UI и a11y на уровне компании. Аудит и метрики качества интерфейса.',
          'Видение UI-платформы организации.',
        ],
        arch: [
          'Не требуется.',
          'Понимает компонентную модель, поток данных сверху вниз.',
          'Структурирует фичу на компоненты. Понимает разделение слоёв.',
          'Декомпозиция на модули, lazy-загрузка, контракты с API.',
          'Микрофронтенды, module federation, design-system архитектура.',
          'Архитектор фронт-платформы: монорепо, shared-пакеты, контракты.',
          'Стратегия фронт-архитектуры всей компании.',
        ],
        infra: [
          'Запускает проект, npm-скрипты.',
          'Понимает сборщик (Vite/Webpack), .env, dev/prod build.',
          'Настраивает сборку, базовый CI (lint, test, build).',
          'Оптимизация бандла, tree-shaking, CI-пайплайн фичи.',
          'E2E в CI, preview-деплои, Lighthouse-бюджеты.',
          'Определяет фронт-CI и метрики перфа на уровне команды.',
          'Инфраструктура доставки фронта в организации.',
        ],
        ai: aiCells, impact: impactCells,
      },
      addons: {}, // у фронта пока без доп-треков
    },

    // ════ MOBILE ════
    mobile: {
      id: 'mobile', label: 'Mobile', icon: 'spark',
      desc: 'Мобильная разработка iOS/Android, релизы в сторы.',
      blockNames: { stack: 'Платформа (язык/SDK)', core: 'UI и навигация', arch: 'Архитектура приложения', infra: 'Релизы и сборка', ai: 'AI-инструменты', impact: 'Командное влияние' },
      matrix: {
        stack: [
          'Знает базовый синтаксис платформы, lifecycle экрана.',
          'Пишет экраны, работает с сетью и хранением по образцу.',
          'Самостоятельная фича: работа с API, кеш, локальная БД.',
          'Многопоточность, корутины/async, оптимизация памяти и батареи.',
          'Глубокое знание платформы: профилирование, нативные модули.',
          'Определяет мобильные стандарты команды.',
          'Технологическое направление мобайла в компании.',
        ],
        core: [
          'Простые экраны по макету.',
          'Списки, формы, базовая навигация.',
          'Сложная навигация, состояния экранов, анимации.',
          'Дизайн-система, адаптив под устройства, accessibility.',
          'UI-kit, кастомные компоненты, перф скролла и анимаций.',
          'Стандарты UI и a11y на уровне продукта.',
          'Видение мобильного UI-фреймворка организации.',
        ],
        arch: [
          'Не требуется.',
          'Понимает разделение UI и логики.',
          'MVVM/MVI на практике, DI базово.',
          'Модульность, чистая архитектура, контракты с API.',
          'Многомодульное приложение, feature-флаги, offline-first.',
          'Архитектор мобильной платформы: shared-код, KMP.',
          'Стратегия мобильной архитектуры компании.',
        ],
        infra: [
          'Собирает debug-сборку локально.',
          'Понимает подпись, build variants, .env.',
          'Настраивает CI-сборку, базовые тесты.',
          'Fastlane, автосборки, beta-дистрибуция (TestFlight/Firebase).',
          'Release-пайплайн, поэтапная раскатка, crash-мониторинг.',
          'Определяет релизный процесс команды.',
          'Инфраструктура доставки мобильных приложений в организации.',
        ],
        ai: aiCells, impact: impactCells,
      },
      addons: {
        ios: { id: 'ios', label: 'iOS', levelNames: ['iOS-L1', 'iOS-L2', 'iOS-L3', 'iOS-L4', 'iOS-L5'],
          note: 'Углублённый iOS-трек: Swift, SwiftUI, экосистема Apple. Надбавка iOS-L2+.',
          blocks: [
            { id: 'swift', name: 'Swift / SwiftUI', cells: ['Базовый Swift, UIKit по образцу.', 'SwiftUI-экраны, Combine базово.', 'Сложный SwiftUI, async/await, concurrency.', 'Перф, нативные оптимизации, инструменты.', 'Определяет iOS-стандарты.'] },
            { id: 'eco', name: 'Экосистема Apple', cells: ['Xcode, запуск на симуляторе.', 'Push, deep links, App Store базово.', 'WidgetKit, App Clips, фоновые задачи.', 'CI на macOS, сложная подпись.', 'Стратегия iOS-фич в компании.'] },
          ] },
        android: { id: 'android', label: 'Android', levelNames: ['Andr-L1', 'Andr-L2', 'Andr-L3', 'Andr-L4', 'Andr-L5'],
          note: 'Углублённый Android-трек: Kotlin, Compose, экосистема Google. Надбавка Andr-L2+.',
          blocks: [
            { id: 'kotlin', name: 'Kotlin / Compose', cells: ['Базовый Kotlin, View по образцу.', 'Compose-экраны, корутины базово.', 'Сложный Compose, Flow, навигация.', 'Перф, R8, нативные оптимизации.', 'Определяет Android-стандарты.'] },
            { id: 'eco', name: 'Экосистема Google', cells: ['Android Studio, запуск на эмуляторе.', 'Push, deep links, Play Console базово.', 'WorkManager, виджеты, фоновые задачи.', 'CI-сборки, App Bundle, подпись.', 'Стратегия Android-фич в компании.'] },
          ] },
      },
    },

    // ════ QA ════
    qa: {
      id: 'qa', label: 'QA', icon: 'check',
      desc: 'Обеспечение качества, тест-дизайн, автоматизация.',
      blockNames: { stack: 'Автоматизация тестов', core: 'Тест-дизайн', arch: 'Стратегия качества', infra: 'Окружения и CI', ai: 'AI-инструменты', impact: 'Командное влияние' },
      matrix: {
        stack: [
          'Запускает готовые автотесты, читает отчёты.',
          'Пишет простые UI/API-автотесты по образцу.',
          'Самостоятельно автоматизирует сценарии, page objects.',
          'Стабильные автотесты, борьба с flaky, параллельный прогон.',
          'Проектирует фреймворк автоматизации, переиспользуемые слои.',
          'Определяет стандарты автоматизации команды.',
          'Стратегия автоматизации качества компании.',
        ],
        core: [
          'Выполняет тест-кейсы по чек-листу.',
          'Пишет тест-кейсы, репортит баги с шагами.',
          'Тест-дизайн: классы эквивалентности, граничные значения.',
          'Риск-ориентированное тестирование, тест-аналитика требований.',
          'Стратегия тестирования продукта, метрики покрытия.',
          'Определяет процессы QA в команде.',
          'Видение качества на уровне организации.',
        ],
        arch: [
          'Не требуется.',
          'Понимает пирамиду тестирования.',
          'Различает unit/integration/e2e, где что применять.',
          'Проектирует тест-стратегию для фичи, contract-тесты.',
          'Shift-left, quality gates, тест-окружения как код.',
          'Архитектор процессов качества: метрики, SLA багов.',
          'Стратегия качества всей компании.',
        ],
        infra: [
          'Запускает тесты в готовом окружении.',
          'Понимает тест-данные, стенды, .env.',
          'Настраивает прогон тестов в CI.',
          'Управляет тест-окружениями, моками, тест-данными.',
          'Параллельные прогоны, отчётность, флаки-дашборды в CI.',
          'Определяет CI/CD-гейты качества команды.',
          'Инфраструктура качества в организации.',
        ],
        ai: aiCells, impact: impactCells,
      },
      addons: {
        auto: { id: 'auto', label: 'Performance / Load', levelNames: ['Perf-L1', 'Perf-L2', 'Perf-L3', 'Perf-L4', 'Perf-L5'],
          note: 'Нагрузочное и performance-тестирование. Доп-трек к QA. Надбавка Perf-L2+.',
          blocks: [
            { id: 'load', name: 'Нагрузочное тестирование', cells: ['Запускает готовые сценарии (k6/JMeter).', 'Пишет простые нагрузочные скрипты.', 'Профили нагрузки, анализ метрик.', 'Capacity planning, поиск узких мест.', 'Стратегия perf-тестирования компании.'] },
          ] },
      },
    },

    // ════ DEVOPS ════
    devops: {
      id: 'devops', label: 'DevOps', icon: 'settings',
      desc: 'Инфраструктура, надёжность, CI/CD, observability.',
      blockNames: { stack: 'IaC и оркестрация', core: 'Сети, хранилища, БД', arch: 'Архитектура надёжности', infra: 'CI/CD пайплайны', ai: 'AI-инструменты', impact: 'Командное влияние' },
      matrix: {
        stack: [
          'Базовые Linux-команды, docker-compose.',
          'Пишет Dockerfile, понимает реестры образов.',
          'Kubernetes базово: деплои, сервисы. Helm по образцу.',
          'Terraform/Ansible, модули IaC, secrets-менеджмент.',
          'Проектирует кластеры, автоскейлинг, multi-env IaC.',
          'Определяет IaC-стандарты компании, GitOps.',
          'Инфраструктурная стратегия организации.',
        ],
        core: [
          'Понимает порты, DNS, HTTP базово.',
          'Сети контейнеров, volume, базовое хранилище.',
          'Балансировка, TLS, бэкапы. Реплики БД.',
          'VPC/подсети, service mesh базово, отказоустойчивые хранилища.',
          'Проектирует сеть и хранение для high-load, DR-планы.',
          'Стратегия сети и данных на уровне компании.',
          'Долгосрочная инфраструктура хранения и связности.',
        ],
        arch: [
          'Не требуется.',
          'Понимает, что такое доступность и мониторинг.',
          'Алертинг, дашборды, базовые health-checks.',
          'SLO/SLI, error budget, graceful degradation.',
          'Проектирует отказоустойчивость, multi-AZ, chaos-тесты.',
          'Архитектор надёжности: incident management, postmortems.',
          'Стратегия надёжности всей компании.',
        ],
        infra: [
          'Запускает готовый пайплайн.',
          'Правит CI-конфиг по образцу.',
          'Строит пайплайн сборки и деплоя сервиса.',
          'Blue-green/canary, автоматические откаты.',
          'Многоступенчатые пайплайны, прогрессивная доставка.',
          'Определяет CI/CD-платформу команды.',
          'Стратегия доставки в организации.',
        ],
        ai: aiCells, impact: impactCells,
      },
      addons: {},
    },
  };

  // ── Грейд-данные по сотрудникам (привязаны к дисциплине) ──
  const members = {
    t1: { discipline: 'frontend', grade: 5, target: 6, compa: 0.62, nextReview: d(2026, 6, 30), lastReview: d(2025, 12, 15),
      blockLevels: { stack: 6, core: 5, arch: 5, infra: 4, ai: 6, impact: 5 }, addons: {}, readyMonths: 4 },
    t2: { discipline: 'backend', grade: 4, target: 5, compa: 0.48, nextReview: d(2026, 7, 12), lastReview: d(2025, 11, 20),
      blockLevels: { stack: 4, core: 5, arch: 4, infra: 4, ai: 3, impact: 3 }, addons: { go: 3, rust: 1 }, readyMonths: 2 },
    t3: { discipline: 'qa', grade: 5, target: 5, compa: 0.55, nextReview: d(2026, 6, 22), lastReview: d(2025, 12, 1),
      blockLevels: { stack: 5, core: 6, arch: 5, infra: 4, ai: 4, impact: 6 }, addons: { auto: 3 }, readyMonths: 1 },
    t6: { discipline: 'frontend', grade: 2, target: 3, compa: 0.35, nextReview: d(2026, 6, 21), lastReview: null,
      blockLevels: { stack: 3, core: 3, arch: 2, infra: 2, ai: 3, impact: 2 }, addons: {}, readyMonths: 2 },
    t7: { discipline: 'devops', grade: 4, target: 4, compa: 0.52, nextReview: d(2026, 7, 5), lastReview: d(2025, 11, 30),
      blockLevels: { stack: 5, core: 4, arch: 4, infra: 6, ai: 4, impact: 4 }, addons: {}, readyMonths: 0 },
    t8: { discipline: 'backend', grade: 3, target: 4, compa: 0.58, nextReview: d(2026, 7, 27), lastReview: d(2026, 1, 20),
      blockLevels: { stack: 4, core: 3, arch: 3, infra: 3, ai: 4, impact: 3 }, addons: { go: 1 }, readyMonths: 3 },
    // t4 (дизайнер) и t5 (PM) — другая карьерная лестница, грейд не назначен
  };

  // ── Свидетельства компетенций (из 1-2-1) — для Анны (t1, frontend) ──
  const evidence = {
    t1: [
      { id: 'ev1', date: d(2026, 5, 11), block: 'arch', level: 6, status: 'demonstrated', meetingId: 'm-a1',
        note: 'Спроектировала миграцию админ-кабинета на новый дизайн-кит — декомпозиция на изолированные модули, ADR по shared-state.' },
      { id: 'ev2', date: d(2026, 5, 11), block: 'impact', level: 5, status: 'demonstrated', meetingId: 'm-a1',
        note: 'Менторский ритм с Тимуром — 4/4 ревью за месяц.' },
      { id: 'ev3', date: d(2026, 4, 27), block: 'arch', level: 6, status: 'partial', meetingId: 'm-a2',
        note: 'Начала проектировать модульную систему фичефлагов, но не хватило alignment с платформой — частично.' },
      { id: 'ev4', date: d(2026, 4, 27), block: 'impact', level: 5, status: 'demonstrated', meetingId: 'm-a2',
        note: 'Сильно вытянула собеседование — кандидат принял оффер.' },
      { id: 'ev5', date: d(2026, 4, 13), block: 'stack', level: 6, status: 'demonstrated', meetingId: 'm-a3',
        note: 'Задала критерии успеха для редизайна, выступила на план-сессии как tech-owner.' },
      { id: 'ev6', date: d(2026, 3, 30), block: 'ai', level: 6, status: 'demonstrated', meetingId: 'm-a4',
        note: 'Настроила shared prompts и MCP-сервер для команды фронтенда.' },
    ],
  };

  const reviews = {
    t1: [
      { id: 'rv-a1', period: 'H2 2025', date: d(2025, 12, 15), fromGrade: 5, toGrade: 5, decision: 'hold',
        state: 'final', summary: 'Уверенный IC5. Зафиксированы первые проявления IC6 в архитектуре. Рекомендация — накапливать свидетельства к следующему ревью.' },
      { id: 'rv-a2', period: 'H1 2025', date: d(2025, 6, 18), fromGrade: 4, toGrade: 5, decision: 'promote',
        state: 'final', summary: 'Повышение до IC5 (Senior). Стабильно проявляла senior-компетенции 6 месяцев: архитектурные решения по сервису, менторство.' },
    ],
  };

  // ── helpers (дисциплино-зависимые) ──
  const discList = Object.values(disciplines).map(x => ({ id: x.id, label: x.label, icon: x.icon, desc: x.desc }));
  const disc = (id) => disciplines[id] || disciplines.backend;
  const discOf = (memberId) => (members[memberId] ? members[memberId].discipline : 'backend');
  const blocksOf = (discId) => (disc(discId).order || BLOCK_IDS).map(id => ({ id, name: disc(discId).blockNames[id] }));
  const matrixOf = (discId) => disc(discId).matrix;
  const addonsOf = (discId) => disc(discId).addons || {};
  const blockName = (discId, blockId) => disc(discId).blockNames[blockId] || blockId;

  return {
    levels, bands, BLOCK_IDS,
    disciplines, discList, disc, discOf, blocksOf, matrixOf, addonsOf, blockName,
    members, evidence, reviews,
  };
})();
