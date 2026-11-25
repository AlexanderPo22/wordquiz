'use strict';
/*
 * Проверка страниц: настройки и игра прогоняются в минимальном DOM.
 * Запуск: node tests/pages-test.js
 */

const path = require('path');
const fs = require('fs');
const shim = require('./dom-shim');

const ROOT = path.join(__dirname, '..');
let passed = 0;
const failures = [];
const pending = [];

function record(name, error, message) {
  if (error) {
    failures.push({ name: name, message: message });
    console.log('  FAIL ' + name + ' :: ' + message);
  } else {
    passed++;
    console.log('  ok   ' + name);
  }
}

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(result.then(
        function () { record(name, null); },
        function (err) { record(name, err, err && err.message ? err.message : String(err)); }
      ));
      return;
    }
    record(name, null);
  } catch (err) {
    record(name, err, err && err.message ? err.message : String(err));
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

/** Живой поиск по id: часть элементов страница создаёт уже после загрузки. */
function byId(id) {
  return globalThis.document.getElementById(id);
}

/** Тема, которую сейчас показывает страница: её виднее всего по атрибуту <html>. */
function themeOf(page) {
  return page.html.getAttribute('data-theme');
}

/** Переносит содержимое одного хранилища в другое (как при перезагрузке страницы). */
function copyStorage(from, to) {
  from._data.forEach(function (value, key) { to.setItem(key, value); });
}

/** Скрипт темы грузится в <head>, поэтому его перезагрузка = новая загрузка страницы. */
function loadTheme(page) {
  delete require.cache[require.resolve(path.join(ROOT, 'js/theme.js'))];
  require(path.join(ROOT, 'js/theme.js'));
  page.ready();
  return globalThis.Theme;
}

/**
 * Новая загрузка страницы: свежая разметка, то же хранилище, скрипты заново.
 * theme.js стоит в <head>, settings-page.js — в конце body, как в самой странице.
 */
function reload(page) {
  const next = shim.loadPage(path.join(ROOT, page === settingsPage ? 'index.html' : 'game.html'));
  copyStorage(page.localStorage, next.localStorage);
  const savedMedia = globalThis.matchMedia;
  globalThis.matchMedia = page.matchMedia;
  loadTheme(next);
  delete require.cache[require.resolve(path.join(ROOT, 'js/settings-page.js'))];
  require(path.join(ROOT, 'js/settings-page.js'));
  globalThis.matchMedia = savedMedia;
  return next;
}

/**
 * Перезагрузка первой страницы «на месте»: разметка в registry та же,
 * но скрипты страницы отрабатывают заново — как при обновлении вкладки.
 */
function reloadSettingsPage() {
  const savedMedia = globalThis.matchMedia;
  globalThis.matchMedia = settingsPage.matchMedia;
  loadTheme(settingsPage);
  delete require.cache[require.resolve(path.join(ROOT, 'js/settings-page.js'))];
  require(path.join(ROOT, 'js/settings-page.js'));
  globalThis.matchMedia = savedMedia;
  return settingsPage;
}

/** Выключает тему без выбора игрока: так выглядит первый визит. */
function useLightSystemTheme(page) {
  page.localStorage.removeItem(Theme.KEY);
  page.matchMedia.setSystem(false);
}

/* ---------- 1. Страница настроек ---------- */

console.log('\n== Страница настроек (index.html) ==');
const settingsPage = shim.loadPage(path.join(ROOT, 'index.html'));
const form = settingsPage.registry;

require(path.join(ROOT, 'js/util.js'));
require(path.join(ROOT, 'js/wordlist.js'));
require(path.join(ROOT, 'js/settings.js'));
require(path.join(ROOT, 'js/game-core.js'));
require(path.join(ROOT, 'js/game-state.js'));
require(path.join(ROOT, 'js/theme.js'));
settingsPage.ready();
require(path.join(ROOT, 'js/settings-page.js'));

const Settings = globalThis.Settings;
const GameCore = globalThis.GameCore;
const Dictionary = globalThis.Dictionary;
const GameState = globalThis.GameState;
const Theme = globalThis.Theme;

check('все элементы формы найдены', () => {
  for (const id of ['roundSeconds', 'penaltyForWrong', 'rows', 'cols', 'seedWords',
    'minWordLength', 'maxWordLength', 'fillMode', 'allowDiagonal', 'reuseLetters',
    'showFoundWords', 'showHint', 'btn-random', 'btn-reset', 'btn-save', 'btn-play',
    'preview-board', 'preview-info', 'rules-summary', 'status', 'actions',
    'mode-adjacent', 'mode-any', 'level-easy', 'level-normal', 'level-hard',
    'mode-hint', 'level-summary', 'diagonal-field', 'advanced',
    'preset-1', 'preset-2', 'preset-3',
    'preset-option-1', 'preset-option-2', 'preset-option-3',
    'preset-caption-1', 'preset-caption-2', 'preset-caption-3']) {
    assert(form[id], 'не найден элемент #' + id);
  }
});
check('внизу страницы есть мелкий элемент оформления', () => {
  assert(form['page-foot'], 'не найден декоративный разделитель внизу страницы');
  assertEqual(form['page-foot'].children.length, 3, 'разделитель должен состоять из трёх точек');
  assertEqual(form['page-foot'].className, 'page-foot', 'разделитель должен быть с классом page-foot');
});
check('кнопка темы есть в шапке, но тему ещё не выбирали', () => {
  useLightSystemTheme(settingsPage);
  reloadSettingsPage();

  assert(form['btn-theme'], 'не найдена кнопка переключения темы');
  assertEqual(form['btn-theme'].className.indexOf('theme-toggle'), 0, 'у кнопки темы свой класс');
  assert(form['theme-icon'], 'не найден значок кнопки темы');
  assertEqual(settingsPage.localStorage.getItem(Theme.KEY), null, 'тема ещё не выбрана');
  assertEqual(themeOf(settingsPage), 'light', 'показывается светлая тема');
  assertEqual(form['theme-text'].textContent, 'Тёмная тема', 'кнопка предлагает тёмную тему');
  assertEqual(form['theme-icon'].textContent, '☀️', 'значок показывает, что тема светлая');
});
check('поля очков построены для длин 3..8', () => {
  for (const len of Settings.pointsKeys()) {
    const input = byId('points-' + len);
    assert(input, 'нет поля очков для длины ' + len);
    assertEqual(input.value, String(Settings.DEFAULT_POINTS[len]), 'значение очков для ' + len);
  }
  assertEqual(form['points-fields'].children.length, Settings.pointsKeys().length * 2, 'число узлов в блоке очков');
});
check('форма заполнена значениями по умолчанию', () => {
  const d = Settings.defaults();
  assertEqual(Number(form.roundSeconds.value), d.roundSeconds, 'время');
  assertEqual(Number(form.rows.value), d.rows, 'строки');
  assertEqual(Number(form.cols.value), d.cols, 'столбцы');
  assertEqual(form.fillMode.value, d.fillMode, 'режим заполнения');
  assertEqual(form.allowDiagonal.checked, d.allowDiagonal, 'диагонали');
});
check('главная настройка — режим, выбран «Рядом»', () => {
  assertEqual(form['mode-adjacent'].checked, true, 'режим «Рядом» выбран');
  assertEqual(form['mode-any'].checked, false, 'режим «Любые» не выбран');
  assert(form['mode-option-adjacent'].classList.contains('selected'), 'карточка режима не подсвечена');
  assert(!form['mode-option-any'].classList.contains('selected'), 'лишняя подсветка режима');
  assert(form['mode-adjacent'].parentNode === form['mode-option-adjacent'], 'радиокнопка должна быть в карточке');
});
check('уровень сложности «Средне» и его описание', () => {
  assertEqual(form['level-normal'].checked, true, 'средний уровень выбран');
  assert(form['level-option-normal'].classList.contains('selected'), 'карточка уровня не подсвечена');
  assert(form['level-summary'].textContent.indexOf('Поле 6×6') !== -1,
    'нет описания уровня: ' + JSON.stringify(form['level-summary'].textContent));
});
check('тонкие настройки спрятаны в блок «Дополнительно»', () => {
  assertEqual(form['advanced'].tagName, 'DETAILS', 'нет блока «Дополнительно»');
  assert(form['advanced'].children.length >= 6, 'блок дополнительных настроек пуст');
  assert(form['advanced'].contains(form.roundSeconds), 'время должно быть в «Дополнительно»');
  assert(form['advanced'].contains(byId('points-8')), 'очки должны быть в «Дополнительно»');
});
check('«Дополнительно» стоит сразу под основными настройками', () => {
  const formEl = form['settings-form'];
  assert(formEl, 'не найден сам элемент формы');
  const children = formEl.children;
  const advancedIndex = children.indexOf(form['advanced']);
  const actionsIndex = children.indexOf(form['actions']);
  assert(advancedIndex !== -1, 'блок «Дополнительно» не найден среди узлов формы');
  assert(actionsIndex !== -1, 'кнопки не найдены среди узлов формы');
  assertEqual(advancedIndex, 3, 'после режима, сложности и пресетов должен идти блок «Дополнительно»');
  assert(advancedIndex < actionsIndex, 'кнопки должны быть ниже дополнительных настроек');
  assert(children[2].contains(form['preset-1']), 'пресеты должны идти третьими');
});
check('переключение режима меняет подсказку и прячет диагональ', () => {
  form['mode-option-any'].dispatch('click');
  assertEqual(form['mode-any'].checked, true, 'режим «Любые» не включился');
  assertEqual(form['mode-adjacent'].checked, false, 'старый режим не снялся');
  assert(form['mode-option-any'].classList.contains('selected'), 'карточка «Любые» не подсвечена');
  assert(!form['mode-option-adjacent'].classList.contains('selected'), 'осталась подсветка «Рядом»');
  assertEqual(form['mode-hint'].textContent, Settings.MODES.any.hint, 'подсказка режима не обновилась');
  assertEqual(form['diagonal-field'].hidden, true, 'диагональ должна быть скрыта');
  assert(form['rules-summary'].innerHTML.indexOf('Режим: Любые') !== -1,
    'сводка правил без режима: ' + form['rules-summary'].innerHTML);
  assert(form['rules-summary'].innerHTML.indexOf('Диагонали') === -1, 'диагонали не должны упоминаться');
  assert(/можно собрать/.test(form['preview-info'].textContent), 'предпросмотр не посчитан');

  form['mode-option-adjacent'].dispatch('click');
  assertEqual(form['mode-adjacent'].checked, true, 'не вернулись в режим «Рядом»');
  assertEqual(form['diagonal-field'].hidden, false, 'диагональ не вернулась');
  assert(form['rules-summary'].innerHTML.indexOf('Режим: Рядом') !== -1, 'сводка не обновилась обратно');
});
check('уровни сложности применяют готовые наборы', () => {
  form['level-option-easy'].dispatch('click');
  assertEqual(Number(form.rows.value), 5, 'строки «Легко»');
  assertEqual(Number(form.cols.value), 5, 'столбцы «Легко»');
  assertEqual(Number(form.roundSeconds.value), 180, 'время «Легко»');
  assertEqual(Number(form.minWordLength.value), 3, 'мин. длина «Легко»');
  assertEqual(Number(form.maxWordLength.value), 6, 'макс. длина «Легко»');
  assert(form['level-summary'].textContent.indexOf('Поле 5×5') !== -1, 'описание «Легко»');
  assert(form['rules-summary'].innerHTML.indexOf('Сложность: Легко') !== -1, 'сводка без уровня');

  form['level-option-hard'].dispatch('click');
  assertEqual(Number(form.rows.value), 7, 'строки «Сложно»');
  assertEqual(Number(form.cols.value), 7, 'столбцы «Сложно»');
  assertEqual(Number(form.roundSeconds.value), 90, 'время «Сложно»');
  assertEqual(Number(form.minWordLength.value), 4, 'мин. длина «Сложно»');
  assertEqual(Number(form.maxWordLength.value), 10, 'макс. длина «Сложно»');
  assert(form['level-summary'].textContent.indexOf('Поле 7×7') !== -1, 'описание «Сложно»');

  form['level-option-normal'].dispatch('click');
  assertEqual(Number(form.rows.value), 6, 'вернулись к «Средне»');
  assertEqual(Number(form.roundSeconds.value), 120, 'время «Средне»');
});
check('ручная правка после уровня показывается как «свои значения»', () => {
  form['level-option-easy'].dispatch('click');
  form.roundSeconds.value = '60';
  form.roundSeconds.dispatch('input');
  assert(form['level-summary'].textContent.indexOf('Свои значения') !== -1,
    'нет пометки о своих значениях: ' + form['level-summary'].textContent);
  form['level-option-normal'].dispatch('click');
  assert(form['level-summary'].textContent.indexOf('Поле 6×6') !== -1, 'уровень не сбросил свои значения');
});
check('предпросмотр поля построен и посчитан', () => {
  assertEqual(form['preview-board'].children.length, 36, 'клеток в предпросмотре');
  const text = form['preview-info'].textContent;
  assert(/можно собрать\s+\d+ слов/.test(text), 'нет подсчёта слов: ' + JSON.stringify(text));
  const width = form['preview-board'].style.getPropertyValue('--cols');
  assertEqual(String(width), '6', 'CSS-переменная --cols');
});
check('сводка правил заполнена', () => {
  const html = form['rules-summary'].innerHTML;
  assert(html.indexOf('Поле: 6×6') !== -1, 'нет размера поля: ' + html);
  assert(html.indexOf('Очки:') !== -1, 'нет строки очков');
});
check('кнопка «Случайно» меняет настройки и остаётся в допустимых пределах', () => {
  const before = form['rules-summary'].innerHTML;
  let changed = false;
  for (let i = 0; i < 30 && !changed; i++) {
    form['btn-random'].dispatch('click');
    if (form['rules-summary'].innerHTML !== before) changed = true;
    const rows = Number(form.rows.value);
    const cols = Number(form.cols.value);
    const seconds = Number(form.roundSeconds.value);
    const minLen = Number(form.minWordLength.value);
    const maxLen = Number(form.maxWordLength.value);
    assert(rows >= 4 && rows <= 10, 'строки вне диапазона: ' + rows);
    assert(cols >= 4 && cols <= 10, 'столбцы вне диапазона: ' + cols);
    assert(seconds >= 15 && seconds <= 900, 'время вне диапазона: ' + seconds);
    assert(minLen >= 3 && minLen <= 6, 'мин. длина вне диапазона: ' + minLen);
    assert(maxLen >= minLen && maxLen <= 12, 'макс. длина вне диапазона: ' + maxLen);
    assert(byId('points-8').value !== '', 'очки не заполнены');  }
  assert(changed, 'кнопка «Случайно» ничего не изменила');
  assert(form['status'].textContent.indexOf('случайно') !== -1, 'нет сообщения о случайных настройках');
});
check('кнопка «Сбросить настройки» возвращает значения по умолчанию', () => {
  form['btn-reset'].dispatch('click');
  const d = Settings.defaults();
  assertEqual(Number(form.roundSeconds.value), d.roundSeconds, 'время сброшено');
  assertEqual(Number(form.rows.value), d.rows, 'строки сброшены');
  assertEqual(form['status'].textContent.indexOf('сброшены') !== -1, true, 'нет сообщения о сбросе');
  const stored = JSON.parse(settingsPage.localStorage.getItem(Settings.STORAGE_KEY));
  assertEqual(stored.roundSeconds, d.roundSeconds, 'сброс сохранён в хранилище');
});
check('кнопка «Сохранить в пресет» пишет настройки в пресет', () => {
  form.roundSeconds.value = '45';
  form.rows.value = '5';
  form.cols.value = '7';
  form['btn-save'].dispatch('click');
  const stored = JSON.parse(settingsPage.localStorage.getItem(Settings.STORAGE_KEY));
  assertEqual(stored.roundSeconds, 45, 'время сохранено');
  assertEqual(stored.rows, 5, 'строки сохранены');
  assertEqual(stored.cols, 7, 'столбцы сохранены');
  assertEqual(form['status'].textContent.indexOf('сохранены') !== -1, true, 'нет сообщения о сохранении');
});
check('кнопка «Играть» переходит на страницу игры и передаёт режим', () => {
  form['level-option-easy'].dispatch('click');
  form['mode-option-any'].dispatch('click');
  form['btn-play'].dispatch('click');
  assert(/game\.html\?s=/.test(globalThis.location.href), 'переход не выполнен: ' + globalThis.location.href);
  const passed = Settings.fromQuery(globalThis.location.href.slice(globalThis.location.href.indexOf('?')));
  assert(passed, 'настройки не переданы ссылкой');
  assertEqual(passed.roundSeconds, Number(form.roundSeconds.value), 'время в ссылке');
  assertEqual(passed.mode, 'any', 'режим в ссылке');
  assertEqual(passed.difficulty, 'easy', 'сложность в ссылке');
  // возвращаем обычные настройки для следующих проверок
  form['mode-option-adjacent'].dispatch('click');
  form['level-option-normal'].dispatch('click');
});
check('битые значения в форме не ломают настройки', () => {
  form.roundSeconds.value = 'abc';
  form.rows.value = '999';
  form.cols.value = '-5';
  form['btn-save'].dispatch('click');
  const stored = JSON.parse(settingsPage.localStorage.getItem(Settings.STORAGE_KEY));
  assert(stored.roundSeconds >= 15 && stored.roundSeconds <= 900, 'время приведено к диапазону');
  assertEqual(stored.rows, 10, 'строки зажаты сверху');
  assertEqual(stored.cols, 4, 'столбцы зажаты снизу');
});

/* ---------- 2. Пресеты ---------- */

console.log('\n== Пресеты настроек ==');

check('пресетов ровно три, у каждого есть подпись', () => {
  assertEqual(Settings.PRESET_COUNT, 3, 'ячеек пресетов');
  const state = Settings.loadPresets();
  assertEqual(state.slots.length, 3, 'загружено ячеек');
  for (let i = 1; i <= 3; i++) {
    assert(form['preset-' + i], 'нет радиокнопки пресета ' + i);
    assert(form['preset-option-' + i], 'нет карточки пресета ' + i);
    const caption = form['preset-caption-' + i].textContent;
    assert(caption && caption.indexOf('×') !== -1, 'пустая подпись пресета ' + i + ': ' + JSON.stringify(caption));
  }
  assert(form['preset-option-1'].classList.contains('selected'), 'первый пресет должен быть выбран');
  assertEqual(form['btn-save'].textContent.indexOf('пресет 1') !== -1, true, 'кнопка не называет пресет');
});
check('изменения применяются сразу, без кнопки «Сохранить»', () => {
  form.rows.value = '8';
  form.cols.value = '9';
  form.rows.dispatch('input');
  const stored = JSON.parse(settingsPage.localStorage.getItem(Settings.STORAGE_KEY));
  assertEqual(stored.rows, 8, 'строки не применились сразу');
  assertEqual(stored.cols, 9, 'столбцы не применились сразу');
  assert(form['preset-caption-1'].textContent.indexOf('есть изменения') !== -1,
    'нет пометки, что пресет изменён: ' + form['preset-caption-1'].textContent);
  assert(form['status'].textContent.indexOf('применены') !== -1,
    'нет сообщения о применении: ' + form['status'].textContent);
});
check('«Сохранить в пресет» пишет в выбранную ячейку', () => {
  form['preset-option-2'].dispatch('click');
  assertEqual(Number(form.rows.value), 5, 'второй пресет — «Легко»');
  assertEqual(Number(form.cols.value), 5, 'поле второго пресета');
  assertEqual(Number(form.roundSeconds.value), 180, 'время второго пресета');
  assertEqual(form['btn-save'].textContent, '💾 Сохранить в пресет 2', 'кнопка не переключилась');

  form.roundSeconds.value = '77';
  form['btn-save'].dispatch('click');

  const presets = JSON.parse(settingsPage.localStorage.getItem(Settings.PRESETS_KEY));
  assertEqual(presets.active, 1, 'активная ячейка не запомнилась');
  assertEqual(presets.slots[1].roundSeconds, 77, 'время не записалось во второй пресет');
  assert(presets.slots[0].roundSeconds !== 77, 'первый пресет не должен меняться');
  assertEqual(form['preset-caption-2'].textContent.indexOf('есть изменения'), -1,
    'пометка изменений не снялась после сохранения');
  assert(form['status'].textContent.indexOf('сохранены в пресет 2') !== -1,
    'нет сообщения о сохранении: ' + form['status'].textContent);
});
check('выбор пресета загружает его настройки', () => {
  form['preset-option-3'].dispatch('click');
  assertEqual(form['mode-any'].checked, true, 'третий пресет должен включать режим «Любые»');
  assertEqual(form['diagonal-field'].hidden, true, 'в «Любых» диагональ скрыта');
  assert(form['rules-summary'].innerHTML.indexOf('Режим: Любые') !== -1, 'правила не обновились');
  assert(form['status'].textContent.indexOf('Загружен пресет 3') !== -1,
    'нет сообщения о загрузке: ' + form['status'].textContent);
  assertEqual(form['btn-save'].textContent, '💾 Сохранить в пресет 3', 'кнопка не переключилась');

  form['preset-option-1'].dispatch('click');
  const slot1 = JSON.parse(settingsPage.localStorage.getItem(Settings.PRESETS_KEY)).slots[0];
  assertEqual(Number(form.rows.value), slot1.rows, 'строки первого пресета');
  assertEqual(Number(form.roundSeconds.value), slot1.roundSeconds, 'время первого пресета');
  assertEqual(Number(form.cols.value), slot1.cols, 'столбцы первого пресета');
});
check('сброс настроек не трогает сохранённые пресеты', () => {
  const before = settingsPage.localStorage.getItem(Settings.PRESETS_KEY);
  form['btn-reset'].dispatch('click');
  const after = settingsPage.localStorage.getItem(Settings.PRESETS_KEY);
  assertEqual(after, before, 'пресеты изменились при сбросе');
  assertEqual(Number(form.rows.value), Settings.defaults().rows, 'форма не сброшена');
});
check('«Играть» берёт текущие настройки, даже если их не сохраняли', () => {
  form.rows.value = '7';
  form.cols.value = '7';
  form['btn-play'].dispatch('click');
  const passed = Settings.fromQuery(globalThis.location.href.slice(globalThis.location.href.indexOf('?')));
  assertEqual(passed.rows, 7, 'в ссылке не текущие строки');
  assertEqual(passed.cols, 7, 'в ссылке не текущие столбцы');
});
check('«Играть» начинает новую партию, а не поднимает старую', () => {
  settingsPage.localStorage.setItem(GameState.KEY, 'старая партия');
  form['btn-play'].dispatch('click');
  assertEqual(settingsPage.localStorage.getItem(GameState.KEY), null, 'старая партия не очищена');
});
check('светлая тема по умолчанию: без выбора и без системной тёмной', () => {
  settingsPage.localStorage.removeItem(Theme.KEY);
  settingsPage.matchMedia.setSystem(false);
  reloadSettingsPage();

  assertEqual(settingsPage.localStorage.getItem(Theme.KEY), null,
    'тема не должна записываться сама, пока игрок её не выбрал');
  assertEqual(themeOf(settingsPage), 'light', 'по умолчанию светлая тема');
  assertEqual(form['theme-text'].textContent, 'Тёмная тема', 'кнопка предлагает тёмную тему');
  assertEqual(form['theme-icon'].textContent, '☀️', 'значок показывает светлую тему');
});
check('кнопка в шапке переключает тему и запоминает выбор', () => {
  form['btn-theme'].dispatch('click');
  assertEqual(themeOf(settingsPage), 'dark', 'по клику включается тёмная тема');
  assertEqual(settingsPage.localStorage.getItem(Theme.KEY), 'dark', 'выбор темы записан');
  assertEqual(form['theme-text'].textContent, 'Светлая тема', 'кнопка предлагает вернуть светлую');
  assertEqual(form['theme-icon'].textContent, '🌙', 'значок показывает тёмную тему');
  assertEqual(form['btn-theme'].getAttribute('aria-pressed'), 'true', 'кнопка помечена нажатой');
  assert(form['btn-theme'].getAttribute('title').indexOf('светлую') !== -1,
    'подсказка кнопки: ' + form['btn-theme'].getAttribute('title'));

  form['btn-theme'].dispatch('click');
  assertEqual(themeOf(settingsPage), 'light', 'повторный клик возвращает светлую');
  assertEqual(form['theme-text'].textContent, 'Тёмная тема', 'кнопка снова предлагает тёмную');
  assertEqual(form['theme-icon'].textContent, '☀️', 'значок вернулся к светлой теме');
  assertEqual(form['btn-theme'].getAttribute('aria-pressed'), 'false', 'кнопка не нажата');
});
check('сохранённая тема поднимается при новой загрузке страницы', () => {
  settingsPage.localStorage.setItem(Theme.KEY, 'dark');
  reloadSettingsPage();

  assertEqual(themeOf(settingsPage), 'dark', 'тема должна подняться из хранилища');
  assertEqual(form['theme-text'].textContent, 'Светлая тема', 'кнопка предлагает светлую тему');
  assertEqual(form['theme-icon'].textContent, '🌙', 'значок показывает тёмную тему');
  settingsPage.localStorage.setItem(Theme.KEY, 'light');
});
check('системная тёмная тема применяется, пока игрок не выбрал свою', () => {
  settingsPage.localStorage.removeItem(Theme.KEY);
  settingsPage.matchMedia.setSystem(true);
  reloadSettingsPage();

  assertEqual(themeOf(settingsPage), 'dark', 'системная тёмная тема должна примениться');
  assertEqual(form['theme-text'].textContent, 'Светлая тема', 'кнопка предлагает вернуть светлую');
  assertEqual(settingsPage.localStorage.getItem(Theme.KEY), null,
    'системная тема не должна записываться как выбор игрока');

  settingsPage.matchMedia.setSystem(false);
  reloadSettingsPage();
  assertEqual(themeOf(settingsPage), 'light', 'система вернулась к светлой — и сайт тоже');
});

/* ---------- 3. Страница игры ---------- */

console.log('\n== Страница игры (game.html) ==');

const gamePage = shim.loadPage(path.join(ROOT, 'game.html'));
const game = gamePage.registry;

// сохраняем настройки так, будто их выставил игрок на первой странице
gamePage.localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(Settings.normalize({
  roundSeconds: 120, rows: 6, cols: 6, minWordLength: 3, maxWordLength: 8,
  seedWords: 8, fillMode: 'dictionary', allowDiagonal: true, reuseLetters: false,
  showFoundWords: true, showHint: true, penaltyForWrong: 0
})));

