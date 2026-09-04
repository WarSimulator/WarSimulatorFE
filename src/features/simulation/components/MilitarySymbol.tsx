import { useMemo } from 'react';
import { createMilitarySymbolSvg } from '../lib/symbolSvg';

type MilitarySymbolProps = {
  sidc: string;
  size?: number;
  label?: string;
  standard?: '2525' | 'APP6';
};

export function MilitarySymbol({ sidc, size = 42, label, standard }: MilitarySymbolProps) {
  const svg = useMemo(
    () => createMilitarySymbolSvg(sidc, size, label, standard),
    [label, sidc, size, standard],
  );

  return <span className="inline-flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}
