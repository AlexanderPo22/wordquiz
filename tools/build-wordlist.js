'use strict';
/*
 * Собирает js/wordlist.js из исходных текстовых списков в tools/.
 * Запуск: node tools/build-wordlist.js
 *
 * Исходные файлы — публичный список частотных английских слов
 * (google-10000-english, вариант без нецензурной лексики).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// только список без нецензурной лексики: он даёт почти столько же слов,
// но не требует вычищать грубость вручную
const INPUTS = ['tools/raw-clean.txt'];
const OUTPUT = path.join(ROOT, 'js', 'wordlist.js');

const MIN_LEN = 3;
const MAX_LEN = 10;

const BLOCK = new Set(require('./blocklist.js'));

function collect() {
  const found = new Set();
  for (const rel of INPUTS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const word = rawLine.trim().toLowerCase();
      if (!/^[a-z]+$/.test(word)) continue;
      if (word.length < MIN_LEN || word.length > MAX_LEN) continue;
      if (BLOCK.has(word)) continue;
      found.add(word);
    }
  }
  return Array.from(found).sort(function (a, b) {
    return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  });
}

function render(words) {
  const stats = {};
  for (const w of words) stats[w.length] = (stats[w.length] || 0) + 1;
  const meta = Object.keys(stats)
    .sort(function (a, b) { return a - b; })
    .map(function (len) { return len + ':' + stats[len]; })
    .join(', ');

  const chunks = [];
  for (let i = 0; i < words.length; i += 14) {
    // завершающий пробел обязателен: иначе последнее слово куска склеится с первым словом следующего
    chunks.push("  '" + words.slice(i, i + 14).join(' ') + " ' +");
  }
  // последняя строка без плюса
  chunks[chunks.length - 1] = chunks[chunks.length - 1].replace(/ \+$/, ';');

  return [
    '/* Сгенерировано автоматически: node tools/build-wordlist.js. Не править вручную. */',
    '/* Слов: ' + words.length + '. По длинам: ' + meta + ' */',
    '(function (root) {',
    "  'use strict';",
    '  var RAW =',
    chunks.join('\n'),
    '  var words = RAW.split(/\\s+/).filter(Boolean);',
    '  var index = Object.create(null);',
    '  var byLength = Object.create(null);',
    '  for (var i = 0; i < words.length; i++) {',
    '    var w = words[i];',
    '    index[w] = true;',
    '    (byLength[w.length] || (byLength[w.length] = [])).push(w);',
    '  }',
    '  root.Dictionary = {',
    '    words: words,',
    '    index: index,',
    '    byLength: byLength,',
    '    minLength: ' + MIN_LEN + ',',
    '    maxLength: ' + MAX_LEN + ',',
    '    has: function (word) { return index[String(word).toLowerCase()] === true; },',
    '    byLengthSorted: function (len) { return (byLength[len] || []).slice(); }',
    '  };',
    '})(typeof window !== "undefined" ? window : globalThis);',
    '',
  ].join('\n');
}

const words = collect();
fs.writeFileSync(OUTPUT, render(words), 'utf8');

/*
 * Обратная проверка: читаем готовый файл, вытаскиваем строковые литералы,
 * склеиваем и сверяем со исходным списком. Ловит склейку слов на границах
 * кусков строки — именно так в словарь когда-то попало «activeactors».
 */
function verify(expected) {
  const source = fs.readFileSync(OUTPUT, 'utf8');
  // берём только тело объявления RAW, чтобы не захватить другие строки вида 'use strict'
  const start = source.indexOf('var RAW =');
  const end = source.indexOf('var words = RAW');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('проверка не пройдена: не найдено объявление RAW в ' + OUTPUT);
  }
  const literals = source.slice(start, end).match(/'[^']*'/g) || [];
  const decoded = literals
    .map(function (lit) { return lit.slice(1, -1); })
    .join('')
    .split(/\s+/)
    .filter(Boolean);
  const expectedSet = new Set(expected);
  const decodedSet = new Set(decoded);
  if (decoded.length !== expected.length) {
    throw new Error('проверка не пройдена: слов в файле ' + decoded.length + ', ожидалось ' + expected.length);
  }
  for (const word of decoded) {
    if (!expectedSet.has(word)) throw new Error('проверка не пройдена: лишнее слово «' + word + '»');
  }
  for (const word of expected) {
    if (!decodedSet.has(word)) throw new Error('проверка не пройдена: потеряно слово «' + word + '»');
  }
}

verify(words);

console.log('Слов записано: ' + words.length);
console.log('Файл: ' + OUTPUT);
console.log('Обратная проверка: ок');
