'use strict';

// Mocked integration tests only. These do not launch or emulate a real browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('./engine.js');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class EventTargetMock {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  emit(type, data = {}) {
    const event = { type, target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...data };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

class CanvasContextMock {
  constructor() { this.calls = []; }
}
for (const method of ['setTransform', 'clearRect', 'save', 'translate', 'scale', 'restore', 'beginPath',
  'arc', 'fill', 'lineTo', 'moveTo', 'stroke', 'setLineDash', 'ellipse', 'rotate', 'drawImage', 'fillText']) {
  CanvasContextMock.prototype[method] = function (...args) {
    this.calls.push({ method, args, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  };
}

class ElementMock extends EventTargetMock {
  constructor(id = '') {
    super();
    this.id = id;
    this.disabled = false;
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.options = [];
    this.captures = new Set();
    this.context = new CanvasContextMock();
    this.rect = { left: 0, top: 0, width: 700, height: 400 };
    this.classes = new Set();
    this.classList = {
      toggle: (name, on) => {
        if (on === undefined) on = !this.classes.has(name);
        if (on) this.classes.add(name); else this.classes.delete(name);
        return on;
      },
      contains: name => this.classes.has(name),
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getBoundingClientRect() { return { ...this.rect }; }
  getContext(kind) {
    assert.equal(kind, '2d');
    return this.context;
  }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  replaceChildren(...children) { this.options = children; this.value = children[0]?.value ?? ''; }
  add(option) { this.options.push(option); }
  click() { if (!this.disabled) this.emit('click'); }
}

function boot({ reducedMotion = false, padWidth = 320, padHeight = 200, stageWidth = 700, stageHeight = 400 } = {}) {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new ElementMock(match[1])]));
  const $ = id => {
    assert.ok(nodes.has(id), `App requires #${id} in index.html`);
    return nodes.get(id);
  };
  $('drawpad').rect = { left: 25, top: 40, width: padWidth, height: padHeight };
  $('field').rect = { left: 400, top: 100, width: stageWidth, height: stageHeight };
  $('world').rect = { ...$('field').rect };
  const swatches = [...html.matchAll(/class="swatch[^\"]*" data-color="([^"]+)"/g)].map(match => {
    const swatch = new ElementMock(); swatch.dataset.color = match[1]; return swatch;
  });
  const rules = [...html.matchAll(/type="radio" name="rule" value="([^"]+)"([^>]*)/g)].map(match => {
    const input = new ElementMock(); input.value = match[1]; input.checked = /\bchecked\b/.test(match[2]); return input;
  });
  const inspectorIcon = new ElementMock(), workbench = new ElementMock();
  const document = new EventTargetMock();
  document.hidden = false;
  document.getElementById = $;
  document.querySelectorAll = selector => {
    if (selector === '.swatch') return swatches;
    if (selector === 'input[name="rule"]') return rules;
    throw new Error(`Unsupported querySelectorAll: ${selector}`);
  };
  document.querySelector = selector => {
    if (selector === 'input[name="rule"]:checked') return rules.find(rule => rule.checked);
    if (selector === '.inspector-icon') return inspectorIcon;
    if (selector === '.workbench') return workbench;
    throw new Error(`Unsupported querySelector: ${selector}`);
  };
  const sprites = [];
  document.createElement = tag => {
    assert.equal(tag, 'canvas');
    const node = new ElementMock(); sprites.push(node); return node;
  };
  const window = new EventTargetMock();
  window.devicePixelRatio = 2;
  const media = new EventTargetMock(); media.matches = reducedMotion;
  window.matchMedia = query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; };
  let world;
  const additions = [], stepCalls = [], frames = [], observers = [];
  window.DoodleEngine = {
    ...Engine,
    createWorld(...args) { world = Engine.createWorld(...args); return world; },
    addCreature(w, options) {
      const result = Engine.addCreature(w, options);
      additions.push({ options, drawingAtAdd: plain(options.drawing), result });
      return result;
    },
    step(w, dt) { stepCalls.push(dt); return Engine.step(w, dt); },
  };
  class OptionMock {
    constructor(text, value) { this.text = text; this.textContent = text; this.value = value; }
  }
  class ResizeObserverMock {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
  }
  vm.runInNewContext(source, {
    window, document, Option: OptionMock, ResizeObserver: ResizeObserverMock,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
  }, { filename: 'app.js' });

  function pointer(type, x = 80, y = 60, id = 1, extra = {}) {
    const pad = $('drawpad').rect;
    const scale = Math.min(pad.width / 320, pad.height / 200);
    const offsetX = (pad.width - 320 * scale) / 2, offsetY = (pad.height - 200 * scale) / 2;
    return $('drawpad').emit(type, {
      pointerId: id, pointerType: 'pen', button: 0,
      clientX: pad.left + offsetX + x * scale, clientY: pad.top + offsetY + y * scale, ...extra,
    });
  }
  function draw(points = [[20, 30], [60, 40], [100, 80]], id = 1) {
    pointer('pointerdown', ...points[0], id);
    for (const point of points.slice(1)) pointer('pointermove', ...point, id);
    pointer('pointerup', ...points[points.length - 1], id);
  }
  function chooseRule(value) {
    const chosen = rules.find(rule => rule.value === value);
    assert.ok(chosen, `Unknown test rule ${value}`);
    rules.forEach(rule => { rule.checked = rule === chosen; });
    chosen.emit('change');
  }
  function frame(timestamp) {
    assert.equal(frames.length, 1, 'App should have one pending animation callback');
    frames.shift()(timestamp);
  }
  return { $, world, additions, stepCalls, frames, sprites, swatches, rules, media, window, document,
    inspectorIcon, observers, draw, pointer, chooseRule, frame };
}

