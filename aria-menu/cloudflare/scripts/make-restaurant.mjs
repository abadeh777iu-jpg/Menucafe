// Creates a new restaurant with its default (enabled) theme rules. Prints SQL for `wrangler d1 execute`.
// Usage:
//   node scripts/make-restaurant.mjs --slug cafe-nila --name "کافه نیلا" --english "Nila Cafe" --theme autumn > r.sql
//   npx wrangler d1 execute menucafe --remote --file r.sql
import { cleanSlug, cleanText, cleanTheme } from '../src/store.js';
import { DEFAULT_RULES, TIMEZONE_NAME } from '../src/schedule.js';
import { insert } from './sql.mjs';

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return process.argv[index + 1];
}

const slug = cleanSlug(arg('slug'));
const name = cleanText(arg('name'), 'نام رستوران', 1, 80);
const english = cleanText(arg('english', ''), 'نام لاتین', 0, 80);
const theme = cleanTheme(arg('theme', 'default'));
const stamp = Math.floor(Date.now() / 1000);
const lines = [insert('restaurants', {
  slug, name, english_name: english, mark: name[0], headline: name, note: '', description: '', footer: '',
  theme, created_at: stamp, updated_at: stamp,
})];
DEFAULT_RULES.forEach((rule, position) => {
  lines.push(insert('theme_rules', {
    restaurant_slug: slug, key: rule.key, kind: rule.kind, label: rule.label, theme: rule.theme,
    enabled: 1, calendar: rule.calendar, start_month: rule.start[0], start_day: rule.start[1],
    end_month: rule.end[0], end_day: rule.end[1], priority: rule.priority,
    timezone: TIMEZONE_NAME, position, updated_at: stamp,
  }));
});
process.stdout.write(lines.join('\n') + '\n');
