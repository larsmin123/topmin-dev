// TOP/MIN, één case: tekst en beeld uit case-data.js, gekozen met ?c= in het adres.

(function () {
  'use strict';

  var cases = window.TOPMIN_CASES || [];
  var params = new URLSearchParams(window.location.search);
  var lang = params.get('lang') === 'en' ? 'en' : 'nl';
  var home = lang === 'en' ? 'en.html' : 'index.html';
  var WORDS = {
    nl: { back: 'Alle cases', next: 'Volgende case: ', image: 'beeld', missing: 'Deze case bestaat niet.' },
    en: { back: 'All cases', next: 'Next case: ', image: 'image', missing: 'This case does not exist.' }
  };
  var words = WORDS[lang];

  function find(selector) { return document.querySelector(selector); }

  function caseUrl(id) {
    return 'case.html?c=' + encodeURIComponent(id) + (lang === 'en' ? '&lang=en' : '');
  }

  var index = -1;
  cases.forEach(function (item, i) { if (item.id === params.get('c')) index = i; });

  document.documentElement.lang = lang;
  find('.logo').href = home;
  var back = find('[data-back]');
  back.href = home + '#cases';
  back.textContent = words.back;

  if (index === -1) {
    find('[data-title]').textContent = words.missing;
    find('[data-next]').hidden = true;
    return;
  }

  var item = cases[index];
  var copy = item[lang];
  document.title = 'TOP/MIN, ' + item.title;
  find('[data-meta]').textContent = copy.meta;
  find('[data-title]').textContent = item.title;

  var body = find('[data-text]');
  copy.text.forEach(function (paragraph) {
    var p = document.createElement('p');
    p.className = 'lead';
    p.textContent = paragraph;
    body.appendChild(p);
  });
  if (copy.link) {
    var more = document.createElement('a');
    more.className = 'mail';
    more.href = copy.link[0];
    more.textContent = copy.link[1];
    body.appendChild(more);
  }

  var gallery = find('[data-gallery]');
  item.images.forEach(function (image, i) {
    var figure = document.createElement('figure');
    figure.className = 'case-figure';
    var img = document.createElement('img');
    img.src = image[0];
    img.width = image[1];
    img.height = image[2];
    img.alt = item.title + ', ' + words.image + ' ' + (i + 1);
    if (i > 2) img.loading = 'lazy';
    figure.appendChild(img);
    gallery.appendChild(figure);
  });

  var next = cases[(index + 1) % cases.length];
  var nextLink = find('[data-next]');
  nextLink.href = caseUrl(next.id);
  nextLink.textContent = words.next + next.title;
})();
