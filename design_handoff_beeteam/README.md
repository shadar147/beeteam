# Handoff: BeeTeam — 1-2-1 трекинг для лидов

## Обзор

**BeeTeam** — продуктовое веб-приложение для лидов, которое помогает регулярно проводить 1-2-1 встречи с командой, фиксировать заметки, отслеживать настроение и развитие сотрудников. Перспектива пользователя — **тимлид** (8 человек в команде), также есть админская часть (HR / Workspace admin).

Основные сценарии:
1. Лид заходит в систему, видит свою команду и кто нуждается во встрече
2. Открывает профиль сотрудника, смотрит историю встреч, заметки, цели, файлы
3. Проводит 1-2-1 через drawer с кастомизируемыми полями (настроение, блокеры, цели, фидбек)
4. Экспортирует историю в Excel для отчётности
5. Админ настраивает шаблоны полей, добавляет команды и сотрудников

---

## ⚠ Про дизайн-файлы

Файлы в этой папке — **дизайн-референсы, реализованные в HTML/CSS/React (через Babel в браузере)**. Это прототип, демонстрирующий внешний вид и поведение, **а не production-код**.

Задача — **воссоздать эти дизайны в целевом окружении проекта** (React/Next.js, Vue/Nuxt, SwiftUI и т.п.), используя его существующие паттерны, библиотеки и систему компонентов. Если стэк ещё не выбран — рекомендуется **Next.js 14+ (App Router) + TypeScript + Tailwind CSS + Radix UI** (или shadcn/ui) как самый близкий к структуре прототипа.

**HTML файлы запускать как шаблон нельзя** — они нужны только для понимания визуала, разметки и интеракций.

## Уровень детализации

**High-fidelity (hi-fi)**. Финальные цвета, типографика, отступы, состояния и интеракции. Девелопер должен воспроизвести интерфейс пиксель-в-пиксель, используя библиотеки и паттерны кодовой базы.

---

## Стэк прототипа (для справки)

- **React 18** (через UMD + Babel в браузере)
- Чистый CSS с CSS-переменными для темизации (без CSS-in-JS / Tailwind)
- Шрифт — **Geist** (sans) и **Geist Mono** (моноширинный)
- Кастомные SVG-иконки (lucide-style stroke 1.6)
- Без внешних UI-библиотек (всё написано с нуля)

В production это всё легко мапится на shadcn/ui + Tailwind, или Mantine, или MUI — главное сохранить визуальный язык.

---

## Дизайн-токены

### Цвета (light theme)

```css
/* Бренд */
--accent: #F5A524;          /* основной — янтарный пчелиный */
--accent-strong: #D8870A;
--accent-soft: #FEF6E4;
--accent-text: #5C3A00;

/* Нейтральные (тёплая палитра — slight warm beige) */
--bg: #FAFAF7;
--bg-elev: #FFFFFF;
--bg-tint: #F5F4EE;
--bg-sunken: #F1F0EA;

--ink:   #1A1812;   /* основной текст */
--ink-2: #4A4639;   /* вторичный */
--ink-3: #807A68;   /* приглушённый */
--ink-4: #B0AB97;   /* плейсхолдеры */

--line:        #E8E5D9;
--line-2:      #EFECE0;
--line-strong: #D6D2C0;

/* Семантические */
--ok:    #2D8F5C;  --ok-soft:   #E4F2EA;
--warn:  #C77B0A;  --warn-soft: #FDF1DC;
--miss:  #C04A3B;  --miss-soft: #FCE7E2;
--info:  #3D6DCB;  --info-soft: #E5EDFA;
```

### Цвета (dark theme — поддерживается через `[data-theme="dark"]`)

```css
--bg: #14130F;
--bg-elev: #1C1B16;
--bg-tint: #22211B;
--bg-sunken: #100F0B;
--ink: #F1ECDB; --ink-2: #D7D1BC; --ink-3: #8F8973; --ink-4: #5B5644;
--line: #2A2820; --line-2: #23211B; --line-strong: #3A372C;
--accent-soft: #3A2A0A; --accent-text: #FBE6B0;
```

### Типографика

| Назначение           | Шрифт      | Размер | Вес | Letter-spacing |
|----------------------|------------|--------|-----|----------------|
| Page title           | Geist      | 26px   | 700 | -0.025em       |
| Profile name         | Geist      | 22px   | 700 | -0.02em        |
| Section title        | Geist      | 18px   | 700 | -0.02em        |
| Card title           | Geist      | 14.5px | 600 | -0.005em       |
| Body                 | Geist      | 13.5px | 500 | -0.005em       |
| Body small           | Geist      | 12.5px | 500 | 0              |
| Caption              | Geist      | 11.5px | 500 | 0              |
| Uppercase label      | Geist      | 10.5–11px | 600 | 0.06em       |
| Numeric (счётчики, даты, %) | Geist Mono | tabular-nums | 600 | — |

