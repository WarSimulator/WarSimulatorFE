import { Icon } from '../layout/Icon';

type MettSectionPanelProps = {
  title: string;
  sectionCode: string;
  icon: string;
  tone?: 'primary' | 'error' | 'muted';
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function MettSectionPanel({ title, sectionCode, icon, tone = 'primary', value, placeholder, onChange }: MettSectionPanelProps) {
  const iconColor = tone === 'error' ? 'text-error' : tone === 'muted' ? 'text-on-surface-variant' : 'text-primary';

  return (
    <section className="glass-panel flex h-[320px] flex-col rounded border border-outline-variant transition-all duration-300">
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name={icon} className={`${iconColor} text-[20px]`} />
          <h3 className="font-headline-md text-[16px] text-on-surface">{title}</h3>
        </div>
        <span className="font-data-mono text-[10px] tracking-wider text-outline">{sectionCode}</span>
      </header>
      <div className="relative flex flex-1 flex-col bg-surface-container-low/30 p-4">
        <textarea
          className={`h-full w-full flex-1 resize-none rounded border border-outline-variant bg-surface-container-lowest/50 p-4 font-body-base text-body-base text-on-surface transition-colors placeholder:text-on-surface-variant focus:outline-none focus:ring-1 ${
            tone === 'error' ? 'focus:border-error focus:ring-error' : 'focus:border-primary focus:ring-primary'
          }`}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </section>
  );
}
