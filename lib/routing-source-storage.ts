/** Session key: chamber/building registry id used as resolveRoute sourceEntityId */
export const ROUTING_SOURCE_ENTITY_KEY = "routingSourceEntityId";

export function getRoutingSourceEntityId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(ROUTING_SOURCE_ENTITY_KEY);
  } catch {
    return null;
  }
}

export function setRoutingSourceEntityId(entityRegistryId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (entityRegistryId) {
      sessionStorage.setItem(ROUTING_SOURCE_ENTITY_KEY, entityRegistryId);
    } else {
      sessionStorage.removeItem(ROUTING_SOURCE_ENTITY_KEY);
    }
  } catch {
    /* ignore */
  }
}
