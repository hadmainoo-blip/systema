export const defaults = Object.freeze({horizon: 0.28, feet: 0.86, spread: 0.31, center: 0.5, lookahead: 0.48, coinWeight: 12, obstacleWeight: 18, cooldown: 230, speed: 1, left: 0, top: 0, right: 1, bottom: 1});

export function validate(input = {}) {
  const c = {...defaults};
  for (const k of Object.keys(c)) if (Number.isFinite(Number(input[k]))) c[k] = Number(input[k]);
  for (const k of ['left', 'top', 'right', 'bottom', 'horizon', 'feet', 'center', 'spread', 'lookahead']) c[k] = Math.max(0, Math.min(1, c[k]));
  if (c.right - c.left < .15 || c.bottom - c.top < .15 || c.feet - c.horizon < .2) throw new Error('Crop and horizon must leave enough visible road.');
  c.cooldown = Math.max(120, Math.min(1500, c.cooldown));
  c.coinWeight = Math.max(1, Math.min(100, c.coinWeight));
  c.obstacleWeight = Math.max(1, Math.min(100, c.obstacleWeight));
  c.speed = Math.max(.25, Math.min(3, c.speed));
  return c;
}

export function laneX(lane, depth, c) { return c.center + (lane - 1) * c.spread * (.16 + .84 * depth); }

// Color evidence is deliberately separate from decisions; no game memory is modified.
export function perceive(image, config) {
  const c = validate(config), {width: w, height: h, data} = image;
  if (!w || !h || data.length !== w * h * 4) throw new Error('Invalid video frame');
  const bins = Array.from({length: 3}, () => Array.from({length: 12}, () => ({coin: 0, obstacle: 0, samples: 0})));
  let brightness = 0, count = 0;
  for (let y = Math.floor(c.horizon * h); y < Math.floor(c.feet * h); y += 2) {
    const depth = (y / h - c.horizon) / (c.feet - c.horizon), bin = Math.min(11, Math.floor(depth * 12));
    for (let lane = 0; lane < 3; lane++) {
      const cx = laneX(lane, depth, c) * w, radius = Math.max(2, c.spread * (.16 + .84 * depth) * w * .24);
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(w, cx + radius); x += 2) {
        const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], cell = bins[lane][bin];
        brightness += Math.max(r,g,b); count++; cell.samples++;
        const gold = r > 155 && g > 100 && b < 145 && r > g * 1.03 && g > b * 1.22;
        if (gold) cell.coin++;
        // Saturated train/barrier colors. Scenery and skins can share these colors.
        else if ((r > 110 && r > g * 1.5 && r > b * 1.4) || (b > 100 && b > r * 1.4 && b > g * 1.15)) cell.obstacle++;
      }
    }
  }
  return {brightness: count ? brightness / count : 0, bins: bins.map(row => row.map(cell => ({coin: cell.samples ? cell.coin / cell.samples : 0, obstacle: cell.samples ? cell.obstacle / cell.samples : 0})))};
}

export function decide(scene, lane, config) {
  const c = validate(config);
  if (!Number.isInteger(lane) || lane < 0 || lane > 2) throw new Error('Unknown player lane');
  if (scene.brightness < 12) return {action: 'pause', reason: 'Video is dark or unavailable', costs: [0,0,0]};
  const costs = scene.bins.map((row, target) => {
    let cost = Math.abs(target - lane) * .12;
    for (let j = Math.floor(c.lookahead * 12); j < 12; j++) {
      const urgency = ((j + 1) / 12) ** 3;
      cost += urgency * (Math.min(1, row[j].coin * 5) * c.coinWeight + Math.min(1, row[j].obstacle * 3) * c.obstacleWeight);
    }
    // A two-lane change crosses the middle lane; it cannot teleport through danger.
    if (Math.abs(target - lane) === 2) cost += scene.bins[1].slice(9).reduce((s, v) => s + v.coin * c.coinWeight + v.obstacle * c.obstacleWeight, 0);
    return cost;
  });
  const reachable = [lane, lane - 1, lane + 1].filter(x => x >= 0 && x <= 2);
  const best = reachable.reduce((a,b) => costs[b] < costs[a] ? b : a, lane);
  return {action: best < lane ? 'left' : best > lane ? 'right' : 'hold', target: best, costs, reason: best === lane ? 'Holding safest observed lane' : 'Avoiding visible color evidence'};
}
