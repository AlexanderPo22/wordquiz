'use strict';
/*
 * Проверка игровой логики без браузера.
 * Запуск: node tests/run-tests.js
 */

require('../js/util.js');
require('../js/wordlist.js');
require('../js/settings.js');
require('../js/game-core.js');
require('../js/game-state.js');
require('../js/theme.js');

const shim = require('./dom-shim');
const Theme = globalThis.Theme;

const Util = globalThis.Util;
const Settings = globalThis.Settings;
const Dictionary = globalThis.Dictionary;
const GameCore = globalThis.GameCore;
const GameState = globalThis.GameState;

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failures.push({ name, message: err && err.message ? err.message : String(err) });
    console.log('  FAIL ' + name + ' :: ' + (err && err.message ? err.message : err));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'values differ') + ' (получено: ' + JSON.stringify(actual) + ', ожидалось: ' + JSON.stringify(expected) + ')');
  }
}

console.log('\n== Словарь ==');
check('словарь загружен и непуст', () => {
  assert(Dictionary && Array.isArray(Dictionary.words), 'нет Dictionary.words');
  assert(Dictionary.words.length > 5000, 'слишком мало слов: ' + Dictionary.words.length);
});
check('все слова: только a-z, длина 3..10', () => {
  for (const w of Dictionary.words) {
    assert(/^[a-z]{3,10}$/.test(w), 'плохое слово: ' + JSON.stringify(w));
  }
});
check('словарь не содержит дубликатов', () => {
  assertEqual(new Set(Dictionary.words).size, Dictionary.words.length, 'есть дубликаты');
});
check('Dictionary.has работает', () => {
  assert(Dictionary.has('word'), 'word должно быть в словаре');
  assert(Dictionary.has('WORD'), 'поиск регистронезависимый');
  assert(!Dictionary.has('zzzzq'), 'zzzzq не должно быть в словаре');
  assert(!Dictionary.has(''), 'пустая строка не слово');
});
check('в словаре нет нежелательных слов из чёрного списка', () => {
  const blocklist = require('../tools/blocklist.js');
  const hits = blocklist.filter((word) => Dictionary.has(word));
  assertEqual(hits.length, 0, 'найдены нежелательные слова: ' + hits.slice(0, 10).join(', '));
});

console.log('\n== Утилиты ==');
check('склонение количества слов', () => {
  assertEqual(Util.plural(1, 'слово', 'слова', 'слов'), 'слово', '1');
  assertEqual(Util.plural(3, 'слово', 'слова', 'слов'), 'слова', '3');
  assertEqual(Util.plural(5, 'слово', 'слова', 'слов'), 'слов', '5');
  assertEqual(Util.plural(11, 'слово', 'слова', 'слов'), 'слов', '11');
  assertEqual(Util.plural(21, 'слово', 'слова', 'слов'), 'слово', '21');
  assertEqual(Util.plural(102, 'слово', 'слова', 'слов'), 'слова', '102');
  assertEqual(Util.plural(999, 'слово', 'слова', 'слов'), 'слов', '999');
});

