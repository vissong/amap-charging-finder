import { LocateFixed, Navigation } from "lucide-react";

import type {
  SearchMode,
  SearchRadius,
} from "../../shared/contracts";

const radiusOptions: SearchRadius[] = [
  3_000,
  5_000,
  10_000,
  20_000,
  50_000,
];

interface ModeControlsProps {
  mode: SearchMode;
  radius: SearchRadius;
  onModeChange: (mode: SearchMode) => void;
  onRadiusChange: (radius: SearchRadius) => void;
}

export function ModeControls({
  mode,
  radius,
  onModeChange,
  onRadiusChange,
}: ModeControlsProps) {
  return (
    <div className="search-controls">
      <div
        className="mode-switch"
        role="radiogroup"
        aria-label="搜索模式"
      >
        <label className="mode-option">
          <input
            type="radio"
            name="search-mode"
            value="nearby"
            aria-label="附近充电"
            checked={mode === "nearby"}
            onChange={() => onModeChange("nearby")}
          />
          <span>
            <LocateFixed aria-hidden="true" size={18} strokeWidth={2.2} />
            附近充电
          </span>
        </label>
        <label className="mode-option">
          <input
            type="radio"
            name="search-mode"
            value="forward"
            aria-label="前方推荐"
            checked={mode === "forward"}
            onChange={() => onModeChange("forward")}
          />
          <span>
            <Navigation aria-hidden="true" size={18} strokeWidth={2.2} />
            前方推荐
          </span>
        </label>
      </div>

      <div
        className="radius-switch"
        role="radiogroup"
        aria-label="搜索范围"
      >
        {radiusOptions.map((value) => {
          const label = `${value / 1_000} km`;
          return (
            <label className="radius-option" key={value}>
              <input
                type="radio"
                name="search-radius"
                value={value}
                aria-label={label}
                checked={radius === value}
                onChange={() => onRadiusChange(value)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
