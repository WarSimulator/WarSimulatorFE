import { Icon } from '../../../components/layout/Icon';
import { timelineEvents } from '../../../mocks/timeline';
import { SIMULATION_DURATION, clampSimulationTime, formatSimulationClock } from '../lib/runtime';

type PlaybackControlsProps = {
  simulationTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onTimeChange: (time: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSpeedChange: (speed: number) => void;
};

export function PlaybackControls({ simulationTime, isPlaying, playbackSpeed, onTimeChange, onPlayingChange, onSpeedChange }: PlaybackControlsProps) {
  const percent = (simulationTime / SIMULATION_DURATION) * 100;

  return (
    <footer className="h-[112px] border-t border-outline-variant bg-surface-container/95 p-4">
      <div className="flex h-full items-center gap-6">
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 items-center justify-center rounded border border-outline-variant px-3 font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => onTimeChange(clampSimulationTime(simulationTime - 10))}
          >
            -10 sec
          </button>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(245,245,245,0.15)] transition-colors hover:bg-primary hover:text-on-primary"
            onClick={() => onPlayingChange(!isPlaying)}
          >
            <Icon name={isPlaying ? 'pause' : 'play_arrow'} className="text-[25px]" filled={!isPlaying} />
          </button>
          <button
            className="flex h-9 items-center justify-center rounded border border-outline-variant px-3 font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => onTimeChange(clampSimulationTime(simulationTime + 10))}
          >
            +10 sec
          </button>
        </div>

        <div className="flex overflow-hidden rounded border border-outline-variant bg-surface">
          {[1, 5, 10].map((speed) => (
            <button
              key={speed}
              className={`border-r border-outline-variant px-3 py-1.5 font-data-mono text-[11px] last:border-r-0 ${
                playbackSpeed === speed ? 'bg-primary/20 font-bold text-primary' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`}
              onClick={() => onSpeedChange(speed)}
            >
              x{speed}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex justify-between px-1 font-data-mono text-[10px] text-on-surface-variant">
            <span>00:00</span>
            <span className="font-bold text-primary">{formatSimulationClock(simulationTime)} CURRENT</span>
            <span>10:00</span>
          </div>
          <input
            type="range"
            min={0}
            max={SIMULATION_DURATION}
            value={simulationTime}
            onChange={(event) => onTimeChange(Number(event.target.value))}
            className="w-full accent-primary"
          />
          <div className="relative h-4">
            {timelineEvents.map((event) => (
              <span
                key={event.label}
                className="absolute top-0 h-3 w-px bg-outline-variant"
                style={{ left: `${(event.time / SIMULATION_DURATION) * 100}%` }}
                title={event.label}
              />
            ))}
            <div className="absolute top-1 h-1 rounded bg-primary/60" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </footer>
  );
}
