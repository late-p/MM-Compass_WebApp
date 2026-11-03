r"""MM-Compass 웹앱 로컬 미리보기

  py preview.py            빌드 → 이 PC에서만 열리는 서버 실행 → 브라우저에 '폰 화면 틀'로 열기
  py preview.py --no-build 빌드 없이 실행
  py preview.py --demo     가상 샘플 데이터 체험판으로 실행 (포털·실데이터 없이도 동작)
  py preview.py --lan      같은 와이파이의 실제 폰에서도 열기 (HTTP라 설치는 안 됨, 화면 확인용 / 같은 망 누구나 접속 가능하니 확인 후 끄세요)

주소: http://localhost:8811/phone   (폰 크기 틀)   ·   앱 자체 주소는 빌드 마지막 줄 참고
"""
import subprocess, sys, threading, webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
DEMO = "--demo" in sys.argv
DIST = HERE / ("docs" if DEMO else "dist")
PORT = 8811

PHONE = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MM-Compass · 폰 미리보기</title>
<style>
body{margin:0;min-height:100vh;background:#1b2330;color:#cfd8e6;font:14px/1.5 "Malgun Gothic",sans-serif;display:flex;flex-direction:column;align-items:center;padding:18px 12px 30px}
h1{font-size:15px;margin:0 0 10px;font-weight:700}
.bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}
.bar button{background:#2a3547;color:#cfd8e6;border:1px solid #3b4962;border-radius:16px;padding:6px 14px;font:inherit;cursor:pointer}
.bar button.on{background:#2F6DB5;border-color:#2F6DB5;color:#fff}
.dev{background:#000;border-radius:46px;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.55),inset 0 0 0 2px #3a4252}
.dev iframe{display:block;border:0;border-radius:32px;background:#fff}
.hint{margin-top:14px;max-width:560px;text-align:center;color:#8fa0b8;font-size:12.5px}
a{color:#8cb8f0}
</style></head><body>
<h1>MM-Compass 회의용 · 폰 화면 미리보기</h1>
<div class="bar" id="bar"></div>
<div class="dev" id="dev"><iframe id="f" src="__APP__" title="앱"></iframe></div>
<div class="hint">틀 안은 실제 폰 화면 폭으로 동작하는 앱입니다. 하단 탭을 눌러 보세요.<br>
<a href="__APP__" target="_blank">앱만 새 탭으로 열기</a> (PC 폭이라 PC 화면으로 보입니다)</div>
<script>
var D=[["iPhone 15 (390×844)",390,844],["Galaxy (360×800)",360,800],["작은 폰 (320×640)",320,640],["큰 폰 (430×932)",430,932]];
var bar=document.getElementById('bar'),f=document.getElementById('f');
function set(i){D.forEach(function(d,k){bar.children[k].className=k===i?'on':''});
  f.style.width=D[i][1]+'px';f.style.height=Math.min(D[i][2],innerHeight-150)+'px';try{localStorage.setItem('dev',i)}catch(e){}}
D.forEach(function(d,k){var b=document.createElement('button');b.textContent=d[0];b.onclick=function(){set(k)};bar.appendChild(b)});
var s=0;try{s=+localStorage.getItem('dev')||0}catch(e){}
set(s);addEventListener('resize',function(){set(s)});
document.querySelectorAll('.bar button').forEach(function(b,k){b.addEventListener('click',function(){s=k})});
</script></body></html>"""


class H(SimpleHTTPRequestHandler):
    app_path = "/"

    def do_GET(self):
        if self.path.split("?")[0] in ("/phone", "/phone/"):
            body = PHONE.replace("__APP__", self.app_path).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(body); return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    if "--no-build" not in sys.argv:
        r = subprocess.run([sys.executable, str(HERE / "build.py")] + (["--demo"] if DEMO else []), cwd=HERE)
        if r.returncode:
            sys.exit(r.returncode)
    apps = sorted(p.name for p in DIST.glob("m-*") if p.is_dir())
    H.app_path = "/" if DEMO else (f"/{apps[0]}/" if apps else "/")
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    srv = ThreadingHTTPServer((host, PORT), partial(H, directory=str(DIST)))
    url = f"http://localhost:{PORT}/phone"
    print(f"\n미리보기 실행 중: {url}\n끄려면 이 창을 닫거나 Ctrl+C")
    if host == "0.0.0.0":
        import socket
        ip = socket.gethostbyname(socket.gethostname())
        print(f"실제 폰(같은 와이파이)에서: http://{ip}:{PORT}{H.app_path}   ※ 같은 망의 누구나 볼 수 있으니 확인 후 끄세요")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
