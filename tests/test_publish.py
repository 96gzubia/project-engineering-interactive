import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).parents[1] / 'scripts/publish-lecture.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def bundle():
    data = {'scenes': [{'id': 's1', 'image': 'data:image/svg+xml;base64,AA==', 'width': 100, 'height': 100}]}
    course = {'modules': [], 'editorRoute': ['s1'], 'lectureStudio': {'version': 1}}
    html = '<!DOCTYPE html><html><head></head><body>' + ''.join(f'<script type="application/json" id="{k}">{json.dumps(v)}</script>' for k, v in [('viva-data', data), ('course-data', course)]) + '<script>/* Lecture Studio: explicit editorial order; */ const x=1;</script></body></html>'
    return {'format': 'lecture-studio-publish', 'version': 1, 'lecture': {'id': 'pm-mii-02', 'number': 2, 'title': 'Lecture 02', 'course': 'MII'}, 'html': html, 'sha256': hashlib.sha256(html.encode()).hexdigest()}


class Publishing(unittest.TestCase):
    def setUp(self):
        self.catalog = {'latest': 'pm-mii-01', 'default': 'smart-latest', 'lectures': [{'id': 'pm-mii-01', 'number': 1, 'title': 'Old', 'course': 'MII', 'file': './lectures/01-direccion-de-proyectos.html'}]}

    def test_deterministic_and_preserves_catalog(self):
        b = bundle()
        before = copy.deepcopy(self.catalog)
        result, entry, count = p.prepare(b, self.catalog)
        self.assertEqual(p.prepare(b, self.catalog), (result, entry, count))
        self.assertEqual(self.catalog, before)
        self.assertEqual(result['latest'], 'pm-mii-01')
        self.assertEqual(result['lectures'][0], before['lectures'][0])
        self.assertEqual(entry['file'], './lectures/pm-mii-02.html')

    def test_replacement_retains_url(self):
        b = bundle(); b['lecture']['id'] = 'pm-mii-01'
        self.assertEqual(p.prepare(b, self.catalog)[1]['file'], self.catalog['lectures'][0]['file'])

    def test_invalid_inputs(self):
        for change in ('checksum', 'id', 'route', 'syntax', 'image'):
            b = bundle()
            if change == 'checksum': b['sha256'] = 'bad'
            if change == 'id': b['lecture']['id'] = '../index'
            if change == 'route': b['html'] = b['html'].replace('["s1"]', '["missing"]')
            if change == 'syntax': b['html'] = b['html'].replace('const x=1', 'const =')
            if change == 'image': b['html'] = b['html'].replace('data:image/svg+xml;base64,AA==', '../missing.svg')
            if change != 'checksum': b['sha256'] = hashlib.sha256(b['html'].encode()).hexdigest()
            with self.subTest(change=change), self.assertRaises((ValueError, subprocess.CalledProcessError)):
                p.prepare(b, self.catalog)

    def test_publish_is_explicit_and_atomic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'repo'; root.mkdir()
            (root / 'data').mkdir(); (root / 'lectures').mkdir(); (root / 'scripts').mkdir()
            (root / 'data/lectures.json').write_text(json.dumps(self.catalog))
            (root / 'lectures/01-direccion-de-proyectos.html').write_text('old lecture')
            for f in ('index.html', 'manifest.webmanifest', 'service-worker.js', 'scripts/app-shell.js'):
                (root / f).write_text('')
            def git(*args): return p.git(root, *args)
            git('init'); git('config', 'user.email', 'test@example.org'); git('config', 'user.name', 'Test'); git('add', '.'); git('commit', '-m', 'fixture')
            handoff = Path(tmp) / 'handoff.json'; handoff.write_text(json.dumps(bundle()))
            cmd = ['python3', str(Path(p.__file__).resolve()), str(handoff), '--repo', str(root)]
            subprocess.run(cmd, check=True, capture_output=True)
            self.assertEqual(git('status', '--porcelain'), '')
            hook = root / '.git/hooks/pre-commit'
            hook.write_text('#!/bin/sh\nexit 1\n'); hook.chmod(0o755)
            rejected = subprocess.run(cmd + ['--publish', '--make-latest'], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertEqual(git('status', '--porcelain'), '')
            self.assertEqual(json.loads((root / 'data/lectures.json').read_text()), self.catalog)
            self.assertFalse((root / 'lectures/pm-mii-02.html').exists())
            hook.unlink()
            subprocess.run(cmd + ['--publish', '--make-latest'], check=True, capture_output=True)
            self.assertEqual(json.loads((root / 'data/lectures.json').read_text())['latest'], 'pm-mii-02')
            self.assertEqual((root / 'lectures/01-direccion-de-proyectos.html').read_text(), 'old lecture')
            self.assertEqual(git('status', '--porcelain'), '')
            failed = subprocess.run(cmd + ['--publish'], capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertEqual(git('status', '--porcelain'), '')

if __name__ == '__main__': unittest.main()
