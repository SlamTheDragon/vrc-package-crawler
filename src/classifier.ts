export interface ClassificationResult {
  category: string;
  subcategory: string;
  type: "QoL, Workflow & Toolchain" | "Asset Additive";
  confidence: number;
}

export class ToolClassifier {
  static classify(title: string, description: string, tags: string[] = []): ClassificationResult {
    const text = `${title} ${description} ${tags.join(" ")}`.toLowerCase();

    // 1. Check for Avatar Toolchains
    if (text.includes("avatar optimizer") || text.includes("aao") || text.includes("mesh") || text.includes("texture")) {
      return {
        category: "Avatars",
        subcategory: "Optimization, Mesh & Texture Utilities",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.95
      };
    }

    if (text.includes("modular avatar") || text.includes("ndmf") || text.includes("vrcfury") || text.includes("non-destructive")) {
      return {
        category: "Avatars",
        subcategory: "Non-Destructive Frameworks & Build Processors",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.98
      };
    }

    if (text.includes("physbone") || text.includes("bone") || text.includes("rigging") || text.includes("tracking") || text.includes("weight")) {
      return {
        category: "Avatars",
        subcategory: "Rigging, Tracking & Bone Setup Tools",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.92
      };
    }

    if (text.includes("menu") || text.includes("parameter") || text.includes("expression") || text.includes("blendshape") || text.includes("blink fix")) {
      return {
        category: "Avatars",
        subcategory: "Expressions, Menus & Parameter Drivers",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    if (text.includes("animation") || text.includes("controller") || text.includes("layer") || text.includes("pose")) {
      return {
        category: "Avatars",
        subcategory: "Animation, Controller & Layer Tools",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.91
      };
    }

    // 2. World Creation
    if (text.includes("udonsharp") || text.includes("udon") || text.includes("u#")) {
      return {
        category: "World Creation",
        subcategory: "Udon Compilers, Libraries & Toolchains",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    if (text.includes("video player") || text.includes("usharpvideo") || text.includes("yamaplayer") || text.includes("tv")) {
      return {
        category: "World Creation",
        subcategory: "Video Player Frameworks & Engines",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.97
      };
    }

    if (text.includes("world") || text.includes("culling") || text.includes("occlusion") || text.includes("scene")) {
      return {
        category: "World Creation",
        subcategory: "World Building & Scene Assembly Utilities",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.90
      };
    }

    // 3. Shaders & Visuals
    if (text.includes("shader") || text.includes("liltoon") || text.includes("poiyomi") || text.includes("pcss") || text.includes("lighting")) {
      return {
        category: "Shaders & Visuals",
        subcategory: "Core Shader Engines & Foundation Frameworks",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.95
      };
    }

    // 4. In-world Gimmicks & Interactive Prefabs
    if (text.includes("ギミック") || text.includes("gimmick") || text.includes("toy") || text.includes("system")) {
      return {
        category: "World Creation",
        subcategory: "Interactive World Gimmicks & Toys",
        type: "Asset Additive",
        confidence: 0.89
      };
    }

    // Default Fallback
    return {
      category: "Tools & Utilities",
      subcategory: "Editor Automation & Workflow Helpers",
      type: "QoL, Workflow & Toolchain",
      confidence: 0.85
    };
  }
}
