import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const {
  createAppUpdater,
  newerVersion,
} = require("../../desktop/app-updater.cjs");
const { nextReleaseVersion } = require("../../desktop/release-version.cjs");
function fixture(answers = [0, 0], version = "0.3.2") {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn().mockResolvedValue({ updateInfo: { version } }),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn(),
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
  });
  const showDialog = vi
    .fn()
    .mockImplementation(async () => ({ response: answers.shift() ?? 1 }));
  return {
    updater,
    showDialog,
    control: createAppUpdater({ updater, showDialog, version: "0.3.1" }),
  };
}
describe("approved desktop updates", () => {
  it("disables implicit downloads, install-on-quit and downgrades", () => {
    const { updater } = fixture();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
  });
  it("leaves a declined update untouched", async () => {
    const { updater, control } = fixture([1]);
    await control.check();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it("downloads but does not restart when installation is deferred", async () => {
    const { updater, control } = fixture([0, 1]);
    await control.check();
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it("installs only after both explicit confirmations", async () => {
    const { updater, control } = fixture();
    await control.check(true);
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });
  it("never installs after a failed/checksum-rejected download or exposes signed URLs", async () => {
    const { updater, showDialog, control } = fixture();
    updater.downloadUpdate.mockRejectedValue(Error("secret signed URL"));
    await control.check(true);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(JSON.stringify(showDialog.mock.calls)).not.toContain(
      "secret signed URL",
    );
  });
  it("waits for running workspace operations", async () => {
    const { updater, showDialog } = fixture();
    const control = createAppUpdater({
      updater,
      showDialog,
      version: "0.3.1",
      canRestart: () => false,
    });
    await control.check(true);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it.each([
    "0.3.0",
    "0.3.1",
    "https://untrusted.test/file",
    "0.3.2-beta",
    "0.3.999999",
  ])("refuses an old or unsupported version %s", async (version) => {
    expect(newerVersion(version, "0.3.1")).toBe(false);
    const { updater, control } = fixture([], version);
    await control.check(true);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });
  it("assigns the next release automatically without changing major/minor on ordinary pushes", () => {
    expect(nextReleaseVersion("0.3.1", ["0.3.0"])).toBe("0.3.1");
    expect(nextReleaseVersion("0.3.1", ["0.3.1", "0.3.2"])).toBe("0.3.3");
    expect(nextReleaseVersion("0.4.0", ["0.3.3"])).toBe("0.4.0");
  });
});
