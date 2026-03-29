import { z } from "zod";
import { validateOllamaUrl } from "@/lib/url-validation";

export const apiKeySaveSchema = z
  .object({
    moduleId: z.enum(["openai", "deepseek", "ollama", "rapidapi"]),
    key: z.string().min(1, "API key is required"),
    label: z.string().optional(),
    // `sensitive` is intentionally excluded: the server derives it from the
    // module manifest (server-side truth). Client-supplied values are ignored.
  })
  .superRefine((data, ctx) => {
    if (data.moduleId === "ollama") {
      const result = validateOllamaUrl(data.key);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.error ?? "Invalid Ollama URL",
          path: ["key"],
        });
      }
    }
  });

export type ApiKeySaveInput = z.infer<typeof apiKeySaveSchema>;
