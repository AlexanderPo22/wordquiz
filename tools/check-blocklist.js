'use strict';
/*
 * Проверяет, что в собранном словаре нет слов из чёрного списка.
 * Исходные списки проверяются для справки: там такие слова есть по определению,
 * их отсекает сборка. Запуск: node tools/check-blocklist.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCK = require('./blocklist.js');

function wordsOf(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(function (line) { return line.trim().toLowerCase(); })
      .filter(function (word) { return /^[a-z]{3,10}$/.test(word); })
  );
}

function wordsOfBuilt(file) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('var RAW =');
  const end = source.indexOf('var words = RAW');
  const literals = source.slice(start, end).match(/'[^']*'/g) || [];
  return new Set(literals.map(function (lit) { return lit.slice(1, -1); }).join('').split(/\s+/).filter(Boolean));
}

let errors = 0;
const targets = [
  { rel: 'tools/raw-clean.txt', built: false },
  { rel: 'js/wordlist.js', built: true }
];

for (const target of targets) {
  const file = path.join(ROOT, target.rel);
  if (!fs.existsSync(file)) continue;
  const set = target.built ? wordsOfBuilt(file) : wordsOf(file);
  const hits = BLOCK.filter(function (word) { return set.has(word); });
  if (target.built) errors += hits.length;
  console.log(target.rel + ': слов ' + set.size + ', из чёрного списка: ' + hits.length +
    (hits.length ? ' → ' + hits.slice(0, 12).join(', ') + (hits.length > 12 ? ' …' : '') : ''));
}

console.log(errors === 0
  ? '\nВ собранном словаре нежелательных слов нет.'
  : '\nВ собранном словаре остались нежелательные слова: ' + errors);
process.exit(errors === 0 ? 0 : 1);

