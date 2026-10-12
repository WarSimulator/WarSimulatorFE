export type Ver0TargetType = 'point' | 'unit' | 'graphic';

export type Ver0NumericInput = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
};

export type Ver0ActionInputDefinition = {
  actionId: string;
  originLabel: string;
  targetLabel: string;
  targetModes: Ver0TargetType[];
  pathAllowed?: boolean;
  movesUnit?: boolean;
  textLabel?: string;
  numericInputs: Ver0NumericInput[];
};

const numeric = (key: string, label: string, min: number, max: number, defaultValue: number, unit: string, step = 1): Ver0NumericInput =>
  ({ key, label, min, max, defaultValue, unit, step });
const intensity = numeric('intensity', '효과 강도', 10, 100, 70, '%');
const radius = numeric('radiusMeters', '반경', 50, 20_000, 1_000, 'm', 50);
const bearing = numeric('bearing', '방향', 0, 359, 35, '°');
const fov = numeric('fovDegrees', '관측 시야각', 5, 360, 70, '°');
const range = numeric('rangeMeters', '관측 거리', 50, 50_000, 4_000, 'm', 50);

/** Every ver0 action declares the spatial and semantic values needed to execute it. */
export const ver0ActionInputs: Record<string, Ver0ActionInputDefinition> = {
  move: { actionId: 'move', originLabel: '출발 위치', targetLabel: '목적지', targetModes: ['point'], pathAllowed: true, movesUnit: true, numericInputs: [] },
  observe: { actionId: 'observe', originLabel: '관측 위치', targetLabel: '관측 중심/대상', targetModes: ['point', 'unit', 'graphic'], numericInputs: [bearing, fov, range] },
  engage: { actionId: 'engage', originLabel: '교전 위치', targetLabel: '공격 표적', targetModes: ['unit', 'point', 'graphic'], numericInputs: [intensity] },
  continue: { actionId: 'continue', originLabel: '교전 위치', targetLabel: '교전 지속 표적', targetModes: ['unit', 'point', 'graphic'], numericInputs: [intensity] },
  security: { actionId: 'security', originLabel: '경계 부대 위치', targetLabel: '보호 중심', targetModes: ['point', 'unit', 'graphic'], numericInputs: [radius] },
  presence: { actionId: 'presence', originLabel: '진입 위치', targetLabel: '순찰 지역/경로', targetModes: ['graphic', 'point'], pathAllowed: true, movesUnit: true, numericInputs: [radius] },
  confirm: { actionId: 'confirm', originLabel: '확인 주체 위치', targetLabel: '확인 대상', targetModes: ['unit', 'point', 'graphic'], textLabel: '확인할 사실/기준', numericInputs: [] },
  control: { actionId: 'control', originLabel: '확인 부대 위치', targetLabel: '통제 확인 지역', targetModes: ['graphic', 'point'], textLabel: '통제 확인 기준', numericInputs: [] },
  construct: { actionId: 'construct', originLabel: '작업 부대 위치', targetLabel: '구축 위치/지역', targetModes: ['point', 'graphic'], textLabel: '구축물/작업 지시', numericInputs: [] },
  adapt: { actionId: 'adapt', originLabel: '지휘 위치', targetLabel: '계획 전환 적용 지점', targetModes: ['point', 'graphic'], textLabel: '변화 사유와 대안 계획', numericInputs: [] },
  decide: { actionId: 'decide', originLabel: '판단 주체 위치', targetLabel: '결정 적용 대상/지점', targetModes: ['point', 'unit', 'graphic'], textLabel: '선택한 방안과 판단 근거', numericInputs: [] },
  orient: { actionId: 'orient', originLabel: '부대 위치', targetLabel: '지향 위치', targetModes: ['point', 'unit'], numericInputs: [bearing] },
  adjust: { actionId: 'adjust', originLabel: '현재 위치', targetLabel: '조정된 목적지', targetModes: ['point', 'graphic'], pathAllowed: true, movesUnit: true, textLabel: '경로 조정 사유', numericInputs: [] },
  demonstrate: { actionId: 'demonstrate', originLabel: '시위 시작 위치', targetLabel: '노출/이탈 지역', targetModes: ['point', 'graphic'], pathAllowed: true, movesUnit: true, numericInputs: [intensity] },
  integrate: { actionId: 'integrate', originLabel: '주 행동 위치', targetLabel: '동기화 지점/대상', targetModes: ['point', 'unit', 'graphic'], textLabel: '통합할 지원 행동', numericInputs: [] },
  contain: { actionId: 'contain', originLabel: '봉쇄 부대 위치', targetLabel: '봉쇄 대상/지역', targetModes: ['unit', 'graphic', 'point'], numericInputs: [radius] },
  block: { actionId: 'block', originLabel: '차단 부대 위치', targetLabel: '차단선/접근로', targetModes: ['graphic', 'point'], textLabel: '차단 방향과 조건', numericInputs: [bearing] },
  report: { actionId: 'report', originLabel: '보고 위치', targetLabel: '보고 수신 부대', targetModes: ['unit'], textLabel: '보고 내용', numericInputs: [] },
  identify: { actionId: 'identify', originLabel: '식별 주체 위치', targetLabel: '식별 대상', targetModes: ['unit', 'point', 'graphic'], textLabel: '식별 기준/정보', numericInputs: [] },
  fight: { actionId: 'fight', originLabel: '전투 위치', targetLabel: '적/전투 지역', targetModes: ['unit', 'graphic', 'point'], numericInputs: [intensity] },
  withdraw: { actionId: 'withdraw', originLabel: '이탈 시작 위치', targetLabel: '최종 집결지', targetModes: ['point', 'graphic'], pathAllowed: true, movesUnit: true, numericInputs: [] },
  avoid: { actionId: 'avoid', originLabel: '현재 위치', targetLabel: '회피할 교전 지역/대상', targetModes: ['unit', 'graphic', 'point'], textLabel: '회피 조건', numericInputs: [radius] },
  disarm: { actionId: 'disarm', originLabel: '작업 부대 위치', targetLabel: '분해/무장 해제 대상', targetModes: ['point', 'graphic'], textLabel: '안전 조치/작업 지시', numericInputs: [radius] },
  ambush: { actionId: 'ambush', originLabel: '매복 부대 위치', targetLabel: '타격 구역/진입 대상', targetModes: ['graphic', 'point', 'unit'], pathAllowed: true, textLabel: '발동 조건과 이탈 지시', numericInputs: [] },
  breach: { actionId: 'breach', originLabel: '작업 부대 위치', targetLabel: '돌파 지점/장애물', targetModes: ['point', 'graphic'], pathAllowed: true, movesUnit: true, textLabel: '돌파 방향과 통로 유지 지시', numericInputs: [bearing] },
  clear: { actionId: 'clear', originLabel: '소탕 시작 위치', targetLabel: '소탕 지역', targetModes: ['graphic', 'point'], pathAllowed: true, movesUnit: true, textLabel: '수색 순서/완료 조건', numericInputs: [] },
  seize: { actionId: 'seize', originLabel: '접근 시작 위치', targetLabel: '점령 목표/지역', targetModes: ['graphic', 'point'], pathAllowed: true, movesUnit: true, textLabel: '점령 후 통제 지시', numericInputs: [] },
  disrupt: { actionId: 'disrupt', originLabel: '교란 주체 위치', targetLabel: '교란 대상/영향 지역', targetModes: ['unit', 'graphic', 'point'], numericInputs: [intensity, radius] },
};

export function getVer0ActionInput(actionId?: string): Ver0ActionInputDefinition {
  return ver0ActionInputs[actionId ?? ''] ?? {
    actionId: actionId ?? '', originLabel: '실행 위치', targetLabel: '목표 위치', targetModes: ['point'], numericInputs: [],
  };
}
