const MODULE_URL = import.meta.url;
const DATA_URL = new URL('./assets/main-vectors/pile.json', MODULE_URL);
const NS = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function interpolate(keys, frame) {
  if (frame <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (frame >= last[0]) return last[1];
  let low = 0;
  let high = keys.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (keys[mid][0] <= frame) low = mid;
    else high = mid;
  }
  const a = keys[low];
  const b = keys[high];
  const amount = (frame - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * amount;
}

function appendGlyphs(group, object, color) {
  const [x, y] = object.glyph.origin;
  group.append(svgElement('path', {
    d: object.glyph.d,
    fill: color,
    'fill-rule': 'evenodd',
    transform: `translate(${x} ${y})`,
    'shape-rendering': 'geometricPrecision',
    'data-source-glyphs': object.id
  }));
}

function makeObject(object, palette) {
  const group = svgElement('g', { 'data-pile-object': object.id });
  if (object.kind === 'rect') {
    group.append(svgElement('rect', {
      x: -object.width / 2,
      y: -object.height / 2,
      width: object.width,
      height: object.height,
      fill: palette.yellow
    }));
    appendGlyphs(group, object, palette.ink);
  } else {
    group.append(
      svgElement('circle', { cx: -object.spread, cy: 0, r: object.radius, fill: palette.cloud }),
      svgElement('circle', { cx: object.spread, cy: 0, r: object.radius, fill: palette.cloud })
    );
    appendGlyphs(group, object, palette.orange);
  }
  return group;
}

export async function createPileVector(host) {
  if (!host || typeof host.append !== 'function') throw new TypeError('createPileVector(host) requires a DOM host element');
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Unable to load pile vector data (${response.status})`);
  const data = await response.json();

  const svg = svgElement('svg', {
    viewBox: data.viewBox.join(' '),
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid slice',
    role: 'img',
    'aria-label': 'Peep group graphic stickers falling and settling on a green field'
  });
  svg.style.display = 'block';
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'hidden';
  svg.style.pointerEvents = 'none';
  svg.style.background = data.palette.field;

  svg.append(svgElement('rect', { x: 0, y: 0, width: 2400, height: 5000, fill: data.palette.field }));

  const shifted = svgElement('g', { 'data-pile-settle-layer': '' });
  const rendered = data.objects.map((object) => {
    const node = makeObject(object, data.palette);
    shifted.append(node);
    return { object, node };
  });
  svg.append(shifted);
  host.append(svg);

  let destroyed = false;
  let currentFrame = 0;
  function render(frameValue) {
    if (destroyed) return;
    currentFrame = Math.max(0, Math.min(data.frames - 1, Number.isFinite(frameValue) ? frameValue : 0));
    const shift = interpolate(data.settleShift, currentFrame);
    shifted.setAttribute('transform', `translate(0 ${shift.toFixed(3)})`);
    for (const { object, node } of rendered) {
      const y = interpolate(object.track, currentFrame);
      node.setAttribute('transform', `translate(${object.x} ${y.toFixed(3)}) rotate(${object.angle})`);
    }
  }

  const api = {
    kind: 'svg',
    info: { frames: data.frames },
    seek(progress) {
      const value = Math.max(0, Math.min(1, Number(progress) || 0));
      render(value * (data.frames - 1));
      return api;
    },
    frame(index) {
      render(Number(index) || 0);
      return api;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      svg.remove();
    }
  };

  render(0);
  return api;
}
