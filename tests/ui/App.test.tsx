import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChargingStation,
  ListResponse,
  RoadContext,
} from "../../shared/contracts";
import { App } from "../../src/App";

let positionCallback: PositionCallback;
let errorCallback: PositionErrorCallback;

const station: ChargingStation = {
  id: "station-1",
  parentId: null,
  name: "望京公共充电站",
  location: { lng: 116.41, lat: 39.91 },
  distanceMeters: 1_350,
  type: "汽车服务;充电站;充电站",
  typecode: "011100",
  address: "望京路 1 号",
  province: "北京市",
  city: "北京市",
  district: "朝阳区",
  alias: null,
  phone: null,
  openingToday: "00:00-24:00",
  openingWeek: null,
  entrance: null,
  exit: null,
  photos: [],
  children: [],
};

const keywordStation: ChargingStation = {
  ...station,
  id: "keyword-station-1",
  name: "孟村服务区充电站",
  distanceMeters: 0,
  address: "京沪高速孟村服务区",
  district: "孟村回族自治县",
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn(
        (
          success: PositionCallback,
          failure: PositionErrorCallback,
        ) => {
          positionCallback = success;
          errorCallback = failure;
          return 7;
        },
      ),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    },
  });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/charging-stations") {
      return json({
        items: [station],
        count: 1,
      } satisfies ListResponse<ChargingStation>);
    }
    if (url.pathname === "/api/road-context") {
      return json({
        formattedAddress: "北京市朝阳区望京路",
        nearestRoad: "望京路",
        roadDistanceMeters: 9,
      } satisfies RoadContext);
    }
    if (url.pathname === "/api/search-stations") {
      return json({
        query: {
          display: "孟村服务区",
          submitted: "孟村服务区 充电站",
        },
        items: [keywordStation],
        count: 1,
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function emitPosition(): void {
  positionCallback({
    timestamp: 1_000,
    coords: {
      latitude: 39.9,
      longitude: 116.4,
      accuracy: 15,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: 0,
      toJSON: () => ({}),
    },
    toJSON: () => ({}),
  });
}

describe("App", () => {
  it("loads nearby real stations and exposes a relative radar", async () => {
    render(<App />);

    act(() => emitPosition());

    expect(
      await screen.findByRole("heading", { name: "望京公共充电站" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "充电站相对位置雷达" }),
    ).toBeVisible();
    expect(screen.getByText("望京路")).toBeVisible();
    expect(screen.getByText("前电")).toBeVisible();
  });

  it("explains why forward recommendations are not ready while stationary", async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => emitPosition());
    await screen.findByRole("heading", { name: "望京公共充电站" });

    await user.click(
      screen.getByRole("radio", { name: "前方推荐" }),
    );

    expect(
      screen.getByText("行驶一段距离后自动推荐"),
    ).toBeVisible();
  });

  it("shows a concrete recovery action after location permission is denied", async () => {
    render(<App />);

    act(() => {
      errorCallback({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });

    await waitFor(() =>
      expect(
        screen.getByText("无法定位，开启位置权限后再试"),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole("button", { name: "重新定位" }),
    ).toBeVisible();
  });

  it("searches a named place with a charging qualifier before location is ready", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole("searchbox", { name: "搜索指定地点" }),
      "孟村服务区",
    );
    await user.click(
      screen.getByRole("button", { name: "搜索充电站" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "孟村服务区充电站",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("已按“孟村服务区 充电站”搜索"),
    ).toBeVisible();
    expect(screen.queryByText("0 m")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "返回附近" }),
    ).toBeVisible();
  });
});
