/** Node HTTP identity uses the node's config-synchronized product version. */
import { version } from "../../../package.json";
import { crawlerUserAgent } from "vrc-packages-network/identity";

export const CRAWLER_USER_AGENT = crawlerUserAgent(version);
