import { z } from "zod";

/**
 * Supported subtypes for standalone VRChat desktop software (Task 5.5 / Gate G4).
 */
export const DesktopToolSubtypeSchema = z.enum([
  "companion_client",
  "osc_control",
  "tracking_bridge",
  "streaming_accessibility",
  "utility"
]);
export type DesktopToolSubtype = z.infer<typeof DesktopToolSubtypeSchema>;

/**
 * Publisher-evidenced desktop tool schema.
 */
export const DesktopToolEvidenceSchema = z.object({
  canonicalId: z.string(),
  toolSubtype: DesktopToolSubtypeSchema,
  supportedOS: z.array(z.enum(["windows", "linux", "macos"])),
  particularVRChatTarget: z.boolean(),
  evidenceUrl: z.string().url(),
  publisherClaim: z.string()
});
export type DesktopToolEvidence = z.infer<typeof DesktopToolEvidenceSchema>;

export interface DesktopToolClassification {
  isDesktopTool: boolean;
  subtype?: DesktopToolSubtype;
  confidence: number;
  reason: string;
}

/**
 * Classifies whether a software item is a standalone VRChat desktop tool (Gate G4 & Task 5.5).
 *
 * Positives: matches known VRChat desktop tools (e.g. VRCX, VRCFaceTracking, VRCOSC, ADVOSC)
 * or explicit OSC/tracking bridges designed for VRChat with high confidence (>= 0.8).
 * Negatives: generic VR utilities (e.g. SteamVR base station mounts, generic OpenVR apps,
 * Unity editor extensions, generic OSC libraries) return isDesktopTool: false or low confidence (< 0.5).
 */
