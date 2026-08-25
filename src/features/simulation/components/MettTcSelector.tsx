import type { MettDocument } from '../../../types';

type MettTcSelectorProps = {
  documents: MettDocument[];
  selectedId: string;
  onSelect: (documentId: string) => void;
};

function toFileName(document: MettDocument) {
  return `${document.id.replace(/-/g, '_')}.mett`;
}

export function MettTcSelector({ documents, selectedId, onSelect }: MettTcSelectorProps) {
  return (
    <label className="block w-[320px]">
      <span className="mb-2 block font-label-caps text-label-caps text-on-surface-variant">METT-TC DOCUMENT</span>
      <select
        className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-3 font-data-mono text-[12px] text-on-surface outline-none transition-colors hover:border-primary focus:border-primary"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {toFileName(document)}
          </option>
        ))}
      </select>
    </label>
  );
}