// тема применяется первой, как в самой странице
gamePage.matchMedia.setSystem(false);
gamePage.localStorage.removeItem(Theme.KEY);
loadTheme(gamePage);

require(path.join(ROOT, 'js/game-page.js'));

function readBoardOf(registry) {
  const cells = registry.board.children;
  const cols = Number(registry.board.style.getPropertyValue('--cols')) || 6;
  const letters = cells.map(function (cell) { return cell.textContent.toLowerCase(); });
  return { rows: letters.length / cols, cols: cols, letters: letters };
}

function readBoard() {
  return readBoardOf(game);
}

/** Клетки, из которых можно собрать слово в любом порядке (каждая — один раз). */
function cellsForWord(board, word) {
  const pools = {};
  board.letters.forEach(function (letter, index) {
    (pools[letter] = pools[letter] || []).push(index);
  });
  const used = new Set();
  const path = [];
  for (const letter of word) {
    const cell = (pools[letter] || []).find(function (index) { return !used.has(index); });
    if (cell === undefined) return null;
    used.add(cell);
    path.push(cell);
  }
  return path;
}

function clickCellsOf(registry, path) {
  for (const index of path) registry.board.children[index].dispatch('click');
}

function findPath(board, word, allowDiagonal) {
  const neighbors = GameCore.neighborTable(board.rows, board.cols, allowDiagonal);
  const used = new Set();
  const path = [];
  function dfs(cell, index) {
    if (index === word.length) return true;
    for (const next of neighbors[cell]) {
      if (used.has(next)) continue;
      if (board.letters[next] !== word.charAt(index)) continue;
      used.add(next);
      path.push(next);
      if (dfs(next, index + 1)) return true;
      path.pop();
      used.delete(next);
    }
    return false;
  }
  for (let start = 0; start < board.letters.length; start++) {
    if (board.letters[start] !== word.charAt(0)) continue;
    used.clear();
    path.length = 0;
    used.add(start);
    path.push(start);
    if (dfs(start, 1)) return path.slice();
  }
  return null;
}

