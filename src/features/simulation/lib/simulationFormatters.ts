const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatSimulationCreatedAt(value: string) {
  const date = new Date(value);
  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const time = timeFormatter.format(date);

  if (dayDiff === 0) {
    return `Today ${time}`;
  }

  if (dayDiff === 1) {
    return `Yesterday ${time}`;
  }

  return `${monthFormatter.format(date)} ${time}`;
}
