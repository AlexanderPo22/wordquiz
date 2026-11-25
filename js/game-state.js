/*
 * Сохранение партии. Состояние пишется в localStorage по ходу игры — сразу при
 * изменении, а не на выгрузке страницы, чтобы обновление не теряло прогресс.
 */
(function (root) {
  'use strict';

  var KEY = 'wordgame.game.v1';
  var VERSION = 1;
  var LETTER = /^[a-z]$/;
  var WORD = /^[a-z]{2,15}$/;

  function storage() {
    try {
      return root.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  function toInt(value, fallback, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function normalizeBoard(raw, settings) {
    if (!raw || typeof raw !== 'object') return null;
    var rows = toInt(raw.rows, 0, 0, 20);
    var cols = toInt(raw.cols, 0, 0, 20);
    if (rows < 4 || cols < 4 || rows > 10 || cols > 10) return null;
    // поле должно совпадать с настройками, иначе партию продолжать нельзя
    if (rows !== settings.rows || cols !== settings.cols) return null;
    if (!Array.isArray(raw.letters) || raw.letters.length !== rows * cols) return null;

    var letters = [];
    for (var i = 0; i < raw.letters.length; i++) {
      var letter = String(raw.letters[i]).toLowerCase();
      if (!LETTER.test(letter)) return null;
      letters.push(letter);
    }

    var seeds = [];
    if (Array.isArray(raw.seedWords)) {
      seeds = raw.seedWords.map(function (word) { return String(word).toLowerCase(); })
        .filter(function (word) { return WORD.test(word); });
    }
    return { rows: rows, cols: cols, letters: letters, seedWords: seeds };
  }

  function normalizePath(raw, total, reuseLetters) {
    if (!Array.isArray(raw)) return [];
    var path = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length; i++) {
      var cell = parseInt(raw[i], 10);
      if (!isFinite(cell) || cell < 0 || cell >= total) continue;
      if (!reuseLetters && seen[cell] === true) continue;
      seen[cell] = true;
      path.push(cell);
    }
    return path;
  }

  function normalizeFound(raw, settings) {
    if (!Array.isArray(raw)) return [];
    var min = settings.minWordLength || 3;
    var max = settings.maxWordLength || 15;
    var found = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i];
      if (!entry || typeof entry !== 'object') continue;
      var word = String(entry.word === undefined ? '' : entry.word).toLowerCase();
      if (!WORD.test(word) || seen[word] === true) continue;
      // слово не может быть короче или длиннее разрешённого в этих настройках
      if (word.length < min || word.length > max) continue;
      seen[word] = true;
      found.push({ word: word, points: toInt(entry.points, 1, 0, 99) });
    }
    return found;
  }

  /**
   * Приводит прочитанное к безопасному виду.
   * @returns {?{settings:Object, board:Object, path:number[], found:Array, score:number, remaining:number, finished:boolean}}
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.settings || typeof raw.settings !== 'object') return null;
    if (!root.Settings) return null;

    var settings = root.Settings.normalize(raw.settings);
    var board = normalizeBoard(raw.board, settings);
    if (!board) return null;

    var found = normalizeFound(raw.found, settings);
    var score = toInt(raw.score, 0, 0, 1000000);

    var remaining = Number(raw.remaining);
    if (!isFinite(remaining) || remaining < 0) remaining = 0;
    if (remaining > 900) remaining = 900;

    return {
      version: VERSION,
      settings: settings,
      board: board,
      path: normalizePath(raw.path, board.rows * board.cols, settings.reuseLetters),
      found: found,
      score: score,
      remaining: remaining,
      finished: raw.finished === true || remaining <= 0
    };
  }

  /**
   * Записывает состояние. Данные сначала проверяются, поэтому в хранилище
   * не может попасть мусор. Если хранилище недоступно — молча ничего не делает.
   */
  function save(data) {
    var store = storage();
    if (!store) return false;
    var clean = normalize(data);
    if (!clean) return false;
    try {
      store.setItem(KEY, JSON.stringify(clean));
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Читает состояние. null — сохранения нет или оно испорчено. */
  function load() {
    var store = storage();
    if (!store) return null;
    try {
      var text = store.getItem(KEY);
      if (!text) return null;
      return normalize(JSON.parse(text));
    } catch (err) {
      return null;
    }
  }

  function clear() {
    var store = storage();
    if (!store) return;
    try {
      store.removeItem(KEY);
    } catch (err) {
      /* ignore */
    }
  }

  root.GameState = {
    KEY: KEY,
    VERSION: VERSION,
    save: save,
    load: load,
    clear: clear,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
