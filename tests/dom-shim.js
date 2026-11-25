'use strict';
/*
 * Минимальная реализация DOM для проверки страниц без браузера.
 * Поддерживает ровно то, что используют скрипты страниц: поиск по id,
 * создание/вложение элементов, классы, атрибуты, innerHTML, textContent,
 * всплытие событий и localStorage.
 */

class ClassList {
  constructor(element) {
    this.element = element;
    this.set = new Set();
  }
  add() {
    for (const name of arguments) this.set.add(name);
    this.element._className = Array.from(this.set).join(' ');
  }
  remove() {
    for (const name of arguments) this.set.delete(name);
    this.element._className = Array.from(this.set).join(' ');
  }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const want = force === undefined ? !this.set.has(name) : !!force;
    if (want) this.set.add(name); else this.set.delete(name);
    this.element._className = Array.from(this.set).join(' ');
    return want;
  }
}

class Style {
  constructor() { this.properties = {}; }
  setProperty(name, value) { this.properties[name] = String(value); }
  getPropertyValue(name) { return this.properties[name] || ''; }
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.classList = new ClassList(this);
    this.style = new Style();
    this._className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.hidden = false;
    this._value = '';
    this.checked = false;
    this.id = '';
  }

  /* value в браузере всегда строка — повторяем это поведение */
  get value() { return this._value; }
  set value(newValue) { this._value = String(newValue); }

  get className() { return this._className; }
  set className(value) {
    this._className = String(value);
    this.classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML === '') this.children = [];
  }

  get textContent() { return this._textContent; }
  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'hidden') this.hidden = true;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selector.startsWith('.')) {
        if (node.classList && node.classList.contains(selector.slice(1))) return node;
      } else if (node.tagName && node.tagName.toLowerCase() === selector.toLowerCase()) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some(function (child) { return child.contains(node); });
  }

  /** Вызывает обработчики и поднимает событие к родителям (как в браузере). */
  dispatch(type, extra) {
    const event = Object.assign({
      type: type,
      target: this,
      preventDefault: function () { this.defaultPrevented = true; }
    }, extra || {});
    let node = this;
    while (node) {
      const handlers = node.listeners[type];
      if (handlers) {
        for (const handler of handlers.slice()) handler.call(node, event);
      }
      node = node.parentNode;
    }
    return event;
  }
}

/** Разбирает HTML в дерево элементов: текст и комментарии пропускаются. */
function parseHtml(html) {
  const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
  const tagRe = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^>]*?)?)(\/?)>|[^<]+/gi;
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const root = new Element('#root');
  const stack = [root];

  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const closeTag = match[1];
    const openTag = match[2];
    const attrText = match[3];
    const selfClosed = match[4];

    if (closeTag) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === closeTag.toUpperCase()) { stack.length = i; break; }
      }
      continue;
    }
    if (!openTag) continue; // текст, комментарий, DOCTYPE

    const element = new Element(openTag);
    if (attrText) {
      let attr;
      attrRe.lastIndex = 0;
      while ((attr = attrRe.exec(attrText)) !== null) {
        const value = attr[2] !== undefined ? attr[2] : (attr[3] !== undefined ? attr[3] : (attr[4] !== undefined ? attr[4] : ''));
        element.setAttribute(attr[1], value);
      }
    }
    stack[stack.length - 1].appendChild(element);
    if (!selfClosed && !VOID.has(openTag.toLowerCase())) stack.push(element);
  }
  return root;
}

function collectIds(element, registry) {
  if (element.id) registry[element.id] = element;
  for (const child of element.children) collectIds(child, registry);
}

