import { Icon } from '../../../components/layout/Icon';
import type { ScenarioSummary, SimulationOptionKey, SimulationSetupState } from '../../../types';

type SimulationParametersProps = {
  state: SimulationSetupState;
  scenario: ScenarioSummary;
  onChange: (state: SimulationSetupState) => void;
  onStart: () => void;
  isInitializing: boolean;
};

const optionLabels: Array<{ key: SimulationOptionKey; label: string }> = [
  { key: 'fogOfWar', label: 'Enable Fog of War' },
  { key: 'recordTelemetry', label: 'Record Telemetry for AAR' },
  { key: 'dynamicWeather', label: 'Inject Dynamic Weather Events' },
  { key: 'manualIntervention', label: 'Allow Manual Intervention' },
];

export function SimulationParameters({ state, scenario, onChange, onStart, isInitializing }: SimulationParametersProps) {
  const setOption = (key: SimulationOptionKey, value: boolean) => {
    onChange({
      ...state,
      options: {
        ...state.options,
        [key]: value,
      },
    });
  };

  return (
    <section className="flex min-h-[620px] flex-col rounded border border-outline-variant bg-surface-container-high">
      <div className="border-b border-outline-variant bg-surface-container p-4">
        <h3 className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface">
          <Icon name="tune" className="text-[18px] text-primary" />
          SIMULATION PARAMETERS
        </h3>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h4 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">Engine Configuration</h4>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-2">
              <span className="font-data-mono text-[10px] text-outline">FIDELITY MODE</span>
              <select
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={state.fidelityMode}
                onChange={(event) => onChange({ ...state, fidelityMode: event.target.value as SimulationSetupState['fidelityMode'] })}
              >
                <option>Rapid</option>
                <option>Balanced</option>
                <option>High Fidelity</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-data-mono text-[10px] text-outline">TIME SCALE</span>
              <select
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={state.timeScale}
                onChange={(event) => onChange({ ...state, timeScale: event.target.value as SimulationSetupState['timeScale'] })}
              >
                <option>1x</option>
                <option>5x</option>
                <option>10x</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-data-mono text-[10px] text-outline">RANDOM SEED</span>
              <input
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none focus:border-primary"
                value={state.randomSeed}
                onChange={(event) => onChange({ ...state, randomSeed: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section>
          <h4 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">Active Scenario Summary</h4>
          <div className="divide-y divide-outline-variant rounded border border-outline-variant bg-surface">
            {[
              ['MISSION TYPE', scenario.missionType],
              ["COMMANDER'S INTENT", scenario.commanderIntent],
              ['ENEMY FORCES', scenario.enemyForces],
              ['ROE CONSTRAINTS', scenario.roeConstraints],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[160px_1fr] gap-4 p-3">
                <span className="font-label-caps text-[10px] text-outline">{label}</span>
                <span className="font-body-base text-[13px] text-on-surface">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-3 font-label-caps text-label-caps text-on-surface-variant">Options</h4>
          <div className="grid grid-cols-2 gap-3">
            {optionLabels.map((option) => (
              <label key={option.key} className="flex cursor-pointer items-center gap-3 rounded border border-outline-variant bg-surface p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-secondary"
                  checked={state.options[option.key]}
                  onChange={(event) => setOption(option.key, event.target.checked)}
                />
                <span className="font-data-mono text-[12px] text-on-surface">{option.label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-outline-variant bg-surface-container p-4">
        <button
          className="flex w-full items-center justify-center gap-2 rounded bg-secondary py-3 font-label-caps text-label-caps font-bold text-on-secondary transition-colors hover:bg-secondary-container disabled:cursor-wait disabled:opacity-70"
          onClick={onStart}
          disabled={isInitializing}
        >
          <Icon name={isInitializing ? 'sync' : 'play_arrow'} className="text-[18px]" filled={!isInitializing} />
          START SIMULATION
        </button>
      </div>
    </section>
  );
}
