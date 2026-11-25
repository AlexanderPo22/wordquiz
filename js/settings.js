/* Настройки игры: режимы, уровни сложности, хранение, проверка, сброс и рандомизация. */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'wordgame.settings.v1';

  var LIMITS = {
    roundSeconds: { min: 15, max: 900, step: 5 },
    findSeconds: { min: 10, max: 120, step: 5 },
    findBonus: { min: 0, max: 60, step: 1 },
    cols: { min: 4, max: 10 },
    rows: { min: 4, max: 10 },
    minWordLength: { min: 3, max: 6 },
    maxWordLength: { min: 4, max: 12 },
    penaltyForWrong: { min: 0, max: 5 },
    seedWords: { min: 1, max: 12 }
  };

  /*
   * Главная настройка — режим игры.
   * adjacent — слово собирается по соседним клеткам (цепочкой).
   * any      — буквы можно брать из любых клеток в любом порядке.
   * find     — слово загадано: его буквы ищут по всему полю, пока идёт время;
   *            за найденное слово время добавляется, а буквы меняются.
   */
  var MODES = {
    adjacent: {
      title: 'Рядом',
      short: 'по соседним клеткам',
      hint: 'Слово собирается цепочкой: каждая следующая буква — из соседней клетки.'
    },
    any: {
      title: 'Любые',
      short: 'любые буквы поля',
      hint: 'Буквы можно брать из любых клеток и в любом порядке — как из набора букв.'
    },
    find: {
      title: 'Найди слово',
      short: 'слово загадано',
      hint: 'Слово загадано заранее: ищите его буквы по всему полю в любом порядке. ' +
        'Нашлось — время добавляется, а буквы меняются.'
    }
  };
  var MODE_ORDER = ['adjacent', 'any', 'find'];

  /*
   * Уровни сложности — готовые наборы настроек.
   * Любое значение потом можно поправить вручную в блоке «Дополнительно».
   */
  var DIFFICULTIES = {
    easy: {
      title: 'Легко', rows: 5, cols: 5, roundSeconds: 180,
      findSeconds: 40, findBonus: 12,
      minWordLength: 3, maxWordLength: 6, seedWords: 6
    },
    normal: {
      title: 'Средне', rows: 6, cols: 6, roundSeconds: 120,
      findSeconds: 30, findBonus: 8,
      minWordLength: 3, maxWordLength: 8, seedWords: 8
    },
    hard: {
      title: 'Сложно', rows: 7, cols: 7, roundSeconds: 90,
      findSeconds: 25, findBonus: 6,
      minWordLength: 4, maxWordLength: 10, seedWords: 10
    }
  };
  var DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

  /* Три ячейки пресетов: в них кнопка «Сохранить» записывает текущие настройки. */
  var PRESETS_KEY = 'wordgame.presets.v1';
  var PRESET_COUNT = 3;

  /* Очки за длину слова. Ключ «8» означает «8 и больше букв». */
  var DEFAULT_POINTS = { 3: 1, 4: 2, 5: 3, 6: 5, 7: 7, 8: 10 };

  var DEFAULTS = {
    mode: 'adjacent',
    difficulty: 'normal',
    roundSeconds: 120,
    findSeconds: 30,
    findBonus: 8,
    cols: 6,
    rows: 6,
    minWordLength: 3,
    maxWordLength: 8,
    allowDiagonal: true,
    reuseLetters: false,
    penaltyForWrong: 0,
    showFoundWords: true,
    showHint: true,
    fillMode: 'dictionary', // 'dictionary' — на поле раскладываются слова словаря, 'random' — чистый случай
    seedWords: 8,
    points: { 3: 1, 4: 2, 5: 3, 6: 5, 7: 7, 8: 10 }
  };

  function pointsKeys() {
    return Object.keys(DEFAULT_POINTS)
      .map(Number)
      .sort(function (a, b) { return a - b; });
  }

  function normalizePoints(raw) {
    var out = {};
    var keys = pointsKeys();
    for (var i = 0; i < keys.length; i++) {
      var len = keys[i];
      var value = raw && raw[len] !== undefined ? parseInt(raw[len], 10) : NaN;
      if (!isFinite(value)) value = DEFAULT_POINTS[len];
      out[len] = root.Util.clamp(value, 0, 99);
    }
    return out;
  }

  /** Приводит любые внешние данные к корректному набору настроек. */
  function normalize(raw) {
    var src = raw || {};
    var out = {};
    var key;

    for (key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) out[key] = DEFAULTS[key];
    }

    var lim = LIMITS;
    out.roundSeconds = root.Util.toInt(src.roundSeconds, DEFAULTS.roundSeconds, lim.roundSeconds.min, lim.roundSeconds.max);
    out.findSeconds = root.Util.toInt(src.findSeconds, DEFAULTS.findSeconds, lim.findSeconds.min, lim.findSeconds.max);
    out.findBonus = root.Util.toInt(src.findBonus, DEFAULTS.findBonus, lim.findBonus.min, lim.findBonus.max);
    out.cols = root.Util.toInt(src.cols, DEFAULTS.cols, lim.cols.min, lim.cols.max);
    out.rows = root.Util.toInt(src.rows, DEFAULTS.rows, lim.rows.min, lim.rows.max);
    out.minWordLength = root.Util.toInt(src.minWordLength, DEFAULTS.minWordLength, lim.minWordLength.min, lim.minWordLength.max);
    out.maxWordLength = root.Util.toInt(src.maxWordLength, DEFAULTS.maxWordLength, lim.maxWordLength.min, lim.maxWordLength.max);
    out.penaltyForWrong = root.Util.toInt(src.penaltyForWrong, DEFAULTS.penaltyForWrong, lim.penaltyForWrong.min, lim.penaltyForWrong.max);
    out.seedWords = root.Util.toInt(src.seedWords, DEFAULTS.seedWords, lim.seedWords.min, lim.seedWords.max);

    if (out.maxWordLength < out.minWordLength) out.maxWordLength = out.minWordLength;
    // Слово не может быть длиннее, чем клеток на поле.
    var cells = out.rows * out.cols;
    if (out.maxWordLength > cells) out.maxWordLength = Math.max(out.minWordLength, cells);
    if (out.seedWords > cells) out.seedWords = cells;

    out.allowDiagonal = src.allowDiagonal === undefined ? DEFAULTS.allowDiagonal : !!src.allowDiagonal;
    out.reuseLetters = src.reuseLetters === undefined ? DEFAULTS.reuseLetters : !!src.reuseLetters;
    out.showFoundWords = src.showFoundWords === undefined ? DEFAULTS.showFoundWords : !!src.showFoundWords;
    out.showHint = src.showHint === undefined ? DEFAULTS.showHint : !!src.showHint;
    out.fillMode = src.fillMode === 'random' ? 'random' : 'dictionary';
    out.mode = Object.prototype.hasOwnProperty.call(MODES, src.mode) ? src.mode : DEFAULTS.mode;
    out.difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTIES, src.difficulty)
      ? src.difficulty
      : DEFAULTS.difficulty;
    // Там, где соседство клеток не важно, диагональ ни на что не влияет.
    if (out.mode !== 'adjacent') out.allowDiagonal = true;
    out.points = normalizePoints(src.points);

    return out;
  }

  function defaults() {
    return normalize(DEFAULTS);
  }

  function load() {
    try {
      var rawText = root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
      if (!rawText) return defaults();
      return normalize(JSON.parse(rawText));
    } catch (err) {
      return defaults();
    }
  }

  function save(settings) {
    var clean = normalize(settings);
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (err) {
      /* приватный режим браузера — играем без сохранения */
    }
    return clean;
  }

  function reset() {
    var fresh = defaults();
    return save(fresh);
  }

  function clear() {
    try {
      if (root.localStorage) root.localStorage.removeItem(STORAGE_KEY);
    } catch (err) { /* ignore */ }
    return defaults();
  }

  /** Доступно ли хранилище: при открытии файла с диска браузер может его запрещать. */
  function storageAvailable() {
    try {
      if (!root.localStorage) return false;
      var probe = STORAGE_KEY + '.probe';
      root.localStorage.setItem(probe, '1');
      root.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Настройки в строку — чтобы передать их ссылкой, если хранилище недоступно. */
  function encode(settings) {
    return encodeURIComponent(JSON.stringify(normalize(settings)));
  }

  function decode(text) {
    try {
      return normalize(JSON.parse(decodeURIComponent(text)));
    } catch (err) {
      return null;
    }
  }

  /** Настройки из адресной строки вида game.html?s=... */
  function fromQuery(search) {
    var match = /[?&]s=([^&]+)/.exec(search || '');
    return match ? decode(match[1]) : null;
  }

  function modeTitle(mode) {
    var item = MODES[mode];
    return (item ? item.title : MODES[DEFAULTS.mode].title);
  }

  function difficultyTitle(level) {
    var item = DIFFICULTIES[level];
    return (item ? item.title : DIFFICULTIES[DEFAULTS.difficulty].title);
  }

  /** Применяет готовый набор уровня сложности, остальные настройки не трогает. */
  function applyDifficulty(settings, level) {
    var preset = DIFFICULTIES[level];
    if (!preset) return normalize(settings);
    var merged = root.Util.merge(settings || DEFAULTS, {
      difficulty: level,
      rows: preset.rows,
      cols: preset.cols,
      roundSeconds: preset.roundSeconds,
      findSeconds: preset.findSeconds,
      findBonus: preset.findBonus,
      minWordLength: preset.minWordLength,
      maxWordLength: preset.maxWordLength,
      seedWords: preset.seedWords
    });
    return normalize(merged);
  }

  /** Короткое описание уровня: «Поле 6×6 · 2:00 · слова от 3 до 8 букв». */
  function describeDifficulty(level) {
    var preset = DIFFICULTIES[level] || DIFFICULTIES[DEFAULTS.difficulty];
    return 'Поле ' + preset.rows + '×' + preset.cols +
      ' · ' + root.Util.formatTime(preset.roundSeconds) +
      ' · слова от ' + preset.minWordLength + ' до ' + preset.maxWordLength + ' букв';
  }

  /** Совпадают ли размер поля, время и длина слов с набором уровня. */
  function matchesDifficulty(settings) {
    var preset = DIFFICULTIES[settings.difficulty];
    if (!preset) return false;
    var sameField = settings.rows === preset.rows && settings.cols === preset.cols &&
      settings.minWordLength === preset.minWordLength &&
      settings.maxWordLength === preset.maxWordLength;
    if (!sameField) return false;
    // В режиме «Найди слово» время раунда не используется — важно время на слово.
    if (settings.mode === 'find') {
      return settings.findSeconds === preset.findSeconds && settings.findBonus === preset.findBonus;
    }
    return settings.roundSeconds === preset.roundSeconds;
  }

  /** Подпись настроек одной строкой — для карточек пресетов. */
  function describeSettings(settings) {
    var s = normalize(settings);
    var level = matchesDifficulty(s) ? difficultyTitle(s.difficulty) : 'свои настройки';
    var clock = s.mode === 'find'
      ? root.Util.formatTime(s.findSeconds) + ' +' + s.findBonus + ' с'
      : root.Util.formatTime(s.roundSeconds);
    return modeTitle(s.mode) + ' · ' + level + ' · ' + s.rows + '×' + s.cols + ' · ' + clock;
  }

  /* ---------- Пресеты ---------- */

  /** Три пресета «из коробки»: классика, разминка и свободный набор. */
  function presetDefaults() {
    return [
      normalize(DEFAULTS),
      applyDifficulty(DEFAULTS, 'easy'),
      normalize(root.Util.merge(applyDifficulty(DEFAULTS, 'normal'), { mode: 'any' }))
    ];
  }

  /** Приводит сохранённые пресеты к трём корректным ячейкам. */
  function normalizePresets(raw) {
    var base = presetDefaults();
    var src = raw || {};
    var list = Array.isArray(src.slots) ? src.slots : [];
    var out = { active: 0, slots: [] };
    for (var i = 0; i < PRESET_COUNT; i++) {
      out.slots.push(normalize(i < list.length && list[i] ? list[i] : base[i]));
    }
    out.active = root.Util.toInt(src.active, 0, 0, PRESET_COUNT - 1);
    return out;
  }

  function loadPresets() {
    try {
      var rawText = root.localStorage ? root.localStorage.getItem(PRESETS_KEY) : null;
      if (!rawText) return normalizePresets(null);
      return normalizePresets(JSON.parse(rawText));
    } catch (err) {
      return normalizePresets(null);
    }
  }

  function savePresets(state) {
    var clean = normalizePresets(state);
    try {
      if (root.localStorage) root.localStorage.setItem(PRESETS_KEY, JSON.stringify(clean));
    } catch (err) { /* хранилище недоступно — пресеты живут только в памяти страницы */ }
    return clean;
  }

  /** Одинаковые ли это настройки (сравнение по нормализованным значениям). */
  function sameSettings(a, b) {
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }

  /** Случайные, но осмысленные настройки для кнопки «Случайно». */
  function randomize(base) {
    var rng = root.Util.makeRng((Math.random() * 0xffffffff) >>> 0);
    var mode = root.Util.pick(rng, MODE_ORDER);
    var level = root.Util.pick(rng, DIFFICULTY_ORDER);

    // Очки растут с длиной: строим неубывающую последовательность.
    var keys = pointsKeys();
    var points = {};
    var prev = 1;
    for (var i = 0; i < keys.length; i++) {
      prev = root.Util.clamp(prev + root.Util.randInt(rng, 0, 3), 1, 99);
      points[keys[i]] = prev;
    }

    var out = applyDifficulty(root.Util.merge(base || DEFAULTS, { mode: mode }), level);
    var extras = {
      allowDiagonal: rng() < 0.7,
      reuseLetters: mode === 'adjacent' ? rng() < 0.2 : false,
      penaltyForWrong: rng() < 0.5 ? 0 : root.Util.randInt(rng, 1, 3),
      showFoundWords: true,
      showHint: rng() < 0.7,
      fillMode: rng() < 0.7 ? 'dictionary' : 'random',
      points: points
    };
    return normalize(root.Util.merge(out, extras));
  }

  /** Очки за слово указанной длины. */
  function pointsForLength(length, points) {
    var table = points || DEFAULTS.points;
    var keys = Object.keys(table)
      .map(Number)
      .sort(function (a, b) { return a - b; });
    if (keys.length === 0) return Math.max(1, length - 2);
    if (table[length] !== undefined) return table[length];
    if (length <= keys[0]) return table[keys[0]];
    return table[keys[keys.length - 1]];
  }

  /** Текстовое описание очков — для подсказки на странице настроек. */
  function describePoints(points) {
    var keys = Object.keys(points)
      .map(Number)
      .sort(function (a, b) { return a - b; });
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var label = i === keys.length - 1 ? keys[i] + '+' : String(keys[i]);
      parts.push(label + ' → ' + points[keys[i]]);
    }
    return parts.join(', ');
  }

  root.Settings = {
    STORAGE_KEY: STORAGE_KEY,
    LIMITS: LIMITS,
    DEFAULTS: DEFAULTS,
    DEFAULT_POINTS: DEFAULT_POINTS,
    MODES: MODES,
    MODE_ORDER: MODE_ORDER,
    DIFFICULTIES: DIFFICULTIES,
    DIFFICULTY_ORDER: DIFFICULTY_ORDER,
    PRESETS_KEY: PRESETS_KEY,
    PRESET_COUNT: PRESET_COUNT,
    defaults: defaults,
    normalize: normalize,
    load: load,
    save: save,
    reset: reset,
    clear: clear,
    storageAvailable: storageAvailable,
    encode: encode,
    decode: decode,
    fromQuery: fromQuery,
    modeTitle: modeTitle,
    difficultyTitle: difficultyTitle,
    applyDifficulty: applyDifficulty,
    describeDifficulty: describeDifficulty,
    matchesDifficulty: matchesDifficulty,
    describeSettings: describeSettings,
    presetDefaults: presetDefaults,
    normalizePresets: normalizePresets,
    loadPresets: loadPresets,
    savePresets: savePresets,
    sameSettings: sameSettings,
    randomize: randomize,
    pointsKeys: pointsKeys,
    pointsForLength: pointsForLength,
    describePoints: describePoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
