"""Build a portable offline review copy; deployed paths remain /aria and /bahar."""
import base64
import json
from pathlib import Path
root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text()
css = (root / 'styles.css').read_text().replace('./assets/Vazirmatn.woff2', 'data:font/woff2;base64,' + base64.b64encode((root / 'assets/Vazirmatn.woff2').read_bytes()).decode())
html = html.replace('<link rel="stylesheet" href="/styles.css">', '<style>'+css+'</style>')
for name in ['themes.css', 'seasonal.css', 'winter.css', 'atmosphere.css']:
    html = html.replace(f'<link rel="stylesheet" href="/{name}">', '<style>'+(root/name).read_text()+'</style>')
modules = ['seasonal-art.js', 'winter-art.js', 'winter-effects.js', 'atmosphere-art.js', 'atmosphere-effects.js', 'themes.js', 'app.js']
for name in ['menu-data.js', *modules]:
    html = html.replace(f'<script defer src="/{name}"></script>', '')
html = html.replace('href="/aria"', 'href="#/aria"').replace('href="/bahar"', 'href="#/bahar"')
menus = {slug: json.loads((root / f'data/{slug}.json').read_text()) for slug in ('aria', 'bahar')}
# JSON clone deliberately avoids shared mutable references between calls.
repo = '''(() => {
const menus = %s;
let embeddedSlug = '';
window.DemoRoute = {getSlug: () => embeddedSlug || location.hash.replace(/^#\\/?/, '') || 'aria'};
// Fragment links in about:srcdoc may navigate away from the embedded document.
// Keep review navigation in memory in that environment, without leaving the iframe.
document.addEventListener('click', event => {
  const link = event.target.closest('.demo-links a');
  if (!link || location.protocol !== 'about:') return;
  event.preventDefault();
  embeddedSlug = link.getAttribute('href').replace(/^#\\/?/, '');
  window.dispatchEvent(new Event('hashchange'));
  window.scrollTo({top: 0, behavior: 'instant'});
});
window.MenuRepository = {async getMenu(slug) {
  if(!Object.prototype.hasOwnProperty.call(menus,slug))throw new Error('UNKNOWN_RESTAURANT');
  return JSON.parse(JSON.stringify(menus[slug]));
}};
})();''' % json.dumps(menus, ensure_ascii=False).replace('<','\\u003c')
html = html.replace('</body>', '<script>'+repo+'\n'+'\n'.join((root / name).read_text() for name in modules)+'</script></body>')
(root.parent / 'multi-menu-preview.html').write_text(html)
# Dedicated winter demo opens with the requested theme, without writing preferences.
(root.parent / 'winter-preview.html').write_text(html.replace("window.DemoRoute = {getSlug:", "window.DemoRoute = {initialTheme:'winter', getSlug:"))

for theme in ['summer', 'valentine', 'halloween']:
    (root.parent / f'{theme}-preview.html').write_text(html.replace("window.DemoRoute = {getSlug:", f"window.DemoRoute = {{initialTheme:'{theme}', getSlug:"))
(root.parent / 'seasons-preview.html').write_text((root.parent / 'summer-preview.html').read_text())