Включены OpenType features `ss01`, `cv11` для Geist.

### Скруления

```
--radius-sm: 8px
--radius:    12px
--radius-lg: 16px
--radius-xl: 24px
```

### Тени

```css
--shadow-1:   0 1px 2px rgba(26,24,18,0.04), 0 1px 0 rgba(26,24,18,0.02);
--shadow-2:   0 1px 2px rgba(26,24,18,0.04), 0 6px 18px -8px rgba(26,24,18,0.10);
--shadow-pop: 0 18px 48px -16px rgba(26,24,18,0.22), 0 4px 12px rgba(26,24,18,0.06);
```

### Spacing

Используется кратность 4px. Базовые отступы: 4/6/8/10/12/14/16/18/20/22/24/28/32/40.

### Density modes

Через `data-density="compact|regular|cozy"` на html. Меняет padding в строках таблицы, feed-айтемах, статах.

---

## Архитектура экранов

```
/login                              ← LoginScreen
/                                   ← TeamList (Моя команда)
/profile/:id                        ← EmployeeProfile с табами:
    /history    ← История 1-2-1 (по умолчанию)
    /goals      ← Цели и развитие
    /fields     ← Поля встреч (per-employee override шаблона)
    /files      ← Файлы
/calendar                           ← CalendarScreen — все встречи команды
/fields                             ← FieldsLibraryScreen — глобальные шаблоны
/export                             ← ExportScreen — выгрузка .xlsx
/admin/teams                        ← AdminTeams
/admin/leads                        ← AdminLeads
/admin/settings                     ← AdminSettings (5 секций)

Глобальные элементы:
- Sidebar (всегда, кроме /login)
- Topbar с крошками и Quick action "Новая 1-2-1"
- MeetingDrawer — slide-in справа при проведении встречи
- AddEmployeeModal — модалка добавления сотрудника
- AddTeamModal — модалка добавления команды
```

---

## Экраны (подробно)

### 1. LoginScreen

**Назначение:** вход в рабочее пространство.

**Layout:** split-screen 1.05fr / 1fr.
- Левая колонка — арт-блок с радиальными градиентами `#F5A524`, декоративной соткой из hexagon-плиток (clip-path), цитатой «1-2-1, которые не теряются» (28px, semibold).
- Правая — форма входа шириной 380px, центрирована.

**Компоненты формы:**
- Поле email (placeholder `name@company.com`)
- Поле пароль с toggle видимости (icon `eye`/`eyeOff`)
- Линк «Забыли пароль?» (accent цветом)
- Чекбокс «Оставаться в системе»
- Кнопка «Войти →» (btn-primary btn-lg, full-width)
- Divider «или»
- Кнопка «Войти через Active Directory» (с Microsoft-tile иконкой 2×2)
- Сноска про доменную учётку

---

### 2. TeamList (Моя команда)

**Назначение:** главный экран лида — обзор команды + быстрые действия.

**Layout:**
1. Page header: «Моя команда» (h1 26px) + sub «8 человек · Платформенный отдел · Q2 2026» + actions справа (Экспорт, Сотрудник, Новая 1-2-1)
2. **Stats row** — 4 карточки в grid: На этой неделе / Просрочены / Среднее настроение / Заметок за квартал
3. **Filter bar:** поиск + сегмент-таб (Все / На неделе / Просрочены / Требуют внимания) + кнопка «Фильтр» справа со счётчиком активных фильтров
4. **Team table** — таблица 6 колонок:
   - Сотрудник (avatar + имя + роль + теги)
   - Последняя 1-2-1 (дата + ago)
   - Следующая встреча (дата + ago)
   - Настроение, тренд (бар-чарт из 7 столбиков + число)
   - Статус (pill: В графике / Внимание / Просрочена)
   - Меню (kebab)
5. Footer-плашка с dashed border: «Добавить сотрудника в команду»

**Состояния:**
- Hover row → background `--bg-tint`
- Pill цвета: ok = green, warn = warm yellow, miss = red
- Mood trend bars: высота 4–18px, opacity растёт слева направо

**FilterPopover** — открывается при клике на «Фильтр»:
- Селект «Роль» (Frontend/Backend/QA/Design/DevOps/PM)
- Сегмент «Стаж» (Все / <1 года / 1–3 / 3+)
- Сегмент «Тренд настроения» (Все / ↑ растёт / → ровно / ↓ падает)
- Чипы «Теги» (Mentor, Promotion, Lead Track, Onboarding, Burnout risk, PIP, Performance)
- Сегмент «Последняя 1-2-1» (Все / <1 нед. / <2 нед. / >4 нед.)
- Действия: «Сбросить» / «Применить»
- Бейдж со счётчиком активных фильтров на кнопке-триггере

---

### 3. EmployeeProfile

**Назначение:** карточка сотрудника — всё, что лид знает о нём.