function clickCells(path) {
  for (const index of path) game.board.children[index].dispatch('click');
}

let board = null;
let validWord = null;
let validPath = null;

check('поле отрисовано по сохранённым настройкам', () => {
  board = readBoard();
  assertEqual(board.letters.length, 36, 'клеток на поле');
  for (const letter of board.letters) assert(/^[a-z]$/.test(letter), 'плохая буква: ' + letter);
  assertEqual(game['board'].children.length, 36, 'элементов поля');
});
check('подсказка и таймер заполнены', () => {
  assert(/можно собрать\s+\d+ слов/.test(game.hint.textContent), 'нет подсказки: ' + JSON.stringify(game.hint.textContent));
  assert(/^\d+:\d\d$/.test(game.timer.textContent), 'таймер: ' + game.timer.textContent);
  assertEqual(game.score.textContent, '0', 'начальные очки');
  assertEqual(game['found-count'].textContent, '0', 'начальные слова');
});
check('на странице игры тот же мелкий элемент оформления', () => {
  assert(game['page-foot'], 'не найден декоративный разделитель внизу страницы');
  assertEqual(game['page-foot'].children.length, 3, 'разделитель должен состоять из трёх точек');
  assertEqual(game['page-foot'].className, 'page-foot', 'разделитель должен быть с тем же классом, что и на настройках');
});
check('на странице игры та же кнопка темы', () => {
  assert(game['btn-theme'], 'не найдена кнопка переключения темы');
  assertEqual(game['btn-theme'].className.indexOf('theme-toggle'), 0, 'у кнопки темы свой класс');
  assertEqual(game['theme-text'].textContent, 'Тёмная тема', 'кнопка предлагает тёмную тему');
  assertEqual(game['theme-icon'].textContent, '☀️', 'значок показывает светлую тему');
});
check('есть слово, которое можно собрать на поле', () => {
  const settings = Settings.load();
  const trie = GameCore.buildTrie(Dictionary.words, settings.minWordLength, settings.maxWordLength);
  const found = GameCore.findAllWords(board, trie, {
    allowDiagonal: settings.allowDiagonal, reuseLetters: settings.reuseLetters,
    minLength: settings.minWordLength, maxLength: settings.maxWordLength, visitLimit: 300000
  });
  assert(found.words.length > 0, 'на поле нет ни одного слова');
  found.words.sort(function (a, b) { return a.length - b.length; });
  validWord = found.words[0];
  validPath = findPath(board, validWord, settings.allowDiagonal);
  assert(validPath, 'не удалось построить путь для слова ' + validWord);
});
check('клик по буквам собирает слово', () => {
  clickCells(validPath);
  assertEqual(game['current-word'].textContent, validWord, 'собранное слово');
  const selected = game.board.children.filter(function (cell) { return cell.classList.contains('selected'); });
  assertEqual(selected.length, validWord.length, 'подсвечено клеток');
  const last = game.board.children[validPath[validPath.length - 1]];
  assert(last.classList.contains('last'), 'последняя буква не выделена');
});
check('повторный клик по последней букве убирает её', () => {
  const lastIndex = validPath[validPath.length - 1];
  game.board.children[lastIndex].dispatch('click');
  assertEqual(game['current-word'].textContent.length, validWord.length - 1, 'буква не убрана');
  game.board.children[lastIndex].dispatch('click'); // возвращаем обратно
  assertEqual(game['current-word'].textContent, validWord, 'буква не вернулась');
});
check('при выборе буквы подсвечиваются доступные соседи', () => {
  game['btn-clear'].dispatch('click');
  const start = validPath[0];
  game.board.children[start].dispatch('click');

  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  const expected = neighbors[start].slice().sort(function (a, b) { return a - b; });
  const allowed = [];
  const blocked = [];
  game.board.children.forEach(function (cell, index) {
    if (cell.classList.contains('allowed')) allowed.push(index);
    if (cell.classList.contains('blocked')) blocked.push(index);
  });
  assertEqual(allowed.sort(function (a, b) { return a - b; }).join(','), expected.join(','),
    'подсветка не совпала с соседями');
  assert(allowed.indexOf(start) === -1, 'использованная клетка не должна быть доступной');
  assertEqual(blocked.length, 36 - 1 - expected.length, 'приглушено не то количество клеток');
  assertEqual(game.board.children[start].getAttribute('data-order'), '1', 'нет номера у первой буквы');

  const second = expected[0];
  game.board.children[second].dispatch('click');
  assertEqual(game.board.children[second].getAttribute('data-order'), '2', 'нет номера у второй буквы');
  const expectedNext = neighbors[second]
    .filter(function (index) { return index !== start && index !== second; })
    .sort(function (a, b) { return a - b; });
  const allowedNext = [];
  game.board.children.forEach(function (cell, index) {
    if (cell.classList.contains('allowed')) allowedNext.push(index);
  });
  assertEqual(allowedNext.sort(function (a, b) { return a - b; }).join(','), expectedNext.join(','),
    'подсветка не обновилась после второй буквы');

  game['btn-clear'].dispatch('click');
  let leftovers = 0;
  game.board.children.forEach(function (cell) {
    if (cell.classList.contains('allowed') || cell.classList.contains('blocked')) leftovers++;
  });
  assertEqual(leftovers, 0, 'подсветка не сбросилась');
});
check('нельзя нажать: клетка краснеет и дрожит', () => {
  game['btn-clear'].dispatch('click');
  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  let pair = null;
  for (let a = 0; a < board.letters.length && !pair; a++) {
    for (let b = 0; b < board.letters.length; b++) {
      if (a === b) continue;
      if (neighbors[a].indexOf(b) === -1) { pair = [a, b]; break; }
    }
  }
  assert(pair, 'не нашлось несоседних клеток');
  game.board.children[pair[0]].dispatch('click');
  const target = game.board.children[pair[1]];
  target.dispatch('click');
  assert(target.classList.contains('invalid'), 'клетка не покраснела');
  assertEqual(game['current-word'].textContent.length, 1, 'недопустимая буква добавилась');
  assert(game.message.textContent.indexOf('соседних') !== -1, 'нет предупреждения: ' + game.message.textContent);

  return new Promise(function (resolve) {
    setTimeout(function () {
      assert(!target.classList.contains('invalid'), 'подсветка ошибки не снялась');
      resolve();
    }, 650);
  });
});
check('повторное использование буквы тоже подсвечивается', () => {
  game['btn-clear'].dispatch('click');
  const first = validPath[0];
  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  const second = neighbors[first][0];
  game.board.children[first].dispatch('click');
  game.board.children[second].dispatch('click');
  const used = game.board.children[first];
  used.dispatch('click');
  assert(used.classList.contains('invalid'), 'клетка не покраснела');
  assert(game.message.textContent.indexOf('уже использовали') !== -1,
    'нет сообщения: ' + game.message.textContent);
  assertEqual(game['current-word'].textContent.length, 2, 'слово не должно меняться');
  game['btn-clear'].dispatch('click');
});
check('слово принимается и приносит очки', () => {
  game['btn-clear'].dispatch('click');
  clickCells(validPath);
  game['btn-submit'].dispatch('click');
  const expected = Settings.pointsForLength(validWord.length, Settings.load().points);
  assertEqual(game.score.textContent, String(expected), 'очки за слово');
  assertEqual(game['found-count'].textContent, '1', 'слов найдено');
  assertEqual(game['found-list'].children.length, 1, 'строк в списке слов');
  assertEqual(game['found-list'].children[0].className, 'fresh', 'новое слово не подсвечено в списке');
  assertEqual(game['current-word'].textContent, '', 'поле ввода не очищено');
  assert(game.message.textContent.indexOf('принято') !== -1, 'нет сообщения о приёме: ' + game.message.textContent);
});
check('повторное слово не засчитывается', () => {
  clickCells(validPath);
  game['btn-submit'].dispatch('click');
  assertEqual(game.score.textContent, String(Settings.pointsForLength(validWord.length, Settings.load().points)), 'очки изменились');
  assert(game.message.textContent.indexOf('уже найдено') !== -1, 'нет сообщения о повторе: ' + game.message.textContent);
});
check('несоседние буквы не соединяются', () => {
  game['btn-clear'].dispatch('click');
  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  let pair = null;
  for (let a = 0; a < board.letters.length && !pair; a++) {
    for (let b = 0; b < board.letters.length; b++) {
      if (a === b) continue;
      if (neighbors[a].indexOf(b) === -1) { pair = [a, b]; break; }
    }
  }
  assert(pair, 'не нашлось несоседних клеток');
  game.board.children[pair[0]].dispatch('click');
  game.board.children[pair[1]].dispatch('click');
  assertEqual(game['current-word'].textContent.length, 1, 'несоседняя буква добавилась');
  assert(game.message.textContent.indexOf('соседних') !== -1, 'нет предупреждения: ' + game.message.textContent);
});
check('слово не из словаря отклоняется', () => {
  game['btn-clear'].dispatch('click');
  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  let bogus = null;
  for (let a = 0; a < board.letters.length && !bogus; a++) {
    for (const b of neighbors[a]) {
      for (const c of neighbors[b]) {
        if (c === a) continue;
        const word = board.letters[a] + board.letters[b] + board.letters[c];
        if (!Dictionary.has(word)) { bogus = { word: word, path: [a, b, c] }; break; }
      }
      if (bogus) break;
    }
  }
  assert(bogus, 'не нашлось бессмысленного слова из трёх букв');
  const scoreBefore = game.score.textContent;
  clickCells(bogus.path);
  game['btn-submit'].dispatch('click');
  assert(game.message.textContent.indexOf('нет в словаре') !== -1, 'нет отказа: ' + game.message.textContent + ' (слово ' + bogus.word + ')');
  assertEqual(game.score.textContent, scoreBefore, 'очки изменились без штрафа');
  assert(game['current-word'].classList.contains('invalid'), 'строка со словом не покраснела');
});
check('слишком короткое слово отклоняется', () => {
  game['btn-clear'].dispatch('click');
  const neighbors = GameCore.neighborTable(board.rows, board.cols, true);
  const path = [0, neighbors[0][0]];
  clickCells(path);
  game['btn-submit'].dispatch('click');
  assertEqual(game['current-word'].textContent.length, 2, 'выбрано две буквы');
  assert(game.message.textContent.indexOf('Слишком короткое') !== -1, 'нет отказа по длине: ' + game.message.textContent);
});
check('Backspace убирает букву, Esc очищает слово', () => {
  game['btn-clear'].dispatch('click');
  clickCells(validPath);
  globalThis.document.dispatchEvent({ type: 'keydown', key: 'Backspace' });
  assertEqual(game['current-word'].textContent.length, validWord.length - 1, 'Backspace не сработал');
  globalThis.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assertEqual(game['current-word'].textContent, '', 'Esc не очистил слово');
});
check('Enter отправляет слово', () => {
  game['btn-clear'].dispatch('click');
  const found = Number(game['found-count'].textContent);
  clickCells(validPath);
  globalThis.document.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assertEqual(Number(game['found-count'].textContent), found, 'слово-повтор не должно добавляться');
  assert(game.message.textContent.indexOf('уже найдено') !== -1, 'Enter не отправил слово');
});
check('пустой ввод не отправляется', () => {
  game['btn-clear'].dispatch('click');
  game['btn-submit'].dispatch('click');
  assert(game.message.textContent.indexOf('Сначала выберите буквы') !== -1, 'нет подсказки: ' + game.message.textContent);
});

