// Generates the ONE fixed arrangement of shapes used in the distraction task.
// Deterministic (seeded) so it is identical for every participant and every group.
// Run once:  npm run gen:game   -> src/content/gameLayout.json
// If you change COUNTS, also update the row in supabase/migrations/..._seed_content.sql (game_config).
import { writeFileSync } from 'node:fs'

const COUNTS = { circle: 12, triangle: 11, square: 10, star: 5 }
const W = 600, H = 400, PAD = 6
const COLORS = ['#3b82f6', '#f59e0b', '#14b8a6', '#a78bfa', '#f472b6', '#84cc16']

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260101)

const types = []
for (const [t, n] of Object.entries(COUNTS)) for (let i = 0; i < n; i++) types.push(t)
// shuffle
for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [types[i], types[j]] = [types[j], types[i]] }

const shapes = []
for (const type of types) {
  let placed = false
  for (let attempt = 0; attempt < 5000 && !placed; attempt++) {
    const r = 21 + rnd() * 6                       // radius 21-27 (viewBox units)
    const x = PAD + r + rnd() * (W - 2 * (PAD + r))
    const y = PAD + r + rnd() * (H - 2 * (PAD + r))
    if (shapes.every((s) => Math.hypot(s.x - x, s.y - y) > s.r + r + 12)) {   // 12 unit gap: no overlap
      shapes.push({
        type, x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(1),
        rotation: type === 'circle' ? 0 : Math.round(rnd() * 80 - 40),
        color: COLORS[Math.floor(rnd() * COLORS.length)],
      })
      placed = true
    }
  }
  if (!placed) throw new Error('Could not place shape; relax constraints')
}
const out = { width: W, height: H, counts: COUNTS, shapes }
writeFileSync(new URL('../src/content/gameLayout.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(`Wrote ${shapes.length} shapes`, COUNTS)
