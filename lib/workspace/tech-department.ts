/** Label for the city-wide monitoring building on workspace canvas. */
export const TECH_DEPARTMENT_BUILDING_LABEL = "Технический отдел";

export const TECH_DEPARTMENT_BUILDING_ID = "a1000000-0000-4000-8000-000000000001";

/** Main chamber registry id (Manager). */
export const TECH_DEPARTMENT_MAIN_CHAMBER_REGISTRY_ID =
  "a1000000-0000-4000-8000-000000000002";

/** chambers.id for main chamber row. */
export const TECH_DEPARTMENT_MAIN_CHAMBER_ID = "a1000000-0000-4000-8000-000000000004";

/** Fixed connection id from migration 20260624240000. */
export const TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID =
  "c1000000-0000-4000-8000-000000000001";

/** @deprecated Monitoring chamber removed — stats on building tile. */
export const TECH_DEPARTMENT_MONITORING_CHAMBER_ID = "a1000000-0000-4000-8000-000000000003";

export function isTechDepartmentBuilding(
  label: string | null | undefined,
  buildingRole?: string | null,
): boolean {
  if (buildingRole === "tech_department") return true;
  const normalized = label?.trim().toLowerCase() ?? "";
  return (
    normalized === TECH_DEPARTMENT_BUILDING_LABEL.toLowerCase() ||
    normalized === "tech department"
  );
}