/* ---------- 4. Завершение раунда ---------- */

console.log('\n== Завершение раунда ==');

const realNow = Date.now;
let timeOffset = 0;
Date.now = function () { return realNow() + timeOffset; };

check('по истечении времени раунд завершается', () => {
  timeOffset = 10 * 60 * 1000; // прокручиваем время на 10 минут вперёд
  return new Promise(function (resolve) {
    setTimeout(function () {
      assertEqual(game['round-over'].hidden, false, 'итоговый экран не показан');
      assert(game['over-summary'].innerHTML.indexOf('Очки:') !== -1, 'нет очков в итогах');
      assert(game['over-summary'].innerHTML.indexOf('Найдено слов:') !== -1, 'нет числа слов в итогах');
      assert(game['over-words'].innerHTML.indexOf('Не найдено') === -1,
        'в итогах не должно быть перечисления ненайденных слов: ' + game['over-words'].innerHTML);
      assertEqual(game.timer.textContent, '0:00', 'таймер не обнулился');
      resolve();
    }, 400);
  });
});

/* ---------- 5. Режим «Любые буквы» ---------- */

console.log('\n== Страница игры: режим «Любые» ==');

const anyPage = shim.loadPage(path.join(ROOT, 'game.html'));
anyPage.localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(Settings.normalize({
  mode: 'any', difficulty: 'normal', roundSeconds: 120, rows: 6, cols: 6,
  minWordLength: 3, maxWordLength: 8, seedWords: 6, fillMode: 'dictionary',
  showFoundWords: true, showHint: true
})));

delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
require(path.join(ROOT, 'js/game-page.js'));

const anyGame = anyPage.registry;
let anyBoard = null;
let anyWord = null;

check('режим «Любые»: шапка, правила и пояснение', () => {
  assert(anyGame['mode-badge'].textContent.indexOf('Любые') !== -1,
    'в шапке нет режима: ' + JSON.stringify(anyGame['mode-badge'].textContent));
  assert(anyGame.rules.innerHTML.indexOf('Режим: Любые') !== -1, 'правила без режима: ' + anyGame.rules.innerHTML);
  assert(anyGame.rules.innerHTML.indexOf('Диагонали') === -1, 'диагонали не нужны в этом режиме');
  assert(anyGame['how-to'].textContent.indexOf('любом порядке') !== -1,
    'нет пояснения режима: ' + JSON.stringify(anyGame['how-to'].textContent));
  anyBoard = readBoardOf(anyGame);
  assertEqual(anyBoard.letters.length, 36, 'клеток на поле');
});
check('режим «Любые»: буквы берутся из несоседних клеток', () => {
  const neighbors = GameCore.neighborTable(anyBoard.rows, anyBoard.cols, true);
  let pair = null;
  for (let a = 0; a < anyBoard.letters.length && !pair; a++) {
    for (let b = 0; b < anyBoard.letters.length; b++) {
      if (a === b) continue;
      if (neighbors[a].indexOf(b) === -1) { pair = [a, b]; break; }
    }
  }
  assert(pair, 'не нашлось несоседних клеток');
  clickCellsOf(anyGame, pair);
  assertEqual(anyGame['current-word'].textContent.length, 2, 'вторая буква не добавилась');
  assert(anyGame.message.textContent.indexOf('соседних') === -1,
    'лишнее предупреждение: ' + anyGame.message.textContent);
  let highlighted = 0;
  anyGame.board.children.forEach(function (cell) {
    if (cell.classList.contains('allowed') || cell.classList.contains('blocked') ||
        cell.classList.contains('invalid')) highlighted++;
  });
  assertEqual(highlighted, 0, 'в режиме «Любые» нечего подсвечивать и приглушать');
  anyGame['btn-clear'].dispatch('click');
});
check('режим «Любые»: слово из любых клеток принимается', () => {
  const found = GameCore.findAllWordsFromLetters(anyBoard, { minLength: 3, maxLength: 8 });
  anyWord = found.words.sort(function (a, b) { return a.length - b.length; })
    .find(function (word) { return cellsForWord(anyBoard, word); });
  assert(anyWord, 'не нашлось слова, которое можно собрать');
  const wordPath = cellsForWord(anyBoard, anyWord);
  clickCellsOf(anyGame, wordPath);
  assertEqual(anyGame['current-word'].textContent, anyWord, 'слово не собралось');
  anyGame['btn-submit'].dispatch('click');
  const expected = Settings.pointsForLength(anyWord.length, Settings.load().points);
  assertEqual(anyGame.score.textContent, String(expected), 'очки за слово: ' + anyGame.message.textContent);
  assertEqual(anyGame['found-count'].textContent, '1', 'слов найдено');
  assert(anyGame.message.textContent.indexOf('принято') !== -1, 'нет сообщения о приёме');
});

