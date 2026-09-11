import { CONFIG } from "../src/config.ts";

async function testCreatorRepos(user: string) {
  const headers: Record<string, string> = {
    "User-Agent": CONFIG.userAgent,
    "Accept": "application/vnd.github.v3+json"
  };
  if (CONFIG.githubToken) headers["Authorization"] = `Bearer ${CONFIG.githubToken}`;

  const resp = await fetch(`https://api.github.com/users/${user}/repos?per_page=100`, { headers });
  console.log(`Status for ${user}:`, resp.status);
  const data = await resp.json();
  if (Array.isArray(data)) {
    console.log(`Found ${data.length} repos for ${user}:`);
    for (const r of data.slice(0, 10)) {
      console.log(` - ${r.name} (${r.description ? r.description.slice(0, 60) : 'No desc'})`);
    }
  } else {
    console.log("Response:", data);
  }
}

testCreatorRepos("anatawa12").catch(console.error);
testCreatorRepos("bdunderscore").catch(console.error);
