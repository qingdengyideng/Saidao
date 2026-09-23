import { describe, it, expect, vi, beforeEach } from "vitest";

// mock http-client 的 http 实例
vi.mock("./http-client", () => ({
  http: {
    get: vi.fn(),
  },
}));

import { playerInfoApi } from "./player";
import { http } from "./http-client";

const mockHttpGet = vi.mocked(http.get);

describe("playerInfoApi", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("m3u8 = 'null'（字符串）→ 归一化为 null", async () => {
    mockHttpGet.mockResolvedValue({
      data: {
        m3u8: "null",
        channel: "bilibili",
        userId: "123",
        value: "{}",
        uid: "abc",
        live_url: null,
        orig: null,
        token: null,
        avatar: null,
        status: "0",
        roomid: null,
        uname: null,
        cover: null,
      },
    });
    const result = await playerInfoApi("abc");
    expect(result.m3u8).toBeNull();
  });

  it("m3u8 = 有效 URL → 保持原值", async () => {
    const url = "https://example.com/stream.m3u8";
    mockHttpGet.mockResolvedValue({
      data: {
        m3u8: url,
        channel: "bilibili",
        userId: "123",
        value: "{}",
        uid: "abc",
        live_url: null,
        orig: null,
        token: null,
        avatar: null,
        status: "1",
        roomid: "456",
        uname: "test",
        cover: null,
      },
    });
    const result = await playerInfoApi("abc");
    expect(result.m3u8).toBe(url);
    expect(result.status).toBe("1");
  });

  it("status 是 string（与 Saidao.status number 区分）", async () => {
    mockHttpGet.mockResolvedValue({
      data: {
        m3u8: "null",
        channel: "bilibili",
        userId: "123",
        value: "{}",
        uid: "abc",
        live_url: null,
        orig: null,
        token: null,
        avatar: null,
        status: "1",
        roomid: null,
        uname: "test",
        cover: null,
      },
    });
    const result = await playerInfoApi("abc");
    expect(typeof result.status).toBe("string");
    expect(result.status).toBe("1");
  });
});
