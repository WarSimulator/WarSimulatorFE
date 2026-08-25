import { useNavigate } from 'react-router-dom';
import { Icon } from '../layout/Icon';
import type { MettDocument } from '../../types';

type MettCardProps = {
  document: MettDocument;
};

export function MettCard({ document }: MettCardProps) {
  const navigate = useNavigate();
  const isActive = document.status === 'ACTIVE';

  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high transition-all duration-200 hover:border-primary"
      onClick={() => navigate(`/mett/${document.id}`)}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between border-b border-outline-variant bg-surface-container p-4">
        <div className="flex items-center gap-3">
          <Icon name="description" className={`${isActive ? 'text-primary' : 'text-on-surface-variant'} text-[24px]`} />
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">{document.name}</h3>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-sm border px-1.5 font-label-caps text-[9px] ${
                isActive
                  ? 'border-secondary/30 bg-secondary/5 text-secondary'
                  : document.status === 'ARCHIVED'
                    ? 'border-outline-variant bg-surface text-outline'
                    : 'border-outline-variant bg-surface text-on-surface-variant'
              }`}
            >
              {isActive && <span className="h-1 w-1 rounded-full bg-secondary" />}
              {document.status}
            </span>
          </div>
        </div>
        <button className="text-on-surface-variant hover:text-primary" onClick={(event) => event.stopPropagation()}>
          <Icon name="more_vert" className="text-[20px]" />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 font-label-caps text-label-caps text-on-surface-variant">AUTHOR</p>
            <p className="font-data-mono text-data-mono text-on-surface">{document.author}</p>
          </div>
          <div>
            <p className="mb-1 font-label-caps text-label-caps text-on-surface-variant">LAST MODIFIED</p>
            <p className="font-data-mono text-data-mono text-on-surface">{document.lastModified}</p>
          </div>
        </div>
        <div className={`${document.status === 'ARCHIVED' ? 'opacity-70' : ''} mt-auto rounded border border-outline-variant/50 bg-surface p-2`}>
          <div className="mb-1 flex items-center gap-2">
            <Icon
              name={document.status === 'ARCHIVED' ? 'done_all' : document.status === 'DRAFT' ? 'pending' : 'check_circle'}
              className={`${isActive || document.status === 'ARCHIVED' ? 'text-primary' : 'text-outline-variant'} text-[14px]`}
            />
            <span className={`font-data-mono text-[11px] ${isActive || document.status === 'ARCHIVED' ? 'text-primary' : 'text-on-surface-variant'}`}>
              {document.progressLabel}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-container-highest">
            <div
              className={`${isActive || document.status === 'ARCHIVED' ? 'bg-primary' : 'bg-outline-variant'} h-1.5 rounded-full`}
              style={{ width: `${document.progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
