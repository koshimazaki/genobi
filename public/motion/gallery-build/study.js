import { generate } from '../construction/ui-generation.js';
import { performance, requestAnimationFrame, cancelAnimationFrame } from '../construction/clock.js';

const capture = new URLSearchParams(location.search).has('capture');
const gallery = document.querySelector('.gallery');
const videos = [...document.querySelectorAll('video')];
const next = document.querySelector('#next');
const output = document.querySelector('#frame');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let run, raf, started = 0, frame = 0, clock;
await document.fonts.ready;
await Promise.all(videos.map(v => v.readyState >= 2 ? Promise.resolve() : new Promise(resolve => {
  v.addEventListener('loadeddata', resolve, { once: true });
  v.addEventListener('error', resolve, { once: true });
})));
if (capture) {
  document.body.dataset.capture = '';
  clock = (await import('../construction/clock.js')).installClock();
  next.hidden = false;
}
function decorate(ms) {
  const phase = ms < 1900 ? [1, 'MEASURE THE POSSIBILITY'] : ms < 4300 ? [2, 'TRACE EVERY DETAIL'] : ms < 6600 ? [3, 'COMPILE INTO MOTION'] : [4, 'READY TO MAKE YOUR OWN'];
  document.querySelector('#phase-number').textContent = String(phase[0]).padStart(2, '0');
  document.querySelector('#phase-label').textContent = phase[1];
  document.querySelector('#timecode').textContent = `00:${String(Math.floor(ms / 1000)).padStart(2, '0')}:${String(Math.floor(ms % 1000 * .03)).padStart(2, '0')}`;
  document.body.style.setProperty('--progress', `${Math.min(100, ms / 100)}%`);
  // Local, brief signal breaks layered over the upstream drawing/reveal.
  const pulse = !reduced.matches && [1550, 2980, 4470, 5280, 6740].some(t => ms >= t && ms < t + 135);
  document.body.style.setProperty('--glitch', pulse ? '.8' : '0');
  document.body.style.setProperty('--shift', `${Math.sin(ms * .19) * 22}px`);
}
function tick(now) {
  const elapsed = now - started;
  decorate(elapsed);
  if (elapsed < 10000) raf = requestAnimationFrame(tick);
  else videos.forEach(v => v.pause());
}
function start() {
  run?.cancel(); cancelAnimationFrame(raf); frame = 0;
  videos.forEach(v => { v.currentTime = 0; if (!capture && !reduced.matches) v.play().catch(() => {}); });
  started = performance.now();
  if (!reduced.matches) run = generate(gallery, {
    mode: 'skeleton-texts', duration: 5600, delay: 400, maxParts: 60,
    title: 'genobi-gallery',
    steps: ['Mapping the gallery', 'Tracing the composition', 'Writing the visual language', 'Bringing the story to life'],
    done: 'Ready to make your own',
  });
  decorate(0); raf = requestAnimationFrame(tick);
  output.textContent = capture ? 'Frame 0' : '';
}
next.addEventListener('click', async () => {
  next.disabled = true;
  frame += 1;
  await Promise.all(videos.map(v => new Promise(resolve => {
    const time = frame / 30;
    if (Math.abs(v.currentTime - time) < .001 || v.error) return resolve();
    v.addEventListener('seeked', resolve, { once: true }); v.currentTime = time;
  })));
  clock.advance(1000 / 30);
  output.textContent = `Frame ${frame}`; next.disabled = false;
});
document.querySelector('#replay').addEventListener('click', start);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !capture) { run?.cancel(); cancelAnimationFrame(raf); videos.forEach(v => v.pause()); }
});
reduced.addEventListener('change', start);
window.addEventListener('pagehide', () => { run?.cancel(); cancelAnimationFrame(raf); videos.forEach(v => v.pause()); });
start();
