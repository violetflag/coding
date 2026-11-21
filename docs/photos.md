# 단계별 사진 (Arc B390 실제 화면)

Edge 창 모드 1920×1080, 기본 설정(프리셋 "균형", 격자 96×120×60). 각 단계의 커밋을 따로 받아 같은 시점에서 찍었다. 모든 시점에서 60 fps, 콘솔 오류 없음. 촬영 시각은 밤(PC 시계 기준 새벽 1~2시)이다.

| 단계 | 커밋 | 시작 위치 | 불 보기 | 책장 쪽 | 앉은 시점 |
|---|---|---|---|---|---|
| 1단계 마무리 (설정창) | 4027c01 | ![](phase1/final/2-start.png) | ![](phase1/final/3-fire.png) | ![](phase1/final/4-shelf.png) | ![](phase1/final/5-seated.png) |
| 화실 벽돌 무늬 | 0dfb0c6 | ![](phase2/photos-brick/2-start.png) | ![](phase2/photos-brick/3-fire.png) | ![](phase2/photos-brick/4-shelf.png) | ![](phase2/photos-brick/5-seated.png) |
| 3단계 재질과 가구 | c196aa2 | ![](phase3/photos/2-start.png) | ![](phase3/photos/3-fire.png) | ![](phase3/photos/4-shelf.png) | ![](phase3/photos/5-seated.png) |
| 4단계 해·달, 계절·날씨 | 30294c8 | ![](phase4/photos/2-start.png) | ![](phase4/photos/3-fire.png) | ![](phase4/photos/4-shelf.png) | ![](phase4/photos/5-seated.png) |

각 폴더에는 시작 화면(1-title), 창 쪽(4b-window), 책 펼치기(6-reading), 설정창(7, 8) 사진도 있다.

## 관찰

- **화실 벽돌 (0dfb0c6)**: 흐릿하던 벽돌에 줄눈이 또렷하게 보이고 벽돌마다 색이 조금씩 다르다.
- **3단계 (c196aa2)**: 회색 상자가 널빤지 벽과 천장, 자연석 벽난로, 가죽 안락의자, 무늬 러그, 주전자, 장작 더미, 벽난로 위 그림과 시계, 커튼으로 바뀌었다. 깨진 면이나 빈 재질은 보이지 않는다.
- **4단계 (30294c8)**: 창밖에 별이 보이고 창턱과 벽난로 선반의 초에 불이 켜졌다. 밤이라 해와 낮 조명은 이 사진으로 확인되지 않는다.
- **공통**: 벽난로 오른쪽과 방의 오른쪽 절반이 거의 검정으로 나온다. 불 보기 시점에서 화면 오른쪽 3분의 1이 비어 보인다.

## 4단계 보충: 시각, 계절, 날씨 (커밋 f9374dc에서 촬영)

주소 옵션으로 시각을 바꿔 찍었다. 모두 60 fps, 콘솔 오류 없음. 계절을 지정하지 않으면 PC 날짜(11월)에 따라 가을이다.

| 장면 | 주소 옵션 | 시작 위치 | 창 쪽 | 불 보기 |
|---|---|---|---|---|
| 낮 | `?time=13` | ![](phase4/photos-day/noon-start.png) | ![](phase4/photos-day/noon-window.png) | ![](phase4/photos-day/noon-fire.png) |
| 해질녘 | `?time=17.2` | ![](phase4/photos-day/dusk-start.png) | ![](phase4/photos-day/dusk-window.png) | ![](phase4/photos-day/dusk-fire.png) |
| 아침 | `?time=7.3` | ![](phase4/photos-day/morning-start.png) | ![](phase4/photos-day/morning-window.png) | ![](phase4/photos-day/morning-fire.png) |
| 겨울 낮 | `?time=13&season=winter` | ![](phase4/photos-day/winter-noon-start.png) | ![](phase4/photos-day/winter-noon-window.png) | ![](phase4/photos-day/winter-noon-fire.png) |
| 밤, 거센 눈 | `?time=22&weather=heavy` | ![](phase4/photos-day/night-heavy-snow-start.png) | ![](phase4/photos-day/night-heavy-snow-window.png) | ![](phase4/photos-day/night-heavy-snow-fire.png) |

- **낮**: 창밖에 가을 나무(붉은색, 주황색)와 침엽수, 들판이 보인다. 실내가 고르게 밝아져 천장 들보, 널빤지 벽, 돌 벽난로가 모두 보이고 방 오른쪽 벽도 보인다. 밝기는 창이 하나인 통나무집으로 자연스럽다.
- **겨울 낮**: 창밖이 흰 눈과 흰 나무로 바뀐다. 실내 밝기는 가을 낮과 비슷하다.
- **해질녘과 아침**: 창밖이 어두운 주황빛이고 실내는 밤에 가깝게 어둡다. 두 장면이 거의 똑같이 보인다. 방 오른쪽은 다시 거의 검정이다.
- **밤, 거센 눈**: 창밖에 흰 점이 흩어져 보인다. 정지 사진으로는 눈인지 별인지 구분되지 않는다.

