/* Doodle Herd: deterministic, dependency-free movement simulation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoodleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMIT = 20;
  const RULES = Object.freeze({ friends: 'Make friends', space: 'Need space', wander: 'Wander' });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function random(world) {
    world.rng = (Math.imul(1664525, world.rng) + 1013904223) >>> 0;
    return world.rng / 4294967296;
  }
  function createWorld(width = 700, height = 440, seed = 7319) {
    return { width: Math.max(1, width), height: Math.max(1, height), initialSeed: seed >>> 0,
      rng: seed >>> 0, creatures: [], nextId: 1, time: 0, paused: false };
  }
  function constrain(c, world) {
    const mx = Math.min(c.radius + 7, world.width / 2), my = Math.min(c.radius + 7, world.height / 2);
    c.x = clamp(c.x, mx, world.width - mx); c.y = clamp(c.y, my, world.height - my);
  }
  function addCreature(world, options = {}) {
    if (world.creatures.length >= LIMIT) return null;
    const id = world.nextId++;
    const c = { id, name: options.name || `Doodle ${id}`, rule: RULES[options.rule] ? options.rule : 'wander',
      drawing: options.drawing || [], radius: clamp(options.radius || 27, 8, 48),
      x: options.x ?? (0.18 + random(world) * 0.64) * world.width,
      y: options.y ?? (0.18 + random(world) * 0.64) * world.height,
      vx: 0, vy: 0, heading: random(world) * Math.PI * 2, nextTurn: world.time + 1 + random(world),
      phase: random(world) * Math.PI * 2, targetId: null, status: 'Ready', intentX: 0, intentY: 0 };
    constrain(c, world); world.creatures.push(c); refreshIntents(world); return c;
  }
  function nearest(c, creatures) {
    let target = null, distance = Infinity;
    for (const other of creatures) {
      if (other.id === c.id) continue;
      const d = Math.hypot(other.x - c.x, other.y - c.y);
      if (d < distance) { distance = d; target = other; }
    }
    return { target, distance };
  }
  function intentFor(c, creatures) {
    const { target, distance } = nearest(c, creatures);
    if (c.rule === 'wander') return { x: Math.cos(c.heading), y: Math.sin(c.heading), targetId: null, status: 'Following a wandering direction' };
    if (!target) return { x: 0, y: 0, targetId: null, status: c.rule === 'friends' ? 'Waiting for another doodle' : 'No one nearby; staying put' };
    const dx = target.x - c.x, dy = target.y - c.y;
    const ux = distance > 0.0001 ? dx / distance : (c.id < target.id ? -1 : 1);
    const uy = distance > 0.0001 ? dy / distance : 0;
    if (c.rule === 'friends') {
      const close = distance <= c.radius + target.radius + 12;
      return { x: close ? 0 : ux, y: close ? 0 : uy, targetId: target.id,
        status: close ? `Close to ${target.name}; staying put` : `Moving toward ${target.name}` };
    }
    if (distance < 145) return { x: -ux, y: -uy, targetId: target.id, status: `Moving away from ${target.name}` };
    return { x: 0, y: 0, targetId: null, status: 'No one within 145 px; staying put' };
  }
  function refreshIntents(world) {
    for (const c of world.creatures) {
      const intent = intentFor(c, world.creatures);
      c.intentX = intent.x; c.intentY = intent.y; c.targetId = intent.targetId; c.status = intent.status;
    }
  }
  function step(world, dt) {
    if (world.paused || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05); world.time += dt;
    for (const c of world.creatures) {
      if (c.rule === 'wander' && world.time >= c.nextTurn) {
        c.heading += (random(world) - 0.5) * 1.7;
        c.nextTurn = world.time + 1.2 + random(world) * 1.6;
      }
    }
    refreshIntents(world);
    const deltas = world.creatures.map(c => {
      let ax = c.intentX * 35, ay = c.intentY * 35;
      const edge = c.radius + 38;
      let edging = false, separating = false;
      if (c.x < edge) { ax += (edge - c.x) * 1.5; edging = true; }
      if (c.x > world.width - edge) { ax -= (c.x - world.width + edge) * 1.5; edging = true; }
      if (c.y < edge) { ay += (edge - c.y) * 1.5; edging = true; }
      if (c.y > world.height - edge) { ay -= (c.y - world.height + edge) * 1.5; edging = true; }
      for (const other of world.creatures) {
        if (c.id === other.id) continue;
        const dx = c.x - other.x, dy = c.y - other.y, distance = Math.hypot(dx, dy);
        const gap = c.radius + other.radius + 5;
        if (distance < gap) {
          const ux = distance > 0.001 ? dx / distance : (c.id < other.id ? -1 : 1);
          const uy = distance > 0.001 ? dy / distance : 0;
          ax += ux * (gap - distance) * 3.5; ay += uy * (gap - distance) * 3.5; separating = true;
        }
      }
      const speed = Math.hypot(ax, ay);
      if (speed > 65) { ax *= 65 / speed; ay *= 65 / speed; }
      return { ax, ay, edging, separating };
    });
    for (let i = 0; i < world.creatures.length; i++) {
      const c = world.creatures[i], d = deltas[i], smoothing = 1 - Math.exp(-dt * 7);
      c.vx += (d.ax - c.vx) * smoothing; c.vy += (d.ay - c.vy) * smoothing;
      c.x += c.vx * dt; c.y += c.vy * dt; constrain(c, world);
    }
    refreshIntents(world);
    for (let i = 0; i < world.creatures.length; i++) {
      const d = deltas[i];
      if (d.separating) world.creatures[i].status += ' · making room';
      if (d.edging) world.creatures[i].status += ' · avoiding the edge';
    }
  }
  function resizeWorld(world, width, height) {
    const w = Math.max(1, width), h = Math.max(1, height);
    for (const c of world.creatures) { c.x *= w / world.width; c.y *= h / world.height; }
    world.width = w; world.height = h;
    world.creatures.forEach(c => constrain(c, world)); refreshIntents(world);
  }
  function resetWorld(world) {
    world.creatures = []; world.nextId = 1; world.rng = world.initialSeed; world.time = 0; world.paused = false;
  }
  return { LIMIT, RULES, createWorld, addCreature, step, resizeWorld, resetWorld, intentFor, refreshIntents };
});
