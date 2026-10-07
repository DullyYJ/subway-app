#!/usr/bin/env python3
"""경로 정확도 점수표: 엔진(route-v2-app) vs 카카오맵 대중교통 — 같은 시각에 연달아 조회한 값(route_cmp_*.json).
사용: python3 route_cmp_score.py route_cmp_20261007.json
  kind: city(시내·광역 대중교통, 비교 가능) / ld(장거리: 카카오 '추천'탭 = KTX 등) / ldnc(카카오 목록에 장거리가 안 잡혀 비교 불가)
점수: 엔진 최단 vs 카카오 목록 중 최단(분). '±max(3분,10%) 이내' 비율, 엔진이 더 빠름/느림, 중앙 편차, 90% 편차.
주의: 카카오는 출발지 좌표에서 역까지 도보를 합산한다(예: 강남→양재 9분 = 도보 7 + 승차 2). 엔진 값은 '역에서 역' 위주라 가까운 구간은 엔진이 짧게 나온다 — kakao_first_walk 를 빼서 보는 보정 열도 같이 낸다."""
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); C = d['columns']; rows = [dict(zip(C, r)) for r in d['rows']]
def rep(name, rs, adj=False):
    if not rs: return
    dev = []; ok = 0; fast = slow = 0
    for r in rs:
        k = r['kakao_min']
        e = r['eng_best']
        x = e - k
        dev.append(x)
        if abs(x) <= max(3, 0.1 * k): ok += 1
        if x < -3: fast += 1
        elif x > 3: slow += 1
    a = sorted(abs(x) for x in dev)
    print(f"{name:<22} n={len(rs):<3} ±max(3분,10%) 이내 {100*ok/len(rs):5.1f}%  엔진 3분↑빠름 {fast:<3} 3분↑느림 {slow:<3} 편차 중앙 {st.median(dev):+.1f}분  |편차| p50 {a[len(a)//2]:.0f} p90 {a[int(len(a)*.9)-1]:.0f}")
city = [r for r in rows if r['kind'] == 'city']
rep('시내·광역 전체', city)
rep(' ├ 카카오 ≤30분', [r for r in city if r['kakao_min'] <= 30])
rep(' ├ 카카오 31~90분', [r for r in city if 30 < r['kakao_min'] <= 90])
rep(' └ 카카오 >90분', [r for r in city if r['kakao_min'] > 90])
ldr = [r for r in rows if r['kind'] == 'ld']
rep('장거리 총시간(대기 포함)', ldr)
if 'ld_nowait' in d:      # 같은 기준: 가장 빠른 열차의 운행시간(대기 제외)
    dv = [d['ld_nowait'][str(r['ci'])][0] - r['kakao_min'] for r in ldr if str(r['ci']) in d['ld_nowait']]
    okn = sum(abs(x) <= max(3, 0.1 * r['kakao_min']) for x, r in zip(dv, ldr))
    print(f"{'장거리 같은 기준(대기 제외)':<20} n={len(dv):<3} ±max(3분,10%) 이내 {100*okn/len(dv):5.1f}%  편차 중앙 {st.median(dv):+.1f}분  범위 {min(dv):+d}~{max(dv):+d}분")
print('비교 불가(ldnc):', [r['ci'] for r in rows if r['kind'] == 'ldnc'])
print('\n큰 차이(|편차|>8분, 시내·광역):')
for r in sorted(city, key=lambda r: -abs(r['eng_best'] - r['kakao_min'])):
    x = r['eng_best'] - r['kakao_min']
    if abs(x) <= 8: break
    print(f"  case {r['ci']:>3} [{r['cat']}] 카카오 {r['kakao_min']:>3} (첫 결과 {r['kakao_first']}, 환승 {r['kakao_first_transfers']}, 도보 {r['kakao_first_walk']}) vs 엔진 {r['eng_best']:>3} → {x:+d}분")
print('\n엔진 응답 ms(브라우저 측정): 중앙', int(st.median(r['eng_ms'] for r in rows)), ' p90', sorted(r['eng_ms'] for r in rows)[int(len(rows)*.9)-1])
