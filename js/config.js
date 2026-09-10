export const MIN_SUPPORTED_PROFILE_VERSION = 591;
export const ZIP_INNER_NAME = "profile";
export const HEX_KEY = "62357168683873614A38556C444A557A545A5864325467366D626F3857386E35";
export const PLATFORM_MODES = {
  switch: ["Nintendo"],
  steam: ["Steam"],
  both: ["Nintendo", "Steam"]
};
export const DLC_CATALOG = [
  {
    id: "expansion01",
    displayName: "A Rift in Time",
    anyPlatformId: "Expansion01",
    family: "Expansion1Pack",
    entitlements: {
      Nintendo: { PackName: "Expansion1PackExpansionPass_Nintendo_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" },
      Steam: { PackName: "Expansion1PackExpansionPass_Steam_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" }
    }
  },
  {
    id: "expansion02",
    displayName: "The Storybook Vale",
    anyPlatformId: "Expansion02",
    family: "Expansion2Pack",
    entitlements: {
      Nintendo: { PackName: "Expansion2PackExpansionPass_Nintendo_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" },
      Steam: { PackName: "Expansion2PackExpansionPass_Steam_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" }
    }
  },
  {
    id: "expansion03",
    displayName: "Wishblossom Ranch",
    anyPlatformId: "Expansion03",
    family: "Expansion3Pack",
    entitlements: {
      Nintendo: { PackName: "Expansion3PackExpansionPass_Nintendo_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" },
      Steam: { PackName: "Expansion3PackExpansionPass_Steam_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" }
    }
  },
  {
    id: "mini-expansion01",
    displayName: "Honeyglow Woods",
    anyPlatformId: "WinnieDLC",
    family: "MiniExpansion1Pack",
    entitlements: {
      Nintendo: { PackName: "MiniExpansion1PackExpansionPass_Nintendo_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" },
      Steam: { PackName: "MiniExpansion1PackExpansionPass_Steam_OnlineKey", PackType: "ExpansionPack", Type: "Type_Purchased" }
    }
  }
];
