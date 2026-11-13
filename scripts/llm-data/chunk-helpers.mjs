import ORDER from "./es-order.json" with { type: "json" };

export function mapFromArray(values) {
  if (values.length !== ORDER.length) {
    throw new Error(`Expected ${ORDER.length} values, got ${values.length}`);
  }
  return Object.fromEntries(ORDER.map((phrase, i) => [phrase, values[i]]));
}
