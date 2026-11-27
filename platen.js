// TOP/MIN, platen: foto's die je kunt inzoomen en verbinden.
// De verbanden zijn alleen wat op de foto te zien is of wat is nagemeten.

(function () {
  'use strict';

  // De assen komen van de pagina; zonder opgave zijn het de vijf van de objectfoto's.
  var AXIS_LIST = window.TOPMIN_AXES || [['vorm', 'Vorm'], ['materiaal', 'Materiaal'], ['techniek', 'Techniek'], ['motief', 'Motief'], ['verhouding', 'Verhouding']];
  var AXES = AXIS_LIST.map(function (pair) { return pair[0]; });
  var AXIS_LABEL = {};
  AXIS_LIST.forEach(function (pair) { AXIS_LABEL[pair[0]] = pair[1]; });

  // Benoemde verhoudingen. Een object hoort erbij als het er minder dan 3,5% van afwijkt.
  var NAMED_RATIOS = [
    { value: 1, label: '1 : 1' },
    { value: Math.SQRT2, label: '1 : 1,41' },
    { value: (1 + Math.sqrt(5)) / 2, label: '1 : 1,62, gulden snede' }
  ];
  var RATIO_TOLERANCE = 0.035;
  var SQUARE_TOLERANCE = 0.07;
  var GOLDEN = (1 + Math.sqrt(5)) / 2;

  var MAX_SCALE = 3; // schermpixels per beeldpixel
  var FIT_MARGIN = 0.9;
  var ZOOM_STEP = 1.6;
  var WHEEL_SPEED = 0.0015;
  var DAMPING = 14;
  var DOT_RADIUS = 3;

  // Uit platen-data.js. box: [x, y, breedte, hoogte] van het object als deel van het beeld.
  var PLATES = window.TOPMIN_PLATES || [];

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function formatRatio(ratio) {
    return '1 : ' + ratio.toFixed(2).replace('.', ',');
  }

  function namedRatio(ratio) {
    if (ratio - 1 <= SQUARE_TOLERANCE) return NAMED_RATIOS[0];
    for (var i = 1; i < NAMED_RATIOS.length; i += 1) {
      if (Math.abs(ratio - NAMED_RATIOS[i].value) / NAMED_RATIOS[i].value <= RATIO_TOLERANCE) return NAMED_RATIOS[i];
    }
    return null;
  }

  PLATES.forEach(function (plate) {
    var named = namedRatio(plate.ratio);
    plate.named = named;
    plate.verhouding = named ? [named.label] : [];
  });

  function byId(id) {
    for (var i = 0; i < PLATES.length; i += 1) if (PLATES[i].id === id) return PLATES[i];
    return null;
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }

  // ---------- Raster met verbindingen ----------

  var grid = document.querySelector('.pl-grid');
  var wrap = document.querySelector('.pl-wrap');
  var lines = document.querySelector('.pl-lines');
  var caption = document.querySelector('.links-caption');
  var axisButtons = Array.prototype.slice.call(document.querySelectorAll('.axis'));

  var state = { axis: AXES[0], hover: null, value: null };
  var tiles = {};

  function buildGrid() {
    PLATES.forEach(function (plate) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pl';
      button.setAttribute('aria-label', plate.title + ', zoom in');
      var img = document.createElement('img');
      img.src = plate.thumb || 'images/lapse/' + plate.id + '.jpg';
      img.alt = '';
      img.width = plate.tw || 640;
      img.height = plate.th || 800;
      img.loading = 'lazy';
      button.appendChild(img);
      button.addEventListener('click', function () { openViewer(plate, button); });
      button.addEventListener('mouseenter', function () { setHover(plate.id); });
      button.addEventListener('focus', function () { setHover(plate.id); });
      button.addEventListener('blur', function () { setHover(null); });
      grid.appendChild(button);
      tiles[plate.id] = button;
    });
    grid.addEventListener('mouseleave', function () { setHover(null); });
  }

  // Alle waarden op de gekozen as die twee of meer platen delen, grootste groep eerst.
  function axisGroups() {
    var groups = {};
    PLATES.forEach(function (plate) {
      plate[state.axis].forEach(function (value) {
        (groups[value] = groups[value] || []).push(plate.id);
      });
    });
    return Object.keys(groups)
      .filter(function (value) { return groups[value].length > 1; })
      .map(function (value) { return { value: value, ids: groups[value] }; })
      .sort(function (one, other) { return other.ids.length - one.ids.length; });
  }

  // Wat nu getekend wordt: de waarden van de plaat onder de muis, anders de gekozen waarde.
  function shownGroups(all) {
    var hovered = state.hover && byId(state.hover);
    return all.filter(function (group) {
      if (hovered) return hovered[state.axis].indexOf(group.value) !== -1;
      return group.value === state.value;
    });
  }

  function drawValues(all, shown) {
    while (caption.firstChild) caption.removeChild(caption.firstChild);
    if (!all.length) {
      caption.textContent = 'Geen verband op ' + AXIS_LABEL[state.axis].toLowerCase();
      return;
    }
    all.forEach(function (group) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip micro';
      button.textContent = group.value + ' ' + group.ids.length;
      button.setAttribute('aria-pressed', String(shown.indexOf(group) !== -1));
      button.addEventListener('click', function () {
        state.value = group.value;
        drawLinks();
      });
      caption.appendChild(button);
    });
  }

  function drawLinks() {
    var all = axisGroups();
    if (!state.value && all.length) state.value = all[0].value;
    var groups = shownGroups(all);
    var base = wrap.getBoundingClientRect();
    var linked = {};

    while (lines.firstChild) lines.removeChild(lines.firstChild);

    groups.forEach(function (group) {
      var points = group.ids.map(function (id) {
        var rect = tiles[id].getBoundingClientRect();
        linked[id] = true;
        return [rect.left - base.left + rect.width / 2, rect.top - base.top + rect.height / 2];
      });
      lines.appendChild(svgEl('polyline', {
        points: points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ')
      }));
      points.forEach(function (p) {
        lines.appendChild(svgEl('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: DOT_RADIUS }));
      });
    });

    PLATES.forEach(function (plate) {
      tiles[plate.id].classList.toggle('off', !linked[plate.id]);
    });

    drawValues(all, groups);
  }

  function setHover(id) {
    if (state.hover === id) return;
    state.hover = id;
    drawLinks();
  }

  function setAxis(axis, value) {
    state.axis = axis;
    state.value = value || null;
    axisButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.axis === axis));
    });
    drawLinks();
  }

  // ---------- Kijker ----------

  var viewer = document.querySelector('.viewer');
  var stage = viewer.querySelector('.viewer-stage');
  var plateEl = viewer.querySelector('.viewer-plate');
  var plateImg = plateEl.querySelector('img');
  var measure = viewer.querySelector('.viewer-measure');
  var metaEl = viewer.querySelector('.viewer-meta');
  var titleEl = viewer.querySelector('#viewer-title');
  var numberEl = viewer.querySelector('.viewer-number');
  var measureButton = viewer.querySelector('[data-tool="measure"]');
  var closeButton = viewer.querySelector('[data-tool="close"]');

  var open = null; // { plate, opener }
  var view = { x: 0, y: 0, s: 1 };   // wat er nu staat
  var goal = { x: 0, y: 0, s: 1 };   // waar het heen gaat
  var fitScale = 1;
  var animating = false;
  var lastFrame = 0;
  var pointers = {};
  var pinch = null;

  function applyView() {
    // x en y zijn het midden van de plaat ten opzichte van het midden van het vlak.
    var plate = open.plate;
    plateEl.style.transform = 'translate3d(' + (view.x - plate.w * view.s / 2) + 'px,' + (view.y - plate.h * view.s / 2) + 'px,0) scale(' + view.s + ')';
  }

  function clampGoal() {
    var plate = open.plate;
    var rect = stage.getBoundingClientRect();
    goal.s = Math.min(MAX_SCALE, Math.max(fitScale, goal.s));
    var maxX = Math.max(0, (plate.w * goal.s - rect.width) / 2);
    var maxY = Math.max(0, (plate.h * goal.s - rect.height) / 2);
    goal.x = Math.min(maxX, Math.max(-maxX, goal.x));
    goal.y = Math.min(maxY, Math.max(-maxY, goal.y));
  }

  function frame(now) {
    var dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    var k = 1 - Math.exp(-DAMPING * dt);
    view.x += (goal.x - view.x) * k;
    view.y += (goal.y - view.y) * k;
    view.s += (goal.s - view.s) * k;
    var settled = Math.abs(goal.x - view.x) < 0.3 && Math.abs(goal.y - view.y) < 0.3 && Math.abs(goal.s - view.s) < 0.0005;
    if (settled) {
      view.x = goal.x; view.y = goal.y; view.s = goal.s;
      animating = false;
    }
    if (open) applyView();
    if (animating && open) requestAnimationFrame(frame);
  }

  function move(immediate) {
    clampGoal();
    if (immediate || reducedMotion) {
      view.x = goal.x; view.y = goal.y; view.s = goal.s;
      applyView();
      return;
    }
    if (animating) return;
    animating = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  // Zoom rond een punt (px, py), gemeten vanaf het midden van het vlak.
  function zoomAt(factor, px, py, immediate) {
    var next = Math.min(MAX_SCALE, Math.max(fitScale, goal.s * factor));
    var ratio = next / goal.s;
    goal.x = px - (px - goal.x) * ratio;
    goal.y = py - (py - goal.y) * ratio;
    goal.s = next;
    move(immediate);
  }

  function fit() {
    var rect = stage.getBoundingClientRect();
    fitScale = Math.min(rect.width / open.plate.w, rect.height / open.plate.h) * FIT_MARGIN;
  }

  function stagePoint(event) {
    var rect = stage.getBoundingClientRect();
    return [event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2];
  }

  function drawMeasure(plate) {
    while (measure.firstChild) measure.removeChild(measure.firstChild);
    measure.setAttribute('viewBox', '0 0 ' + plate.w + ' ' + plate.h);
    var x = plate.box[0] * plate.w;
    var y = plate.box[1] * plate.h;
    var w = plate.box[2] * plate.w;
    var h = plate.box[3] * plate.h;
    measure.appendChild(svgEl('rect', { x: x, y: y, width: w, height: h }));

    if (plate.named === NAMED_RATIOS[0]) {
      measure.appendChild(svgEl('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }));
    }
    if (plate.named === NAMED_RATIOS[2]) {
      // Gulden snede: de lange zijde verdeeld in 1 : 0,62.
      if (h >= w) measure.appendChild(svgEl('line', { x1: x, y1: y + h / GOLDEN, x2: x + w, y2: y + h / GOLDEN }));
      else measure.appendChild(svgEl('line', { x1: x + w / GOLDEN, y1: y, x2: x + w / GOLDEN, y2: y + h }));
    }
  }

  function fillMeta(plate) {
    while (metaEl.firstChild) metaEl.removeChild(metaEl.firstChild);
    AXES.forEach(function (axis) {
      var dt = document.createElement('dt');
      dt.className = 'micro';
      dt.textContent = AXIS_LABEL[axis];
      var dd = document.createElement('dd');

      if (axis === 'verhouding' && !plate.named) {
        dd.textContent = formatRatio(plate.ratio);
      } else if (!plate[axis].length) {
        dd.textContent = 'Geen';
      }

      plate[axis].forEach(function (value) {
        var shared = PLATES.filter(function (other) { return other[axis].indexOf(value) !== -1; }).length;
        var text = axis === 'verhouding' ? formatRatio(plate.ratio) + ' (' + value + ')' : value;
        if (shared < 2) {
          var span = document.createElement('span');
          span.textContent = text;
          dd.appendChild(span);
          return;
        }
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'value';
        button.textContent = text;
        button.setAttribute('aria-label', text + ', toon de ' + shared + ' platen');
        button.addEventListener('click', function () {
          closeViewer(true);
          setAxis(axis, value);
          wrap.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        });
        dd.appendChild(button);
      });

      metaEl.appendChild(dt);
      metaEl.appendChild(dd);
    });
  }

  function openViewer(plate, opener) {
    open = { plate: plate, opener: opener };
    plateEl.style.width = plate.w + 'px';
    plateEl.style.height = plate.h + 'px';
    plateImg.src = plate.full || 'images/platen/' + plate.id + '.jpg';
    plateImg.alt = plate.title;
    titleEl.textContent = plate.title;
    numberEl.textContent = plate.number;
    fillMeta(plate);
    drawMeasure(plate);
    measure.hidden = true;
    measureButton.setAttribute('aria-pressed', 'false');
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
    fit();
    goal.x = 0; goal.y = 0; goal.s = fitScale;
    move(true);
    closeButton.focus();
  }

  function closeViewer(skipFocus) {
    if (!open) return;
    var opener = open.opener;
    viewer.hidden = true;
    document.body.style.overflow = '';
    open = null;
    pointers = {};
    pinch = null;
    if (!skipFocus && opener) opener.focus();
    setHover(null);
  }

  function bindViewer() {
    stage.addEventListener('wheel', function (event) {
      if (!open) return;
      event.preventDefault();
      var point = stagePoint(event);
      zoomAt(Math.exp(-event.deltaY * WHEEL_SPEED), point[0], point[1]);
    }, { passive: false });

    stage.addEventListener('dblclick', function (event) {
      if (!open) return;
      var point = stagePoint(event);
      if (goal.s >= MAX_SCALE * 0.98) { goal.x = 0; goal.y = 0; goal.s = fitScale; move(); return; }
      zoomAt(ZOOM_STEP * ZOOM_STEP, point[0], point[1]);
    });

    stage.addEventListener('pointerdown', function (event) {
      if (!open) return;
      stage.setPointerCapture(event.pointerId);
      pointers[event.pointerId] = stagePoint(event);
      stage.classList.add('dragging');
      pinch = null;
    });

    stage.addEventListener('pointermove', function (event) {
      if (!open || !pointers[event.pointerId]) return;
      var before = pointers[event.pointerId];
      var now = stagePoint(event);
      pointers[event.pointerId] = now;
      var ids = Object.keys(pointers);

      if (ids.length === 1) {
        goal.x += now[0] - before[0];
        goal.y += now[1] - before[1];
        move(true);
        return;
      }
      if (ids.length === 2) {
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
        var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch) {
          goal.x += mid[0] - pinch.mid[0];
          goal.y += mid[1] - pinch.mid[1];
          zoomAt(distance / pinch.distance, mid[0], mid[1], true);
        }
        pinch = { distance: distance, mid: mid };
      }
    });

    function release(event) {
      delete pointers[event.pointerId];
      pinch = null;
      if (!Object.keys(pointers).length) stage.classList.remove('dragging');
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    viewer.querySelector('.viewer-tools').addEventListener('click', function (event) {
      var button = event.target.closest('.tool');
      if (!button || !open) return;
      var tool = button.dataset.tool;
      if (tool === 'in') zoomAt(ZOOM_STEP, 0, 0);
      if (tool === 'out') zoomAt(1 / ZOOM_STEP, 0, 0);
      if (tool === 'close') closeViewer();
      if (tool === 'measure') {
        measure.hidden = !measure.hidden;
        button.setAttribute('aria-pressed', String(!measure.hidden));
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!open) return;
      if (event.key === 'Escape') closeViewer();
      if (event.key === '+' || event.key === '=') zoomAt(ZOOM_STEP, 0, 0);
      if (event.key === '-') zoomAt(1 / ZOOM_STEP, 0, 0);
    });

    window.addEventListener('resize', function () {
      if (!open) return;
      var wasFitted = goal.s <= fitScale * 1.001;
      fit();
      if (wasFitted) goal.s = fitScale;
      move(true);
    });
  }

  // ---------- Start ----------

  buildGrid();
  bindViewer();
  axisButtons.forEach(function (button) {
    button.addEventListener('click', function () { setAxis(button.dataset.axis); });
  });
  if ('ResizeObserver' in window) new ResizeObserver(drawLinks).observe(wrap);
  window.addEventListener('load', drawLinks);
  drawLinks();
})();