console.log('\n== Настройки ==');
check('значения по умолчанию корректны', () => {
  const d = Settings.defaults();
  assertEqual(d.rows, 6, 'rows');
  assertEqual(d.cols, 6, 'cols');
  assertEqual(d.roundSeconds, 120, 'roundSeconds');
  assertEqual(d.minWordLength, 3, 'minWordLength');
  assertEqual(d.fillMode, 'dictionary', 'fillMode');
  assertEqual(d.mode, 'adjacent', 'режим по умолчанию');
  assertEqual(d.difficulty, 'normal', 'сложность по умолчанию');
});
check('режим игры: три значения, мусор → «Рядом»', () => {
  assertEqual(Settings.normalize({ mode: 'any' }).mode, 'any', 'any сохраняется');
  assertEqual(Settings.normalize({ mode: 'find' }).mode, 'find', 'find сохраняется');
  assertEqual(Settings.normalize({ mode: 'adjacent' }).mode, 'adjacent', 'adjacent сохраняется');
  assertEqual(Settings.normalize({ mode: 'nonsense' }).mode, 'adjacent', 'мусор → adjacent');
  assertEqual(Settings.normalize({}).mode, 'adjacent', 'по умолчанию adjacent');
  assertEqual(Settings.MODE_ORDER.length, 3, 'ровно три режима');
  for (const mode of Settings.MODE_ORDER) {
    assert(Settings.MODES[mode] && Settings.MODES[mode].title, 'нет названия режима ' + mode);
    assert(Settings.MODES[mode].hint, 'нет описания режима ' + mode);
  }
  // там, где соседство клеток не важно, диагональ считается включённой
  assertEqual(Settings.normalize({ mode: 'any', allowDiagonal: false }).allowDiagonal, true, 'диагональ в any');
  assertEqual(Settings.normalize({ mode: 'find', allowDiagonal: false }).allowDiagonal, true, 'диагональ в find');
  // у «Найди слово» свои, короткие настройки времени
  assertEqual(Settings.normalize({ mode: 'find' }).findSeconds, 30, 'время на слово по умолчанию');
  assertEqual(Settings.normalize({ mode: 'find' }).findBonus, 8, 'добавка по умолчанию');
  assertEqual(Settings.normalize({ mode: 'find', findSeconds: 5 }).findSeconds, 10, 'слишком короткое время зажато');
  assertEqual(Settings.normalize({ mode: 'find', findSeconds: 5000 }).findSeconds, 120, 'слишком длинное время зажато');
});
check('уровни сложности задают готовые наборы настроек', () => {
  assertEqual(Settings.DIFFICULTY_ORDER.length, 3, 'три уровня');
  for (const level of Settings.DIFFICULTY_ORDER) {
    const preset = Settings.DIFFICULTIES[level];
    assert(preset && preset.title, 'нет названия уровня ' + level);
    const applied = Settings.applyDifficulty(Settings.defaults(), level);
    assertEqual(applied.difficulty, level, 'уровень применён');
    assertEqual(applied.rows, preset.rows, 'строки уровня ' + level);
    assertEqual(applied.cols, preset.cols, 'столбцы уровня ' + level);
    assertEqual(applied.roundSeconds, preset.roundSeconds, 'время уровня ' + level);
    assertEqual(applied.minWordLength, preset.minWordLength, 'мин. длина уровня ' + level);
    assertEqual(applied.maxWordLength, preset.maxWordLength, 'макс. длина уровня ' + level);
    assertEqual(applied.seedWords, preset.seedWords, 'число слов уровня ' + level);
    // прочие настройки не должны меняться
    assertEqual(applied.showHint, true, 'показ подсказки не тронут');
    assertEqual(JSON.stringify(applied.points), JSON.stringify(Settings.DEFAULT_POINTS), 'очки не тронуты');
    assert(Settings.describeDifficulty(level).indexOf(String(preset.rows) + '×' + String(preset.cols)) !== -1,
      'описание уровня без размера поля: ' + Settings.describeDifficulty(level));
  }
  const easy = Settings.applyDifficulty(Settings.defaults(), 'easy');
  const hard = Settings.applyDifficulty(Settings.defaults(), 'hard');
  assert(easy.roundSeconds > hard.roundSeconds, 'на лёгком уровне времени больше');
  assert(easy.rows * easy.cols < hard.rows * hard.cols, 'на сложном уровне поле больше');
  assertEqual(Settings.applyDifficulty(Settings.defaults(), 'nonsense').difficulty, 'normal', 'мусор → normal');
  assertEqual(Settings.normalize({ difficulty: 'nonsense' }).difficulty, 'normal', 'мусор → normal');
});
check('normalize отбрасывает мусор и зажимает диапазоны', () => {
  const s = Settings.normalize({
    roundSeconds: -50, cols: 999, rows: 'abc', minWordLength: 99,
    maxWordLength: 1, penaltyForWrong: 42, fillMode: 'nonsense', points: { 3: 'x', 4: -5 }
  });
  assertEqual(s.roundSeconds, 15, 'roundSeconds зажат снизу');
  assertEqual(s.cols, 10, 'cols зажат сверху');
  assertEqual(s.rows, 6, 'rows — значение по умолчанию');
  assertEqual(s.minWordLength, 6, 'minWordLength зажат сверху');
  assert(s.maxWordLength >= s.minWordLength, 'maxWordLength >= minWordLength');
  assertEqual(s.penaltyForWrong, 5, 'penaltyForWrong зажат');
  assertEqual(s.fillMode, 'dictionary', 'неизвестный fillMode → dictionary');
  assertEqual(s.points[3], 1, 'битые очки → значение по умолчанию');
  assertEqual(s.points[4], 0, 'отрицательные очки зажаты в 0');
});
check('maxWordLength не больше числа клеток', () => {
  const s = Settings.normalize({ rows: 4, cols: 4, minWordLength: 3, maxWordLength: 12 });
  assertEqual(s.maxWordLength, 12, 'для 16 клеток 12 допустимо');
  const small = Settings.normalize({ rows: 4, cols: 4, minWordLength: 9, maxWordLength: 20 });
  assert(small.maxWordLength >= small.minWordLength, 'минимум не должен превышаться');
});
check('randomize всегда даёт валидные настройки', () => {
  const modes = new Set();
  const levels = new Set();
  for (let i = 0; i < 200; i++) {
    const s = Settings.randomize(Settings.defaults());
    const again = Settings.normalize(s);
    assertEqual(JSON.stringify(again), JSON.stringify(s), 'randomize вернул ненормализованные данные');
    assert(s.roundSeconds >= 15 && s.roundSeconds <= 900, 'время в диапазоне');
    assert(s.rows >= 4 && s.rows <= 10 && s.cols >= 4 && s.cols <= 10, 'размер поля в диапазоне');
    assert(s.minWordLength >= 3 && s.minWordLength <= 6, 'min длина в диапазоне');
    assert(s.maxWordLength >= s.minWordLength, 'max >= min');
    assert(s.seedWords >= 1, 'seedWords >= 1');
    assert(Settings.MODE_ORDER.indexOf(s.mode) !== -1, 'неизвестный режим: ' + s.mode);
    assert(Settings.DIFFICULTY_ORDER.indexOf(s.difficulty) !== -1, 'неизвестный уровень: ' + s.difficulty);
    // значения уровня должны сохраняться в случайных настройках
    const preset = Settings.DIFFICULTIES[s.difficulty];
    assertEqual(s.rows, preset.rows, 'размер поля не от уровня сложности');
    assertEqual(s.roundSeconds, preset.roundSeconds, 'время не от уровня сложности');
    modes.add(s.mode);
    levels.add(s.difficulty);
  }
  assertEqual(modes.size, 3, 'случайный режим должен встречаться все три');
  assertEqual(levels.size, 3, 'случайная сложность должна встречаться все три');
});
check('reset возвращает значения по умолчанию', () => {
  const r = Settings.reset();
  assertEqual(JSON.stringify(r), JSON.stringify(Settings.defaults()), 'reset != defaults');
});
check('storageAvailable распознаёт запрет хранилища', () => {
  assertEqual(Settings.storageAvailable(), false, 'без localStorage должно быть false');
  globalThis.localStorage = {
    getItem: function () { return null; },
    setItem: function () { },
    removeItem: function () { }
  };
  assertEqual(Settings.storageAvailable(), true, 'с рабочим localStorage — true');
  globalThis.localStorage = {
    getItem: function () { return null; },
    setItem: function () { throw new Error('доступ запрещён'); },
    removeItem: function () { }
  };
  assertEqual(Settings.storageAvailable(), false, 'если запись запрещена — false');
  delete globalThis.localStorage;
});
check('очки по длине слова', () => {
  const p = Settings.DEFAULT_POINTS;
  assertEqual(Settings.pointsForLength(3, p), 1, '3 буквы');
  assertEqual(Settings.pointsForLength(6, p), 5, '6 букв');
  assertEqual(Settings.pointsForLength(8, p), 10, '8 букв');
  assertEqual(Settings.pointsForLength(12, p), 10, 'длиннее таблицы → максимум');
  assert(Settings.pointsForLength(3, p) < Settings.pointsForLength(6, p), 'длинные слова дороже');
});
check('настройки переживают передачу ссылкой', () => {
  const source = Settings.normalize({ rows: 7, cols: 5, roundSeconds: 90, fillMode: 'random', points: { 3: 2, 8: 20 } });
  const encoded = Settings.encode(source);
  assert(encoded.indexOf('&') === -1, 'в ссылке не должно быть сырых символов');
  const restored = Settings.fromQuery('?s=' + encoded);
  assertEqual(JSON.stringify(restored), JSON.stringify(source), 'настройки не совпали');
  assertEqual(Settings.fromQuery(''), null, 'пустая строка');
  assertEqual(Settings.fromQuery('?s=%%%'), null, 'битая ссылка не должна ломать игру');
  assertEqual(Settings.fromQuery('?other=1'), null, 'чужие параметры игнорируются');
});

