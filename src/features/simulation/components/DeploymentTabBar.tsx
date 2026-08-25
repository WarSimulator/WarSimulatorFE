import { useEffect, useRef, useState } from 'react';
import type { DeploymentSetup } from '../../../types';

type DeploymentTabBarProps = {
  deployments: DeploymentSetup[];
  activeDeploymentId?: string;
  onSelect: (deploymentId: string) => void;
  onCreateEmpty: () => void;
  onDuplicateCurrent: () => void;
  onClose: (deploymentId: string) => void;
};

export function DeploymentTabBar({
  deployments,
  activeDeploymentId,
  onSelect,
  onCreateEmpty,
  onDuplicateCurrent,
  onClose,
}: DeploymentTabBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [confirmCloseDeploymentId, setConfirmCloseDeploymentId] = useState<string | undefined>();
  const [closingDeploymentIds, setClosingDeploymentIds] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasActiveDeployment = Boolean(activeDeploymentId && deployments.some((deployment) => deployment.id === activeDeploymentId));
  const confirmCloseDeployment = deployments.find((deployment) => deployment.id === confirmCloseDeploymentId);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const closeDeployment = (deploymentId: string) => {
    if (closingDeploymentIds.includes(deploymentId)) return;
    if (deployments.length === 1) {
      setConfirmCloseDeploymentId(deploymentId);
      return;
    }

    setClosingDeploymentIds((current) => [...current, deploymentId]);
    window.setTimeout(() => {
      onClose(deploymentId);
      setClosingDeploymentIds((current) => current.filter((id) => id !== deploymentId));
    }, 180);
  };

  const confirmCloseLastDeployment = () => {
    if (!confirmCloseDeploymentId) return;
    onClose(confirmCloseDeploymentId);
    setConfirmCloseDeploymentId(undefined);
  };

  return (
    <div className="relative z-20 border-b border-outline-variant bg-surface-container-low">
      <div className="flex min-h-[46px] items-end gap-1 px-3 pt-2">
        <div className="flex w-fit max-w-[calc(100%-40px)] flex-none items-end gap-1 overflow-x-auto overflow-y-hidden">
          {deployments.map((deployment) => {
            const isActive = deployment.id === activeDeploymentId;
            const isClosing = closingDeploymentIds.includes(deployment.id);
            return (
              <div
                key={deployment.id}
                className={`group relative flex h-9 min-w-[176px] max-w-[220px] origin-bottom items-center gap-2 overflow-hidden rounded-t border px-3 pr-7 transition-all duration-200 ${
                  isClosing
                    ? 'w-0 min-w-0 border-transparent px-0 opacity-0'
                    : isActive
                      ? 'border-outline-variant border-b-surface-container-high bg-surface-container-high text-on-surface shadow-[inset_0_-2px_0_#ffb95f]'
                      : 'border-outline-variant bg-surface text-on-surface-variant opacity-80 hover:bg-surface-variant hover:text-on-surface'
                }`}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left font-data-mono text-[11px]"
                  title={deployment.name}
                  onClick={() => onSelect(deployment.id)}
                >
                  {deployment.name}
                </button>
                <button
                  className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-[14px] leading-none text-outline transition-colors hover:bg-error-container/40 hover:text-error"
                  aria-label={`Close ${deployment.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeDeployment(deployment.id);
                  }}
                >
                  x
                </button>
                {isActive && <span className="absolute bottom-0 left-0 h-px w-full bg-secondary transition-all duration-200" />}
              </div>
            );
          })}
        </div>

        {deployments.length > 0 && (
          <div ref={menuRef} className="relative shrink-0 pb-0.5">
            <button
              className="grid h-8 w-8 place-items-center bg-transparent font-data-mono text-[22px] leading-none text-secondary transition-colors hover:text-on-surface"
              aria-label="Add deployment"
              onClick={() => setIsMenuOpen((current) => !current)}
            >
              +
            </button>
            {isMenuOpen && (
              <div className="absolute left-0 top-9 z-50 w-[230px] rounded border border-outline-variant bg-surface-container-high p-1 shadow-xl">
                <button
                  className="w-full rounded px-3 py-2 text-left font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onCreateEmpty();
                  }}
                >
                  Create Empty Deployment
                </button>
                <button
                  className="w-full rounded px-3 py-2 text-left font-data-mono text-[11px] text-on-surface transition-colors enabled:hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!hasActiveDeployment}
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDuplicateCurrent();
                  }}
                >
                  Duplicate Current Deployment
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmCloseDeployment && (
        <div className="absolute right-3 top-[50px] z-50 w-[320px] rounded border border-outline-variant bg-surface-container-high p-4 shadow-xl">
          <p className="font-label-caps text-label-caps text-error">DELETE LAST DEPLOYMENT?</p>
          <p className="mt-2 font-body-base text-[12px] leading-5 text-on-surface-variant">
            This will remove <span className="font-data-mono text-on-surface">{confirmCloseDeployment.name}</span> and return Deployment Setup to the initial empty state.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded border border-outline-variant px-3 py-2 font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
              onClick={() => setConfirmCloseDeploymentId(undefined)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-error/60 bg-error-container/30 px-3 py-2 font-data-mono text-[11px] text-error transition-colors hover:bg-error-container/50"
              onClick={confirmCloseLastDeployment}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
