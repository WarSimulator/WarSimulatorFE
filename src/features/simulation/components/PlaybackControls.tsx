import { Icon } from '../../../components/layout/Icon';
import { timelineEvents as mockTimelineEvents } from '../../../mocks/timeline';
import { SIMULATION_DURATION, formatSimulationClock } from '../lib/runtime';
import type { SimulationResultEvent } from '../../../types';

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

type PlaybackControlsProps = {
  simulationTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  startTime?: number;
  endTime?: number;
  events?: SimulationResultEvent[];
  onTimeChange: (time: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSpeedChange: (speed: number) => void;
};

export function PlaybackControls({
  simulationTime,
  isPlaying,
  playbackSpeed,
  startTime = 0,
  endTime = SIMULATION_DURATION,
  events,
  onTimeChange,
  onPlayingChange,
  onSpeedChange,
}: PlaybackControlsProps) {
  const duration = Math.max(1, endTime - startTime);
  const percent = ((simulationTime - startTime) / duration) * 100;
  const timelineEvents = events?.map((event) => ({ time: event.time, label: `${event.type} ${event.actor}` })) ?? mockTimelineEvents;

  return (
    <footer className="h-[112px] border-t border-outline-variant bg-surface-container/95 p-4">
      <div className="flex h-full items-center gap-6">
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 items-center justify-center rounded border border-outline-variant px-3 font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => {
              onPlayingChange(false);
              onTimeChange(startTime);
            }}
          >
            Restart
          </button>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(245,245,245,0.15)] transition-colors hover:bg-primary hover:text-on-primary"
            onClick={() => onPlayingChange(!isPlaying)}
          >
            <Icon name={isPlaying ? 'pause' : 'play_arrow'} className="text-[25px]" filled={!isPlaying} />
          </button>
          <button
            className="flex h-9 items-center justify-center rounded border border-outline-variant px-3 font-data-mono text-[11px] text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => onTimeChange(Math.min(endTime, simulationTime + 10))}
          >
            +10 sec
          </button>
        </div>

        <div className="flex overflow-hidden rounded border border-outline-variant bg-surface">
          {PLAYBACK_SPEEDS.map((speed) => (
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
            <span>{formatSimulationClock(endTime)}</span>
          </div>
          <input
            type="range"
            min={startTime}
            max={endTime}
            step={0.05}
            value={simulationTime}
            onChange={(event) => onTimeChange(Number(event.target.value))}
            className="w-full accent-primary"
          />
          <div className="relative h-4">
            {timelineEvents.map((event) => (
              <span
                key={event.label}
                className="absolute top-0 h-3 w-px bg-outline-variant"
                style={{ left: `${((event.time - startTime) / duration) * 100}%` }}
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