## 5단계: ebook 리더 (커밋 f9374dc)

시험용 책은 직접 만든 한국어 TXT(6장, 100쪽)를 페이지 안에서 넣었다(저장소에는 넣지 않음).

| 사진 | 내용 |
|---|---|
| ![](phase5/photos/1-open.png) | 책 펼침 (1~2쪽) |
| ![](phase5/photos/3-highlight.png) | 밑줄: 노랑 형광, 연필 밑줄과 여백 메모, 파랑 형광, 책갈피 접힘 |
| ![](phase5/photos/6-flip.png) | 장 넘기는 중간 |
| ![](phase5/photos/4-old-book.png) | 헌 책 |
| ![](phase5/photos/5-menu-type.png) | 옆 메뉴: 글자·종이 |
| ![](phase5/photos/5-menu-lib.png) | 옆 메뉴: 서재 |
| ![](phase5/photos/5-menu-toc.png) | 옆 메뉴: 목차 |

- **글자 크기**: 1080p에서 본문 한 글자가 약 22픽셀로 읽을 만하다. 글자 가장자리는 조금 부드럽게(흐리게) 나온다.
- **성능**: 책 없이 앉기만 하면 60.0 fps, GPU 60%. 책을 펼치면 60 fps는 유지되지만 GPU가 75~76%로 오른다. 10초 측정 세 번 중 두 번에서 83ms짜리 끊김이 한 번씩 있었다.
- **종이 밝기**: 0.4초 간격 3장의 같은 영역 평균 밝기가 197.4, 197.4, 192.6(0~255)으로 약 2.5% 흔들린다. 불빛을 따라 은은하게 변하는 정도다.

## 텍스처 적용 (커밋 bfd472f, ambientCG 사진 텍스처)

낮(`?time=13`), 밤(`?time=22`), 겨울 낮(`?time=13&season=winter`), 비교용 텍스처 끔(`?time=13&notex`). 모두 60 fps, 콘솔 오류 없음. 텍스처 20장을 읽는 데 준비 뒤 약 0.3~0.5초가 더 걸린다(첫 화면 1.2~1.5초, 텍스처까지 1.5~2.0초).

| 장면 | 시작 위치 | 벽난로 정면 | 책장 쪽 | 앉은 시점 |
|---|---|---|---|---|
| 낮 | ![](textures/photos/day-start.png) | ![](textures/photos/day-fireplace.png) | ![](textures/photos/day-shelf.png) | ![](textures/photos/day-seated.png) |
| 밤 | ![](textures/photos/night-start.png) | ![](textures/photos/night-fireplace.png) | ![](textures/photos/night-shelf.png) | ![](textures/photos/night-seated.png) |
| 겨울 낮 | ![](textures/photos/winter-day-start.png) | ![](textures/photos/winter-day-fireplace.png) | ![](textures/photos/winter-day-shelf.png) | ![](textures/photos/winter-day-seated.png) |
| 낮, 텍스처 끔 | ![](textures/photos/day-notex-start.png) | ![](textures/photos/day-notex-fireplace.png) | ![](textures/photos/day-notex-shelf.png) | ![](textures/photos/day-notex-seated.png) |

이 사진들은 찍기만 하고 재질별 검토는 아직 하지 않았다.

## 6·7단계 (커밋 ffc7e82, 일부만 촬영)

`docs/phase6-7/photos/`에 설정 탭 5장(소리, 방, 난롯가, 조작·접근성, 불), 장작 넣기 전후, 촛불 2개 켜고 끄기, 차 마시기 전후, 주전자, 책장에 꽂힌 책, 꺼낸 책, 앉아서 손에 든 책, 펼친 책 사진이 있다. 인용구 카드와 잠들기 모드는 아직 찍지 못했다.

## 화실 벽돌, 장작, 소품 텍스처 (커밋 498dade)

화실 안쪽 벽돌이 사진 텍스처(Bricks097)로 바뀌고 장작 더미에 나무껍질과 나이테 사진이 들어간 뒤의 가까이 사진. 밤(`?time=22`), 낮(`?time=13`), 불 켜진 상태, 60 fps, 콘솔 오류 없음.

