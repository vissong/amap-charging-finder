import type { ChargingStation } from "./contracts";

function isMobileH5(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function buildAmapMarkerUri(
  station: ChargingStation,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string {
  if (isMobileH5(userAgent)) {
    const search = new URLSearchParams({
      poiname: station.name,
      lat: String(station.location.lat),
      lon: String(station.location.lng),
      poiid: station.id,
    });
    return `amapuri://poi/detail?${search.toString()}`;
  }

  const url = new URL("https://uri.amap.com/marker");
  url.search = new URLSearchParams({
    poiid: station.id,
    src: "amap-charging-finder",
    callnative: "1",
  }).toString();
  return url.toString();
}
