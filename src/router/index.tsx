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

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
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
      { path: '/simulations/:simulationId', element: <SimulationDetailPage /> },
    ],
  },
  { path: '/simulations/:simulationId/run', element: <SimulatorPage /> },
]);
