// TEMPORARY dev script (deleted after verification, and it deletes its own rows
// on `node claude-seed-temp.js clean`). Seeds one product + two variants so the
// React query can be exercised against the real REST layer.
const MARK = "CLAUDE-VERIFY";
(async () => {
  const { createStrapi } = require("@strapi/strapi");
  const app = await createStrapi().load();
  const docs = app.documents;

  const variants = await docs("api::product-variant.product-variant").findMany({
    filters: { sku: { $startsWith: MARK } },
  });
  for (const v of variants) await docs("api::product-variant.product-variant").delete({ documentId: v.documentId });
  const products = await docs("api::product.product").findMany({ filters: { SubTitle: MARK } });
  for (const p of products) await docs("api::product.product").delete({ documentId: p.documentId });

  if (process.argv[2] === "clean") {
    console.log(`CLEANED products=${products.length} variants=${variants.length}`);
    await app.destroy();
    process.exit(0);
  }

  const product = await docs("api::product.product").create({
    data: {
      Title: "Classic",
      SubTitle: MARK,
      Ingredients: [{ type: "paragraph", children: [{ text: "Toor Daal, Dhaniya, Jeera.", type: "text" }] }],
    },
    status: "published",
  });

  const mk = (name, packSize, sku, mrp, sell, order) =>
    docs("api::product-variant.product-variant").create({
      data: {
        product: product.documentId,
        name, packSize, sku,
        mrpMinor: mrp, discountMinor: mrp - sell, sellingPriceMinor: sell,
        taxableBaseMinor: Math.round(sell / 1.05), gstMinor: sell - Math.round(sell / 1.05),
        gstRateBps: 500, hsnCode: "0910", weightGrams: 100,
        isActive: true, displayOrder: order,
      },
    });

  await mk("Classic 100g", "100gms", `${MARK}-100`, 10000, 9500, 1);
  await mk("Classic 250g", "250gms", `${MARK}-250`, 18000, 17100, 2);
  // An inactive variant must never reach the storefront dropdown.
  await mk("Classic 500g (retired)", "500gms", `${MARK}-500`, 30000, 28000, 3).then((v) =>
    docs("api::product-variant.product-variant").update({ documentId: v.documentId, data: { isActive: false } })
  );

  console.log("SEEDED product documentId=" + product.documentId);
  await app.destroy();
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
