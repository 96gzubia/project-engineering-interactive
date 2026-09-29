#!/usr/bin/env python3
"""Validate a Lecture Studio handoff; publish only with --publish."""
import argparse
import copy
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile


def require(ok, message):
    if not ok:
        raise ValueError(message)


class ExportParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.blocks, self.scripts, self.current = {}, [], None
        self.parts = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        require(tag != 'base', 'Export must not change the base URL')
        if tag == 'script':
            require('src' not in a, 'Standalone exports must embed scripts')
            self.current = a.get('id') if a.get('type') == 'application/json' else '__js'
            self.parts = []
        if tag in ('img', 'source', 'video', 'audio', 'iframe', 'link'):
            url = a.get('src', a.get('href', ''))
            require(not url or url.startswith(('data:', 'https://', '#')), 'Unresolved relative asset: ' + url)

    def handle_data(self, data):
        if self.current:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.current:
            value = ''.join(self.parts)
            if self.current == '__js':
                self.scripts.append(value)
            else:
                require(self.current not in self.blocks, 'Duplicate JSON block')
                self.blocks[self.current] = json.loads(value)
            self.current = None


def validate_export(html):
    require(isinstance(html, str) and re.match(r'\s*<!doctype html>', html, re.I), 'Expected complete HTML export')
    require('</html>' in html.lower(), 'Truncated HTML export')
    p = ExportParser()
    p.feed(html)
    require(p.current is None, 'Unclosed script')
    data, course = p.blocks.get('viva-data', {}), p.blocks.get('course-data', {})
    require(course.get('lectureStudio', {}).get('version') == 1, 'Expected Lecture Studio v1 export')
    scenes, modules = data.get('scenes'), course.get('modules')
    require(isinstance(scenes, list) and 0 < len(scenes) <= 2000, 'Invalid scenes')
    require(isinstance(modules, list) and len(modules) <= 1000, 'Invalid modules')
    ids = [s.get('id') for s in scenes + modules]
    require(all(isinstance(i, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', i) for i in ids), 'Invalid screen IDs')
    require(len(set(ids)) == len(ids), 'Duplicate screen IDs')
    route = course.get('editorRoute')
    require(isinstance(route, list) and len(route) == len(ids) and set(route) == set(ids), 'Edited route must contain each screen exactly once')
    for s in scenes:
        require(isinstance(s.get('image'), str) and s['image'].startswith('data:image/'), 'Embed every slide image before publishing')
        require(all(isinstance(s.get(k), (int, float)) and s[k] > 0 for k in ('width', 'height')), 'Invalid slide dimensions')
    require(any('/* Lecture Studio: explicit editorial order;' in s for s in p.scripts), 'Missing edited runtime')
    # Syntax checks do not execute exported code.
    with tempfile.TemporaryDirectory() as tmp:
        for n, script in enumerate(p.scripts):
            path = Path(tmp) / f'{n}.js'
            path.write_text(script)
            subprocess.run(['node', '--check', str(path)], check=True, capture_output=True)
    return len(ids)


def prepare(bundle, catalog):
    require(bundle.get('format') == 'lecture-studio-publish' and bundle.get('version') == 1, 'Unsupported handoff')
    html, meta = bundle.get('html'), bundle.get('lecture', {})
    count = validate_export(html)
    digest = hashlib.sha256(html.encode()).hexdigest()
    require(bundle.get('sha256') == digest, 'HTML checksum mismatch')
    ident = meta.get('id', '')
    require(isinstance(ident, str) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', ident) and len(ident) <= 80, 'Invalid lecture ID')
    require(type(meta.get('number')) is int and 1 <= meta['number'] <= 9999, 'Invalid lecture number')
    require(all(isinstance(meta.get(k), str) and meta[k].strip() and len(meta[k]) <= 300 for k in ('title', 'course')), 'Title and course are required')
    lectures = catalog.get('lectures')
    require(isinstance(lectures, list) and lectures, 'Invalid catalog')
    require(len({x['id'] for x in lectures}) == len(lectures), 'Duplicate catalog IDs')
    require(catalog.get('latest') in {x['id'] for x in lectures}, 'Invalid latest pointer')
    old = next((x for x in lectures if x['id'] == ident), None)
    # Existing URLs remain stable; new URLs depend only on the explicit ID.
    file = old['file'] if old else './lectures/' + ident + '.html'
    require(re.fullmatch(r'\./lectures/[a-zA-Z0-9_-]+\.html', file), 'Unsafe lecture path')
    require(not any(x['file'] == file and x['id'] != ident for x in lectures), 'Filename collision')
    entry = {k: meta[k] for k in ('id', 'number', 'title', 'course')}
    entry['file'] = file
    result = copy.deepcopy(catalog)
    if old:
        result['lectures'][lectures.index(old)] = {**old, **entry}
    else:
        result['lectures'].append(entry)
    return result, entry, count


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('handoff', type=Path)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--publish', action='store_true', help='Write and commit the validated lecture and catalog')
    parser.add_argument('--make-latest', action='store_true', help='Explicitly promote this lecture (requires --publish)')
    parser.add_argument('--replace', action='store_true', help='Explicitly allow replacing an existing lecture')
    args = parser.parse_args()
    require(not args.make_latest or args.publish, '--make-latest requires --publish')
    root = args.repo.resolve()
    catalog_path = root / 'data/lectures.json'
    original = catalog_path.read_bytes()
    catalog = json.loads(original)
    bundle = json.loads(args.handoff.read_text())
    updated, entry, count = prepare(bundle, catalog)
    target = root / entry['file'][2:]
    require(not target.is_symlink() and target.resolve().parent == (root / 'lectures').resolve(), 'Unsafe destination')
    for item in catalog['lectures']:
        path = root / item['file']
        require(path.is_file(), 'Missing existing lecture: ' + item['file'])
    for path in ('index.html', 'scripts/app-shell.js', 'service-worker.js', 'manifest.webmanifest'):
        require((root / path).is_file(), 'Missing app component: ' + path)
    for path in ('scripts/app-shell.js', 'service-worker.js'):
        subprocess.run(['node', '--check', str(root / path)], check=True, capture_output=True)
    if args.make_latest:
        updated['latest'] = entry['id']
    print(json.dumps({'lecture': entry, 'screens': count, 'latestBefore': catalog['latest'], 'latestAfter': updated['latest'], 'action': 'publish' if args.publish else 'validate only'}, indent=2, ensure_ascii=False))
    if not args.publish:
        return
    require(not git(root, 'status', '--porcelain'), 'Publish requires a clean working tree')
    require(git(root, 'branch', '--show-current') != '', 'Publish requires a branch')
    require(args.replace or not any(x['id'] == entry['id'] for x in catalog['lectures']), 'Existing lecture: use --replace explicitly')
    require(not target.exists() or args.replace, 'Destination exists: use --replace explicitly')
    old_html = target.read_bytes() if target.exists() else None
    try:
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(bundle['html'].encode())
        catalog_path.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + '\n')
        # Re-read the staged inputs before committing; no exported code is executed.
        prepare(bundle, json.loads(catalog_path.read_text()))
        require(hashlib.sha256(target.read_bytes()).hexdigest() == bundle['sha256'], 'Written HTML checksum mismatch')
        git(root, 'add', '--', entry['file'][2:], 'data/lectures.json')
        git(root, 'diff', '--cached', '--check')
        if not git(root, 'diff', '--cached', '--name-only'):
            print('Already published; no changes.')
            return
        git(root, 'commit', '-m', 'Publish lecture ' + entry['id'] + (' as latest' if args.make_latest else ''))
        print('Committed locally. Review git show, then git push to deploy through existing Pages publishing.')
    except Exception:
        git(root, 'reset', '--', entry['file'][2:], 'data/lectures.json')
        catalog_path.write_bytes(original)
        if old_html is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(old_html)
        raise


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit('Publish stopped: ' + str(error))
