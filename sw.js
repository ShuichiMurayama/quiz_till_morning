/* 朝までそれ正解 — Service Worker
   一度ページを開いたら、ページ本体・お題・ライブラリ・フォントを端末に保存し、
   電波が弱い/ない場所でも即座に起動できるようにします。
   （リアルタイム通信そのものはキャッシュしません） */
const CACHE = "asamade-v4";
const FB = "10.12.2"; // index.html の FirebaseDB() と揃える
const PRECACHE_LOCAL = ["./", "index.html", "questions.json"];
const PRECACHE_REMOTE = [
  `https://www.gstatic.com/firebasejs/${FB}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${FB}/firebase-auth-compat.js`,
  `https://www.gstatic.com/firebasejs/${FB}/firebase-database-compat.js`,
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all([
      ...PRECACHE_LOCAL.map(u => c.add(u).catch(() => {})),
      ...PRECACHE_REMOTE.map(u => fetch(new Request(u, { mode: "no-cors" })).then(r => c.put(u, r)).catch(() => {})),
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function cacheable(url) {
  if (url.origin === self.location.origin) return true;
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" ||
    (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) ||
    url.hostname === "cdn.jsdelivr.net";
}

// stale-while-revalidate: 手元の保存分をすぐ返し、裏で最新版に更新する
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const sameOrigin = url.origin === self.location.origin;
    // ?r=ABCD 付きのURLでも同じページとして扱う
    const hit = await c.match(req, { ignoreSearch: sameOrigin }) ||
      (sameOrigin && req.mode === "navigate" ? await c.match("index.html") : undefined);
    const net = fetch(req).then(r => {
      if (r && (r.ok || r.type === "opaque")) c.put(sameOrigin ? url.origin + url.pathname : req, r.clone());
      return r;
    }).catch(() => undefined);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response("offline", { status: 503 });
  })());
});
