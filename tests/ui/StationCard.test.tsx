import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ChargingStation } from "../../shared/contracts";
import { StationCard } from "../../src/components/StationCard";

const station: ChargingStation = {
  id: "station-1",
  parentId: null,
  name: "城市公共充电站",
  location: { lng: 116.4, lat: 39.9 },
  distanceMeters: 1_200,
  type: "汽车服务;充电站;充电站",
  typecode: "011100",
  address: "北京市测试路 1 号",
  province: "北京市",
  city: "北京市",
  district: "朝阳区",
  alias: null,
  phone: null,
  openingToday: null,
  openingWeek: null,
  entrance: null,
  exit: null,
  photos: [
    {
      title: "站点图片",
      url: "https://example.com/station.jpg",
    },
  ],
  children: [],
};

describe("StationCard", () => {
  it("expands real POI details without inventing charging fields", async () => {
    const user = userEvent.setup();
    render(<StationCard station={station} />);

    await user.click(
      screen.getByRole("button", { name: "展开城市公共充电站详情" }),
    );

    expect(screen.getByText("汽车服务;充电站;充电站")).toBeVisible();
    expect(
      screen.getByText("实时充电信息请前往高德地图查看"),
    ).toBeVisible();
    expect(screen.queryByText(/空闲枪|充电功率|电价/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "站点图片" }),
    ).not.toBeInTheDocument();

    const amapLink = screen.getByRole("link", { name: "在高德查看" });
    expect(amapLink).toHaveAttribute("target", "_blank");
    expect(amapLink.getAttribute("href")).toContain("callnative=1");
  });

  it("labels inferred service-area proximity without overstating it", () => {
    render(
      <StationCard
        station={station}
        serviceAreaMatch={{
          kind: "nearby",
          area: {
            id: "area-1",
            name: "百葛服务区",
            location: { lng: 116.4, lat: 39.91 },
            distanceMeters: 1_100,
            address: "京藏高速",
          },
        }}
      />,
    );

    expect(screen.getByText("服务区附近")).toBeVisible();
    expect(screen.queryByText("服务区内")).not.toBeInTheDocument();
  });
});
