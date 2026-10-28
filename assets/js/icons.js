/* 图标：全部内联 SVG，描边随文字颜色，尺寸交给 CSS */

const W = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

const WEATHER = {
  '晴': W('<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5"/>'),
  '多云': W('<path d="M8.4 9.2a3.6 3.6 0 1 1 6.7-2.2"/><path d="M17.6 8.4a2.9 2.9 0 0 1 .3 5.8H7.5a3.6 3.6 0 0 1-.2-7.2"/>'),
  '阴': W('<path d="M17.2 10.4a3.9 3.9 0 0 0-7.5-1.3 3.3 3.3 0 0 0-.6 6.6h7.6a3 3 0 0 0 .5-5.3z"/><path d="M8.4 19.2h7.4"/>'),
  '小雨': W('<path d="M17.2 9.6a3.9 3.9 0 0 0-7.5-1.3 3.3 3.3 0 0 0-.6 6.6h7.6a3 3 0 0 0 .5-5.3z"/><path d="M9.4 17.6l-.9 2M12.6 17.6l-.9 2M15.8 17.6l-.9 2"/>'),
  '大雨': W('<path d="M17.2 9.2a3.9 3.9 0 0 0-7.5-1.3 3.3 3.3 0 0 0-.6 6.6h7.6a3 3 0 0 0 .5-5.3z"/><path d="M9.2 16.6l-1.4 3.2M12.4 16.6l-1.4 3.2M15.6 16.6l-1.4 3.2"/>'),
  '风': W('<path d="M3.6 8.8h9.2a2.7 2.7 0 1 0-2.7-2.7"/><path d="M3.6 12.6h12.6a2.7 2.7 0 1 1-2.7 2.7"/><path d="M3.6 16.4h6.2"/>'),
  '雪': W('<path d="M12 3.4v17.2M4.6 7.7l14.8 8.6M19.4 7.7L4.6 16.3"/><path d="M9.2 5.4L12 7l2.8-1.6M9.2 18.6L12 17l2.8 1.6"/>'),
  '雾': W('<path d="M4.4 8.2h15.2M6.6 12h12.4M4.4 15.8h13.2"/>')
};

const UI = {
  book: W('<path d="M5.2 4.4h9.4a2 2 0 0 1 2 2v13.2H7.2a2 2 0 0 1-2-2z"/><path d="M16.6 6.4h2.2v13.2h-2.2"/><path d="M8.2 8.6h5.4M8.2 12h5.4"/>'),
  pen: W('<path d="M4.6 19.4l1-4.6L15.8 4.6a2 2 0 0 1 2.8 2.8L8.4 17.6z"/><path d="M14 6.4l3.6 3.6"/>'),
  search: W('<circle cx="11" cy="11" r="6.6"/><path d="M16.2 16.2L21 21"/>'),
  left: W('<path d="M14.4 5.6L8 12l6.4 6.4"/>'),
  right: W('<path d="M9.6 5.6L16 12l-6.4 6.4"/>'),
  arrow: W('<path d="M4.8 12h14M13.4 6.6L18.8 12l-5.4 5.4"/>'),
  clock: W('<circle cx="12" cy="12" r="8"/><path d="M12 7.4V12l3.2 2"/>'),
  pin: W('<path d="M12 21c4-4.4 6-7.6 6-10a6 6 0 1 0-12 0c0 2.4 2 5.6 6 10z"/><circle cx="12" cy="11" r="2.2"/>'),
  tag: W('<path d="M4.6 11.4V5.2a.6.6 0 0 1 .6-.6h6.2l8 8a1.2 1.2 0 0 1 0 1.7l-5 5a1.2 1.2 0 0 1-1.7 0z"/><circle cx="8.4" cy="8.4" r="1.2"/>'),
  mood: W('<circle cx="12" cy="12" r="8"/><path d="M8.8 13.6a4 4 0 0 0 6.4 0"/><path d="M9.4 9.4h.01M14.6 9.4h.01"/>'),
  lock: W('<rect x="5" y="10.4" width="14" height="9.6" rx="2.4"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>'),
  sun: W('<circle cx="12" cy="12" r="3.7"/><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>'),
  moon: W('<path d="M20.2 14.8A8.6 8.6 0 1 1 9.4 4a7 7 0 0 0 10.8 10.8z"/>'),
  flame: W('<path d="M12 3.2c4 4 6 6.9 6 9.6a6 6 0 0 1-12 0c0-2.7 2-5.6 6-9.6z"/><path d="M12 17.4a2.6 2.6 0 0 0 2.6-2.6c0-1.4-.9-2.6-2.6-4-1.7 1.4-2.6 2.6-2.6 4a2.6 2.6 0 0 0 2.6 2.6z"/>'),
  today: W('<rect x="4" y="5.6" width="16" height="14.4" rx="2.4"/><path d="M4 10h16M8.4 3.6v3.6M15.6 3.6v3.6"/><circle cx="12" cy="15" r="1.6"/>')
};

export function weatherIcon(name) {
  return WEATHER[name] || WEATHER['阴'];
}

export function icon(name) {
  return UI[name] || '';
}

export const WEATHER_NAMES = Object.keys(WEATHER);
