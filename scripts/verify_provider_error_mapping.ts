/**
 * Verify provider errors are mapped to plain-language user messages (item 3).
 */
import {
  BUILDING_NOT_CONFIGURED_USER_MESSAGE,
  PROVIDER_UNAVAILABLE_USER_MESSAGE,
  looksLikeProviderErrorText,
  sanitizeUserFacingText,
  toUserFacingChatError,
  toUserFacingProviderError,
} from "../lib/provider-user-error";
import { ProviderInvokeError } from "../lib/provider-user-error";

const RAW_GROQ =
  "Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_01kvr6qdwdft6v68jrf0j942my` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Used 5890, Requested 500.";
const RAW_TPD =
  "Rate limit reached for model `llama-3.3-70b-versatile` tokens per day (TPD): Limit 100000, Used 99225.";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

function main() {
  assert(looksLikeProviderErrorText(RAW_GROQ), "detects Groq TPM leak");
  assert(looksLikeProviderErrorText(RAW_TPD), "detects Groq TPD leak");

  assert(
    toUserFacingProviderError(new ProviderInvokeError("groq", "llama-3.3-70b-versatile", RAW_GROQ)) ===
      PROVIDER_UNAVAILABLE_USER_MESSAGE,
    "ProviderInvokeError maps to plain message",
  );
  assert(
    toUserFacingProviderError(new Error(RAW_GROQ)) === PROVIDER_UNAVAILABLE_USER_MESSAGE,
    "raw Groq Error maps to plain message",
  );
  assert(
    sanitizeUserFacingText(RAW_GROQ) === PROVIDER_UNAVAILABLE_USER_MESSAGE,
    "sanitizeUserFacingText strips provider text",
  );
  assert(
    toUserFacingProviderError(new Error("Агент Мэра не найден")) === "Агент Мэра не найден",
    "non-provider errors pass through",
  );
  assert(
    toUserFacingChatError(new Error("Main chamber (Manager) не найден для здания")) ===
      BUILDING_NOT_CONFIGURED_USER_MESSAGE,
    "main chamber gap maps to configured building message",
  );

  console.log("\nAll provider error mapping checks passed.");
}

main();
