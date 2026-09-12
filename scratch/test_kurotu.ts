const resp = await fetch("https://raw.githubusercontent.com/kurotu/vpm-catalog/master/repositories.txt");
if (resp.ok) {
  const text = await resp.text();
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  console.log("Total repositories.txt lines:", lines.length);
  console.log("Sample repos:", lines.slice(0, 10));
}
