/* ==========================================================================
   Focus Battery — site script (shared by all pages, no dependencies)
   Everything below checks whether its elements exist, so the same file works
   on the homepage and on the legal/contact pages.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ── Navigation ─────────────────────────────────────────────────────── */
  var nav = $('#nav');
  if (nav) {
    var lightZones = $$('[data-nav-light]');
    var onNavScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 12);
      var y = nav.offsetHeight / 2, onLight = false;
      lightZones.forEach(function (z) { var r = z.getBoundingClientRect(); if (r.top <= y && r.bottom >= y) onLight = true; });
      nav.classList.toggle('on-light', onLight);
    };
    onNavScroll();
    window.addEventListener('scroll', onNavScroll, { passive: true });

    var toggle = $('.nav-toggle', nav);
    var setOpen = function (open) {
      nav.classList.toggle('open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      }
    };
    if (toggle) toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    $$('.nav-links a', nav).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  /* ── Reveal on scroll + "in view" hooks ─────────────────────────────── */
  var inViewHandlers = [];
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      inViewHandlers.forEach(function (h) { if (h.el === e.target) h.fn(); });
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }) : null;

  function whenVisible(node, fn) {
    if (!node) return;
    if (!io) { node.classList.add('in'); if (fn) fn(); return; }
    if (fn) inViewHandlers.push({ el: node, fn: fn });
    io.observe(node);
  }
  $$('.reveal').forEach(function (n) { whenVisible(n); });

  /* ── Count-up numbers ───────────────────────────────────────────────── */
  function countUp(node) {
    var target = parseFloat(node.getAttribute('data-count'));
    if (reduce || isNaN(target)) { node.textContent = target; return; }
    var start = null, dur = 1600;
    node.textContent = '0';
    function step(t) {
      if (!start) start = t;
      var k = clamp((t - start) / dur, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(target * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  $$('[data-count]').forEach(function (n) {
    var host = n.closest('.core-phone') ? null : n;
    if (host) whenVisible(host, function () { countUp(n); });
  });

  /* ==========================================================================
     Chart helpers
     ========================================================================== */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function stepPath(values, x0, x1, yOf) {
    var n = values.length, w = (x1 - x0) / n, d = '';
    values.forEach(function (v, i) {
      var y = yOf(v).toFixed(1), xa = (x0 + i * w).toFixed(1), xb = (x0 + (i + 1) * w).toFixed(1);
      d += (i === 0 ? 'M' + xa + ' ' + y : ' V' + y) + ' H' + xb;
    });
    return d;
  }
  function setLen(path) {
    try { path.style.setProperty('--len', Math.ceil(path.getTotalLength()) + 1); } catch (e) { /* ignore */ }
  }
  function gradient(defs, id, stops, vertical) {
    var g = el('linearGradient', { id: id, x1: 0, x2: vertical ? 0 : 1, y1: 0, y2: vertical ? 1 : 0 }, defs);
    stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] == null ? 1 : s[2] }, g); });
    return g;
  }
  var uid = 0;

  // Hourly focus forecast, 7 AM → 12 AM (17 steps), shaped like the app's chart
  var FORECAST = [0.24, 0.22, 0.3, 0.44, 0.52, 0.56, 0.48, 0.42, 0.5, 0.7, 0.78, 0.74, 0.62, 0.5, 0.42, 0.46, 0.4];

  /* Focus forecast (stepped blue line, focus window, "Now" marker) */
  function drawForecast(svg) {
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
    var top = 30, bottom = 6, left = 4, right = W - 4;
    var yOf = function (v) { return top + (1 - v) * (H - top - bottom); };
    var n = FORECAST.length, stepW = (right - left) / n;
    var id = 'fc' + (++uid);
    var defs = el('defs', {}, svg);
    gradient(defs, id + 'l', [[0, '#3B82F6'], [1, '#4CBAFF']]);

    [0.33, 0.66].forEach(function (f) {
      el('line', { x1: left, x2: right, y1: top + f * (H - top - bottom), y2: top + f * (H - top - bottom), stroke: 'rgba(255,255,255,.08)', 'stroke-dasharray': '3 5' }, svg);
    });

    var win = (svg.getAttribute('data-window') || '').split(',').map(Number);
    if (win.length === 2) {
      var wx = left + win[0] * stepW, ww = (win[1] - win[0] + 1) * stepW;
      var wg = el('g', { class: 'fc-window' }, svg);
      el('rect', { x: wx, y: top - 8, width: ww, height: H - top - bottom + 8, rx: 6, fill: 'rgba(76,186,255,.13)' }, wg);
      el('rect', { x: wx, y: top - 8, width: ww, height: 2, rx: 1, fill: '#4CBAFF' }, wg);
    }

    var line = el('path', { d: stepPath(FORECAST, left, right, yOf), fill: 'none', stroke: 'url(#' + id + 'l)', 'stroke-width': 2.4, 'stroke-linejoin': 'round', class: 'draw' }, svg);
    setLen(line);

    var now = parseFloat(svg.getAttribute('data-now'));
    if (!isNaN(now)) {
      var nx = left + now * stepW, ny = yOf(FORECAST[Math.floor(now)]);
      el('line', { x1: nx, x2: nx, y1: 20, y2: H - bottom, stroke: '#FB923C', 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, svg);
      el('circle', { cx: nx, cy: ny, r: 3.6, fill: '#fff', stroke: '#FB923C', 'stroke-width': 2 }, svg);
      var pill = el('g', { class: 'now-pill' }, svg);
      el('rect', { x: nx - 16, y: 4, width: 32, height: 16, rx: 8, fill: '#FB923C' }, pill);
      var t = el('text', { x: nx, y: 15.5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 9, 'font-weight': 600, 'font-family': 'DM Sans, sans-serif' }, pill);
      t.textContent = 'Now';
    }
  }

  /* Focus battery (gradient curve draining through the day) */
  function drawBattery(svg) {
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
    var now = parseFloat(svg.getAttribute('data-now')) || 0.55;
    var end = parseFloat(svg.getAttribute('data-end')) || 60;
    var top = 8, bottom = 6, left = 4, right = W - 6;
    var yOf = function (v) { return top + (1 - v / 100) * (H - top - bottom); };
    var xOf = function (t) { return left + t * (right - left); };
    var id = 'bt' + (++uid);
    var defs = el('defs', {}, svg);
    gradient(defs, id + 'l', [[0, '#FF6B35'], [0.3, '#FF4D9E'], [0.65, '#B84DFF'], [1, '#4DBAFF']]);
    gradient(defs, id + 'f', [[0, '#B84DFF', 0.32], [1, '#B84DFF', 0]], true);

    var pts = [];
    for (var i = 0; i <= 24; i++) {
      var t = (i / 24) * now;
      var k = t / now;
      var v = 100 - (100 - end) * Math.pow(k, 1.15) + Math.sin(k * 9) * 2.2 * (1 - k);
      pts.push([xOf(t), yOf(v)]);
    }
    pts[pts.length - 1] = [xOf(now), yOf(end)];
    var d = smoothPath(pts);
    el('path', { d: d + ' L' + xOf(now) + ' ' + (H - bottom) + ' L' + xOf(0) + ' ' + (H - bottom) + 'Z', fill: 'url(#' + id + 'f)' }, svg);
    var line = el('path', { d: d, fill: 'none', stroke: 'url(#' + id + 'l)', 'stroke-width': 2.6, 'stroke-linecap': 'round', class: 'draw' }, svg);
    setLen(line);
    var proj = el('path', { d: 'M' + xOf(now) + ' ' + yOf(end) + ' Q' + xOf((now + 1) / 2) + ' ' + yOf(end - (end - 18) * 0.35) + ' ' + xOf(1) + ' ' + yOf(18), fill: 'none', stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1.6, 'stroke-dasharray': '3 4' }, svg);
    proj.setAttribute('class', 'proj');
    el('circle', { cx: xOf(now), cy: yOf(end), r: 7, fill: 'rgba(139,92,246,.3)' }, svg);
    el('circle', { cx: xOf(now), cy: yOf(end), r: 3.8, fill: '#fff', stroke: '#8B5CF6', 'stroke-width': 2 }, svg);
  }

  /* Small forecast used on the "Focus Forecast" card */
  function drawMiniForecast(svg) {
    var W = 220, H = 70, top = 8, bottom = 6;
    var yOf = function (v) { return top + (1 - v) * (H - top - bottom); };
    var vals = FORECAST.slice(0, 16), stepW = W / vals.length;
    el('rect', { x: 9 * stepW, y: 0, width: 3 * stepW, height: H, rx: 6, fill: 'rgba(76,186,255,.12)' }, svg);
    var p = el('path', { d: stepPath(vals, 0, W, yOf), fill: 'none', stroke: '#4CBAFF', 'stroke-width': 2.4, class: 'draw' }, svg);
    setLen(p);
  }

  /* Forecast vs battery: "peak focus doesn't mean unlimited energy" */
  function drawDual(g) {
    var X0 = 40, X1 = 620, Y0 = 30, Y1 = 250;
    var xOfH = function (h) { return X0 + (h - 7) / 15 * (X1 - X0); };
    var yOf = function (v) { return Y1 - v * (Y1 - Y0); };
    var fc = [0.3, 0.42, 0.55, 0.66, 0.62, 0.52, 0.44, 0.4, 0.55, 0.78, 0.86, 0.82, 0.62, 0.45, 0.32, 0.25];
    var bt = [1, 0.95, 0.88, 0.8, 0.74, 0.67, 0.62, 0.57, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.21, 0.18];
    var fpts = fc.map(function (v, i) { return [xOfH(7 + i), yOf(v)]; });
    var bpts = bt.map(function (v, i) { return [xOfH(7 + i), yOf(v)]; });
    var bd = smoothPath(bpts);
    el('path', { d: bd + ' L' + X1 + ' ' + Y1 + ' L' + X0 + ' ' + Y1 + 'Z', fill: 'url(#g-batt-fill)' }, g);
    var b = el('path', { d: bd, fill: 'none', stroke: 'url(#g-batt)', 'stroke-width': 4, 'stroke-linecap': 'round', class: 'draw' }, g);
    var f = el('path', { d: smoothPath(fpts), fill: 'none', stroke: '#4CBAFF', 'stroke-width': 4, 'stroke-linecap': 'round', class: 'draw' }, g);
    setLen(b); setLen(f);
    f.style.transitionDelay = '.35s';

    // annotations inside the peak window
    var hx = xOfH(17.5);
    function tag(y, label, color) {
      var tg = el('g', { class: 'dual-tag' }, g);
      el('circle', { cx: hx, cy: y, r: 6, fill: '#fff', stroke: color, 'stroke-width': 3 }, tg);
      el('rect', { x: hx + 12, y: y - 14, width: label.length * 7.2 + 18, height: 28, rx: 14 }, tg);
      var t = el('text', { x: hx + 21, y: y + 4.5 }, tg);
      t.textContent = label;
    }
    var fy = yOf(0.84), by = yOf(0.375);
    tag(fy, 'Focus: High', '#4CBAFF');
    tag(by, 'Battery: 38%', '#E65DFE');
  }

  /* Boosted focus (medication effect over a dashed baseline) */
  function drawBoost(svg) {
    var W = 280, H = 120, top = 18, bottom = 6;
    var yOf = function (v) { return top + (1 - v) * (H - top - bottom); };
    var base = [0.28, 0.3, 0.34, 0.4, 0.46, 0.5, 0.48, 0.45, 0.42, 0.4, 0.38, 0.42, 0.48, 0.52, 0.55, 0.52, 0.48, 0.46, 0.42, 0.4, 0.38, 0.36, 0.34, 0.32];
    // dose at 8:30 (index 3 in half-hours from 7:00), onset → plateau → decline
    var boost = base.map(function (v, i) {
      var t = i - 3, lvl;
      if (t < 0) lvl = 0;
      else if (t < 2) lvl = 0.84 * (1 - Math.pow(1 - t / 2, 2));
      else if (t < 7) lvl = 0.84 - (t - 2) * 0.012;
      else if (t < 10) lvl = 0.78 * (1 - Math.pow((t - 7) / 3, 2));
      else lvl = 0;
      return Math.max(v, lvl);
    });
    var stepW = W / base.length;
    el('rect', { x: 3 * stepW, y: 8, width: 8 * stepW, height: H - 14, rx: 6, fill: 'rgba(20,184,166,.12)' }, svg);
    el('path', { d: stepPath(base, 0, W, yOf), fill: 'none', stroke: '#4CBAFF', 'stroke-width': 1.6, 'stroke-dasharray': '4 4', opacity: 0.6 }, svg);
    var p = el('path', { d: stepPath(boost, 0, W, yOf), fill: 'none', stroke: '#14B8A6', 'stroke-width': 2.6, class: 'draw' }, svg);
    setLen(p);
    var mx = 3 * stepW;
    el('line', { x1: mx, x2: mx, y1: 8, y2: H - bottom, stroke: '#14B8A6', 'stroke-width': 1.4, 'stroke-dasharray': '2 5' }, svg);
    var pill = el('text', { x: mx, y: 8, 'text-anchor': 'middle', 'font-size': 13 }, svg);
    pill.textContent = '💊';
  }

  /* Journal — single day battery curve */
  function drawJournalDay(svg) {
    var W = 280, H = 120;
    var defs = el('defs', {}, svg);
    gradient(defs, 'jd-l', [[0, '#FF6B35'], [0.3, '#FF4D9E'], [0.65, '#B84DFF'], [1, '#4DBAFF']]);
    gradient(defs, 'jd-f', [[0, '#B84DFF', 0.3], [1, '#B84DFF', 0]], true);
    var vals = [96, 94, 90, 85, 80, 77, 72, 70, 68, 63, 58, 52, 47, 40, 34, 28];
    var pts = vals.map(function (v, i) { return [i / (vals.length - 1) * W, 8 + (1 - v / 100) * (H - 14)]; });
    var d = smoothPath(pts);
    el('path', { d: d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z', fill: 'url(#jd-f)' }, svg);
    el('path', { d: d, fill: 'none', stroke: 'url(#jd-l)', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, svg);
  }

  var drawers = {
    'forecast': drawForecast, 'battery': drawBattery, 'mini-forecast': drawMiniForecast,
    'dual': drawDual, 'boost': drawBoost, 'journal-day': drawJournalDay
  };
  $$('[data-chart]').forEach(function (svg) {
    var fn = drawers[svg.getAttribute('data-chart')];
    if (!fn) return;
    fn(svg);
    if (svg.closest('.hero')) return;
    else whenVisible(svg);
  });

  /* ── Hero: draw charts after the intro, optional video, pointer tilt ── */
  var heroEl = $('.hero');
  if (heroEl) setTimeout(function () { heroEl.classList.add('in'); }, 900);

  $$('[data-video-phone]').forEach(function (phone) {
    var v = $('video', phone);
    if (v && v.querySelector('source')) {
      phone.classList.add('has-video');
      if (reduce) { v.removeAttribute('autoplay'); v.pause(); }
      else { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
    }
  });

  var stage = $('[data-tilt]');
  if (stage && finePointer && !reduce) {
    var hero = stage.closest('.hero');
    var frags = $$('.frag', stage);
    setTimeout(function () { stage.classList.add('tilted'); }, 1700);
    hero.addEventListener('pointermove', function (e) {
      if (!stage.classList.contains('tilted')) return;
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--tilt', 'rotateY(' + (-16 + x * 14).toFixed(2) + 'deg) rotateX(' + (8 - y * 10).toFixed(2) + 'deg) rotateZ(3deg)');
      frags.forEach(function (f) {
        var d = parseFloat(f.getAttribute('data-depth')) || 1;
        f.style.setProperty('--px', (x * 26 * d).toFixed(1) + 'px');
        f.style.setProperty('--py', (y * 20 * d).toFixed(1) + 'px');
      });
    });
    hero.addEventListener('pointerleave', function () {
      stage.style.removeProperty('--tilt');
      frags.forEach(function (f) { f.style.removeProperty('--px'); f.style.removeProperty('--py'); });
    });
  }

  /* ==========================================================================
     Scroll-linked scenes (one rAF loop for all)
     ========================================================================== */
  var scenes = [];
  var ticking = false;
  function runScenes() { ticking = false; scenes.forEach(function (s) { s(); }); }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(runScenes); } }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);

  /* 03 — Rhythm curve drawn edge-to-edge as you scroll */
  var reframe = $('.reframe');
  if (reframe) {
    var rsvg = $('#rhythm-svg'), rline = $('#rhythm-line'), rghost = $('#rhythm-ghost'), rfill = $('#rhythm-fill');
    var rdot = $('#rhythm-dot'), rhalo = $('#rhythm-dot-halo'), rclip = $('#clip-rhythm-rect'), rgrid = $('#rhythm-grid');
    var phases = $$('.phase', reframe);
    var rLen = 0, rW = 0, rH = 0;
    var curve = function (t) {
      return 0.14 + 0.72 * Math.exp(-Math.pow((t - 0.3) / 0.13, 2)) + 0.24 * Math.exp(-Math.pow((t - 0.72) / 0.09, 2)) - 0.04 * t;
    };
    var buildRhythm = function () {
      var w = Math.round(rsvg.clientWidth) || 1440, h = Math.round(rsvg.clientHeight) || 300;
      if (w === rW && h === rH) return;
      rW = w; rH = h;
      rsvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var pad = 22, pts = [];
      for (var i = 0; i <= 140; i++) {
        var t = i / 140;
        pts.push([14 + t * (w - 28), pad + (1 - curve(t)) * (h - pad * 2)]);
      }
      var d = smoothPath(pts);
      rline.setAttribute('d', d); rghost.setAttribute('d', d);
      rfill.setAttribute('d', d + ' L' + w + ' ' + h + ' L0 ' + h + 'Z');
      rgrid.innerHTML = '';
      [0.25, 0.5, 0.75].forEach(function (f) { el('line', { x1: 0, x2: w, y1: h * f, y2: h * f }, rgrid); });
      rLen = rline.getTotalLength();
      rline.style.strokeDasharray = rLen;
      phases.forEach(function (p) {
        p.style.setProperty('--x', (parseFloat(p.getAttribute('data-at')) * 100) + '%');
      });
    };
    var rhythmScene = function () {
      buildRhythm();
      var r = reframe.getBoundingClientRect();
      var total = reframe.offsetHeight - window.innerHeight;
      var p = reduce || total <= 0 ? 1 : clamp(-r.top / total, 0, 1);
      var k = reduce ? 1 : clamp((p - 0.04) / 0.86, 0, 1);
      rline.style.strokeDashoffset = (rLen * (1 - k)).toFixed(1);
      var pt = rline.getPointAtLength(rLen * k);
      rdot.setAttribute('cx', pt.x); rdot.setAttribute('cy', pt.y);
      rhalo.setAttribute('cx', pt.x); rhalo.setAttribute('cy', pt.y);
      rclip.setAttribute('width', pt.x);
      var tNow = (pt.x - 14) / (rW - 28), current = -1;
      phases.forEach(function (ph, i) {
        var on = tNow >= parseFloat(ph.getAttribute('data-at')) - 0.06 || k >= 1;
        ph.classList.toggle('active', on);
        if (on) current = i;
      });
      phases.forEach(function (ph, i) { ph.classList.toggle('current', i === current); });
    };
    scenes.push(rhythmScene);
  }

  /* 04 — Sticky phone switches between Forecast → Window → Battery */
  var corePhone = $('.core-phone');
  if (corePhone) {
    var steps = $$('.core-step');
    var coreCounted = false;
    var coreScene = function () {
      var mobile = window.innerWidth <= 900;
      var line = window.innerHeight * (mobile ? 0.74 : 0.5);
      var best = 0, bestDist = Infinity;
      steps.forEach(function (s, i) {
        var r = s.getBoundingClientRect();
        var probe = mobile ? r.top + 40 : r.top + r.height / 2;
        var dist = Math.abs(probe - line);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      steps.forEach(function (s, i) { s.classList.toggle('active', i === best); });
      if (corePhone.getAttribute('data-state') !== String(best)) {
        corePhone.setAttribute('data-state', best);
        if (best === 2 && !coreCounted) {
          coreCounted = true;
          $$('[data-count]', corePhone).forEach(countUp);
        }
      }
    };
    scenes.push(coreScene);
  }

  /* 06 — Collage parallax */
  var collage = $('.collage');
  if (collage && !reduce) {
    var panels = $$('.panel', collage);
    scenes.push(function () {
      var r = collage.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var off = (r.top + r.height / 2 - window.innerHeight / 2);
      panels.forEach(function (p) {
        var d = parseFloat(p.getAttribute('data-depth')) || 1;
        p.style.setProperty('--py', (off * -0.08 * d).toFixed(1) + 'px');
      });
    });
  }

  /* 07 — Focus Session timer ring follows scroll */
  var timerFill = $('#timer-fill'), timerDigits = $('#timer-digits');
  if (timerFill && timerDigits) {
    var sessionEl = $('.session');
    var timerScene = function () {
      var r = sessionEl.getBoundingClientRect();
      var p = reduce ? 0.3 : clamp((window.innerHeight - r.top) / (window.innerHeight + r.height), 0, 1);
      var left = 25 * 60 * (1 - p * 0.7);
      timerFill.style.setProperty('--tv', (100 * left / 1500).toFixed(2));
      var m = Math.floor(left / 60), s = Math.floor(left % 60);
      timerDigits.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    };
    scenes.push(timerScene);
  }

  requestTick();

  /* ── 06 — Shape items light up matching panels; focus test loop ─────── */
  var shapeItems = $$('.shape-item');
  if (shapeItems.length && collage) {
    var order = ['sleep', 'med', 'test'];
    var idx = 0, hovering = false, cycle = null;
    var light = function (key) {
      shapeItems.forEach(function (it) { it.classList.toggle('lit', it.getAttribute('data-panel') === key); });
      $$('.panel', collage).forEach(function (p) { p.classList.toggle('lit', p.getAttribute('data-panel-id') === key); });
    };
    shapeItems.forEach(function (it) {
      it.addEventListener('mouseenter', function () { hovering = true; light(it.getAttribute('data-panel')); });
      it.addEventListener('mouseleave', function () { hovering = false; });
    });
    whenVisible(collage, function () {
      light(order[0]);
      if (reduce) return;
      cycle = setInterval(function () {
        if (hovering || doc.hidden) return;
        idx = (idx + 1) % order.length;
        light(order[idx]);
      }, 3400);
    });

    var testPanel = $('.panel-test');
    if (testPanel && !reduce) {
      var circle = $('.test-circle', testPanel), scoreEl = $('[data-test-score]', testPanel), rtEl = $('[data-test-rt]', testPanel);
      var prog = $('.test-progress i', testPanel);
      var round = 0, score = 9;
      var tickTest = function () {
        if (doc.hidden) return;
        round++;
        if (round > 9) {
          testPanel.classList.add('show-results');
          if (round > 13) { round = 0; score = 9; testPanel.classList.remove('show-results'); }
          return;
        }
        var red = round % 4 === 3;
        circle.style.setProperty('--tc', red ? '#EF4444' : '#16F07F');
        circle.style.setProperty('--x', (8 + Math.random() * 46).toFixed(0) + '%');
        circle.style.setProperty('--y', (4 + Math.random() * 44).toFixed(0) + '%');
        circle.style.setProperty('--ts', '0.6');
        requestAnimationFrame(function () { requestAnimationFrame(function () { circle.style.setProperty('--ts', '1'); }); });
        if (!red) score++;
        scoreEl.textContent = score;
        rtEl.textContent = 240 + Math.round(Math.random() * 90);
        prog.style.setProperty('--tp', (round / 9 * 100).toFixed(0) + '%');
      };
      whenVisible(testPanel.closest('.collage'), function () { setInterval(tickTest, 900); });
    }
  }

  /* ── 08 — Journal: Day / Week / Month ───────────────────────────────── */
  var jPhone = $('.journal-phone');
  if (jPhone) {
    var barsBox = $('[data-bars]', jPhone);
    var seg = $('.seg'), segBtns = $$('.seg button');
    var axis = $('[data-j-axis]', jPhone);
    // 30 days of battery ranges (morning high → evening low), deterministic
    var days = [];
    for (var i = 0; i < 30; i++) {
      var hi = 0.78 + 0.18 * Math.abs(Math.sin(i * 1.7 + 0.4));
      var lo = 0.12 + 0.26 * Math.abs(Math.sin(i * 0.9 + 1.3));
      days.push([lo, hi]);
    }
    days[26] = [0.38, 0.98]; // the "best day" in the last week
    days.forEach(function (d, i) {
      var b = doc.createElement('i');
      var mid = (d[0] + d[1]) / 2;
      var topC = mid > 0.6 ? '#10B981' : mid > 0.5 ? '#F59E0B' : '#EF4444';
      b.style.cssText = '--lo:' + d[0].toFixed(3) + ';--hi:' + d[1].toFixed(3) + ';--top:' + topC + ';--k:' + i;
      barsBox.appendChild(b);
    });
    var bars = $$('i', barsBox);
    var data = {
      day: { avg: '63%', cap: 'right now', axis: ['7 AM', '12 PM', '5 PM', '11 PM'], k1: 'Slept', v1: '7h 40m', k2: 'Peak window', v2: '4–7 PM' },
      week: { avg: '61%', cap: 'avg this week', axis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], k1: 'Avg sleep', v1: '7h 12m', k2: 'Best day', v2: 'Thursday' },
      month: { avg: '58%', cap: 'avg this month', axis: ['Sep 3', 'Sep 10', 'Sep 17', 'Sep 24', 'Oct 1'], k1: 'Avg sleep', v1: '7h 04m', k2: 'Best week', v2: 'Sep 22–28' }
    };
    var setRange = function (r) {
      jPhone.setAttribute('data-range', r);
      barsBox.style.setProperty('--gap', r === 'month' ? '1.4%' : '5%');
      bars.forEach(function (b, i) { b.classList.toggle('hide', r === 'week' && i < 23); });
      var d = data[r];
      $('[data-j-avg]', jPhone).textContent = d.avg;
      $('[data-j-caption]', jPhone).textContent = d.cap;
      $('[data-j-k1]', jPhone).textContent = d.k1; $('[data-j-v1]', jPhone).textContent = d.v1;
      $('[data-j-k2]', jPhone).textContent = d.k2; $('[data-j-v2]', jPhone).textContent = d.v2;
      axis.innerHTML = d.axis.map(function (a) { return '<span>' + a + '</span>'; }).join('');
      var ix = ['day', 'week', 'month'].indexOf(r);
      if (seg) seg.style.setProperty('--i', ix);
      segBtns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-range') === r ? 'true' : 'false'); });
    };
    setRange('week');

    var userPicked = false, auto = null;
    segBtns.forEach(function (b) {
      b.addEventListener('click', function () { userPicked = true; if (auto) clearInterval(auto); setRange(b.getAttribute('data-range')); });
    });
    if (seg) seg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var cur = segBtns.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      var nxt = segBtns[(cur + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      nxt.focus(); nxt.click();
    });
    whenVisible(jPhone, function () {
      if (reduce) return;
      var seq = ['month', 'day', 'week'], j = 0;
      auto = setInterval(function () {
        if (userPicked || doc.hidden) return;
        setRange(seq[j]); j = (j + 1) % seq.length;
      }, 3600);
    });
  }

  /* ── Legal pages: table of contents with active section ─────────────── */
  var toc = $('.doc-toc ol');
  var docContent = $('.doc .content');
  if (toc && docContent) {
    var heads = $$('h2', docContent);
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'section-' + (i + 1);
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.replace(/^\s*\d+\.\s*/, '');
      li.appendChild(a); toc.appendChild(li);
    });
    var links = $$('a', toc);
    var tocScene = function () {
      var cur = 0;
      heads.forEach(function (h, i) { if (h.getBoundingClientRect().top < window.innerHeight * 0.3) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
    };
    scenes.push(tocScene);
    requestTick();
  }
})();