/* ---------- 6. Сохранение состояния ---------- */

console.log('\n== Сохранение состояния при обновлении ==');

function secondsOf(text) {
  const parts = String(text).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

const pageA = shim.loadPage(path.join(ROOT, 'game.html'));
pageA.localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(Settings.normalize({
  rows: 6, cols: 6, roundSeconds: 120, minWordLength: 3, maxWordLength: 8,
  seedWords: 8, fillMode: 'dictionary', allowDiagonal: true, reuseLetters: false,
  showFoundWords: true, showHint: true, penaltyForWrong: 0
})));
pageA.localStorage.removeItem(GameState.KEY);

let gameA = null;
let boardA = null;
let leftPath = null;

check('первый запуск: сохранения ещё нет, игра стартует как обычно', () => {
  assertEqual(pageA.localStorage.getItem(GameState.KEY), null, 'до первого запуска сохранения быть не должно');
  globalThis.location.search = '';
  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));
  gameA = pageA.registry;
  assertEqual(gameA.board.children.length, 36, 'поле отрисовано');
  assertEqual(gameA.score.textContent, '0', 'счёт начинается с нуля');
  assertEqual(gameA['round-over'].hidden, true, 'раунд должен идти');
  assert(pageA.localStorage.getItem(GameState.KEY), 'состояние должно сохраниться сразу после старта');
});
check('состояние пишется по ходу игры, без выгрузки страницы', () => {
  boardA = readBoardOf(gameA);
  const settings = Settings.load();
  const trie = GameCore.buildTrie(Dictionary.words, settings.minWordLength, settings.maxWordLength);
  const found = GameCore.findAllWords(boardA, trie, {
    mode: settings.mode, allowDiagonal: settings.allowDiagonal, reuseLetters: settings.reuseLetters,
    minLength: settings.minWordLength, maxLength: settings.maxWordLength, visitLimit: 300000
  });
  const word = found.words.slice().sort(function (a, b) { return a.length - b.length; })
    .find(function (candidate) { return findPath(boardA, candidate, settings.allowDiagonal); });
  assert(word, 'не нашлось слова для проверки');
  const wordPath = findPath(boardA, word, settings.allowDiagonal);
  clickCellsOf(gameA, wordPath);
  gameA['btn-submit'].dispatch('click');

  const afterWord = GameState.load();
  assert(afterWord, 'состояние не записалось');
  assertEqual(afterWord.score, Settings.pointsForLength(word.length, settings.points), 'очки в сохранении');
  assertEqual(afterWord.found.length, 1, 'слово в сохранении');
  assertEqual(afterWord.found[0].word, word, 'слово записано не то');

  // оставляем незавершённый выбор из двух букв
  const neighbors = GameCore.neighborTable(boardA.rows, boardA.cols, settings.allowDiagonal);
  leftPath = [wordPath[0], neighbors[wordPath[0]][0]];
  clickCellsOf(gameA, leftPath);
  assertEqual(gameA['current-word'].textContent.length, 2, 'выбор не собрался');

  const saved = GameState.load();
  assertEqual(saved.path.join(','), leftPath.join(','), 'выбранные буквы не сохранились');
  assert(saved.remaining > 100 && saved.remaining <= 120, 'время в сохранении: ' + saved.remaining);
  assertEqual(saved.finished, false, 'раунд ещё идёт');
});
check('обновление страницы продолжает ту же партию', () => {
  const pageB = shim.loadPage(path.join(ROOT, 'game.html'));
  copyStorage(pageA.localStorage, pageB.localStorage);
  globalThis.location.search = '';
  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));
  const gameB = pageB.registry;
  const boardB = readBoardOf(gameB);

  assertEqual(boardB.letters.join(''), boardA.letters.join(''), 'поле должно остаться тем же');
  assertEqual(gameB.score.textContent, gameA.score.textContent, 'очки не восстановились');
  assertEqual(gameB['found-count'].textContent, gameA['found-count'].textContent, 'слова не восстановились');
  assertEqual(gameB['current-word'].textContent, gameA['current-word'].textContent, 'выбранные буквы не восстановились');
  assertEqual(gameB['round-over'].hidden, true, 'раунд не должен быть завершён');
  assert(gameB['found-list'].children.length === 1, 'список слов не восстановился');
  const diff = Math.abs(secondsOf(gameB.timer.textContent) - secondsOf(gameA.timer.textContent));
  assert(diff <= 2, 'таймер должен продолжаться, разница ' + diff + ' с');
});
check('завершённый раунд восстанавливается вместе с итогами', () => {
  // берём партию со страницы A и помечаем её завершённой, как это делает таймер
  const pageE = shim.loadPage(path.join(ROOT, 'game.html'));
  copyStorage(pageA.localStorage, pageE.localStorage);
  const snapshot = JSON.parse(pageE.localStorage.getItem(GameState.KEY));
  snapshot.finished = true;
  snapshot.remaining = 0;
  pageE.localStorage.setItem(GameState.KEY, JSON.stringify(snapshot));

  globalThis.location.search = '';
  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));
  const gameE = pageE.registry;

  assertEqual(gameE['round-over'].hidden, false, 'экран итогов не восстановился');
  assert(gameE['over-summary'].innerHTML.indexOf('Очки: <b>' + snapshot.score + '</b>') !== -1,
    'нет очков в итогах: ' + gameE['over-summary'].innerHTML);
  assertEqual(gameE.timer.textContent, '0:00', 'таймер должен стоять на нуле');
  assertEqual(readBoardOf(gameE).letters.join(''), boardA.letters.join(''), 'поле должно остаться прежним');
  assert(gameE['over-words'].innerHTML.indexOf('Ваши слова') !== -1, 'найденные слова потерялись в итогах');
  assert(gameE['over-words'].innerHTML.indexOf('Не найдено') === -1,
    'восстановленные итоги не должны перечислять ненайденные слова: ' + gameE['over-words'].innerHTML);
});
check('битое сохранение: игра просто стартует заново', () => {
  const pageD = shim.loadPage(path.join(ROOT, 'game.html'));
  pageD.localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(Settings.normalize({ rows: 5, cols: 5, roundSeconds: 60 })));
  pageD.localStorage.setItem(GameState.KEY, '{это не json');
  globalThis.location.search = '';
  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));
  const gameD = pageD.registry;

  assertEqual(gameD.board.children.length, 25, 'должно быть новое поле 5×5');
  assertEqual(gameD.score.textContent, '0', 'счёт начинается с нуля');
  assertEqual(gameD['round-over'].hidden, true, 'раунд должен идти');
});
check('обновление страницы со ссылкой ?s= тоже продолжает партию', () => {
  const pageF = shim.loadPage(path.join(ROOT, 'game.html'));
  copyStorage(pageA.localStorage, pageF.localStorage);
  // так выглядит настоящая перезагрузка после кнопки «Играть»: настройки ещё и в ссылке
  globalThis.location.search = '?s=' + Settings.encode(Settings.load());
  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));
  const gameF = pageF.registry;

  assertEqual(readBoardOf(gameF).letters.join(''), boardA.letters.join(''), 'поле должно остаться тем же');
  assertEqual(gameF['found-count'].textContent, gameA['found-count'].textContent, 'слова не восстановились');
  globalThis.location.search = '';
});

