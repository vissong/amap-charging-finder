import type { ChargingStation } from "./contracts";

export function buildAmapMarkerUri(station: ChargingStation): string {
  const url = new URL("https://uri.amap.com/marker");
  url.search = new URLSearchParams({
    position: `${station.location.lng},${station.location.lat}`,
    name: station.name,
    src: "amap-charging-finder",
    coordinate: "gaode",
    callnative: "1",
  }).toString();
  return url.toString();
}
