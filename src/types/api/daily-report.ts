import { z } from "zod";

export const DailyReportSchema = z.object({
  id: z.number(),
  title: z.string(),
  link: z.string().url(),
  cover: z.string(),
  /** Unix 秒（×1000 展示） */
  update_time: z.number(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

/** 公告：data 为纯字符串 */
export const NoticeSchema = z.string();
export type Notice = z.infer<typeof NoticeSchema>;
