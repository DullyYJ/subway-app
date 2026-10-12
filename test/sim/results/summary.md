## 행동 × 위치상태머신 입력별 요약

| 행동 | FSM | 건수 | 통과 | 문제 | 재탐색 발생 | 이탈→재탐색 평균(초) | 재탐색 후 오버레이 켜짐(평균%) | 마커 오차 95%(최대 m) | 오버레이 오차 95%(최대 m) |
|---|---|---|---|---|---|---|---|---|---|
| alt_vehicle | asis | 10 | 3 | 7 | 3/10 | - | - | 2370 (3326) | 1432 (2054) |
| alt_vehicle | wired | 5 | 2 | 3 | 2/5 | 50 | 0 | 2243 (3326) | 1156 (1477) |
| faithful | asis | 25 | 10 | 15 | 7/25 | - | 0 | 982 (6370) | 1141 (2820) |
| faithful | wired | 10 | 5 | 5 | 0/10 | - | - | 1204 (5364) | 1407 (2820) |
| skip_transfer | asis | 6 | 6 | 0 | 0/6 | - | - | 1651 (3011) | 1978 (2984) |
| stay_home | asis | 5 | 2 | 3 | 0/5 | - | - | 182 (234) | 2740 (4000) |
| strange_place | asis | 10 | 0 | 10 | 0/10 | - | - | 1935 (3340) | 1736 (3323) |
| strange_place | wired | 5 | 2 | 3 | 2/5 | 33 | 0 | 1432 (1703) | 1243 (1492) |
| taxi | asis | 5 | 0 | 5 | 0/5 | - | - | 3960 (5163) | 1855 (3022) |
| taxi | wired | 5 | 2 | 3 | 2/5 | 143 | 0 | 3536 (5163) | 1603 (3022) |
| unknown_vehicle | asis | 10 | 0 | 10 | 0/10 | - | - | 2758 (3422) | 1814 (3351) |
| unknown_vehicle | wired | 5 | 2 | 3 | 2/5 | 220 | 0 | 2367 (3422) | 1649 (3351) |
| walk_along | asis | 5 | 2 | 3 | 0/5 | - | - | 808 (1442) | 693 (1153) |
| wrong_dir | asis | 5 | 0 | 5 | 0/5 | - | - | 169 (234) | 3200 (4750) |
| wrong_dir | wired | 5 | 1 | 4 | 1/5 | 60 | 0 | 179 (234) | 2672 (4750) |

## 시나리오별 결과

