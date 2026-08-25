import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/layout/Icon';
import { MettCard } from '../components/mett/MettCard';
import { createBlankMettDocument, loadMettDocuments, saveMettDocuments } from '../lib/mettStorage';

export function MettArchivePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState(() => loadMettDocuments());
  const sortedDocuments = useMemo(() => documents, [documents]);

  const handleCreate = () => {
    const document = createBlankMettDocument();
    const nextDocuments = [document, ...documents];
    setDocuments(nextDocuments);
    saveMettDocuments(nextDocuments);
    navigate(`/mett/${document.id}`);
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-container-padding">
      <div className="mb-4 flex items-end justify-between border-b border-outline-variant pb-4">
        <div>
          <h2 className="flex items-center gap-2 font-headline-md text-headline-md font-extrabold tracking-wide text-on-surface">
            <Icon name="folder_open" className="text-primary" />
            METT-TC ARCHIVES
          </h2>
          <p className="mt-1 font-body-base text-body-base text-on-surface-variant">
            Mission, Enemy, Terrain, Troops, Time, Civilian Considerations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded border border-outline-variant px-5 py-2 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant">
            <Icon name="upload" className="text-[18px]" />
            UPLOAD
          </button>
          <button
            className="flex items-center gap-2 rounded bg-primary px-5 py-2 font-label-caps text-label-caps text-on-primary shadow-[0_0_10px_rgba(245,245,245,0.1)] transition-colors hover:bg-primary-fixed"
            onClick={handleCreate}
          >
            <Icon name="add" className="text-[18px]" />
            CREATE NEW METT-TC
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sortedDocuments.map((document) => (
          <MettCard key={document.id} document={document} />
        ))}
      </div>
    </div>
  );
}
