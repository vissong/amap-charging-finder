import { render, screen } from "@testing-library/react";
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
  qualityNetworkBrand: null,
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
  it("shows a direct AMap action without expandable details", () => {
    render(<StationCard station={station} />);

    expect(
      screen.queryByRole("button", { name: /城市公共充电站详情/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("汽车服务;充电站;充电站")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "站点图片" }),
    ).not.toBeInTheDocument();

    const amapLink = screen.getByRole("link", {
      name: "在高德查看城市公共充电站",
    });
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

  it("marks a station that matches the curated quality network list", () => {
    render(
      <StationCard
        station={{
          ...station,
          name: "特来电望京超级充电站",
          qualityNetworkBrand: "特来电",
        }}
      />,
    );

    expect(screen.getByText("优质充电网络")).toHaveAttribute(
      "title",
      "特来电 · 优质充电网络",
    );
  });
});
