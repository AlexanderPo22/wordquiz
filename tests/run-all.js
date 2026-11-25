'use strict';
/*
 * Запускает все проверки подряд: логику, страницы и чистоту словаря.
 * Запуск: node tests/run-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const steps = [
  { title: 'Словарь: сборка и обратная проверка', file: 'tools/build-wordlist.js' },
  { title: 'Словарь: чёрный список', file: 'tools/check-blocklist.js' },
  { title: 'Логика игры', file: 'tests/run-tests.js' },
  { title: 'Страницы: настройки и игра', file: 'tests/pages-test.js' }
];

let failed = 0;
for (const step of steps) {
  console.log('\n### ' + step.title + ' (' + step.file + ')');
  const result = spawnSync(process.execPath, [path.join(ROOT, step.file)], {
    stdio: 'inherit',
    cwd: ROOT
  });
  if (result.status !== 0) {
    failed++;
    console.log('!!! шаг завершился с кодом ' + result.status);
  }
}

console.log('\n' + (failed === 0
  ? 'Все проверки пройдены.'
  : 'Провалено шагов: ' + failed));
process.exit(failed === 0 ? 0 : 1);
