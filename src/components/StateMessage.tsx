import {
  CircleAlert,
  LocateFixed,
  RefreshCw,
  Route,
  SearchX,
} from "lucide-react";

import type { SearchMode } from "../../shared/contracts";
import type { ChargingSearchState } from "../hooks/useChargingSearch";
import type {
  DriveTrackerState,
  DriveTrackerStatus,
} from "../hooks/useDriveTracker";

interface StateMessageProps {
  trackerStatus: DriveTrackerStatus;
  searchStatus: ChargingSearchState["status"];
  mode: SearchMode;
  errorMessage?: string | null;
  onRetryLocation: DriveTrackerState["retry"];
  onRetrySearch: ChargingSearchState["retry"];
}

export function StateMessage({
  trackerStatus,
  searchStatus,
  mode,
  errorMessage,
  onRetryLocation,
  onRetrySearch,
}: StateMessageProps) {
  if (trackerStatus === "permission-denied") {
    return (
      <div className="state-message state-message--warning">
        <LocateFixed aria-hidden="true" size={30} />
        <h2>无法定位，开启位置权限后再试</h2>
        <p>浏览器需要精确位置，才能查找真实的附近充电站。</p>
        <button type="button" onClick={onRetryLocation}>
          <RefreshCw aria-hidden="true" size={18} />
          重新定位
        </button>
      </div>
    );
  }

  if (
    trackerStatus === "unsupported" ||
    trackerStatus === "unavailable" ||
    trackerStatus === "timeout"
  ) {
    return (
      <div className="state-message state-message--warning">
        <CircleAlert aria-hidden="true" size={30} />
        <h2>当前位置暂时不可用</h2>
        <p>确认设备定位已开启，并在 HTTPS 页面中重新尝试。</p>
        <button type="button" onClick={onRetryLocation}>
          <RefreshCw aria-hidden="true" size={18} />
          重新定位
        </button>
      </div>
    );
  }

  if (trackerStatus === "locating" || searchStatus === "idle") {
    return (
      <div className="state-message state-message--loading" aria-live="polite">
        <div className="locator-pulse" aria-hidden="true" />
        <h2>正在获取精确位置</h2>
        <p>首次定位可能需要几秒。</p>
      </div>
    );
  }

  if (searchStatus === "awaiting-direction") {
    return (
      <div className="state-message">
        <Route aria-hidden="true" size={30} />
        <h2>行驶一段距离后自动推荐</h2>
        <p>方向稳定后，将筛选车头前方左右各 60° 的充电站。</p>
      </div>
    );
  }

  if (searchStatus === "loading") {
    return (
      <div className="station-skeleton" aria-label="正在搜索充电站">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (searchStatus === "empty") {
    return (
      <div className="state-message">
        <SearchX aria-hidden="true" size={30} />
        <h2>{mode === "forward" ? "前方暂无充电站" : "当前范围暂无充电站"}</h2>
        <p>扩大搜索范围，或切换到附近充电查看全部方向。</p>
      </div>
    );
  }

  if (searchStatus === "error") {
    return (
      <div className="state-message state-message--warning">
        <CircleAlert aria-hidden="true" size={30} />
        <h2>充电站查询未完成</h2>
        <p>{errorMessage ?? "网络或高德服务暂时不可用。"}</p>
        <button type="button" onClick={onRetrySearch}>
          <RefreshCw aria-hidden="true" size={18} />
          重新查询
        </button>
      </div>
    );
  }

  return null;
}
