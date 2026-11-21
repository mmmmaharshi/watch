// `.agents` is vendored from skills-lock.json and must keep its hashes. oxfmt
// also skips dot-directories, so it fails when given only those files.
const isVendored = (file) => file.replaceAll("\\", "/").includes("/.agents/");

export default {
  "*.{js,ts,jsx,tsx,mjs,cjs,json,jsonc,md}": (files) => {
    const targets = files.filter((file) => !isVendored(file));
    return targets.length > 0
      ? `oxfmt --write ${targets.map((file) => JSON.stringify(file)).join(" ")}`
      : [];
  },
};
