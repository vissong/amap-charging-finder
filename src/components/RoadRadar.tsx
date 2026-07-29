import type { ChargingStation, SearchMode } from "../../shared/contracts";
import type { ServiceAreaMatch } from "../../shared/recommendation";

export interface RadarItem {
  station: ChargingStation;
  bearing: number;
  recommendationOrder: number | null;
  serviceAreaMatch: ServiceAreaMatch | null;
}

interface RoadRadarProps {
  mode: SearchMode;
  radius: number;
  heading: number | null;
  items: RadarItem[];
}

function markerPosition(
  item: RadarItem,
  radius: number,
  heading: number,
  originY: number,
): { x: number; y: number } {
  const relative = ((item.bearing - heading) * Math.PI) / 180;
  const radialDistance =
    Math.min(item.station.distanceMeters / radius, 1) * 112;
  return {
    x: 160 + Math.sin(relative) * radialDistance,
    y: originY - Math.cos(relative) * radialDistance,
  };
}

export function RoadRadar({
  mode,
  radius,
  heading,
  items,
}: RoadRadarProps) {
  const originY = mode === "forward" ? 230 : 145;
  const radarHeading = heading ?? 0;

  return (
    <figure className={`road-radar road-radar--${mode}`}>
      <div className="radar-heading">
        <span>相对位置</span>
        <strong>{radius / 1_000} km</strong>
      </div>
      <svg
        viewBox="0 0 320 290"
        role="img"
        aria-label="充电站相对位置雷达"
      >
        {mode === "forward" && (
          <path
            className="radar-sector"
            d={`M 160 ${originY} L 63 ${originY - 56} A 112 112 0 0 1 257 ${originY - 56} Z`}
          />
        )}
        {[37, 75, 112].map((ring, index) => (
          <circle
            className="radar-ring"
            key={ring}
            cx="160"
            cy={originY}
            r={ring}
            data-ring={index + 1}
          />
        ))}
        <line
          className="radar-axis"
          x1="160"
          y1={originY}
          x2="160"
          y2={Math.max(18, originY - 128)}
        />
        <text className="radar-north" x="160" y="16" textAnchor="middle">
          前方
        </text>

        <g
          className="radar-sweep"
          style={{ transformOrigin: `160px ${originY}px` }}
          aria-hidden="true"
        >
          <path
            className="radar-sweep__trail"
            d={`M 160 ${originY} L 160 ${originY - 112} A 112 112 0 0 1 225.83 ${originY - 90.61} Z`}
          />
          <line
            className="radar-sweep__beam"
            x1="160"
            y1={originY}
            x2="160"
            y2={originY - 112}
          />
        </g>

        {items.slice(0, 25).map((item, index) => {
          const point = markerPosition(
            item,
            radius,
            radarHeading,
            originY,
          );
          const label = item.recommendationOrder ?? index + 1;
          return (
            <g
              className={`radar-marker${item.serviceAreaMatch ? " is-service-area" : ""}${item.recommendationOrder ? " is-recommended" : ""}`}
              key={item.station.id}
              transform={`translate(${point.x} ${point.y})`}
              aria-label={`${item.station.name}，距离 ${Math.round(item.station.distanceMeters)} 米`}
            >
              <circle r={item.recommendationOrder ? 12 : 9} />
              <text y="1" textAnchor="middle" dominantBaseline="middle">
                {label}
              </text>
            </g>
          );
        })}

        <g className="vehicle-marker" transform={`translate(160 ${originY})`}>
          <path d="M 0 -15 L 10 11 L 0 7 L -10 11 Z" />
          <circle r="3" />
        </g>
      </svg>
      <figcaption>
        <span>相对方向与距离</span>
        <small>非地图 · 位置随定位更新</small>
      </figcaption>
    </figure>
  );
}
