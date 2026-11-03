r"""포털(MM-Compass) 게시 → 모바일 웹앱 데이터 동기화

  py sync.py            지금 한 번: 최신 게시본을 읽어 dist/ 를 다시 만들고, deploy.json 이 있으면 배포 명령도 실행
  py sync.py --watch    포털에서 새로 게시/재게시하면 자동으로 위를 실행 (이 PC에서 포털을 돌리는 동안 켜 두기)
  py sync.py --check    변경이 있는지만 확인

동작 방식
  - 포털의 storage/published/<주차>/meeting.html 이 새로 생기거나 바뀌면(= 계산본 게시) '변경'으로 봅니다.
  - 앱 껍데기는 그대로, data/*.json 만 바뀝니다 → 폰의 앱은 다음 실행/새로고침/15분 주기 확인 때 자동으로 최신 데이터를 받습니다.

배포 설정 (호스팅을 정한 뒤)  deploy.json 예:
  {"command": "vercel deploy dist --prod --yes"}
  {"command": "robocopy dist \\\\서버\\공유\\mmcompass /MIR"}
  명령은 이 폴더에서 실행되며, 비밀 주소 폴더(dist/m-…)를 포함한 dist 전체를 올리는 용도입니다.
"""
import json, subprocess, sys, time, datetime as dt
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "MM-Compass" / "storage" / "published"
STATE = HERE / ".sync_state.json"
POLL = 60


def signature():
    """게시된 주차별 meeting.html 의 (경로, 수정시각, 크기) 목록 → 바뀌면 문자열이 달라짐"""
    items = []
    for p in sorted(SRC.glob("*/meeting.html")):
        if (p.parent / "RETIRED.txt").exists():
            continue
        s = p.stat()
        items.append(f"{p.parent.name}:{int(s.st_mtime)}:{s.st_size}")
    return "|".join(items)


def last_sig():
    try:
        return json.loads(STATE.read_text(encoding="utf-8")).get("sig", "")
    except Exception:
        return ""


def run_sync():
    print(f"[{dt.datetime.now():%m-%d %H:%M:%S}] 동기화 시작")
    r = subprocess.run([sys.executable, str(HERE / "build.py")], cwd=HERE)
    if r.returncode:
        print("  ✗ 빌드 실패 — 배포하지 않습니다. 위 메시지를 확인하세요.")
        return False
    cfg = HERE / "deploy.json"
    if cfg.exists():
        cmd = json.loads(cfg.read_text(encoding="utf-8")).get("command")
        if cmd:
            print(f"  배포: {cmd}")
            if subprocess.run(cmd, shell=True, cwd=HERE).returncode:
                print("  ✗ 배포 명령 실패 — 데이터는 dist/ 에 만들어졌지만 올라가지 않았습니다.")
                return False
            print("  ✓ 배포 완료")
    else:
        print("  (deploy.json 없음: dist/ 만 갱신했습니다. 호스팅 지정 후 배포 명령을 넣으면 자동 배포됩니다)")
    STATE.write_text(json.dumps({"sig": signature(), "at": dt.datetime.now().isoformat(timespec="seconds")}), encoding="utf-8")
    print("  ✓ 동기화 완료\n")
    return True


def main():
    if "--check" in sys.argv:
        ch = signature() != last_sig()
        print("변경 있음 — py sync.py 로 반영하세요" if ch else "변경 없음 (최신)")
        return
    if "--watch" in sys.argv:
        print(f"포털 게시 감시 중 ({POLL}초마다 확인) · 끄려면 Ctrl+C\n  감시 폴더: {SRC}")
        if signature() != last_sig():
            run_sync()
        else:
            print("  현재 최신 상태입니다.")
        stable, pend = None, None
        while True:
            time.sleep(POLL)
            sig = signature()
            if sig == last_sig():
                pend = None
                continue
            # 게시 중 파일이 쓰이는 도중을 피하려고, 한 번 더 같은 값일 때 실행
            if pend == sig:
                run_sync(); pend = None
            else:
                pend = sig
        return
    run_sync()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
