/* Общие утилиты: генератор случайных чисел, выборка, клонирование. */
(function (root) {
  'use strict';

  /** Детерминированный ГПСЧ (mulberry32) — нужен для тестов и воспроизводимости. */
  function makeRng(seed) {
    var a = (seed === undefined || seed === null) ? (Date.now() >>> 0) : (seed >>> 0);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function toInt(value, fallback, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = fallback;
    return clamp(n, min, max);
  }

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pick(rng, list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(rng() * list.length)];
  }

  function shuffle(rng, list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function merge(base, patch) {
    var out = {};
    var key;
    for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    for (key in patch) if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
    return out;
  }

  function formatTime(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  /** Склонение существительного: plural(5, 'слово', 'слова', 'слов') → 'слов'. */
  function plural(count, one, few, many) {
    var n = Math.abs(count) % 100;
    var last = n % 10;
    if (n > 10 && n < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  root.Util = {
    makeRng: makeRng,
    clamp: clamp,
    toInt: toInt,
    randInt: randInt,
    pick: pick,
    shuffle: shuffle,
    merge: merge,
    formatTime: formatTime,
    plural: plural
  };
})(typeof window !== 'undefined' ? window : globalThis);
