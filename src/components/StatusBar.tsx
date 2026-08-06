import {
  Compass,
  LocateFixed,
  LoaderCircle,
  MapPinOff,
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
  const LocationIcon =
    trackerStatus === "ready"
      ? LocateFixed
      : trackerStatus === "locating"
        ? LoaderCircle
        : MapPinOff;
  const accuracy =
    accuracyMeters === null
      ? "等待定位精度"
      : `定位精度 ±${Math.round(accuracyMeters)} m`;
  const phase = motion.phase === "moving" ? "行进中" : "当前静止";

  return (
    <section className="status-bar" aria-label="行驶状态">
      <div className="status-cell status-cell--speed">
        <div className="status-cell__lead">
          <span
            className="status-locator"
            data-status={trackerStatus}
            role="img"
            aria-label={`定位状态：${trackerLabels[trackerStatus]}`}
            title={trackerLabels[trackerStatus]}
          >
            <LocationIcon aria-hidden="true" size={20} />
          </span>
          <span>实时速度</span>
        </div>
        <strong>
          <span>{speed}</span>
          <em>km/h</em>
        </strong>
        <small>{accuracy}</small>
      </div>
      <div
        className={`status-cell status-cell--direction scene-${highwayState}`}
      >
        <div className="status-cell__lead">
          <Compass aria-hidden="true" size={20} />
          <span>方向 · {highwayLabels[highwayState]}</span>
        </div>
        <strong>{headingLabel(motion.heading)}</strong>
        <small>{road} · {phase}</small>
      </div>
    </section>
  );
}
