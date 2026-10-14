(function () {
  'use strict';
  const E = window.DoodleEngine;
  const $ = id => document.getElementById(id);
  const drawpad = $('drawpad'), drawCtx = drawpad.getContext('2d');
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const field = $('field');
  const world = E.createWorld(700, 400, 7319);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let strokes = [], activeStroke = null, activePointer = null, ink = '#32342d';
  let selected = null, lastFrame = null, accumulator = 0, inspectorTick = 0;
  let padScale = 1, padX = 0, padY = 0, stageWidth = 0, stageHeight = 0;
  const sprites = new Map();
  const ruleHelp = { friends: 'Moves toward its nearest neighbor.', space: 'Moves away when a neighbor is within 145 px.', wander: 'Follows a gently changing, seeded direction.' };
  function fitCanvas(el, context, width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    el.width = Math.round(width * dpr); el.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function paintStroke(context, stroke) {
    context.strokeStyle = stroke.color; context.fillStyle = stroke.color;
    context.lineWidth = stroke.width; context.lineCap = 'round'; context.lineJoin = 'round';
    if (stroke.points.length === 1) {
      context.beginPath(); context.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2); context.fill(); return;
    }
    context.beginPath(); stroke.points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke();
  }
  function redrawPad() {
    const rect = drawpad.getBoundingClientRect();
    drawCtx.clearRect(0, 0, rect.width, rect.height);
    drawCtx.save(); drawCtx.translate(padX, padY); drawCtx.scale(padScale, padScale);
    strokes.forEach(s => paintStroke(drawCtx, s)); drawCtx.restore();
    $('draw-hint').hidden = strokes.length > 0;
    $('draw-hint').style.display = strokes.length ? 'none' : 'flex';
    $('undo').disabled = $('clear').disabled = !strokes.length;
    $('release').disabled = !strokes.length || world.creatures.length >= E.LIMIT;
  }
  function resize() {
    const padRect = drawpad.getBoundingClientRect();
    fitCanvas(drawpad, drawCtx, padRect.width, padRect.height);
    padScale = Math.min(padRect.width / 320, padRect.height / 200);
    padX = (padRect.width - 320 * padScale) / 2; padY = (padRect.height - 200 * padScale) / 2;
    redrawPad();
    const rect = field.getBoundingClientRect();
    if (rect.width !== stageWidth || rect.height !== stageHeight) {
      stageWidth = rect.width; stageHeight = rect.height;
      E.resizeWorld(world, stageWidth, stageHeight); fitCanvas(canvas, ctx, stageWidth, stageHeight);
    }
    render();
  }
  function pointFrom(event) {
    const rect = drawpad.getBoundingClientRect();
    return { x: Math.max(0, Math.min(320, (event.clientX - rect.left - padX) / padScale)),
      y: Math.max(0, Math.min(200, (event.clientY - rect.top - padY) / padScale)) };
  }
  drawpad.addEventListener('pointerdown', event => {
    if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (strokes.length >= 200) { announce('That’s a full sketch! Let it loose, or undo a stroke.'); return; }
    event.preventDefault(); activePointer = event.pointerId;
    drawpad.setPointerCapture(event.pointerId);
    activeStroke = { color: ink, width: 3.5, points: [pointFrom(event)] }; strokes.push(activeStroke); redrawPad();
  });
  drawpad.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer || !activeStroke) return;
    const p = pointFrom(event), last = activeStroke.points[activeStroke.points.length - 1];
    if (activeStroke.points.length < 2500 && Math.hypot(p.x - last.x, p.y - last.y) > 1.2) { activeStroke.points.push(p); redrawPad(); }
  });
  function endStroke(event) {
    if (event.pointerId !== activePointer) return;
    if (drawpad.hasPointerCapture(event.pointerId)) drawpad.releasePointerCapture(event.pointerId);
    activePointer = null; activeStroke = null;
  }
  drawpad.addEventListener('pointerup', endStroke);
  drawpad.addEventListener('pointercancel', endStroke);
  drawpad.addEventListener('lostpointercapture', endStroke);
  document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => {
    ink = button.dataset.color;
    document.querySelectorAll('.swatch').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  }));
  $('undo').addEventListener('click', () => { strokes.pop(); activeStroke = null; activePointer = null; redrawPad(); });
  $('clear').addEventListener('click', () => { strokes = []; activeStroke = null; activePointer = null; redrawPad(); announce('A fresh page. Who’s next?'); });
  document.querySelectorAll('input[name="rule"]').forEach(input => input.addEventListener('change', () => $('rule-help').textContent = ruleHelp[input.value]));
  function announce(message) { $('studio-message').textContent = message; }
  function makeSprite(drawing, radius) {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    drawing.forEach(s => s.points.forEach(p => {
      left = Math.min(left, p.x - s.width / 2); right = Math.max(right, p.x + s.width / 2);
      top = Math.min(top, p.y - s.width / 2); bottom = Math.max(bottom, p.y + s.width / 2);
    }));
    const sprite = document.createElement('canvas'), size = radius * 2 + 8, dpr = 3;
    sprite.width = sprite.height = size * dpr;
    const sc = sprite.getContext('2d'), scale = (size - 10) / Math.max(right - left, bottom - top, 1);
    sc.scale(dpr, dpr); sc.translate(size / 2, size / 2); sc.scale(scale, scale); sc.translate(-(left + right) / 2, -(top + bottom) / 2);
    drawing.forEach(s => paintStroke(sc, s));
    return { canvas: sprite, size };
  }
  function spawn(drawing, rule, name, x, y) {
    const creature = E.addCreature(world, { drawing, rule, name, x, y, radius: 26 });
    if (creature) sprites.set(creature.id, makeSprite(drawing, creature.radius));
    return creature;
  }
  function line(points, color, width = 3.5) { return { points: points.map(p => ({x:p[0], y:p[1]})), color, width }; }
  function loop(cx, cy, rx, ry, color, n = 46, wobble = 0) {
    return line(Array.from({length:n + 1}, (_, i) => {
      const a = i / n * Math.PI * 2, w = 1 + Math.sin(a * 5) * wobble;
      return [cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w];
    }), color);
  }
  const exampleDrawings = [
    [loop(50, 48, 30, 26, '#ba4f42', 64, .16), line([[40,40],[40,45]], '#ba4f42'), line([[59,39],[59,44]], '#ba4f42'), line([[43,56],[48,59],[54,56]], '#ba4f42')],
    [line([[22,68],[34,24],[42,33],[58,14],[78,65],[60,74],[43,68],[22,68]], '#897023'), line([[43,48],[43,52]], '#897023'), line([[59,46],[59,50]], '#897023')],
    [loop(50, 45, 23, 25, '#446983', 64, .27), line([[42,40],[42,44]], '#446983'), line([[55,40],[55,44]], '#446983'), line([[45,70],[39,80]], '#446983'), line([[54,69],[62,78]], '#446983')]
  ];
  function addExamples(initial = false) {
    const names = ['Pip', 'Pebble', 'Sprig'], rules = ['friends', 'space', 'wander'];
    let added = 0;
    for (let i = 0; i < 3; i++) {
      const n = world.nextId, name = n <= 3 ? names[i] : `${names[i]} ${n}`;
      const x = initial ? world.width * [.29,.6,.73][i] : undefined;
      const y = initial ? world.height * [.36,.44,.68][i] : undefined;
      if (spawn(exampleDrawings[i], rules[i], name, x, y)) added++;
    }
    syncControls();
    if (!initial) announce(added ? `${added} little ${added === 1 ? 'neighbor joined' : 'neighbors joined'} the herd.` : 'This herd is full. Reset for a fresh start.');
  }
  $('release').addEventListener('click', () => {
    if (!strokes.length || world.creatures.length >= E.LIMIT) return;
    const drawing = strokes.map(s => ({ ...s, points: s.points.map(p => ({...p})) }));
    const rule = document.querySelector('input[name="rule"]:checked').value;
    const creature = spawn(drawing, rule);
    if (!creature) return;
    selected = creature.id; strokes = []; activePointer = null; activeStroke = null;
    syncControls(); redrawPad(); render(); announce(`${creature.name} joined the herd. Draw them a neighbor?`);
  });
  function syncControls() {
    $('count').textContent = `${world.creatures.length} / ${E.LIMIT}`;
    $('add-examples').disabled = world.creatures.length >= E.LIMIT;
    $('release').disabled = !strokes.length || world.creatures.length >= E.LIMIT;
    const select = $('creature-select');
    select.replaceChildren(new Option('Meet the herd ↓', ''));
    world.creatures.forEach(c => select.add(new Option(`${c.name} · ${E.RULES[c.rule]}`, String(c.id))));
    select.value = selected === null ? '' : String(selected);
    syncPause(); updateInspector();
  }
  function syncPause() {
    $('pause').innerHTML = world.paused ? '▷ <span>Play</span>' : 'Ⅱ <span>Pause</span>';
    $('pause').setAttribute('aria-label', world.paused ? 'Play animation' : 'Pause animation');
    $('pause').setAttribute('aria-pressed', String(world.paused));
    $('live-dot').classList.toggle('paused', world.paused);
    $('field-note').textContent = world.paused ? 'PAUSED · TAKE A CLOSER LOOK' : 'TAP A DOODLE TO SAY HELLO';
  }
  $('pause').addEventListener('click', () => { world.paused = !world.paused; accumulator = 0; syncPause(); updateInspector(); });
  $('add-examples').addEventListener('click', () => { addExamples(); render(); });
  $('reset').addEventListener('click', () => {
    E.resetWorld(world); world.paused = reducedMotion.matches; sprites.clear(); selected = null; accumulator = 0;
    addExamples(true); syncControls(); render(); announce('A fresh herd. Your drawing can still join in.');
  });
  $('creature-select').addEventListener('change', event => { selected = event.target.value ? Number(event.target.value) : null; updateInspector(); render(); });
  canvas.addEventListener('pointerup', event => {
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const candidates = world.creatures.filter(c => Math.hypot(c.x - x, c.y - y) < c.radius + 18);
    candidates.sort((a,b) => Math.hypot(a.x-x,a.y-y) - Math.hypot(b.x-x,b.y-y));
    selected = candidates.length ? candidates[0].id : null;
    $('creature-select').value = selected === null ? '' : String(selected); updateInspector(); render();
  });
  function updateInspector() {
    const c = world.creatures.find(c => c.id === selected);
    if (c) {
      $('inspect-name').textContent = `${c.name} · ${E.RULES[c.rule]}`;
      $('inspect-status').textContent = `${world.paused ? 'Paused · ' : ''}${c.status}`;
      document.querySelector('.inspector-icon').textContent = c.rule === 'friends' ? '↗' : c.rule === 'space' ? '↙' : '〰';
    } else {
      $('inspect-name').textContent = 'Everyone has their own little way.';
      $('inspect-status').textContent = world.paused ? 'Paused. Tap a doodle or choose one to take a closer look.' : 'Tap a doodle to see its rule and who it’s watching.';
      document.querySelector('.inspector-icon').textContent = '✳';
    }
  }
  function render() {
    ctx.clearRect(0, 0, stageWidth, stageHeight);
    const chosen = world.creatures.find(c => c.id === selected);
    if (chosen) {
      const target = world.creatures.find(c => c.id === chosen.targetId);
      ctx.save(); ctx.strokeStyle = '#8b9c71'; ctx.fillStyle = '#7a8d61'; ctx.lineWidth = 1.2; ctx.setLineDash([4,6]);
      if (target) {
        ctx.beginPath(); ctx.moveTo(chosen.x, chosen.y); ctx.lineTo(target.x,target.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(target.x,target.y,target.radius+8,0,Math.PI*2); ctx.stroke();
      } else if (chosen.rule === 'wander') {
        ctx.beginPath(); ctx.moveTo(chosen.x,chosen.y); ctx.lineTo(chosen.x+chosen.intentX*66,chosen.y+chosen.intentY*66); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(chosen.x,chosen.y,chosen.radius+10,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    world.creatures.forEach(c => {
      const sprite = sprites.get(c.id); if (!sprite) return;
      const moving = Math.min(1, Math.hypot(c.vx,c.vy)/24);
      const bob = reducedMotion.matches ? 0 : Math.sin(world.time*5+c.phase)*2*moving;
      const tilt = reducedMotion.matches ? 0 : Math.sin(world.time*3.2+c.phase)*.045*moving;
      ctx.save();ctx.translate(c.x,c.y);
      ctx.fillStyle = 'rgba(102,124,73,.095)';ctx.beginPath();ctx.ellipse(0,c.radius+2,c.radius*.62,3.8,0,0,Math.PI*2);ctx.fill();
      ctx.translate(0,bob);ctx.rotate(tilt);ctx.drawImage(sprite.canvas,-sprite.size/2,-sprite.size/2,sprite.size,sprite.size);ctx.restore();
      if (c.id === selected) {
        ctx.font = '10px Arial';ctx.textAlign='center';ctx.fillStyle='#62734f';ctx.fillText(c.name,c.x,Math.min(stageHeight-7,c.y+c.radius+23));
      }
    });
  }
  function frame(timestamp) {
    if (lastFrame !== null && !world.paused && !document.hidden) {
      accumulator += Math.min((timestamp - lastFrame) / 1000, 0.1);
      while (accumulator >= 1/60) { E.step(world,1/60); accumulator -= 1/60; }
    }
    lastFrame = timestamp; render();
    if (timestamp - inspectorTick > 160) { updateInspector(); inspectorTick = timestamp; }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { lastFrame = null; accumulator = 0; });
  reducedMotion.addEventListener('change', event => { if (event.matches) { world.paused = true; syncPause(); updateInspector(); } });
  new ResizeObserver(resize).observe(document.querySelector('.workbench'));
  window.addEventListener('resize', resize);
  resize(); addExamples(true); world.paused = reducedMotion.matches; syncControls(); requestAnimationFrame(frame);
})();
