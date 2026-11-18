import { DLC_CATALOG, STANDARD_STOREFRONT_GROUPS } from "../../js/config.js";

export const ORIGINAL_IAP_UNIQUE_NAMES_V1253 = Object.freeze({
  expansion01: "Expansion1PackExpansionPass",
  expansion02: "Expansion2PackExpansionPass",
  expansion03: "Expansion3PackExpansionPass",
  "mini-expansion01": "MiniExpansion1PackExpansionPass"
});

export const SIX_STORE_CANDIDATE_CATALOG = Object.freeze(DLC_CATALOG.filter(item => item.id !== "expansion04").map(item => ({
  ...item,
  entitlements: Object.fromEntries(STANDARD_STOREFRONT_GROUPS.map(group => [
    group, {
      PackName: `${ORIGINAL_IAP_UNIQUE_NAMES_V1253[item.id]}_${group}_OnlineKey`,
      PackType: "ExpansionPack",
      Type: "Type_Purchased"
    }
  ]))
})));
