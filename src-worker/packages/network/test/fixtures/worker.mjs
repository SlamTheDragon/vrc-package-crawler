import { checkArtifact } from './check.mjs';

export default { async fetch() { return Response.json(await checkArtifact()); } };
