import { useMemo, useState } from 'react';
import { Icon } from '../../../components/layout/Icon';
import type { SimulationCompatibilityReport as Report, SimulationReportEntry } from '../lib/finalSimulation';

const severityStyle = {
  error: { icon: 'error', className: 'border-error/40 bg-error/10 text-error' },
  warning: { icon: 'warning', className: 'border-secondary/40 bg-secondary/10 text-secondary' },
  info: { icon: 'info', className: 'border-primary/40 bg-primary/10 text-primary' },
} as const;
const categoryOrder = ['유닛 연결', '위치·경로', '실행 조건', '계획 구조', '제외 항목', '기타'];

function category(entry: SimulationReportEntry) {
  if (entry.code.includes('ACTOR')) return '유닛 연결';
  if (entry.code.includes('REFERENCE') || entry.code.includes('WAYPOINT') || entry.code.includes('ROUTE')) return '위치·경로';
  if (entry.code.includes('CONDITION')) return '실행 조건';
  if (entry.code.includes('INVALID') || entry.code.includes('DEPENDENCY') || entry.code.includes('IMPORT')) return '계획 구조';
  if (entry.code.includes('SKIPPED')) return '제외 항목';
  return '기타';
}

function groupEntries(entries: SimulationReportEntry[], mode: 'category' | 'unit') {
  const groups = new Map<string, SimulationReportEntry[]>();
  for (const entry of entries) {
    const key = mode === 'category' ? category(entry) : entry.unit ?? '공통 / 유닛 미지정';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].sort(([first], [second]) => mode === 'category'
    ? categoryOrder.indexOf(first) - categoryOrder.indexOf(second)
    : first.localeCompare(second, 'ko-KR'));
}

