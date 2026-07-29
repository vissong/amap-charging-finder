import { Navigation, RefreshCw } from "lucide-react";

import type { SearchMode } from "../../shared/contracts";
import type { RadarItem } from "./RoadRadar";
import { StationCard } from "./StationCard";

interface StationListProps {
  mode: SearchMode;
  items: RadarItem[];
  truncated?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function directionLabel(bearing: number): string {
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(bearing / 45) % directions.length];
}

export function StationList({
  mode,
  items,
  truncated = false,
  onRefresh,
  refreshing = false,
}: StationListProps) {
  const visibleItems = items.slice(0, 50);
  const hasMoreResults = truncated || items.length > visibleItems.length;

  return (
    <div className="station-list">
      <div className="station-list__heading">
        <div>
          <span>{mode === "forward" ? "FORWARD" : "NEARBY"}</span>
          <h2>{mode === "forward" ? "前方建议" : "附近站点"}</h2>
        </div>
        <div className="station-list__tools">
          <strong title={hasMoreResults ? "结果已达到查询上限" : undefined}>
            <Navigation aria-hidden="true" size={16} />
            {visibleItems.length}
            {hasMoreResults ? "+" : ""}
          </strong>
          {onRefresh && (
            <button
              type="button"
              aria-label={
                refreshing
                  ? "正在刷新充电站结果"
                  : "刷新充电站结果"
              }
              data-refreshing={refreshing}
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw aria-hidden="true" size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="station-list__items">
        {visibleItems.map((item) => (
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
