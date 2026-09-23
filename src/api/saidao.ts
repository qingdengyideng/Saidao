import { z } from "zod";
import * as T from "@/types/api/saidao";
import { request } from "./http-client";

export const saidaoListApi = () =>
  request<T.Saidao[]>("/saidao/", undefined, z.array(T.SaidaoSchema));

export const updateOptionsApi = (body: T.UpdateOptionsRequest) =>
  request<null>("/saidao/options", { body, auth: true }, z.null());

export const updateSaidaoTagApi = (body: T.UpdateSaidaoTagRequest) =>
  request<null>("/saidao/tag", { body, auth: true }, z.null());

export const clickSaidaoApi = (saidaoId: number) =>
  request<null>("/saidao/click", { query: { saidaoId } }, z.null());
