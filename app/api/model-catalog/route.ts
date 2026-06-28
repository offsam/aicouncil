import { NextResponse } from "next/server";
import {
  filterCatalogModels,
  getModelCatalog,
  groupCatalogByCategory,
} from "@/lib/model-catalog/build-catalog";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const specialization = url.searchParams.get("specialization");
    const costTier = url.searchParams.get("cost_tier");
    const query = url.searchParams.get("q");
    const grouped = url.searchParams.get("grouped") === "1";

    const all = await getModelCatalog();
    const models = filterCatalogModels(all, { specialization, costTier, query });

    if (grouped) {
      return NextResponse.json({
        categories: groupCatalogByCategory(models),
        total: models.length,
      });
    }

    return NextResponse.json({ models, total: models.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
