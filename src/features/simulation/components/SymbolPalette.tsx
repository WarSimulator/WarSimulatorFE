import { DrawToolPreview } from './DrawToolPreview';
import { echelonOptions } from '../lib/echelons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeploymentAffiliation, DeploymentEchelon, DeploymentEditorMode, MilitarySymbolDefinition, TacticalGraphicType } from '../../../types';
import { catalogStandards, createPaletteItem, symbolCatalog } from '../lib/sidc';
import { getSymbolCategoryLabel } from '../lib/symbolCategoryLabels';
import { TacticalTaskPicker } from './TacticalTaskPicker';
import { MilitarySymbol } from './MilitarySymbol';
import { ObjectiveSymbol } from './ObjectiveSymbol';

type SymbolPaletteProps = {
  isOpen: boolean;
  onToggle: () => void;
  mode: DeploymentEditorMode;
  onModeChange: (mode: DeploymentEditorMode) => void;
};
const PAGE_SIZE = 24;
const drawTools: Array<{ type: Exclude<TacticalGraphicType, 'mil-task'>; label: string }> = [
  { type: 'route', label: 'Route' }, { type: 'axis', label: 'Axis' },
  { type: 'phase-line', label: 'Phase Line' }, { type: 'boundary', label: 'Boundary' },
  { type: 'area', label: 'Area' }, { type: 'freehand', label: 'Freehand' },
];
const inputClass = 'min-w-0 w-full rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[13px] text-on-surface outline-none focus:border-secondary';
const buttonClass = 'rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[13px] text-on-surface hover:border-secondary disabled:opacity-40';

