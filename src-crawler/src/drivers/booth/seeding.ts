import type { FrontierItem } from "../../db.ts";

const BOOTH_TAGS = [
  "エディタ拡張", "AAO", "VRCFury", "NDMF", "FaceEmo", "GoGoLoco",
  "SaccFlight", "VirtualLens", "QvPen", "改変ツール", "シェーダー",
  "PhysBone", "UdonSharp", "Udon", "ModularAvatar", "AvatarOptimizer",
  "lilToon", "Poiyomi", "Kisekae", "VRChatツール", "アバター改変",
  "ワールドギミック", "ギミック", "OSC", "CyanTrigger", "MA対応",
  "VRCFury対応", "AAO対応", "NDMF対応", "便利ツール", "アバター改変ツール",
  "表情設定", "ポーズ", "追従", "アニメーション", "パーティクル",
  "ライト", "時計", "マーカー", "フライト", "コライダー",
  "コンストレイント", "オーディオ", "揺れもの", "ワールド制作", "テクスチャ改変",
  "TexTransTool", "AvatarAssembler", "Mochie", "DynamicBone", "USharpVideo",
  "VRCSDK3", "FaceTracking", "EyeTracking", "SlimeVR", "EasySetup",
  "ギミック付き", "カメラ", "メニュー", "衣装改変"
];

export function buildBoothSeedPages(): Pick<FrontierItem, "url" | "platform">[] {
  const pages: Pick<FrontierItem, "url" | "platform">[] = [];
  for (let page = 1; page <= 88; page++) {
    pages.push({
      url: `https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=${page}`,
      platform: "booth"
    });
  }
  for (const tag of BOOTH_TAGS) {
    for (let page = 1; page <= 15; page++) {
      pages.push({
        url: `https://booth.pm/ja/items?query=${encodeURIComponent(tag)}&page=${page}`,
        platform: "booth"
      });
    }
  }
  return pages;
}

