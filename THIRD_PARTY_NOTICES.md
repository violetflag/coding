# 가져다 쓴 코드와 출처

이 프로젝트는 아래 저장소의 코드를 가져와 고쳐 씁니다. 모두 MIT 라이선스이며, 라이선스 전문은 `third_party/`에 있습니다.

| 저장소 | 기준 커밋 | 쓰는 곳 | 고친 내용 |
|---|---|---|---|
| [Leonxlnx/procedural-fire](https://github.com/Leonxlnx/procedural-fire) | `95ab0a9` (2026-10-25) | `src/fire/vendor/` (연소 시뮬레이션, 볼륨 렌더러, 불티, 흑체 LUT, 불 소리 엔진) | `[nanro]` 주석이 붙은 곳: 오프라인 누적기(tier2 텍스처 형식)를 선택 사항으로, 화구(벽난로 내부 벽돌 상자) 추가 |
| [Leonxlnx/room-at-dawn](https://github.com/Leonxlnx/room-at-dawn) | `aab8be2` (2026-11-12) | `src/player/player.js`의 걷기·충돌·해상도 자동 조절 (`src/game/game.js`를 바탕으로 다시 작성), part 구조 | three.js WebGPU 렌더러에 맞게 재작성, 상호작용과 앉기 상태 추가 |
| [Leonxlnx/earshot](https://github.com/Leonxlnx/earshot) | `7a7f7c5` (2026-11-20) | 6단계에서 효과음 파일을 만드는 개발 도구로 사용 (코드를 포함하지 않음) | - |

그 밖의 의존성: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT).