test('mocked app initializes three named examples with all movement rules', () => {
  const app = boot();
  assert.deepEqual(app.world.creatures.map(c => c.name), ['Pip', 'Pebble', 'Sprig']);
  assert.deepEqual(app.world.creatures.map(c => c.rule), ['friends', 'space', 'wander']);
  assert.equal(app.$('count').textContent, '3 / 20');
  assert.equal(app.$('creature-select').options.length, 4);
  assert.equal(app.sprites.length, 3);
  assert.equal(app.world.width, 700);
  assert.equal(app.world.height, 400);
  assert.equal(app.frames.length, 1);
});

test('mocked empty drawing disables release, undo and clear and guards forced release', () => {
  const app = boot();
  for (const id of ['release', 'undo', 'clear']) assert.equal(app.$(id).disabled, true);
  assert.equal(app.$('draw-hint').hidden, false);
  app.$('release').emit('click');
  assert.equal(app.world.creatures.length, 3);
});

test('mocked pointer drawing releases exact points, widths and colors as an independent drawing', () => {
  const app = boot();
  app.draw([[10, 20], [40, 50], [90, 120]]);
  app.swatches[2].click();
  app.draw([[120, 35], [130, 40]], 2);
  assert.equal(app.$('release').disabled, false);
  assert.equal(app.$('draw-hint').hidden, true);
  app.$('release').click();
  const creature = app.world.creatures[3];
  const expected = [
    { color: '#32342d', width: 3.5, points: [{ x: 10, y: 20 }, { x: 40, y: 50 }, { x: 90, y: 120 }] },
    { color: '#446983', width: 3.5, points: [{ x: 120, y: 35 }, { x: 130, y: 40 }] },
  ];
  assert.deepEqual(plain(creature.drawing), expected);
  assert.deepEqual(app.additions[3].drawingAtAdd, expected);
  assert.equal(creature.rule, 'friends');
  assert.equal(app.$('creature-select').value, '4');
  assert.match(app.$('inspect-name').textContent, /Doodle 4/);
  assert.equal(app.$('release').disabled, true);
  assert.equal(app.$('draw-hint').hidden, false);
  const spriteStrokes = app.sprites[3].context.calls.filter(call => call.method === 'stroke');
  assert.deepEqual(spriteStrokes.map(call => call.strokeStyle), ['#32342d', '#446983']);
  app.draw([[200, 100], [250, 150]], 3);
  app.$('clear').click();
  assert.deepEqual(plain(creature.drawing), expected, 'Later pad edits must not mutate a released doodle');
});

test('mocked drawpad coordinates remain exact when scaled and letterboxed', () => {
  const app = boot({ padWidth: 480, padHeight: 240 });
  app.draw([[10, 20], [200, 100]]);
  app.$('release').click();
  assert.deepEqual(plain(app.world.creatures[3].drawing[0].points), [{ x: 10, y: 20 }, { x: 200, y: 100 }]);
});