| id | 판정 | 재탐색 | 경로맞춤 | 이탈감지(초) | 재탐색 위치오차(m) | 마커 P95/최대(m) | 오버레이 P95/최대(m) | 오버레이 켜짐(%) | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| bus_sub/alt_vehicle/clean | FAIL | 0 | 0 | - | - | 2370/3212 | 1441/1577 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/alt_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 2370/3212 | 1441/1577 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/alt_vehicle/noisy | PASS | 0 | 1 | - | - | 2054/2105 | 2054/2125 | 100 |  |
| bus_sub/faithful/clean | FAIL | 0 | 0 | - | - | 1150/1819 | 2820/3984 | 100 | 마커 오차 95% 1150m; 마커 최대 오차 1819m |
| bus_sub/faithful/clean/off-60 | FAIL | 0 | 0 | - | - | 1150/1819 | 2820/3984 | 100 | 마커 오차 95% 1150m; 마커 최대 오차 1819m |
| bus_sub/faithful/clean/off240 | FAIL | 1 | 0 | - | 12 | 1646/3436 | 192/231 | 24 | 계획대로 가는데 재탐색 1회; 마커 오차 95% 1646m; 마커 최대 오차 3436m |
| bus_sub/faithful/clean/wired | FAIL | 0 | 0 | - | - | 1150/1819 | 2820/3984 | 100 | 마커 오차 95% 1150m; 마커 최대 오차 1819m |
| bus_sub/faithful/noisy | FAIL | 0 | 0 | - | - | 1600/3378 | 2820/3984 | 100 | 마커 오차 95% 1600m; 마커 최대 오차 3378m |
| bus_sub/faithful/noisy/off480 | FAIL | 1 | 0 | - | 28 | 1039/3183 | 192/231 | 23 | 계획대로 가는데 재탐색 1회; 마커 오차 95% 1039m; 마커 최대 오차 3183m |
| bus_sub/faithful/noisy/wired | FAIL | 0 | 0 | - | - | 2066/2164 | 2086/2203 | 100 | 마커 오차 95% 2066m; 마커 최대 오차 2164m |
| bus_sub/skip_transfer/clean | INFO | 0 | 0 | - | - | 1369/1762 | 1196/1762 | 100 |  |
| bus_sub/skip_transfer/noisy | INFO | 0 | 0 | - | - | 1369/1762 | 1196/1762 | 100 |  |
| bus_sub/stay_home/clean | PASS | 0 | 0 | - | - | 114/121 | 850/850 | 100 |  |
| bus_sub/strange_place/clean | FAIL | 0 | 0 | - | - | 2140/4934 | 1655/4934 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/strange_place/clean/wired | PASS | 2 | 0 | 25 | 5 | 1542/2296 | 1196/1762 | 45 |  |
| bus_sub/strange_place/noisy | FAIL | 0 | 0 | - | - | 2140/4934 | 1655/4934 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/taxi/clean | FAIL | 0 | 0 | - | - | 3472/3784 | 1617/1638 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/taxi/clean/wired | FAIL | 0 | 0 | - | - | 3472/3784 | 1617/1638 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/unknown_vehicle/clean | FAIL | 0 | 0 | - | - | 2412/3219 | 1529/1607 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/unknown_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 2412/3219 | 1529/1607 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/unknown_vehicle/noisy | FAIL | 0 | 0 | - | - | 2412/3219 | 1529/1607 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/walk_along/clean | PASS | 0 | 0 | - | - | 1442/1450 | 1153/1200 | 100 |  |
| bus_sub/wrong_dir/clean | FAIL | 0 | 0 | - | - | 114/115 | 4750/4750 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus_sub/wrong_dir/clean/wired | FAIL | 0 | 0 | - | - | 114/115 | 4750/4750 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/alt_vehicle/clean | FAIL | 0 | 0 | - | - | 1331/1408 | 1331/1389 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/alt_vehicle/clean/wired | PASS | 2 | 0 | 50 | 135 | 587/1937 | 231/379 | 29 |  |
| bus/alt_vehicle/noisy | FAIL | 0 | 0 | - | - | 1331/1408 | 1331/1389 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/faithful/clean | PASS | 0 | 0 | - | - | 84/219 | 591/708 | 100 |  |
| bus/faithful/clean/off-60 | PASS | 0 | 0 | - | - | 94/231 | 598/715 | 100 |  |
| bus/faithful/clean/off240 | FAIL | 1 | 0 | - | 12 | 575/580 | 192/231 | 24 | 계획대로 가는데 재탐색 1회 |
| bus/faithful/clean/wired | PASS | 0 | 0 | - | - | 114/219 | 598/715 | 100 |  |
| bus/faithful/noisy | PASS | 0 | 0 | - | - | 114/231 | 598/715 | 100 |  |
| bus/faithful/noisy/off480 | FAIL | 1 | 0 | - | 52 | 273/279 | 192/231 | 23 | 계획대로 가는데 재탐색 1회 |
| bus/faithful/noisy/wired | PASS | 0 | 0 | - | - | 152/265 | 598/715 | 100 |  |
| bus/stay_home/clean | PASS | 0 | 0 | - | - | 114/121 | 850/850 | 100 |  |
| bus/strange_place/clean | FAIL | 0 | 0 | - | - | 1524/1548 | 1543/1566 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/strange_place/clean/wired | PASS | 2 | 0 | 40 | 14 | 515/1796 | 544/591 | 46 |  |
| bus/strange_place/noisy | FAIL | 0 | 0 | - | - | 1694/1716 | 1728/1749 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/taxi/clean | FAIL | 0 | 0 | - | - | 1512/1586 | 1510/1571 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/taxi/clean/wired | PASS | 2 | 0 | 25 | 11 | 1072/1241 | 250/433 | 20 |  |
| bus/unknown_vehicle/clean | FAIL | 0 | 0 | - | - | 1427/1507 | 1427/1488 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/unknown_vehicle/clean/wired | PASS | 2 | 0 | 50 | 124 | 621/1953 | 231/405 | 29 |  |
| bus/unknown_vehicle/noisy | FAIL | 0 | 0 | - | - | 1427/1507 | 1427/1488 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/walk_along/clean | PASS | 0 | 0 | - | - | 1442/1450 | 1153/1200 | 100 |  |
| bus/wrong_dir/clean | FAIL | 0 | 0 | - | - | 115/133 | 3150/3150 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| bus/wrong_dir/clean/wired | PASS | 1 | 0 | 60 | 10 | 115/133 | 508/1304 | 62 |  |
| sub_bus/alt_vehicle/clean | PASS | 0 | 1 | - | - | 1932/2767 | 1315/1684 | 100 |  |
| sub_bus/alt_vehicle/clean/wired | PASS | 0 | 1 | - | - | 1854/2767 | 1315/1684 | 100 |  |
| sub_bus/alt_vehicle/noisy | PASS | 0 | 1 | - | - | 2189/3416 | 1340/1684 | 100 |  |
| sub_bus/faithful/clean | FAIL | 0 | 0 | - | - | 492/3231 | 1082/2000 | 100 | 마커 최대 오차 3231m |
| sub_bus/faithful/clean/off-60 | FAIL | 0 | 0 | - | - | 738/5381 | 1410/2000 | 100 | 마커 오차 95% 738m; 마커 최대 오차 5381m |
| sub_bus/faithful/clean/off240 | FAIL | 0 | 0 | - | - | 276/2976 | 1000/1574 | 100 | 마커 최대 오차 2976m |
| sub_bus/faithful/clean/wired | FAIL | 0 | 0 | - | - | 738/5381 | 1082/2000 | 100 | 마커 오차 95% 738m; 마커 최대 오차 5381m |
| sub_bus/faithful/noisy | FAIL | 0 | 0 | - | - | 508/3231 | 1082/2000 | 100 | 마커 최대 오차 3231m |
| sub_bus/faithful/noisy/off480 | FAIL | 1 | 0 | - | 955 | 3208/3251 | 342/738 | 41 | 계획대로 가는데 재탐색 1회; 마커 오차 95% 3208m; 마커 최대 오차 3251m |
| sub_bus/faithful/noisy/wired | FAIL | 0 | 0 | - | - | 738/3231 | 1082/2000 | 100 | 마커 오차 95% 738m; 마커 최대 오차 3231m |
| sub_bus/skip_transfer/clean | INFO | 0 | 0 | - | - | 574/1000 | 2000/2984 | 100 |  |
| sub_bus/skip_transfer/noisy | INFO | 0 | 0 | - | - | 574/1000 | 2000/2984 | 100 |  |
| sub_bus/stay_home/clean | FAIL | 0 | 0 | - | - | 215/234 | 4000/4000 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 5 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub_bus/strange_place/clean | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/strange_place/clean/wired | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/strange_place/noisy | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/taxi/clean | FAIL | 0 | 0 | - | - | 4992/5336 | 1560/1571 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/taxi/clean/wired | PASS | 1 | 0 | 261 | 74 | 3312/3393 | 1560/1571 | 56 |  |
| sub_bus/unknown_vehicle/clean | FAIL | 0 | 0 | - | - | 3356/3986 | 1407/1767 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/unknown_vehicle/clean/wired | PASS | 1 | 0 | 390 | 209 | 1999/2966 | 1568/1767 | 43 |  |
| sub_bus/unknown_vehicle/noisy | FAIL | 0 | 0 | - | - | 3253/3986 | 1407/1568 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/walk_along/clean | FAIL | 0 | 0 | - | - | 386/650 | 386/542 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 3 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub_bus/wrong_dir/clean | FAIL | 0 | 0 | - | - | 166/215 | 2700/5700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_bus/wrong_dir/clean/wired | FAIL | 0 | 0 | - | - | 215/234 | 2700/5700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/alt_vehicle/clean | FAIL | 0 | 0 | - | - | 2921/3888 | 1315/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/alt_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 3078/3888 | 1315/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/alt_vehicle/noisy | FAIL | 0 | 0 | - | - | 2921/3888 | 1315/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/faithful/clean | PASS | 0 | 0 | - | - | 567/984 | 1164/2000 | 100 |  |
| sub_sub/faithful/clean/off-60 | PASS | 0 | 0 | - | - | 587/984 | 1410/2000 | 100 |  |
| sub_sub/faithful/clean/off240 | FAIL | 1 | 0 | - | 1150 | 738/2987 | 738/1000 | 31 | 계획대로 가는데 재탐색 1회; 마커 오차 95% 738m; 마커 최대 오차 2987m |
| sub_sub/faithful/clean/wired | PASS | 0 | 0 | - | - | 587/984 | 1164/2000 | 100 |  |
| sub_sub/faithful/noisy | FAIL | 0 | 0 | - | - | 606/984 | 1164/2000 | 100 | 마커 오차 95% 606m |
| sub_sub/faithful/noisy/off480 | PASS | 0 | 0 | - | - | 567/947 | 1000/1164 | 100 |  |
| sub_sub/faithful/noisy/wired | PASS | 0 | 0 | - | - | 587/954 | 1164/2000 | 100 |  |
| sub_sub/skip_transfer/clean | INFO | 0 | 0 | - | - | 3011/3011 | 2984/3000 | 100 |  |
| sub_sub/skip_transfer/noisy | INFO | 0 | 0 | - | - | 3011/3011 | 2492/3000 | 100 |  |
| sub_sub/stay_home/clean | FAIL | 0 | 0 | - | - | 234/254 | 4000/4000 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 5 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub_sub/strange_place/clean | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/strange_place/clean/wired | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/strange_place/noisy | FAIL | 0 | 0 | - | - | 1703/1724 | 1492/1500 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/taxi/clean | FAIL | 0 | 0 | - | - | 5163/5512 | 3022/3364 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/taxi/clean/wired | FAIL | 0 | 0 | - | - | 5163/5512 | 3022/3364 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/unknown_vehicle/clean | FAIL | 0 | 0 | - | - | 3399/3986 | 3351/3429 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/unknown_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 3380/3986 | 3351/3429 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/unknown_vehicle/noisy | FAIL | 0 | 0 | - | - | 3116/3986 | 2922/3000 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/walk_along/clean | FAIL | 0 | 0 | - | - | 386/650 | 386/542 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 3 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub_sub/wrong_dir/clean | FAIL | 0 | 0 | - | - | 215/234 | 2700/5700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub_sub/wrong_dir/clean/wired | FAIL | 0 | 0 | - | - | 234/254 | 2700/5700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/alt_vehicle/clean | FAIL | 0 | 0 | - | - | 3326/4250 | 1477/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/alt_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 3326/4250 | 1477/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/alt_vehicle/noisy | FAIL | 0 | 0 | - | - | 3326/4250 | 1405/1684 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/faithful/clean | PASS | 0 | 0 | - | - | 521/984 | 1738/2000 | 100 |  |
| sub/faithful/clean/off-60 | PASS | 0 | 0 | - | - | 521/984 | 1902/2000 | 100 |  |
| sub/faithful/clean/off240 | FAIL | 1 | 0 | - | 1409 | 6370/6448 | 738/1000 | 40 | 계획대로 가는데 재탐색 1회; 마커 오차 95% 6370m; 마커 최대 오차 6448m |
| sub/faithful/clean/wired | FAIL | 0 | 0 | - | - | 5364/5423 | 1738/2000 | 100 | 마커 오차 95% 5364m; 마커 최대 오차 5423m |
| sub/faithful/noisy | PASS | 0 | 0 | - | - | 599/984 | 1738/2000 | 100 |  |
| sub/faithful/noisy/off480 | PASS | 0 | 0 | - | - | 521/950 | 1000/1410 | 100 |  |
| sub/faithful/noisy/wired | PASS | 0 | 0 | - | - | 540/984 | 1738/2000 | 100 |  |
| sub/stay_home/clean | FAIL | 0 | 0 | - | - | 234/254 | 4000/4000 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 5 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub/strange_place/clean | FAIL | 0 | 0 | - | - | 1697/1724 | 1492/1656 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/strange_place/clean/wired | FAIL | 0 | 0 | - | - | 1697/1724 | 1492/1656 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/strange_place/noisy | FAIL | 0 | 0 | - | - | 3340/3354 | 3323/3354 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/taxi/clean | FAIL | 0 | 0 | - | - | 4661/4992 | 1566/1571 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/taxi/clean/wired | FAIL | 0 | 0 | - | - | 4661/4992 | 1566/1571 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/unknown_vehicle/clean | FAIL | 0 | 0 | - | - | 3422/4255 | 1568/1767 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/unknown_vehicle/clean/wired | FAIL | 0 | 0 | - | - | 3422/4255 | 1568/1767 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/unknown_vehicle/noisy | FAIL | 0 | 0 | - | - | 3356/4255 | 1568/1767 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/walk_along/clean | FAIL | 0 | 0 | - | - | 386/650 | 386/542 | 100 | 타지 않았는데 진행도가 승차 정류장(2) 너머 3 까지 올라감; 타지 않았는데 승차 확정됨 |
| sub/wrong_dir/clean | FAIL | 0 | 0 | - | - | 234/254 | 2700/2700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
| sub/wrong_dir/clean/wired | FAIL | 0 | 0 | - | - | 215/234 | 2700/2700 | 100 | 경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음 |
