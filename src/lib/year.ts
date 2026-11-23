// Dates arrive in mixed shapes: a bare year, a full date, or a range. The
// first four digits are the year in every shape seen so far.
export function yearOf(value: unknown): string | undefined {
  return typeof value === "string" ? value.match(/^\d{4}/)?.[0] : undefined;
}
