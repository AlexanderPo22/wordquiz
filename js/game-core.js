/* Ядро игры: генерация поля, поиск слов, проверка пути, очки. */
(function (root) {
  'use strict';

  /* Частоты букв, слегка «подкрученные» под игру: гласных больше, чем в обычном тексте. */
  var LETTER_WEIGHTS = {
    a: 9, b: 2, c: 3, d: 4, e: 11, f: 2, g: 3, h: 4, i: 8, j: 1, k: 1, l: 5,
    m: 3, n: 6, o: 8, p: 3, q: 1, r: 6, s: 5, t: 7, u: 5, v: 2, w: 2, x: 1,
    y: 3, z: 1
  };
  var ALPHABET = Object.keys(LETTER_WEIGHTS);
  var WEIGHT_TOTAL = ALPHABET.reduce(function (sum, ch) { return sum + LETTER_WEIGHTS[ch]; }, 0);

  var neighborCache = Object.create(null);

  /** Таблица соседей: для каждой клетки — индексы соседних клеток. */
  function neighborTable(rows, cols, allowDiagonal) {
    var key = rows + 'x' + cols + (allowDiagonal ? 'd' : 'o');
    if (neighborCache[key]) return neighborCache[key];
    var table = new Array(rows * cols);
    var deltas = allowDiagonal
      ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var list = [];
        for (var d = 0; d < deltas.length; d++) {
          var nr = r + deltas[d][0];
          var nc = c + deltas[d][1];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          list.push(nr * cols + nc);
        }
        table[r * cols + c] = list;
      }
    }
    neighborCache[key] = table;
    return table;
  }

  function randomLetter(rng) {
    var roll = rng() * WEIGHT_TOTAL;
    for (var i = 0; i < ALPHABET.length; i++) {
      roll -= LETTER_WEIGHTS[ALPHABET[i]];
      if (roll <= 0) return ALPHABET[i];
    }
    return 'e';
  }

  function emptyGrid(rows, cols) {
    var letters = new Array(rows * cols);
    for (var i = 0; i < letters.length; i++) letters[i] = null;
    return letters;
  }

  /** Пытается «змейкой» разложить слово по полю, не ломая уже разложенные слова. */
  function tryPlaceWord(letters, neighbors, word, rng, attempts) {
    var tries = attempts || 80;
    for (var attempt = 0; attempt < tries; attempt++) {
      var start = Math.floor(rng() * letters.length);
      // стартовая клетка тоже должна быть пустой или уже содержать нужную букву,
      // иначе новое слово затрёт букву ранее разложенного слова
      if (letters[start] !== null && letters[start] !== word.charAt(0)) continue;
      var path = [start];
      var ok = true;
      for (var i = 1; i < word.length; i++) {
        var from = path[path.length - 1];
        var nb = neighbors[from];
        var candidates = [];
        for (var k = 0; k < nb.length; k++) {
          var n = nb[k];
          if (path.indexOf(n) !== -1) continue;
          var current = letters[n];
          if (current !== null && current !== word.charAt(i)) continue;
          candidates.push(n);
        }
        if (candidates.length === 0) { ok = false; break; }
        path.push(candidates[Math.floor(rng() * candidates.length)]);
      }
      if (!ok) continue;
      for (var j = 0; j < word.length; j++) letters[path[j]] = word.charAt(j);
      return true;
    }
    return false;
  }

  /** Слова-кандидаты для «словарного» заполнения поля. */
  function candidateWords(settings, maxPlaceable) {
    var dict = root.Dictionary;
    if (!dict) return [];
    var pool = [];
    for (var len = settings.minWordLength; len <= maxPlaceable; len++) {
      var bucket = dict.byLength[len];
      if (bucket) pool = pool.concat(bucket);
    }
    return pool;
  }

  function freeCells(letters) {
    var out = [];
    for (var i = 0; i < letters.length; i++) if (letters[i] === null) out.push(i);
    return out;
  }

  /** Режимы, где соседство клеток не важно: буквы берутся откуда угодно. */
  function isFreeOrder(mode) {
    return mode === 'any' || mode === 'find';
  }

  /**
   * Слово для режима «Найди слово». Берём слова подлиннее: искать их интереснее,
   * а короткие находятся слишком быстро.
   */
  function pickTargetWord(settings, rng, avoid) {
    var dict = root.Dictionary;
    if (!dict || !dict.byLength) return null;
    var cells = settings.rows * settings.cols;
    var maxLen = Math.min(settings.maxWordLength, cells, dict.maxLength || 15);
    if (maxLen < 3) return null;
    var minLen = Math.min(settings.minWordLength, maxLen);
    var lo = Math.min(maxLen, Math.max(minLen, Math.ceil((minLen + maxLen) / 2)));
    var guard = 80;
    while (guard-- > 0) {
      var len = root.Util.randInt(rng, lo, maxLen);
      var bucket = dict.byLength[len];
      if (!bucket || !bucket.length) continue;
      var word = bucket[Math.floor(rng() * bucket.length)];
      if (avoid && avoid[word] === true) continue;
      return word;
    }
    return null;
  }

  /** Раскладывает загаданное слово по случайным клеткам: найти его можно всегда. */
  function placeTargetWord(letters, settings, rng, avoid) {
    var word = pickTargetWord(settings, rng, avoid);
    if (!word) return null;
    var order = root.Util.shuffle(rng, letters.map(function (unused, index) { return index; }));
    for (var i = 0; i < word.length; i++) letters[order[i]] = word.charAt(i);
    return word;
  }

  /**
   * Режим «любые буквы»: слова не выкладываются цепочкой, а просто рассыпаются
   * по свободным клеткам — важно лишь, чтобы все их буквы были на поле.
   */
  function scatterWords(letters, wanted, minLength, maxPlaceable, rng) {
    var dict = root.Dictionary;
    var placed = [];
    if (!dict || !dict.byLength) return placed;
    var guard = wanted * 8;
    while (placed.length < wanted && guard-- > 0) {
      var len = root.Util.randInt(rng, minLength, maxPlaceable);
      var bucket = dict.byLength[len];
      if (!bucket || !bucket.length) continue;
      var word = bucket[Math.floor(rng() * bucket.length)];
      if (placed.indexOf(word) !== -1) continue;
      var free = freeCells(letters);
      if (free.length < word.length) break;
      var shuffled = root.Util.shuffle(rng, free);
      for (var j = 0; j < word.length; j++) letters[shuffled[j]] = word.charAt(j);
      placed.push(word);
    }
    return placed;
  }

  /**
   * Создаёт игровое поле.
   * @returns {{rows:number, cols:number, letters:string[], seedWords:string[], target:?string}}
   */
  function generateBoard(settings, rng, avoid) {
    var r = rng || Math.random;
    var s = root.Settings ? root.Settings.normalize(settings) : settings;
    var rows = s.rows;
    var cols = s.cols;
    var letters = emptyGrid(rows, cols);
    var neighbors = neighborTable(rows, cols, s.allowDiagonal);
    var seedWords = [];
    var target = null;

    if (s.mode === 'find') {
      target = placeTargetWord(letters, s, r, avoid);
    } else if (s.fillMode === 'dictionary' && Math.min(s.maxWordLength, 8, rows * cols) >= s.minWordLength) {
      var maxPlaceable = Math.min(s.maxWordLength, 8, rows * cols);
      if (s.mode === 'any') {
        seedWords = scatterWords(letters, Math.min(s.seedWords, rows * cols), s.minWordLength, maxPlaceable, r);
      } else if (candidateWords(s, maxPlaceable).length) {
        var wanted = Math.min(s.seedWords, rows * cols);
        var guard = wanted * 6;
        while (seedWords.length < wanted && guard-- > 0) {
          // Сначала выбираем длину, потом слово: так на поле попадают и короткие слова.
          var len = root.Util.randInt(r, s.minWordLength, maxPlaceable);
          var bucket = root.Dictionary.byLength[len];
          if (!bucket || !bucket.length) continue;
          var word = bucket[Math.floor(r() * bucket.length)];
          if (seedWords.indexOf(word) !== -1) continue;
          if (tryPlaceWord(letters, neighbors, word, r)) seedWords.push(word);
        }
      }
    }

    for (var i = 0; i < letters.length; i++) {
      if (letters[i] === null) letters[i] = randomLetter(r);
    }

    return { rows: rows, cols: cols, letters: letters, seedWords: seedWords, target: target };
  }

  /** Префиксное дерево словаря — нужно, чтобы быстро искать слова на поле. */
  function buildTrie(words, minLength, maxLength) {
    var rootNode = { w: false, c: Object.create(null) };
    for (var i = 0; i < words.length; i++) {
      var word = String(words[i]).toLowerCase();
      if (word.length < minLength || word.length > maxLength) continue;
      var node = rootNode;
      for (var j = 0; j < word.length; j++) {
        var ch = word.charAt(j);
        var next = node.c[ch];
        if (!next) {
          next = { w: false, c: Object.create(null) };
          node.c[ch] = next;
        }
        node = next;
      }
      node.w = true;
    }
    return rootNode;
  }

  function letterCounts(letters) {
    var counts = Object.create(null);
    for (var i = 0; i < letters.length; i++) {
      var ch = letters[i];
      counts[ch] = (counts[ch] || 0) + 1;
    }
    return counts;
  }

  /** Можно ли собрать слово из имеющихся на поле букв. */
  function canBuildWord(word, counts, reuseLetters) {
    var i;
    if (reuseLetters) {
      for (i = 0; i < word.length; i++) {
        if (!(counts[word.charAt(i)] > 0)) return false;
      }
      return true;
    }
    var need = Object.create(null);
    for (i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      need[ch] = (need[ch] || 0) + 1;
      if (need[ch] > (counts[ch] || 0)) return false;
    }
    return true;
  }

  /**
   * Режим «любые буквы»: порядок и соседство не важны, поэтому слова просто
   * перебираются по словарю и проверяются на состав букв.
   */
  function findAllWordsFromLetters(board, options) {
    var opts = options || {};
    var dict = root.Dictionary;
    var minLength = opts.minLength || 3;
    var maxLength = opts.maxLength || 12;
    var reuse = !!opts.reuseLetters;
    var counts = letterCounts(board.letters);
    var words = [];
    if (dict && dict.byLength) {
      var limit = Math.min(maxLength, dict.maxLength || maxLength);
      for (var len = minLength; len <= limit; len++) {
        var bucket = dict.byLength[len];
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          if (canBuildWord(bucket[i], counts, reuse)) words.push(bucket[i]);
        }
      }
    }
    return { words: words, truncated: false, visits: words.length };
  }

  /**
   * Ищет все слова словаря, которые можно собрать на поле.
   * @returns {{words:string[], truncated:boolean, visits:number}}
   */
  function findAllWords(board, trie, options) {
    var opts = options || {};
    if (isFreeOrder(opts.mode)) return findAllWordsFromLetters(board, opts);
    var total = board.rows * board.cols;
    var neighbors = neighborTable(board.rows, board.cols, opts.allowDiagonal !== false);
    var reuse = !!opts.reuseLetters;
    var minLength = opts.minLength || 3;
    var maxLength = opts.maxLength || 12;
    if (!reuse && maxLength > total) maxLength = total;
    var visitLimit = opts.visitLimit || 600000;
    var found = [];
    var seen = Object.create(null);
    var used = new Array(total);
    for (var u = 0; u < total; u++) used[u] = false;
    var visits = 0;
    var truncated = false;

    function walk(cell, node, prefix, depth) {
      if (truncated) return;
      if (visits >= visitLimit) { truncated = true; return; }
      visits++;
      if (node.w && depth >= minLength && seen[prefix] !== true) {
        seen[prefix] = true;
        found.push(prefix);
      }
      if (depth >= maxLength) return;
      used[cell] = true;
      var nb = neighbors[cell];
      for (var k = 0; k < nb.length; k++) {
        var n = nb[k];
        if (!reuse && used[n]) continue;
        var child = node.c[board.letters[n]];
        if (!child) continue;
        walk(n, child, prefix + board.letters[n], depth + 1);
        if (truncated) break;
      }
      used[cell] = false;
    }

    for (var i = 0; i < total; i++) {
      var start = trie.c[board.letters[i]];
      if (!start) continue;
      walk(i, start, board.letters[i], 1);
      if (truncated) break;
    }

    return { words: found, truncated: truncated, visits: visits };
  }

  /** Слово, собранное по цепочке клеток. */
  function wordFromPath(board, path) {
    var out = '';
    for (var i = 0; i < path.length; i++) out += board.letters[path[i]];
    return out;
  }

  /** Проверяет, что цепочка клеток допустима по правилам поля. */
  function isValidPath(board, path, options) {
    var opts = options || {};
    if (!path || !path.length) return false;
    var freeOrder = isFreeOrder(opts.mode);
    var neighbors = freeOrder ? null : neighborTable(board.rows, board.cols, opts.allowDiagonal !== false);
    var seen = Object.create(null);
    for (var i = 0; i < path.length; i++) {
      var cell = path[i];
      if (cell < 0 || cell >= board.letters.length) return false;
      if (!opts.reuseLetters && seen[cell] === true) return false;
      seen[cell] = true;
      if (i === 0 || freeOrder) continue;
      var prev = path[i - 1];
      if (neighbors[prev].indexOf(cell) === -1) return false;
    }
    return true;
  }

  /** Является ли слово допустимым для зачёта. */
  function validateWord(word, board, path, options) {
    var opts = options || {};
    var dict = root.Dictionary;
    var value = String(word || '').toLowerCase();
    var minLength = opts.minLength || 3;
    if (value.length < minLength) {
      var letterForm = root.Util ? root.Util.plural(minLength, 'буква', 'буквы', 'букв') : 'букв';
      return { ok: false, reason: 'too-short', message: 'Слишком короткое слово (минимум ' + minLength + ' ' + letterForm + ')' };
    }
    if (opts.maxLength && value.length > opts.maxLength) {
      return { ok: false, reason: 'too-long', message: 'Слово длиннее ' + opts.maxLength + ' букв' };
    }
    if (path && !isValidPath(board, path, opts)) {
      return {
        ok: false,
        reason: 'bad-path',
        message: isFreeOrder(opts.mode)
          ? 'Слово должно состоять из букв поля, каждую клетку — один раз'
          : 'Буквы должны идти по соседним клеткам'
      };
    }
    if (dict && !dict.has(value)) {
      return { ok: false, reason: 'unknown', message: 'Такого слова нет в словаре' };
    }
    return { ok: true, word: value };
  }

  root.GameCore = {
    LETTER_WEIGHTS: LETTER_WEIGHTS,
    neighborTable: neighborTable,
    randomLetter: randomLetter,
    generateBoard: generateBoard,
    isFreeOrder: isFreeOrder,
    pickTargetWord: pickTargetWord,
    buildTrie: buildTrie,
    findAllWords: findAllWords,
    findAllWordsFromLetters: findAllWordsFromLetters,
    canBuildWord: canBuildWord,
    wordFromPath: wordFromPath,
    isValidPath: isValidPath,
    validateWord: validateWord
  };
})(typeof window !== 'undefined' ? window : globalThis);
