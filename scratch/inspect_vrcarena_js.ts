const resp = await fetch("https://vrcarena.com/index.js");
const js = await resp.text();
console.log("index.js length:", js.length);
// Find URLs or fetch endpoints
const apiMatches = js.match(/https?:\/\/[a-zA-Z0-9_.-]+(?:\.firebaseio\.com|\.supabase\.co|\/api\/|\/graphql)[^"'\s)]*/g) || [];
console.log("API URL matches:", Array.from(new Set(apiMatches)));
const envMatches = js.match(/["'][A-Za-z0-9_-]{20,}["']/g) || [];
console.log("Possible keys/tokens count:", envMatches.length);
const endpoints = js.match(/(?:apiUrl|baseUrl|apiEndpoint|firebase|supabase|graphql)[\s:=]+["']([^"']+)["']/gi) || [];
console.log("Endpoint matches:", endpoints);
