r"""meeting.html(엔진이 만든 회의용 화면)에서 모바일 요약 화면에 필요한 수치만 뽑는다.

- 포털 화면과 숫자가 100% 같도록, 별도 계산 없이 화면에 이미 들어 있는 값(내장 JSON + 표시 문구)을 읽는다.
- 개인정보는 '대기 인력' 표의 성명·직무·대기 MM만 읽는다 (직급·소속 상세·투입 프로젝트는 읽지 않음).
  인사 변동·휴직은 조직·건수·MM만 읽고 이름·직급·직무는 읽지 않는다.
- 엔진 출력 형식이 바뀌어 값을 못 찾으면 조용히 틀린 값을 내지 않고 ExtractError 로 멈춘다.
"""
import html as _html
import json
import re


class ExtractError(Exception):
    pass


def _num(s):
    """'−1.38%p' '+0.23MM' '85.69' '1,234' → float (유니코드 마이너스 처리)"""
    s = s.replace("−", "-").replace(",", "")
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if not m:
        raise ExtractError(f"숫자를 읽지 못함: {s!r}")
    return float(m.group(0))


def _txt(h):
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))).strip()


def _need(m, what):
    if not m:
        raise ExtractError(f"'{what}' 위치를 찾지 못했습니다. 엔진 출력 형식이 바뀌었는지 확인하세요.")
    return m


def _json_after(s, key):
    i = s.find(key)
    if i < 0:
        raise ExtractError(f"내장 데이터 '{key}' 를 찾지 못했습니다.")
    obj, _ = json.JSONDecoder().raw_decode(s[i + len(key):])
    return obj


# 비교 문구: '10월 확정 85.69 <span class="pl pl-dn">−1.38%p</span>'
_CMP = r'<div class="cmp">([^<]*?)<span class="pl[^"]*">([^<]*)</span>'


def _cmp(label_prev, delta):
    lab = label_prev.strip()
    return {"prev": _num(lab.split()[-1]), "label": " ".join(lab.split()[:-1]), "d": _num(delta)}


def _idle_detail(sl):
    """대기 인력 페이지 → 사업부별 {법인, 본부, 사업부, 전월/당월 대기MM, 팀[{팀, MM, 인원[{이름, MM}]}]}
    사람 행: data-b = 당월 대기 MM(소수 4자리), 세 번째 칸 = 직무(없으면 ''). 당월 대기가 0인 사람(퇴사·이미 투입 등)은 뺀다.
    ※ 이 데이터에는 대기 인원의 '이름'이 들어간다 (요청에 따라 대기 상세에만)."""
    sl = re.sub(r"<svg.*?</svg>", "", sl, flags=re.S)
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'<details class="(cb|ib|dvb)"', sl)]
    if not marks:
        raise ExtractError("대기 인력 구성(cb/ib/dvb)을 찾지 못했습니다.")
    corp = hq = None
    divs, prev_lab = [], ""
    for i, (pos, kind) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(sl)
        seg = sl[pos:end]
        nm = re.search(r"<summary[^>]*>.*?<b>([^<]*)</b>", seg, re.S)
        if not nm:
            raise ExtractError("대기 인력 항목 이름을 찾지 못했습니다.")
        name = _html.unescape(nm.group(1)).strip()
        if kind == "cb":
            corp, hq = name, None  # 법인이 바뀌면 본부 초기화 (일부 법인은 본부 단계 없이 사업부가 바로 나옴)
        elif kind == "ib":
            hq = name
        else:
            m9 = re.search(r'<span class="m9">([-\d.]+)</span>', seg)
            m10 = re.search(r'<span class="m10">([-\d.]+)</span>', seg)
            pl = re.search(r"대기 (\d+월)", seg)
            if pl:
                prev_lab = pl.group(1)
            teams = []
            parts = re.split(r'(<tr class="tmh">.*?</tr>)', seg, flags=re.S)
            cur = None
            for part in parts:
                if part.startswith('<tr class="tmh">'):
                    t = _txt(part)
                    mt = re.match(r"(.*?)\s+(\d+)\s*명\s*·\s*대기\s*\d+월\s*([-+−\d.]+)\s*·\s*\d+월\s*([-+−\d.]+)\s*MM", t)
                    if not mt:
                        raise ExtractError(f"팀 머리글을 읽지 못함: {t[:60]}")
                    cur = {"team": mt.group(1).strip(), "n": int(mt.group(2)), "mm": _num(mt.group(4)), "people": []}
                    teams.append(cur)
                elif cur is not None:
                    for row in re.findall(r"<tr data-a[^>]*>.*?</tr>", part, re.S):
                        b = re.search(r'data-b="([-\d.]+)"', row)
                        cells = re.findall(r'<td class="l">(.*?)</td>', row, re.S)  # 성명 · 소속 · 직무 · 직급 …
                        if b and cells and float(b.group(1)) > 0.004:
                            job = _txt(cells[2]) if len(cells) > 2 else ""
                            cur["people"].append({"n": _txt(cells[0]), "mm": round(float(b.group(1)), 2),
                                                  "j": "" if job in ("", "—", "-") else job})
            for t in teams:  # 팀 합계(엔진 계산)와 개인 합이 다른지 표시
                t["diff"] = round(sum(p["mm"] for p in t["people"]) - t["mm"], 2)
                t["people"].sort(key=lambda p: -p["mm"])
            divs.append({"corp": corp, "hq": hq, "div": name, "prev": _num(m9.group(1)) if m9 else None,
                         "mm": _num(m10.group(1)) if m10 else None, "teams": [t for t in teams if t["people"] or abs(t["mm"]) > 0.004]})
    return {"prev": prev_lab, "divs": divs}


