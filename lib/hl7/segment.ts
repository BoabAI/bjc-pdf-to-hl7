/**
 * HL7 segment helper.
 *
 * Build an HL7 segment from a sparse field map keyed by HL7 field number.
 * The output is `NAME|<field min>|<field min+1>|...|<field max>` where
 * `min` and `max` are the smallest and largest field numbers present in
 * the map. Any field number between `min` and `max` not present in the
 * map is emitted as an empty string. Field 0 is reserved for the segment
 * name and ignored if passed.
 *
 * MSH is special: MSH-1 IS the field separator (`|`) and MSH-2 IS the
 * encoding-character set (`^~\&`). The wire format is
 * `MSH|^~\&|<field 3>|...`. For MSH, callers pass field 2 as the
 * encoding chars and skip field 1 entirely — the helper then renders
 * fields starting at MSH-2, with the leading `|` between `MSH` and the
 * encoding chars naturally serving as MSH-1 (the field separator).
 *
 * Values are NOT escaped — callers must escape inputs with `escapeHL7`
 * before passing them in (so segment composers retain control over which
 * fields contain pre-formatted HL7 substructure like `^`-joined names).
 */

const FIELD_SEP = "|";

export function segment(
  name: string,
  fields: Record<number, string | undefined>,
): string {
  const numericKeys = Object.keys(fields)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 1);

  if (numericKeys.length === 0) {
    return name;
  }

  const minField = Math.min(...numericKeys);
  const maxField = Math.max(...numericKeys);

  const parts: string[] = [name];
  for (let i = minField; i <= maxField; i++) {
    parts.push(fields[i] ?? "");
  }
  return parts.join(FIELD_SEP);
}
