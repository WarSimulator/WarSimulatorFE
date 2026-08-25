type ObjectiveSymbolProps = {
  size?: number;
};

export function ObjectiveSymbol({ size = 42 }: ObjectiveSymbolProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="13" fill="rgba(255,185,95,0.12)" stroke="#ffb95f" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M21 10v22M10 21h22" stroke="#ffb95f" strokeWidth="2" />
      <circle cx="21" cy="21" r="3" fill="#ffb95f" />
    </svg>
  );
}
