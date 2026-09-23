import { z } from "zod";
import * as T from "@/types/api/user";
import { request } from "./http-client";

export const loginApi = (body: {
  email: string;
  password: string;
  captchaId?: string;
  captchaCode?: string;
}) => request<T.LoginResult>("/user/login", { body }, T.LoginResultSchema);

export const currentUserApi = () =>
  request<T.User | null>("/user/", { auth: true }, T.UserSchema.nullable());

export const allocateApi = (body: {
  email: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}) => request<T.User>("/user/allocate", { body }, T.UserSchema);

export const changePasswordApi = (body: { oldPassword: string; newPassword: string }) =>
  request<null>("/user/changePassword", { body, auth: true }, z.null());

export const profileUpdateApi = (body: T.ProfileUpdateRequest) =>
  request<T.User>("/user/update", { body, auth: true }, T.UserSchema);

export const sendVerificationCodeApi = (body: { email: string }) =>
  request<null>("/user/sendVerificationCode", { body }, z.null());

export const getCaptchaApi = () =>
  request<T.CaptchaImage>("/user/captcha", {}, T.CaptchaImageSchema);

export const userDetailApi = (id: number) =>
  request<T.UserDetail>(`/user/${id}`, {}, T.UserDetailSchema);

export const getChatFilterConfigApi = () =>
  request<T.ChatFilterConfig>("/user/chatFilterConfig", { auth: true }, T.ChatFilterConfigSchema);

export const updateChatFilterConfigApi = (body: T.ChatFilterConfig) =>
  request<null>("/user/chatFilterConfig", { body, auth: true }, z.null());

export const chatBanApi = (body: { userId: number; banned: boolean; reason?: string }) =>
  request<null>("/user/chatBan", { body, auth: true }, z.null());
