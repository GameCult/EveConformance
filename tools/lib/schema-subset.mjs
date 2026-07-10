export function validateSchemaSubset(schema, value, pointer = "$", rootSchema = schema) {
  const errors = [];
  if (!schema || typeof schema !== "object") return errors;

  if (schema.$ref) {
    const resolved = resolveSchemaReference(rootSchema, schema.$ref);
    return resolved
      ? validateSchemaSubset(resolved, value, pointer, rootSchema)
      : [`${pointer}:unresolved-ref:${schema.$ref}`];
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${pointer}:const:${schema.const}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pointer}:enum:${schema.enum.join("|")}`);
  }
  if (schema.type && !matchesSchemaType(value, schema.type)) {
    errors.push(`${pointer}:type:${schema.type}`);
    return errors;
  }
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) {
    errors.push(`${pointer}:minLength:${schema.minLength}`);
  }
  if (schema.minItems !== undefined && Array.isArray(value) && value.length < schema.minItems) {
    errors.push(`${pointer}:minItems:${schema.minItems}`);
  }
  if (schema.required && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required) {
      if (value[key] === undefined) errors.push(`${pointer}.${key}:required`);
    }
  }
  if (schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (value[key] !== undefined) {
        errors.push(...validateSchemaSubset(childSchema, value[key], `${pointer}.${key}`, rootSchema));
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateSchemaSubset(schema.items, item, `${pointer}[${index}]`, rootSchema));
    });
  }
  return errors;
}

function resolveSchemaReference(rootSchema, reference) {
  if (!reference.startsWith("#/")) return null;
  return reference.slice(2).split("/").reduce((current, segment) => {
    if (!current || typeof current !== "object") return null;
    return current[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
  }, rootSchema);
}

function matchesSchemaType(value, type) {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}
