'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('./engine.js');

function advance(world, frames = 600, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) E.step(world, dt);
}

function populate(seed = 7319) {
  const world = E.createWorld(700, 440, seed);
  for (let i = 0; i < 12; i++) {
    E.addCreature(world, { rule: ['friends', 'space', 'wander'][i % 3], name: `Test ${i}` });
  }
  return world;
}

function assertBounds(world) {
  for (const c of world.creatures) {
    const mx = Math.min(c.radius + 7, world.width / 2);
    const my = Math.min(c.radius + 7, world.height / 2);
    for (const key of ['x', 'y', 'vx', 'vy', 'heading', 'nextTurn', 'intentX', 'intentY']) {
      assert.ok(Number.isFinite(c[key]), `${c.name}.${key} must be finite`);
    }
    assert.ok(c.x >= mx - 1e-9 && c.x <= world.width - mx + 1e-9,
      `${c.name} x=${c.x} outside [${mx}, ${world.width - mx}]`);
    assert.ok(c.y >= my - 1e-9 && c.y <= world.height - my + 1e-9,
      `${c.name} y=${c.y} outside [${my}, ${world.height - my}]`);
  }
}

test('exports a browser-compatible UMD API without requiring a DOM', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8'), context);
  assert.equal(typeof context.DoodleEngine.createWorld, 'function');
  assert.equal(context.DoodleEngine.LIMIT, 20);
  assert.equal(context.DoodleEngine.createWorld().creatures.length, 0);
});

test('new worlds are empty and expose the three supported rules', () => {
  const world = E.createWorld();
  assert.deepEqual(world.creatures, []);
  assert.equal(world.time, 0);
  assert.equal(world.nextId, 1);
  assert.equal(world.paused, false);
  assert.deepEqual(Object.keys(E.RULES), ['friends', 'space', 'wander']);
  assert.ok(Object.isFrozen(E.RULES));
});

test('friends move toward the nearest doodle, not the first or furthest', () => {
  const world = E.createWorld(1000, 700);
  const friend = E.addCreature(world, { rule: 'friends', x: 500, y: 350, name: 'Friend' });
  E.addCreature(world, { rule: 'space', x: 100, y: 350, name: 'Far' });
  const near = E.addCreature(world, { rule: 'space', x: 650, y: 350, name: 'Near' });
  const intent = E.intentFor(friend, world.creatures);
  assert.equal(intent.targetId, near.id);
  assert.equal(intent.x, 1);
  assert.equal(intent.y, 0);
  E.step(world, 1 / 60);
  assert.ok(friend.x > 500);
  assert.equal(friend.y, 350);
});

test('friends stop at a comfortable radius-dependent distance', () => {
  const world = E.createWorld(1000, 700);
  const a = E.addCreature(world, { rule: 'friends', x: 500, y: 350, radius: 20 });
  const b = E.addCreature(world, { rule: 'friends', x: 552, y: 350, radius: 20 });
  const intent = E.intentFor(a, world.creatures);
  assert.equal(intent.x, 0);
  assert.equal(intent.y, 0);
  assert.equal(intent.targetId, b.id);
  advance(world, 100);
  assert.equal(a.x, 500);
  assert.equal(b.x, 552);
});

test('friends and space wait still when alone away from the boundaries', () => {
  for (const rule of ['friends', 'space']) {
    const world = E.createWorld(1000, 700);
    const c = E.addCreature(world, { rule, x: 500, y: 350 });
    const intent = E.intentFor(c, world.creatures);
    assert.equal(intent.x, 0);
    assert.equal(intent.y, 0);
    assert.equal(intent.targetId, null);
    advance(world);
    assert.equal(c.x, 500);
    assert.equal(c.y, 350);
  }
});

test('space moves directly away from the nearest doodle inside 145 px', () => {
  const world = E.createWorld(1000, 700);
  const c = E.addCreature(world, { rule: 'space', x: 500, y: 350 });
  E.addCreature(world, { rule: 'space', x: 200, y: 350 });
  const near = E.addCreature(world, { rule: 'space', x: 600, y: 350 });
  const intent = E.intentFor(c, world.creatures);
  assert.equal(intent.targetId, near.id);
  assert.equal(intent.x, -1);
  assert.equal(Math.abs(intent.y), 0);
  E.step(world, 1 / 60);
  assert.ok(c.x < 500);
});

test('space stays put when the closest doodle reaches or exceeds 145 px', () => {
  for (const distance of [145, 145.001, 300]) {
    const world = E.createWorld(1200, 700);
    const c = E.addCreature(world, { rule: 'space', x: 500, y: 350 });
    E.addCreature(world, { rule: 'space', x: 500 + distance, y: 350 });
    const intent = E.intentFor(c, world.creatures);
    assert.deepEqual({ x: intent.x, y: intent.y, targetId: intent.targetId }, { x: 0, y: 0, targetId: null });
    E.step(world, 1 / 60);
    assert.equal(c.x, 500);
  }
});

test('equal nearest distances resolve deterministically in creature order', () => {
  const world = E.createWorld(1000, 700);
  const c = E.addCreature(world, { rule: 'friends', x: 500, y: 350 });
  const first = E.addCreature(world, { x: 400, y: 350 });
  E.addCreature(world, { x: 600, y: 350 });
  assert.equal(E.intentFor(c, world.creatures).targetId, first.id);
});

