import { useState } from "react";
import {
  ChevronDown,
  Clock3,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
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
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  const kilometers = distanceMeters / 1_000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

function coordinateLabel(
  value: ChargingStation["entrance"],
): string | null {
  return value ? `${value.lng.toFixed(6)}, ${value.lat.toFixed(6)}` : null;
}

export function StationCard({
  station,
  serviceAreaMatch = null,
  recommendationOrder = null,
  directionLabel = null,
}: StationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const address = [station.district, station.address]
    .filter(Boolean)
    .join(" · ");
  const entrance = coordinateLabel(station.entrance);
  const exit = coordinateLabel(station.exit);

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

          <div className="station-card__metrics">
            <strong>{formatDistance(station.distanceMeters)}</strong>
            {directionLabel && <span>{directionLabel}</span>}
          </div>
        </div>

        <button
          className="station-card__toggle"
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "收起" : "展开"}${station.name}详情`}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown aria-hidden="true" size={22} />
        </button>
      </div>

      <div className="station-card__reveal" data-expanded={expanded}>
        <div className="station-card__details">
          <dl className="poi-details">
            {station.alias && (
              <div>
                <dt>别名</dt>
                <dd>{station.alias}</dd>
              </div>
            )}
            {station.type && (
              <div>
                <dt>高德分类</dt>
                <dd>{station.type}</dd>
              </div>
            )}
            {station.openingWeek && (
              <div>
                <dt>营业时间</dt>
                <dd>{station.openingWeek}</dd>
              </div>
            )}
            {entrance && (
              <div>
                <dt>入口坐标</dt>
                <dd>{entrance}</dd>
              </div>
            )}
            {exit && (
              <div>
                <dt>出口坐标</dt>
                <dd>{exit}</dd>
              </div>
            )}
          </dl>

          {station.children.length > 0 && (
            <div className="poi-children">
              <span>关联地点</span>
              <ul>
                {station.children.map((child) => (
                  <li key={child.id}>
                    {child.name}
                    {child.address ? ` · ${child.address}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {station.photos.length > 0 && (
            <div className="poi-photos">
              {station.photos.slice(0, 3).map((photo) => (
                <img
                  key={photo.url}
                  src={photo.url}
                  alt={photo.title ?? `${station.name}实景`}
                  loading="lazy"
                />
              ))}
            </div>
          )}

          <p className="data-boundary">
            实时充电信息请前往高德地图查看
          </p>

          <div className="station-card__actions">
            {station.phone && (
              <a className="station-action station-action--secondary" href={`tel:${station.phone}`}>
                <Phone aria-hidden="true" size={18} />
                联系站点
              </a>
            )}
            <a
              className="station-action station-action--primary"
              href={buildAmapMarkerUri(station)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation aria-hidden="true" size={18} />
              在高德查看
              <ExternalLink aria-hidden="true" size={15} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
