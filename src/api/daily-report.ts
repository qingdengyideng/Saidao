import { z } from "zod";
import * as T from "@/types/api/daily-report";
import { request } from "./http-client";

export const dailyReportListApi = () =>
  request<T.DailyReport[]>("/dailyReport/list", {}, z.array(T.DailyReportSchema));

export const noticeApi = () => request<T.Notice>("/notice", {}, T.NoticeSchema);
