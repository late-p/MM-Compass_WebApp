r"""체험용 가상 데이터 생성기 — 공개 저장소/공개 링크용.

실제 회사 데이터를 쓰지 않고, 같은 형식(schema 1)의 가짜 데이터를 시드 고정으로 만든다.
  · 법인·본부·사업부·팀·사람 이름 모두 가상 (실제와 무관)
  · 숫자는 팀 단위로 만든 뒤 위로 합산하므로 화면 안에서 서로 일관됨 (합계 = 하위 합)
  · 주차 3개(최신 먼저) 생성 → 주차 선택, 전월 대비, 대기 상세까지 전부 체험 가능
"""
import random

CORPS = [
    ("알파컴퍼니", [
        ("솔루션본부", [("클라우드사업부", ["인프라팀", "플랫폼팀", "보안팀"]), ("데이터사업부", ["분석팀", "AI팀"])]),
        ("서비스본부", [("운영사업부", ["운영1팀", "운영2팀"]), ("컨설팅사업부", ["전략팀", "혁신팀", "디자인팀"])]),
        ("제품본부", [("제품사업부", ["개발1팀", "개발2팀", "QA팀"])]),
    ]),
    ("베타컴퍼니", [
        ("테크본부", [("모바일사업부", ["앱팀", "웹팀"]), ("임베디드사업부", ["펌웨어팀", "하드웨어팀"])]),
    ]),
]
SUR = "김이박최정강조윤장임한오서신권황안송류홍"
GIV = ["민준","서연","지호","하은","도윤","수아","시우","지민","예준","서윤","주원","채원","현우","지우","건우","유진","선우","다은","준서","소율","태윤","나윤","재원","하린","승민"]
JOBS = ["개발 · 초급", "개발 · 중급", "개발 · 고급", "Programming", "PM", "PL", "아키텍트", "QA", "DBA", "운영 · 중급", "기획", "디자인"]


