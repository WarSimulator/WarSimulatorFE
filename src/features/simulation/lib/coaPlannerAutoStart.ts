import { redirect } from 'react-router-dom';
import { buildFinalSimulation, saveFinalSimulation } from './finalSimulation';
import offensive from '../../../../plan/ver1/offensive.json';
import defensive from '../../../../plan/ver1/defensive.json';
import deployment from '../../../../plan/ver1/unit.json';

/** Prepare the planner handoff before mounting the Simulator workspace. */
export async function loadCoaPlannerAutoStart(request: Request) {
  if (new URL(request.url).searchParams.get('coaPlannerAutoStart') !== '1') return null;

  const build = await buildFinalSimulation({ blueForce: offensive, redForce: defensive, deployment }, { mode: 'strict' });
  saveFinalSimulation(build);
  return redirect(`/simulations/${build.simulationId}/run?view=tactical&window=simulation&map=maplibre&visualization=atomic3d&edit=live`);
}
