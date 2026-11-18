function newerVersion(candidate, current) {
  const parts = (s) =>
    /^\d+\.\d+\.\d+$/.test(s) ? s.split(".").map(Number) : null;
  const a = parts(candidate),
    b = parts(current);
  if (
    !a ||
    !b ||
    [...a, ...b].some((n) => !Number.isSafeInteger(n) || n > 65535)
  )
    return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function createAppUpdater({
  updater,
  version,
  showDialog,
  canRestart = () => true,
}) {
  let busy = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = true;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.logger = null;
  // Errors may contain signed URLs or local paths. Never log or display them.
  updater.on("error", () => {});
  async function check(manual = false) {
    if (busy) return;
    busy = true;
    let userAction = manual;
    try {
      const result = await updater.checkForUpdates();
      const next = result?.updateInfo?.version;
      if (!next || !newerVersion(next, version)) {
        if (manual)
          await showDialog({
            type: "info",
            message: `iRRELEVANT OS ${version} is up to date.`,
            detail: "Only published, checked Windows releases are offered.",
          });
        return;
      }
      const download = await showDialog({
        type: "info",
        message: `iRRELEVANT OS ${next} is available.`,
        detail:
          "Download the update from irrelevantco/irrelevant-os on GitHub? Your CRM records, connection and Google setup stay in their existing locations. This personal preview is unsigned.",
        buttons: ["Download update", "Later"],
        defaultId: 1,
        cancelId: 1,
      });
      if (download.response !== 0) return;
      userAction = true;
      await updater.downloadUpdate();
      const install = await showDialog({
        type: "info",
        message: `Update ${next} downloaded and checksum verified.`,
        detail:
          "Finish pending sends and save edits before restarting. The installer replaces application files; it does not reset your database or remove your saved Google setup.",
        buttons: ["Install and restart", "Later"],
        defaultId: 1,
        cancelId: 1,
      });
      if (install.response !== 0) return;
      if (!canRestart()) {
        await showDialog({
          type: "info",
          message: "A workspace operation is still running.",
          detail: "Let it finish, then choose Check for app updates… again.",
        });
        return;
      }
      updater.quitAndInstall(false, true);
    } catch {
      if (userAction)
        await showDialog({
          type: "error",
          message: "The update could not be completed.",
          detail:
            "Your installed app and database were kept. Check your connection and try Check for app updates… later. No unverified update was installed.",
        });
    } finally {
      busy = false;
    }
  }
  return { check };
}
module.exports = { createAppUpdater, newerVersion };
