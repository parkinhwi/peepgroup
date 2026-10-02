const NS = 'http://www.w3.org/2000/svg';
const DATA_URL = new URL('./assets/main-vectors/hero.json', import.meta.url);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function node(name, attrs = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function interpolate(keys, time) {
  if (!keys.length || time < keys[0][0]) return null;
  if (time >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1);

  let low = 0;
  let high = keys.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (keys[middle][0] <= time) low = middle;
    else high = middle;
  }

  const left = keys[low];
  const right = keys[high];
  const mix = (time - left[0]) / (right[0] - left[0]);
  const values = [];
  for (let index = 1; index < left.length; index++) {
    values.push(left[index] + (right[index] - left[index]) * mix);
  }
  return values;
}

function interpolateScalar(keys, time) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let index = 1; index < keys.length; index++) {
    const right = keys[index];
    if (time <= right[0]) {
      const left = keys[index - 1];
      const mix = (time - left[0]) / (right[0] - left[0]);
      return left[1] + (right[1] - left[1]) * mix;
    }
  }
  return keys[keys.length - 1][1];
}

export async function createHeroVector(host) {
  if (!(host instanceof Element)) throw new TypeError('createHeroVector(host) requires a DOM element');

  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Unable to load hero vector data (${response.status})`);
  const data = await response.json();

  const svg = node('svg', {
    viewBox: `0 0 ${data.size[0]} ${data.size[1]}`,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid slice',
    'aria-hidden': 'true',
    focusable: 'false'
  });
  svg.style.display = 'block';
  svg.style.overflow = 'hidden';

  svg.append(node('rect', {
    x: '0', y: '0', width: data.size[0], height: data.size[1], fill: data.palette.background
  }));

  const slabElements = data.slabs.map(slab => {
    const group = node('g');
    const points = slab.path.map(point => point.join(',')).join(' ');
    group.append(node('polygon', { points, fill: data.palette.yellow }));

    const lettering = node('path', {
      d: data.text.path,
      fill: data.palette.ink,
      'fill-rule': 'evenodd',
      transform: `translate(${data.text.offset[0]} ${data.text.offset[1]})`
    });
    group.append(lettering);
    svg.append(group);
    return { group, lettering, keys: slab.keys };
  });

  const circleElements = data.circles.map(circle => {
    const element = node('circle', { fill: data.palette.green });
    svg.append(element);
    return { element, keys: circle.keys };
  });

  host.replaceChildren(svg);
  let destroyed = false;
  let currentProgress = -1;

  function seek(progress) {
    if (destroyed) return;
    const nextProgress = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
    if (nextProgress === currentProgress) return;
    currentProgress = nextProgress;
    const time = nextProgress * (data.frames - 1);
    const sourceFrame = time + 1;
    const textOpacity = interpolateScalar(data.text.show, sourceFrame);

    for (const slab of slabElements) {
      const values = interpolate(slab.keys, time);
      if (!values) {
        slab.group.setAttribute('visibility', 'hidden');
        continue;
      }
      slab.group.removeAttribute('visibility');
      slab.group.setAttribute('transform', `translate(${values[0]} ${values[1]}) rotate(${values[2] / 10})`);
      slab.lettering.setAttribute('opacity', textOpacity);
    }

    for (const circle of circleElements) {
      const values = interpolate(circle.keys, time);
      if (!values) {
        circle.element.setAttribute('visibility', 'hidden');
        continue;
      }
      circle.element.removeAttribute('visibility');
      circle.element.setAttribute('cx', values[0]);
      circle.element.setAttribute('cy', values[1]);
      circle.element.setAttribute('r', values[2]);
    }
  }

  function frame(index) {
    seek(clamp(Number(index) || 0, 0, data.frames - 1) / (data.frames - 1));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    svg.remove();
  }

  seek(0);
  return { seek, frame, destroy, info: { frames: data.frames }, kind: 'svg' };
}