**Layout:**
1. Breadcrumb «← Моя команда / Анна Лебедева»
2. **Profile header** — карточка с avatar XL (84×84), имя, мета (роль · с когда · email · TZ), статус-пиллы (В графике, 12 встреч за год, Настроение 8/10, теги), actions (Написать, Экспорт, Начать 1-2-1)
3. **Tabs** (seg-control): История 1-2-1 / Цели и развитие / Поля встреч / Файлы

#### Tab: История 1-2-1

Grid 1.45fr / 1fr:

**Левая колонка:**
- Календарь (месячный grid 7×6) с кликабельными днями, на которых были встречи (цветной chip с эмодзи и статусом). Today выделен accent-кругом.
- Карточка с деталями выбранной встречи: статус-pill, дата+длительность, actions (Редактировать), grid 2 колонки — Настроение / Отношения, NoteBlock'и по каждому полю (Блокеры, Цели, Фидбек к/от, Развитие).
- Для запланированной встречи — карточка с CTA «Провести сейчас» / «Перенести» / «Отменить»

**Правая колонка:**
- Feed (лента) с историей всех встреч — компактные элементы (дата-чип 44×44 + заголовок + превью на 2 строки).

#### Tab: Цели и развитие

Grid 1.45fr / 1fr.

**Левая:** карточка «Цели на Q2 2026» — список OKR с прогресс-баром, key result'ом, дедлайном и статусом (В работе / Под риском / Готово). Ниже — карточка «План развития» с цветными dot'ами по статусу (in_progress = accent, planned = outline, done = green).

**Правая:**
- «Карьерный трек» — вертикальный таймлайн с шагами (Middle → Senior [текущий, accent ring] → Lead [next, dashed])
- «Менторство» — карточка с подопечным
- «Компетенции» — 5 прогресс-баров (Технические/Коммуникация/Менторство/Самостоятельность/Influence)

#### Tab: Поля встреч

Per-employee override глобального шаблона.
- Info-banner про логику override
- Селектор шаблона (Базовый / Performance review / Onboarding / Кастомный)
- Список полей с drag-handle (`⋮⋮`), кнопками edit/copy/trash
- «Добавить локальное поле»

#### Tab: Файлы

- Filter bar: сегмент по типу (Все / Документы / Изображения / Видео / PDF / Таблицы) + сегмент-view (Список / Плитки) + кнопка «Скачать .zip»
- Stats-карточка: Всего N файлов / Объём / Последний
- **List view:** строки с иконкой типа (цветной плашкой DOC/IMG/PDF/MP4/XLS), именем, привязкой к встрече, автором, размером, actions
- **Grid view:** квадратные тайлы с цветным thumb по типу
- Drop-zone в футере

---

### 4. CalendarScreen

**Назначение:** все 1-2-1 команды в едином календаре.

**Layout:**
1. Page header + actions (.ics экспорт, Запланировать)
2. **View switcher:** Месяц / Неделя / Список
3. **Navigation:** ← Сегодня → + фильтр по статусу (Все / Запланировано / Проведено / Пропущено)

**Месяц view:** grid 1.7fr / 1fr:
- Большой календарь (квадратные клетки минимум 100×100, до 3 событий в день + «+N ещё»). Event — цветной chip (planned = info, done = ok, miss = miss) с dot + именем сотрудника.
- Sidebar: «Ближайшие встречи» (3 недели вперёд), «Загрузка по неделе» (бар-чарт), «Легенда»

**Неделя view:** time-grid 7 дней × 10 часов (9:00–18:00), события — карточки с avatar sm + именем + временем

**Список view:** плоская лента всех событий с фильтром по статусу

---

### 5. FieldsLibraryScreen

**Назначение:** глобальные шаблоны полей для разных типов встреч.

**Layout:** grid 300px / 1fr.

**Слева** — список пресетов (Базовый, Performance review, Onboarding 90 дней, Скип-уровень, Exit). Системные помечены пилюлей `system`.

**Справа** — карточка выбранного шаблона:
- Заголовок + actions (Дублировать / Назначить командам / Удалить)
- Мета: Применяется к / Версия / Обновлено
- Список полей (1..N), каждое — строка с № + grip + название + type-tag + actions (edit/copy/trash)
- Кнопка «Добавить поле»
- Info-banner «Где используется»

---

### 6. MeetingDrawer

**Назначение:** проведение и редактирование 1-2-1.

**Layout:** slide-in справа, 720px × 92vw, full-height. Scrim с blur.

**Структура:**
1. **Head:** avatar + имя + дата/время + status-pill «Идёт сейчас» + close
2. **Toolbar:** табы (Заполнение / Поля встречи) + counter «N/N полей · автосохранение ●»
3. **Body** (scroll):
   - Tab «Заполнение» — стек `f-block` карточек по каждому полю (Настроение, Блокеры, Цели, Фидбек, Развитие, Отношения, Тип встречи, Дата следующей, Вложения)
   - Tab «Поля встречи» — конструктор: info-banner + список полей с drag/edit/copy/trash + «Добавить поле»
