/* ===== CR7 · Seis capítulos — comportamiento =====
   1. Animación de portada: el niño aparece (SVG animado), patea el balón,
      el balón choca contra el muro y queda girando.
   2. Comparador antes/después, menú activo y aparición al hacer scroll. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = $('#stage'), boy = $('#boy'), ball = $('#ball'), spin = $('#ballSpin'),
        shadow = $('#ballShadow'), wall = $('#wall'), dust = $('#dust');
  let token = 0, anims = [], final = null;

  /* ---------- Entrada escalonada del SVG del niño ---------- */
  function playBoy() {
    const svg = $('svg', boy);
    let nodes = [svg], kids = [];
    for (let d = 0; d < 6; d++) {
      kids = nodes.flatMap((n) => [...n.children].filter((c) => /^(g|path|polygon|circle|ellipse|rect)$/.test(c.tagName)));
      if (kids.length >= 6) break;
      nodes = kids.filter((k) => k.tagName === 'g');
      if (!nodes.length) break;
    }
    const step = Math.min(0.03, 1.5 / Math.max(kids.length, 1));
    kids.forEach((k, i) => {
      k.classList.add('svg-item');
      if (!k.hasAttribute('transform')) k.classList.add('svg-item--tf');
      k.style.setProperty('--d', (i * step).toFixed(2) + 's');
    });
    boy.classList.add('svg-play');
    return kids.length * step * 1000 + 600;
  }

  /* ---------- Geometría del escenario ---------- */
  function metrics() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const sr = stage.getBoundingClientRect(), br = boy.getBoundingClientRect(), wr = wall.getBoundingClientRect();
    const size = br.height * (600 / 3470);          // lado de la caja del balón
    const r = size * (268 / 600);                    // radio visible del balón
    const start = { x: br.left - sr.left + br.width * 0.655, y: br.top - sr.top + br.height * 0.913 };
    const wallX = wr.left - sr.left;
    const groundY = H * 0.82 - r;                    // centro del balón apoyado en el pasto
    return { W, H, size, r, start, wallX, groundY };
  }
  const put = (el, x, y, size) => { el.style.width = el.style.height = size + 'px'; el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`; };
  function setShadow(m, x, y) {
    const lift = Math.max(0, (m.groundY - y) / m.H);
    const w = m.size * (0.95 - lift * 1.2);
    shadow.style.width = Math.max(w, m.size * 0.3) + 'px';
    shadow.style.height = Math.max(w, m.size * 0.3) * 0.22 + 'px';
    shadow.style.transform = `translate(${x - parseFloat(shadow.style.width) / 2}px, ${m.groundY + m.r * 0.85}px)`;
    shadow.style.opacity = 1 - lift * 1.5;
  }

  /* ---------- Trayectoria del balón (cuadros de animación) ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  function path(m) {
    const P = [];
    const xi = m.wallX - m.r, yi = m.H * 0.5;
    const x1 = xi - m.W * 0.17, x2 = x1 - m.W * 0.1, x3 = x2 - m.W * 0.04;
    const segs = [
      { dur: 900, f: (t) => ({ x: lerp(m.start.x, xi, t), y: lerp(m.start.y, yi, t) - 4 * m.H * 0.13 * t * (1 - t) }) },   // vuelo
      { dur: 650, f: (t) => ({ x: lerp(xi, x1, t), y: lerp(yi, m.groundY, t * t) }) },                                       // rebote en el muro y caída
      { dur: 600, f: (t) => ({ x: lerp(x1, x2, t), y: m.groundY - 4 * m.H * 0.15 * t * (1 - t) }) },                          // pique
      { dur: 550, f: (t) => ({ x: lerp(x2, x3, 1 - (1 - t) * (1 - t)), y: m.groundY }) },                                    // se frena
    ];
    const total = segs.reduce((a, s) => a + s.dur, 0);
    let acc = 0;
    segs.forEach((s, si) => {
      const n = 14;
      for (let i = si ? 1 : 0; i <= n; i++) { const p = s.f(i / n); P.push({ t: (acc + s.dur * i / n) / total, ...p }); }
      acc += s.dur;
    });
    return { P, total, flight: segs[0].dur, final: { x: x3, y: m.groundY }, xi, yi };
  }

  function burst(m, x, y) {
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('i');
      const s = m.size * (0.12 + Math.random() * 0.14);
      d.style.cssText = `width:${s}px;height:${s}px;left:${x - s / 2}px;top:${y - s / 2}px`;
      dust.appendChild(d);
      const a = Math.PI * (0.55 + Math.random() * 0.9), v = m.size * (0.7 + Math.random() * 1.1);
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${-Math.sin(a) * v * 0.9 + m.size * 0.5}px) scale(.2)`, opacity: 0 }],
        { duration: 650 + Math.random() * 250, easing: 'ease-out', fill: 'forwards' }).onfinish = () => d.remove();
    }
  }

  /* ---------- Secuencia ---------- */
  function reset() {
    anims.forEach((a) => a.cancel()); anims = [];
    ball.classList.remove('is-spinning', 'is-pop'); ball.style.opacity = 0; shadow.style.opacity = 0;
    wall.classList.remove('is-hit', 'has-crack'); dust.innerHTML = ''; final = null;
  }

  async function shoot(first) {
    const my = ++token;
    reset();
    const m = metrics();
    put(ball, m.start.x, m.start.y, m.size); setShadow(m, m.start.x, m.groundY);
    if (first) {
      wall.classList.add('is-rising');
      await sleep(playBoy());
      if (my !== token) return;
    }
    // el balón aparece en el pie y el niño patea
    ball.classList.add('is-pop'); shadow.style.opacity = 1;
    await sleep(450); if (my !== token) return;
    boy.classList.remove('is-kick'); void boy.offsetWidth; boy.classList.add('is-kick');
    await sleep(160); if (my !== token) return;

    const pth = path(m);
    const pos = ball.animate(pth.P.map((p) => ({ offset: p.t, transform: `translate(${p.x - m.size / 2}px, ${p.y - m.size / 2}px)` })), { duration: pth.total, fill: 'forwards', easing: 'linear' });
    const f = pth.flight / pth.total;
    const rot = spin.animate([{ transform: 'rotate(0deg)' }, { offset: f, transform: 'rotate(720deg)' }, { transform: 'rotate(0deg)' }], { duration: pth.total, fill: 'forwards', easing: 'linear' });
    const shd = shadow.animate(pth.P.map((p) => {
      const lift = Math.max(0, (m.groundY - p.y) / m.H), w = Math.max(m.size * (0.95 - lift * 1.2), m.size * 0.3);
      return { offset: p.t, opacity: Math.max(1 - lift * 1.5, 0.15), transform: `translate(${p.x - w / 2}px, ${m.groundY + m.r * 0.85}px)`, width: w + 'px', height: w * 0.22 + 'px' };
    }), { duration: pth.total, fill: 'forwards', easing: 'linear' });
    anims.push(pos, rot, shd);

    await sleep(pth.flight); if (my !== token) return;
    // IMPACTO
    wall.classList.add('is-hit', 'has-crack');
    burst(m, pth.xi + m.r * 0.4, pth.yi);
    ball.animate([{ scale: '1 1' }, { scale: '.8 1.2', offset: .35 }, { scale: '1 1' }], { duration: 260 });

    await sleep(pth.total - pth.flight); if (my !== token) return;
    // queda girando
    final = pth.final;
    put(ball, final.x, final.y, m.size);
    anims.forEach((a) => { try { a.commitStyles(); } catch (e) { /* ok */ } a.cancel(); });
    anims = [];
    setShadow(m, final.x, final.y); shadow.style.opacity = 1;
    ball.classList.add('is-spinning');
  }

  function staticEnd() {   // movimiento reducido: estado final sin animar
    playBoy(); $$('.svg-item', boy).forEach((k) => { k.style.opacity = 1; k.style.transform = 'none'; });
    const m = metrics(), p = path(m);
    final = p.final; put(ball, final.x, final.y, m.size); ball.style.opacity = 1; setShadow(m, final.x, final.y);
    wall.classList.add('has-crack');
  }

  addEventListener('resize', () => {
    if (!final) return;
    const m = metrics(), p = path(m);
    final = p.final; put(ball, final.x, final.y, m.size); setShadow(m, final.x, final.y);
  });
  $('#replay').addEventListener('click', () => shoot(false));
  ball.addEventListener('click', () => { if (final) shoot(false); });

  /* ---------- Comparador antes / después ---------- */
  $$('.cmp__box').forEach((box) => {
    const range = $('.cmp__range', box);
    const set = () => box.style.setProperty('--pos', range.value + '%');
    range.addEventListener('input', set); set();
  });

  /* ---------- Menú activo + aparición ---------- */
  const links = $$('.top a[data-n]');
  $$('.ch').forEach((ch) => new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.dataset.n === ch.dataset.n));
  }), { rootMargin: '-40% 0px -55% 0px' }).observe(ch));
  const rv = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); rv.unobserve(e.target); } }), { threshold: 0.15 });
  $$('.reveal').forEach((el) => rv.observe(el));

  /* ---------- Inicio ---------- */
  if (reduce) staticEnd(); else shoot(true);
})();
