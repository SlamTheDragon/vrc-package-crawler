export interface ClassificationResult {
  category: string;
  subcategory: string;
  type: "QoL, Workflow & Toolchain" | "Asset Additive";
  confidence: number;
}

export class ToolClassifier {
  static classify(title: string, description: string, tags: string[] = []): ClassificationResult {
    const text = `${title} ${description} ${tags.join(" ")}`.toLowerCase();

    // 1. Package Management & Distribution
    if (
      text.includes("vpm") ||
      text.includes("vpm-package") ||
      text.includes("vpmdependencies") ||
      text.includes("vcc") ||
      text.includes("unitypackage manager") ||
      text.includes("package manager")
    ) {
      return {
        category: "Tools & Utilities",
        subcategory: "Package Management & Distribution",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.98
      };
    }

    // 2. OSC & External Companion Applications
    if (
      text.includes("osc") ||
      text.includes("vrc-osc") ||
      text.includes("vrcosc") ||
      text.includes("facetracking") ||
      text.includes("face tracking") ||
      text.includes("eyetrack") ||
      text.includes("vrcx") ||
      text.includes("steamvr") ||
      text.includes("openvr") ||
      text.includes("ovr lighthouse")
    ) {
      return {
        category: "Tools & Utilities",
        subcategory: "OSC & External Companion Applications",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    // 3. Non-Destructive Frameworks & Build Processors
    if (
      text.includes("modular avatar") ||
      text.includes("modular-avatar") ||
      text.includes("ndmf") ||
      text.includes("vrcfury") ||
      text.includes("non-destructive") ||
      text.includes("baryon")
    ) {
      return {
        category: "Avatars",
        subcategory: "Non-Destructive Frameworks & Build Processors",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.98
      };
    }

    // 4. Video Player Frameworks & Engines
    if (
      text.includes("protv") ||
      text.includes("usharpvideo") ||
      text.includes("yamaplayer") ||
      text.includes("video player") ||
      text.includes("yammo") ||
      text.includes("iwaSync")
    ) {
      return {
        category: "World Creation",
        subcategory: "Video Player Frameworks & Engines",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.97
      };
    }

    // 5. Udon Compilers, Libraries & Toolchains
    if (
      text.includes("udonsharp") ||
      text.includes("udon") ||
      text.includes("u#") ||
      text.includes("cyanemu") ||
      text.includes("udonemu") ||
      text.includes("saccflight") ||
      text.includes("qvpen") ||
      text.includes("cyantrigger")
    ) {
      return {
        category: "World Creation",
        subcategory: "Udon Compilers, Libraries & Toolchains",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.96
      };
    }

    // 6. Optimization, Mesh & Texture Utilities
    if (
      text.includes("avatar optimizer") ||
      text.includes("aao") ||
      text.includes("mesh combiner") ||
      text.includes("texture baker") ||
      text.includes("avatar compressor") ||
      text.includes("material combiner") ||
      text.includes("polytool") ||
      text.includes("d4rkavataroptimizer") ||
      text.includes("culling")
    ) {
      return {
        category: "Avatars",
        subcategory: "Optimization, Mesh & Texture Utilities",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.95
      };
    }

    // 7. Core Shader Engines & Specialized Shaders
    if (
      text.includes("liltoon") ||
      text.includes("poiyomi") ||
      text.includes("unlitwf") ||
      text.includes("shader") ||
      text.includes("シェーダー") ||
      text.includes("pcss") ||
      text.includes("audiolink") ||
      text.includes("audio link") ||
      text.includes("post-processing") ||
      text.includes("ssrt")
    ) {
      return {
        category: "Shaders & Visuals",
        subcategory: "Core Shader Engines & Foundation Frameworks",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.95
      };
    }

    // 8. Rigging, Tracking & Bone Setup Tools
    if (
      text.includes("physbone") ||
      text.includes("dynamicbone") ||
      text.includes("armature") ||
      text.includes("bone setup") ||
      text.includes("rigging") ||
      text.includes("weight") ||
      text.includes("kisetter") ||
      text.includes("mochifitter") ||
      text.includes("cats-blender") ||
      text.includes("fbx exporter")
    ) {
      return {
        category: "Avatars",
        subcategory: "Rigging, Tracking & Bone Setup Tools",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.93
      };
    }

    // 9. Expressions, Menus & Parameter Drivers
    if (
      text.includes("faceemo") ||
      text.includes("blendshape") ||
      text.includes("menu") ||
      text.includes("parameter") ||
      text.includes("expression") ||
      text.includes("blink fix") ||
      text.includes("simpletoggles") ||
      text.includes("toggle system") ||
      text.includes("shape maker")
    ) {
      return {
        category: "Avatars",
        subcategory: "Expressions, Menus & Parameter Drivers",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // 10. Animation, Controller & Layer Tools
    if (
      text.includes("gogoloco") ||
      text.includes("gogo loco") ||
      text.includes("locomotion") ||
      text.includes("controller") ||
      text.includes("animator") ||
      text.includes("syncdances") ||
      text.includes("pose system")
    ) {
      return {
        category: "Avatars",
        subcategory: "Animation, Controller & Layer Tools",
        type: "QoL, Workflow & Toolchain",
        confidence: 0.94
      };
    }

    // 11. Interactive World Gimmicks & Systems
    if (
      text.includes("ギミック") ||
      text.includes("gimmick") ||
      text.includes("system") ||
      text.includes("システム") ||
      text.includes("toy") ||
      text.includes("virtuallens") ||
      text.includes("camera") ||
      text.includes("suimin") ||
      text.includes("ragdoll")
    ) {
      return {
        category: "World Creation",
        subcategory: "Interactive World Gimmicks & Systems",
        type: "Asset Additive",
        confidence: 0.92
      };
    }

    // 12. Default Toolchain Fallback
    return {
      category: "Tools & Utilities",
      subcategory: "Editor Automation & Workflow Helpers",
      type: "QoL, Workflow & Toolchain",
      confidence: 0.90
    };
  }
}
