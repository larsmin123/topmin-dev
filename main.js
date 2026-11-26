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
    var start = window.innerWidth < NARROW_BELOW ? PLATE_START_SCALE_NARROW : PLATE_START_SCALE_WIDE;

    plate.style.transform = 'scale(' + (start + (1 - start) * grow) + ')';
    plateImage.style.transform = 'scale(' + (1 + (IMAGE_END_ZOOM - 1) * grow) + ')';

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

  if (scale) buildTicks(scale.querySelector('.scale-ticks'));
  runClock();
  revealOnScroll(Array.prototype.slice.call(document.querySelectorAll('.reveal')));

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { root.classList.add('ready'); });
  });
})();
