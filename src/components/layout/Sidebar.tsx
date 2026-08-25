import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

const navItems = [
  { to: '/workspace', label: 'Workspace', icon: 'dashboard' },
  { to: '/mett', label: 'METT-TC', icon: 'assignment' },
  { to: '/simulations', label: 'Simulations', icon: 'play_circle' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isItemActive = (to: string, isActive: boolean) => {
    if (to === '/mett') {
      return isActive || location.pathname.startsWith('/mett/');
    }

    return isActive;
  };

  return (
    <nav className="fixed left-0 top-0 z-40 hidden h-full w-sidebar-width flex-col border-r border-outline-variant bg-surface-container md:flex">
      <div className="flex flex-col gap-3 border-b border-outline-variant px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-outline-variant bg-surface-variant">
            <Icon name="security" className="text-primary" filled />
          </div>
          <div>
            <h1 className="font-display-lg text-[16px] font-bold leading-tight tracking-tighter text-primary">ATLAS DEFENSE</h1>
            <p className="font-data-mono text-[10px] text-on-surface-variant">V3.4 Tactical</p>
          </div>
        </div>
        <button
          className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-secondary py-2 font-label-caps text-label-caps text-on-secondary shadow-[0_0_10px_rgba(255,185,95,0.2)] transition-colors hover:bg-secondary-container"
          onClick={() => navigate('/workspace')}
        >
          <Icon name="play_arrow" className="text-[16px]" filled />
          NEW OPERATION
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isItemActive(item.to, isActive)
                ? 'group relative flex items-center border-l-4 border-primary bg-surface-container-high py-3 pl-4 font-bold text-primary transition-colors'
                : 'group relative flex items-center py-3 pl-5 font-medium text-on-surface-variant transition-colors hover:bg-surface-variant'
            }
          >
            {({ isActive }) => (
              <>
                <div className="pointer-events-none absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
                <Icon
                  name={item.icon}
                  className={`relative mr-3 ${isItemActive(item.to, isActive) ? 'text-primary' : ''}`}
                  filled={isItemActive(item.to, isActive)}
                />
                <span className="relative font-headline-md text-[14px]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant py-2 pb-4">
        <div className="flex cursor-default select-none items-center py-2 pl-5 font-medium text-on-surface-variant">
          <Icon name="help_outline" className="mr-3 text-[18px]" />
          <span className="font-label-caps text-label-caps">Help</span>
        </div>
        <div className="flex cursor-default select-none items-center py-2 pl-5 font-medium text-on-surface-variant">
          <Icon name="list_alt" className="mr-3 text-[18px]" />
          <span className="font-label-caps text-label-caps">Logs</span>
        </div>
      </div>
    </nav>
  );
}