export function SimulationCompatibilityReport({ report }: { report: Report }) {
  const [groupMode, setGroupMode] = useState<'category' | 'unit'>('category');
  const [forceFilter, setForceFilter] = useState<'ALL' | 'BLUE' | 'RED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'all' | SimulationReportEntry['severity']>('all');
  const filteredEntries = useMemo(() => report.entries.filter(entry =>
    (forceFilter === 'ALL' || entry.forceSide === forceFilter)
    && (severityFilter === 'all' || entry.severity === severityFilter)), [forceFilter, report.entries, severityFilter]);
  const groups = useMemo(() => groupEntries(filteredEntries, groupMode), [filteredEntries, groupMode]);
  const count = (severity: SimulationReportEntry['severity']) => report.entries.filter(entry => entry.severity === severity).length;

  return <main className="min-h-0 flex-1 overflow-y-auto bg-surface p-6">
    <div className="mx-auto max-w-[1200px] space-y-5">
      <header className="rounded border border-outline-variant bg-surface-container p-5">
        <p className="font-label-caps text-xs uppercase tracking-widest text-secondary">BEST-EFFORT EXECUTION REPORT</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-primary">Plan 연동 진단 결과</h2><p className="mt-1 text-sm text-on-surface-variant">오류는 원본 Plan과 Deployment의 계약 불일치를 뜻하며, Report 모드에서 보정되어 실행됐더라도 오류 건수에 포함됩니다.</p></div>
          <time className="font-data-mono text-xs text-on-surface-variant">{new Date(report.generatedAt).toLocaleString('ko-KR')}</time>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['입력 행동', report.inputActionCount, 'list_alt'], ['실행 행동', report.executedActionCount, 'play_circle'],
          ['보정 행동', report.fallbackActionCount, 'build'], ['제외 행동', report.skippedActionCount, 'block'],
        ].map(([label, value, icon]) => <div key={String(label)} className="rounded border border-outline-variant bg-surface-container-low p-4">
          <div className="flex items-center justify-between text-on-surface-variant"><span className="text-xs font-bold uppercase tracking-wider">{label}</span><Icon name={String(icon)} /></div>
          <strong className="mt-3 block font-data-mono text-3xl text-on-surface">{value}</strong>
        </div>)}
      </section>

      <section className="sticky top-0 z-10 rounded border border-outline-variant bg-surface-container/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex rounded border border-outline-variant bg-surface p-1">
            {([['category', '카테고리별', 'category'], ['unit', '유닛별', 'groups']] as const).map(([mode, label, icon]) => <button key={mode} onClick={() => setGroupMode(mode)} className={`flex items-center gap-2 rounded px-4 py-2 text-xs font-bold transition-colors ${groupMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'}`}><Icon name={icon} className="text-[17px]" />{label}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'BLUE', 'RED'] as const).map(force => <button key={force} onClick={() => setForceFilter(force)} className={`rounded border px-3 py-1.5 font-data-mono text-xs ${forceFilter === force ? force === 'BLUE' ? 'border-blue-400 bg-blue-400/15 text-blue-300' : force === 'RED' ? 'border-red-400 bg-red-400/15 text-red-300' : 'border-primary bg-primary/15 text-primary' : 'border-outline-variant text-on-surface-variant'}`}>{force}</button>)}
            <span className="mx-1 h-5 w-px bg-outline-variant" />
            {([['all', `전체 ${report.entries.length}`], ['error', `오류 ${count('error')}`], ['warning', `경고 ${count('warning')}`], ['info', `정보 ${count('info')}`]] as const).map(([severity, label]) => <button key={severity} onClick={() => setSeverityFilter(severity)} className={`rounded border px-3 py-1.5 text-xs ${severityFilter === severity ? 'border-secondary bg-secondary/15 text-secondary' : 'border-outline-variant text-on-surface-variant'}`}>{label}</button>)}
          </div>
        </div>
      </section>

      {groups.length === 0 ? <div className="rounded border border-outline-variant bg-surface-container p-8 text-center text-sm text-on-surface-variant">선택한 필터에 해당하는 항목이 없습니다.</div> : groups.map(([group, entries]) => <section key={group} className="overflow-hidden rounded border border-outline-variant bg-surface-container">
        <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high px-5 py-3">
          <div className="flex items-center gap-3"><Icon name={groupMode === 'category' ? 'folder' : 'military_tech'} className="text-secondary" filled /><h3 className="font-semibold text-on-surface">{group}</h3></div>
          <span className="rounded bg-surface px-2.5 py-1 font-data-mono text-xs text-on-surface-variant">{entries.length}건</span>
        </header>
        <div className="divide-y divide-outline-variant">
          {entries.map((entry, index) => {
            const style = severityStyle[entry.severity];
            return <article key={`${entry.code}-${entry.actionId ?? index}-${index}`} className="p-4 transition-colors hover:bg-surface-container-high">
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${style.className}`}><Icon name={style.icon} className="text-[20px]" filled /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="font-data-mono text-sm">{entry.code}</strong>{entry.forceSide && <span className={`rounded px-2 py-0.5 font-data-mono text-[10px] font-bold ${entry.forceSide === 'BLUE' ? 'bg-blue-400/15 text-blue-300' : 'bg-red-400/15 text-red-300'}`}>{entry.forceSide}</span>}{entry.unit && <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entry.unit}</span>}{entry.actionId && <span className="rounded bg-surface px-2 py-0.5 font-data-mono text-[11px] text-on-surface-variant">{entry.actionId}</span>}</div>
                  <p className="mt-2 text-sm text-on-surface">{entry.message}</p>
                  {entry.cause && <div className="mt-2 rounded border border-outline-variant bg-surface px-3 py-2 text-xs leading-relaxed text-on-surface-variant"><span className="font-semibold text-secondary">원인:</span> {entry.cause}</div>}
                  <p className="mt-2 text-xs text-on-surface-variant"><span className="font-semibold text-primary">처리:</span> {entry.resolution}</p>
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>)}
    </div>
  </main>;
}
