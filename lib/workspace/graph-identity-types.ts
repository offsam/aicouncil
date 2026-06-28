/** How a graph-identity resolver chose its result. */
export type GraphIdentitySource = "graph" | "unresolved";

export type GraphIdentityResult<T> = {
  value: T | null;
  source: GraphIdentitySource;
  /** Set when source is unresolved — why graph identity did not resolve. */
  unresolvedReason?: string;
};

export type BuildingRole = "city_hall" | "tech_department";

export type MainChamberRef = {
  chamberId: string;
  chamberRegistryId: string;
  managerAgentId: string | null;
};

export type TechCityHallConnectionRef = {
  connectionId: string;
  targetEntityId: string;
  sendTasks: boolean;
  readResults: boolean;
};
