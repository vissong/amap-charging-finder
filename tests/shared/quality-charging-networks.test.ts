import { describe, expect, it } from "vitest";

import {
  QUALITY_CHARGING_NETWORK_BRANDS,
  matchQualityChargingNetwork,
} from "../../shared/quality-charging-networks";

describe("quality charging network recognition", () => {
  it("recognizes the curated brands from station names and aliases", () => {
    expect(QUALITY_CHARGING_NETWORK_BRANDS.map(({ label }) => label)).toEqual([
      "小桔充电",
      "特来电",
      "星星充电",
      "云快充",
      "新电途",
      "国家电网",
      "南方电网",
      "昆仑网电",
      "特斯拉",
      "蔚来 NIO Power",
      "开迈斯 CAMS",
      "小鹏充电",
      "极氪能源",
      "理想超充",
      "广汽能源",
      "壳牌充电",
      "逸安启 IONCHI",
      "梅赛德斯-奔驰超充",
      "比亚迪闪充",
    ]);

    expect(matchQualityChargingNetwork("国家电网汽车充电站")).toMatchObject({
      label: "国家电网",
    });
    expect(
      matchQualityChargingNetwork("望京公共充电站", "XPENG小鹏超充"),
    ).toMatchObject({ label: "小鹏充电" });
    expect(
      matchQualityChargingNetwork("BYD FLASH Charging 北京站"),
    ).toMatchObject({ label: "比亚迪闪充" });
    expect(matchQualityChargingNetwork("社区公共充电站")).toBeNull();
  });
});
