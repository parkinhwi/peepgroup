/* Native SVG geometry. Reference measurements are parameters, never image frames. */
const NS = 'http://www.w3.org/2000/svg';
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
function element(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function surface(host, width, height) {
  const svg = element('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
  svg.style.display = 'block';
  host.replaceChildren(svg);
  return svg;
}
let wireData;
export async function createWireVector(host) {
  wireData ||= fetch(new URL('./assets/main-vectors/wire.json', import.meta.url)).then(response => {
    if (!response.ok) throw Error(`Wire geometry: ${response.status}`);
    return response.json();
  });
  const data = await wireData;
  const svg = surface(host, data.width, data.height);
  svg.append(element('rect', { width: data.width, height: data.height, fill: '#000' }));
  const lines = data.lines.map(coords => {
    const line = element('line', { x1: coords[0], y1: coords[1], x2: coords[0], y2: coords[1], stroke: data.stroke, 'stroke-width': data.strokeWidth, 'stroke-linecap': 'butt' });
    svg.append(line);
    return line;
  });
  let dead = false;
  function seek(progress) {
    if (dead) return;
    const f = clamp(progress) * (data.frames - 1), a = Math.floor(f), b = Math.min(a + 1, data.frames - 1), t = f - a;
    data.lines.forEach(([x1, y1, x2, y2], index) => {
      const extent = data.tracks[a][index] + (data.tracks[b][index] - data.tracks[a][index]) * t;
      lines[index].setAttribute('x2', (x1 + (x2 - x1) * extent).toFixed(3));
      lines[index].setAttribute('y2', (y1 + (y2 - y1) * extent).toFixed(3));
    });
  }
  seek(0);
  return { kind: 'svg', info: { frames: data.frames, key: 'seq-01' }, seek, frame(index) { seek(index / (data.frames - 1)); }, destroy() { dead = true; svg.remove(); } };
}
export async function createCueVector(host) {
  const { cueShape, cueMotion } = await import('./assets/main-vectors/cue-shape.js');
  const svg = surface(host, 1770, 1000);
  const group = element('g');
  group.innerHTML = cueShape;
  svg.append(group);
  let dead = false;
  function seek(progress) {
    if (dead) return;
    const frame = clamp(progress) * (cueMotion.length - 1), a = Math.floor(frame), b = Math.min(a + 1, cueMotion.length - 1);
    const dy = cueMotion[a] + (cueMotion[b] - cueMotion[a]) * (frame - a);
    group.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
  }
  seek(0);
  return { kind: 'svg', info: { frames: cueMotion.length, key: 'seq-04' }, seek, frame(index) { seek(index / (cueMotion.length - 1)); }, destroy() { dead = true; svg.remove(); } };
}
