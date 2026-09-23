import * as T from "@/types/api/captcha";
import { request } from "./http-client";

export const getSliderCaptchaApi = () =>
  request<T.SliderCaptcha>("/captcha/slider", {}, T.SliderCaptchaSchema);

export const verifySliderCaptchaApi = (body: T.VerifySliderRequest) =>
  request<T.CaptchaTicket>("/captcha/slider/verify", { body }, T.CaptchaTicketSchema);
