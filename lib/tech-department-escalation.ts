import { AI_COUNCIL_OFFICE_ID } from "./ai-council-ids";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { resolveCityHallMainAgent } from "./workspace/city-hall-orchestrator";
import {
  TECH_DEPARTMENT_BUILDING_ID,
  TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID,
} from "./workspace/tech-department";

export { TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID };

export type TechEscalationKind =
  | "provider_failure"
  | "fallback_exhausted"
  | "connection_help";

export type TechEscalationRecord = {
  id: string;
  kind: TechEscalationKind;
  provider: string;
  error: string;
  timestamp: string;
  userMessage: string;
  connectionId: string | null;
  mayorAgentName: string | null;
  delivered: boolean;
};

type EscalateInput = {
  kind: TechEscalationKind;
  provider: string;
  error: string;
  userMessage?: string;
};

const pendingEscalations = new Map<string, TechEscalationRecord>();
const recentEscalationKeys = new Map<string, number>();
const ESCALATION_COOLDOWN_MS = 5 * 60 * 1000;

function escalationKey(kind: TechEscalationKind, provider: string, error: string): string {
  return `${kind}:${provider}:${error.slice(0, 120)}`;
}

function shouldThrottle(key: string): boolean {
  const last = recentEscalationKeys.get(key);
  if (last && Date.now() - last < ESCALATION_COOLDOWN_MS) return true;
  recentEscalationKeys.set(key, Date.now());
  return false;
}

function defaultUserMessage(kind: TechEscalationKind, provider: string, error: string): string {
  if (kind === "connection_help") {
    return (
      `Уважаемый пользователь, технический отдел не может установить подключение (${provider}). ` +
      `Детали: ${error}. Мы передали запрос в мэрию — попробуйте повторить позже или выберите другой режим.`
    );
  }
  if (kind === "fallback_exhausted") {
    return (
      `Уважаемый пользователь, у провайдера ${provider} исчерпаны запасные модели. ` +
      `Ошибка: ${error}. Технический отдел эскалировал проблему в мэрию.`
    );
  }
  return (
    `Уважаемый пользователь, технический отдел зафиксировал сбой провайдера ${provider}. ` +
    `Ошибка: ${error}. Информация передана в мэрию — при срочной необходимости повторите запрос позже.`
  );
}

export async function findTechDepartmentCityHallConnection(): Promise<{
  connectionId: string;
  targetEntityId: string;
  sendTasks: boolean;
  readResults: boolean;
} | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();

  const { data: cityHall } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room")
    .eq("label", "City Hall")
    .limit(1)
    .maybeSingle();

  if (!cityHall?.id) return null;

  const { data: conn } = await supabase
    .from("connections")
    .select(
      "id, target_entity_id, is_active, connection_permissions(send_tasks, read_results)",
    )
    .eq("source_entity_id", TECH_DEPARTMENT_BUILDING_ID)
    .eq("target_entity_id", cityHall.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!conn?.id) return null;

  const perms = conn.connection_permissions as
    | { send_tasks?: boolean; read_results?: boolean }
    | { send_tasks?: boolean; read_results?: boolean }[]
    | null;
  const perm = Array.isArray(perms) ? perms[0] : perms;

  return {
    connectionId: conn.id,
    targetEntityId: conn.target_entity_id,
    sendTasks: perm?.send_tasks === true,
    readResults: perm?.read_results === true,
  };
}

async function logEscalationOnConnection(
  connectionId: string,
  summary: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("connection_logs").insert({
      connection_id: connectionId,
      payload_type: "task",
      summary,
    });
  } catch (err) {
    console.warn("[tech-department-escalation] connection_logs insert failed:", err);
  }
}

export async function escalateToCityHall(
  input: EscalateInput,
): Promise<TechEscalationRecord | null> {
  const error = input.error.trim();
  if (!error) return null;

  const key = escalationKey(input.kind, input.provider, error);
  if (shouldThrottle(key)) return null;

  const connection = await findTechDepartmentCityHallConnection();
  if (!connection?.sendTasks) {
    console.warn(
      "[tech-department-escalation] City Hall connection missing or send_tasks disabled",
    );
    return null;
  }

  const mayor = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE_ID);
  const userMessage =
    input.userMessage?.trim() ||
    defaultUserMessage(input.kind, input.provider, error);

  const record: TechEscalationRecord = {
    id: crypto.randomUUID(),
    kind: input.kind,
    provider: input.provider,
    error,
    timestamp: new Date().toISOString(),
    userMessage,
    connectionId: connection.connectionId,
    mayorAgentName: mayor?.agentName ?? "Мэр",
    delivered: false,
  };

  pendingEscalations.set(record.id, record);

  const logSummary =
    `Эскалация (${input.kind}): ${input.provider} — ${error.slice(0, 200)}`;
  await logEscalationOnConnection(connection.connectionId, logSummary);

  console.info(
    `[tech-department-escalation] routed to City Hall via ${connection.connectionId} (${input.provider})`,
  );

  return record;
}

export function listPendingEscalations(): TechEscalationRecord[] {
  return [...pendingEscalations.values()]
    .filter((e) => !e.delivered)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function acknowledgeEscalation(id: string): boolean {
  const record = pendingEscalations.get(id);
  if (!record) return false;
  record.delivered = true;
  pendingEscalations.set(id, record);
  return true;
}

export async function maybeEscalateOnProviderFailure(
  providerTag: string,
  primaryModel: string,
  error: string,
): Promise<void> {
  try {
    await escalateToCityHall({
      kind: "provider_failure",
      provider: providerTag,
      error: `${primaryModel}: ${error}`,
    });
  } catch (err) {
    console.warn("[tech-department-escalation] provider failure escalate failed:", err);
  }
}
