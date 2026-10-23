import { z } from 'zod';

/**
 * Lightweight Zod to JSON Schema converter for MCP Tool contracts.
 * Matches MCP SDK Tool inputSchema contract: { type: 'object'; properties?: Record<string, any>; required?: string[] }
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): { type: 'object'; properties?: Record<string, any>; required?: string[] } {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const key of Object.keys(shape)) {
      const field = shape[key];
      properties[key] = convertField(field);

      if (!(field instanceof z.ZodOptional) && !(field instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object' as const,
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  return { type: 'object' as const };
}

function convertField(field: z.ZodTypeAny): any {
  if (field instanceof z.ZodOptional || field instanceof z.ZodDefault) {
    return convertField((field as any)._def.innerType);
  }

  if (field instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (field instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (field instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (field instanceof z.ZodEnum) {
    return { type: 'string', enum: (field as any)._def.values };
  }

  if (field instanceof z.ZodArray) {
    return {
      type: 'array',
      items: convertField((field as any)._def.type)
    };
  }

  if (field instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: convertField((field as any)._def.valueType)
    };
  }

  if (field instanceof z.ZodObject) {
    return zodToJsonSchema(field);
  }

  return { type: 'string' };
}
