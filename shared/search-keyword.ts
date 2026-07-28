export interface StationKeyword {
  display: string;
  submitted: string;
}

const chargingQualifier = /充电(?:站|桩)/u;

export function normalizeStationKeyword(
  input: string,
): StationKeyword | null {
  const display = input.trim().replace(/\s+/gu, " ");
  if (!display) return null;

  const submitted = chargingQualifier.test(display)
    ? display
    : `${display} 充电站`;

  return submitted.length <= 80 ? { display, submitted } : null;
}
