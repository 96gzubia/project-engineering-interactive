const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const canonical = 'lectures/01-direccion-de-proyectos.html';

test('legacy bookmark is a tiny redirect preserving query and fragment', () => {
  const html = read('aula_interactiva.html');
  assert.ok(Buffer.byteLength(html) < 2048);
  let target;
  vm.runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1], {
    location: { search: '?example=1', hash: '#slide-2', replace: value => target = value }
  });
  assert.equal(target, './' + canonical + '?example=1#slide-2');
  assert.ok(html.includes('href="./' + canonical + '"'));
  assert.ok(html.includes('content="0;url=./' + canonical + '"'));
});

test('published lectures have no full-size HTML copies outside lectures', () => {
  const catalog = JSON.parse(read('data/lectures.json'));
  assert.ok(catalog.lectures.some(item => item.id === catalog.latest));
  for (const item of catalog.lectures) assert.ok(fs.existsSync(path.join(root, item.file)));
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : [file];
    });
  }
  // All large HTML payloads belong in the canonical lecture directory, including
  // newly exported lectures that are not yet registered in the catalog.
  for (const file of walk(root)) {
    if (file.endsWith('.html') && !path.relative(root, file).startsWith('lectures/')) {
      assert.ok(fs.statSync(file).size < 65536, 'Oversized non-lecture HTML: ' + file);
    }
  }
  assert.ok(read('index.html').includes('src="./' + canonical + '"'));
});

test('service worker preserves cached lectures and redirects old offline bookmarks', async () => {
  const base = 'https://example.test/project-engineering-interactive/';
  const entries = new Map([
    [base + canonical, new Response('cached lecture')],
    [base + 'aula_interactiva.html?old=1', new Response('old duplicate')],
    [base + 'index.html', new Response('cached shell')]
  ]);
  const cache = {
    keys: async () => [...entries.keys()].map(url => ({ url })),
    delete: async request => entries.delete(request.url),
    match: async (request, options) => {
      const url = new URL(request.url || request, base);
      if (options?.ignoreSearch) url.search = '';
      return entries.get(url.href)?.clone();
    }
  };
  const handlers = {};
  vm.runInNewContext(read('service-worker.js'), {
    URL, Response,
    self: { location: new URL(base + 'service-worker.js'), clients: { claim() {} },
      addEventListener: (name, fn) => handlers[name] = fn },
    caches: { open: async () => cache, keys: async () => ['project-engineering-v3'], delete: async () => {} },
    fetch: async () => { throw new Error('offline'); }
  });
  let done;
  handlers.activate({ waitUntil: promise => done = promise });
  await done;
  assert.ok(entries.has(base + canonical));
  assert.ok(!entries.has(base + 'aula_interactiva.html?old=1'));
  async function request(file) {
    let response;
    handlers.fetch({ request: { url: base + file, method: 'GET', mode: 'navigate' },
      respondWith: result => response = result });
    return await response;
  }
  const redirect = await request('aula_interactiva.html?example=1');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), base + canonical + '?example=1');
  assert.equal(await (await request(canonical + '?example=1')).text(), 'cached lecture');
  assert.equal(await (await request('index.html')).text(), 'cached shell');
});
