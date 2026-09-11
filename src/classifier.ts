export interface DetailedClassification {
  category: "Avatars" | "World Creation" | "Shaders & Visuals" | "Tools & Utilities";
  subcategory: string;
  type: "QoL, Workflow & Toolchain" | "Asset Additive";
  confidence: number;
}

export class ToolClassifier {
  static classify(title: string, description: string, tags: string[] = []): DetailedClassification {
    const raw = `${title} ${description} ${tags.join(" ")}`.toLowerCase();

    // Helper for matching tokens/phrases
    const has = (t: string) => raw.includes(t);

    // =========================================================================
    // 1. TOOLS & UTILITIES (QoL, Workflow & Toolchain)
    // =========================================================================

    // A. Package Management & Distribution
    if (
      has("vpm") || has("vpm-package") || has("vpmdependencies") || has("vcc") ||
      has("package manager") || has("vrc-get") || has("alcom") || has("voidpm") ||
      has("vpm package") || has("package converter") || has("registry")
    ) {
      return {
        category: "Tools & Utilities",
        subcategory: "Package Management & Distribution",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.98
      };
    }

    // B. OSC & External Companion Applications
    if (
      has("vrcx") || has("oyasumi") || has("slimevr") || has("eyetrackvr") ||
      has("openiris") || has("vrc-osc") || has("vrcosc") || has("oscbattery") ||
      has("osclock") || has("oscmooth") || has("vrct") || has("tastt") ||
      has("translator") || has("steamvr") || has("openvr") || has("ovr lighthouse") ||
      has("heartrate") || has("pulsoid")
    ) {
      return {
        category: "Tools & Utilities",
        subcategory: "OSC & External Companion Applications",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.97
      };
    }

    // =========================================================================
    // 2. SHADERS & VISUALS
    // =========================================================================

    // A. Core Shader Engines & Frameworks
    if (
      has("liltoon") || has("poiyomi") || has("unlitwf") || has("arktoon") ||
      has("sunao") || has("shader engine") || has("audiolink") || has("audio link")
    ) {
      return {
        category: "Shaders & Visuals",
        subcategory: "Core Shader Engines & Foundation Frameworks",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    // B. Shader Utilities & Converters
    if (
      (has("shader") || has("シェーダー")) &&
      (has("stripper") || has("converter") || has("generator") || has("optimizer") || has("editor") || has("gui"))
    ) {
      return {
        category: "Shaders & Visuals",
        subcategory: "Shader Optimization & Toolchains",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // C. Special FX, Particles & Screen Shaders (Asset Additive)
    if (
      has("shader") || has("シェーダー") || has("ssrt") || has("pcss") ||
      has("post-processing") || has("raymarching") || has("particle") ||
      has("パーティクル") || has("screen shader") || has("dissolve")
    ) {
      return {
        category: "Shaders & Visuals",
        subcategory: "Special FX, Particles & Screen Shaders",
        type: "Asset Additive",
        confidence: 0.92
      };
    }

    // =========================================================================
    // 3. WORLD CREATION
    // =========================================================================

    // A. Udon Compilers, Libraries & Toolchains (QoL)
    if (
      has("udonsharp") || has("udon") || has("u#") || has("cyantrigger") ||
      has("cyanemu") || has("udonemu") || has("udonarium") || has("udonite") ||
      has("udonsharpdecompiler") || has("udonsharpprofiler") || has("saccflight") ||
      has("world toolkit") || has("vrworldtoolkit") || has("qvaudio")
    ) {
      return {
        category: "World Creation",
        subcategory: "Udon Compilers, Libraries & Toolchains",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    // B. Video Player Engines (QoL)
    if (
      has("protv") || has("usharpvideo") || has("yamaplayer") || has("video player") ||
      has("videoplayer") || has("iwasync") || has("yammo") || has("yt-dlp")
    ) {
      return {
        category: "World Creation",
        subcategory: "World Video & Audio Player Engines",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.97
      };
    }

    // C. Lighting, Post-Processing & Bakery (QoL)
    if (
      has("bakery") || has("light limit changer") || has("lightlimit") ||
      has("shadow") || has("reflection probe") || has("lighting") || has("light") ||
      has("サーチライト") || has("探照灯")
    ) {
      return {
        category: "World Creation",
        subcategory: "Lighting, Post-Processing & Bakery",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.93
      };
    }

    // D. Interactive World Gimmicks & Systems (Asset Additive)
    if (
      has("billiards") || has("vrcbce") || has("clock") || has("button") ||
      has("clocks") || has("buttons") || has("game") || has("toy") || has("toys") ||
      has("door") || has("chair") || has("seat") || has("vehicle") || has("portal gun") ||
      has("raygun") || has("pickup") || has("gimmick") || has("ギミック") ||
      (has("world") && has("system"))
    ) {
      return {
        category: "World Creation",
        subcategory: "Interactive World Gimmicks, Games & Prefabs",
        type: "Asset Additive",
        confidence: 0.91
      };
    }

    // =========================================================================
    // 4. AVATARS
    // =========================================================================

    // A. Non-Destructive Frameworks (QoL)
    if (
      has("modular avatar") || has("modularavatar") || has("ndmf") ||
      has("vrcfury") || has("non-destructive") || has("baryon")
    ) {
      return {
        category: "Avatars",
        subcategory: "Non-Destructive Frameworks & Build Processors",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.98
      };
    }

    // B. Avatar Optimization & Mesh Utilities (QoL)
    if (
      has("avatar optimizer") || has("aao") || has("avataroptimizer") ||
      has("mesh combiner") || has("material combiner") || has("texture baker") ||
      has("avatar compressor") || has("polytool") || has("d4rkavataroptimizer") ||
      has("culling") || has("lazyoptimiser") || has("optitools") || has("perfhammer")
    ) {
      return {
        category: "Avatars",
        subcategory: "Avatar Optimization, Compression & Mesh Utilities",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    // C. Rigging, Bone Setup & Weight Utilities (QoL)
    if (
      has("physbone") || has("dynamicbone") || has("armature") || has("bone setup") ||
      has("bone") || has("weight transfer") || has("weight") || has("ボーン") ||
      has("ウェイト") || has("mesh cutter") || has("bounding box") || has("flooradjuster") ||
      has("toe control")
    ) {
      return {
        category: "Avatars",
        subcategory: "Rigging, Bone Setup & Weight Utilities",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // D. Locomotion, Pose & Emote Systems (QoL)
    if (
      has("gogoloco") || has("gogo loco") || has("locomotion") || has("faceemo") ||
      has("gesture manager") || has("gesturemanager") || has("pose system") ||
      has("afk") || has("vrcemote") || has("parameter save") || has("parametersavestates") ||
      has("parameterincreaser") || has("animator")
    ) {
      return {
        category: "Avatars",
        subcategory: "Locomotion, Pose & Emote Frameworks",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // E. Face & Eye Tracking Frameworks (QoL)
    if (
      has("facetracking") || has("face tracking") || has("eyetrack") ||
      has("blendshape") || has("shape maker") || has("faceemo") ||
      has("lipsync") || has("eye pointer") || has("facelink")
    ) {
      return {
        category: "Avatars",
        subcategory: "Face & Eye Tracking Frameworks",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // F. Clothing & Mesh Fitters (QoL)
    if (
      has("mochifitter") || has("もちふぃった") || has("kisekae") || has("kisetter") ||
      has("dresser") || has("fitter") || has("clipping fix") || has("outfit fitter")
    ) {
      return {
        category: "Avatars",
        subcategory: "Clothing & Mesh Fitting Toolchains",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.95
      };
    }

    // G. Interactive Avatar Gimmicks & Contacts (Asset Additive)
    if (
      has("gimmick") || has("ギミック") || has("pen") || has("qvpen") || has("deskpen") ||
      has("contact") || has("haptic") || has("grab") || has("follower") ||
      has("toggle") || has("toggles") || has("menu generator") || has("menu") ||
      has("keyboard") || has("toy") || has("toy") || has("props") || has("prop") ||
      has("dancer") || has("heartbeat") || has("sound pack") || has("afk") ||
      has("sps") || has("dps") || has("collider dash") || has("phantom system") ||
      has("phantomsystem")
    ) {
      return {
        category: "Avatars",
        subcategory: "Interactive Avatar Gimmicks & Contacts",
        type: "Asset Additive",
        confidence: 0.92
      };
    }

    // H. Avatar Profiles & Presets (Asset Additive)
    if (
      has("プロファイル") || has("profile") || has("シェイプキー") || has("shapekey") ||
      has("ちょい足し") || has("専用")
    ) {
      return {
        category: "Avatars",
        subcategory: "Avatar Presets, Profiles & Configurations",
        type: "Asset Additive",
        confidence: 0.90
      };
    }

    // =========================================================================
    // 5. GENERAL UNITY EDITOR WORKFLOW HELPERS (Default fallback)
    // =========================================================================
    if (has("editor") || has("tool") || has("tools") || has("helper") || has("utility") || has("extension")) {
      return {
        category: "Tools & Utilities",
        subcategory: "Unity Editor Extensions & Workflow Helpers",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.90
      };
    }

    // Final fallback: Tools & Utilities
    return {
      category: "Tools & Utilities",
      subcategory: "Unity Editor Extensions & Workflow Helpers",
      type: "QoL, Workflow & Toolchain",
      confidence: 0.85
    };
  }
}