| | 화실 가까이 | 벽난로 | 장작 더미 쪽 | 주전자와 바구니 | 앉은 시점 |
|---|---|---|---|---|---|
| 밤 | ![](textures/photos2/night-firebox.png) | ![](textures/photos2/night-fireplace.png) | ![](textures/photos2/night-woodpile.png) | ![](textures/photos2/night-kettle.png) | ![](textures/photos2/night-seated.png) |
| 낮 | ![](textures/photos2/day-firebox.png) | ![](textures/photos2/day-fireplace.png) | ![](textures/photos2/day-woodpile.png) | ![](textures/photos2/day-kettle.png) | ![](textures/photos2/day-seated.png) |

- **화실 벽돌**: 사진 벽돌로 바뀐 것이 보인다. 뒷벽은 가로로 벽돌 5~6장, 세로로 5~6줄이 들어가 벽돌 한 장이 실제보다 크게 보인다(약 12×10cm). 옆벽은 벽돌이 거의 정사각형 바둑판처럼 보여 늘어난 것 같다. 불빛을 받아 밝은 주황색으로 고르게 빛나고 그을음은 보이지 않는다. 바깥의 회색 돌과 만나는 모서리는 색과 밝기가 갑자기 바뀐다. 화실 바닥은 황록색으로 보인다.
- **장작 더미**: 옆면에 세로 골이 있는 나무껍질, 끝면에 나이테 사진이 보인다. 껍질 색이 붉은 주황에 가깝다.
- **주전자**: 붉은 구릿빛에 반사가 매끈하다. 무늬는 구분되지 않는다.
- **바구니**: 고운 짜임 무늬가 보인다.
- 앞서 올린 `textures/photos/day-shelf.png`, `day-seated.png`에는 시작 화면이 겹쳐 찍혀 있다(촬영 문제). 이 절의 사진에는 겹치지 않는다.

## 6·7단계 (커밋 ffc7e82, 498dade에서 다시 촬영)

| 사진 | 내용 |
|---|---|
| ![](phase6-7/photos/settings-sound.png) | 설정: 소리 |
| ![](phase6-7/photos/settings-room.png) | 설정: 방 (시간·날씨) |
| ![](phase6-7/photos/settings-hearth.png) | 설정: 난롯가 |
| ![](phase6-7/photos/settings-access.png) | 설정: 조작·접근성 |
| ![](phase6-7/photos/woodpile-after.png) | 장작 넣기 직후 (알림: 25분 타이머) |
| ![](phase6-7/photos/fire-after-log.png) | 장작을 넣고 9초 뒤의 불 |
| ![](phase6-7/photos/candle0-a.png) ![](phase6-7/photos/candle0-b.png) | 벽난로 선반 촛불 켜짐 → 꺼짐 |
| ![](phase6-7/photos/candle1-a.png) ![](phase6-7/photos/candle1-b.png) | 협탁 촛불 켜짐 → 꺼짐 |
| ![](phase6-7/photos/tea-before.png) ![](phase6-7/photos/tea-after.png) | 차 마시기 전 → 세 모금 뒤 |
| ![](phase6-7/photos/kettle.png) | 주전자로 채우기 |
| ![](phase6-7/photos/library-spines.png) | 책장에 꽂힌 내 책 3권 |
| ![](phase6-7/photos/book-picked-standing.png) | 책을 꺼낸 뒤 |
| ![](phase6-7/photos/book-in-hand-seated.png) | 앉아서 손에 든 책 |
| ![](phase6-7/photos/book-open.png) | 펼친 책 |
| ![](phase6-7/photos/quote-card.png) | 저장된 인용구 카드 |
| ![](phase6-7/photos/sleep-0-before.png) ![](phase6-7/photos/sleep-1-half.png) ![](phase6-7/photos/sleep-2-done.png) ![](phase6-7/photos/sleep-3-cancelled.png) | 잠들기 모드(시험용 0.5분): 시작 전 → 15초 → 35초 → 끈 뒤 |

## 성능 (498dade, 밤, 각 3회)

| 조건 | fps (3회) | GPU 3D (3회) | 평균 GPU |
|---|---|---|---|
| 앉은 시점, 텍스처 켬 | 60.0 / 60.0 / 60.0 | 56% / 59% / 61% | 59% |
| 앉은 시점, 텍스처 끔 | 58.8 / 60.0 / 60.0 | 69% / 58% / 57% | 61% |
| 책 펼침, 읽는 동안 절전 켬 | 60.0 / 60.0 / 60.0 | 63% / 63% / 64% | 63% |
| 책 펼침, 읽는 동안 절전 끔 | 60.0 / 59.4 / 60.0 | 74% / 69% / 69% | 71% |

첫 화면은 텍스처 켬 1.4초(텍스처까지 1.9초), 끔 1.4초(1.7초).
