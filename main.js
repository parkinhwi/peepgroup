import { createMainVector } from './main-vector-player.js';
import { ORIGINAL_PICTURE_IDS, PHOTO_PICTURE_IDS } from './main-picture-revisions.js?v=5';
const photographIds = new Set(PHOTO_PICTURE_IDS);
const originalPictureIds = new Set(ORIGINAL_PICTURE_IDS);
// This unused sample is fully occluded by the opaque seq-02 panel in both original and native layout.
const OCCLUDED_SAMPLE = '63208faf7c6b37001314640c';
const MODULE_URL = import.meta.url;
const DATA_URL = new URL('./main-data.json', MODULE_URL);
const STYLE_URL = new URL('./main.css?v=5', MODULE_URL).href;
const ASSET_URL = (name) => new URL(`./assets/main/${name}`, MODULE_URL).href;

const INTRO_TRIGGER = '633b2d8d9963b300210115e5';
const INTRO_LABEL = '633b2e9665aad5001375adbb';
const INTRO_LOADING_BAR = '62b96f9b9ddab4001b90dc59';
const INTRO_FALL_SECONDS = 1.2; // Last original falling shape has settled at this point.
const INTRO_LOADING_SECONDS = 3.9; // 1.2s falling + 3.9s loading + 0.9s Enter = 6s total.
const INTRO_BAR_INSET = 20; // Original 1024-wide stage units; applies only to the loading line.
const REMOVED_LANDING_LINES = new Set(['62b96f9c110d230037c64eda', '62b35b63c1134d002338b73e']);

