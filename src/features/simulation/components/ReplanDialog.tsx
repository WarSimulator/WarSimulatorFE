import { useEffect, useState } from 'react';
import { Icon } from '../../../components/layout/Icon';
import type { ReplanSnapshot } from '../lib/replanSnapshot';

type Props = {
  snapshot?: ReplanSnapshot;
  onClose: () => void;
};

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9ㄱ-ㆎ가-힣_-]+/g, '-').replace(/^-+|-+$/g, '') || 'replan';
}

export function ReplanDialog({ snapshot, onClose }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const text = snapshot ? JSON.stringify(snapshot, null, 2) : '';

  useEffect(() => setCopyState('idle'), [snapshot]);
  if (!snapshot) return null;

  const { changes } = snapshot.replan;
  const { voiceTranscript, ...replanWithoutTranscript } = snapshot.replan;
  const jsonText = JSON.stringify({ ...snapshot, replan: replanWithoutTranscript }, null, 2);
  const details = [
    { label: '추가', value: changes.unitsAdded },
    { label: '수정', value: changes.unitsModified },
    { label: '삭제', value: changes.unitsRemoved },
    { label: '목표', value: changes.objectives },
    { label: 'DRAW · 전술과업', value: changes.tacticalGraphics },
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(snapshot.name)}-${snapshot.replan.savedAt.replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-labelledby="replan-title">
    <section className="flex h-[92vh] w-[96vw] max-w-[1600px] flex-col overflow-hidden rounded border border-secondary/50 bg-surface-container-high shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
        <div>
          <p className="font-label-caps text-label-caps text-secondary">REPLAN SNAPSHOT</p>
          <h2 id="replan-title" className="mt-1 text-xl font-bold text-primary">현재 전장 상태가 최종 배치로 저장되었습니다.</h2>
          <p className="mt-1 text-xs text-on-surface-variant">H+{snapshot.replan.simulationTime.toFixed(1)} · 유닛 {snapshot.units.length} · 목표 {snapshot.objectives.length} · 전술도형 {snapshot.tacticalGraphics.length}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-2 text-on-surface-variant hover:bg-surface hover:text-on-surface" aria-label="닫기"><Icon name="close" /></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface px-5 py-3">
        <div className="mr-2 flex items-baseline gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-2">
          <span className="text-xs text-on-surface-variant">총 변경사항</span>
          <strong className="font-data-mono text-2xl text-primary">{changes.total}</strong>
          <span className="text-xs text-primary">건</span>
        </div>
        {details.map(detail => <div key={detail.label} className="flex items-center gap-2 rounded border border-outline-variant px-3 py-2 text-xs">
          <span className="text-on-surface-variant">{detail.label}</span>
          <strong className="font-data-mono text-secondary">{detail.value}</strong>
        </div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-outline-variant">
        <section className="flex min-w-0 flex-col">
          <h3 className="border-b border-outline-variant bg-surface-container px-5 py-3 font-label-caps text-xs font-bold text-primary">배치 JSON</h3>
          <textarea readOnly value={jsonText} spellCheck={false} className="min-h-0 flex-1 resize-none bg-[#0b1014] p-5 font-data-mono text-[12px] leading-5 text-on-surface outline-none" aria-label="REPLAN JSON" />
        </section>
        <section className="flex min-w-0 flex-col">
          <h3 className="flex items-center gap-2 border-b border-outline-variant bg-surface-container px-5 py-3 font-label-caps text-xs font-bold text-secondary"><Icon name="mic" className="text-[17px]" />음성 명령 기록</h3>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#11171c] p-5 font-data-mono text-[13px] leading-6 text-on-surface">{voiceTranscript || '인식된 음성 명령이 없습니다.'}</pre>
        </section>
      </div>
      <footer className="flex items-center justify-between gap-4 border-t border-outline-variant p-4">
        <span className={`text-xs ${copyState === 'error' ? 'text-error' : 'text-secondary'}`}>{copyState === 'copied' ? '클립보드에 복사했습니다.' : copyState === 'error' ? '클립보드 복사에 실패했습니다.' : '배치 라이브러리에도 새 항목으로 저장되었습니다.'}</span>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="rounded border border-outline-variant px-4 py-2 text-xs font-semibold text-on-surface hover:border-primary"><Icon name="content_copy" className="mr-2 text-[16px]" />JSON 복사</button>
          <button type="button" onClick={download} className="rounded bg-secondary px-4 py-2 text-xs font-bold text-on-secondary hover:bg-secondary-container"><Icon name="download" className="mr-2 text-[16px]" />JSON 다운로드</button>
        </div>
      </footer>
    </section>
  </div>;
}