def _person(k):
    """가상 이름·직무 (난수를 쓰지 않아 기존 수치·시드 결과에 영향 없음)"""
    return SUR[(k * 7) % len(SUR)] + GIV[(k * 11 + k // 20) % len(GIV)], JOBS[(k * 5 + k // 12) % len(JOBS)]


CM = 10          # 당월 인덱스(0부터) = 11월
TARGET = 80.0


def _clamp(v, lo=40.0, hi=100.0):
    return max(lo, min(hi, v))


def _wavg(items, key, w="T"):
    tw = sum(i[w] for i in items) or 1
    return [sum(i[w] * i[key][m] for i in items) / tw for m in range(12)]


def _series(rng, u_now, u_prev, g_gap_now, g_gap_prev):
    mu, mg = [], []
    base = u_prev + rng.uniform(-4, 4)
    for m in range(12):
        if m == CM:
            u, gp = u_now, g_gap_now
        elif m == CM - 1:
            u, gp = u_prev, g_gap_prev
        elif m < CM:
            base += rng.uniform(-3.2, 3.2)
            base += (u_prev - base) * 0.12
            u, gp = _clamp(base), rng.uniform(1, 9)
        else:
            u, gp = _clamp(u_now - rng.uniform(0, 5)), rng.uniform(2, 8)
        mu.append(round(_clamp(u), 2))
        mg.append(round(_clamp(u - gp), 2))
    return mu, mg


def _team(rng, name, cn, counter):
    m = rng.randint(6, 16)
    people, idle_now = [], 0.0
    for _ in range(m):
        r = rng.random()
        v = 0.0 if r < 0.85 else (1.0 if r < 0.93 else rng.choice([0.25, 0.5, 0.52, 0.76]))
        if v > 0:
            counter[0] += 1
            nm, jb = _person(counter[0])
            people.append({"n": nm, "j": jb, "mm": round(v, 2)})
        idle_now += v
    T = float(m)
    idle_prev = max(0.0, idle_now + rng.uniform(-2.2, 2.2))
    pr = rng.uniform(0, 0.10 * T)
    pr_prev = rng.uniform(0, 0.10 * T)
    inp, inp_prev = T - idle_now, T - idle_prev
    u, pu = inp / T * 100, inp_prev / T * 100
    g, pg = (inp - pr) / T * 100, (inp_prev - pr_prev) / T * 100
    mu, mg = _series(rng, u, pu, u - g, pu - pg)
    return {"name": name, "cn": cn, "T": T, "idle": idle_now, "pidle": idle_prev, "inp": inp, "pinp": inp_prev, "pr": pr, "ppr": pr_prev,
            "u": u, "g": g, "pu": pu, "pg": pg, "mu": mu, "mg": mg, "people": people}


def _agg(name, cn, kids):
    T = sum(k["T"] for k in kids)
    idle, pidle = sum(k["idle"] for k in kids), sum(k["pidle"] for k in kids)
    inp, pinp = sum(k["inp"] for k in kids), sum(k["pinp"] for k in kids)
    pr, ppr = sum(k["pr"] for k in kids), sum(k["ppr"] for k in kids)
    return {"name": name, "cn": cn, "T": T, "idle": idle, "pidle": pidle, "inp": inp, "pinp": pinp, "pr": pr, "ppr": ppr,
            "u": inp / T * 100, "g": (inp - pr) / T * 100, "pu": pinp / T * 100, "pg": (pinp - ppr) / T * 100,
            "mu": _wavg(kids, "mu"), "mg": _wavg(kids, "mg")}


def _node(nid, x, corp, tm=0, par=None, dv=None):
    r = lambda v: None if v is None else round(v, 2)
    return {"id": nid, "name": x["name"], "cn": x["cn"], "corp": corp, "T": r(x["T"]), "u": r(x["u"]), "g": r(x["g"]), "idle": r(x["idle"]),
            "pu": r(x["pu"]), "pg": r(x["pg"]), "pidle": r(x["pidle"]), "mu": [r(v) for v in x["mu"]], "mg": [r(v) for v in x["mg"]],
            "fu": r(x["mu"][11]), "fg": r(x["mg"][11]), "par": par, "dv": dv, "tm": tm}


def _vals(x, label):
    r = lambda v: round(v, 2)
    return {"v": r(x["g"]), "prev": r(x["pg"]), "label": label, "d": r(x["g"] - x["pg"])}, {"v": r(x["u"]), "prev": r(x["pu"]), "label": label, "d": r(x["u"] - x["pu"])}


def make_week(seed, title, label_basis="전월 확정"):
    rng = random.Random(seed)
    counter = [0]
    nodes, cards, idle_divs, corp_objs, all_teams, hq_all = [], [], [], [], [], []
    for ci, (cname, hqs) in enumerate(CORPS):
        corp_kids = []
        for hi, (hname, divs) in enumerate(hqs):
            hid = f"h{ci}_{hi}"
            div_objs, k, children = [], 0, []
            for dname, teams in divs:
                dobj_teams = [_team(rng, t, cname, counter) for t in teams]
                dobj = _agg(dname, cname, dobj_teams)
                did = f"{hid}#{k}"; k += 1
                children.append(_node(did, dobj, f"{cname} · {hname}", 0))
                for t in dobj_teams:
                    children.append(_node(f"{hid}#{k}", t, f"{cname} · {hname} · {dname}", 1, hid, did)); k += 1
                div_objs.append(dobj)
                all_teams += dobj_teams
                idle_divs.append({"corp": cname, "hq": hname, "div": dname, "prev": round(dobj["pidle"], 2), "mm": round(dobj["idle"], 2),
                                  "teams": [{"team": t["name"], "n": len(t["people"]), "mm": round(t["idle"], 2),
                                             "people": sorted(t["people"], key=lambda p: -p["mm"]), "diff": 0.0}
                                            for t in dobj_teams if t["people"]]})
                if ci == 1:
                    cards.append(did)
            hobj = _agg(hname, cname, div_objs)
            nodes.append(_node(hid, hobj, cname, 0))
            nodes += children
            if ci == 0:
                cards.append(hid)
            corp_kids += div_objs
        corp_objs.append(_agg(cname, cname, corp_kids))
    ALL = _agg("전사", "전사", all_teams)

    lab = label_basis
    gA, uA = _vals(ALL, lab)
    gn_prev = ALL["pg"] + 2.6
    kpi = {
        "가득률 (비매출 모수 제외)": {"v": round(ALL["g"] + 2.8, 2), "unit": "%", "prev": round(gn_prev, 2), "label": lab, "d": round(ALL["g"] + 2.8 - gn_prev, 2)},
        "투입 MM": {"v": round(ALL["inp"], 2), "unit": f"/ {ALL['T']:.2f}", "prev": round(ALL["pinp"], 2), "label": lab, "d": round(ALL["inp"] - ALL["pinp"], 2)},
        "대기 MM": {"v": round(ALL["idle"], 2), "unit": "MM", "prev": round(ALL["pidle"], 2), "label": lab, "d": round(ALL["idle"] - ALL["pidle"], 2)},
    }
    corps = []
    for c in corp_objs:
        g, u = _vals(c, lab)
        corps.append({"name": c["name"], "T": round(c["T"], 2), "idle": round(c["idle"], 2), "g": g, "u": u,
                      "gn": {"v": round(c["g"] + 3, 2), "prev": round(c["pg"] + 2.8, 2), "label": lab, "d": round(c["g"] + 3 - c["pg"] - 2.8, 2)}})
    trend = []
    ga, ua = ALL["mg"], ALL["mu"]
    for i in range(12):
        t = ALL["T"] * (1 + rng.uniform(-0.02, 0.02)) if i != CM else ALL["T"]
        trend.append({"m": f"{i+1}월", "k": "실적" if i < CM else ("당월" if i == CM else "예상"), "u": round(ua[i], 2), "g": round(ga[i], 2),
                      "t": round(t, 2), "idle": round(t * (1 - ua[i] / 100), 2)})
    year = {"g": round(sum(ga) / 12, 2), "gn": round(sum(ga) / 12 + 3.1, 2), "u": round(sum(ua) / 12, 2)}
    hr = [{"type": "입사", "org": "알파컴퍼니 · 솔루션본부 · 클라우드사업부 · 인프라팀", "date": "11.03", "eff": "+1.00 MM (11월)"},
          {"type": "복직", "org": "알파컴퍼니 · 서비스본부 · 컨설팅사업부 · 전략팀", "date": "11.17", "eff": "+0.48 MM (11월)"},
          {"type": "전배", "org": "알파컴퍼니 · 제품본부 · 제품사업부 · 개발1팀 → 개발2팀", "date": "11.10", "eff": "+0.00 MM (11월)"},
          {"type": "퇴사", "org": "베타컴퍼니 · 테크본부 · 모바일사업부 · 앱팀", "date": "11.12", "eff": "-1.00 MM (11월)"}]
    return {
        "week": title, "asof": "가상", "meet": "데모", "title": f"{title} 인력 가동 현황", "basis": lab, "demo": True,
        "all": {"g": gA, "u": uA}, "kpi": kpi, "inp": round(ALL["inp"], 2), "T": round(ALL["T"], 2),
        "hr_n": len(hr), "hr_txt": "입사 1 · 복직 1 · 전배 1 · 퇴사 1", "corps": corps, "nodes": nodes, "cards": cards, "target": TARGET, "cm": CM,
        "trend": trend, "year": year, "ytd": None, "hr": hr, "leave": {"알파컴퍼니": 5, "베타컴퍼니": 2},
        "idle": {"prev": "전월", "divs": idle_divs},
    }


def demo_weeks():
    """[(라벨, 데이터)] 최신 먼저"""
    return [("demo-W3", make_week(303, "샘플 3주차")), ("demo-W2", make_week(202, "샘플 2주차")), ("demo-W1", make_week(101, "샘플 1주차"))]


if __name__ == "__main__":
    import json, sys
    sys.stdout.reconfigure(encoding="utf-8")
    for lab, d in demo_weeks():
        print(lab, d["week"], "전사 가득", d["all"]["g"]["v"], "가동", d["all"]["u"]["v"], "대기", d["kpi"]["대기 MM"]["v"], "노드", len(d["nodes"]))
