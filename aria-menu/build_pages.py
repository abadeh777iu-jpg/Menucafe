"""Build a static copy of the demo menus for GitHub Pages.

Output: the repository root (GitHub Pages serves the branch root at
https://<user>.github.io/<repo>/). Only the entries listed in GENERATED are
removed before a rebuild; nothing else in the repo is touched.
The dev server (server.py) keeps using the sources here unchanged; this script
only rewrites root-absolute paths so the same files work under a sub-path.

Run: python3 build_pages.py
"""
import re
import shutil
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = SRC.parent

RUNTIME_FILES = [
    'styles.css', 'themes.css', 'themes.js', 'seasonal.css', 'seasonal-art.js',
    'winter.css', 'winter-art.js', 'winter-effects.js', 'atmosphere.css',
    'atmosphere-art.js', 'atmosphere-effects.js', 'app.js', 'menu-data.js',
]
RESTAURANTS = ['aria', 'bahar']
GENERATED = RUNTIME_FILES + ['assets', 'data', 'aria', 'bahar', 'index.html', '.nojekyll']

ROOT_REDIRECT = '''<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>منوی دیجیتال | نسخهٔ نمایشی</title>
<meta http-equiv="refresh" content="0; url=./aria/">
<link rel="canonical" href="./aria/">
<p><a href="./aria/">منوی آریا</a> · <a href="./bahar/">منوی بهار</a></p>
<script>location.replace('./aria/');</script>
</html>
'''


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'build_pages: expected exactly one {label!r}, found {count}')
    return text.replace(old, new)


def build_page(restaurant):
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    # Every root-absolute asset/link becomes relative to the restaurant folder.
    html = re.sub(r'(href|src)="/(?!/)', r'\1="../', html)
    html = replace_once(html, 'href="../aria"', 'href="../aria/"', 'aria link')
    html = replace_once(html, 'href="../bahar"', 'href="../bahar/"', 'bahar link')
    if '="/' in html:
        raise SystemExit('build_pages: root-absolute path left in index.html')
    guard = f"<script>window.DemoRoute={{getSlug:function(){{return '{restaurant}';}}}};</script>"
    html = replace_once(html, '</head>', guard + '</head>', 'head end')
    return html


def build_menu_data():
    js = (SRC / 'menu-data.js').read_text(encoding='utf-8')
    return replace_once(js, 'fetch(`/data/${', 'fetch(`../data/${', 'data fetch')


def main():
    for name in GENERATED:
        target = OUT / name
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        elif target.exists() or target.is_symlink():
            target.unlink()
    (OUT / '.nojekyll').write_text('', encoding='utf-8')
    (OUT / 'index.html').write_text(ROOT_REDIRECT, encoding='utf-8')

    for name in RUNTIME_FILES:
        if name == 'menu-data.js':
            (OUT / name).write_text(build_menu_data(), encoding='utf-8')
        else:
            shutil.copy2(SRC / name, OUT / name)
    shutil.copytree(SRC / 'assets', OUT / 'assets')
    shutil.copytree(SRC / 'data', OUT / 'data')

    for restaurant in RESTAURANTS:
        page_dir = OUT / restaurant
        page_dir.mkdir()
        (page_dir / 'index.html').write_text(build_page(restaurant), encoding='utf-8')
    print(f'built {OUT}')


if __name__ == '__main__':
    main()
