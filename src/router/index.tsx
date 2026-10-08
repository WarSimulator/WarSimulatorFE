import { loadCoaPlannerAutoStart } from '../features/simulation/lib/coaPlannerAutoStart';
import { AtomicActionLibraryPage } from '../features/simulation/pages/AtomicActionLibraryPage';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { WorkspacePage } from '../pages/WorkspacePage';
import { MettArchivePage } from '../pages/MettArchivePage';
import { MettEditorPage } from '../pages/MettEditorPage';
import { SimulationSetupPage } from '../features/simulation/pages/SimulationSetupPage';
import { SimulatorPage } from '../features/simulation/pages/SimulatorPage';
import { SimulationLibraryPage } from '../features/simulation/pages/SimulationLibraryPage';
import { SimulationDetailPage } from '../features/simulation/pages/SimulationDetailPage';
import { SimulationFinalPage } from '../features/simulation/pages/SimulationFinalPage';
import { Simulation3DEditVer0Page } from '../features/simulation/pages/Simulation3DEditVer0Page';

const routerBasename = window.location.pathname === '/simulator' || window.location.pathname.startsWith('/simulator/')
  ? '/simulator'
  : '/';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    hydrateFallbackElement: <div role="status" className="flex h-screen items-center justify-center bg-surface text-on-surface-variant">지도를 준비하고 있습니다…</div>,
    children: [
      { path: '/', element: <Navigate to="/workspace" replace /> },
      { path: '/workspace', element: <WorkspacePage /> },
      { path: '/mett', element: <MettArchivePage /> },
      { path: '/mett/:id', element: <MettEditorPage /> },
      { path: '/simulations', element: <Navigate to="/simulations/setup" replace /> },
      { path: '/simulations/setup', element: <SimulationSetupPage /> },
      { path: '/simulations/actions', element: <AtomicActionLibraryPage /> },
      { path: '/simulations/library', element: <SimulationLibraryPage /> },
      { path: '/simulations/final', element: <SimulationFinalPage /> },
      { path: '/simulations/3d', element: <SimulationFinalPage mapMode="3d" /> },
      { path: '/simulations/3d/live-edit', element: <SimulationFinalPage mapMode="3d" liveEditMode /> },
      { path: '/simulations/3d/report', element: <SimulationFinalPage mapMode="3d" reportMode /> },
      { path: '/simulations/3d-demo', element: <SimulationFinalPage mapMode="3d" demoMode /> },
      { path: '/simulations/3d-demo-cesium', element: <SimulationFinalPage mapMode="cesium" demoMode liveEditMode /> },
      { path: '/simulations/3d-demo-maplibre', loader: ({ request }) => loadCoaPlannerAutoStart(request), element: <SimulationFinalPage mapMode="maplibre" demoMode liveEditMode /> },
      { path: '/simulations/3d/edit', element: <SimulationSetupPage editorMapMode="3d" /> },
      { path: '/simulations/3d/edit-ver0', element: <Simulation3DEditVer0Page /> },
      { path: '/simulations/:simulationId', element: <SimulationDetailPage /> },
    ],
  },
  { path: '/simulations/:simulationId/run', element: <SimulatorPage /> },
], { basename: routerBasename });
