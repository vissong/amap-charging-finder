import {
  CircleAlert,
  Navigation,
  RefreshCw,
  SearchX,
} from "lucide-react";

import type { StationKeywordSearchState } from "../hooks/useStationKeywordSearch";
import { StationCard } from "./StationCard";

interface KeywordResultsProps {
  state: StationKeywordSearchState;
}

export function KeywordResults({ state }: KeywordResultsProps) {
  if (state.status === "loading") {
    return (
      <div className="station-skeleton" aria-label="正在搜索指定充电站">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="state-message">
        <SearchX aria-hidden="true" size={30} />
        <h2>没有找到匹配的充电站</h2>
        <p>换一个服务区、充电站或地点名称再试。</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="state-message state-message--warning">
        <CircleAlert aria-hidden="true" size={30} />
        <h2>指定地点查询未完成</h2>
        <p>{state.error?.message ?? "网络或高德服务暂时不可用。"}</p>
        {state.query && (
          <button type="button" onClick={state.retry}>
            <RefreshCw aria-hidden="true" size={18} />
            重新搜索
          </button>
        )}
      </div>
    );
  }

  if (state.status !== "success") return null;

  return (
    <div className="station-list station-list--keyword">
      <div className="station-list__heading">
        <div>
          <span>SEARCH</span>
          <h2>搜索结果</h2>
        </div>
        <strong>
          <Navigation aria-hidden="true" size={16} />
          {state.stations.length}
        </strong>
      </div>
      <div className="station-list__items">
        {state.stations.map((station) => (
          <StationCard
            key={station.id}
            station={station}
            showDistance={false}
          />
        ))}
      </div>
    </div>
  );
}
