// MM-Compass 회의용 서비스워커 — 설치형 앱 + 오프라인 열람
//  · 앱 껍데기(index.html 등): 네트워크 우선, 실패하면 저장본  → 앱 업데이트가 바로 반영됨
//  · 데이터(/data/*.json): 네트워크 우선(항상 최신), 실패하면 마지막으로 받은 저장본 → 오프라인에서도 마지막 데이터 표시
//  · 데이터 저장소는 앱 버전이 바뀌어도 지우지 않음
const V = "mmc-shell-__VERSION__";
const DATA = "mmc-data";
const SHELL = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.indexOf("/data/") >= 0) {
    e.respondWith(
      fetch(r, { cache: "no-store" })
        .then(res => { if (res.ok) { const cp = res.clone(); caches.open(DATA).then(c => c.put(u.pathname, cp)); } return res; })
        .catch(() => caches.open(DATA).then(c => c.match(u.pathname)).then(h => {
          if (!h) return new Response("{}", { status: 503 });
          // 저장본임을 앱이 알 수 있게 표시 (오프라인인데 '최신'이라고 안내하는 오류 방지)
          const hd = new Headers(h.headers); hd.set("x-mmc-cache", "1");
          return h.blob().then(b => new Response(b, { status: 200, headers: hd }));
        }))
    );
    return;
  }
  if (r.mode === "navigate" || r.destination === "document") {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put("./", cp)); return res; })
      .catch(() => caches.match("./")));
    return;
  }
  e.respondWith(caches.match(r).then(h => h || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
});
