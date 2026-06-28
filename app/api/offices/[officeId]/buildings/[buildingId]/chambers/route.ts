import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CHAMBER } from "@/lib/control-defaults";
import { seedDefaultChamberRoster } from "@/lib/chamber-default-roster";
import { resolveUniqueChamberSlug } from "@/lib/entity-registry-ensure";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; buildingId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { buildingId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    
    // Fetch chambers and join with entity_registry to get slug and name info
    const { data, error } = await supabase
      .from("chambers")
      .select("*, entity_registry!entity_registry_id(*)")
      .eq("building_object_id", buildingId)
      .order("created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const chambers = (data ?? []).map((row) => ({
      ...row,
      entity_registry: row.entity_registry,
    }));

    return NextResponse.json({ chambers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, buildingId } = await params;

  try {
    const body = (await request.json()) as {
      name?: string;
      x?: number;
      z?: number;
      width?: number;
      depth?: number;
      manager_agent_id?: string | null;
      routing_description?: string | null;
    };

    const name = body.name?.trim();
    const x = body.x ?? 0;
    const z = body.z ?? 0;
    const width = body.width ?? DEFAULT_CHAMBER.width;
    const depth = body.depth ?? DEFAULT_CHAMBER.depth;
    const routingDescription = body.routing_description?.trim() || null;

    if (!name) {
      return NextResponse.json({ error: "name обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Create a row in entity_registry first
    const slug = await resolveUniqueChamberSlug(supabase, buildingId, name);
    const { data: registry, error: regError } = await supabase
      .from("entity_registry")
      .insert({
        entity_type: "chamber",
        name,
        slug,
        parent_entity_id: buildingId,
        ...(routingDescription ? { routing_description: routingDescription } : {}),
      })
      .select()
      .single();

    if (regError || !registry) {
      return NextResponse.json({ error: regError?.message || "Failed to register entity" }, { status: 500 });
    }

    // 2. Create the physical chamber row
    const { data: chamber, error: chamError } = await supabase
      .from("chambers")
      .insert({
        entity_registry_id: registry.id,
        building_entity_id: buildingId,
        building_object_id: buildingId,
        manager_agent_id: body.manager_agent_id || null,
        name,
        x,
        z,
        width,
        depth,
      })
      .select()
      .single();

    if (chamError || !chamber) {
      // rollback registry entry
      await supabase.from("entity_registry").delete().eq("id", registry.id);
      return NextResponse.json({ error: chamError?.message || "Failed to create chamber" }, { status: 500 });
    }

    const defaultRoster = await seedDefaultChamberRoster(supabase, {
      chamberId: chamber.id,
      chamberRegistryId: registry.id,
    });

    return NextResponse.json({
      chamber: {
        ...chamber,
        entity_registry: registry,
      },
      default_roster: defaultRoster,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
