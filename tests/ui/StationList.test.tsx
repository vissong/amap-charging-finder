import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChargingStation } from "../../shared/contracts";
import { StationList } from "../../src/components/StationList";

const station: ChargingStation = {
  id: "station-1",
  parentId: null,
  name: "测试充电站",
  location: { lng: 116.4, lat: 39.9 },
  distanceMeters: 1_200,
  type: "汽车服务;充电站;充电站",
  typecode: "011100",
  address: "测试地址",
  province: "北京市",
  city: "北京市",
  district: "朝阳区",
  alias: null,
  phone: null,
  openingToday: null,
  openingWeek: null,
  entrance: null,
  exit: null,
  photos: [],
  children: [],
};

describe("StationList", () => {
  it("shows a plus sign when the nearby result reached its query cap", () => {
    render(
      <StationList
        mode="nearby"
        items={[
          {
            station,
            bearing: 0,
            recommendationOrder: null,
            serviceAreaMatch: null,
          },
        ]}
        truncated
      />,
    );

    expect(screen.getByText("1+")).toBeVisible();
    expect(screen.getByTitle("结果已达到查询上限")).toBeVisible();
  });

  it("lets the user manually refresh loaded results", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <StationList
        mode="nearby"
        items={[
          {
            station,
            bearing: 0,
            recommendationOrder: null,
            serviceAreaMatch: null,
          },
        ]}
        onRefresh={onRefresh}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "刷新充电站结果" }),
    );

    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
