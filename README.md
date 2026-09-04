# ATLAS DEFENSE Frontend

METT-TC 기반 AI Planning 및 전술 시뮬레이션 시스템을 위한 웹 프론트엔드 프로토타입입니다.

현재 단계의 목표는 백엔드나 실제 시뮬레이션 엔진 구현이 아니라, ATLAS DEFENSE의 핵심 사용자 흐름을 브라우저에서 확인할 수 있는 프론트엔드 UI로 구성하는 것입니다.

## 주요 화면

### Workspace Dashboard

- 최근 작전 정보 확인
- 마지막 작업 이어가기
- Recent Operations 목록 확인

### METT-TC Archives

- METT-TC 문서 목록 확인
- 문서 상태 및 진행 단계 확인
- 새 METT-TC 문서 생성 및 편집 화면 진입

### METT-TC Analysis / Editor

- Mission
- Enemy
- Terrain & Weather
- Troops & Support
- Time Available
- Civil Considerations

각 항목은 직접 편집할 수 있으며, 현재는 브라우저 LocalStorage 기반으로 저장됩니다.

### Simulation Setup

- METT-TC 문서 선택
- 하나의 METT-TC 문서에 여러 Deployment 탭 연결
- Chrome 스타일 Deployment 탭 생성, 복제, 전환, 닫기
- Deployment Preview 및 배치 요약 확인
- Simulation 실행 진입

### Deployment Editor

- MapLibre 기반 2D 지도 편집
- milsymbol 기반 NATO 군대부호 배치
- Friendly / Enemy / Objective 배치
- Unit Properties 편집
- Route, Axis, Phase Line, Boundary, Area 전술도형 작성
- LocalStorage 기반 Deployment 저장 및 복원

### Simulator Mode

- 전체 화면 시뮬레이터 화면
- Unit 선택 및 상세 정보 표시
- Timeline / Playback Mock UI
- ESC 또는 Exit 버튼으로 Simulation Setup 복귀

## 기술 스택

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- MapLibre GL JS
- milsymbol
- Mapbox GL Draw

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 Vite가 출력하는 로컬 주소로 접속합니다.

예:

```text
http://localhost:5173
```

## 빌드

```bash
npm run build
```

빌드 결과물은 `dist/`에 생성됩니다.

## 프로젝트 구조

```text
src/
├─ components/
│  ├─ layout/
│  ├─ mett/
│  └─ workspace/
│
├─ features/
│  └─ simulation/
│     ├─ components/
│     ├─ lib/
│     └─ pages/
│
├─ lib/
├─ mocks/
├─ pages/
├─ router/
├─ types/
└─ styles.css
```

## Mock Data

현재 백엔드는 연결되어 있지 않으며, UI 검증을 위해 Mock Data와 LocalStorage를 사용합니다.

주요 Mock Data 위치:

```text
src/mocks/
├─ mettDocuments.ts
├─ operations.ts
├─ scenarios.ts
├─ simulations.ts
├─ timeline.ts
└─ units.ts
```

## LocalStorage 저장소

현재 Deployment Setup은 다음 key로 저장됩니다.

```text
atlas-defense.deployment-setups
```

METT-TC 문서 편집 데이터 역시 프론트엔드 저장소를 통해 유지됩니다.

## 향후 백엔드 연결 지점

향후 구조는 다음 흐름을 목표로 합니다.

```text
React Frontend
        ↓
REST API
        ↓
FastAPI
        ↓
AI Planning / Simulation Engine
```

백엔드 연결 시 우선 교체할 영역:

- `src/lib/mettStorage.ts`
- `src/features/simulation/lib/deploymentStorage.ts`
- `src/features/simulation/lib/setupStorage.ts`
- `src/mocks/` 하위 Mock Data

## 현재 구현하지 않은 범위

현재 프론트엔드 프로토타입에서는 다음 기능을 구현하지 않습니다.

- FastAPI Backend
- Database
- Authentication
- AI Planning
- COA Generation
- Atomic Action Parser
- Combat Simulation Engine
- Combat Adjudication
- Monte Carlo Simulation
- WebSocket
- CesiumJS / CZML

## 개발 기준

ATLAS DEFENSE는 다음 디자인 방향을 따릅니다.

- Dark Tactical UI
- Orange Accent
- Thin Border
- Monospace Metadata
- 좌측 Global Sidebar
- 밀리터리 리서치 / 전술 소프트웨어 톤

과도한 애니메이션, 장식성 Glow, 일반 SaaS 스타일의 밝은 대시보드 디자인은 지양합니다.

## 전체 군대부호 팔레트

