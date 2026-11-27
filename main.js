// TOP/MIN — één klok voor alles wat met scrollen meebeweegt:
// de schaal links en de plaat die van heel object naar detail gaat.

(function () {
  'use strict';

  var TICK_COUNT = 40;
  var MAJOR_EVERY = 5;
  var DAMPING = 6; // exponentiële demping: 1 - exp(-DAMPING * dt)
  var PLATE_START_SCALE_WIDE = 0.42;
  var PLATE_START_SCALE_NARROW = 0.4;
  var NARROW_BELOW = 768;
  var IMAGE_END_ZOOM = 1.9;
  var COPY_GONE_AT = 0.22;
  var PLATE_FULL_AT = 0.85;
  var CAPTION_FROM = 0.7;
  var CAPTION_FULL_AT = 0.9;
  var LAPSE_FRAME_MS = 110;
  var LAPSE_FROM = 0.02;  // deel van de scroll waar de objecten beginnen te wisselen
  var LAPSE_UNTIL = 0.55; // daarna staat het medaillon er weer en begint het inzoomen
  var LAPSE_OBJECT_SIZE = 0.62; // langste zijde van het object, als deel van de plaatbreedte
  var LAPSE_PLATE_RATIO = 1.25; // hoogte gedeeld door breedte van de plaat

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var scale = document.querySelector('.scale');
  var marker = scale && scale.querySelector('.scale-marker');
  var hero = document.querySelector('.hero');
  var copy = hero && hero.querySelector('.hero-copy');
  var plate = hero && hero.querySelector('.plate');
  var plateImage = plate && plate.querySelector('img');
  var caption = hero && hero.querySelector('.hero-caption');
  var lapse = null;

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function buildTicks(container) {
    for (var i = 0; i <= TICK_COUNT; i += 1) {
      var tick = document.createElement('i');
      tick.style.top = (i / TICK_COUNT) * 100 + '%';
      if (i % MAJOR_EVERY === 0) tick.className = 'major';
      container.appendChild(tick);
    }
  }

  function drawScale(y) {
    if (!marker) return;
    var max = root.scrollHeight - window.innerHeight;
    var progress = max > 0 ? clamp01(y / max) : 0;
    marker.style.transform = 'translate3d(0,' + progress * scale.clientHeight + 'px,0)';
  }

  function drawHero(y) {
    if (!hero || !plate) return;
    var travel = hero.offsetHeight - window.innerHeight;
    var p = travel > 0 ? clamp01((y - hero.offsetTop) / travel) : 1;
    var grow = easeInOut(clamp01(p / PLATE_FULL_AT));
    var zoomIn = easeInOut(clamp01((p - LAPSE_UNTIL) / (PLATE_FULL_AT - LAPSE_UNTIL)));
    var start = window.innerWidth < NARROW_BELOW ? PLATE_START_SCALE_NARROW : PLATE_START_SCALE_WIDE;

    plate.style.transform = 'scale(' + (start + (1 - start) * grow) + ')';
    plateImage.style.transform = 'scale(' + (1 + (IMAGE_END_ZOOM - 1) * zoomIn) + ')';
    if (lapse) lapse.scrub((p - LAPSE_FROM) / (LAPSE_UNTIL - LAPSE_FROM));

    var copyOut = clamp01(p / COPY_GONE_AT);
    copy.style.opacity = 1 - copyOut;
    copy.style.transform = 'translate3d(0,' + -32 * copyOut + 'px,0)';
    copy.style.visibility = copyOut === 1 ? 'hidden' : 'visible';

    caption.style.opacity = clamp01((p - CAPTION_FROM) / (CAPTION_FULL_AT - CAPTION_FROM));
  }

  function draw(y) {
    drawScale(y);
    drawHero(y);
  }

  function runClock() {
    var current = window.scrollY;
    var last = performance.now();
    var running = false;

    function frame(now) {
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      var target = window.scrollY;
      current += (target - current) * (1 - Math.exp(-DAMPING * dt));
      if (Math.abs(target - current) < 0.5) {
        current = target;
        running = false;
      }
      draw(current);
      if (running) requestAnimationFrame(frame);
    }

    function wake() {
      if (reducedMotion) {
        current = window.scrollY;
        draw(current);
        return;
      }
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', function () {
      current = window.scrollY;
      draw(current);
    });
    draw(current);
  }

  function revealOnScroll(items) {
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach(function (el) { observer.observe(el); });
  }

  // Match cut: bij het scrollen, en zolang de muis op de plaat staat, komen alle objecten
  // voorbij, elk zo geschaald en verschoven dat de omtrek op dezelfde plek valt.
  function runLapse() {
    if (!plate || reducedMotion || !window.fetch) return;

    var layer = document.createElement('div');
    layer.className = 'lapse';
    layer.setAttribute('aria-hidden', 'true');
    var image = document.createElement('img');
    image.alt = '';
    layer.appendChild(image);
    plate.appendChild(layer);

    var frames = [];
    var index = 0;
    var timer = null;
    var shown = -1;
    var scrubbing = false;

    function showFrame(at) {
      if (at === shown) return;
      shown = at;
      var frame = frames[at];
      // Midden van de omtrek naar het midden van de plaat, langste zijde naar een vaste maat.
      var widest = Math.max(frame.w, frame.h * LAPSE_PLATE_RATIO);
      var zoom = LAPSE_OBJECT_SIZE / widest;
      var x = (0.5 - (frame.x + frame.w / 2) * zoom) * 100;
      var y = (0.5 - (frame.y + frame.h / 2) * zoom) * 100;
      image.src = frame.img.src;
      image.style.transform = 'translate(' + x + '%,' + y + '%) scale(' + zoom + ')';
    }

    function show() {
      showFrame(index);
      index = (index + 1) % frames.length;
    }

    // Scrollen bepaalt welk object er staat; t loopt van 0 tot 1.
    function scrub(t) {
      if (!frames.length) return;
      if (t <= 0 || t >= 1) {
        if (!scrubbing) return;
        scrubbing = false;
        if (!timer) layer.classList.remove('on');
        return;
      }
      scrubbing = true;
      clearInterval(timer);
      timer = null;
      layer.classList.add('on');
      showFrame(Math.min(frames.length - 1, Math.floor(t * frames.length)));
    }

    function start() {
      if (timer || scrubbing || !frames.length) return;
      layer.classList.add('on');
      show();
      timer = setInterval(show, LAPSE_FRAME_MS);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      index = 0;
      if (!scrubbing) layer.classList.remove('on');
    }

    function load() {
      fetch('images/lapse/index.json')
        .then(function (response) { return response.ok ? response.json() : []; })
        .then(function (list) {
          var pending = list.map(function (row) {
            return new Promise(function (resolve) {
              var img = new Image();
              img.onload = function () { resolve({ img: img, x: row[1], y: row[2], w: row[3], h: row[4] }); };
              img.onerror = function () { resolve(null); };
              img.src = 'images/lapse/' + row[0];
            });
          });
          return Promise.all(pending);
        })
        .then(function (loaded) {
          frames = loaded.filter(Boolean);
          draw(window.scrollY);
          if (plate.matches(':hover')) start();
        })
        .catch(function () { frames = []; });
    }

    lapse = { scrub: scrub };
    plate.addEventListener('mouseenter', start);
    plate.addEventListener('mouseleave', stop);
    if (document.readyState === 'complete') load();
    else window.addEventListener('load', load);
  }

  if (scale) buildTicks(scale.querySelector('.scale-ticks'));
  runLapse();
  runClock();
  revealOnScroll(Array.prototype.slice.call(document.querySelectorAll('.reveal')));

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { root.classList.add('ready'); });
  });
})();
