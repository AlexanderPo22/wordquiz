/* Тема оформления: светлая и тёмная. Выбор игрока живёт в localStorage. */
(function (root) {
  'use strict';

  var KEY = 'wordgame.theme.v1';
  var LIGHT = 'light';
  var DARK = 'dark';
  var BOUND = '__themeBound';

  /* Последняя применённая тема: нужна, если хранилище запрещено. */
  var memory = null;

  /*
   * Кнопка показывает состояние и подсказывает действие:
   * значок — текущая тема, подпись и title — та тема, которая включится по клику.
   */
  var ICONS = { light: '☀️', dark: '🌙' };
  var SWITCH_TO = {
    light: { text: 'Светлая тема', title: 'Включить светлую тему' },
    dark: { text: 'Тёмная тема', title: 'Включить тёмную тему' }
  };

  /** Из хранилища или ссылки принимаем только «light» и «dark». */
  function normalize(value) {
    if (value === null || value === undefined) return null;
    var text = String(value).trim().toLowerCase();
    if (text === LIGHT || text === DARK) return text;
    return null;
  }

  /** Хранилище может быть запрещено (например, при открытии файла с диска). */
  function storage() {
    try {
      return root.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Выбор игрока: 'light', 'dark' или null, если он ещё не выбирал.
   * Сначала смотрим в хранилище, потом в память: память нужна,
   * когда хранилище запрещено (например, при открытии файла с диска).
   */
  function stored() {
    var store = storage();
    if (store) {
      try {
        var fromStore = normalize(store.getItem(KEY));
        if (fromStore) return fromStore;
      } catch (err) {
        /* хранилище запрещено — обходимся памятью */
      }
    }
    return normalize(memory);
  }

  /** Запоминаем выбор игрока; без хранилища он живёт до перезагрузки страницы. */
  function save(mode) {
    var value = normalize(mode);
    if (!value) return false;
    memory = value;
    var store = storage();
    if (!store) return false;
    try {
      store.setItem(KEY, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Тема, которую прямо сейчас показывает страница: выбор игрока, а если его
   * нет — системная настройка. Именно её видит игрок, поэтому по ней же
   * работает и кнопка.
   */
  function shown() {
    return stored() || systemMode();
  }

  /** Системная настройка — она решает, пока игрок не выбрал тему сам. */
  function systemMode() {
    try {
      if (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) return DARK;
    } catch (err) {
      /* нет matchMedia — считаем тему светлой */
    }
    return LIGHT;
  }

  /** Записываем тему в атрибут <html> — дальше её знает только CSS. */
  function setTheme(value) {
    var doc = root.document;
    if (doc && doc.documentElement && doc.documentElement.setAttribute) {
      doc.documentElement.setAttribute('data-theme', value);
    }
    return value;
  }

  function isDark() {
    return shown() === DARK;
  }

  /**
   * Ставим атрибут на <html>: теме дальше достаточно стилей.
   * Аргумент — это выбор игрока, поэтому он запоминается.
   * Без аргумента берём выбор игрока, а если его нет — системную настройку,
   * и запоминать её нельзя: иначе выбор игрока появится сам собой.
   */
  function apply(mode) {
    var asked = normalize(mode);
    if (asked) {
      save(asked);
      return setTheme(asked);
    }
    return setTheme(shown());
  }

  /** Кнопка на странице: значок — текущая тема, подпись — следующая. */
  function updateButtons(animate) {
    var doc = root.document;
    if (!doc || !doc.getElementById) return;
    var button = doc.getElementById('btn-theme');
    if (!button) return;

    // значок — текущая тема, подпись и подсказка — та, что включится по клику
    var now = shown();
    var target = now === DARK ? LIGHT : DARK;
    if (button.setAttribute) {
      button.setAttribute('aria-pressed', now === DARK ? 'true' : 'false');
      button.setAttribute('title', SWITCH_TO[target].title);
      button.setAttribute('aria-label', SWITCH_TO[target].text);
    }

    var icon = doc.getElementById('theme-icon');
    if (icon) {
      icon.textContent = ICONS[now];
      if (icon.classList && icon.classList.remove) icon.classList.remove('pop');
      if (animate && icon.classList && icon.classList.add) {
        void icon.offsetWidth; /* перезапуск анимации */
        icon.classList.add('pop');
      }
    }
    var text = doc.getElementById('theme-text');
    if (text) text.textContent = SWITCH_TO[target].text;
  }

  /** Переключение по кнопке: выбор игрока важнее системной настройки. */
  function toggle() {
    var next = apply(isDark() ? LIGHT : DARK);
    updateButtons(true);
    return next;
  }

  /** Скрипт подключён в <head>, поэтому кнопки могут быть ещё не разобраны. */
  function bind() {
    var doc = root.document;
    if (!doc || !doc.getElementById) return;
    var button = doc.getElementById('btn-theme');
    if (!button) return;
    // обработчик ставим один раз, а подписи обновляем при каждом вызове
    if (button.addEventListener && !button[BOUND]) {
      button[BOUND] = true;
      button.addEventListener('click', function () { toggle(); });
    }
    updateButtons();
  }

  root.Theme = {
    KEY: KEY,
    LIGHT: LIGHT,
    DARK: DARK,
    normalize: normalize,
    stored: stored,
    systemMode: systemMode,
    shown: shown,
    isDark: isDark,
    apply: apply,
    toggle: toggle,
    updateButtons: updateButtons,
    storageAvailable: function () { return !!storage(); }
  };

  /* Применяем тему сразу — до первого кадра, иначе мелькнёт светлая. */
  apply();
  bind();

  var doc = root.document;
  if (doc && doc.addEventListener) {
    doc.addEventListener('DOMContentLoaded', bind);
  }

  /* Пока игрок не выбрал тему сам, слушаем системную настройку. */
  try {
    var query = root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () {
      if (stored()) return;
      apply();
      updateButtons();
    };
    if (query && query.addEventListener) query.addEventListener('change', onSystemChange);
    else if (query && query.addListener) query.addListener(onSystemChange);
  } catch (err) {
    /* без matchMedia живём на светлой теме */
  }
})(typeof window !== 'undefined' ? window : globalThis);