/* ---------- 7. Передача настроек ссылкой ---------- */

console.log('\n== Настройки через ссылку (если localStorage запрещён) ==');

check('игра берёт настройки из адресной строки', () => {
  const linked = shim.loadPage(path.join(ROOT, 'game.html'));
  const overrides = Settings.normalize({ rows: 5, cols: 8, roundSeconds: 60, minWordLength: 3, maxWordLength: 8 });
  globalThis.location.search = '?s=' + Settings.encode(overrides);

  delete require.cache[require.resolve(path.join(ROOT, 'js/game-page.js'))];
  require(path.join(ROOT, 'js/game-page.js'));

  const cells = linked.registry['board'].children;
  assertEqual(cells.length, 40, 'поле должно быть 5×8');
  assertEqual(String(linked.registry['board'].style.getPropertyValue('--cols')), '8', 'число столбцов');
  const saved = JSON.parse(linked.localStorage.getItem(Settings.STORAGE_KEY));
  assertEqual(saved.rows, 5, 'настройки из ссылки сохранены в хранилище');
  assertEqual(saved.cols, 8, 'настройки из ссылки сохранены в хранилище');
  globalThis.location.search = '';
});

/* ---------- 8. Мобильная вёрстка ---------- */

console.log('\n== Мобильная вёрстка ==');

