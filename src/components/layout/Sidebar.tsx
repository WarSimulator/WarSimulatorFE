import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

const navItems = [
  { to: '/workspace', label: 'Workspace', icon: 'dashboard' },
  { to: '/mett', label: 'METT-TC', icon: 'assignment' },
];

const simulationItems = [
  { to: '/simulations/setup', label: 'Mil-Simulator Setup', icon: 'precision_manufacturing' },
  { to: '/simulations/library', label: 'Mil-Simulator Library', icon: 'database' },
  { to: '/simulations/final', label: 'Mil-Simulator Final', icon: 'play_circle' },
  { to: '/simulations/3d', label: 'Mil-Simulator 3D', icon: 'view_in_ar' },
  { to: '/simulations/3d/report', label: 'Mil-Simulator 3D Report', icon: 'bug_report' },
  { to: '/simulations/3d/edit', label: 'Mil-Simulator 3D EDIT', icon: 'edit_location_alt' },
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
        <img src="/softonnet-logo.png" alt="SoftOnNet" className="h-auto w-full object-contain" />
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

        <div className="mb-2 mt-4">
          <div className="mb-2 px-5 font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant opacity-70">MIL-SIMULATOR</div>
          {simulationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                isActive || (item.to === '/simulations/library' && /^\/simulations\/[^/]+$/.test(location.pathname) && !['/simulations/setup', '/simulations/final', '/simulations/3d', '/simulations/3d/report', '/simulations/3d/edit', '/simulations/actions'].includes(location.pathname))
                  ? 'group relative flex items-center border-l-4 border-secondary bg-surface-container-high py-2 pl-8 font-bold text-secondary transition-colors'
                  : 'group relative flex items-center py-2 pl-9 font-medium text-on-surface-variant transition-colors hover:bg-surface-variant'
              }
            >
              {({ isActive }) => {
                const active =
                  isActive ||
                  (item.to === '/simulations/library' &&
                    /^\/simulations\/[^/]+$/.test(location.pathname) &&
                    !['/simulations/setup', '/simulations/final', '/simulations/3d', '/simulations/3d/report', '/simulations/3d/edit', '/simulations/actions'].includes(location.pathname));

                return (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-secondary/5 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Icon name={item.icon} className={`relative mr-3 text-[18px] ${active ? 'text-secondary' : ''}`} filled={active} />
                    <span className="relative font-label-caps text-label-caps">{item.label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant py-2 pb-4">
        <div className="px-4 pb-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded bg-secondary py-2 font-label-caps text-label-caps text-on-secondary shadow-[0_0_10px_rgba(255,185,95,0.2)] transition-colors hover:bg-secondary-container"
            onClick={() => navigate('/workspace')}
          >
            <Icon name="add" className="text-[16px]" filled />
            NEW OPERATION
          </button>
        </div>
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
