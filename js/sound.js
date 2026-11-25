/*
 * Звук: короткие сигналы, собранные на Web Audio API прямо в браузере.
 * Никаких звуковых файлов — всё синтезируется на лету, поэтому проект
 * остаётся без сборки, без зависимостей и без лишних килобайт.
 * Выбор игрока хранится в localStorage; без хранилища звук живёт до перезагрузки.
 */
(function (root) {
  'use strict';

  var KEY = 'wordgame.sound.v1';
  var ON = 'on';
  var OFF = 'off';
  var BOUND = '__soundBound';

  var ICONS = { on: '🔊', off: '🔇' };
  var SWITCH_TO = {
    on: { text: 'Звук', title: 'Выключить звук' },
    off: { text: 'Звук', title: 'Включить звук' }
  };

  var context = null;
  var master = null;
  var memory = null;

  function storage() {
    try {
      return root.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  function normalize(mode) {
    if (mode === ON || mode === true) return ON;
    if (mode === OFF || mode === false) return OFF;
    return null;
  }

  function save(mode) {
    memory = mode;
    try {
      var store = storage();
      if (store) store.setItem(KEY, mode);
    } catch (err) {
      /* приватный режим — помним выбор до перезагрузки */
    }
  }

  /** Сохранённый выбор; если его нет — звук включён. */
  function stored() {
    try {
      var store = storage();
      var raw = store ? store.getItem(KEY) : null;
      var mode = normalize(raw);
      if (mode) return mode;
    } catch (err) {
      /* хранилище недоступно */
    }
    return memory || ON;
  }

  function isOn() {
    return stored() === ON;
  }

  function setOn(value) {
    var mode = value ? ON : OFF;
    save(mode);
    updateButtons();
    return mode === ON;
  }

  function toggle() {
    return setOn(!isOn());
  }

  /* ---------- Синтез ---------- */

  /** Громкость общая: отдельные звуки задают её долей от неё. */
  var MASTER_GAIN = 0.6;

  /** Аудиоконтекст создаётся при первом звуке: до клика браузер его не даст. */
  function ensure() {
    if (context) {
      if (context.state === 'suspended' && context.resume) {
        try { context.resume(); } catch (err) { /* ничего не поделать */ }
      }
      return context;
    }
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    } catch (err) {
      context = null;
      return null;
    }
    return context;
  }

  var supported = function () {
    return !!(root.AudioContext || root.webkitAudioContext);
  };

  /**
   * Один тон: частота, длительность и громкость.
   * options: { freq, to, type, duration, gain, delay, attack }
   */
  function tone(options) {
    var ctx = ensure();
    if (!ctx) return;
    var start = ctx.currentTime + (options.delay || 0);
    var duration = options.duration || 0.12;
    var peak = Math.max(0.0001, options.gain === undefined ? 0.1 : options.gain);
    var attack = Math.min(options.attack === undefined ? 0.006 : options.attack, duration / 2);

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /* «Тик-так»: два слегка разных щелчка, чтобы ticking не был монотонным */
  var tickSide = 0;

  function playIfOn(fn) {
    if (!isOn()) return;
    fn();
  }

  var sounds = {
    /** Клик по сайту: самый короткий и тихий сигнал. */
    click: function () {
      playIfOn(function () {
        tone({ freq: 1650, to: 1400, type: 'triangle', duration: 0.035, gain: 0.05, attack: 0.001 });
      });
    },

    /** Тиканье часов: спокойное и «последние секунды». */
    tick: function (urgent) {
      playIfOn(function () {
        tickSide = 1 - tickSide;
        if (urgent) {
          tone({ freq: 1900, type: 'square', duration: 0.055, gain: 0.075, attack: 0.001 });
        } else {
          tone({
            freq: tickSide ? 1180 : 940,
            type: 'triangle',
            duration: 0.045,
            gain: 0.055,
            attack: 0.001
          });
        }
      });
    },

    /** Гудок: появилось новое слово. */
    honk: function () {
      playIfOn(function () {
        tone({ freq: 392, type: 'sawtooth', duration: 0.14, gain: 0.1, attack: 0.01 });
        tone({ freq: 494, type: 'sawtooth', duration: 0.14, gain: 0.07, delay: 0.02, attack: 0.01 });
        tone({ freq: 392, type: 'sawtooth', duration: 0.22, gain: 0.1, delay: 0.17, attack: 0.01 });
        tone({ freq: 523, type: 'sawtooth', duration: 0.22, gain: 0.07, delay: 0.19, attack: 0.01 });
      });
    },

    /** Слово найдено: восходящее арпеджио. */
    found: function () {
      playIfOn(function () {
        var notes = [523, 659, 784, 1047];
        for (var i = 0; i < notes.length; i++) {
          tone({ freq: notes[i], type: 'triangle', duration: 0.16, gain: 0.095, delay: i * 0.07 });
        }
      });
    },

    /** Не та буква: короткий низкий «бз-з». */
    wrong: function () {
      playIfOn(function () {
        tone({ freq: 233, to: 130, type: 'square', duration: 0.17, gain: 0.075 });
      });
    },

    /** Раунд закончился: три нисходящих ноты. */
    end: function () {
      playIfOn(function () {
        var notes = [392, 330, 262];
        for (var i = 0; i < notes.length; i++) {
          tone({ freq: notes[i], type: 'triangle', duration: 0.3, gain: 0.1, delay: i * 0.16 });
        }
      });
    }
  };

  /* ---------- Кнопка в шапке ---------- */

  function updateButtons(animate) {
    var doc = root.document;
    if (!doc || !doc.getElementById) return;
    var button = doc.getElementById('btn-sound');
    if (!button) return;
    var on = isOn();
    if (button.setAttribute) {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('title', SWITCH_TO[on ? 'on' : 'off'].title);
      button.setAttribute('aria-label', on ? 'Звук включён' : 'Звук выключен');
    }
    var icon = doc.getElementById('sound-icon');
    if (icon) {
      icon.textContent = ICONS[on ? 'on' : 'off'];
      if (icon.classList && icon.classList.remove) icon.classList.remove('pop');
      if (animate && icon.classList && icon.classList.add) {
        void icon.offsetWidth; /* перезапуск анимации */
        icon.classList.add('pop');
      }
    }
    var text = doc.getElementById('sound-text');
    if (text) text.textContent = SWITCH_TO[on ? 'on' : 'off'].text;
  }

  /** Скрипт подключён в <head>, поэтому кнопки могут быть ещё не разобраны. */
  function bind() {
    var doc = root.document;
    if (!doc) return;

    // Звук клика — на весь сайт: слушаем документ в фазе перехвата,
    // чтобы срабатывало раньше собственных обработчиков страницы.
    if (doc.addEventListener && !doc[BOUND]) {
      doc[BOUND] = true;
      doc.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('[data-sound-toggle]')) return;
        sounds.click();
      }, true);
    }

    var button = doc.getElementById('btn-sound');
    if (!button) return;
    if (button.addEventListener && !button[BOUND]) {
      button[BOUND] = true;
      button.addEventListener('click', function () {
        var on = toggle();
        updateButtons(true);
        // включая звук, подтверждаем это коротким сигналом
        if (on) sounds.found();
      });
    }
    updateButtons();
  }

  root.Sound = {
    KEY: KEY,
    ON: ON,
    OFF: OFF,
    supported: supported,
    stored: stored,
    isOn: isOn,
    setOn: setOn,
    toggle: toggle,
    bind: bind,
    updateButtons: updateButtons,
    click: sounds.click,
    tick: sounds.tick,
    honk: sounds.honk,
    found: sounds.found,
    wrong: sounds.wrong,
    end: sounds.end
  };

  bind();

  var doc = root.document;
  if (doc && doc.addEventListener) doc.addEventListener('DOMContentLoaded', bind);
})(typeof window !== 'undefined' ? window : globalThis);
