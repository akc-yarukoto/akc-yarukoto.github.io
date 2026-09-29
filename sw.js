/* やることリスト！ service worker
   役割: アプリの画面ファイルをキャッシュして、電波がなくても開けるようにする。
   注意: やることのデータ(localStorage / IndexedDB)には一切さわらない。
   運用: index.html を変えたら VERSION も上げる（旧キャッシュを入れ替えるため）。 */
const VERSION = 'v1.5.0';
const CACHE = 'yarukoto-' + VERSION;
const INDEX = new URL('./', self.location).href;               // 画面本体のキャッシュキー（./ に統一）
const CRITICAL = ['./manifest.webmanifest'];                      // 失敗したら install ごと失敗させる（旧版が残る）
const OPTIONAL = ['./icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './img/hello.png', './img/relax.png', './img/yay.png', './img/cheer.png',
  './img/ios/share.png', './img/ios/more.png', './img/ios/pagemenu.png', './img/qr.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 画面本体: 必ず取れていること・HTML であることを確認してから入れる
    const res = await fetch(new Request(INDEX, { cache: 'reload' }));
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('text/html')) throw new Error('precache failed: index');
    await c.put(INDEX, res.clone());
    for (const u of CRITICAL) {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (!r.ok) throw new Error('precache failed: ' + u);
      await c.put(u, r.clone());
    }
    await Promise.all(OPTIONAL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('yarukoto-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // フォント等の外部は素通し

  const isIndex = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
  const key = isIndex ? INDEX : (url.origin + url.pathname);

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(key);
    // キャッシュがあれば即返し、裏で最新を取りにいく (stale-while-revalidate)
    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic' && (!isIndex || (res.headers.get('content-type') || '').includes('text/html'))) c.put(key, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (isIndex) { const idx = await c.match(INDEX); if (idx) return idx; }
    return new Response('オフラインです。電波の あるところで もういちど ひらいてね。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
