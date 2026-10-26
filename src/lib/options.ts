export interface Option {
  value: string;
  label: string;
}

/** Select options from a list of plain enumeration values. Usable on server and client. */
export function toOptions(values: readonly string[]): Option[] {
  return values.map((v) => ({ value: v, label: v }));
}
