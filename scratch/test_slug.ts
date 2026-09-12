function normalizeSlug(str: string): string {
  if (!str) return "";
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

console.log("AvatarOptimizer ->", normalizeSlug("AvatarOptimizer"));
console.log("avatar-optimizer ->", normalizeSlug("avatar-optimizer"));
console.log("Equal:", normalizeSlug("AvatarOptimizer") === normalizeSlug("avatar-optimizer"));

console.log("anatawa12/AvatarOptimizer ->", normalizeSlug("anatawa12/AvatarOptimizer"));
console.log("anatawa12-avatar-optimizer ->", normalizeSlug("anatawa12-avatar-optimizer"));
console.log("Equal:", normalizeSlug("anatawa12/AvatarOptimizer") === normalizeSlug("anatawa12-avatar-optimizer"));

console.log("VRC-Gesture-Manager ->", normalizeSlug("VRC-Gesture-Manager"));
console.log("GestureManager ->", normalizeSlug("GestureManager"));
console.log("gesture-manager ->", normalizeSlug("gesture-manager"));
