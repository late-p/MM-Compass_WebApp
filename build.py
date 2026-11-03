r"""MM-Compass 회의용 웹앱 빌더 — 앱(껍데기)과 데이터(매주 바뀜)를 분리해서 dist/ 에 만든다.

  py build.py                 최신 게시 주차 + 최근 주차들을 변환
  py build.py --no-token      비밀 주소 없이 dist/ 바로 아래에 빌드
  py build.py --weeks 6       최근 6개 주차까지 (기본 8)
  py build.py --demo          가상 샘플 데이터로 docs/ 에 체험판 빌드 (공개 링크·저장소용, 포털·실데이터 불필요)

출력 구조 (dist/m-<비밀주소>/)
  index.html            앱 껍데기 (CSS·JS 포함, 데이터 없음) ← 거의 안 바뀜
  sw.js, manifest, icon 설치·오프라인
  data/latest.json      가장 최근 게시 주차 데이터        ← 매주 바뀌는 것
  data/weeks.json       주차 목록 (지난 주차 선택용)
  data/<주차>.json      주차별 데이터

데이터 계약(schema 1): {schema, rev, generated, week:{label,title,asof,meet}, d:{...}}
  앱은 schema 가 자기가 아는 값보다 크면 "앱 업데이트 필요"로 안내하고, rev 가 바뀌었는지로 '새 데이터'를 구분한다.
"""
import argparse, datetime as dt, hashlib, json, secrets, shutil, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
from extract import extract, ExtractError  # noqa: E402
from make_demo import demo_weeks  # noqa: E402

SCHEMA = 1
HERE = Path(__file__).resolve().parent
SRC_STORE = HERE.parent / "MM-Compass" / "storage" / "published"
ICONS = HERE / "template" / "assets"
TPL = HERE / "template"
DIST = HERE / "dist"


def published_weeks():
    ok = [p for p in SRC_STORE.iterdir() if (p / "meeting.html").exists() and not (p / "RETIRED.txt").exists()]
    return sorted(ok, key=lambda p: p.name, reverse=True)  # 최신 먼저 (라벨이 2026-11-W1 형식이라 문자열 정렬이 곧 시간순)


def payload(label, d):
    body = json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {"schema": SCHEMA, "rev": hashlib.sha1(body.encode("utf-8")).hexdigest()[:12],
            "generated": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "week": {"label": label, "title": d["week"], "asof": d["asof"], "meet": d["meet"]}, "d": d}


def build_data(out, nweeks, demo=False):
    data_dir = out / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    done = []
    if demo:
        for label, d in demo_weeks()[:nweeks]:
            p = payload(label, d)
            (data_dir / f"{label}.json").write_text(json.dumps(p, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            done.append(p)
            print(f"  - {label}: {d['week']} (가상 데이터, rev {p['rev']})")
    else:
        for wk in published_weeks()[:nweeks]:
            try:
                d = extract(wk / "meeting.html")
            except ExtractError as e:
                print(f"  - {wk.name}: 건너뜀 (옛 형식) — {e}")
                continue
            p = payload(wk.name, d)
            (data_dir / f"{wk.name}.json").write_text(json.dumps(p, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            done.append(p)
            print(f"  - {wk.name}: {d['week']} (기준 {d['asof']}, rev {p['rev']})")
    if not done:
        sys.exit("변환된 주차가 없습니다. MM-Compass에서 게시된 주차가 있는지 확인하세요.")
    latest = done[0]
    (data_dir / "latest.json").write_text(json.dumps(latest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    weeks = {"schema": SCHEMA, "generated": latest["generated"], "latest": latest["week"]["label"],
             "weeks": [dict(p["week"], rev=p["rev"]) for p in done]}
    (data_dir / "weeks.json").write_text(json.dumps(weeks, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return latest


def build_shell(out):
    css = (TPL / "lite.css").read_text(encoding="utf-8")
    js = (TPL / "lite.js").read_text(encoding="utf-8")
    h = hashlib.sha1()
    for f in ("lite.html", "lite.css", "lite.js", "sw.js"):
        h.update((TPL / f).read_bytes())
    version = h.hexdigest()[:10]  # 앱 껍데기 버전 (데이터와 무관)
    page = (TPL / "lite.html").read_text(encoding="utf-8")
    for tok, val in (("/*@CSS@*/", css), ("/*@JS@*/", js.replace("</script", "<\\/script")), ("/*@VERSION@*/", version)):
        if page.count(tok) != 1:
            sys.exit(f"템플릿 자리표시자 {tok} 가 1개가 아닙니다.")
        page = page.replace(tok, val)
    (out / "index.html").write_text(page, encoding="utf-8")
    manifest = {"name": "MM-Compass 회의용", "short_name": "MM-Compass", "description": "MM 나침반 · 회의용 요약",
                "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
                "background_color": "#0F2942", "theme_color": "#0F2942", "lang": "ko",
                "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                          {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                          {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    (out / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in ("icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.ico"):
        shutil.copy(ICONS / f, out / f)
    (out / "sw.js").write_text((TPL / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version), encoding="utf-8")
    return version


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-token", action="store_true")
    ap.add_argument("--weeks", type=int, default=8)
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()

    tok_file = HERE / ".token"
    if a.demo:   # 공개 체험판: 비밀 주소 없이 docs/ (GitHub Pages) 에 빌드. 실데이터는 절대 쓰지 않음
        out = HERE / "docs"
    elif a.no_token:
        out = DIST
    else:
        if not tok_file.exists():
            tok_file.write_text(secrets.token_urlsafe(18), encoding="utf-8")
        out = DIST / ("m-" + tok_file.read_text(encoding="utf-8").strip())
    root = out if a.demo else DIST
    root.mkdir(exist_ok=True)
    for ch in root.iterdir():  # 폴더 자체는 두고 내용만 비운다 (로컬 서버가 폴더를 잡고 있어도 동작)
        shutil.rmtree(ch) if ch.is_dir() else ch.unlink()
    out.mkdir(parents=True, exist_ok=True)

    print("주차 데이터 변환:")
    latest = build_data(out, a.weeks, a.demo)
    version = build_shell(out)
    (DIST / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    if not a.no_token:
        (DIST / "index.html").write_text("<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>-</title>", encoding="utf-8")

    kb = (out / "index.html").stat().st_size // 1024
    dkb = (out / "data" / "latest.json").stat().st_size // 1024
    print(f"\n완료: 최신 {latest['week']['title']} (기준 {latest['week']['asof']}, 데이터 rev {latest['rev']})")
    print(f"출력: {out}  (앱 {kb}KB · 최신 데이터 {dkb}KB · 앱 버전 {version})")
    if not a.no_token and not a.demo:
        print(f"접속 주소 경로: /{out.name}/   ← 이 주소를 아는 사람만 열 수 있습니다")


if __name__ == "__main__":
    main()
