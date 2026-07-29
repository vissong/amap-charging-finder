import {
  Clock3,
  MapPin,
  Navigation,
  Route,
} from "lucide-react";

import { buildAmapMarkerUri } from "../../shared/amap-uri";
import type { ChargingStation } from "../../shared/contracts";
import type { ServiceAreaMatch } from "../../shared/recommendation";

interface StationCardProps {
  station: ChargingStation;
  serviceAreaMatch?: ServiceAreaMatch | null;
  recommendationOrder?: number | null;
  directionLabel?: string | null;
  showDistance?: boolean;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  const kilometers = distanceMeters / 1_000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

export function StationCard({
  station,
  serviceAreaMatch = null,
  recommendationOrder = null,
  directionLabel = null,
  showDistance = true,
}: StationCardProps) {
  const address = [station.district, station.address]
    .filter(Boolean)
    .join(" · ");
  const amapHref = buildAmapMarkerUri(station);
  const opensWebPage = amapHref.startsWith("https://");

  return (
    <article
      className={`station-card${recommendationOrder ? " is-recommended" : ""}`}
    >
      <div className="station-card__summary">
        <div
          className="station-card__rank"
          aria-label={
            recommendationOrder
              ? `推荐第 ${recommendationOrder} 名`
              : "普通站点"
          }
        >
          {recommendationOrder ?? "•"}
        </div>

        <div className="station-card__body">
          <div className="station-card__eyebrow">
            {serviceAreaMatch ? (
              <span className={`area-badge area-badge--${serviceAreaMatch.kind}`}>
                <Route aria-hidden="true" size={14} />
                {serviceAreaMatch.kind === "inside"
                  ? "服务区内"
                  : "服务区附近"}
              </span>
            ) : (
              <span>充电站</span>
            )}
            {station.openingToday && (
              <span className="opening-now">
                <Clock3 aria-hidden="true" size={13} />
                {station.openingToday}
              </span>
            )}
          </div>

          <h3>{station.name}</h3>
          {address && (
            <p className="station-card__address">
              <MapPin aria-hidden="true" size={15} />
              {address}
            </p>
          )}

          {(showDistance || directionLabel) && (
            <div className="station-card__metrics">
              {showDistance && (
                <strong>{formatDistance(station.distanceMeters)}</strong>
              )}
              {directionLabel && <span>{directionLabel}</span>}
            </div>
          )}
        </div>

        <a
          className="station-card__amap"
          href={amapHref}
          target={opensWebPage ? "_blank" : undefined}
          rel={opensWebPage ? "noreferrer" : undefined}
          aria-label={`在高德查看${station.name}`}
        >
          <Navigation aria-hidden="true" size={19} />
          <span>高德</span>
        </a>
      </div>
    </article>
  );
}
