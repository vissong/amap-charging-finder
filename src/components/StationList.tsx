import { Navigation } from "lucide-react";

import type { SearchMode } from "../../shared/contracts";
import type { RadarItem } from "./RoadRadar";
import { StationCard } from "./StationCard";

interface StationListProps {
  mode: SearchMode;
  items: RadarItem[];
}

function directionLabel(bearing: number): string {
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(bearing / 45) % directions.length];
}

export function StationList({ mode, items }: StationListProps) {
  return (
    <div className="station-list">
      <div className="station-list__heading">
        <div>
          <span>{mode === "forward" ? "FORWARD" : "NEARBY"}</span>
          <h2>{mode === "forward" ? "前方建议" : "附近站点"}</h2>
        </div>
        <strong>
          <Navigation aria-hidden="true" size={16} />
          {items.length}
        </strong>
      </div>
      <div className="station-list__items">
        {items.map((item) => (
          <StationCard
            key={item.station.id}
            station={item.station}
            serviceAreaMatch={item.serviceAreaMatch}
            recommendationOrder={item.recommendationOrder}
            directionLabel={`${directionLabel(item.bearing)}向`}
          />
        ))}
      </div>
    </div>
  );
}
