import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/layout/Icon';
import { buildFinalSimulation, saveFinalSimulation } from '../lib/finalSimulation';

type FileKey = 'offensive' | 'defensive' | 'withdrawal' | 'deployment';
type SelectedFiles = Partial<Record<FileKey, File>>;

const fields: { key: FileKey; title: string; description: string; icon: string; iconClass?: string; iconFilled?: boolean; optional?: boolean }[] = [
  { key: 'offensive', title: 'Blue-Force Plan', description: 'TFD Blue Force 실행 계획 JSON · temporal_plan.steps', icon: 'person', iconClass: 'text-blue-400', iconFilled: true },
  { key: 'defensive', title: 'Red-Force Plan', description: 'TFD Red Force 실행 계획 JSON · temporal_plan.steps', icon: 'person', iconClass: 'text-red-400', iconFilled: true },
  { key: 'withdrawal', title: '후퇴 계획', description: '이번 검증에서는 비워두어도 실행됩니다.', icon: 'keyboard_return', optional: true },
  { key: 'deployment', title: '유닛 배치 데이터', description: '유닛 SIDC·좌표와 목표·통제선 geometry JSON', icon: 'map' },
];

async function readJson(file: File) {
  try { return JSON.parse(await file.text()) as unknown; } catch { throw new Error(`${file.name} 파일이 올바른 JSON이 아닙니다.`); }
}

export function SimulationFinalPage({ mapMode = '2d' }: { mapMode?: '2d' | '3d' }) {
  const navigate = useNavigate();
  const [files, setFiles] = useState<SelectedFiles>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ready = Boolean(files.offensive && files.defensive && files.deployment);

  const start = async () => {
    if (!files.offensive || !files.defensive || !files.deployment) return;
    const analysisWindow = window.open('about:blank', '_blank', 'popup=yes,width=1400,height=900');
    if (!analysisWindow) {
      setError('상태 분석 화면을 열 수 없습니다. 이 사이트의 팝업을 허용한 뒤 다시 실행해 주세요.');
      return;
    }
    analysisWindow.document.title = 'ATLAS 상태 분석 준비 중';
    analysisWindow.document.body.innerHTML = '<p style="font:16px sans-serif;padding:24px">시뮬레이션 상태 분석 화면을 준비하고 있습니다…</p>';
    setLoading(true); setError('');
    try {
      const [offensive, defensive, withdrawal, deployment] = await Promise.all([
        readJson(files.offensive), readJson(files.defensive), files.withdrawal ? readJson(files.withdrawal) : undefined, readJson(files.deployment),
      ]);
      const build = await buildFinalSimulation({ offensive, defensive, withdrawal, deployment });
      saveFinalSimulation(build);
      analysisWindow.location.href = new URL(`/simulations/${build.simulationId}/run?view=analysis`, window.location.origin).href;
      navigate(`/simulations/${build.simulationId}/run?view=tactical${mapMode === '3d' ? '&map=3d' : ''}`);
    } catch (caught) {
      analysisWindow.close();
      setError(caught instanceof Error ? caught.message : '파일을 처리하지 못했습니다.');
      setLoading(false);
    }
  };

  return <div className="mx-auto flex h-full max-w-[1440px] flex-col gap-6 overflow-y-auto p-container-padding">
    <header className="border-b border-outline-variant pb-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded border border-secondary/40 bg-secondary/10"><Icon name="play_circle" className="text-[28px] text-secondary" filled /></span>
        <div><h2 className="font-display-lg text-display-lg tracking-tight text-primary">{mapMode === '3d' ? 'MIL-SIMULATOR 3D' : 'MIL-SIMULATOR FINAL'}</h2><p className="mt-1 text-sm text-on-surface-variant">AI Planning 팀의 계획과 유닛 배치 파일을 {mapMode === '3d' ? 'Google 3D 전술 지도에서' : '하나의 시뮬레이션으로'} 실행합니다.</p></div>
      </div>
    </header>

    <section className="rounded border border-outline-variant bg-surface-container p-5">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div><p className="font-label-caps text-xs uppercase tracking-widest text-secondary">INPUT PACKAGE</p><h3 className="mt-1 text-lg font-semibold text-on-surface">AI Planning 결과 파일</h3></div>
        <div className="rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-xs text-on-surface-variant">Blue Force + Red Force + 배치 필수 · 후퇴 선택</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {fields.map(field => <label key={field.key} className={`group relative flex min-h-[150px] cursor-pointer flex-col justify-between rounded border p-4 transition-colors ${files[field.key] ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-low hover:border-secondary/70'}`}>
          <input className="sr-only" type="file" accept=".json,.txt,application/json,text/plain" onChange={event => { const file = event.target.files?.[0]; setError(''); setFiles(current => ({ ...current, [field.key]: file })); }} />
          <div className="flex items-start justify-between gap-4"><span className="flex h-10 w-10 items-center justify-center rounded bg-surface"><Icon name={field.icon} className={field.iconClass ?? (files[field.key] ? 'text-primary' : 'text-on-surface-variant')} filled={field.iconFilled} /></span><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${field.optional ? 'bg-surface-variant text-on-surface-variant' : 'bg-secondary/15 text-secondary'}`}>{field.optional ? 'OPTIONAL' : 'REQUIRED'}</span></div>
          <div className="mt-4"><div className="flex items-center gap-2"><strong>{field.title}</strong>{files[field.key] && <Icon name="check_circle" className="text-[18px] text-primary" filled />}</div><p className="mt-1 text-xs text-on-surface-variant">{files[field.key]?.name ?? field.description}</p></div>
        </label>)}
      </div>
      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded border border-error/50 bg-error/10 p-3 text-sm text-error"><Icon name="error" className="shrink-0" filled /><span>{error}</span></div>}
    </section>

    <section className="flex items-center justify-between gap-6 rounded border border-outline-variant bg-surface-container-low p-5">
      <div><p className="text-sm font-semibold text-on-surface">{ready ? '실행 준비 완료' : '필수 파일을 선택해 주세요.'}</p><p className="mt-1 text-xs text-on-surface-variant">Start를 누르면 파일을 검증하고 Blue Force와 Red Force의 행동을 같은 시간축의 {mapMode === '3d' ? '3D 지도에서' : '지도에서'} 재생합니다.</p></div>
      <button disabled={!ready || loading} onClick={start} className="flex min-w-[190px] items-center justify-center gap-2 rounded bg-secondary px-7 py-3 font-label-caps text-sm font-bold text-on-secondary transition-colors enabled:hover:bg-secondary-container disabled:cursor-not-allowed disabled:opacity-35"><Icon name={loading ? 'hourglass_top' : 'play_arrow'} filled />{loading ? 'PROCESSING' : 'START SIMULATION'}</button>
    </section>
  </div>;
}
