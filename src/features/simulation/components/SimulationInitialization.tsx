import { initializationSteps } from '../../../mocks/simulations';

type SimulationInitializationProps = {
  activeStep: number;
};

export function SimulationInitialization({ activeStep }: SimulationInitializationProps) {
  return (
    <div className="glass-panel rounded border border-secondary/40 p-5">
      <p className="font-label-caps text-label-caps tracking-widest text-secondary">INITIALIZING SIMULATION</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {initializationSteps.map((step, index) => (
          <div key={step} className="flex items-center gap-2 font-data-mono text-[12px]">
            <span className={`h-1.5 w-1.5 rounded-full ${index <= activeStep ? 'bg-secondary' : 'bg-outline-variant'}`} />
            <span className={index <= activeStep ? 'text-on-surface' : 'text-outline'}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