test('wander follows its seeded heading and changes direction over time', () => {
  const world = E.createWorld(1000, 700, 50);
  const c = E.addCreature(world, { rule: 'wander', x: 500, y: 350 });
  const heading = c.heading;
  const intent = E.intentFor(c, world.creatures);
  assert.equal(intent.x, Math.cos(heading));
  assert.equal(intent.y, Math.sin(heading));
  assert.equal(intent.targetId, null);
  advance(world, 300);
  assert.notEqual(c.heading, heading);
  assert.ok(Math.hypot(c.x - 500, c.y - 350) > 1);
});

test('same seeds and commands reproduce every simulation state', () => {
  for (const seed of [0, 1, 7319, 0xffffffff]) {
    const a = populate(seed), b = populate(seed);
    assert.deepEqual(a, b);
    for (let i = 0; i < 1200; i++) {
      E.step(a, 1 / 60);
      E.step(b, 1 / 60);
      if (i === 500) {
        E.resizeWorld(a, 390, 800);
        E.resizeWorld(b, 390, 800);
      }
    }
    assert.deepEqual(a, b);
  }
});

test('different seeds produce different wandering paths', () => {
  const a = E.createWorld(1000, 700, 1), b = E.createWorld(1000, 700, 2);
  E.addCreature(a, { rule: 'wander', x: 500, y: 350 });
  E.addCreature(b, { rule: 'wander', x: 500, y: 350 });
  advance(a); advance(b);
  assert.notDeepEqual(a.creatures[0], b.creatures[0]);
});

test('adding a 21st creature is rejected without mutating world state', () => {
  const world = E.createWorld();
  for (let i = 0; i < E.LIMIT; i++) assert.ok(E.addCreature(world));
  const before = structuredClone(world);
  assert.equal(E.addCreature(world), null);
  assert.deepEqual(world, before);
  assert.equal(new Set(world.creatures.map(c => c.id)).size, E.LIMIT);
});

test('paused steps do not change positions, velocities, time, RNG or status', () => {
  const world = populate();
  advance(world, 100);
  world.paused = true;
  const before = structuredClone(world);
  advance(world, 1000);
  E.step(world, 10);
  assert.deepEqual(world, before);
  world.paused = false;
  E.step(world, 1 / 60);
  assert.ok(world.time > before.time);
});

test('zero, negative and non-finite timesteps are ignored completely', () => {
  const world = populate();
  const before = structuredClone(world);
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null]) E.step(world, dt);
  assert.deepEqual(world, before);
});

test('long timesteps are capped at 50 ms', () => {
  const a = populate(), b = populate();
  E.step(a, 1000);
  E.step(b, 0.05);
  assert.deepEqual(a, b);
  assert.equal(a.time, 0.05);
});

test('reset clears the world and restores seed, IDs, time and running state', () => {
  const world = populate(99);
  advance(world, 800);
  E.resizeWorld(world, 900, 600);
  world.paused = true;
  E.resetWorld(world);
  assert.deepEqual(world, E.createWorld(900, 600, 99));
  const fresh = E.createWorld(900, 600, 99);
  assert.deepEqual(E.addCreature(world), E.addCreature(fresh));
});

test('explicit out-of-bounds creation and radius limits are constrained', () => {
  const world = E.createWorld(700, 440);
  const a = E.addCreature(world, { x: -1000, y: 1000, radius: 2 });
  const b = E.addCreature(world, { x: 1000, y: -1000, radius: 100 });
  assert.equal(a.radius, 8);
  assert.equal(b.radius, 48);
  assertBounds(world);
});

test('resizing scales positions and immediately clamps them inside the new world', () => {
  const world = E.createWorld(1000, 500);
  const c = E.addCreature(world, { x: 400, y: 200 });
  E.resizeWorld(world, 500, 1000);
  assert.equal(c.x, 200);
  assert.equal(c.y, 400);
  assertBounds(world);
  E.resizeWorld(world, 1, 1);
  assert.equal(c.x, 0.5);
  assert.equal(c.y, 0.5);
  assertBounds(world);
});

test('all rules stay finite and in bounds through dense long-running and tiny worlds', () => {
  for (const seed of [0, 7319, 0xffffffff]) {
    const world = E.createWorld(700, 440, seed);
    for (let i = 0; i < E.LIMIT; i++) {
      E.addCreature(world, { rule: ['friends', 'space', 'wander'][i % 3], radius: 8 + (i % 3) * 20 });
    }
    for (const [width, height] of [[700, 440], [320, 580], [60, 40], [1, 1], [1, 500], [500, 1], [0, -20], [1200, 600]]) {
      E.resizeWorld(world, width, height);
      assertBounds(world);
      for (let frame = 0; frame < 600; frame++) {
        E.step(world, 1 / 60);
        assertBounds(world);
      }
    }
  }
});

test('exactly overlapping doodles separate deterministically without NaNs', () => {
  for (const rule of ['friends', 'space', 'wander']) {
    const world = E.createWorld(1000, 700, 123);
    const a = E.addCreature(world, { rule, x: 500, y: 350 });
    const b = E.addCreature(world, { rule, x: 500, y: 350 });
    E.step(world, 1 / 60);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0);
    assertBounds(world);
    advance(world, 180);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius,
      `${rule} pair should separate after three seconds`);
  }
});

test('non-wandering pair movement is simultaneous, independent of array order', () => {
  const a = E.createWorld(1000, 700, 123);
  E.addCreature(a, { rule: 'friends', x: 350, y: 350 });
  E.addCreature(a, { rule: 'friends', x: 650, y: 350 });
  const b = structuredClone(a);
  b.creatures.reverse();
  advance(a); advance(b);
  b.creatures.sort((x, y) => x.id - y.id);
  assert.deepEqual(a, b);
});
