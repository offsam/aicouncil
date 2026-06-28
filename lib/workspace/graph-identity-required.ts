import {
  resolveCityHallBuildingId,
  resolveExternalEntryOfficeId,
  resolveTechDepartmentBuildingId,
  resolveTechDepartmentMainChamberRegistryId,
} from "./graph-identity";

/** Why requireExternalEntryOfficeId() rejected the resolver result. */
export type ExternalEntryOfficeInvariantReason =
  | "none_external_entry"
  | "multiple_external_entry"
  | "offices_query_error"
  | "graph_unavailable";

/** Production invariant: exactly one office with workspace_meta.external_entry === true. */
export class ExternalEntryOfficeInvariantError extends Error {
  readonly reason: ExternalEntryOfficeInvariantReason;

  constructor(reason: ExternalEntryOfficeInvariantReason, message?: string) {
    super(message ?? `External entry office invariant violated: ${reason}`);
    this.name = "ExternalEntryOfficeInvariantError";
    this.reason = reason;
  }
}

export type CityHallBuildingInvariantReason =
  | "building_role_unset"
  | "building_role_column_missing"
  | "graph_unavailable";

export class CityHallBuildingInvariantError extends Error {
  readonly reason: CityHallBuildingInvariantReason;

  constructor(reason: CityHallBuildingInvariantReason, message?: string) {
    super(message ?? `City Hall building invariant violated: ${reason}`);
    this.name = "CityHallBuildingInvariantError";
    this.reason = reason;
  }
}

export type TechDepartmentBuildingInvariantReason =
  | "building_role_unset"
  | "building_role_column_missing"
  | "graph_unavailable";

export class TechDepartmentBuildingInvariantError extends Error {
  readonly reason: TechDepartmentBuildingInvariantReason;

  constructor(reason: TechDepartmentBuildingInvariantReason, message?: string) {
    super(message ?? `Tech Department building invariant violated: ${reason}`);
    this.name = "TechDepartmentBuildingInvariantError";
    this.reason = reason;
  }
}

export type TechMainChamberInvariantReason =
  | "building_role_unset"
  | "building_role_column_missing"
  | "main_chamber_missing"
  | "graph_unavailable";

export class TechMainChamberInvariantError extends Error {
  readonly reason: TechMainChamberInvariantReason;

  constructor(reason: TechMainChamberInvariantReason, message?: string) {
    super(message ?? `Tech Department main chamber invariant violated: ${reason}`);
    this.name = "TechMainChamberInvariantError";
    this.reason = reason;
  }
}

function toExternalEntryReason(
  unresolvedReason: string | undefined,
): ExternalEntryOfficeInvariantReason {
  switch (unresolvedReason) {
    case "none_external_entry":
    case "multiple_external_entry":
    case "offices_query_error":
      return unresolvedReason;
    default:
      return "graph_unavailable";
  }
}

function toBuildingRoleReason(
  unresolvedReason: string | undefined,
): "building_role_unset" | "building_role_column_missing" | "graph_unavailable" {
  switch (unresolvedReason) {
    case "building_role_unset":
    case "building_role_column_missing":
      return unresolvedReason;
    default:
      return "graph_unavailable";
  }
}

function toTechMainChamberReason(
  unresolvedReason: string | undefined,
): TechMainChamberInvariantReason {
  switch (unresolvedReason) {
    case "building_role_unset":
    case "building_role_column_missing":
    case "main_chamber_missing":
      return unresolvedReason;
    default:
      return "graph_unavailable";
  }
}

/**
 * Production require-layer for DR-001.
 * Throws when the graph path did not resolve exactly one external-entry office.
 */
export async function requireExternalEntryOfficeId(): Promise<string> {
  const result = await resolveExternalEntryOfficeId();

  if (result.source === "graph" && result.value) {
    return result.value;
  }

  const reason = toExternalEntryReason(result.unresolvedReason);
  console.error(
    `[graph-identity] INVARIANT_VIOLATION requireExternalEntryOfficeId reason=${reason} source=${result.source}`,
  );
  throw new ExternalEntryOfficeInvariantError(reason);
}

/**
 * Production require-layer for DR-002.
 * Throws when City Hall building is not resolved via building_role graph path.
 */
export async function requireCityHallBuildingId(officeId: string): Promise<string> {
  const result = await resolveCityHallBuildingId(officeId);

  if (result.source === "graph" && result.value) {
    return result.value;
  }

  const reason = toBuildingRoleReason(result.unresolvedReason);
  console.error(
    `[graph-identity] INVARIANT_VIOLATION requireCityHallBuildingId reason=${reason} source=${result.source} officeId=${officeId}`,
  );
  throw new CityHallBuildingInvariantError(reason);
}

/**
 * Production require-layer for DR-003.
 * Throws when Tech Department building is not resolved via building_role graph path.
 */
export async function requireTechDepartmentBuildingId(officeId: string): Promise<string> {
  const result = await resolveTechDepartmentBuildingId(officeId);

  if (result.source === "graph" && result.value) {
    return result.value;
  }

  const reason = toBuildingRoleReason(result.unresolvedReason);
  console.error(
    `[graph-identity] INVARIANT_VIOLATION requireTechDepartmentBuildingId reason=${reason} source=${result.source} officeId=${officeId}`,
  );
  throw new TechDepartmentBuildingInvariantError(reason);
}

/**
 * Production require-layer for DR-006.
 * Throws when Tech Department main chamber is not resolved via graph path.
 */
export async function requireTechDepartmentMainChamberRegistryId(
  officeId: string,
): Promise<string> {
  const result = await resolveTechDepartmentMainChamberRegistryId(officeId);

  if (result.source === "graph" && result.value) {
    return result.value;
  }

  const reason = toTechMainChamberReason(result.unresolvedReason);
  console.error(
    `[graph-identity] INVARIANT_VIOLATION requireTechDepartmentMainChamberRegistryId reason=${reason} source=${result.source} officeId=${officeId}`,
  );
  throw new TechMainChamberInvariantError(reason);
}
