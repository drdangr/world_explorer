import { z } from "zod";

export const ItemDescriptorSchema = z.object({
  name: z.string().min(1, "Название предмета не может быть пустым").transform((value) => value.trim()),
  description: z.string().default("").transform((value) => value.trim()),
  portable: z.boolean().default(true),
});

export type ItemDescriptor = z.infer<typeof ItemDescriptorSchema>;

export const ExitDescriptorSchema = z.object({
  name: z
    .string()
    .min(1, "Название связанной локации обязательно")
    .transform((value) => value.trim()),
  label: z.string().optional().transform((value) => value?.trim()).nullable(),
  bidirectional: z.boolean().default(true),
});

export type ExitDescriptor = z.infer<typeof ExitDescriptorSchema>;

export const LocationPayloadSchema = z.object({
  name: z
    .string()
    .min(1, "Название локации обязательно")
    .transform((value) => value.trim()),
  mapDescription: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ""),
  description: z
    .string()
    .min(1, "Описание локации обязательно")
    .transform((value) => value.trim()),
  items: z.array(ItemDescriptorSchema).default([]),
  exits: z.array(ExitDescriptorSchema).default([]),
});

export type LocationPayload = z.infer<typeof LocationPayloadSchema>;

export const LLMGameTurnSchema = z.object({
  narration: z
    .string()
    .min(1, "Нужно описание сцены")
    .transform((value) => value.trim()),
  mapDescription: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ""),
  suggestions: z
    .array(z.string().min(1).transform((value) => value.trim()))
    .default([]),
  playerLocation: LocationPayloadSchema,
  discoveries: z.array(LocationPayloadSchema).default([]),
  inventory: z
    .object({
      items: z.array(ItemDescriptorSchema).default([]),
    })
    .default({ items: [] }),
});

export type LLMGameTurn = z.infer<typeof LLMGameTurnSchema>;