console.log('\n== Пресеты ==');
check('три пресета по умолчанию', () => {
  const list = Settings.presetDefaults();
  assertEqual(Settings.PRESET_COUNT, 3, 'ячеек ровно три');
  assertEqual(list.length, 3, 'наборов ровно три');
  assertEqual(list[0].mode, 'adjacent', 'первый — «Рядом»');
  assertEqual(list[0].difficulty, 'normal', 'первый — «Средне»');
  assertEqual(list[1].difficulty, 'easy', 'второй — «Легко»');
  assertEqual(list[2].mode, 'any', 'третий — «Любые»');
  for (const preset of list) {
    assertEqual(JSON.stringify(Settings.normalize(preset)), JSON.stringify(preset), 'пресет не нормализован');
  }
});
check('пресеты сохраняются и загружаются', () => {
  const storage = {
    data: new Map(),
    getItem: function (key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem: function (key, value) { this.data.set(key, value); },
    removeItem: function (key) { this.data.delete(key); }
  };
  globalThis.localStorage = storage;

  const initial = Settings.loadPresets();
  assertEqual(initial.active, 0, 'активный пресет по умолчанию — первый');
  initial.slots[2] = Settings.applyDifficulty(Settings.defaults(), 'hard');
  initial.active = 2;
  const saved = Settings.savePresets(initial);
  assertEqual(saved.active, 2, 'активный пресет сохранён');

  const loaded = Settings.loadPresets();
  assertEqual(loaded.active, 2, 'активный пресет загружен');
  assertEqual(loaded.slots[2].rows, 7, 'настройки третьего пресета');
  assertEqual(loaded.slots[2].difficulty, 'hard', 'уровень третьего пресета');
  assertEqual(loaded.slots[0].rows, Settings.defaults().rows, 'первый пресет не тронут');

  delete globalThis.localStorage;
});
check('битые пресеты не ломают настройки', () => {
  globalThis.localStorage = {
    getItem: function () { return '{не json'; },
    setItem: function () { },
    removeItem: function () { }
  };
  const state = Settings.loadPresets();
  assertEqual(state.slots.length, 3, 'ячеек всё равно три');
  assertEqual(state.active, 0, 'активный пресет сброшен');
  delete globalThis.localStorage;

  const weird = Settings.normalizePresets({ active: 99, slots: [null, { rows: 'abc' }] });
  assertEqual(weird.active, 2, 'активный пресет зажат в диапазон');
  assertEqual(weird.slots.length, 3, 'ячеек три');
  assert(weird.slots[1].rows >= 4, 'мусор заменён корректными настройками');
});
check('sameSettings и describeSettings', () => {
  const a = Settings.defaults();
  const b = Settings.defaults();
  assert(Settings.sameSettings(a, b), 'одинаковые настройки должны совпадать');
  b.roundSeconds = 60;
  assert(!Settings.sameSettings(a, b), 'разные настройки не должны совпадать');
  assert(Settings.describeSettings(a).indexOf('Рядом') !== -1, 'в описании нет режима');
  assert(Settings.describeSettings(a).indexOf('6×6') !== -1, 'в описании нет размера поля');
  const custom = Settings.defaults();
  custom.rows = 8;
  custom.cols = 8;
  assert(Settings.describeSettings(custom).indexOf('свои настройки') !== -1, 'свои значения не отмечены');
  assert(Settings.matchesDifficulty(Settings.applyDifficulty(Settings.defaults(), 'easy')), 'набор «Легко» должен совпадать');
  assert(!Settings.matchesDifficulty(custom), 'свои значения не должны считаться набором');
});

console.log('\n== Поле ==');
check('соседи: угловая клетка 3x3', () => {
  assertEqual(GameCore.neighborTable(3, 3, true)[0].length, 3, 'с диагоналями');
  assertEqual(GameCore.neighborTable(3, 3, false)[0].length, 2, 'без диагоналей');
  assertEqual(GameCore.neighborTable(3, 3, true)[4].length, 8, 'центр с диагоналями');
});
check('generateBoard: размер и алфавит', () => {
  const rng = Util.makeRng(12345);
  const board = GameCore.generateBoard(Settings.defaults(), rng);
  assertEqual(board.letters.length, board.rows * board.cols, 'число клеток');
  assertEqual(board.rows, 6, 'строки');
  assertEqual(board.cols, 6, 'столбцы');
  for (const ch of board.letters) assert(/^[a-z]$/.test(ch), 'плохая буква: ' + ch);
});
check('generateBoard: детерминирован при одном seed', () => {
  const s = Settings.defaults();
  const a = GameCore.generateBoard(s, Util.makeRng(777));
  const b = GameCore.generateBoard(s, Util.makeRng(777));
  assertEqual(a.letters.join(''), b.letters.join(''), 'поле не совпало');
  const c = GameCore.generateBoard(s, Util.makeRng(778));
  assert(a.letters.join('') !== c.letters.join(''), 'разные seed → разные поля');
});
check('все заложенные слова реально находятся на поле', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = Settings.normalize({ rows: 6, cols: 6, minWordLength: 3, maxWordLength: 8, seedWords: 8, fillMode: 'dictionary' });
    const board = GameCore.generateBoard(s, Util.makeRng(seed));
    const trie = GameCore.buildTrie(Dictionary.words, s.minWordLength, s.maxWordLength);
    const res = GameCore.findAllWords(board, trie, {
      allowDiagonal: s.allowDiagonal, reuseLetters: s.reuseLetters,
      minLength: s.minWordLength, maxLength: s.maxWordLength, visitLimit: 300000
    });
    const found = new Set(res.words);
    for (const seedWord of board.seedWords) {
      assert(found.has(seedWord), 'seed #' + seed + ': слово "' + seedWord + '" не найдено на поле ' + board.letters.join(''));
    }
  }
});
check('словарный режим даёт заметно больше слов, чем случайный', () => {
  const base = Settings.normalize({ rows: 6, cols: 6, minWordLength: 3, maxWordLength: 8, seedWords: 8 });
  const trie = GameCore.buildTrie(Dictionary.words, 3, 8);
  const opts = { allowDiagonal: true, reuseLetters: false, minLength: 3, maxLength: 8, visitLimit: 400000 };
  let dictTotal = 0, randomTotal = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const dictBoard = GameCore.generateBoard(Object.assign({}, base, { fillMode: 'dictionary' }), Util.makeRng(seed));
    const randBoard = GameCore.generateBoard(Object.assign({}, base, { fillMode: 'random' }), Util.makeRng(seed));
    dictTotal += GameCore.findAllWords(dictBoard, trie, opts).words.length;
    randomTotal += GameCore.findAllWords(randBoard, trie, opts).words.length;
  }
  assert(dictTotal > randomTotal, 'словарное поле должно быть богаче (' + dictTotal + ' vs ' + randomTotal + ')');
  assert(randomTotal > 0, 'случайное поле тоже должно содержать слова');
});
check('поле 10x10 с повтором букв считается быстро', () => {
  const s = Settings.normalize({ rows: 10, cols: 10, minWordLength: 3, maxWordLength: 8, seedWords: 10 });
  const board = GameCore.generateBoard(s, Util.makeRng(4242));
  const trie = GameCore.buildTrie(Dictionary.words, 3, 8);
  const started = Date.now();
  const res = GameCore.findAllWords(board, trie, {
    allowDiagonal: true, reuseLetters: true, minLength: 3, maxLength: 8, visitLimit: 600000
  });
  const elapsed = Date.now() - started;
  console.log('       (10x10, повтор букв: ' + res.words.length + ' слов, ' + res.visits + ' шагов, ' + elapsed + ' мс)');
  assert(elapsed < 3000, 'слишком долго: ' + elapsed + ' мс');
});