def extract(path):
    s = open(path, encoding="utf-8").read()
    slides = re.findall(r'<section class="slide">(.*?)</section>', s, re.S)
    if len(slides) < 5:
        raise ExtractError(f"슬라이드가 {len(slides)}개뿐입니다(5개 이상 필요).")
    by = {}
    for sl in slides:
        h = _need(re.search(r"<h2>(.*?)</h2>", sl), "페이지 제목").group(1)
        key = ("home" if "가동 현황" in h else "org" if "본부별" in h else "trend" if "추이" in h else
               "why" if "변동 원인" in h else "idle" if "대기 인력" in h else "hr" if "인사 변동" in h else None)
        if key:
            by[key] = (h, sl)
    for k in ("home", "org", "trend", "idle", "hr"):
        if k not in by:
            raise ExtractError(f"'{k}' 페이지를 찾지 못했습니다.")

    d = {}
    # ---- 머리글: 주차·기준일·회의일 ----
    wk = _txt(_need(re.search(r'<span class="wk">(.*?)</span>', s), "주차 표시").group(1))
    parts = [p.strip() for p in wk.split("·")]
    d["week"] = parts[0]
    d["asof"] = next((p.replace("데이터 기준", "").strip() for p in parts if "데이터 기준" in p), "")
    d["meet"] = parts[-1] if len(parts) > 2 else ""
    d["title"] = _txt(by["home"][0])
    d["basis"] = ""  # 전사 값 옆 비교 문구에서 아래에서 채움

    # ---- 1) 전사 ----
    home = by["home"][1]
    gcard = _need(re.search(r'<div class="card gcard">(.*?)</div></div></div>', home, re.S), "전사 나침반")
    gst = {}
    for lab, val, c, dl in re.findall(r"<span>([^<]+)</span><b>([\d.]+)%</b>" + _CMP, gcard.group(1)):
        gst[lab] = {"v": float(val), **_cmp(c, dl)}
    if "가득률" not in gst or "가동률" not in gst:
        raise ExtractError("전사 가득률/가동률을 읽지 못했습니다.")
    d["all"] = {"g": gst["가득률"], "u": gst["가동률"]}
    d["basis"] = gst["가득률"]["label"]  # 예: "10월 확정" / "전주"
    kp = {}
    for lab, val, unit, c, dl in re.findall(
            r'<div class="kl">([^<]*)</div><div class="kv">([\d.,]+)<small>([^<]*)</small></div><div class="kc">' + _CMP, home):
        kp[lab.strip()] = {"v": float(val.replace(",", "")), "unit": unit.strip(), **_cmp(c, dl)}
    d["kpi"] = kp
    m = re.search(r"가동대상.*?([\d.]+)\s*/\s*([\d.]+)", home)
    d["inp"] = kp.get("투입 MM", {}).get("v")
    mt = re.search(r'<div class="kl">투입 MM</div><div class="kv">([\d.,]+)<small>\s*/\s*([\d.,]+)</small>', home)
    d["T"] = float(mt.group(2).replace(",", "")) if mt else None
    mh = re.search(r"인사 변동\s*<b>(\d+)건</b>\s*(?:<span class=\"muted\">\(([^)]*)\)</span>)?", home)
    d["hr_n"] = int(mh.group(1)) if mh else 0
    d["hr_txt"] = mh.group(2) if mh and mh.group(2) else ""

    # ---- 법인 ----
    corps = []
    for blk in home.split('<div class="cc2">')[1:]:
        mm = re.search(r'<div class="cch"><b>([^<]+)</b><span>가동대상 ([\d.]+)MM · 대기 ([\d.]+)MM</span>', blk)
        if not mm:
            continue
        g = {}
        for lab, val, c, dl in re.findall(r"<span>([^<]+)</span><b>([\d.]+)%</b>" + _CMP, blk):
            g.setdefault(lab, {"v": float(val), **_cmp(c, dl)})
        if "가득률" in g and "가동률" in g:
            corps.append({"name": mm.group(1), "T": float(mm.group(2)), "idle": float(mm.group(3)), "g": g["가득률"],
                          "u": g["가동률"], "gn": g.get("가득률 (비매출 모수 제외)")})
    if not corps:
        raise ExtractError("법인별 값을 읽지 못했습니다.")
    d["corps"] = corps
    import os as _os
    pre = _os.path.commonprefix([c["name"] for c in corps]) if len(corps) > 1 else ""
    d["strip"] = pre if len(pre) >= 2 else ""   # 법인명 앞의 공통 접두어(화면에서 줄여 표시)

    # ---- 2) 조직 (내장 JSON) ----
    gd = _json_after(s, "const GD=")
    nodes = []
    for x in gd["all"]:
        n_ = {k: x.get(k) for k in ("id", "name", "cn", "corp", "T", "u", "g", "idle", "pu", "pg", "pidle", "mu", "mg", "fu", "fg", "par", "dv")}
        n_["tm"] = 1 if x.get("tm") else 0  # 원본은 팀만 tm=1 이고 나머지는 필드 자체가 없음 → 0 으로 정규화
        nodes.append(n_)
    d["nodes"] = nodes
    d["cards"] = gd.get("cards", [])
    d["target"] = gd.get("target", 80)
    d["cm"] = gd.get("cm")  # 당월 인덱스(0부터)

    # ---- 3) 추이 ----
    tip = _json_after(s, "const TIP=")
    d["trend"] = [{k: t.get(k) for k in ("m", "k", "u", "g", "t", "idle")} for t in tip]
    tr = _txt(by["trend"][1])
    my = re.search(r"연간\(실적\+예상\)\s*가득률\s*([\d.]+)%.*?비매출 모수 제외 가득률\s*([\d.]+)%.*?가동률\s*([\d.]+)%", tr)
    mr = re.search(r"(1~\d+월 실적)\s*가득률\s*([\d.]+)%.*?가동률\s*([\d.]+)%", tr)
    d["year"] = ({"g": float(my.group(1)), "gn": float(my.group(2)), "u": float(my.group(3))} if my else None)
    d["ytd"] = ({"label": mr.group(1), "g": float(mr.group(2)), "u": float(mr.group(3))} if mr else None)

    # ---- 4) 대기: 법인별 합계는 corps, 조직별은 nodes ----
    # ---- 5) 인사 변동 (유형·조직·적용일·영향 MM 만. 이름·직급·직무는 읽지 않음 — 대기 인력 표와 다름) ----
    hr_sl = by["hr"][1]
    hrt = re.search(r'<table class="hrt">.*?<tbody>(.*?)</tbody>', hr_sl, re.S)
    hr = []
    if hrt:
        for tr_ in re.findall(r"<tr[^>]*>(.*?)</tr>", hrt.group(1), re.S):
            c = [_txt(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr_, re.S)]
            if len(c) >= 7:
                hr.append({"type": c[0], "org": c[2], "date": c[5], "eff": c[6]})
    d["hr"] = hr
    lv = re.search(r'<table class="lvt">.*?<tbody>(.*?)</tbody>', hr_sl, re.S)
    leave = {}
    if lv:
        for tr_ in re.findall(r"<tr[^>]*>(.*?)</tr>", lv.group(1), re.S):
            c = [_txt(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr_, re.S)]
            if len(c) >= 2:
                leave[c[1]] = leave.get(c[1], 0) + 1
    d["leave"] = leave
    d["idle"] = _idle_detail(by["idle"][1])
    return d


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    r = extract(sys.argv[1])
    for k, v in r.items():
        if k == "nodes":
            print("nodes:", len(v))
        else:
            print(k, "=", json.dumps(v, ensure_ascii=False)[:420])
