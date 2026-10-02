import { createHeroVector } from './main-hero-vector.js';
import { createPileVector } from './main-pile-vector.js';
import { createWireVector, createCueVector } from './main-detail-vectors.js';

const registry = new Map([
  ['62a8e79f2fbc60001b684c9b', ['seq-00', createHeroVector]],
  ['62a8de6d3c08b6003ef2bd6a', ['seq-00', createHeroVector]],
  ['62a8e79f2fbc60001b684c9e', ['seq-01', createWireVector]],
  ['62a8de6d3c08b6003ef2bd6d', ['seq-01', createWireVector]],
  ['62a8e79f2fbc60001b684ca7', ['seq-02', createPileVector]],
  ['62a8de6d3c08b6003ef2bd77', ['seq-02', createPileVector]],
  ['633ab5d57c16f8002f2d15f1', ['seq-04', createCueVector]],
]);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

export async function createMainVector(host, widget) {
  const entry = registry.get(widget.wid);
  if (!entry) throw Error(`Unclassified main graphic ${widget.wid}`);
  const [key, create] = entry;
  const raw = await create(host);
  const count = widget.numberOfImages || raw.info.frames;
  const max = count - 1;
  let dead = false, timer = 0, previous = 0, lastTarget = null, lastCall = 0;
  host.dataset.sequence = key;
  host.dataset.source = 'live-svg';
  host.dataset.ready = 'true';
  function draw(index) {
    if (dead) return;
    previous = Math.max(0, Math.min(max, index));
    raw.seek(previous / Math.max(1, max));
    host.dataset.frame = String(Math.round(previous) + 1);
    host.dataset.vectorFrame = (previous + 1).toFixed(4);
    host.dispatchEvent(new CustomEvent('frame-ready', { detail: { sequence: key, frame: previous + 1, source: 'live-svg' } }));
  }
  function seek(value) {
    const target = clamp(value) * max;
    if (lastTarget !== null && Math.abs(target - lastTarget) < 1e-7) return;
    const now = performance.now();
    const elapsed = lastCall ? Math.max(1, now - lastCall) : Infinity;
    const distance = Math.min(Math.round(count * .05), 24, Math.round(Math.abs((lastTarget ?? target) - target) * count * 2 / (elapsed * elapsed)));
    lastCall = now;
    lastTarget = target;
    host.dataset.targetFrame = (target + 1).toFixed(4);
    cancelAnimationFrame(timer);
    timer = 0;
    const start = widget.playbackType === 'scroll' && widget.useEasing
      ? target - Math.sign(target - previous) * Math.min(distance, Math.abs(target - previous))
      : target;
    const remaining = target - start;
    draw(start);
    if (Math.abs(remaining) < 1e-7) return;
    const tick = time => {
      if (dead) return;
      const t = Math.min(1, (time - now) / 400);
      draw(start + remaining * (1 - Math.pow(1 - t, 3)));
      if (t < 1) timer = requestAnimationFrame(tick);
      else timer = 0;
    };
    timer = requestAnimationFrame(tick);
  }
  draw(0);
  return {
    kind: 'svg', info: { ...raw.info, key, frames: count }, seek,
    frame(index) { cancelAnimationFrame(timer); timer = 0; draw(index); },
    destroy() { dead = true; cancelAnimationFrame(timer); raw.destroy?.(); },
  };
}
