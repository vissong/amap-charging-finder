import { useMemo, useState } from "react";
import { BatteryCharging, ShieldCheck } from "lucide-react";

import type {
  SearchMode,
  SearchRadius,
} from "../shared/contracts";
import { bearingDegrees } from "../shared/geo";
import { associateServiceArea } from "../shared/recommendation";
import { ModeControls } from "./components/ModeControls";
import {
  RoadRadar,
  type RadarItem,
} from "./components/RoadRadar";
import { KeywordResults } from "./components/KeywordResults";
import { StateMessage } from "./components/StateMessage";
import { StationList } from "./components/StationList";
import { StationSearch } from "./components/StationSearch";
import { StatusBar } from "./components/StatusBar";
import { useChargingSearch } from "./hooks/useChargingSearch";
import { useDriveTracker } from "./hooks/useDriveTracker";
import { useStationKeywordSearch } from "./hooks/useStationKeywordSearch";
import "./styles.css";

export function App() {
  const [mode, setMode] = useState<SearchMode>("nearby");
  const [radius, setRadius] = useState<SearchRadius>(3_000);
  const tracker = useDriveTracker();
  const keywordSearch = useStationKeywordSearch();
  const search = useChargingSearch({
    latest: tracker.latest,
    motion: tracker.motion,
    mode,
    radius,
  });

  const radarItems = useMemo<RadarItem[]>(() => {
    if (!tracker.latest) return [];
    if (mode === "forward") {
      return search.ranked.map((item) => ({
        station: item.station,
        bearing: item.bearing,
        recommendationOrder: item.recommendationOrder,
        serviceAreaMatch: item.serviceAreaMatch,
      }));
    }

    return search.stations.map((station) => ({
      station,
      bearing: bearingDegrees(tracker.latest!.location, station.location),
      recommendationOrder: null,
      serviceAreaMatch:
        tracker.motion.heading === null
          ? null
          : associateServiceArea(
              station,
              search.serviceAreas,
              tracker.latest!.location,
              tracker.motion.heading,
            ),
    }));
  }, [
    mode,
    search.ranked,
    search.serviceAreas,
    search.stations,
    tracker.latest,
    tracker.motion.heading,
  ]);

  const showList =
    search.status === "success" &&
    tracker.status === "ready" &&
    radarItems.length > 0;
  const keywordSearchActive = keywordSearch.status !== "idle";
  const handleModeChange = (nextMode: SearchMode) => {
    setMode(nextMode);
    setRadius(nextMode === "nearby" ? 3_000 : 5_000);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到充电站结果
      </a>

      <header className="app-header">
        <div className="brand-lockup" aria-label="前电">
          <span className="brand-mark">
            <BatteryCharging aria-hidden="true" size={24} strokeWidth={2.4} />
          </span>
          <div>
            <strong>前电</strong>
            <small>CHARGE AHEAD</small>
          </div>
        </div>
        <div className="header-note">
          <ShieldCheck aria-hidden="true" size={17} />
          高德真实地点数据
        </div>
      </header>

      <StatusBar
        trackerStatus={tracker.status}
        accuracyMeters={tracker.latest?.accuracyMeters ?? null}
        motion={tracker.motion}
        roadContext={search.roadContext}
        highwayState={search.highwayState}
      />

      <StationSearch state={keywordSearch} />

      <main
        className={`dashboard${
          keywordSearchActive ? " dashboard--keyword" : ""
        }`}
        id="main-content"
      >
        {!keywordSearchActive && (
          <section className="radar-panel" aria-label="搜索控制与相对位置">
            <ModeControls
              mode={mode}
              radius={radius}
              onModeChange={handleModeChange}
              onRadiusChange={setRadius}
            />
            <RoadRadar
              mode={mode}
              radius={radius}
              heading={tracker.motion.heading}
              items={radarItems}
            />
          </section>
        )}

        <section className="results-panel" aria-label="充电站查询结果">
          {keywordSearchActive ? (
            <KeywordResults state={keywordSearch} />
          ) : showList ? (
            <StationList
              mode={mode}
              items={radarItems}
              truncated={search.truncated}
              onRefresh={search.retry}
              refreshing={search.refreshing}
            />
          ) : (
            <StateMessage
              trackerStatus={tracker.status}
              searchStatus={search.status}
              mode={mode}
              errorMessage={search.error?.message}
              onRetryLocation={tracker.retry}
              onRetrySearch={search.retry}
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>高速识别为定位与道路名称推断</span>
        <span>实时信息以高德地图为准</span>
      </footer>
    </div>
  );
}
