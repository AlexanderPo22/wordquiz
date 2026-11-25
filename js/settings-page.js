/* Страница настроек: режим, уровень, пресеты, «Дополнительно», предпросмотр поля. */
(function () {
  'use strict';

  var Settings = window.Settings;
  var GameCore = window.GameCore;

  var POINT_KEYS = Settings.pointsKeys();

  var MODE_IDS = { adjacent: 'mode-adjacent', any: 'mode-any' };
  var MODE_OPTION_IDS = { adjacent: 'mode-option-adjacent', any: 'mode-option-any' };
  var LEVEL_IDS = { easy: 'level-easy', normal: 'level-normal', hard: 'level-hard' };
  var LEVEL_OPTION_IDS = { easy: 'level-option-easy', normal: 'level-option-normal', hard: 'level-option-hard' };

  var form = document.getElementById('settings-form');
  var statusBox = document.getElementById('status');
  var previewBoard = document.getElementById('preview-board');
  var previewInfo = document.getElementById('preview-info');
  var pointsFields = document.getElementById('points-fields');
  var rulesSummary = document.getElementById('rules-summary');
  var modeHint = document.getElementById('mode-hint');
  var levelSummary = document.getElementById('level-summary');
  var diagonalField = document.getElementById('diagonal-field');
  var saveButton = document.getElementById('btn-save');

  var suppressEvents = false;
  var previewTimer = null;
  var trieCache = { key: '', trie: null };
  var presets = null;

  var SIMPLE_FIELDS = [
    'roundSeconds', 'penaltyForWrong', 'rows', 'cols', 'seedWords',
    'minWordLength', 'maxWordLength', 'fillMode'
  ];
  var CHECKBOXES = ['allowDiagonal', 'reuseLetters', 'showFoundWords', 'showHint'];

  function el(id) { return document.getElementById(id); }

  function setStatus(text, isError) {
    statusBox.textContent = text || '';
    statusBox.className = 'status' + (isError ? ' error' : '');
  }

  /* ---------- Поля очков ---------- */

  function buildPointsFields() {
    pointsFields.innerHTML = '';
    POINT_KEYS.forEach(function (len, index) {
      var label = document.createElement('label');
      label.textContent = (index === POINT_KEYS.length - 1) ? len + '+' : len + ' б.';
      label.style.flex = '0 0 auto';

      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '99';
      input.step = '1';
      input.id = 'points-' + len;
      input.setAttribute('data-points-key', String(len));
      input.style.minWidth = '58px';

      pointsFields.appendChild(label);
      pointsFields.appendChild(input);
    });
  }

  /* ---------- Режим и сложность ---------- */

  function readMode() {
    for (var i = 0; i < Settings.MODE_ORDER.length; i++) {
      var mode = Settings.MODE_ORDER[i];
      var input = el(MODE_IDS[mode]);
      if (input && input.checked) return mode;
    }
    return Settings.DEFAULTS.mode;
  }

  function readLevel() {
    for (var i = 0; i < Settings.DIFFICULTY_ORDER.length; i++) {
      var level = Settings.DIFFICULTY_ORDER[i];
      var input = el(LEVEL_IDS[level]);
      if (input && input.checked) return level;
    }
    return Settings.DEFAULTS.difficulty;
  }

  function syncOptions(settings) {
    Settings.MODE_ORDER.forEach(function (mode) {
      var input = el(MODE_IDS[mode]);
      if (input) input.checked = (settings.mode === mode);
      var option = el(MODE_OPTION_IDS[mode]);
      if (option) option.classList.toggle('selected', settings.mode === mode);
    });
    Settings.DIFFICULTY_ORDER.forEach(function (level) {
      var input = el(LEVEL_IDS[level]);
      if (input) input.checked = (settings.difficulty === level);
      var option = el(LEVEL_OPTION_IDS[level]);
      if (option) option.classList.toggle('selected', settings.difficulty === level);
    });
  }

  /** В режиме «Любые» диагональ не имеет смысла — прячем настройку. */
  function updateModeDependent(settings) {
    var anyMode = settings.mode === 'any';
    modeHint.textContent = Settings.MODES[settings.mode].hint;
    diagonalField.hidden = anyMode;
  }

  function updateLevelSummary(settings) {
    if (Settings.matchesDifficulty(settings)) {
      levelSummary.textContent = Settings.describeDifficulty(settings.difficulty);
    } else {
      levelSummary.textContent = 'Свои значения: поле ' + settings.rows + '×' + settings.cols +
        ' · ' + window.Util.formatTime(settings.roundSeconds) +
        ' · слова от ' + settings.minWordLength + ' до ' + settings.maxWordLength + ' букв.';
    }
  }

  /* ---------- Чтение и запись формы ---------- */

  function readForm() {
    var raw = {};
    SIMPLE_FIELDS.forEach(function (key) {
      var field = el(key);
      raw[key] = field.value;
    });
    CHECKBOXES.forEach(function (key) {
      raw[key] = el(key).checked;
    });
    var points = {};
    POINT_KEYS.forEach(function (len) {
      points[len] = el('points-' + len).value;
    });
    raw.points = points;
    raw.mode = readMode();
    raw.difficulty = readLevel();
    return Settings.normalize(raw);
  }

  function writeForm(settings) {
    suppressEvents = true;
    SIMPLE_FIELDS.forEach(function (key) {
      el(key).value = settings[key];
    });
    CHECKBOXES.forEach(function (key) {
      el(key).checked = !!settings[key];
    });
    POINT_KEYS.forEach(function (len) {
      el('points-' + len).value = settings.points[len];
    });
    syncOptions(settings);
    updateModeDependent(settings);
    updateLevelSummary(settings);
    suppressEvents = false;
  }

  /* ---------- Пресеты ---------- */

  function updateSaveButton() {
    saveButton.textContent = '💾 Сохранить в пресет ' + (presets.active + 1);
  }

  function updatePresetCards(settings) {
    var current = settings || readForm();
    for (var i = 0; i < Settings.PRESET_COUNT; i++) {
      var slot = presets.slots[i];
      var radio = el('preset-' + (i + 1));
      if (radio) radio.checked = (i === presets.active);

      var option = el('preset-option-' + (i + 1));
      var caption = el('preset-caption-' + (i + 1));
      var edited = i === presets.active && !Settings.sameSettings(current, slot);

      if (option) {
        option.classList.toggle('selected', i === presets.active);
        option.classList.toggle('edited', edited);
      }
      if (caption) {
        caption.textContent = Settings.describeSettings(slot) + (edited ? ' · есть изменения' : '');
      }
    }
  }

  /** Выбирает ячейку пресета и загружает из неё настройки. */
  function selectPreset(index) {
    var slot = presets.slots[index];
    if (!slot) return;
    presets.active = index;
    Settings.savePresets(presets);
    var applied = Settings.save(slot);

    writeForm(applied);
    updateRulesSummary(applied);
    updatePresetCards(applied);
    updateSaveButton();
    updatePreview();
    setStatus('Загружен пресет ' + (index + 1) + '.');
  }

  /** Кнопка «Сохранить»: записывает текущие настройки в выбранную ячейку. */
  function saveToPreset() {
    var settings = Settings.save(readForm());
    presets.slots[presets.active] = settings;
    Settings.savePresets(presets);

    writeForm(settings);
    updateRulesSummary(settings);
    updatePresetCards(settings);
    setStatus('Текущие настройки сохранены в пресет ' + (presets.active + 1) + '.');
  }

  /* ---------- Сводка правил ---------- */

  function updateRulesSummary(settings) {
    var rows = [
      'Режим: ' + Settings.modeTitle(settings.mode) + ' — ' + Settings.MODES[settings.mode].short,
      'Сложность: ' + Settings.difficultyTitle(settings.difficulty),
      'Поле: ' + settings.rows + '×' + settings.cols + ' = ' + (settings.rows * settings.cols) + ' клеток',
      'Время раунда: ' + window.Util.formatTime(settings.roundSeconds),
      'Длина слова: от ' + settings.minWordLength + ' до ' + settings.maxWordLength + ' букв',
      'Заполнение: ' + (settings.fillMode === 'dictionary'
        ? 'из словаря (' + settings.seedWords + ' слов)'
        : 'случайные буквы'),
      'Штраф за ошибку: ' + settings.penaltyForWrong + ' очк.',
      'Очки: ' + Settings.describePoints(settings.points)
    ];
    if (settings.mode !== 'any') {
      rows.splice(5, 0, 'Диагонали: ' + (settings.allowDiagonal ? 'да' : 'нет'));
    }
    rulesSummary.innerHTML = rows.map(function (line) {
      return '<div>' + line + '</div>';
    }).join('');
  }

  /* ---------- Предпросмотр ---------- */

  function getTrie(settings) {
    var key = settings.minWordLength + '-' + settings.maxWordLength;
    if (trieCache.key !== key) {
      trieCache.trie = GameCore.buildTrie(window.Dictionary.words, settings.minWordLength, settings.maxWordLength);
      trieCache.key = key;
    }
    return trieCache.trie;
  }

  function renderPreviewBoard(board) {
    previewBoard.style.setProperty('--cols', board.cols);
    previewBoard.innerHTML = '';
    board.letters.forEach(function (letter) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = letter;
      previewBoard.appendChild(cell);
    });
  }

  function updatePreview() {
    var settings = readForm();
    var rng = window.Util.makeRng((Math.random() * 0xffffffff) >>> 0);
    var board = GameCore.generateBoard(settings, rng);
    renderPreviewBoard(board);

    var started = Date.now();
    var result = GameCore.findAllWords(board, getTrie(settings), {
      mode: settings.mode,
      allowDiagonal: settings.allowDiagonal,
      reuseLetters: settings.reuseLetters,
      minLength: settings.minWordLength,
      maxLength: settings.maxWordLength,
      visitLimit: 200000
    });
    var elapsed = Date.now() - started;
    var count = result.words.length;
    var countText = result.truncated ? 'не меньше ' + count : (count > 999 ? 'больше 999' : String(count));
    previewInfo.textContent = 'На этом поле можно собрать ' + countText + ' ' +
      window.Util.plural(count, 'слово', 'слова', 'слов') + ' (' + elapsed + ' мс).' +
      (board.seedWords.length
        ? ' В поле заложено ' + board.seedWords.length + ' ' +
          window.Util.plural(board.seedWords.length, 'слово', 'слова', 'слов') + '.'
        : '');
  }

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewTimer = null;
      // страница могла уже закрыться, пока ждали паузу
      if (!document.getElementById('settings-form')) return;
      updatePreview();
    }, 250);
  }

  /* ---------- Применение настроек ---------- */

  /** Настройки применяются сразу: пишем их в хранилище и обновляем подписи. */
  function applySettings(settings, message) {
    var applied = Settings.save(Settings.normalize(settings));
    writeForm(applied);
    updateRulesSummary(applied);
    updatePresetCards(applied);
    updatePreview();
    setStatus(message || 'Изменения применены.');
  }

  function onFormEdited() {
    if (suppressEvents) return;
    var settings = Settings.save(readForm());
    updateLevelSummary(settings);
    updateRulesSummary(settings);
    updatePresetCards(settings);
    schedulePreview();

    var slot = presets.slots[presets.active];
    setStatus(Settings.sameSettings(settings, slot)
      ? 'Изменения применены.'
      : 'Изменения применены. В пресет ' + (presets.active + 1) + ' они пока не сохранены.');
  }

  /* ---------- События ---------- */

  form.addEventListener('input', onFormEdited);
  form.addEventListener('change', onFormEdited);

  // Клик по карточке: в браузере радиокнопка ставится сама,
  // в тестовом окружении состояние выставляем вручную.
  form.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var presetOption = target.closest('.preset-option');
    if (presetOption) {
      var presetIndex = parseInt(presetOption.getAttribute('data-preset'), 10);
      if (!isNaN(presetIndex)) selectPreset(presetIndex);
      return;
    }

    var modeOption = target.closest('.mode-option');
    if (modeOption) {
      var mode = modeOption.getAttribute('data-mode');
      if (mode && Settings.MODES[mode]) {
        var withMode = readForm();
        withMode.mode = mode;
        applySettings(withMode, 'Режим: ' + Settings.modeTitle(mode) + '. Изменения применены.');
      }
      return;
    }

    var levelOption = target.closest('.level-option');
    if (levelOption) {
      var level = levelOption.getAttribute('data-level');
      if (level && Settings.DIFFICULTIES[level]) {
        applySettings(Settings.applyDifficulty(readForm(), level),
          'Уровень: ' + Settings.difficultyTitle(level) + '. Изменения применены.');
      }
    }
  });

  el('btn-random').addEventListener('click', function () {
    applySettings(Settings.randomize(readForm()), 'Настройки выбраны случайно и уже применены.');
  });

  el('btn-reset').addEventListener('click', function () {
    var fresh = Settings.reset();
    writeForm(fresh);
    updateRulesSummary(fresh);
    updatePresetCards(fresh);
    updatePreview();
    setStatus('Настройки сброшены к значениям по умолчанию.');
  });

  saveButton.addEventListener('click', saveToPreset);

  function play() {
    // настройки применяются сразу, но перед игрой фиксируем их ещё раз
    var settings = Settings.save(readForm());
    // «Играть» — это всегда новая партия, старую сохранённую не поднимаем
    if (window.GameState) window.GameState.clear();
    // и дублируем настройки ссылкой: так игра получит их, даже если браузер
    // запрещает localStorage при открытии страницы прямо с диска
    window.location.href = 'game.html?s=' + Settings.encode(settings);
  }

  el('btn-play').addEventListener('click', play);

  el('btn-preview').addEventListener('click', function () {
    updatePreview();
  });

  /* ---------- Старт ---------- */

  buildPointsFields();
  presets = Settings.loadPresets();
  var initial = Settings.load();
  writeForm(initial);
  updateRulesSummary(initial);
  updatePresetCards(initial);
  updateSaveButton();
  updatePreview();
  setStatus('');
  if (!Settings.storageAvailable()) {
    setStatus('Браузер не разрешает сохранение настроек. Они будут переданы в игру по ссылке — пользуйтесь кнопкой «Играть».');
  }
})();
