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
