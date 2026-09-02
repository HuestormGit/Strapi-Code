// TEMPORARY dev script (deleted after verification): mints a read-only API token
// so the updated REST API can be exercised the way the React app calls it.
(async () => {
  const { createStrapi } = require("@strapi/strapi");
  const app = await createStrapi().load();
  const svc = app.service("admin::api-token");
  const existing = await svc.getByName("claude-verify-temp");
  if (existing) await svc.revoke(existing.id);
  const token = await svc.create({
    name: "claude-verify-temp",
    description: "temp read-only token",
    type: "read-only",
    lifespan: null,
  });
  console.log("ACCESS_KEY=" + token.accessKey);
  await app.destroy();
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