/*
 * Разметку читаем текстом: минимальный DOM разбирает только элементы с id,
 * а <head> ему не нужен. Вёрстку на узком экране он всё равно не посчитает,
 * поэтому здесь проверяется то, без чего она не заработает: meta viewport
 * и сами блоки media queries.
 */
function readFile(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

const PAGES = ['index.html', 'game.html'];

check('обе страницы объявляют мобильный viewport', () => {
  for (const name of PAGES) {
    const meta = /<meta\s+name="viewport"[^>]*>/.exec(readFile(name));
    assert(meta, name + ': нет <meta name="viewport">');
    assert(/width=device-width/.test(meta[0]), name + ': viewport не привязан к ширине экрана');
    assert(/initial-scale=1/.test(meta[0]), name + ': нет initial-scale=1');
  }
});

check('мобильный viewport не запрещает масштабирование', () => {
  for (const name of PAGES) {
    const meta = /<meta\s+name="viewport"[^>]*>/.exec(readFile(name));
    assert(meta, name + ': нет <meta name="viewport">');
    assert(meta[0].indexOf('user-scalable=no') === -1, name + ': масштабирование запрещено');
    assert(meta[0].indexOf('maximum-scale=1') === -1, name + ': масштаб ограничен');
  }
});

check('в оформлении есть блоки для узкого экрана', () => {
  const css = readFile('css/style.css');
  assert(css.indexOf('@media (max-width: 900px)') !== -1, 'нет перехода к одной колонке');
  assert(css.indexOf('@media (max-width: 620px)') !== -1, 'нет настроек для телефона');
});

check('список выбора и строка слова не вылезают за экран', () => {
  const css = readFile('css/style.css');
  // Обе ширины заданы относительно карточки, иначе на телефоне появляется прокрутка.
  assert(/select\s*\{[^}]*max-width:\s*100%/.test(css), 'у списка выбора нет max-width: 100%');
  assert(/\.current-word\s*\{[^}]*max-width:\s*100%/.test(css), 'у строки слова нет max-width: 100%');
});

/* ---------- Итог ---------- */

Promise.all(pending).then(function () {
  Date.now = realNow;
  console.log('\n== Итог ==');
  console.log('Пройдено: ' + passed + ', провалено: ' + failures.length);
  if (failures.length) {
    for (const failure of failures) console.log('  - ' + failure.name + ': ' + failure.message);
    process.exit(1);
  }
  process.exit(0);
});
