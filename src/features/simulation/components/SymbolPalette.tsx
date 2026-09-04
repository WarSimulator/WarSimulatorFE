import { useMemo, useState } from 'react';
import type { DeploymentAffiliation, DeploymentEchelon, DeploymentEditorMode, MilitarySymbolDefinition, TacticalGraphicType } from '../../../types';
import { catalogStandards, createPaletteItem, symbolCatalog } from '../lib/sidc';
import { getSymbolCategoryLabel } from '../lib/symbolCategoryLabels';
import { TacticalTaskPicker } from './TacticalTaskPicker';
import { MilitarySymbol } from './MilitarySymbol';
import { ObjectiveSymbol } from './ObjectiveSymbol';

type SymbolPaletteProps = {
  mode: DeploymentEditorMode;
  onModeChange: (mode: DeploymentEditorMode) => void;
};
const PAGE_SIZE = 24;
const drawTools: Array<{ type: Exclude<TacticalGraphicType, 'mil-task'>; label: string }> = [
  { type: 'route', label: 'Route' }, { type: 'axis', label: 'Axis' },
  { type: 'phase-line', label: 'Phase Line' }, { type: 'boundary', label: 'Boundary' },
  { type: 'area', label: 'Area' }, { type: 'freehand', label: 'Freehand' },
];
const inputClass = 'w-full rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[11px] text-on-surface outline-none focus:border-secondary';
const buttonClass = 'rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[11px] text-on-surface hover:border-secondary disabled:opacity-40';

export function SymbolPalette({ mode, onModeChange }: SymbolPaletteProps) {
  const [affiliation, setAffiliation] = useState<DeploymentAffiliation>('friendly');
  const [echelon, setEchelon] = useState<DeploymentEchelon>('company');
  const [query, setQuery] = useState('');
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
    <aside className="absolute bottom-4 left-4 top-4 z-30 flex w-[236px] flex-col rounded border border-outline-variant bg-surface-container/95 shadow-xl" aria-label="Symbol palette">
      <div className="shrink-0 space-y-2 border-b border-outline-variant bg-surface-container-high p-3">
        <div className="flex items-center justify-between">
          <p className="font-label-caps text-label-caps text-on-surface">SYMBOL PALETTE</p>
          <span className="font-data-mono text-[10px] text-secondary">{symbolCatalog.length.toLocaleString()}</span>
        </div>
        <input aria-label="Search symbols" className={inputClass} placeholder="Search name or SIDC..." value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
        <select aria-label="Symbol standard" className={inputClass} value={standard} onChange={event => { setStandard(event.target.value); setCategory('all'); setPage(0); }}>
          <option value="all">All standards</option>
          {catalogStandards.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select aria-label="Symbol category" className={inputClass} value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}>
          <option value="all">All categories (전체 카테고리)</option>
          {categories.map(item => <option key={item} value={item}>{getSymbolCategoryLabel(item)}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {(['friendly', 'enemy'] as const).map(value => <button key={value} aria-pressed={affiliation === value} className={`${buttonClass} uppercase ${affiliation === value ? 'border-secondary text-secondary' : ''}`} onClick={() => changeAffiliation(value)}>{value}</button>)}
        </div>
        <select aria-label="Unit echelon" title="Applies to military unit symbols" className={inputClass} value={echelon} onChange={event => { setEchelon(event.target.value as DeploymentEchelon); onModeChange({ type: 'select' }); }}>
          <option value="platoon">Unit echelon: Platoon</option>
          <option value="company">Unit echelon: Company</option>
          <option value="battalion">Unit echelon: Battalion</option>
        </select>
        <button className={`${buttonClass} w-full ${mode.type === 'select' ? 'border-secondary text-secondary' : ''}`} onClick={() => onModeChange({ type: 'select' })}>Select / Edit</button>
        <p className="font-data-mono text-[10px] text-on-surface-variant">Drag to map, or select then click map.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p role="status" className="font-data-mono text-[10px] text-outline">{filtered.length.toLocaleString()} symbols · Page {currentPage + 1}/{pageCount}</p>
        {visible.length === 0 && <p className="py-4 text-sm text-on-surface-variant">No matching symbols. Try another name or category.</p>}
        <div className="space-y-2" key={`${standard}:${category}:${query}:${currentPage}`}>
          {visible.map(definition => {
            const item = createPaletteItem({ definition, affiliation, echelon });
            if (item.kind !== 'unit') return null;
            const selected = mode.type === 'place' && mode.item.kind === 'unit' && mode.item.unitType === item.unitType;
            const parts = definition.label.split(' / ');
            return (
              <button key={definition.id} draggable aria-pressed={selected} title={`${definition.label}\n${getSymbolCategoryLabel(definition.category)}\n${item.sidc}`} className={`flex w-full cursor-grab items-center gap-2 rounded border bg-surface p-2 text-left hover:border-secondary active:cursor-grabbing ${selected ? 'border-secondary bg-secondary/10' : 'border-outline-variant'}`} onClick={() => onModeChange({ type: 'place', item })} onDragStart={event => dragSymbol(event, definition)}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-100 p-1 [&>span]:max-w-full [&_svg]:h-auto [&_svg]:max-h-12 [&_svg]:max-w-full"><MilitarySymbol sidc={item.sidc} standard={item.symbolStandard} size={34} /></span>
                <span className="min-w-0">
                  <span className="block break-words font-data-mono text-[11px] text-on-surface">{parts.at(-1)}</span>
                  {parts.length > 1 && <span className="block truncate text-[9px] text-on-surface-variant">{parts.slice(0, -1).join(' / ')}</span>}
                  <span className="block break-words text-[9px] text-secondary">{definition.standardId ?? 'QUICK'} · {getSymbolCategoryLabel(definition.category)}</span>
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
        <section className="space-y-2 border-t border-outline-variant pt-3">
          <h3 className="font-label-caps text-[10px] text-outline">DRAW</h3>
          <div className="grid grid-cols-2 gap-2">{drawTools.map(tool => <button key={tool.type} className={`${buttonClass} ${mode.type === 'draw' && mode.graphicType === tool.type ? 'border-secondary text-secondary' : ''}`} onClick={() => onModeChange({ type: 'draw', graphicType: tool.type })}>{tool.label}</button>)}</div>
          <TacticalTaskPicker mode={mode} onModeChange={onModeChange} affiliation={affiliation} />
        </section>
      </div>
    </aside>
  );
}
