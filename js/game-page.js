/* Страница игры: поле из букв, сбор слов кликами, очки и таймер. */
(function () {
  'use strict';

  var Settings = window.Settings;
  var GameCore = window.GameCore;
  var GameState = window.GameState;

  var els = {
    board: document.getElementById('board'),
    hint: document.getElementById('hint'),
    message: document.getElementById('message'),
    currentWord: document.getElementById('current-word'),
    score: document.getElementById('score'),
    flash: document.getElementById('flash'),
    timer: document.getElementById('timer'),
    wordCount: document.getElementById('word-count'),
    foundPanel: document.getElementById('found-panel'),
    foundList: document.getElementById('found-list'),
    foundCount: document.getElementById('found-count'),
    rules: document.getElementById('rules'),
    modeBadge: document.getElementById('mode-badge'),
    howTo: document.getElementById('how-to'),
    overlay: document.getElementById('round-over'),
    overTitle: document.getElementById('over-title'),
    overSummary: document.getElementById('over-summary'),
    overWords: document.getElementById('over-words'),
    targetPanel: document.getElementById('target-panel'),
    targetWord: document.getElementById('target-word'),
    targetBonus: document.getElementById('target-bonus')
  };

  var state = {
    settings: null,
    board: null,
    trie: null,
    path: [],
    found: [],
    foundSet: null,
    score: 0,
    deadline: 0,
    timerId: null,
    active: false,
    target: null,
    possible: { words: [], truncated: false }
  };

  var flashTimer = null;
  var messageTimer = null;
  var invalidTimers = Object.create(null);

  function isFindMode() {
    return !!state.settings && state.settings.mode === 'find';
  }

  /** Соседство клеток важно только в режиме «Рядом». */
  function needsNeighbors() {
    return !!state.settings && state.settings.mode === 'adjacent';
  }

  /*
   * Звук подключается отдельным скриптом и читается в момент вызова:
   * если его нет (старый браузер, тесты), игра просто молчит.
   */
  function play(name, arg) {
    var api = window.Sound;
    if (!api || typeof api[name] !== 'function') return;
    try {
      api[name](arg);
    } catch (err) {
      /* звук не должен ломать игру */
    }
  }

  /** Сколько секунд даётся на старте: у «Найди слово» свой, короткий таймер. */
  function startSeconds(settings) {
    return settings.mode === 'find' ? settings.findSeconds : settings.roundSeconds;
  }

  /* ---------- Сохранение состояния ---------- */

  var lastTickSecond = null;

  /** Снимок партии: всё, что нужно, чтобы продолжить после обновления страницы. */
  function snapshot() {
    if (!state.board || !state.settings) return null;
    var remaining = state.active ? Math.max(0, (state.deadline - Date.now()) / 1000) : 0;
    return {
      version: 1,
      savedAt: Date.now(),
      settings: state.settings,
      board: {
        rows: state.board.rows,
        cols: state.board.cols,
        letters: state.board.letters.slice(),
        seedWords: state.board.seedWords.slice(),
        target: state.target || null
      },
      path: state.path.slice(),
      found: state.found.map(function (entry) {
        return { word: entry.word, points: entry.points };
      }),
      score: state.score,
      remaining: remaining,
      finished: !state.active
    };
  }

  /** Пишем сразу при изменении — выгрузки страницы никто не гарантирует. */
  function saveState() {
    if (!GameState) return;
    var data = snapshot();
    if (data) GameState.save(data);
  }

  /* ---------- Вспомогательное ---------- */

  function setMessage(text, ok) {
    els.message.textContent = text || '';
    els.message.className = 'message' + (ok ? ' ok' : '');
    if (messageTimer) clearTimeout(messageTimer);
    if (text) {
      messageTimer = setTimeout(function () {
        els.message.textContent = '';
      }, 2500);
    }
  }

  function flashScore(points) {
    els.flash.textContent = (points >= 0 ? '+' : '') + points;
    els.flash.classList.remove('show');
    void els.flash.offsetWidth;
    els.flash.classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { els.flash.textContent = ''; }, 900);
  }

  function updateRules() {
    var s = state.settings;
    var rows = [
      'Режим: ' + Settings.modeTitle(s.mode),
      'Сложность: ' + Settings.difficultyTitle(s.difficulty),
      'Поле: ' + s.rows + '×' + s.cols,
      isFindMode()
        ? 'Время на слово: ' + window.Util.formatTime(s.findSeconds)
        : 'Время: ' + window.Util.formatTime(s.roundSeconds),
      'Длина слова: от ' + s.minWordLength + ' до ' + s.maxWordLength + ' букв'
    ];
    if (needsNeighbors()) rows.push('Диагонали: ' + (s.allowDiagonal ? 'да' : 'нет'));
    if (isFindMode()) rows.push('Добавка за слово: +' + s.findBonus + ' с');
    rows.push('Штраф за ошибку: ' + s.penaltyForWrong);
    rows.push('Очки: ' + Settings.describePoints(s.points));
    els.rules.innerHTML = rows.map(function (line) { return '<div>' + line + '</div>'; }).join('');
  }

  function updateHowTo() {
    els.modeBadge.textContent = 'Режим: ' + Settings.modeTitle(state.settings.mode) +
      ' · ' + Settings.difficultyTitle(state.settings.difficulty);
    if (isFindMode()) {
      els.howTo.textContent = 'Соберите загаданное слово: нажимайте его буквы по порядку — соседство клеток не важно. ' +
        'За найденное слово добавляется время, а буквы на поле меняются. ' +
        'Повторный клик по последней букве убирает её, Backspace — тоже, Esc — очистить.';
    } else if (state.settings.mode === 'any') {
      els.howTo.textContent = 'Кликайте по любым буквам поля в любом порядке. Повторный клик по последней букве убирает её. ' +
        'Enter — добавить слово, Backspace — убрать букву, Esc — очистить.';
    } else {
      els.howTo.textContent = 'Кликайте по буквам: следующая буква должна быть соседней с предыдущей. ' +
        'Повторный клик по последней букве убирает её. Enter — добавить слово, Backspace — убрать букву, Esc — очистить.';
    }
  }

  /* ---------- Поле ---------- */

  /**
   * Рисует поле. В режиме «Найди слово» клетки появляются по очереди —
   * задержка задаётся переменной --i, поэтому «эпичность» целиком в CSS.
   */
  function renderBoard(spawn) {
    els.board.style.setProperty('--cols', state.board.cols);
    els.board.innerHTML = '';
    var animate = spawn && isFindMode();
    state.board.letters.forEach(function (letter, index) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('data-index', String(index));
      cell.textContent = letter;
      if (animate) {
        cell.classList.add('spawn');
        cell.style.setProperty('--i', String(index));
      }
      els.board.appendChild(cell);
    });
    if (animate) {
      els.board.classList.remove('wave');
      void els.board.offsetWidth;
      els.board.classList.add('wave');
    }
  }

  /* ---------- Загаданное слово (режим «Найди слово») ---------- */

  /** Показывает загаданное слово и запускает его появление. */
  function showTarget(word, bonus) {
    state.target = word || null;
    if (!els.targetPanel) return;
    els.targetPanel.hidden = !isFindMode();
    if (!isFindMode()) return;
    els.targetWord.textContent = (word || '').toUpperCase();
    if (els.targetBonus) els.targetBonus.textContent = bonus > 0 ? '+' + bonus + ' с' : '';
    els.targetWord.classList.remove('appear');
    if (els.targetBonus) els.targetBonus.classList.remove('appear');
    els.targetPanel.classList.remove('appear');
    void els.targetWord.offsetWidth;
    els.targetWord.classList.add('appear');
    els.targetPanel.classList.add('appear');
    if (els.targetBonus && bonus > 0) els.targetBonus.classList.add('appear');
  }

  /** Следующая буква загаданного слова — единственная, которую можно взять. */
  function isNextTargetLetter(index) {
    var letter = state.board.letters[index];
    var expected = state.target ? state.target.charAt(state.path.length) : '';
    return letter === expected;
  }

  /** Слово собрано целиком? В этом режиме оно проверяется само, по ходу набора. */
  function checkTarget() {
    if (!state.target) return false;
    var word = GameCore.wordFromPath(state.board, state.path);
    if (word !== state.target) return false;
    completeTarget();
    return true;
  }

  /** Слово найдено: очки, добавка времени, новые буквы и новое слово. */
  function completeTarget() {
    var word = state.target;
    if (!word) return;
    var bonus = state.settings.findBonus;
    var points = Settings.pointsForLength(word.length, state.settings.points);

    state.foundSet[word] = true;
    state.found.push({ word: word, points: points });
    state.score += points;
    updateScore();
    flashScore(points);
    renderFound();
    play('found');

    if (bonus > 0) {
      state.deadline += bonus * 1000;
      renderTimer();
    }
    state.path = [];
    nextTarget(bonus);
    saveState();
    setMessage('«' + word.toUpperCase() + '» найдено: +' + points + ' очк.' +
      (bonus > 0 ? ' и +' + bonus + ' с' : ''), true);
  }

  /** Новое поле с новым загаданным словом; уже найденные слова не повторяем. */
  function nextTarget(bonus) {
    var board = GameCore.generateBoard(state.settings, null, state.foundSet);
    if (!board || !board.target) return; // словарь не дал слово — поле остаётся прежним
    state.board = board;
    renderBoard(true);
    showTarget(board.target, bonus);
    play('honk');
    refreshSelection();
  }

  function cellElement(index) {
    return els.board.children[index];
  }

  function refreshSelection() {
    var total = state.board.letters.length;
    var i;
    for (i = 0; i < total; i++) {
      var node = cellElement(i);
      if (!node) continue;
      node.classList.remove('selected', 'last', 'allowed', 'blocked');
      node.setAttribute('data-order', '');
    }
    state.path.forEach(function (index, position) {
      var cell = cellElement(index);
      if (!cell) return;
      cell.classList.add('selected');
      cell.setAttribute('data-order', String(position + 1));
      if (position === state.path.length - 1) cell.classList.add('last');
    });

    var allowed = allowedNextCells();
    allowed.forEach(function (index) {
      var cell = cellElement(index);
      if (cell) cell.classList.add('allowed');
    });

    // В режиме «Рядом» приглушаем всё, что уже нельзя выбрать.
    if (needsNeighbors() && state.path.length) {
      for (i = 0; i < total; i++) {
        var other = cellElement(i);
        if (!other) continue;
        if (state.path.indexOf(i) !== -1 || allowed.indexOf(i) !== -1) continue;
        other.classList.add('blocked');
      }
    }

    els.currentWord.textContent = GameCore.wordFromPath(state.board, state.path);
  }

  /** Какие клетки можно взять следующей буквой: только для режима «Рядом». */
  function allowedNextCells() {
    if (!state.active || !state.path.length || !needsNeighbors()) return [];
    var last = state.path[state.path.length - 1];
    var table = GameCore.neighborTable(state.board.rows, state.board.cols, state.settings.allowDiagonal);
    return table[last].filter(function (index) {
      if (!state.settings.reuseLetters && state.path.indexOf(index) !== -1) return false;
      return true;
    });
  }

  /** Красная подсветка и дрожание клетки, которую нельзя выбрать. */
  function pulseInvalid(index) {
    var node = cellElement(index);
    if (!node) return;
    node.classList.remove('invalid');
    void node.offsetWidth; // перезапуск CSS-анимации
    node.classList.add('invalid');
    if (invalidTimers[index]) clearTimeout(invalidTimers[index]);
    invalidTimers[index] = setTimeout(function () {
      invalidTimers[index] = null;
      node.classList.remove('invalid');
    }, 500);
  }

  /** Короткий «прыжок» только что добавленной буквы. */
  function popCell(index) {
    var node = cellElement(index);
    if (!node) return;
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
    setTimeout(function () { node.classList.remove('pop'); }, 220);
  }

  /** Дрожание строки с набранным словом, если слово не принято. */
  function shakeWord() {
    var node = els.currentWord;
    if (!node) return;
    node.classList.remove('invalid');
    void node.offsetWidth;
    node.classList.add('invalid');
    setTimeout(function () { node.classList.remove('invalid'); }, 450);
  }

  function renderFound(highlightNewest) {
    els.foundCount.textContent = String(state.found.length);
    els.wordCount.textContent = String(state.found.length);
    els.foundList.innerHTML = '';
    var newest = highlightNewest === false ? null : state.found[state.found.length - 1];
    state.found.forEach(function (entry) {
      var li = document.createElement('li');
      if (entry === newest) li.className = 'fresh';
      var word = document.createElement('span');
      word.textContent = entry.word;
      var points = document.createElement('span');
      points.textContent = entry.points + ' очк.';
      li.appendChild(word);
      li.appendChild(points);
      els.foundList.appendChild(li);
    });
    els.foundPanel.hidden = !state.settings.showFoundWords;
  }

  function updateScore() {
    els.score.textContent = String(state.score);
  }

  function pathOptions() {
    return {
      mode: state.settings.mode,
      allowDiagonal: state.settings.allowDiagonal,
      reuseLetters: state.settings.reuseLetters,
      minLength: state.settings.minWordLength,
      maxLength: state.settings.maxWordLength
    };
  }

  /* ---------- Ход игрока ---------- */

  function isAdjacent(from, to) {
    var table = GameCore.neighborTable(state.board.rows, state.board.cols, state.settings.allowDiagonal);
    return table[from].indexOf(to) !== -1;
  }

  function onCellClick(index) {
    if (!state.active) return;

    if (state.path.length && state.path[state.path.length - 1] === index) {
      state.path.pop();
      refreshSelection();
      saveState();
      return;
    }
    if (!state.settings.reuseLetters && state.path.indexOf(index) !== -1) {
      pulseInvalid(index);
      play('wrong');
      setMessage('Эту букву уже использовали. Нажмите на неё дважды, чтобы убрать.');
      return;
    }
    if (needsNeighbors() && state.path.length && !isAdjacent(state.path[state.path.length - 1], index)) {
      pulseInvalid(index);
      play('wrong');
      setMessage('Буквы можно брать только из соседних клеток.');
      return;
    }
    if (isFindMode() && !isNextTargetLetter(index)) {
      pulseInvalid(index);
      play('wrong');
      setMessage('Это не следующая буква загаданного слова.');
      return;
    }
    state.path.push(index);
    setMessage('');
    refreshSelection();
    popCell(index);
    // в «Найди слово» слово проверяется сразу, по последней букве
    if (isFindMode() && checkTarget()) return;
    saveState();
  }

  function undoLetter() {
    if (!state.active || !state.path.length) return;
    state.path.pop();
    refreshSelection();
    saveState();
  }

  function clearWord() {
    if (!state.active) return;
    state.path = [];
    refreshSelection();
    saveState();
  }

  function submitWord() {
    if (!state.active) return;
    if (!state.path.length) {
      setMessage('Сначала выберите буквы.');
      return;
    }
    // В «Найди слово» словарь не нужен: проверяется только загаданное слово.
    if (isFindMode()) {
      if (checkTarget()) return;
      shakeWord();
      play('wrong');
      setMessage('Это не загаданное слово.');
      return;
    }
    var word = GameCore.wordFromPath(state.board, state.path);
    var check = GameCore.validateWord(word, state.board, state.path, pathOptions());

    if (!check.ok) {
      shakeWord();
      play('wrong');
      if (state.settings.penaltyForWrong > 0) {
        state.score = Math.max(0, state.score - state.settings.penaltyForWrong);
        updateScore();
        flashScore(-state.settings.penaltyForWrong);
      }
      setMessage(word.toUpperCase() + ': ' + check.message);
      saveState(); // штраф мог изменить очки
      return;
    }
    if (state.foundSet[word] === true) {
      shakeWord();
      play('wrong');
      setMessage('Слово «' + word.toUpperCase() + '» уже найдено.');
      return;
    }

    var points = Settings.pointsForLength(word.length, state.settings.points);
    state.foundSet[word] = true;
    state.found.push({ word: word, points: points });
    state.score += points;
    updateScore();
    flashScore(points);
    renderFound();
    play('found');
    setMessage('«' + word.toUpperCase() + '» принято: +' + points, true);
    state.path = [];
    refreshSelection();
    saveState();
  }

  /* ---------- Таймер и раунд ---------- */

  /* В режиме «Любые» возможных слов тысячи — точное число только пугает. */
  function possibleWordsText(result) {
    var n = result.words.length;
    var countText = result.truncated ? 'не меньше ' + n : (n > 999 ? 'больше 999' : String(n));
    return countText + ' ' + window.Util.plural(n, 'слово', 'слова', 'слов');
  }

  function renderTimer() {
    var remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    els.timer.textContent = window.Util.formatTime(remaining);
    els.timer.classList.toggle('low', remaining <= 15);
    return remaining;
  }

  function tick() {
    var remaining = renderTimer();
    // сохраняем раз в секунду, чтобы обновление страницы почти не теряло время
    if (state.active && remaining !== lastTickSecond) {
      lastTickSecond = remaining;
      // тиканье — только в режиме на время: в долгих раундах оно мешает
      if (isFindMode() && remaining > 0) play('tick', remaining <= 5);
      saveState();
    }
    if (remaining <= 0) {
      endRound();
    }
  }

  /** Готовит раунд: и новое поле, и восстановленное ставятся одинаково. */
  function setupRound(settings, board, saved) {
    state.settings = settings;
    state.board = board;
    state.path = saved ? saved.path.slice() : [];
    state.found = saved ? saved.found.slice() : [];
    state.foundSet = Object.create(null);
    state.found.forEach(function (entry) { state.foundSet[entry.word] = true; });
    state.score = saved ? saved.score : 0;
    state.active = true;
    state.deadline = Date.now() + (saved ? saved.remaining : startSeconds(settings)) * 1000;
    state.target = isFindMode() ? (board.target || null) : null;

    // В «Найди слово» поле без загаданного слова не годится: так бывает
    // со старым сохранением или если словарь не дал подходящего слова.
    if (isFindMode() && !state.target) {
      var fresh = GameCore.generateBoard(settings, null, state.foundSet);
      if (fresh && fresh.target) {
        state.board = fresh;
        state.target = fresh.target;
      }
    }

    renderBoard(!saved);
    showTarget(state.target, 0);
    refreshSelection();
    // при восстановлении не подсвечиваем последнее слово как только что найденное
    renderFound(!saved);
    updateScore();
    updateRules();
    updateHowTo();
    els.overlay.hidden = true;
    els.hint.textContent = '';

    if (isFindMode()) {
      // Список всех слов поля здесь не нужен: ищем одно загаданное слово.
      if (state.settings.showHint) {
        els.hint.textContent = 'За найденное слово добавляется время, а буквы на поле меняются.';
      }
    } else {
      state.trie = GameCore.buildTrie(window.Dictionary.words, settings.minWordLength, settings.maxWordLength);
      // Полный список слов поля — для подсказки и итогов.
      state.possible = GameCore.findAllWords(state.board, state.trie, {
        mode: state.settings.mode,
        allowDiagonal: state.settings.allowDiagonal,
        reuseLetters: state.settings.reuseLetters,
        minLength: state.settings.minWordLength,
        maxLength: state.settings.maxWordLength,
        visitLimit: 600000
      });
      if (state.settings.showHint) {
        els.hint.textContent = 'На этом поле можно собрать ' + possibleWordsText(state.possible) + '.' +
          (state.board.seedWords.length
            ? ' В поле заложено ' + state.board.seedWords.length + ' ' +
              window.Util.plural(state.board.seedWords.length, 'слово', 'слова', 'слов') + '.'
            : '');
      }
    }

    if (state.timerId) clearInterval(state.timerId);
    lastTickSecond = null;
    tick();
    // если восстановленный раунд уже истёк, таймер больше не нужен
    state.timerId = state.active ? setInterval(tick, 250) : null;
    setMessage('');
    saveState();
  }

  /** Настройки из ссылки важнее сохранённых: так работает переход «Играть». */
  function currentSettings() {
    var fromLink = Settings.fromQuery(window.location.search);
    if (fromLink) Settings.save(fromLink);
    return fromLink || Settings.load();
  }

  /** Кнопки «Заново» и «Играть снова» — всегда новое поле. */
  function startRound() {
    var settings = currentSettings();
    setupRound(settings, GameCore.generateBoard(settings), null);
  }

  /** Загрузка страницы: сначала пробуем продолжить сохранённую партию. */
  function boot() {
    var settings = currentSettings();
    var saved = GameState ? GameState.load() : null;
    if (saved && Settings.sameSettings(saved.settings, settings)) {
      setupRound(settings, saved.board, saved);
      if (saved.finished) endRound();
      return;
    }
    setupRound(settings, GameCore.generateBoard(settings), null);
  }

  function endRound() {
    if (!state.active) return;
    state.active = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    els.timer.textContent = window.Util.formatTime(0);

    var best = state.found.slice().sort(function (a, b) { return b.points - a.points || b.word.length - a.word.length; })[0];

    var total = state.possible.words.length;
    var totalText = total > 999 ? 'более чем 999' : String(total);

    els.overTitle.textContent = 'Раунд завершён';
    els.overSummary.innerHTML = [
      '<div>Очки: <b>' + state.score + '</b></div>',
      isFindMode()
        ? '<div>Найдено слов: <b>' + state.found.length + '</b></div>'
        : '<div>Найдено слов: <b>' + state.found.length + '</b> из ' + totalText + ' возможных</div>',
      '<div>Лучшее слово: <b>' + (best ? best.word.toUpperCase() + ' (+' + best.points + ')' : '—') + '</b></div>'
    ].join('');
    play('end');

    var sorted = state.found.slice().sort(function (a, b) { return b.points - a.points || a.word.localeCompare(b.word); });
    var html = '';
    if (sorted.length) {
      html += '<h3>Ваши слова</h3><table class="results-table"><thead><tr><th>Слово</th><th class="num">Букв</th><th class="num">Очки</th></tr></thead><tbody>';
      sorted.forEach(function (entry) {
        html += '<tr><td>' + entry.word.toUpperCase() + '</td><td class="num">' + entry.word.length + '</td><td class="num">' + entry.points + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<p>За этот раунд не найдено ни одного слова.</p>';
    }
    els.overWords.innerHTML = html;
    els.overlay.hidden = false;
    saveState();
  }

  /* ---------- События ---------- */

  els.board.addEventListener('click', function (event) {
    var cell = event.target.closest ? event.target.closest('.cell') : null;
    if (!cell || !els.board.contains(cell)) return;
    onCellClick(parseInt(cell.getAttribute('data-index'), 10));
  });

  document.getElementById('btn-submit').addEventListener('click', submitWord);
  document.getElementById('btn-undo').addEventListener('click', undoLetter);
  document.getElementById('btn-clear').addEventListener('click', clearWord);
  document.getElementById('btn-restart').addEventListener('click', startRound);
  document.getElementById('btn-again').addEventListener('click', startRound);

  document.addEventListener('keydown', function (event) {
    if (!state.active) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      submitWord();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      undoLetter();
    } else if (event.key === 'Escape') {
      clearWord();
    }
  });

  boot();
})();
