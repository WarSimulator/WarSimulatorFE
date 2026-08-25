import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/layout/Icon';
import { MettSectionPanel } from '../components/mett/MettSectionPanel';
import { loadMettDocuments, saveMettDocuments } from '../lib/mettStorage';
import type { MettDocument, MettSections } from '../types';

const sectionConfig: Array<{
  key: keyof MettSections;
  title: string;
  code: string;
  icon: string;
  tone?: 'primary' | 'error' | 'muted';
  placeholder: string;
}> = [
  {
    key: 'mission',
    title: '1. Mission',
    code: 'SEC_M',
    icon: 'flag',
    placeholder: 'Define the task, together with the purpose, that clearly indicates the action to be taken and the reason therefore. Enter strategic assessment...',
  },
  {
    key: 'enemy',
    title: '2. Enemy',
    code: 'SEC_E',
    icon: 'warning',
    tone: 'error',
    placeholder: 'Detail enemy disposition, composition, strength, recent activities, and capabilities. Enter strategic assessment...',
  },
  {
    key: 'terrainWeather',
    title: '3. Terrain & Weather',
    code: 'SEC_T',
    icon: 'landscape',
    tone: 'muted',
    placeholder: 'OAKOC analysis. Observation, avenues of approach, key terrain, obstacles, cover and concealment. Enter strategic assessment...',
  },
  {
    key: 'troopsSupport',
    title: '4. Troops & Support',
    code: 'SEC_TS',
    icon: 'groups',
    tone: 'muted',
    placeholder: 'Assess available friendly forces, attachments, detachments, and available support. Enter strategic assessment...',
  },
  {
    key: 'timeAvailable',
    title: '5. Time Available',
    code: 'SEC_TA',
    icon: 'timer',
    tone: 'muted',
    placeholder: 'Evaluate time for planning, preparation, and execution. Consider 1/3 - 2/3 rule. Enter strategic assessment...',
  },
  {
    key: 'civilConsiderations',
    title: '6. Civil Considerations',
    code: 'SEC_C',
    icon: 'location_city',
    tone: 'muted',
    placeholder: 'ASCOPE analysis. Areas, structures, capabilities, organizations, people, and events. Enter strategic assessment...',
  },
];

export function MettEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<MettDocument[]>(() => loadMettDocuments());
  const document = useMemo(() => documents.find((item) => item.id === id), [documents, id]);
  const [savedState, setSavedState] = useState<'idle' | 'saved'>('idle');

  if (!document) {
    return (
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-container-padding">
        <h2 className="font-display-lg text-display-lg text-on-surface">METT-TC Analysis</h2>
        <p className="font-body-base text-body-base text-on-surface-variant">Document not found.</p>
        <button
          className="w-fit rounded border border-outline-variant bg-surface-container-high px-4 py-2 font-label-caps text-label-caps text-on-surface"
          onClick={() => navigate('/mett')}
        >
          BACK
        </button>
      </div>
    );
  }

  const updateSection = (key: keyof MettSections, value: string) => {
    setSavedState('idle');
    setDocuments((currentDocuments) =>
      currentDocuments.map((item) =>
        item.id === document.id
          ? {
              ...item,
              sections: {
                ...item.sections,
                [key]: value,
              },
            }
          : item,
      ),
    );
  };

  const handleSave = () => {
    const nextDocuments = documents.map((item) =>
      item.id === document.id
        ? {
            ...item,
            lastModified: new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z',
          }
        : item,
    );
    setDocuments(nextDocuments);
    saveMettDocuments(nextDocuments);
    setSavedState('saved');
  };

  return (
    <div className="mx-auto flex h-full max-w-[1440px] flex-col gap-6 p-container-padding">
      <header className="mb-2 flex items-end justify-between border-b border-outline-variant pb-4">
        <div>
          <h2 className="mb-2 font-display-lg text-display-lg tracking-tight text-on-surface">
            METT-TC Analysis
            <span className="ml-2 font-headline-md text-[20px] font-medium tracking-normal text-outline">/ {document.name.toUpperCase()}</span>
          </h2>
          <p className="max-w-2xl font-body-base text-body-base text-on-surface-variant">
            Mission, Enemy, Terrain and Weather, Troops and Support Available, Time Available, and Civil Considerations framework editor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedState === 'saved' && <span className="font-data-mono text-[10px] text-secondary">SAVED LOCAL</span>}
          <button
            className="flex items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-4 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => navigate('/mett')}
          >
            <Icon name="arrow_back" className="text-sm" />
            BACK
          </button>
          <button
            className="flex items-center gap-2 rounded border border-outline-variant bg-primary-container px-4 py-2 font-label-caps text-label-caps text-on-primary-container transition-colors hover:bg-primary hover:text-on-primary"
            onClick={handleSave}
          >
            <Icon name="save" className="text-sm" />
            SAVE
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {sectionConfig.map((section) => (
          <MettSectionPanel
            key={section.key}
            title={section.title}
            sectionCode={section.code}
            icon={section.icon}
            tone={section.tone}
            value={document.sections[section.key]}
            placeholder={section.placeholder}
            onChange={(value) => updateSection(section.key, value)}
          />
        ))}
      </div>
    </div>
  );
}
