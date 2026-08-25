import ms from 'milsymbol';
import { useMemo } from 'react';

type MilitarySymbolProps = {
  sidc: string;
  size?: number;
  label?: string;
};

export function MilitarySymbol({ sidc, size = 42, label }: MilitarySymbolProps) {
  const svg = useMemo(
    () =>
      new ms.Symbol(sidc, {
        size,
        uniqueDesignation: label,
        infoFields: Boolean(label),
      }).asSVG(),
    [label, sidc, size],
  );

  return <span className="inline-flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}