console.log('\n== Режим «Любые буквы» ==');
check('режим «Любые»: слова отыскиваются по составу букв, а не по соседству', () => {
  // «cat» лежит в углах: клетки 0 → 7 → 8 не соседние
  const board = { rows: 3, cols: 3, letters: ['c', 'x', 'x', 'x', 'x', 'x', 'x', 'a', 't'] };
  const any = GameCore.findAllWords(board, null, { mode: 'any', minLength: 3, maxLength: 6 });
  assert(any.words.indexOf('cat') !== -1, 'в режиме «любые» слово cat должно находиться');
  const trie = GameCore.buildTrie(Dictionary.words, 3, 6);
  const adjacent = GameCore.findAllWords(board, trie, {
    allowDiagonal: false, reuseLetters: false, minLength: 3, maxLength: 6
  });
  assert(adjacent.words.indexOf('cat') === -1, 'по соседству cat находиться не должен');
});
check('canBuildWord учитывает количество букв', () => {
  assert(GameCore.canBuildWord('cat', { c: 1, a: 1, t: 1 }, false), 'cat из набора');
  assert(!GameCore.canBuildWord('add', { a: 1, d: 1 }, false), 'add нужны две d');
  assert(GameCore.canBuildWord('add', { a: 1, d: 1 }, true), 'с повтором букв add можно');
  assert(!GameCore.canBuildWord('dog', { d: 1, o: 1 }, false), 'нет g');
});
check('generateBoard в режиме «любые»: заложенные слова находятся', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = Settings.normalize({
      mode: 'any', rows: 6, cols: 6, minWordLength: 3, maxWordLength: 8,
      seedWords: 6, fillMode: 'dictionary'
    });
    const board = GameCore.generateBoard(s, Util.makeRng(seed));
    assertEqual(board.letters.length, 36, 'клеток на поле');
    for (const letter of board.letters) assert(/^[a-z]$/.test(letter), 'плохая буква: ' + letter);
    const res = GameCore.findAllWords(board, null, { mode: 'any', minLength: 3, maxLength: 8 });
    assert(res.words.length > 20, 'слишком бедное поле: ' + res.words.length + ' слов');
    assert(board.seedWords.length > 0, 'нет заложенных слов');
    for (const word of board.seedWords) {
      assert(res.words.indexOf(word) !== -1, 'заложенное слово "' + word + '" не найдено на поле ' + board.letters.join(''));
    }
  }
});
check('поле 10x10 в режиме «любые» считается быстро', () => {
  const s = Settings.normalize({ mode: 'any', rows: 10, cols: 10, minWordLength: 3, maxWordLength: 10, seedWords: 12 });
  const board = GameCore.generateBoard(s, Util.makeRng(99));
  const started = Date.now();
  const res = GameCore.findAllWords(board, null, { mode: 'any', minLength: 3, maxLength: 10 });
  const elapsed = Date.now() - started;
  console.log('       (10x10, любые буквы: ' + res.words.length + ' слов, ' + elapsed + ' мс)');
  assert(res.words.length > 100, 'слишком мало слов: ' + res.words.length);
  assert(elapsed < 2000, 'слишком долго: ' + elapsed + ' мс');
});

