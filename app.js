import { createMedia } from './media.js?v=3';
import { mountViewer } from './viewer.js?v=2';
const root = document.querySelector('#app');
let view, media, mediaPromise, mode = '', mainLanguage = 'ko', version = 0;
history.scrollRestoration = 'manual';

// The SVG main never initializes the video decoder or requests a render clip.
function exhibitionMedia() {
  if (media) return Promise.resolve(media);
  mediaPromise ||= createMedia().then(value => (media = value));
  return mediaPromise;
}
function enter(route) {
  if (route === 'main') main('en');
  else if (route === 'korean_main') main('ko');
  else tour(Math.max(0, (parseInt(String(route).replace('page', ''), 10) || 1) - 1));
}
async function main(language = 'ko', { historyChange = true } = {}) {
  const current = ++version;
  view?.destroy?.();
  view = null;
  mode = 'home';
  mainLanguage = language;
  window.scrollTo(0, 0);
  document.body.style.background = '#000';
  const { mountMain } = await import('./main.js?v=8');
  if (current !== version) return;
  view = mountMain(root, { onEnter: enter, language });
  if (historyChange) history.pushState({ mode: 'home', language }, '', language === 'en' ? '#english' : '#home');
}
async function tour(page = 0, { historyChange = true } = {}) {
  const current = ++version;
  view?.destroy?.();
  view = null;
  mode = 'tour';
  window.scrollTo(0, 0);
  document.body.style.background = '#fff';
  const activeMedia = await exhibitionMedia();
  if (current !== version) return;
  const mounted = await mountViewer(root, { media: activeMedia, onHome: () => main('ko'), startPage: page });
  if (current !== version) { mounted.destroy(); return; }
  view = mounted;
  if (historyChange) history.pushState({ mode: 'tour' }, '', '#exhibition');
}
try {
  if (location.hash === '#exhibition') await tour(0, { historyChange: false });
  else await main(location.hash === '#english' ? 'en' : 'ko', { historyChange: false });
  window.addEventListener('popstate', () => {
    if (location.hash === '#exhibition') {
      if (mode !== 'tour') tour(0, { historyChange: false });
    } else {
      const language = location.hash === '#english' ? 'en' : 'ko';
      if (mode !== 'home' || mainLanguage !== language) main(language, { historyChange: false });
    }
  });
  root.addEventListener('peep:diagnostics', () => {
    root.dataset.diagnostics = JSON.stringify({ mode, language: mainLanguage, ...(view?.stats?.() || {}), ...(media?.stats?.() || {}) });
  });
} catch (error) {
  root.innerHTML = '<p class="original-error"></p>';
  root.firstChild.textContent = '페이지를 불러오지 못했습니다. ' + error.message;
  console.error(error);
}
