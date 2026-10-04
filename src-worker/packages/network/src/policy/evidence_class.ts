import { z } from "zod";

/** Evidence classes carried by reviewed source profiles and leases. */
export const EvidenceClassSchema = z.enum(["normalized_facts", "creator_prose", "raw_payload", "media_metadata"]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;