test('mocked one-point taps become dots and can be released', () => {
  const app = boot();
  app.draw([[80, 60]]);
  app.$('release').click();
  assert.deepEqual(plain(app.world.creatures[3].drawing[0].points), [{ x: 80, y: 60 }]);
  assert.ok(app.sprites[3].context.calls.some(call => call.method === 'arc'));
});

test('mocked undo removes only the final stroke and clear restores empty state', () => {
  const app = boot();
  app.draw([[10, 20], [30, 40]], 1);
  app.draw([[50, 60], [70, 80]], 2);
  app.$('undo').click();
  app.$('release').click();
  assert.deepEqual(plain(app.world.creatures[3].drawing[0].points), [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  assert.equal(app.world.creatures[3].drawing.length, 1);
  app.draw([[10, 20]], 3);
  app.$('undo').click();
  for (const id of ['release', 'undo', 'clear']) assert.equal(app.$(id).disabled, true);
  app.draw([[50, 60]], 4);
  app.$('clear').click();
  assert.equal(app.$('draw-hint').hidden, false);
  assert.equal(app.$('release').disabled, true);
  assert.match(app.$('studio-message').textContent, /fresh page/);
});

test('mocked rule changes update help and apply the selected rule at release', () => {
  const app = boot();
  for (const [rule, help] of [['space', /145 px/], ['wander', /seeded direction/], ['friends', /nearest neighbor/]]) {
    app.chooseRule(rule);
    assert.match(app.$('rule-help').textContent, help);
    app.draw();
    app.$('release').click();
    assert.equal(app.world.creatures.at(-1).rule, rule);
  }
});

test('mocked repeated examples stop exactly at 20 and block further examples/releases', () => {
  const app = boot();
  for (let i = 0; i < 20; i++) app.$('add-examples').click();
  assert.equal(app.world.creatures.length, 20);
  assert.equal(app.$('count').textContent, '20 / 20');
  assert.equal(app.$('add-examples').disabled, true);
  assert.equal(app.$('creature-select').options.length, 21);
  app.draw();
  assert.equal(app.$('release').disabled, true);
  app.$('release').emit('click');
  app.$('add-examples').emit('click');
  assert.equal(app.world.creatures.length, 20);
  assert.equal(app.world.nextId, 21);
  assert.match(app.$('studio-message').textContent, /herd is full/);
});

test('mocked reset restores three examples and IDs while preserving a pending drawing', () => {
  const app = boot();
  app.draw(); app.$('release').click();
  app.$('add-examples').click();
  app.$('pause').click();
  app.draw([[100, 50], [130, 70]]);
  app.$('reset').click();
  assert.deepEqual(app.world.creatures.map(c => c.id), [1, 2, 3]);
  assert.deepEqual(app.world.creatures.map(c => c.name), ['Pip', 'Pebble', 'Sprig']);
  assert.equal(app.world.nextId, 4);
  assert.equal(app.world.time, 0);
  assert.equal(app.world.paused, false);
  assert.equal(app.$('creature-select').value, '');
  assert.equal(app.$('release').disabled, false);
  app.$('release').click();
  assert.equal(app.world.creatures[3].id, 4);
  assert.deepEqual(plain(app.world.creatures[3].drawing[0].points), [{ x: 100, y: 50 }, { x: 130, y: 70 }]);
});

test('mocked pause/play updates controls and animation steps stop while paused', () => {
  const app = boot();
  app.frame(0); app.frame(50);
  assert.ok(app.world.time > 0);
  assert.ok(app.stepCalls.every(dt => dt === 1 / 60));
  app.$('pause').click();
  assert.equal(app.world.paused, true);
  assert.equal(app.$('pause').getAttribute('aria-pressed'), 'true');
  assert.equal(app.$('pause').getAttribute('aria-label'), 'Play animation');
  assert.match(app.$('pause').innerHTML, /Play/);
  assert.equal(app.$('live-dot').classList.contains('paused'), true);
  const before = plain(app.world);
  app.frame(1000); app.frame(2000);
  assert.deepEqual(plain(app.world), before);
  app.$('pause').click();
  assert.equal(app.$('pause').getAttribute('aria-label'), 'Pause animation');
  assert.equal(app.$('pause').getAttribute('aria-pressed'), 'false');
  app.frame(2050);
  assert.ok(app.world.time > before.time);
});

test('mocked dropdown selection shows actual rule, status and paused status', () => {
  const app = boot();
  const select = app.$('creature-select');
  for (const c of app.world.creatures) {
    select.value = String(c.id); select.emit('change');
    assert.equal(app.$('inspect-name').textContent, `${c.name} · ${Engine.RULES[c.rule]}`);
    assert.equal(app.$('inspect-status').textContent, c.status);
  }
  app.$('pause').click();
  assert.match(app.$('inspect-status').textContent, /^Paused · /);
  select.value = ''; select.emit('change');
  assert.equal(app.$('inspect-name').textContent, 'Everyone has their own little way.');
  assert.match(app.$('inspect-status').textContent, /^Paused\./);
});

test('mocked playground pointer selection matches the nearest hit and clears on empty space', () => {
  const app = boot();
  const c = app.world.creatures[0], rect = app.$('world').rect;
  app.$('world').emit('pointerup', { clientX: rect.left + c.x, clientY: rect.top + c.y });
  assert.equal(app.$('creature-select').value, String(c.id));
  assert.match(app.$('inspect-name').textContent, /^Pip/);
  app.$('world').emit('pointerup', { clientX: rect.left, clientY: rect.top });
  assert.equal(app.$('creature-select').value, '');
});

test('mocked reduced-motion startup and reset are paused, with manual play available', () => {
  const app = boot({ reducedMotion: true });
  assert.equal(app.world.paused, true);
  assert.equal(app.$('pause').getAttribute('aria-label'), 'Play animation');
  app.frame(0); app.frame(500);
  assert.equal(app.world.time, 0);
  app.$('pause').click();
  app.frame(550);
  assert.ok(app.world.time > 0);
  app.$('reset').click();
  assert.equal(app.world.paused, true);
  assert.equal(app.world.time, 0);
});

test('mocked enabling reduced motion pauses an already-running world', () => {
  const app = boot();
  app.media.matches = true; app.media.emit('change', { matches: true });
  assert.equal(app.world.paused, true);
  assert.equal(app.$('pause').getAttribute('aria-label'), 'Play animation');
});

test('mocked pointercancel releases capture and allows the next independent stroke', () => {
  const app = boot();
  app.pointer('pointerdown', 10, 20, 7);
  app.pointer('pointermove', 30, 40, 7);
  assert.equal(app.$('drawpad').hasPointerCapture(7), true);
  app.pointer('pointercancel', 30, 40, 7);
  assert.equal(app.$('drawpad').hasPointerCapture(7), false);
  app.pointer('pointermove', 300, 180, 7);
  app.draw([[100, 120], [130, 140]], 8);
  app.$('release').click();
  assert.deepEqual(plain(app.world.creatures[3].drawing.map(s => s.points)), [
    [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    [{ x: 100, y: 120 }, { x: 130, y: 140 }],
  ]);
});

test('mocked extra pointers and right mouse button cannot corrupt the active drawing', () => {
  const app = boot();
  app.pointer('pointerdown', 80, 90, 1, { pointerType: 'mouse', button: 2 });
  assert.equal(app.$('release').disabled, true);
  app.pointer('pointerdown', 10, 20, 2);
  app.pointer('pointerdown', 100, 120, 3);
  app.pointer('pointermove', 130, 140, 3);
  app.pointer('pointerup', 130, 140, 3);
  app.pointer('pointermove', 30, 40, 2);
  app.pointer('pointerup', 30, 40, 2);
  app.$('release').click();
  assert.deepEqual(plain(app.world.creatures[3].drawing[0].points), [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  assert.equal(app.world.creatures[3].drawing.length, 1);
});

test('mocked visibility interruptions reset frame time instead of fast-forwarding', () => {
  const app = boot();
  app.frame(0); app.frame(50);
  const before = app.world.time;
  app.document.hidden = true; app.document.emit('visibilitychange');
  app.frame(1000); app.frame(10000);
  assert.equal(app.world.time, before);
  app.document.hidden = false; app.document.emit('visibilitychange');
  app.frame(20000);
  assert.equal(app.world.time, before);
  app.frame(20050);
  assert.ok(app.world.time > before && app.world.time < before + 0.1);
});
