import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { WorkspacePage } from '../pages/WorkspacePage';
import { MettArchivePage } from '../pages/MettArchivePage';
import { MettEditorPage } from '../pages/MettEditorPage';
import { SimulationSetupPage } from '../features/simulation/pages/SimulationSetupPage';
import { SimulatorPage } from '../features/simulation/pages/SimulatorPage';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/workspace" replace /> },
      { path: '/workspace', element: <WorkspacePage /> },
      { path: '/mett', element: <MettArchivePage /> },
      { path: '/mett/:id', element: <MettEditorPage /> },
      { path: '/simulations', element: <SimulationSetupPage /> },
    ],
  },
  { path: '/simulations/:simulationId/run', element: <SimulatorPage /> },
]);