4. **Foot:** «Сохранить как черновик» / «Закрыть» / «Завершить и сохранить»

**Типы полей:**
- `text` / `longtext` — input / textarea
- `scale` — 10 кнопок 1–10
- `mood` — 5 эмодзи (😞 😐 🙂 😄 🤩) + scale 1–10
- `checklist` — кастомные чекбоксы в grid 2col
- `select` — нативный select
- `date` — text input «ДД.ММ.ГГГГ»
- `file` — dashed dropzone

---

### 7. ExportScreen

**Назначение:** выгрузка истории встреч в .xlsx.

**Form layout:** карточка с:
- Sеgmented control «Что выгружаем» (Вся команда / Один сотрудник / Сводный отчёт)
- Период (2 input'а с/по)
- Чек-бокс grid «Колонки в файле» (Настроение / Блокеры / Цели / Фидбек к/от / Развитие / Отношения / Теги)
- Preview tile с именем файла и описанием объёма

---

### 8. Admin: Teams

**Назначение:** управление командами в рабочем пространстве.

**Layout:**
1. Page header + actions (Экспорт, Новая команда)
2. Stats row 4 (Команд / Сотрудников / Без лида / Avg. настроение)
3. Таблица команд: Команда (mono-marker NN + название + +N новых) / Лид / Размер / Настроение / Статус / меню

---

### 9. Admin: Leads

**Назначение:** список тимлидов с метрикой «дисциплина 1-2-1».

**Layout:**
1. Page header + actions (Рассылка, Назначить лида)
2. Таблица: Лид (avatar + имя + роль) / Команда / Дисциплина (прогресс-бар + %) / Последняя активность / Риск (Низкий/Средний/Высокий)
3. Info-banner объясняющий метрику

---

### 10. Admin: Settings

**Назначение:** настройки рабочего пространства.

**Layout:** sidebar 220px / content. Секции:
- **Общие** — название, домен, регулярность 1-2-1 по умолчанию, тогглы (автонапоминания, обязательность настроения, экспорт лидам)
- **Доступ и безопасность** — Active Directory (подключено), SAML SSO, чек-боксы видимости (лид свою команду / HR агрегаты / CTO скип-уровень)
- **Интеграции** — Google Calendar, Slack, Outlook, Jira, Webhooks
- **Данные и приватность** — срок хранения заметок (бессрочно / 3 года / 1 год / 6 мес), опасная зона удаления
- **Тариф** — текущий план (Business), счёт, способ оплаты

**Кастомный Switch toggle:** 40×24, accent-цвет в активном состоянии, мягкий transition.

---

### 11. AddEmployeeModal

**Назначение:** добавить сотрудника в команду.

**Layout:** centered modal 680×95vw, 2 шага (stepper в шапке).

**Шаг 1 — «Сотрудник»:**
- **Способ добавления** — 3 карточки: Пригласить по email / Из AD / Создать вручную
- **Профиль** — большой avatar-preview (84×84, dashed border, live initials из имени) + ФИО + email
- **Должность + Команда** (grid 1.2/1fr)
- **Кто проводит 1-2-1** — **smart field:**
  - По умолчанию readonly-chip `[Avatar] Евгений Глебов | лид команды «Платформа» | Изменить`
  - При клике «Изменить» разворачивается селект + ghost-кнопка «Сбросить»
  - Когда custom — подсказка «Матричный случай: 1-2-1 ведёт ментор, а не лид команды»
- **Дата старта + Часовой пояс**
- **Теги** (чипы Onboarding/Mentor/Promotion/...)

**Шаг 2 — «Настройки 1-2-1»:**
- Радио-список шаблонов полей (Базовый / Onboarding [рекомендовано если тег Onboarding] / Performance review / Создать кастомный)
- Сегмент «Регулярность» (Раз в неделю / 2 недели / месяц) + расчёт даты первой встречи
- Условно (если тег Onboarding) — селект «Назначить ментора»
- Info-banner с динамическим текстом по способу добавления

**Foot:** Отмена / Назад / Далее → / Отправить приглашение

---

### 12. AddTeamModal

**Назначение:** создать новую команду.

**Layout:** centered modal 720×95vw, одностраничная.

**Поля:**
1. **Identity** — большой team-mark preview (84×84, цвет + инициалы) + название + 7-цветная палитра свотчей
2. **Миссия** — textarea
3. **Лид команды** — radio-list карточек с аватарами + вариант «— назначу позже —»
4. **Стартовый состав** — grid 2col multi-select чипов сотрудников (с avatar и checkmark в активном состоянии) + плашка «Пригласить нового»
5. **Шаблон полей + Регулярность** (2 нативных select)
6. **Видимость команды** — 3 карточки (Приватная / Видна HR / Видна организации) + **матрица доступа** ниже:

| Роль                | Факт встречи | Метрики          | Заметки         |
|---------------------|--------------|------------------|-----------------|
| Сотрудник           | ✓            | ✓                | ✓               |
| Лид команды         | ✓            | ✓                | ✓               |
| HR-админ            | (зависит)    | агрегат / ✓      | — / по согласию |
| Skip-уровень (CTO)  | (зависит)    | — / агрегат / ✓  | — / ✓           |

Ячейки матрицы динамически меняются (✓ = green, агрегат = warn, — = muted).

---

## Глобальные UI-компоненты

### Sidebar (232px fixed)
- Логотип BeeTeam с accent-mark (B в янтарном квадрате 26×26 с белым акцентным dot'ом)
- Уведомления (bell icon)
- Секция «Команда»: Моя команда (с count), Календарь (count), Конструктор полей, Экспорт
- Секция «Администрирование»: Команды, Лиды, Настройки
- Внизу — карточка профиля юзера с avatar + имя + роль + logout

### Topbar (60px sticky)
- Крошки
- Справа: Помощь (?), Поиск (🔍), Новая 1-2-1 (primary)
- Фон с backdrop-blur

### Buttons
- `.btn` — height 36, radius 10, border 1px line, bg-elev
- `.btn-primary` — accent bg + dark text (`#1A1100`) + inner highlight
- `.btn-ghost` — transparent
- `.btn-sm` — 30px
- `.btn-lg` — 44px
- `.btn-icon` — square

### Avatars
- Цвет фона генерируется из `hue`: `oklch(0.92 0.05 ${hue})`
- Цвет текста: `oklch(0.30 0.08 ${hue})`
- Размеры: sm 24, md 36, lg 56, xl 84 (xl с радиусом 24px)
- Инициалы — первые буквы первых двух слов

### Pills
- height 22, radius 999, border 1px
- Варианты: default / ok / warn / miss / info / accent

### Inputs
- height 40, radius 10, border 1px line
- Focus: border accent + ring `0 0 0 4px rgba(245,165,36,0.14)`

### Tweaks panel (dev-only)
В прототипе есть TweaksPanel — это девелоперский инструмент, **в production не нужен**. Включает: акцент, тёмная тема, плотность, видимость метрик, deep-links на формы.

---

## State management

Рекомендации для production-стэка:

- **Routing:** Next.js App Router или React Router с nested routes
- **Server state:** React Query / SWR / RTK Query
- **Local UI state:** useState / useReducer; для сложного state-machine'а (драфт встречи) — XState
- **Drawer / Modal state:** глобальный store (Zustand) или контекст — потому что 1-2-1 можно открыть из ленты команды, профиля или topbar'а
- **Тема / Density:** CSS variables через `data-theme` / `data-density` атрибуты + контекст-провайдер

### Ключевые data-модели

```ts
interface TeamMember {
  id: string;
  name: string;
  role: string;        // должность
  email: string;
  joined: string;      // дата (на профиле "с 14 янв 2023")
  tz: string;          // IANA timezone
  lastMeet: Date;
  nextMeet: Date | null;
  moodTrend: number[]; // 7 последних оценок 1-10
  status: 'ok' | 'warn' | 'miss';
  tags: string[];
  teamId: string;
  leadId?: string;     // override команды (матричный случай)
  hue: number;         // для avatar-цвета
}

interface Meeting {
  id: string;
  memberId: string;
  date: Date;
  state: 'planned' | 'done' | 'miss';
  durationMin: number;
  mood?: '😞'|'😐'|'🙂'|'😄'|'🤩';
  moodScore?: number;        // 1-10
  fields: Record<string, unknown>; // динамика по шаблону
  blockers?: string;
  goals?: string;
  feedbackTo?: string;
  feedbackFrom?: string;
  development?: string[];
  relationships?: string;
  attachments?: File[];
}

interface FieldTemplate {
  id: string;
  name: string;
  description: string;
  system: boolean;
  version: string;
  updatedAt: Date;
  updatedBy: string;
  fields: FieldDef[];
}

interface FieldDef {
  id: string;
  type: 'text'|'longtext'|'scale'|'mood'|'checklist'|'select'|'date'|'file';
  title: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: string[];
}

interface Team {
  id: string;
  name: string;
  mission?: string;
  color: string;       // hex
  leadId?: string;
  memberIds: string[];
  defaultTemplateId: string;
  defaultCadence: '1w'|'2w'|'4w';
  visibility: 'private'|'hr'|'org';
}

interface Goal {       // OKR
  id: string;
  memberId: string;
  quarter: string;     // "Q2 2026"
  title: string;
  keyResult: string;
  progress: number;    // 0-100
  status: 'ontrack'|'risk'|'done';
  due: Date;
}

// ─── Система грейдов (window.BT_GRADES) ───

interface Level {        // общий для всех дисциплин, IC1–IC7
  code: string;          // "IC5"
  name: string;          // "Senior"
  exp: string;           // "5+ лет"
  autonomy: string;
  scope: string;
  mgr: boolean;          // доступен ли менеджерский трек с этого уровня
}

interface Discipline {   // направление: Backend / Frontend / Mobile / QA / DevOps / ...
  id: string;
  label: string;
  desc: string;
  icon: string;
  order?: string[];      // порядок id блоков (по умолчанию BLOCK_IDS)
  blockNames: Record<string, string>;       // blockId -> отображаемое имя
  matrix: Record<string, string[]>;         // blockId -> 7 описаний (по уровням)
  addons: Record<string, Addon>;            // доп-треки этой дисциплины
}

interface Addon {        // доп-трек внутри дисциплины (Go, Rust, iOS, Android, Perf…)
  id: string;
  label: string;
  note: string;
  levelNames: string[];  // обычно 5 уровней
  blocks: { id: string; name: string; cells: string[] }[];
}

interface MemberGrade {  // грейд сотрудника (BT_GRADES.members[memberId])
  discipline: string;            // к какой дисциплине привязан
  grade: number;                 // текущий уровень 1..7
  target: number;                // целевой уровень (== grade, если не растёт)
  compa: number;                 // позиция в полосе 0..1 (без точных окладов)
  nextReview: Date;
  lastReview: Date | null;
  blockLevels: Record<string, number>;  // уровень по каждому блоку дисциплины
  addons: Record<string, number>;       // уровни в доп-треках (0 = не заявлен)
  readyMonths: number;           // сколько месяцев СТАБИЛЬНО проявляет L+1
  mgrTrack?: boolean;
}

interface Evidence {     // свидетельство компетенции (фиксируется в 1-2-1)
  id: string;
  date: Date;
  block: string;         // id блока дисциплины
  level: number;         // на каком уровне проявлено
  status: 'demonstrated' | 'partial';
  meetingId: string;     // из какой встречи
  note: string;
}

interface Review {       // запись истории Performance Review
  id: string;
  period: string;        // "H1 2026"
  date: Date;
  fromGrade: number;
  toGrade: number;
  decision: 'hold' | 'promote' | 'pip';
  state: 'draft' | 'final';
  summary: string;
}
```

> **Бэкенд-модель грейдов.** `Level` и `bands` (зарплатные полосы) — общие для всех дисциплин (надбавки доп-треков идут сверху). `BLOCK_IDS` — постоянный набор из 6 id (`stack, core, arch, infra, ai, impact`); каждая дисциплина даёт этим id свои названия (`blockNames`) и тексты (`matrix`). Это сознательное решение: единый набор id упрощает накопление свидетельств и калибровку. Если у направлений лестницы реально различаются — можно разрешить разные наборы блоков per discipline.

---

## Система грейдов, дисциплин и Performance Review

Смысловой хребет фичи:

```
ДИСЦИПЛИНА (карта)  →  1-2-1 (накопление свидетельств)  →  PERF REVIEW (чекпоинт)  →  ВИЛКА
   матрица блок×уровень    «отметил проявленную                раз в 6 мес:               грейд →
   для направления          компетенцию L+1»                    ревью + калибровка        позиция в полосе
```

Ключевой принцип (из реальной grade-таблицы заказчика): **для повышения сотрудник должен СТАБИЛЬНО проявлять компетенции следующего уровня 3–6 месяцев, а не эпизодически.** Поэтому 1-2-1 — точка, где такие свидетельства фиксируются и накапливаются.

### 13. GradesScreen (раздел «Грейды»)

**Назначение:** живой справочник матрицы компетенций по дисциплинам + редактор.

**Layout:**
1. Page header + actions (Экспорт / Редактировать — в edit-режиме: Отмена / Сохранить)
2. **Селектор дисциплин** — ряд карточек (Backend / Frontend / Mobile / QA / DevOps) с иконкой, названием, описанием; активная — accent. В режиме просмотра последняя карточка «+ Новая дисциплина».
3. Sub-tabs: Уровни / Матрица / Вилки
4. Контент таба.

**Tab «Уровни»** — карточки IC1–IC7: код (grade-chip с цветом по уровню), название, опыт, автономность, масштаб влияния. Info-banner с принципом продвижения.

**Tab «Матрица»** — grid блок×уровень. Колонки IC1–IC7 (цветные хедеры), строки — блоки дисциплины. Ячейка = описание компетенции; клик → CellDetail modal. Справа переключатель доп-трека (для Backend: Go/Rust, Mobile: iOS/Android, QA: Perf). Горизонтальный скролл при узком экране.

**Tab «Вилки»** — полосы грейдов (low→mid→high) без точных окладов (вид лида), + блок «дополнительные компоненты».

### Режим редактирования (edit mode)

Кнопка «Редактировать» → рабочая копия дисциплины + уровней в React-state. Видимые изменения:
- Заголовок: amber-бейдж «режим редактирования» + edit-banner.
- Карточка-редактор дисциплины: icon-picker + поля Название/Описание.
- Прочие дисциплины затемнены (нельзя случайно переключиться); Вилки и трек-switcher скрыты.
- **Матрица:** левый столбец блоков → input имени + контролы ↑ / ↓ / удалить; ячейки кликабельны (hover-pencil) → **CellEditor modal** (textarea + «Очистить» / «не требуется» + Применить, обновляет вживую). Снизу «+ Добавить блок компетенций».
- **Tab «Уровни»** в edit-режиме: у каждого уровня editable name/exp/autonomy/scope.
- **Сохранить / Отмена**: изменения применяются к `BT_GRADES` только по «Сохранить».
- **NewDisciplineModal:** иконка + название + описание + «скопировать структуру блоков из…» существующей дисциплины → создаёт новую лестницу и открывает её.

> В прототипе правки применяются в in-memory `window.BT_GRADES` (на сессию). В production — это CRUD к таблицам disciplines / blocks / matrix-cells с версионированием.

### 14. GradeTab (профиль → вкладка «Грейд»)

**Назначение:** грейд конкретного сотрудника в его дисциплине.

**Layout:**
- **grade-hero:** крупный grade-chip + название + лейбл дисциплины; справа — прогресс к L+1 с баром «N из 3–6 мес стабильно»; крайний блок — даты ревью + кнопка «Открыть ревью».
- **Переключатель трека:** Основной грейд + доп-треки дисциплины (показываются только заявленные).
- **grade-grid (2 колонки):**
  - Левая: «Профиль по блокам» (для каждого блока — прогресс-сегменты IC1–7, маркер текущего грейда, отметка «выше грейда»); «Что показать для IC{N+1}» (конкретные пункты из матрицы + счётчик уже накопленных свидетельств).
  - Правая: «Свидетельства из 1-2-1» (таймлайн), «Позиция в полосе» (compa-band), «История ревью».
- Если грейд не назначен (дизайнер/PM) — аккуратный empty-state.

### CompetencyPanel (вкладка «Компетенции» в 1-2-1 drawer)

Во время встречи лид отмечает проявленную компетенцию: выбор блока дисциплины + уровня + заметка → добавляется в лог встречи (накапливается в свидетельства). Плюс «Что важно увидеть для L+1» как быстрые подсказки. Есть и поле-тип `competency` (InlineCompetencyTagger) для конструктора полей — берёт дисциплину из `window.__btDrawerDisc`.

### 15. PerformanceReview (полноэкранная модалка)

**Назначение:** формальный чекпоинт раз в 6 мес.

**Layout:** широкая модалка (1040px) с 4-шаговым rail:
1. **Подготовка** — карточки (грейд→цель, мес стабильности, кол-во свидетельств), самооценка сотрудника по блокам, сводка свидетельств из 1-2-1.
2. **Оценка по блокам** — по каждому блоку grade-scale: ○ самооценка сотрудника vs ● оценка лида; подсветка расхождений; описание выбранного уровня из матрицы.
3. **Калибровка** — распределение сотрудников ТОЙ ЖЕ дисциплины и грейда (бар по среднему уровню), выделен оцениваемый; вывод о позиции относительно медианы.
4. **Решение** — карточки Сохранить / Повысить / PIP; при «Повысить» — влияние на вилку (compa до/после); при PIP — фокус-план по проседающим блокам; поле резюме.

**Видимость (по ответам заказчика):** сотрудник видит свой грейд и матрицу, но НЕ видит оценку лида до завершения ревью; лид видит вилки своей команды без точных окладов; калибровка — в рамках дисциплины.

---

## Анимации и интеракции

| Элемент              | Behavior                                                |
|----------------------|---------------------------------------------------------|
| Modal in             | 180ms cubic-bezier(.2,.7,.3,1), opacity+translateY 8px+scale 0.98 |
| Drawer in            | 220ms cubic-bezier(.2,.7,.3,1), translateX 20px         |
| Scrim fade           | 150ms                                                    |
| Popover (filter)     | 140ms ease, translateY -4px → 0                         |
| Button hover         | bg-tint, 120ms                                          |
| Tab/seg switch       | shadow-1 transition                                     |
| OKR bar fill         | width 300ms ease                                        |
| Switch toggle thumb  | 180ms cubic-bezier(.2,.7,.3,1) translateX 16px          |
| Calendar day hover   | bg-tint, 100ms                                          |

Все hover-состояния — `bg-tint` или `bg-elev` change. Все focus-rings — accent цветом 4px с alpha 0.14.

---

## Assets

- **Иконки:** кастомные SVG в стиле Lucide (stroke 1.6, 24×24 viewBox). Полный набор в `components.jsx` → `const ICONS`. В production рекомендуется импортировать **lucide-react** (имена совпадают: `team`, `calendar`, `download`, `search`, `plus`, `filter`, `bell`, `chevronL/R/D`, `more`, `x`, `send`, `arrow`, `check`, `edit`, `copy`, `trash`, `user`, `mail`, `clock`, `trend`, `star`, `paperclip`, `spark` → use Sparkles, `logout` → LogOut, `shield`, `eye`, `eyeOff`).
- **Шрифт:** Geist + Geist Mono — Google Fonts, weights 400/500/600/700. Для Geist Mono — 400/500/600.
- **Логотип:** генерится HTML+CSS (квадрат 26×26 с буквой «B» и accent-dot 6×6 в правом-верхнем углу). Можно сохранить как SVG.
- **Декоративная графика на login:** генерится через CSS (`repeating-conic-gradient`, `clip-path` hex'ы). В production можно заменить на иллюстрацию пчелы / сот.
- **Аватары:** генерятся из инициалов + `hue` через oklch. В production — то же самое, плюс fallback на загруженную фото.

---

## Файлы в этом бандле

| Файл              | Что содержит                                          |
|-------------------|-------------------------------------------------------|
| `BeeTeam.html`    | Точка входа, подключает React/Babel/CSS + порядок скриптов |
| `styles.css`      | Все стили + темизация + density modes                 |
| `data.js`         | Sample data команды (`window.BT_DATA`) — 8 человек + история Анны |
| `grades-data.js`  | `window.BT_GRADES` — уровни, вилки, дисциплины с матрицами, доп-треки, грейды сотрудников, свидетельства, история ревью + helpers |
| `components.jsx`  | Icon, Avatar, date helpers (RU_MONTHS, fmtShort и пр.) |
| `screens.jsx`     | LoginScreen, Sidebar, TeamList, EmployeeProfile (с вкладкой «Грейд») |
| `meeting.jsx`     | MeetingDrawer + FieldControl (типы полей, вкл. `competency`) + CompetencyPanel + FieldsConfig |
| `flows.jsx`       | CalendarScreen, FieldsLibraryScreen, GoalsTab/FieldsTab/FilesTab, FilterPopover, AdminTeams/Leads/Settings |
| `forms.jsx`       | AddEmployeeModal, AddTeamModal                        |
| `grades.jsx`      | GradesScreen (справочник + режим РЕДАКТИРОВАНИЯ): матрица, уровни, вилки, редакторы ячеек/блоков/уровней, NewDisciplineModal |
| `grade-profile.jsx`| GradeTab — вкладка грейда в профиле + TrackProfile (доп-трек) |
| `review.jsx`      | PerformanceReview — 4-шаговый флоу (Подготовка/Оценка/Калибровка/Решение) |
| `app.jsx`         | Root App + routing + TweaksPanel integration          |
| `tweaks-panel.jsx`| Dev-only тулинг для прототипа (в production не нужен) |

**Порядок загрузки скриптов важен:** `data.js`, `grades-data.js` (данные на `window`) → `components.jsx` → `tweaks-panel.jsx` → `screens.jsx` → `meeting.jsx` → `flows.jsx` → `forms.jsx` → `grades.jsx` → `grade-profile.jsx` → `review.jsx` → `app.jsx`. Компоненты публикуются в `window` через `Object.assign(window, {...})` в конце каждого файла (в production — обычные ES-импорты).

**Чтобы запустить прототип локально:** открыть `BeeTeam.html` через любой статичный сервер (например, `python -m http.server`). Прямое открытие через `file://` не сработает из-за CORS.

---

## Что важно сохранить при переносе

1. **Тёплая палитра** — фоны слегка beige (#FAFAF7), не чисто-белые. Это создаёт ощущение «живого» рабочего пространства.
2. **Янтарный акцент** — он же бренд-цвет «пчелы», используется ровно там, где нужно привлечь внимание (CTA, active state, today, accent metric). Не для декора.
3. **Tabular numbers** везде, где есть счётчики / даты / проценты — через `font-variant-numeric: tabular-nums` или Geist Mono. Это важно для табличной читаемости.
4. **Микро-копии на русском** — продуктовая лексика: «1-2-1», «Просрочены», «Требуют внимания», «На этой неделе». Сохранить тон.
5. **Pill-based статусы** — никаких просто текстовых статусов, всегда с dot и border. Это даёт сильный визуальный signal.
6. **Empty states** — везде, где список может быть пустым, есть осмысленный текст («все встречи в графике», «не назначено», «ничего не запланировано»).
7. **Smart fields** — где можно вывести значение по контексту (лид сотрудника = лид команды), показывать readonly с возможностью override. Не дёргать пользователя без причины.
