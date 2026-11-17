const byId = (id) => document.getElementById(id);
byId("mode").addEventListener("change", () => {
  byId("bundled").hidden = byId("mode").value !== "bundled";
  byId("hosted").hidden = byId("mode").value !== "hosted";
});
byId("import").addEventListener("click", async () => {
  const result = await window.irrelevantSetup.importEnvironment();
  if (result.error) {
    byId("status").textContent = result.error;
    return;
  }
  if (result.cancelled) return;
  byId("supabaseUrl").value = result.supabaseUrl;
  byId("publishableKey").value = result.publishableKey;
  byId("status").textContent =
    "Connection imported. Enter your existing operator account email.";
});
byId("connection").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("connect").disabled = true;
  byId("status").textContent = "Opening your workspace…";
  const result = await window.irrelevantSetup.connect({
    mode: byId("mode").value,
    appUrl: byId("appUrl").value,
    supabaseUrl: byId("supabaseUrl").value,
    publishableKey: byId("publishableKey").value,
    operatorEmail: byId("operatorEmail").value,
  });
  if (result?.error) {
    byId("status").textContent = result.error;
    byId("connect").disabled = false;
  }
});
