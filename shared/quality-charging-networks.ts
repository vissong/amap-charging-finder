export interface QualityChargingNetworkBrand {
  id: string;
  label: string;
  aliases: readonly string[];
}

// Product-curated list. A match means the station name identifies a known
// charging network; it is not an AMap rating or a guarantee of live quality.
export const QUALITY_CHARGING_NETWORK_BRANDS = [
  {
    id: "xiaoju",
    label: "小桔充电",
    aliases: ["小桔充电", "滴滴充电", "小桔能源"],
  },
  { id: "teld", label: "特来电", aliases: ["特来电"] },
  { id: "star-charge", label: "星星充电", aliases: ["星星充电"] },
  { id: "ykc", label: "云快充", aliases: ["云快充"] },
  { id: "xindiantu", label: "新电途", aliases: ["新电途"] },
  {
    id: "sgcc",
    label: "国家电网",
    aliases: ["国家电网", "国网电动", "国网充电", "e充电"],
  },
  {
    id: "csg",
    label: "南方电网",
    aliases: ["南方电网", "南网电动", "顺易充"],
  },
  {
    id: "cnpc",
    label: "昆仑网电",
    aliases: ["昆仑网电", "中国石油", "中石油"],
  },
  {
    id: "tesla",
    label: "特斯拉",
    aliases: ["特斯拉", "Tesla Supercharger", "Tesla超级充电"],
  },
  {
    id: "nio-power",
    label: "蔚来 NIO Power",
    aliases: ["蔚来能源", "蔚来超充", "蔚来充电", "蔚来换电", "NIO Power"],
  },
  {
    id: "cams",
    label: "开迈斯 CAMS",
    aliases: ["开迈斯", "CAMS"],
  },
  {
    id: "xpeng",
    label: "小鹏充电",
    aliases: [
      "小鹏超充",
      "小鹏自营充电",
      "小鹏目的地充电",
      "小鹏汽车充电",
      "XPENG",
    ],
  },
  {
    id: "zeekr",
    label: "极氪能源",
    aliases: ["极氪能源", "极氪极充", "极氪超充", "极氪充电", "ZEEKR Power"],
  },
  {
    id: "li-auto",
    label: "理想超充",
    aliases: ["理想超充", "理想汽车超级充电", "Li Auto Supercharging"],
  },
  {
    id: "gac-energy",
    label: "广汽能源",
    aliases: ["广汽能源", "埃安超充", "广汽埃安充电"],
  },
  {
    id: "shell-recharge",
    label: "壳牌充电",
    aliases: ["壳牌充电", "壳牌新能源", "Shell Recharge"],
  },
  {
    id: "ionchi",
    label: "逸安启 IONCHI",
    aliases: ["逸安启", "IONCHI"],
  },
  {
    id: "mercedes-benz",
    label: "梅赛德斯-奔驰超充",
    aliases: [
      "梅赛德斯奔驰超级充电",
      "梅赛德斯-奔驰超级充电",
      "奔驰超级充电",
      "奔驰超充",
    ],
  },
  {
    id: "byd-flash",
    label: "比亚迪闪充",
    aliases: ["比亚迪闪充", "比亚迪兆瓦闪充", "BYD FLASH Charging"],
  },
] as const satisfies readonly QualityChargingNetworkBrand[];

function compact(value: string): string {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•._/\\:：\-—–()（）\[\]【】]/g, "");
}

const searchableBrands = QUALITY_CHARGING_NETWORK_BRANDS.map((brand) => ({
  brand,
  aliases: brand.aliases.map(compact),
}));

export function matchQualityChargingNetwork(
  ...sources: Array<string | null | undefined>
): QualityChargingNetworkBrand | null {
  const searchableSources = sources
    .filter((source): source is string => Boolean(source?.trim()))
    .map(compact);

  for (const { brand, aliases } of searchableBrands) {
    if (
      searchableSources.some((source) =>
        aliases.some((alias) => source.includes(alias)),
      )
    ) {
      return brand;
    }
  }
  return null;
}