console.log('\n== Путь и проверка слов ==');
check('isValidPath: соседство и повтор клеток', () => {
  const board = { rows: 3, cols: 3, letters: 'abcdefghi'.split('') };
  assert(GameCore.isValidPath(board, [0, 1, 2], { allowDiagonal: false }), 'строка подряд');
  assert(GameCore.isValidPath(board, [0, 4, 8], { allowDiagonal: true }), 'диагональ разрешена');
  assert(!GameCore.isValidPath(board, [0, 4, 8], { allowDiagonal: false }), 'диагональ запрещена');
  assert(!GameCore.isValidPath(board, [0, 2], { allowDiagonal: false }), 'не соседи');
  assert(!GameCore.isValidPath(board, [0, 1, 0], { allowDiagonal: false }), 'повтор клетки запрещён');
  assert(GameCore.isValidPath(board, [0, 1, 0], { allowDiagonal: false, reuseLetters: true }), 'повтор разрешён настройкой');
  assert(!GameCore.isValidPath(board, [], {}), 'пустой путь');
});
check('wordFromPath собирает слово', () => {
  const board = { rows: 2, cols: 2, letters: ['c', 'a', 't', 's'] };
  assertEqual(GameCore.wordFromPath(board, [0, 1, 2]), 'cat', 'слово из пути');
});
check('validateWord: словарь, длина, путь', () => {
  // поле 1x4: клетки 0..3 стоят в ряд и читаются как «word»
  const board = { rows: 1, cols: 4, letters: ['w', 'o', 'r', 'd'] };
  const opts = { allowDiagonal: true, reuseLetters: false, minLength: 3, maxLength: 8 };
  assert(GameCore.validateWord('word', board, [0, 1, 2, 3], opts).ok, 'word должно приниматься');
  assertEqual(GameCore.validateWord('zzzzq', board, null, opts).reason, 'unknown', 'незнакомое слово');
  assertEqual(GameCore.validateWord('at', board, null, opts).reason, 'too-short', 'короткое слово');
  assertEqual(GameCore.validateWord('word', board, [0, 2, 3, 1], opts).reason, 'bad-path', 'разорванный путь');
  assertEqual(GameCore.validateWord('word', board, [0, 1, 2, 9], opts).reason, 'bad-path', 'клетка вне поля');
  const long = GameCore.validateWord('word', board, [0, 1, 2, 3], { minLength: 3, maxLength: 3 });
  assertEqual(long.reason, 'too-long', 'превышена максимальная длина');
});
check('режим «Любые»: путь без соседства и проверка слова', () => {
  const scattered = { rows: 3, cols: 3, letters: ['c', 'x', 'x', 'x', 'x', 'x', 'x', 'a', 't'] };
  assert(GameCore.isValidPath(scattered, [0, 7, 8], { mode: 'any' }), 'любые клетки допустимы');
  assert(!GameCore.isValidPath(scattered, [0, 0], { mode: 'any' }), 'одну клетку дважды нельзя');
  assert(GameCore.isValidPath(scattered, [0, 0], { mode: 'any', reuseLetters: true }), 'повтор разрешён настройкой');

  const anyOpts = { mode: 'any', minLength: 3, maxLength: 6 };
  assert(GameCore.validateWord('cat', scattered, [0, 7, 8], anyOpts).ok, 'слово из любых клеток');
  assertEqual(GameCore.validateWord('cat', scattered, [0, 7, 8], { mode: 'adjacent', minLength: 3, maxLength: 6 }).reason,
    'bad-path', 'в режиме «рядом» такой путь недопустим');
  // путь не совпадает с буквами слова — это не «плохой путь», а незнакомое слово
  assertEqual(GameCore.validateWord('zzz', scattered, [0, 1, 2], anyOpts).reason, 'unknown', 'zzz нет в словаре');
});

