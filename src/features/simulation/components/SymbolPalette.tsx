import { useMemo, useState } from 'react';
import type { DeploymentAffiliation, DeploymentEchelon, DeploymentEditorMode, MilitarySymbolCategory, MilitarySymbolDefinition, TacticalGraphicType } from '../../../types';
import { createPaletteItem, symbolCatalog } from '../lib/sidc';
import { MilitarySymbol } from './MilitarySymbol';
import { ObjectiveSymbol } from './ObjectiveSymbol';

type SymbolPaletteProps = {
  mode: DeploymentEditorMode;
  onModeChange: (mode: DeploymentEditorMode) => void;
};

const drawTools: Array<{ type: TacticalGraphicType; label: string }> = [
  { type: 'route', label: 'Route' },
  { type: 'axis', label: 'Axis' },
  { type: 'phase-line', label: 'Phase Line' },
  { type: 'boundary', label: 'Boundary' },
  { type: 'area', label: 'Area' },
  { type: 'freehand', label: 'Freehand' },
];

const categoryLabels: Record<MilitarySymbolCategory, string> = {
  'combat-arms': 'COMBAT ARMS',
  fires: 'FIRES',
  'combat-support': 'COMBAT SUPPORT',
  'command-control': 'COMMAND & CONTROL',
  sustainment: 'SUSTAINMENT',
};

const categoryOrder: MilitarySymbolCategory[] = ['combat-arms', 'fires', 'combat-support', 'command-control', 'sustainment'];

export function SymbolPalette({ mode, onModeChange }: SymbolPaletteProps) {
  const [affiliation, setAffiliation] = useState<DeploymentAffiliation>('friendly');
  const [echelon, setEchelon] = useState<DeploymentEchelon>('company');
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    'combat-arms': true,
    fires: false,
    'combat-support': false,
    'command-control': false,
    sustainment: false,
    objects: true,
  });

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return symbolCatalog;
    return symbolCatalog.filter((definition) =>
      `${definition.label} ${definition.category} ${definition.id}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const setCategoryOpen = (category: string) => {
    setOpenCategories((current) => ({ ...current, [category]: !current[category] }));
  };

  const handleDragStart = (event: React.DragEvent, definition: MilitarySymbolDefinition) => {
    const item = createPaletteItem({ definition, affiliation, echelon });
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/atlas-palette-item', JSON.stringify(item));
  };

  const handleObjectiveDragStart = (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/atlas-palette-item', JSON.stringify({ kind: 'objective', label: 'Objective' }));
  };

  return (
    <aside className="absolute bottom-4 left-4 top-4 z-30 flex w-[236px] flex-col rounded border border-outline-variant bg-surface-container/95 shadow-xl">
      <div className="shrink-0 border-b border-outline-variant bg-surface-container-high p-3">
        <p className="font-label-caps text-label-caps text-on-surface">SYMBOL PALETTE</p>
        <input
          className="mt-3 w-full rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[11px] text-on-surface outline-none focus:border-primary"
          placeholder="Search symbols..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <h3 className="mb-2 font-label-caps text-[10px] text-on-surface-variant">SELECT</h3>
          <button
            className={`w-full rounded border p-2 text-left font-data-mono text-[11px] transition-colors ${
              mode.type === 'select' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant bg-surface text-on-surface hover:border-primary'
            }`}
            onClick={() => onModeChange({ type: 'select' })}
          >
            Select / Edit
          </button>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-[10px] text-on-surface-variant">AFFILIATION</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['friendly', 'enemy'] as DeploymentAffiliation[]).map((value) => (
              <button
                key={value}
                className={`rounded border px-2 py-2 font-data-mono text-[10px] uppercase ${
                  affiliation === value ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant text-on-surface-variant'
                }`}
                onClick={() => setAffiliation(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </section>

        <label className="block">
          <span className="mb-2 block font-label-caps text-[10px] text-on-surface-variant">ECHELON</span>
          <select
            className="w-full rounded border border-outline-variant bg-surface px-2 py-2 font-data-mono text-[11px] text-on-surface outline-none focus:border-primary"
            value={echelon}
            onChange={(event) => setEchelon(event.target.value as DeploymentEchelon)}
          >
            <option value="platoon">Platoon</option>
            <option value="company">Company</option>
            <option value="battalion">Battalion</option>
          </select>
        </label>

        <section>
          <h3 className="mb-2 font-label-caps text-[10px] text-on-surface-variant">PLACE</h3>
          {categoryOrder.map((category) => {
            const items = filteredCatalog.filter((definition) => definition.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="mb-2">
                <button
                  className="flex w-full justify-between rounded border border-outline-variant bg-surface px-2 py-2 font-label-caps text-[10px] text-on-surface-variant"
                  onClick={() => setCategoryOpen(category)}
                >
                  <span>{openCategories[category] ? '▼' : '▶'} {categoryLabels[category]}</span>
                </button>
                {openCategories[category] && (
                  <div className="mt-2 space-y-2">
                    {items.map((definition) => {
                      const item = createPaletteItem({ definition, affiliation, echelon });
                      if (item.kind !== 'unit') return null;
                      return (
                        <button
                          key={definition.id}
                          draggable
                          className="flex w-full cursor-grab items-center gap-3 rounded border border-outline-variant bg-surface p-2 text-left text-on-surface transition-colors hover:border-primary active:cursor-grabbing"
                          onClick={() => onModeChange({ type: 'place', item })}
                          onDragStart={(event) => handleDragStart(event, definition)}
                        >
                          <span className="flex h-10 w-11 items-center justify-center">
                            <MilitarySymbol sidc={item.sidc} size={31} />
                          </span>
                          <span className="font-data-mono text-[11px]">{definition.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div>
            <button
              className="flex w-full justify-between rounded border border-outline-variant bg-surface px-2 py-2 font-label-caps text-[10px] text-on-surface-variant"
              onClick={() => setCategoryOpen('objects')}
            >
              <span>{openCategories.objects ? '▼' : '▶'} TACTICAL OBJECTS</span>
            </button>
            {openCategories.objects && (
              <button
                draggable
                className="mt-2 flex w-full cursor-grab items-center gap-3 rounded border border-outline-variant bg-surface p-2 text-left text-on-surface transition-colors hover:border-primary"
                onClick={() => onModeChange({ type: 'place', item: { kind: 'objective', label: 'Objective' } })}
                onDragStart={handleObjectiveDragStart}
              >
                <ObjectiveSymbol size={31} />
                <span className="font-data-mono text-[11px]">Objective</span>
              </button>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-label-caps text-[10px] text-on-surface-variant">DRAW</h3>
          <div className="space-y-2">
            {drawTools.map((tool) => (
              <button
                key={tool.type}
                className={`w-full rounded border p-2 text-left font-data-mono text-[11px] transition-colors ${
                  mode.type === 'draw' && mode.graphicType === tool.type
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-outline-variant bg-surface text-on-surface hover:border-primary'
                }`}
                onClick={() => onModeChange({ type: 'draw', graphicType: tool.type })}
              >
                {tool.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
