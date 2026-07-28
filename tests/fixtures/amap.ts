export const fullAmapPoiResponse = {
  status: "1",
  info: "OK",
  infocode: "10000",
  count: "2",
  pois: [
    {
      id: "B0FFTEST01",
      parent: "B0FFAREA01",
      name: "京藏高速百葛服务区充电站",
      location: "116.246800,40.165900",
      distance: "850",
      type: "汽车服务;充电站;充电站",
      typecode: "011100",
      pname: "北京市",
      cityname: "北京市",
      adname: "昌平区",
      address: "京藏高速百葛服务区东区",
      pcode: "110000",
      adcode: "110114",
      citycode: "010",
      business: {
        business_area: [],
        opentime_today: "00:00-24:00",
        opentime_week: "周一至周日 00:00-24:00",
        tel: "010-12345678",
        alias: "百葛服务区充电站",
      },
      navi: {
        navi_poiid: "116.246810,40.165910",
        entr_location: "116.246700,40.165800",
        exit_location: "116.246900,40.166000",
        gridcode: "5916732702",
      },
      photos: [
        {
          title: "站点入口",
          url: "https://example.com/entrance.jpg",
        },
        {
          title: [],
          url: "http://example.com/insecure.jpg",
        },
      ],
      children: [
        {
          id: "B0FFCHILD01",
          name: "百葛服务区东区停车场",
          location: "116.246750,40.165850",
          address: [],
          subtype: "停车场",
          typecode: "150900",
          sname: "停车场",
        },
      ],
    },
    {
      id: "B0FFINVALID",
      parent: [],
      name: "缺少坐标的记录",
      location: [],
      distance: [],
      type: [],
      typecode: "011100",
      pname: [],
      cityname: [],
      adname: [],
      address: [],
      business: [],
      navi: [],
      photos: [],
      children: [],
    },
  ],
} as const;

export const minimalAmapPoiResponse = {
  status: "1",
  info: "OK",
  infocode: "10000",
  count: "1",
  pois: [
    {
      id: "B0FFMINIMAL",
      name: "城市公共充电站",
      location: "116.400000,39.900000",
      distance: "1200",
      typecode: "011100",
    },
  ],
} as const;

export const amapServiceAreaResponse = {
  status: "1",
  info: "OK",
  infocode: "10000",
  count: "1",
  pois: [
    {
      id: "B0FFAREA01",
      parent: [],
      name: "百葛服务区",
      location: "116.247000,40.166000",
      distance: "900",
      type: "道路附属设施;服务区;高速服务区",
      typecode: "180300",
      address: "京藏高速",
      pname: "北京市",
      cityname: "北京市",
      adname: "昌平区",
    },
  ],
} as const;

export const amapRoadContextResponse = {
  status: "1",
  info: "OK",
  infocode: "10000",
  regeocode: {
    formatted_address: "北京市昌平区京藏高速",
    addressComponent: {
      country: "中国",
      province: "北京市",
      city: [],
      citycode: "010",
      district: "昌平区",
      adcode: "110114",
    },
    roads: [
      {
        id: "010J50F0050088847",
        name: "京藏高速",
        distance: "12.4",
        direction: "东",
        location: "116.246900,40.165950",
      },
    ],
    roadinters: [],
    pois: [],
    aois: [],
  },
} as const;
