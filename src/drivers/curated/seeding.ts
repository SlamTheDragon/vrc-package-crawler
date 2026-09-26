import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db } from "../../db.ts";

// Multi-maintainer decentralized community registries across the VRChat ecosystem
// FIXME: are these true canonical seeds, can this be dynamically generated upon startup from fresh instance?
export const COMMUNITY_REGISTRY_SEEDS = [
  "vrchat-community/vpm-listing-curated",
  "kurotu/vpm-catalog",
  "Narazaka/vpm-repos",
  "Rafael-6fx/VPM-Repo-catalog-plus",
  "ureishi/vpm-repos",
  "lilxyzw/vpm-repos",
  "vrcd-community/vpm-repos-syncronizer-web",
  "madjin/awesome-vrchat",
  "misyaguziya/awesome-vrchat",
  "edu3d-lsl/awesome-vrchat"
];
