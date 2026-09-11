import { useMemo } from 'react';
import { createMilitarySymbolSvg } from '../lib/symbolSvg';

type MilitarySymbolProps = {
  sidc: string;
  size?: number;
  label?: string;
};

export function MilitarySymbol({ sidc, size = 42, label }: MilitarySymbolProps) {
  const svg = useMemo(
    () => createMilitarySymbolSvg(sidc, size, label),
    [label, sidc, size],
  );

  return <span className="inline-flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}
