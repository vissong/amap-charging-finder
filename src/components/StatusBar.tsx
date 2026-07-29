import {
  Compass,
  Gauge,
  LocateFixed,
  Route,
} from "lucide-react";

import type {
  HighwayState,
  RoadContext,
} from "../../shared/contracts";
import type { MotionSnapshot } from "../../shared/motion";
import type { DriveTrackerStatus } from "../hooks/useDriveTracker";

interface StatusBarProps {
  trackerStatus: DriveTrackerStatus;
  accuracyMeters: number | null;
  motion: MotionSnapshot;
  roadContext: RoadContext | null;
  highwayState: HighwayState;
}

const trackerLabels: Record<DriveTrackerStatus, string> = {
  locating: "定位中",
  ready: "定位正常",
  "permission-denied": "等待权限",
  unavailable: "位置不可用",
  timeout: "定位超时",
  unsupported: "不支持定位",
};

const highwayLabels: Record<HighwayState, string> = {
  normal: "普通道路",
  possible: "可能在高速",
  confirmed: "已识别高速",
};

function headingLabel(heading: number | null): string {
  if (heading === null) return "等待方向";

  const degrees = ((Math.round(heading) % 360) + 360) % 360;
  const directions = [
    "北",
    "东北",
    "东",
    "东南",
    "南",
    "西南",
    "西",
    "西北",
  ];
  const direction = directions[Math.round(degrees / 45) % directions.length];
  return `${direction} ${degrees}°`;
}

export function StatusBar({
  trackerStatus,
  accuracyMeters,
  motion,
  roadContext,
  highwayState,
}: StatusBarProps) {
  const speed =
    motion.speedMps === null
      ? "—"
      : Math.round(motion.speedMps * 3.6).toString();
  const road = roadContext?.nearestRoad ?? "等待道路";

  return (
    <section className="status-bar" aria-label="行驶状态">
      <div className="status-cell">
        <LocateFixed aria-hidden="true" size={18} />
        <span>定位</span>
        <strong>{trackerLabels[trackerStatus]}</strong>
        <small>
          {accuracyMeters === null
            ? "等待精度"
            : `±${Math.round(accuracyMeters)} m`}
        </small>
      </div>
      <div className="status-cell status-cell--speed">
        <Gauge aria-hidden="true" size={18} />
        <span>速度</span>
        <strong>{speed}</strong>
        <small>km/h</small>
      </div>
      <div className="status-cell">
        <Route aria-hidden="true" size={18} />
        <span>道路</span>
        <strong>{road}</strong>
        <small>{roadContext?.formattedAddress ?? "精确定位后识别"}</small>
      </div>
      <div
        className={`status-cell status-cell--scene scene-${highwayState}`}
      >
        <Compass aria-hidden="true" size={18} />
        <span>方向 · {highwayLabels[highwayState]}</span>
        <strong>{headingLabel(motion.heading)}</strong>
        <small>{motion.phase === "moving" ? "行进中" : "当前静止"}</small>
      </div>
    </section>
  );
}