console.log('\n== Сохранение состояния ==');
check('состояние сохраняется и читается', () => {
  const storage = {
    data: new Map(),
    getItem: function (key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem: function (key, value) { this.data.set(key, value); },
    removeItem: function (key) { this.data.delete(key); }
  };
  globalThis.localStorage = storage;

  const settings = Settings.normalize({ rows: 5, cols: 5, roundSeconds: 60, minWordLength: 3, maxWordLength: 6 });
  const board = GameCore.generateBoard(settings, Util.makeRng(42));
  const data = {
    settings: settings,
    board: board,
    path: [0, 1],
    found: [{ word: 'cat', points: 1 }],
    score: 1,
    remaining: 42.5,
    finished: false
  };
  assertEqual(GameState.save(data), true, 'запись не удалась');
  const restored = GameState.load();
  assert(restored, 'состояние не прочиталось');
  assertEqual(restored.board.letters.join(''), board.letters.join(''), 'поле не совпало');
  assertEqual(restored.settings.rows, 5, 'настройки не совпали');
  assertEqual(restored.score, 1, 'очки не совпали');
  assertEqual(restored.found.length, 1, 'слова не совпали');
  assertEqual(restored.path.join(','), '0,1', 'выбранные буквы не совпали');
  assert(restored.remaining > 42 && restored.remaining <= 42.5, 'остаток времени: ' + restored.remaining);
  assertEqual(restored.finished, false, 'признак завершения');

  GameState.clear();
  assertEqual(GameState.load(), null, 'после очистки состояния быть не должно');
  delete globalThis.localStorage;
});
check('без сохранения и без хранилища игра стартует как обычно', () => {
  assertEqual(GameState.load(), null, 'без localStorage состояние должно быть null');
  globalThis.localStorage = { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } };
  assertEqual(GameState.load(), null, 'пустое хранилище — нет состояния');
  assertEqual(GameState.save({ settings: Settings.defaults() }), false, 'без поля сохранять нечего');
  delete globalThis.localStorage;
});
check('битое сохранение не ломает игру', () => {
  const cases = [
    '{не json',
    'null',
    '[]',
    JSON.stringify({ settings: Settings.defaults() }),
    JSON.stringify({ settings: Settings.defaults(), board: { rows: 6, cols: 6, letters: ['x'] } }),
    JSON.stringify({ settings: Settings.defaults(), board: { rows: 9, cols: 9, letters: new Array(81).fill('a') } }),
    JSON.stringify({ settings: Settings.defaults(), board: { rows: 6, cols: 6, letters: new Array(36).fill('1') } })
  ];
  for (const text of cases) {
    globalThis.localStorage = { getItem: function () { return text; }, setItem: function () { }, removeItem: function () { } };
    assertEqual(GameState.load(), null, 'битые данные должны давать null: ' + text.slice(0, 40));
  }
  delete globalThis.localStorage;
});
check('сохранение не пускает в игру чужое поле', () => {
  const settings = Settings.normalize({ rows: 6, cols: 6 });
  const board = GameCore.generateBoard(settings, Util.makeRng(7));
  const other = Settings.normalize({ rows: 6, cols: 6, roundSeconds: 300 });
  // настройки отличаются, но поле подходит по размеру — проверяем, что поле цело
  const restored = GameState.normalize({
    settings: other, board: board, path: [], found: [], score: 0, remaining: 100
  });
  assert(restored, 'поле 6×6 должно приниматься');
  assertEqual(restored.board.letters.join(''), board.letters.join(''), 'поле изменилось');

  // поле другого размера не подходит
  const wrong = GameState.normalize({
    settings: other, board: { rows: 5, cols: 5, letters: new Array(25).fill('a') }, path: [], found: [], score: 0, remaining: 100
  });
  assertEqual(wrong, null, 'поле другого размера должно отбрасываться');
});
check('мусор в пути и словах отфильтровывается', () => {
  const settings = Settings.normalize({ rows: 5, cols: 5, minWordLength: 3, maxWordLength: 6 });
  const board = GameCore.generateBoard(settings, Util.makeRng(11));
  const restored = GameState.normalize({
    settings: settings,
    board: board,
    path: [0, 0, 999, -5, 3],
    found: [{ word: 'cat', points: 2 }, { word: 'CAT', points: 5 }, { word: 'zz' }, { word: 42 }, null, { word: 'dog', points: 'x' }],
    score: 'abc',
    remaining: -10
  });
  assert(restored, 'состояние должно читаться');
  assertEqual(restored.path.join(','), '0,3', 'повторы и выход за поле убраны');
  assertEqual(restored.found.length, 2, 'слова-дубликаты и мусор убраны');
  assertEqual(restored.found[0].points, 2, 'очки слова сохранены');
  assertEqual(restored.found[1].points, 1, 'битые очки заменены');
  assertEqual(restored.score, 0, 'битые очки партии заменены');
  assertEqual(restored.remaining, 0, 'отрицательное время зажато');
  assertEqual(restored.finished, true, 'нулевое время — раунд завершён');
});

