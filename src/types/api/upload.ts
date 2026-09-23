import { z } from "zod";

export const UploadUrlResultSchema = z.object({ url: z.string() });
export type UploadUrlResult = z.infer<typeof UploadUrlResultSchema>;
