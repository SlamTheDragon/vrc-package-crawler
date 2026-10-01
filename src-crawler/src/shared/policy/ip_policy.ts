function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

/** Conservative public-address check shared across coordinator and standalone nodes. */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().replace(/^\[|\]$/g, "");
  if (cleanIp === "localhost") return true;
  if (cleanIp.includes(".") && !cleanIp.includes(":")) return isPrivateOrReservedIpv4(cleanIp);

  let norm = cleanIp.toLowerCase();
  const lastColon = norm.lastIndexOf(":");
  if (lastColon !== -1) {
    const tail = norm.slice(lastColon + 1);
    if (tail.includes(".")) {
      const parts = tail.split(".").map(Number);
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
      if (isPrivateOrReservedIpv4(tail)) return true;
      const hexTail = ((parts[0] << 8) | parts[1]).toString(16) + ":" + ((parts[2] << 8) | parts[3]).toString(16);
      norm = norm.slice(0, lastColon) + ":" + hexTail;
    }
  }

  const parts = norm.split("::");
  let groups: number[];
  if (parts.length === 1) {
    groups = norm.split(":").map((part) => parseInt(part || "0", 16));
  } else if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":").map((part) => parseInt(part, 16)) : [];
    const right = parts[1] ? parts[1].split(":").map((part) => parseInt(part, 16)) : [];
    groups = [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
  } else {
    return true;
  }
  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group) || group < 0 || group > 0xffff)) return true;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPrivateOrReservedIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join("."));
  }
  if (groups.slice(0, 6).every((group) => group === 0) && !(groups[6] === 0 && groups[7] === 1)) {
    return isPrivateOrReservedIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join("."));
  }
  const g0 = groups[0];
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && groups[1] === 0x0db8) return true;
  if (g0 === 0x0100 && (groups[1] & 0xff00) === 0) return true;
  return false;
}