function ensureStylesheet() {
  if (document.querySelector(`link[data-peep-main-css="${STYLE_URL}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  link.dataset.peepMainCss = STYLE_URL;
  document.head.append(link);
}

function color(value, fallback = '#fff') {
  if (!value || typeof value !== 'string') return fallback;
  const raw = value.replace('#', '');
  if (raw.length < 6) return fallback;
  const rgb = `#${raw.slice(0, 6)}`;
  if (raw.length < 8) return rgb;
  const alpha = Math.max(0, Math.min(1, parseInt(raw.slice(6, 8), 16) / 100));
  return alpha >= 0.999 ? rgb : `${rgb}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function easeName(value) {
  if (value === 'ease-both') return 'ease-in-out';
  if (value === 'ease-in' || value === 'ease-out' || value === 'linear') return value;
  return 'linear';
}

function cubicBezierAt(x, x1, y1, x2, y2) {
  const sample = (t, a1, a2) => 3 * (1 - t) * (1 - t) * t * a1 + 3 * (1 - t) * t * t * a2 + t * t * t;
  const slope = (t, a1, a2) => 3 * (1 - t) * (1 - t) * a1 + 6 * (1 - t) * t * (a2 - a1) + 3 * t * t * (1 - a2);
  let t = x;
  for (let i = 0; i < 6; i += 1) {
    const s = slope(t, x1, x2);
    if (Math.abs(s) < 1e-7) break;
    t -= (sample(t, x1, x2) - x) / s;
  }
  return sample(Math.max(0, Math.min(1, t)), y1, y2);
}

function eased(t, acceleration) {
  t = Math.max(0, Math.min(1, t));
  if (!acceleration || acceleration === 'none' || acceleration === 'linear') return t;
  if (acceleration === 'ease-in') return cubicBezierAt(t, .42, 0, 1, 1);
  if (acceleration === 'ease-out') return cubicBezierAt(t, 0, 0, .58, 1);
  if (acceleration === 'ease-both') return cubicBezierAt(t, .42, 0, .58, 1);
  return t;
}

function textStyle(widget, key) {
  const entry = (widget.styles || []).find((item) => item.key === key);
  const inline = entry?.inlineStyles || {};
  const keys = inline.keys || [];
  const values = inline.values || [];
  return Object.fromEntries(keys.map((name, index) => [name, values[index]]));
}

function blockMeta(widget, key) {
  return (widget.blocksMeta || []).find((item) => item.key === key)?.data || {};
}

function applyTypography(line, widget, block) {
  const style = textStyle(widget, block.key);
  const meta = blockMeta(widget, block.key);
  line.style.fontFamily = style.FONT_FAMILY ? `'${style.FONT_FAMILY}', Arial, sans-serif` : 'Arial, sans-serif';
  if (style.FONT_SIZE) line.style.fontSize = `${style.FONT_SIZE}px`;
  if (style.FONT_WEIGHT) line.style.fontWeight = style.FONT_WEIGHT;
  if (style.FONT_STYLE) line.style.fontStyle = style.FONT_STYLE;
  line.style.color = color(style.COLOR, '#fff');
  if (style.LETTER_SPACING != null) line.style.letterSpacing = `${style.LETTER_SPACING}px`;
  if (style.FONT_VARIABLE) {
    const [axis, val] = String(style.FONT_VARIABLE).split('|');
    if (axis && val) line.style.fontVariationSettings = `"${axis}" ${val}`;
  }
  if (meta.lineHeight != null) line.style.lineHeight = `${meta.lineHeight}px`;
  if (meta.textIndent != null) line.style.textIndent = `${meta.textIndent}px`;
  if (meta.align) line.style.textAlign = meta.align.replace('align-', '');
}

function appendEntityText(line, widget, block, onEnter) {
  const ranges = [...(block.entityRanges || [])].sort((a, b) => a.offset - b.offset);
  if (!ranges.length) {
    line.textContent = block.text;
    return;
  }
  let cursor = 0;
  for (const range of ranges) {
    if (range.offset > cursor) line.append(document.createTextNode(block.text.slice(cursor, range.offset)));
    const value = widget.entityMap?.[range.key];
    const label = block.text.slice(range.offset, range.offset + range.length);
    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = label;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const route = value?.data?.url || value?.data?.pageId;
      if (route) onEnter?.(route === 'main' ? 'main' : route);
    });
    line.append(link);
    cursor = range.offset + range.length;
  }
  if (cursor < block.text.length) line.append(document.createTextNode(block.text.slice(cursor)));
}

function renderText(widget, onEnter) {
  const el = document.createElement('div');
  el.className = 'peep-main-widget peep-main-text';
  for (const block of widget.blocks || []) {
    const line = document.createElement('div');
    line.className = 'pg-line';
    applyTypography(line, widget, block);
    appendEntityText(line, widget, block, onEnter);
    el.append(line);
  }
  return el;
}

function renderShape(widget) {
  const el = document.createElement('div');
  el.className = 'peep-main-widget peep-main-shape';
  const transparent = Number(widget.bg_opacity ?? 1) === 0;
  const lineLike = (widget.h <= 24 && widget.w >= 40) || (widget.w <= 24 && widget.h >= 40);
  if (lineLike) {
    el.classList.add(widget.w >= widget.h ? 'pg-horizontal' : 'pg-vertical');
    const line = document.createElement('span');
    line.className = 'pg-shape-line';
    line.style.color = color(widget.color, '#fff');
    if (widget.w >= widget.h) line.style.height = `${widget.weight || 1}px`;
    else line.style.width = `${widget.weight || 1}px`;
    el.append(line);
  } else if (!transparent) {
    el.style.background = color(widget.bg_color, '#000');
    el.style.opacity = widget.bg_opacity == null ? '1' : String(widget.bg_opacity);
  }
  if (transparent) el.style.background = 'transparent';
  if (widget.radius) el.style.borderRadius = `${widget.radius}px`;
  return el;
}

function renderPicture(widget) {
  const el = document.createElement('div');
  el.className = 'peep-main-widget peep-main-picture';
  if (originalPictureIds.has(widget.wid)) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = ASSET_URL('original-' + widget.wid + '.png');
    el.append(img);
    el.dataset.artwork = 'original-artwork';
  } else if (photographIds.has(widget.wid)) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.dataset.photoSrc = ASSET_URL('pic-' + widget.wid + '.webp');
    el.append(img);
    el.dataset.artwork = 'photograph';
  } else {
    throw Error('Unclassified picture ' + widget.wid);
  }
  if (widget.border_size) el.style.border = widget.border_size + 'px solid ' + color(widget.border_color, '#f4f4f4');
  if (widget.border_radius) el.style.borderRadius = widget.border_radius + 'px';
  return el;
}

function renderShots() {
  const el = document.createElement('div');
  el.className = 'peep-main-widget peep-main-shots';
  const surface = document.createElement('div');
  surface.className = 'peep-main-vector-surface';
  surface.setAttribute('aria-hidden', 'true');
  el.append(surface);
  return { el, surface };
}

function placeWidget(el, widget) {
  el.dataset.widgetId = widget.wid;
  el.style.width = `${widget.w || 0}px`;
  el.style.height = `${widget.h || 0}px`;
  el.style.zIndex = String(widget.z ?? widget._z ?? 1);
  if (widget.fixed_position === 'c') {
    el.style.left = `calc(50% + ${widget.x || 0}px - ${(widget.w || 0) / 2}px)`;
    el.style.top = `calc(50% + ${widget.y || 0}px - ${(widget.h || 0) / 2}px)`;
  } else if (widget.fixed_position === 'ne') {
    el.style.right = `${widget.x || 0}px`;
    el.style.top = `${widget.y || 0}px`;
  } else if (widget.fixed_position === 's') {
    el.style.left = `calc(50% + ${widget.x || 0}px - ${(widget.w || 0) / 2}px)`;
    el.style.bottom = `${widget.y || 0}px`;
  } else {
    el.style.left = `${widget.x || 0}px`;
    el.style.top = `${widget.y || 0}px`;
  }
}

function animationByType(widget, type) {
  return (widget.animation || []).find((item) => item.type === type);
}

function transformString(state) {
  return `translate3d(${state.x || 0}px,${state.y || 0}px,0) rotate(${state.rotate || 0}deg) scale(${state.scale ?? 1})`;
}

function startLoadAnimation(el, animation) {
  if (!animation?.steps?.length || el.dataset.loadStarted) return;
  el.dataset.loadStarted = 'true';
  const steps = animation.steps.filter((step) => !step.loop);
  if (!steps.length) return;
  let total = 0;
  for (const step of steps) total += Number(step.delay || 0) + Number(step.duration || 0);
  if (!total) total = 0.001;
  const state = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 };
  const first = steps[0];
  if (first.from_opacity != null) state.opacity = Number(first.from_opacity) / 100;
  if (first.from_rotate != null) state.rotate = Number(first.from_rotate);
  if (first.from_scale != null) state.scale = Number(first.from_scale) / 100;
  const frames = [{ offset: 0, transform: transformString(state), opacity: state.opacity }];
  let time = 0;
  for (const step of steps) {
    time += Number(step.delay || 0);
    if (step.delay) frames.push({ offset: time / total, transform: transformString(state), opacity: state.opacity });
    if (step.use_move) {
      state.x = Number(step.dx || 0);
      state.y = Number(step.dy || 0);
    }
    if (step.use_rotate) state.rotate = Number(step.rotate || 0);
    if (step.use_scale) state.scale = Number(step.scale || 100) / 100;
    if (step.use_opacity && step.opacity != null) state.opacity = Number(step.opacity) / 100;
    time += Number(step.duration || 0);
    frames.push({ offset: Math.min(1, time / total), transform: transformString(state), opacity: state.opacity, easing: easeName(step.acceleration) });
  }
  const delay = el.dataset.widgetId === INTRO_LOADING_BAR ? INTRO_FALL_SECONDS * 1000 : 0;
  el.animate(frames, { delay, duration: total * 1000, fill: 'forwards', easing: 'linear' });
}

function scrollState(animation, widget, baseScroll, viewportBaseHeight, pageScale) {
  const steps = animation?.steps || [];
  const state = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 };
  if (!steps.length) return state;
  if (steps[0].from_opacity != null) state.opacity = Number(steps[0].from_opacity) / 100;
  if (steps[0].from_rotate != null) state.rotate = Number(steps[0].from_rotate);
  if (steps[0].from_scale != null) state.scale = Number(steps[0].from_scale) / 100;

  let cursor = 0;
  if (!widget.fixed_position) {
    const factors = { top: 1, center: .5, bottom: 0 };
    const point = steps[0].start_point || 'bottom';
    const factor = factors[point] ?? 0;
    cursor = Number(widget.y || 0) - (1 - factor) * viewportBaseHeight + Number(steps[0].start_offset || 0);
  }

  let previousX = 0;
  let previousY = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const rawDelay = Number(step.delay_px || 0);
    if (widget.fixed_position) cursor += rawDelay * Math.max(1, pageScale) / pageScale;
    else if (index > 0) cursor += rawDelay * Math.max(1, pageScale);

    const target = { ...state };
    if (step.use_move) {
      target.x = Number(step.dx || 0);
      target.y = Number(step.dy || 0);
    }
    if (step.use_rotate) target.rotate = Number(step.rotate || 0);
    if (step.use_scale) target.scale = Number(step.scale || 100) / 100;
    if (step.use_opacity && step.opacity != null) target.opacity = Number(step.opacity) / 100;

    const dx = target.x - previousX;
    const dy = target.y - previousY;
    const speed = Math.max(.001, Number(step.speed || 1));
    const distance = dx || dy ? Math.hypot(dx, dy) : 300;
    const duration = Math.ceil(distance / speed);
    const raw = (baseScroll - cursor) / duration;
    if (raw <= 0) break;
    const p = eased(Math.min(1, raw), step.acceleration || 'none');
    for (const key of ['x', 'y', 'rotate', 'scale', 'opacity']) state[key] += (target[key] - state[key]) * p;
    if (raw < 1) break;
    Object.assign(state, target);
    previousX = target.x;
    previousY = target.y;
    cursor += duration;
  }
  return state;
}

function shotProgress(widget, baseScroll, viewportBaseHeight) {
  if (widget.playbackType !== 'scroll') return 0;
  const factors = { top: 1, center: .5, bottom: 0 };
  const factor = factors[widget.scrollStartPoint || 'bottom'] ?? 0;
  const start = widget.fixed_position
    ? Number(widget.scrollDelay || 0)
    : Number(widget.y || 0) - (1 - factor) * viewportBaseHeight + Number(widget.startPointOffset || 0);
  const frameCount = Math.max(1, Number(widget.numberOfImages || 1));
  const index = Math.max(0, Math.min(frameCount - 1, (baseScroll - start) * Number(widget.scrollSpeed || 1) / 10));
  return index / Math.max(1, frameCount - 1);
}

function closestScrollable(element) {
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return window;
}

export function mountMain(container, { onEnter, language = 'ko' } = {}) {
  if (!container) throw new Error('mountMain requires a container element');
  ensureStylesheet();
  const selectedLanguage = language === 'en' ? 'en' : 'ko';

  const root = document.createElement('section');
  root.className = 'peep-main';
  root.dataset.language = selectedLanguage;
  root.dataset.renderer = 'native-svg';
  root.setAttribute('aria-label', 'peep-group');
  const stage = document.createElement('div');
  stage.className = 'peep-main-stage';
  const fixed = document.createElement('div');
  fixed.className = 'peep-main-fixed';
  root.append(stage, fixed);
  container.replaceChildren(root);

  const controller = new AbortController();
  const players = new Map();
  const playerProgress = new Map();
  const elements = new Map();
  const widgets = new Map();
  const loadItems = [];
  const scrollItems = [];
  const shotItems = [];
  const cleanups = [];
  const vectorJobs = [];
  let vectorErrors = 0, ready = false, photographsLoaded = false;
  const scrollHost = closestScrollable(container);
  let destroyed = false;
  let raf = 0;
  let scale = 1;
  let pageHeight = 7629;
  let introDismissed = false;
  let clickShotId = null;
  let planningBounds = null;
  let cuePlaying = false, cueRaf = 0, cueElapsed = 0, cueStarted = 0;

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  function dismissIntro() {
    if (introDismissed) return;
    introDismissed = true;
    root.classList.add('is-intro-dismissed');
    for (const [id, el] of elements) {
      if (!el.classList.contains('peep-main-intro')) continue;
      el.getAnimations().forEach((animation) => animation.cancel());
      el.style.opacity = '0';
      el.style.transform = 'translate3d(0,-1200px,0)';
      el.style.pointerEvents = 'none';
    }
    playCue(true);
  }

  function playCue(play) {
    const player = clickShotId ? players.get(clickShotId) : null;
    const widget = clickShotId ? widgets.get(clickShotId) : null;
    if (!player || !widget || cuePlaying === play) return;
    cuePlaying = play;
    root.dataset.cuePlaying = String(play);
    if (!play) { cueElapsed = performance.now() - cueStarted; cancelAnimationFrame(cueRaf); return; }
    cueStarted = performance.now() - cueElapsed;
    const count = widget.numberOfImages || player.info?.frames || 41;
    const duration = count * 16.66 / (widget.byStepSpeed || 1);
    const tick = (now) => {
      if (destroyed || !cuePlaying) return;
      const elapsed = now - cueStarted;
      const cycle = Math.floor(elapsed / duration);
      let index = Math.min(1, (widget.byStepLoop ? elapsed % duration : elapsed) / duration) * count;
      if (widget.byStepSpringLoop && cycle % 2) index = count - index;
      player.frame?.(Math.min(count - 1, index));
      if (!widget.byStepLoop && elapsed >= duration) { cuePlaying = false; return; }
      cueRaf = requestAnimationFrame(tick);
    };
    cueRaf = requestAnimationFrame(tick);
  }

  function connectVector(widget, surface) {
    const job = createMainVector(surface, widget).then(player => {
      if (destroyed) { player.destroy(); return; }
      players.set(widget.wid, player);
      player.seek(playerProgress.get(widget.wid) || 0);
      if (widget.wid === clickShotId && introDismissed) playCue(true);
    }).catch(error => {
      vectorErrors++;
      console.error('peep-group vector ' + widget.wid, error);
    });
    vectorJobs.push(job);
  }

  function loadPhotographs() {
    if (photographsLoaded) return;
    photographsLoaded = true;
    for (const img of root.querySelectorAll('img[data-photo-src]')) img.src = img.dataset.photoSrc;
  }

  function renderWidget(widget) {
    if (REMOVED_LANDING_LINES.has(widget.wid) || widget.wid === OCCLUDED_SAMPLE) return;
    if (widget.type === 'background' || widget.type === 'iframe' || widget.hidden === true || widget._hidden === true) return;
    let el;
    let surface;
    if (widget.type === 'text') el = renderText(widget, onEnter);
    else if (widget.type === 'shape') el = renderShape(widget);
    else if (widget.type === 'picture') el = renderPicture(widget);
    else if (widget.type === 'shots') ({ el, surface } = renderShots());
    else return;

    placeWidget(el, widget);
    if (!widget.fixed_position && widget.y >= 2479 && widget.y <= 3173 && (widget.type === 'text' || (widget.type === 'shape' && widget.h <= 24))) el.classList.add('peep-main-planning-ink');
    if (widget.type === 'text' && widget.fixed_position === 'ne') el.classList.add('peep-main-language');
    const hover = animationByType(widget, 'hover');
    const isMapPhoto = widget.type === 'picture' && hover?.trigger?.length;
    const isFinalArrow = widget.type === 'picture' && Boolean(widget.clickLink);
    const isClickShot = widget.type === 'shots' && widget.playbackType === 'click';
    if (widget.opacity != null && !isMapPhoto) el.style.opacity = String(widget.opacity);
    if (isMapPhoto) el.classList.add('peep-main-map-photo');
    if (selectedLanguage === 'ko' && (widget.z || 0) >= 358) el.classList.add('peep-main-intro');
    if (isFinalArrow) el.classList.add('peep-main-final-arrow', 'peep-main-interactive');
    if (widget.wid === INTRO_TRIGGER || widget.wid === INTRO_LABEL) el.classList.add('peep-main-interactive');
    if (isClickShot) {
      clickShotId = widget.wid;
      el.classList.add('peep-main-loading', 'peep-main-interactive');
      el.addEventListener('click', () => playCue(!cuePlaying), { signal: controller.signal });
    }

    if (isFinalArrow || isClickShot || widget.wid === INTRO_TRIGGER || widget.wid === INTRO_LABEL) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', isFinalArrow ? (selectedLanguage === 'en' ? 'Enter the exhibition' : '전시 입장하기') : isClickShot ? '스크롤 안내 재생 또는 일시정지' : widget.wid === INTRO_LABEL ? 'Enter' : '인트로 닫기');
      el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); } }, { signal: controller.signal });
    }

    const target = widget.fixed_position ? fixed : stage;
    if (widget.wid === INTRO_LOADING_BAR) {
      el.style.opacity = '0'; // Keep even the initial sliver hidden until the shapes settle.
      // Clip only the moving loading line, not the main layout or other intro artwork.
      const track = document.createElement('div');
      track.className = 'peep-main-loading-track';
      Object.assign(track.style, {
        position: 'absolute', inset: '0',
        clipPath: `inset(0 ${INTRO_BAR_INSET}px)`,
        pointerEvents: 'none', zIndex: String(widget.z),
      });
      track.append(el);
      target.append(track);
    } else target.append(el);
    elements.set(widget.wid, el);
    widgets.set(widget.wid, widget);

    const load = animationByType(widget, 'load');
    if (load) {
      let animation = load;
      if (widget.wid === INTRO_LOADING_BAR || widget.wid === INTRO_TRIGGER) {
        animation = { ...load, steps: load.steps.map((step, index) => index ? step : {
          ...step,
          ...(widget.wid === INTRO_LOADING_BAR
            ? { duration: INTRO_LOADING_SECONDS, dx: -widget.x }
            : { delay: INTRO_FALL_SECONDS + INTRO_LOADING_SECONDS }),
        }) };
      }
      loadItems.push({ widget, el, animation });
    }
    const scroll = animationByType(widget, 'scroll');
    if (scroll) scrollItems.push({ widget, el, animation: scroll });
    if (widget.type === 'shots') {
      shotItems.push({ widget, el, surface });
      connectVector(widget, surface);
    }

    if (widget.wid === INTRO_TRIGGER) el.addEventListener('click', dismissIntro, { signal: controller.signal });
    if (widget.wid === INTRO_LABEL) el.addEventListener('click', dismissIntro, { signal: controller.signal });
    if (isFinalArrow) {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        onEnter?.('page01');
      }, { signal: controller.signal });
    }
  }

  function prepareScrollGroups() {
    const groups = new Map();
    for (const item of scrollItems) {
      if (item.widget.fixed_position) continue;
      const uuid = item.animation.UUID;
      if (!uuid) continue;
      const x1 = Number(item.widget.x || 0);
      const y1 = Number(item.widget.y || 0);
      const x2 = x1 + Number(item.widget.w || 0);
      const y2 = y1 + Number(item.widget.h || 0);
      const group = groups.get(uuid) || { items: [], x1, y1, x2, y2 };
      group.items.push(item);
      group.x1 = Math.min(group.x1, x1);
      group.y1 = Math.min(group.y1, y1);
      group.x2 = Math.max(group.x2, x2);
      group.y2 = Math.max(group.y2, y2);
      groups.set(uuid, group);
    }
    for (const group of groups.values()) {
      if (group.items.length < 2) continue;
      for (const item of group.items) {
        item.timelineWidget = {
          ...item.widget,
          x: group.x1,
          y: group.y1,
          w: group.x2 - group.x1,
          h: group.y2 - group.y1,
        };
      }
    }
  }

  function setupHoverTriggers() {
    for (const widget of widgets.values()) {
      const hover = animationByType(widget, 'hover');
      if (!hover?.trigger?.length) continue;
      const photo = elements.get(widget.wid);
      for (const triggerId of hover.trigger) {
        const trigger = elements.get(triggerId);
        if (!trigger || !photo) continue;
        trigger.classList.add('peep-main-interactive');
        trigger.addEventListener('pointerenter', () => { loadPhotographs(); photo.classList.add('is-visible'); }, { signal: controller.signal });
        trigger.addEventListener('pointerleave', () => photo.classList.remove('is-visible'), { signal: controller.signal });
      }
    }
  }

  function updateScale() {
    const rect = container.getBoundingClientRect();
    const width = rect.width || window.innerWidth || 1024;
    scale = width / 1024;
    root.style.setProperty('--pg-scale', String(scale));
    root.style.height = `${pageHeight * scale}px`;
  }

  function update() {
    raf = 0;
    if (destroyed || !root.isConnected) return;
    updateScale();
    const rect = root.getBoundingClientRect();
    const viewportHeight = scrollHost === window ? window.innerHeight : scrollHost.clientHeight;
    const viewportBaseHeight = viewportHeight / scale;
    const baseScroll = Math.max(0, -rect.top / scale);
    if (baseScroll >= 3200) loadPhotographs();
    root.dataset.planningInk = planningBounds && baseScroll + 22 >= planningBounds.top && baseScroll + 22 <= planningBounds.bottom ? 'black' : 'white';
    root.style.setProperty('--pg-base-vh', `${viewportBaseHeight}px`);
    root.style.setProperty('--pg-fixed-left', `${rect.left}px`);
    root.style.setProperty('--pg-fixed-top', `${Math.max(0, rect.top)}px`);
    fixed.style.visibility = rect.bottom > 0 && rect.top < viewportHeight ? 'visible' : 'hidden';

    for (const item of loadItems) {
      if (item.el.dataset.loadStarted) continue;
      const first = item.animation.steps?.[0] || {};
      if (item.widget.fixed_position || !first.startWhenInView) {
        startLoadAnimation(item.el, item.animation);
        continue;
      }
      const top = Number(item.widget.y || 0) - baseScroll;
      const bottom = top + Number(item.widget.h || 0);
      if (bottom >= 0 && top <= viewportBaseHeight) startLoadAnimation(item.el, item.animation);
    }

    for (const item of scrollItems) {
      const state = scrollState(item.animation, item.timelineWidget || item.widget, baseScroll, viewportBaseHeight, scale);
      item.el.style.transform = transformString(state);
      item.el.style.opacity = String(state.opacity);
    }

    for (const item of shotItems) {
      if (item.widget.playbackType !== 'scroll') continue;
      const p = shotProgress(item.widget, baseScroll, viewportBaseHeight);
      playerProgress.set(item.widget.wid, p);
      players.get(item.widget.wid)?.seek?.(p);
    }
  }

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(container);
  cleanups.push(() => resizeObserver.disconnect());
  window.addEventListener('resize', schedule, { signal: controller.signal });
  window.addEventListener('scroll', schedule, { passive: true, capture: true, signal: controller.signal });

  fetch(DATA_URL, { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${DATA_URL}: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (destroyed) return;
      pageHeight = data.pageHeight || 7629;
      const pageData = data.languages?.[selectedLanguage] || data.languages?.ko || data;
      const planningBackground = pageData.widgets.find(w => w.type === 'shape' && String(w.bg_color).toUpperCase() === '35CD7A' && !w.fixed_position);
      if (planningBackground) planningBounds = { top: planningBackground.y, bottom: planningBackground.y + planningBackground.h };
      [...pageData.widgets]
        .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
        .forEach(renderWidget);
      prepareScrollGroups();
      setupHoverTriggers();
      Promise.all(vectorJobs).then(() => { if (!destroyed) { ready = vectorErrors === 0; root.dataset.ready = String(ready); } });
      const label = elements.get(INTRO_LABEL)?.querySelector('svg');
      label?.animate?.([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }], {
        duration: 700,
        direction: 'alternate',
        iterations: Infinity,
        easing: 'ease-in-out',
      });
      schedule();
    })
    .catch((error) => {
      if (error?.name !== 'AbortError') { vectorErrors++; console.error('peep-group main failed to mount', error); }
    });

  schedule();

  return {
    stats() {
      return {
        renderer: 'native-svg', ready, vectorErrors,
        vectorScenes: players.size, vectorIllustrations: root.querySelectorAll('[data-artwork="svg"]').length,
        rasterPictures: root.querySelectorAll('img[data-photo-src]').length,
        originalArtwork: root.querySelectorAll('[data-artwork="original-artwork"]').length,
        canvases: root.querySelectorAll('canvas').length, videos: root.querySelectorAll('video').length,
        cuePlaying, introDismissed,
        scenes: shotItems.map(({widget,surface}) => ({ id: widget.wid, sequence: surface.dataset.sequence, frame: Number(surface.dataset.vectorFrame || 0), target: Number(surface.dataset.targetFrame || 0), source: surface.dataset.source })),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(cueRaf);
      controller.abort();
      if (raf) cancelAnimationFrame(raf);
      for (const player of players.values()) player?.destroy?.();
      for (const cleanup of cleanups) cleanup();
      root.remove();
    },
    scrollToTop() {
      if (scrollHost === window) window.scrollTo({ top: window.scrollY + root.getBoundingClientRect().top, behavior: 'auto' });
      else scrollHost.scrollTo({ top: scrollHost.scrollTop + root.getBoundingClientRect().top - scrollHost.getBoundingClientRect().top, behavior: 'auto' });
    },
  };
}
