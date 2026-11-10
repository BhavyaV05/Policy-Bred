// Generates docs/DATA_DICTIONARY.md and supabase/setup_all.sql from their sources.
//   npm run build:docs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DICTIONARY } from '../src/content/dictionary.ts'

const files = [...new Set(DICTIONARY.map((r) => r.file))]
const esc = (s) => String(s ?? '').replace(/\|/g, '\|').replace(/\n/g, ' ')
let md = '# Data dictionary\n\nGenerated from `src/content/dictionary.ts` (also downloadable from the dashboard, Export tab).\n\n' +
  'General conventions: timestamps are UTC ISO-8601; booleans are exported as 1/0; blank cells mean "not answered / not applicable". ' +
  'Participants are never excluded automatically (including those who fail manipulation checks): filter on `is_complete`, `majority_recall_correct` etc. yourself.\n\n'
for (const f of files) {
  md += `## ${f}\n\n| Variable | Type | Description | Coding |\n|---|---|---|---|\n`
  for (const r of DICTIONARY.filter((x) => x.file === f)) md += `| \`${esc(r.variable)}\` | ${esc(r.type)} | ${esc(r.description)} | ${esc(r.coding)} |\n`
  md += '\n'
}
writeFileSync(new URL('../docs/DATA_DICTIONARY.md', import.meta.url), md)

const dir = new URL('../supabase/migrations/', import.meta.url)
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `-- ===== ${f} =====\n` + readFileSync(new URL(f, dir), 'utf8')).join('\n\n')
writeFileSync(new URL('../supabase/setup_all.sql', import.meta.url), sql)
console.log('wrote docs/DATA_DICTIONARY.md and supabase/setup_all.sql')