export function classifyDesktopTool(
  title: string,
  description: string,
  outboundLinks: string[] = [],
  tags: string[] = []
): DesktopToolClassification {
  const normTitle = (title || "").normalize("NFKC").toLowerCase().trim();
  const normDesc = (description || "").normalize("NFKC").toLowerCase().trim();
  const normTags = (tags || []).map(t => (t || "").normalize("NFKC").toLowerCase().trim());
  const allText = `${normTitle} ${normDesc} ${normTags.join(" ")}`;

  // 1. Direct match for known high-profile VRChat desktop tools
  if (/\bvrcx\b/.test(normTitle) || normTags.includes("vrcx")) {
    return {
      isDesktopTool: true,
      subtype: "companion_client",
      confidence: 0.98,
      reason: "Matches known VRChat companion application (VRCX)"
    };
  }

  if (/\bvrcfacetracking\b|\bvrc\s*face\s*tracking\b/.test(normTitle) || normTags.includes("vrcfacetracking")) {
    return {
      isDesktopTool: true,
      subtype: "tracking_bridge",
      confidence: 0.98,
      reason: "Matches known VRChat facial/eye tracking bridge (VRCFaceTracking)"
    };
  }

  if (/\bvrcosc\b/.test(normTitle) || normTags.includes("vrcosc")) {
    return {
      isDesktopTool: true,
      subtype: "osc_control",
      confidence: 0.98,
      reason: "Matches known VRChat OSC control application (VRCOSC)"
    };
  }

  if (/\badvosc\b/.test(normTitle) || normTags.includes("advosc")) {
    return {
      isDesktopTool: true,
      subtype: "osc_control",
      confidence: 0.95,
      reason: "Matches known VRChat OSC chatbox and parameter utility (ADVOSC)"
    };
  }

  // 2. Hardware / physical accessories check (e.g. SteamVR base station mounts)
  if (
    /\b(?:base\s*station\s*mount|wall\s*mount|3d\s*print(?:able)?|mount\b|stand\b|holder\b|strap\b|sensor\s*mount)\b/.test(
      allText
    ) &&
    !/\b(?:executable|\.exe|desktop\s*app|software|application)\b/.test(allText)
  ) {
    return {
      isDesktopTool: false,
      confidence: 0.05,
      reason: "Physical hardware, mount, or 3D printable accessory (not software)"
    };
  }

  // 3. Avatar 3D models / cosmetics check
  if (
    /\b(?:avatar\s*clothing|3d\s*model|costume|dress|outfit|texture\s*pack|hair\s*mesh|avatar\s*prefab)\b/.test(
      allText
    ) &&
    !/\b(?:executable|\.exe|desktop\s*app|companion|utility|tracking)\b/.test(allText)
  ) {
    return {
      isDesktopTool: false,
      confidence: 0.02,
      reason: "Avatar 3D asset or cosmetic model, not software"
    };
  }

  // 4. In-editor Unity extensions / packages check (without standalone desktop executable)
  if (
    /\b(?:unity\s*editor(?:\s*extension|\s*tool|\s*window|\s*script)?|unitypackage|ndmf\s*plugin|modular\s*avatar\s*(?:module|setup)|editor\s*hierarchy)\b/.test(
      allText
    ) &&
    !/\b(?:standalone|desktop\s*app|executable|\.exe|electron|wpf|winforms|tauri)\b/.test(allText)
  ) {
    return {
      isDesktopTool: false,
      confidence: 0.15,
      reason: "Unity editor extension or in-editor package, not a standalone desktop tool"
    };
  }

  // 5. VRChat specificity check
  const targetsVRChat =
    /\b(?:vrchat|vrc|vrc-osc)\b/.test(allText) ||
    outboundLinks.some(l => l.toLowerCase().includes("vrchat"));

  if (!targetsVRChat) {
    if (/\b(?:steamvr|openvr|valve\s*index|vive)\b/.test(allText)) {
      return {
        isDesktopTool: false,
        confidence: 0.15,
        reason: "Generic VR or SteamVR utility without VRChat-specific targeting (lead only)"
      };
    }
    if (/\b(?:osc|open\s*sound\s*control)\b/.test(allText)) {
      return {
        isDesktopTool: false,
        confidence: 0.15,
        reason: "Generic OSC tool or library without VRChat-specific targeting (lead only)"
      };
    }
    return {
      isDesktopTool: false,
      confidence: 0.05,
      reason: "General software without VRChat targeting"
    };
  }

  // 6. Evaluates desktop / runtime indicators for VRChat-specific tools
  const hasDesktopIndicator =
    /\b(?:desktop|standalone|companion|executable|\.exe|app\b|application|client|gui|window|overlay|soundboard|daemon|tray|bridge|router)\b/.test(
      allText
    );

  // Subtype detection
  let detectedSubtype: DesktopToolSubtype | undefined;
  let subtypeReason = "";

  if (/\b(?:tracking\s*bridge|face\s*tracking|eye\s*tracking|facetracking|mocap\s*(?:bridge|osc)|kinect|body\s*tracking\s*bridge|tracker\s*bridge)\b/.test(allText)) {
    detectedSubtype = "tracking_bridge";
    subtypeReason = "Explicit VRChat tracking bridge application";
  } else if (/\b(?:companion\s*(?:client|app|application)?|friend\s*(?:manager|log)|session\s*(?:logger|history)|vrc\s*client|account\s*manager)\b/.test(allText)) {
    detectedSubtype = "companion_client";
    subtypeReason = "Explicit VRChat companion/client desktop application";
  } else if (/\b(?:speech\s*to\s*text|stt|text\s*to\s*speech|tts|translation|stream\s*overlay|subtitles|captions|twitch\s*chat)\b/.test(allText)) {
    detectedSubtype = "streaming_accessibility";
    subtypeReason = "VRChat streaming and accessibility desktop utility";
  } else if (/\b(?:osc\s*(?:tool|control|controller|router|dashboard|soundboard|app|application)|chatbox\s*(?:osc|tool|app)|avatar\s*parameters?\s*(?:osc|control)|osc)\b/.test(allText)) {
    detectedSubtype = "osc_control";
    subtypeReason = "VRChat OSC control or routing application";
  } else if (/\b(?:cache\s*cleaner|log\s*(?:watcher|parser|viewer)|screenshot\s*(?:manager|organizer)|desktop\s*utility|vrc(?:hat)?\s*utility)\b/.test(allText)) {
    detectedSubtype = "utility";
    subtypeReason = "VRChat standalone desktop utility";
  }

  if (detectedSubtype && hasDesktopIndicator) {
    return {
      isDesktopTool: true,
      subtype: detectedSubtype,
      confidence: 0.88,
      reason: subtypeReason
    };
  }

  if (detectedSubtype) {
    // Has subtype features but weak desktop standalone evidence -> moderate confidence lead (< 0.8)
    return {
      isDesktopTool: false,
      subtype: detectedSubtype,
      confidence: 0.65,
      reason: `${subtypeReason} (unconfirmed standalone desktop distribution)`
    };
  }

  return {
    isDesktopTool: false,
    confidence: 0.3,
    reason: "Mentions VRChat but lacks standalone desktop tool characteristics"
  };
}
