import { Outlet } from 'react-router-dom';
import { Icon } from './Icon';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen flex-col bg-surface text-on-surface md:flex-row">
      <Sidebar />
      <header className="fixed left-[260px] right-0 top-0 z-50 hidden h-toolbar-height items-center justify-between border-b border-outline-variant bg-surface-container-high/90 px-gutter backdrop-blur-md md:flex">
        <div className="flex h-full items-center gap-6">
          <div className="flex h-full items-center border-b-2 border-primary px-2 pt-[2px] font-label-caps text-label-caps text-primary">
            OPERATIONAL
          </div>
          <span className="flex items-center gap-1 font-data-mono text-[11px] text-on-surface-variant">
            <Icon name="my_location" className="text-[14px]" />
            GPS: 34.0522 N, 118.2437 W
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-primary">
            <Icon name="wifi" />
          </button>
          <button className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-primary">
            <Icon name="schedule" />
          </button>
          <div className="mx-1 h-4 w-px bg-outline-variant" />
          <button className="rounded border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-variant hover:text-primary">
            SAVE
          </button>
          <button className="rounded bg-primary-container px-3 py-1 font-label-caps text-label-caps text-on-primary-container transition-colors hover:bg-primary hover:text-on-primary">
            EXPORT
          </button>
          <div className="ml-2 flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-variant transition-colors hover:border-primary">
            <Icon name="person" className="text-primary" filled />
          </div>
        </div>
      </header>

      <main className="relative z-10 h-full w-full flex-1 overflow-y-auto overflow-x-hidden pb-8 pt-[48px] md:pl-[260px]">
        <Outlet />
      </main>

      <footer className="fixed bottom-0 left-[260px] right-0 z-50 hidden h-8 items-center justify-between overflow-hidden border-t border-outline-variant bg-surface-container-lowest px-gutter md:flex">
        <div className="flex items-center gap-2 font-data-mono text-[10px] text-outline">
          <span className="h-1.5 w-1.5 rounded-full bg-outline" />
          SYSTEM STANDBY
        </div>
        <div className="font-data-mono text-[10px] text-on-surface-variant">COORD: 52.5200 N, 13.4050 E</div>
      </footer>
    </div>
  );
}
