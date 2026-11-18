export const MIN_SUPPORTED_PROFILE_VERSION = 591;
export const MAX_VERIFIED_PROFILE_VERSION = 626;
export const ZIP_INNER_NAME = "profile";
export const HEX_KEY = "62357168683873614A38556C444A557A545A5864325467366D626F3857386E35";
export const STANDARD_STOREFRONT_GROUPS = Object.freeze([
  "Nintendo", "Steam", "Epic", "Microsoft", "Sony", "Apple"
]);
export const AUTO_PATCH_PLATFORMS = STANDARD_STOREFRONT_GROUPS;

function entitlementDefinitions(iapUniqueName) {
  return Object.fromEntries(STANDARD_STOREFRONT_GROUPS.map(group => [
    group,
    {
      PackName: iapUniqueName + "_" + group + "_OnlineKey",
      PackType: "ExpansionPack",
      Type: "Type_Purchased"
    }
  ]));
}

export const DLC_CATALOG = [
  {
    id: "expansion01",
    displayName: "A Rift in Time",
    anyPlatformId: "Expansion01",
    family: "Expansion1Pack",
    entitlements: entitlementDefinitions("Expansion1PackExpansionPass")
  },
  {
    id: "expansion02",
    displayName: "The Storybook Vale",
    anyPlatformId: "Expansion02",
    family: "Expansion2Pack",
    entitlements: entitlementDefinitions("Expansion2PackExpansionPass")
  },
  {
    id: "expansion03",
    displayName: "Wishblossom Ranch",
    anyPlatformId: "Expansion03",
    family: "Expansion3Pack",
    entitlements: entitlementDefinitions("Expansion3PackExpansionPass")
  },
  {
    id: "mini-expansion01",
    displayName: "Honeyglow Woods",
    anyPlatformId: "WinnieDLC",
    family: "MiniExpansion1Pack",
    entitlements: entitlementDefinitions("MiniExpansion1PackExpansionPass")
  }
];
