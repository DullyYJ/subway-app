# 쇼핑 상품 200개 채우기 — 수집 메모 (2026-10-29, s327 중단)

- 목표: 쇼핑 7개 카테고리를 각 200개로(식사는 중복 정리로 줄이고, 나머지는 새 상품으로 채움). 기존 상품과 겹치면 안 됨(이미지 경로·이름 비교). 성별 있는 상품(패션·뷰티·건강)은 남 30 : 여 70.
- 후보 검색어: `cands.json`(카테고리별 약 720개) · 성별 판정 규칙: `gender.js`.
- 쿠팡 파트너스 웹(로그인 필요) 내부 요청 — 브라우저 페이지 안에서 `fetch`(헤더에 페이지가 쓰는 `x-token` 필요):
  - 검색: `POST /api/v1/search` `{page:{pageNumber:0,size:12},filter:"검색어",deliveryTypes:[]}` → `data.products[]`(productId·itemId·vendorItemId·title·ratingCount·ratingAverage·rawImage·image·salesPrice…)
  - 링크 생성: `POST /api/v1/banner/iframe/url` `{product:{type:"PRODUCT",itemId,productId,vendorItemId,image,title,originPrice,salesPrice,travel:"false",discountRate:null}}` → `data.shortUrl`(link.coupang.com/a/…)
- ⚠ **분당 50회 제한**: 넘으면 429 `분당 50회를 초과했습니다 … 총 3회 초과시 파트너스 이용이 제한됩니다`. 이번에 검색 약 200건을 0.3초 간격으로 돌리다 **1회 초과**가 기록됐다(즉시 중단). 다음에 이어서 할 때는 **분당 15회 이하**(요청 사이 4초 이상)로 하고, 429 가 나오면 재시도 없이 바로 멈출 것. 공식 방법은 파트너스 Open API(키 필요, 딥링크 변환·검색·카테고리 베스트).
- 선별 규칙(계획): 검색어마다 상위 10개 중 평점 4.0 이상 · 리뷰 수 최대 상품 → 기존 상품 이미지/이름과 겹치면 제외 → 카테고리 안에서 리뷰 수 순으로 채우되 성별 쿼터(패션 +31 = 남7·여24, 뷰티 +112 = 남25·여55·공용32, 건강 +140 = 남15·여35·공용90, 음료 +77 · 생활 +39 · 완구 +149 공용).
- 식사 정리 계획: 같은 이름이 최대 8번 반복(261개 중 이름 108종) → 반복이 많은 이름부터 61개 덜어 200개(슬롯 WEEKDAY/WEEKEND 에서도 같이 뺀다).
