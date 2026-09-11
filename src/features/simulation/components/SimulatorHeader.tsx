import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/layout/Icon';
import type { SimulationRuntimeState } from '../../../types';
import { formatWorldClock, getCountryFlag, getCountryName, getWorldClockCountry, WORLD_CLOCK_COUNTRIES } from '../lib/worldClock';

type SimulatorHeaderProps = {
  runtime: SimulationRuntimeState;
  onTabChange: (tab: SimulationRuntimeState['activeTab']) => void;
  onWorldClockCountryChange: (countryCode: string) => void;
  onExit: () => void;
  viewMode?: 'tactical' | 'analysis';
};

const tabs: Array<{ id: SimulationRuntimeState['activeTab']; label: string }> = [
  { id: 'map', label: '전술 상황도' },
  { id: 'order', label: '명령 계획' },
  { id: 'analysis', label: '분석 결과' },
];

export function SimulatorHeader({ runtime, onTabChange, onWorldClockCountryChange, onExit, viewMode = 'tactical' }: SimulatorHeaderProps) {
  const [isClockMenuOpen, setIsClockMenuOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [now, setNow] = useState(() => new Date());
  const selectedCountry = getWorldClockCountry(runtime.worldClockCountryCode);
  const countries = useMemo(() => WORLD_CLOCK_COUNTRIES
    .map((country) => ({ ...country, name: getCountryName(country.code) }))
    .filter((country) => country.name.toLocaleLowerCase('ko-KR').includes(countrySearch.trim().toLocaleLowerCase('ko-KR')) || country.code.toLowerCase().includes(countrySearch.trim().toLowerCase()))
    .sort((first, second) => first.name.localeCompare(second.name, 'ko-KR')),
  [countrySearch]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectCountry = (countryCode: string) => {
    onWorldClockCountryChange(countryCode);
    setCountrySearch('');
    setIsClockMenuOpen(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-outline-variant bg-surface-container-high px-4">
      <div className="flex h-full items-center gap-4">
        <button
          className="flex items-center gap-2 rounded border border-secondary/50 bg-secondary/10 px-3 py-1.5 font-label-caps text-label-caps text-secondary transition-colors hover:bg-secondary/20"
          onClick={onExit}
        >
          <Icon name="arrow_back" className="text-[16px]" />
          EXIT SIMULATOR
        </button>
        <div className="h-5 w-px bg-outline-variant" />
        <h1 className="font-headline-md text-[18px] font-bold text-primary">{viewMode === 'analysis' ? 'ATLAS UNIT STATE ANALYSIS' : 'ATLAS COA SIMULATION'}</h1>
        {viewMode === 'tactical' && <nav className="flex h-full items-center gap-1">
          {tabs.filter(tab => tab.id !== 'analysis').map((tab) => (
            <button
              key={tab.id}
              className={`h-full border-b-2 px-4 font-label-caps text-label-caps transition-colors ${
                runtime.activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>}
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 font-data-mono text-[11px] text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
          SIMULATION READY
        </span>
        <div className="relative">
          <button
            type="button"
            aria-expanded={isClockMenuOpen}
            aria-haspopup="listbox"
            onClick={() => setIsClockMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded border border-outline-variant bg-surface px-3 py-1 font-data-mono text-[13px] text-primary transition-colors hover:border-primary"
          >
            <span className="text-[16px] leading-none" aria-hidden>{getCountryFlag(selectedCountry.code)}</span>
            <span>{getCountryName(selectedCountry.code)}</span>
            <span className="text-secondary">{formatWorldClock(selectedCountry.timeZone, now)}</span>
            <Icon name="expand_more" className={`text-[16px] transition-transform ${isClockMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isClockMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[350px] overflow-hidden rounded border border-outline-variant bg-surface-container-high shadow-xl">
              <div className="border-b border-outline-variant p-3">
                <p className="mb-2 font-label-caps text-label-caps text-on-surface-variant">WORLD CLOCK · 국가 선택</p>
                <input
                  autoFocus
                  value={countrySearch}
                  onChange={(event) => setCountrySearch(event.target.value)}
                  placeholder="국가명 또는 ISO 코드 검색"
                  className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-data-mono text-[12px] text-on-surface outline-none placeholder:text-outline focus:border-primary"
                />
              </div>
              <div role="listbox" className="max-h-[360px] overflow-y-auto p-1">
                {countries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    role="option"
                    aria-selected={country.code === selectedCountry.code}
                    onClick={() => selectCountry(country.code)}
                    className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                      country.code === selectedCountry.code ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-highest'
                    }`}
                  >
                    <span className="w-6 text-center text-[17px]" aria-hidden>{getCountryFlag(country.code)}</span>
                    <span className="min-w-0 flex-1 truncate font-data-mono text-[12px]">{country.name}</span>
                    <span className="font-data-mono text-[11px] text-secondary">{formatWorldClock(country.timeZone, now)}</span>
                  </button>
                ))}
                {countries.length === 0 && <p className="px-3 py-5 text-center font-data-mono text-[12px] text-on-surface-variant">일치하는 국가가 없습니다.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
