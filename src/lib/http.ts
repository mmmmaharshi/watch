// Third-party JSON; call sites check the shape before use. This is the only
// shared piece of the HTTP world: the Effect services own fetching.
type JsonValue = string | number | boolean | null | Array<JsonValue> | { [key: string]: JsonValue };
export type LooseJson = { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

export function isLooseJson(value: unknown): value is LooseJson {
  return isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value);
}