console.log('\n== Тема оформления ==');

/**
 * Ставит подставное хранилище и возвращает функцию для возврата как было.
 * Хранилище делаем на прототипе: свойства экземпляра в Node.js видны скриптам
 * как «не свои», и это ломало бы обычные вызовы store.getItem.
 */
function withStorage(store) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const shimStore = Object.create(store);
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
    shimStore[method] = function () { return store[method].apply(store, arguments); };
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: shimStore, configurable: true, writable: true
  });
  return function () {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  };
}

check('новая сессия: сохранённая тема поднимается из хранилища', () => {
  const store = shim.createLocalStorage();
  const restore = withStorage(store);
  try {
    store.setItem(Theme.KEY, 'dark');
    // так выглядит обновление страницы: скрипт загружается заново и читает выбор
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
    const fresh = globalThis.Theme;
    assertEqual(fresh.stored(), 'dark', 'тема поднимается из хранилища');
    assertEqual(fresh.shown(), 'dark', 'тёмная тема активна после загрузки');
    assertEqual(fresh.isDark(), true, 'кнопка будет предлагать светлую');
  } finally {
    restore();
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
  }
});
check('тема идёт за системной настройкой, пока игрок не выбрал сам', () => {
  const store = shim.createLocalStorage();
  const restore = withStorage(store);
  const media = shim.createMatchMedia();
  const savedMedia = globalThis.matchMedia;
  globalThis.matchMedia = media;
  try {
    store.removeItem(Theme.KEY);
    media.setSystem(false);
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
    assertEqual(globalThis.Theme.stored(), null, 'игрок тему не выбирал');
    assertEqual(globalThis.Theme.shown(), 'light', 'в системе светлая — и на сайте светлая');

    // системная настройка поменялась уже при открытой странице
    media.setSystem(true);
    globalThis.Theme.apply();
    assertEqual(globalThis.Theme.shown(), 'dark', 'система стала тёмной — сайт тоже');
    assertEqual(globalThis.Theme.isDark(), true, 'тёмная тема включилась');
    assertEqual(globalThis.Theme.stored(), null, 'системная тема не стала выбором игрока');

    media.setSystem(false);
    globalThis.Theme.apply();
    assertEqual(globalThis.Theme.shown(), 'light', 'система вернулась к светлой');
    assertEqual(globalThis.Theme.stored(), null, 'выбора игрока так и нет');

    globalThis.Theme.toggle();
    assertEqual(store.getItem(Theme.KEY), 'dark', 'игрок выбрал тёмную');
    media.setSystem(false);
    assertEqual(globalThis.Theme.shown(), 'dark', 'выбор игрока важнее системной настройки');
  } finally {
    globalThis.matchMedia = savedMedia;
    restore();
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
  }
});
check('тема переключается и запоминается', () => {
  const store = shim.createLocalStorage();
  const restore = withStorage(store);
  try {
    store.removeItem(Theme.KEY);
    assertEqual(Theme.stored(), null, 'пока игрок не выбирал — выбора нет');
    assertEqual(Theme.shown(), 'light', 'показывается светлая тема');

    assertEqual(Theme.toggle(), 'dark', 'первое нажатие включает тёмную');
    assertEqual(store.getItem(Theme.KEY), 'dark', 'выбор записан');
    assertEqual(Theme.shown(), 'dark', 'тёмная тема активна');

    assertEqual(Theme.toggle(), 'light', 'второе нажатие возвращает светлую');
    assertEqual(store.getItem(Theme.KEY), 'light', 'светлая тема тоже запоминается');
    assertEqual(Theme.shown(), 'light', 'показывается светлая тема');
  } finally {
    restore();
    Theme.apply('light');
  }
});
check('без хранилища тема всё равно переключается', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: function () { throw new Error('доступ к хранилищу запрещён'); },
    set: function () { throw new Error('доступ к хранилищу запрещён'); }
  });
  try {
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
    const fresh = globalThis.Theme;

    assertEqual(fresh.storageAvailable(), false, 'хранилище недоступно');
    assertEqual(fresh.stored(), null, 'выбора игрока нет');
    assertEqual(fresh.shown(), fresh.systemMode(), 'показывается системная тема');
    assertEqual(fresh.toggle(), 'dark', 'тема всё равно переключается');
    assertEqual(fresh.shown(), 'dark', 'тема применилась без хранилища');
    assertEqual(fresh.toggle(), 'light', 'и переключается обратно');
    assertEqual(fresh.shown(), 'light', 'вернулись к светлой');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
  }
});
check('мусор в сохранённой теме игнорируется', () => {
  assertEqual(Theme.normalize(' DARK '), 'dark', 'регистр и пробелы не мешают');
  assertEqual(Theme.normalize(''), null, 'пустая строка не тема');
  assertEqual(Theme.normalize(null), null, 'null не тема');
  assertEqual(Theme.normalize(42), null, 'число не тема');

  const store = shim.createLocalStorage();
  const restore = withStorage(store);
  try {
    store.setItem(Theme.KEY, 'тёмная');
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
    assertEqual(globalThis.Theme.stored(), null, 'непонятное значение не принимается');
    assertEqual(globalThis.Theme.shown(), globalThis.Theme.systemMode(), 'показывается системная тема');
  } finally {
    restore();
    delete require.cache[require.resolve('../js/theme.js')];
    require('../js/theme.js');
  }
});

console.log('\n== Итог ==');
console.log('Пройдено: ' + passed + ', провалено: ' + failures.length);
if (failures.length) {
  for (const f of failures) console.log('  - ' + f.name + ': ' + f.message);
  process.exit(1);
}
