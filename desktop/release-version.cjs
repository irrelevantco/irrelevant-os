function parts(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw Error("Expected a numeric desktop version");
  const values = version.split(".").map(Number);
  if (values.some((v) => !Number.isSafeInteger(v) || v > 65535))
    throw Error("Desktop version is outside Windows limits");
  return values;
}
function nextReleaseVersion(sourceVersion, publishedVersions) {
  const source = parts(sourceVersion);
  let highest = source;
  let mustIncrement = false;
  for (const version of publishedVersions) {
    const p = parts(version);
    const cmp = p[0] - highest[0] || p[1] - highest[1] || p[2] - highest[2];
    if (cmp > 0) {
      highest = p;
      mustIncrement = true;
    } else if (cmp === 0) mustIncrement = true;
  }
  if (mustIncrement) highest = [highest[0], highest[1], highest[2] + 1];
  parts(highest.join("."));
  return highest.join(".");
}
module.exports = { nextReleaseVersion };