export function SymbolPalette({ mode, onModeChange, isOpen, onToggle }: SymbolPaletteProps) {
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(isOpen);
  useEffect(() => {
    if (previousOpen.current !== isOpen) {
      (isOpen ? closeButtonRef : openButtonRef).current?.focus();
      previousOpen.current = isOpen;
    }
  }, [isOpen]);
  const [affiliation, setAffiliation] = useState<DeploymentAffiliation>('friendly');
  const [echelon, setEchelon] = useState<DeploymentEchelon>('company');
  const [query, setQuery] = useState('');
  const [paletteTab, setPaletteTab] = useState<'symbols' | 'draw'>('symbols');
  const [drawQuery, setDrawQuery] = useState('');
  const [drawCategory, setDrawCategory] = useState('all');
  const [standard, setStandard] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const catalog = useMemo(() => symbolCatalog.filter(item => standard === 'all' || item.standardId === standard), [standard]);
  const categories = useMemo(() => [...new Set(catalog.map(item => item.category))].sort(), [catalog]);
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.filter(item => (category === 'all' || item.category === category) && words.every(word =>
      `${item.label} ${getSymbolCategoryLabel(item.category)} ${item.standardId ?? ''} ${item.sidc ?? ''} ${item.id}`.toLowerCase().includes(word),
    ));
  }, [catalog, category, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const changeAffiliation = (value: DeploymentAffiliation) => {
    setAffiliation(value);
    onModeChange({ type: 'select' });
  };
  const dragSymbol = (event: React.DragEvent, definition: MilitarySymbolDefinition) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/atlas-palette-item', JSON.stringify(createPaletteItem({ definition, affiliation, echelon })));
  };

  return (
    <>
    {!isOpen && <button ref={openButtonRef} type="button" aria-label="군대부호 사이드바 열기" title="군대부호 사이드바 열기"
      aria-expanded={false} aria-controls="symbol-palette-sidebar" onClick={onToggle}
      className="absolute left-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded border border-secondary bg-surface-container text-secondary shadow-lg hover:bg-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m4-11 3 3-3 3" /></svg>
    </button>}
    <aside id="symbol-palette-sidebar" style={{ display: isOpen ? 'flex' : 'none' }}
      className="absolute bottom-4 left-4 top-4 z-30 w-[var(--palette-width)] flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container shadow-xl" aria-label="Symbol palette">
      <div className="shrink-0 space-y-2 border-b border-outline-variant bg-surface-container-high p-4">
        <div className="flex items-center justify-between">
          <div><p className="font-label-caps text-sm text-on-surface">SYMBOL PALETTE</p><p className="mt-0.5 text-xs text-on-surface-variant">군대부호 · {symbolCatalog.length.toLocaleString()}개</p></div>
          <div className="flex items-center gap-3">
          <button className={`${buttonClass} ${mode.type === 'select' ? 'border-secondary text-secondary' : ''}`} onClick={() => onModeChange({ type: 'select' })}>Select / Edit</button>
          <button ref={closeButtonRef} type="button" aria-label="군대부호 사이드바 접기" title="군대부호 사이드바 접기"
            aria-expanded={true} aria-controls="symbol-palette-sidebar" onClick={onToggle}
            className="flex h-9 w-9 items-center justify-center rounded border border-outline-variant text-on-surface hover:border-secondary hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          </div>
        </div>
        <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[690px] grid-cols-[1fr_0.9fr_1.3fr_0.65fr_1.1fr] items-end gap-2">
        <label className="min-w-0 space-y-1"><span className="text-[10px] text-outline">SEARCH (검색)</span>
        <input aria-label={paletteTab === 'symbols' ? 'Search symbols' : 'Search drawing tools'} className={inputClass} placeholder={paletteTab === 'symbols' ? '이름 / SIDC' : '도형 / 과업 검색'} value={paletteTab === 'symbols' ? query : drawQuery} onChange={event => { if (paletteTab === 'symbols') { setQuery(event.target.value); setPage(0); } else { setDrawQuery(event.target.value); } }} />
        </label>
        <label className="min-w-0 space-y-1"><span className="text-[10px] text-outline">STANDARD (표준)</span>
        <select aria-label="Symbol standard" className={inputClass} value={standard} onChange={event => { setStandard(event.target.value); setCategory('all'); setPage(0); }}>
          <option value="all">All standards</option>
          {catalogStandards.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        </label>
        <label className="min-w-0 space-y-1"><span className="text-[10px] text-outline">CATEGORY (카테고리)</span>
        {paletteTab === 'symbols' ? <select aria-label="Symbol category" title={category === 'all' ? '전체 카테고리' : getSymbolCategoryLabel(category)} className={inputClass} value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}>
          <option value="all">All categories (전체 카테고리)</option>
          {categories.map(item => <option key={item} value={item}>{getSymbolCategoryLabel(item)}</option>)}
        </select> : <select aria-label="Drawing category" className={inputClass} value={drawCategory} onChange={event => setDrawCategory(event.target.value)}>
          <option value="all">전체 도형 / 과업</option><option value="basic">DRAW (기본 도형)</option><option value="tasks">전술 과업</option>
        </select>}
        </label>
        <label className="min-w-0 space-y-1"><span className="text-[10px] text-outline">진영</span>
        <select aria-label="Symbol affiliation" className={inputClass} value={affiliation} onChange={event => changeAffiliation(event.target.value as DeploymentAffiliation)}>
          <option value="friendly">아군</option><option value="enemy">적군</option>
        </select>
        </label>
        <label className="min-w-0 space-y-1"><span className="text-[10px] text-outline">ECHELON (제대)</span>
        <select aria-label="Unit echelon" title="군부대 및 지상 장비에 적용" disabled={paletteTab === 'draw'} className={`${inputClass} disabled:opacity-40`} value={echelon} onChange={event => { setEchelon(event.target.value as DeploymentEchelon); onModeChange({ type: 'select' }); }}>
          {echelonOptions.map(option => <option key={option.value} value={option.value}>{option.mark} · {option.label}</option>)}
        </select>
        </label>
        </div>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="팔레트 종류">
          {([{ id: 'symbols', label: '심볼' }, { id: 'draw', label: 'DRAW + 전술 과업' }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={paletteTab === tab.id}
            className={`${buttonClass} ${paletteTab === tab.id ? 'border-secondary bg-secondary/10 text-secondary' : ''}`}
            onClick={() => { setPaletteTab(tab.id); onModeChange({ type: 'select' }); }}>{tab.label}</button>)}
        </div>
        <p className="font-data-mono text-[10px] text-on-surface-variant">{paletteTab === 'symbols' ? 'Drag to map, or select then click map.' : '도형 카드를 선택한 뒤 지도에 그리세요. 전술 과업은 번호 순서대로 클릭하세요.'}</p>
      </div>
      <div hidden={paletteTab !== 'symbols'} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" aria-label="심볼 목록">
        <p role="status" className="font-data-mono text-[10px] text-outline">{filtered.length.toLocaleString()} symbols · Page {currentPage + 1}/{pageCount}</p>
        {visible.length === 0 && <p className="py-4 text-sm text-on-surface-variant">No matching symbols. Try another name or category.</p>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2" key={`${standard}:${category}:${query}:${currentPage}`}>
          {visible.map(definition => {
            const item = createPaletteItem({ definition, affiliation, echelon });
            if (item.kind !== 'unit') return null;
            const selected = mode.type === 'place' && mode.item.kind === 'unit' && mode.item.unitType === item.unitType;
            const parts = definition.label.split(' / ');
            return (
              <button key={definition.id} draggable aria-pressed={selected} title={`${definition.label}\n${getSymbolCategoryLabel(definition.category)}\n${item.sidc}`} className={`flex w-full min-w-0 cursor-grab items-center gap-3 rounded border bg-surface p-3 text-left hover:border-secondary active:cursor-grabbing ${selected ? 'border-secondary bg-secondary/10' : 'border-outline-variant'}`} onClick={() => onModeChange({ type: 'place', item })} onDragStart={event => dragSymbol(event, definition)}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-100 p-1 [&>span]:max-w-full [&_svg]:h-auto [&_svg]:max-h-12 [&_svg]:max-w-full"><MilitarySymbol sidc={item.sidc} standard={item.symbolStandard} size={34} /></span>
                <span className="min-w-0">
                  <span className="block break-words font-data-mono text-[13px] text-on-surface">{parts.at(-1)}</span>
                  {parts.length > 1 && <span className="block truncate text-[11px] text-on-surface-variant">{parts.slice(0, -1).join(' / ')}</span>}
                  <span className="block break-words text-[11px] text-secondary">{definition.standardId ?? 'QUICK'} · {getSymbolCategoryLabel(definition.category)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={buttonClass} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className={buttonClass} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div>
        <section className="space-y-2 border-t border-outline-variant pt-3">
          <h3 className="font-label-caps text-[10px] text-outline">TACTICAL OBJECTS</h3>
          <button draggable className={`${buttonClass} flex w-full items-center gap-2`} onClick={() => onModeChange({ type: 'place', item: { kind: 'objective', label: 'Objective' } })} onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/atlas-palette-item', JSON.stringify({ kind: 'objective', label: 'Objective' })); }}><ObjectiveSymbol size={28} />Objective</button>
        </section>
      </div>
      <div hidden={paletteTab !== 'draw'} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4" aria-label="DRAW 및 전술 과업 목록">
        {drawCategory !== 'tasks' && <section className="space-y-3">
          <h3 className="font-label-caps text-xs text-secondary">DRAW (기본 도형)</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">{drawTools.filter(tool => tool.label.toLowerCase().includes(drawQuery.trim().toLowerCase())).map(tool => <button key={tool.type} type="button" aria-label={tool.label} aria-pressed={mode.type === 'draw' && mode.graphicType === tool.type}
            className={`${buttonClass} min-w-0 space-y-2 p-3 text-left ${mode.type === 'draw' && mode.graphicType === tool.type ? 'border-secondary bg-secondary/10 text-secondary' : ''}`}
            onClick={() => onModeChange({ type: 'draw', graphicType: tool.type })}>
            <DrawToolPreview type={tool.type} label={tool.label} /><span className="block">{tool.label}</span>
          </button>)}</div>
        </section>}
        {drawCategory !== 'basic' && <TacticalTaskPicker mode={mode} onModeChange={onModeChange} affiliation={affiliation} standard={standard} query={drawQuery} />}
      </div>
    </aside>
    </>
  );
}