/** Ищет элемент по id в живом дереве: скрипты создают поля динамически. */
function findById(element, id) {
  if (element.id === id) return element;
  for (const child of element.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function findByTag(element, tag) {
  if (element.tagName === tag.toUpperCase()) return element;
  for (const child of element.children) {
    const found = findByTag(child, tag);
    if (found) return found;
  }
  return null;
}

function createLocalStorage() {
  const data = new Map();
  return {
    getItem: function (key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem: function (key, value) { data.set(String(key), String(value)); },
    removeItem: function (key) { data.delete(String(key)); },
    clear: function () { data.clear(); },
    get length() { return data.size; },
    _data: data
  };
}

/*
 * matchMedia для проверки темы: запоминаем запросы и умеем менять ответ,
 * как будто пользователь переключил тёмную тему в системе.
 */
function createMatchMedia() {
  const queries = [];
  let systemDark = false;

  function makeEntry(query) {
    const entry = {
      media: query,
      matches: systemDark,
      listeners: [],
      addEventListener: function (type, handler) {
        if (type === 'change') entry.listeners.push(handler);
      },
      removeEventListener: function (type, handler) {
        const at = entry.listeners.indexOf(handler);
        if (at !== -1) entry.listeners.splice(at, 1);
      },
      addListener: function (handler) { entry.addEventListener('change', handler); },
      removeListener: function (handler) { entry.removeEventListener('change', handler); }
    };
    queries.push(entry);
    return entry;
  }

  function matchMedia(query) {
    return makeEntry(query);
  }

  /** Системная настройка: тёмная или светлая. Новые запросы получают этот же ответ. */
  function setSystem(dark) {
    systemDark = !!dark;
    for (const entry of queries) {
      if (entry.media.indexOf('dark') === -1) continue;
      entry.matches = systemDark;
      for (const handler of entry.listeners.slice()) {
        handler.call(entry, { matches: entry.matches, media: entry.media });
      }
    }
  }

  matchMedia.queries = queries;
  matchMedia.setSystem = setSystem;
  return matchMedia;
}

/**
 * Готовит глобальные window/document по файлу страницы.
 * @returns {{registry:Object, document:Element, localStorage:Object}}
 */
function loadPage(htmlPath) {
  const fs = require('fs');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const root = parseHtml(html);

  const registry = {};
  collectIds(root, registry);

  const documentListeners = {};
  const document = new Element('#document');
  // как в браузере: documentElement — это <html>, а не служебная обёртка
  document.documentElement = findByTag(root, 'html') || root;
  document.body = findByTag(root, 'body') || root;
  document.createElement = function (tag) { return new Element(tag); };
  document.getElementById = function (id) { return findById(root, String(id)); };
  document.querySelectorAll = function () { return []; };
  document.addEventListener = function (type, handler) {
    if (!documentListeners[type]) documentListeners[type] = [];
    documentListeners[type].push(handler);
  };
  /** Как document.dispatchEvent: у события есть тип, а дальше — что передали. */
  document.dispatchEvent = function (event) {
    const type = event && event.type;
    for (const handler of (documentListeners[type] || []).slice()) {
      handler.call(document, Object.assign({ target: document, preventDefault: function () {} }, event));
    }
  };

  const storage = createLocalStorage();
  const matchMedia = createMatchMedia();
  const win = globalThis;
  win.window = win;
  win.document = document;
  win.localStorage = storage;
  win.matchMedia = matchMedia;
  win.location = { href: 'file:///' + htmlPath.replace(/\\/g, '/'), search: '' };

  return {
    registry: registry,
    document: document,
    localStorage: storage,
    matchMedia: matchMedia,
    root: root,
    html: document.documentElement,
    /**
     * Разбор страницы закончен — как DOMContentLoaded в браузере.
     * Скрипты страниц подключаются в конце body, поэтому вызывать это
     * нужно после их загрузки.
     */
    ready: function () { document.dispatchEvent({ type: 'DOMContentLoaded' }); }
  };
}

module.exports = {
  loadPage: loadPage,
  Element: Element,
  parseHtml: parseHtml,
  createLocalStorage: createLocalStorage,
  createMatchMedia: createMatchMedia
};
