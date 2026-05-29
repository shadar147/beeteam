// BeeTeam — общие компоненты, иконки

// ────────── Icons (Lucide-style, simple stroke) ──────────
const Icon = ({ name, size = 16, stroke = 1.6, className = '' }) => {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
};

const ICONS = {
  team: <React.Fragment><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></React.Fragment>,
  calendar: <React.Fragment><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></React.Fragment>,
  fields: <React.Fragment><path d="M3 6h18M3 12h18M3 18h12"/></React.Fragment>,
  download: <React.Fragment><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></React.Fragment>,
  settings: <React.Fragment><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></React.Fragment>,
  search: <React.Fragment><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></React.Fragment>,
  plus: <React.Fragment><path d="M12 5v14M5 12h14"/></React.Fragment>,
  filter: <React.Fragment><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></React.Fragment>,
  bell: <React.Fragment><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></React.Fragment>,
  chevronL: <React.Fragment><path d="m15 18-6-6 6-6"/></React.Fragment>,
  chevronR: <React.Fragment><path d="m9 18 6-6-6-6"/></React.Fragment>,
  chevronD: <React.Fragment><path d="m6 9 6 6 6-6"/></React.Fragment>,
  more: <React.Fragment><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></React.Fragment>,
  x: <React.Fragment><path d="M18 6 6 18M6 6l12 12"/></React.Fragment>,
  send: <React.Fragment><path d="m22 2-7 20-4-9-9-4 20-7z"/></React.Fragment>,
  arrow: <React.Fragment><path d="M5 12h14M13 5l7 7-7 7"/></React.Fragment>,
  check: <React.Fragment><path d="M20 6 9 17l-5-5"/></React.Fragment>,
  edit: <React.Fragment><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></React.Fragment>,
  copy: <React.Fragment><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></React.Fragment>,
  trash: <React.Fragment><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></React.Fragment>,
  user: <React.Fragment><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></React.Fragment>,
  mail: <React.Fragment><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></React.Fragment>,
  clock: <React.Fragment><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></React.Fragment>,
  trend: <React.Fragment><path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></React.Fragment>,
  star: <React.Fragment><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></React.Fragment>,
  paperclip: <React.Fragment><path d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l8.57-8.57a4 4 0 0 1 5.66 5.66l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></React.Fragment>,
  spark: <React.Fragment><path d="M9.94 14.34 2 12l7.94-2.34L12 2l2.06 7.66L22 12l-7.94 2.34L12 22z"/></React.Fragment>,
  logout: <React.Fragment><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></React.Fragment>,
  shield: <React.Fragment><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></React.Fragment>,
  eye: <React.Fragment><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></React.Fragment>,
  eyeOff: <React.Fragment><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.66 18.66 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></React.Fragment>,
  layers: <React.Fragment><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></React.Fragment>,
  target: <React.Fragment><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></React.Fragment>,
  award: <React.Fragment><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></React.Fragment>,
  scale: <React.Fragment><path d="M16 16l3-8 3 8c-2 1.5-4 1.5-6 0z"/><path d="M2 16l3-8 3 8c-2 1.5-4 1.5-6 0z"/><path d="M7 8h10M12 4v16M7 21h10"/></React.Fragment>,
  flag: <React.Fragment><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></React.Fragment>,
};

// ────────── Avatar ──────────
const Avatar = ({ name, hue, size = 'md' }) => {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const cls = size === 'sm' ? 'avatar avatar-sm'
            : size === 'lg' ? 'avatar avatar-lg'
            : size === 'xl' ? 'avatar avatar-xl'
            : 'avatar';
  const bg = hue != null
    ? `oklch(0.92 0.05 ${hue})`
    : 'var(--bg-tint)';
  const fg = hue != null
    ? `oklch(0.30 0.08 ${hue})`
    : 'var(--ink)';
  return (
    <span className={cls} style={{ background: bg, color: fg, borderColor: 'transparent' }}>
      {initials}
    </span>
  );
};

// ────────── Date helpers ──────────
const RU_MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const RU_MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_DOW = ['пн','вт','ср','чт','пт','сб','вс'];

const fmtShort = (d) => `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
const fmtLong  = (d) => `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const sameDay  = (a, b) => a && b && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const daysBetween = (a, b) => Math.round((a - b) / 86400000);

const relativeAgo = (date, today) => {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff < 0) {
    const ad = -diff;
    if (ad === 1) return 'завтра';
    if (ad < 7) return `через ${ad} дн.`;
    return `через ${Math.round(ad/7)} нед.`;
  }
  if (diff < 7) return `${diff} дн. назад`;
  if (diff < 30) return `${Math.round(diff/7)} нед. назад`;
  return `${Math.round(diff/30)} мес. назад`;
};

// ────────── Export to globals ──────────
Object.assign(window, {
  Icon, ICONS, Avatar,
  RU_MONTHS, RU_MONTHS_FULL, RU_DOW,
  fmtShort, fmtLong, sameDay, daysBetween, relativeAgo,
});