Symbol Palette는 milsymbol 3.0.4와 같은 제작자의 표준 카탈로그를 기반으로
MIL-STD-2525E 및 APP-6D의 렌더링 가능한 기본 심볼 2,647개 항목을 제공합니다.
표준 사이에 동일한 종류가 반복될 수 있습니다. 진영·제대 조합은 항목 수에 포함하지 않습니다.
구버전과 기존 14개 빠른 선택 메뉴는 제거했습니다. 이전에 저장한 배치의 심볼 코드는 복원 시 유지됩니다.

- 이름/SIDC 검색, 표준·분류 선택, 24개 단위 페이지 이동
- 팔레트에서 드래그하거나 심볼을 선택하고 지도 클릭으로 배치
- 아군/적군 전환. 제대 표시는 군부대와 탱크 등 지상 장비에 적용
- Echelon은 공격대, 분대/조, 반, 소대, 중대, 대대, 연대, 여단, 사단, 군단, 야전군, 군집단/집단군, 전역/전구의 13단계 지원. 팔레트와 배치된 부호의 속성 패널에서 기호·영문·한글 이름으로 선택하며, 지도와 저장된 SIDC에 반영
- 심볼 표준·코드·이름은 배치 저장/복제/복원 시 유지

코드만 있고 milsymbol이 실제로 그리지 못하는 항목(다중점 도형 등)은 제외합니다.
제외된 항목은 `scripts/symbol-catalog-omissions.json`에 기록됩니다.
이는 모든 표준 도형 또는 보조 수정자의 모든 조합을 지원한다는 뜻은 아닙니다.
기존 Route/Axis/Phase Line/Boundary/Area/Freehand 도형 도구는 그대로 사용합니다.
Atomic Action 실행·시각화는 이 팔레트 카탈로그와 별개입니다.

카탈로그를 갱신하고 검증하려면:

```bash
npm run generate:symbols
npm run test:symbols
npm run build
```

카탈로그 패키지는 개발용 의존성이고, 화면은 생성한 JSON을 로컬에서 읽습니다.
외부 심볼 API는 호출하지 않습니다. 출처/라이선스는
`public/symbol-catalog-LICENSE.txt`에 포함되어 있습니다.

## DRAW 전술 과업 도형

팔레트 필터 아래 `DRAW + 전술 과업` 버튼에서 MIL-STD-2525E 36개, NATO APP-6D 39개 도형을 선택합니다.
심볼 / DRAW + 전술 과업 버튼으로 목록을 전환합니다. 기본 DRAW 6종과 전술 과업은 모양 미리보기 카드로 표시합니다. 상단 검색·표준·카테고리로 과업을 찾고, 카드를 누른 뒤 미리보기 번호 순서대로 지도에 클릭합니다. 심볼 목록의 검색과 카테고리는 전환 후에도 유지됩니다.
고정 점 수 도형은 마지막 점에서 자동 완성됩니다. 가변 점 수 도형은 `완료` 또는 Enter로 끝냅니다.
`마지막 점 취소`/Backspace로 마지막 점을 취소하고, Esc로 그리기를 취소합니다.
도형을 선택한 뒤 `EDIT MIL TASK`로 기준점을 옮길 수 있습니다. 기준점, SIDC, 진영은 배치와 함께 저장·복원·복제됩니다.
지도 확대/축소 시 도형을 재계산하며, 배치 미리보기에도 표시합니다.

렌더러는 `@armyc2.c5isr.renderer/mil-sym-ts-web`이며 필요한 시점에 로드합니다. 외부 도형 API를 호출하지 않습니다.
Tasks 중 단일점 부호/분류 항목은 DRAW 대상에서 제외합니다. Infiltration/Infiltrate의 두 표준 항목은 설치된 렌더러 내부 오류로 제외하며
`scripts/tactical-task-omissions.json`에 기록합니다. 이 기능은 도형 표시이며 Atomic Action을 실행하지 않습니다.

```bash
npm run generate:tasks
npm run test:tasks
```


### 도형 및 군대부호 회전

군대부호·선·영역·전술 과업 도형을 더블클릭하면 위에 회전 핸들이 나타납니다.
핸들을 드래그하면 중심을 기준으로 회전하고, 놓으면 결과가 적용되며 핸들이 사라집니다.
Shift를 누르면 15도 단위로 회전합니다. 빈 지도 클릭 또는 Esc로 핸들을 닫습니다.
드래그 중 Esc는 미적용 회전을 취소합니다. 회전은 기준점 좌표에 반영되어 저장·복원되며, UNDO 한 번으로 되돌립니다.
군대부호는 위치를 유지하며 기호만 회전합니다. 각도는 `symbolRotation`에 저장되어 배치 미리보기에도 반영되며, 명칭은 수평으로 표시됩니다. 기존 배치의 기본 각도는 0도입니다.
검증: `npm run test:rotation`.
