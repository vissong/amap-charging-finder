import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { initialMotionSnapshot } from "../../shared/motion";
import { StatusBar } from "../../src/components/StatusBar";

describe("StatusBar", () => {
  it("shows the latest speed and calculated travel direction", () => {
    render(
      <StatusBar
        trackerStatus="ready"
        accuracyMeters={12}
        motion={{
          ...initialMotionSnapshot,
          phase: "moving",
          speedMps: 10,
          heading: 45,
          accurate: true,
        }}
        roadContext={{
          formattedAddress: "北京市朝阳区测试路",
          nearestRoad: "测试路",
          roadDistanceMeters: 5,
        }}
        highwayState="normal"
      />,
    );

    expect(screen.getByText("36")).toBeVisible();
    expect(screen.getByText("东北 45°")).toBeVisible();
    expect(screen.getByText("方向 · 普通道路")).toBeVisible();
    expect(screen.getByText("行进中")).toBeVisible();
  });
});
