import { describe, expect, it } from "vitest";

import {
  WsChatMessageInSchema,
  WsChatMessageSchema,
  WsPlayerDanmakuSchema,
} from "./ws-message-types";

describe("WsChatMessageSchema 判别正确性", () => {
  it("onlineCount → parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "onlineCount", count: 5 });
    expect(result.type).toBe("onlineCount");
  });

  it("hotWords → parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "hotWords",
      words: [
        { text: "a", count: 1 },
        { text: "b", count: 2 },
      ],
    });
    expect(result.type).toBe("hotWords");
  });

  it("clear → parse 成功（仅 type 字段）", () => {
    const result = WsChatMessageSchema.parse({ type: "clear" });
    expect(result.type).toBe("clear");
  });

  it("pollUpdate → parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "pollUpdate" });
    expect(result.type).toBe("pollUpdate");
  });

  it("error（无 content）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "error" });
    expect(result.type).toBe("error");
  });

  it("error（带 content）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "error", content: "test" });
    expect(result.type).toBe("error");
  });

  it("messageDeleted → parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "messageDeleted", messageId: "123" });
    expect(result.type).toBe("messageDeleted");
  });

  it("saidaoCoverUpdated → parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "saidaoCoverUpdated",
      content: { uid: "1", cover: "http://x", liveUrl: "http://y" },
    });
    expect(result.type).toBe("saidaoCoverUpdated");
  });
});

describe("WsChatMessageSchema 判别失败", () => {
  it("未知 type → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("onlineCount 缺 count → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({ type: "onlineCount" });
    expect(result.success).toBe(false);
  });

  it("onlineCount count 非数字 → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({ type: "onlineCount", count: "abc" });
    expect(result.success).toBe(false);
  });

  it("hotWords 非数组 → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({ type: "hotWords", words: "not-array" });
    expect(result.success).toBe(false);
  });
});

describe("WsChatMessageSchema user 类型", () => {
  it("合法平铺 user 消息 → parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      uid: 1,
      type: "user",
      uname: "tester",
      content: "hello",
      deleted: false,
      messageId: "123",
      timestamp: "10:33:42",
    });
    expect(result.type).toBe("user");
    if (result.type !== "user") return;
    expect(result.messageId).toBe("123");
    expect(result.uname).toBe("tester");
    expect(result.content).toBe("hello");
  });

  it("平铺 user 消息带完整字段 → parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      uid: 17694,
      type: "user",
      ipGeo: "广州市",
      uname: "testuser",
      avatar: "https://rustfs.saidao.cc/images/avatar/default9.png",
      content: "你好",
      deleted: false,
      faction: "",
      mentions: [],
      messageId: "2101862403867283456",
      timestamp: "10:33:42",
      createdAt: "2026-09-21T10:33:42.478038+08:00",
      replyTo: {
        uid: 0,
        uname: "汕头用户4708",
        content: "引用内容",
        messageId: "2101862352302510080",
      },
      linkPreview: { url: "https://example.com", title: "链接标题" },
    });
    expect(result.type).toBe("user");
    if (result.type !== "user") return;
    expect(result.ipGeo).toBe("广州市");
    expect(result.replyTo?.messageId).toBe("2101862352302510080");
  });

  it("缺 messageId → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({
      uid: 1,
      type: "user",
      uname: "tester",
      content: "hello",
      deleted: false,
      timestamp: "10:33:42",
    });
    expect(result.success).toBe(false);
  });

  it("缺 uid → safeParse 失败", () => {
    const result = WsChatMessageSchema.safeParse({
      type: "user",
      uname: "tester",
      content: "hello",
      deleted: false,
      messageId: "123",
      timestamp: "10:33:42",
    });
    expect(result.success).toBe(false);
  });
});

describe("WsChatMessageSchema video 枚举类型", () => {
  it("videoVoting → parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "videoVoting" });
    expect(result.type).toBe("videoVoting");
  });

  it("videoPlay 带 payload → parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "videoPlay",
      payload: { uid: "1", name: "demo" },
    });
    expect(result.type).toBe("videoPlay");
  });
});

describe("WsChatMessageInSchema 上行消息", () => {
  it("chat 合法 → parse 成功", () => {
    const result = WsChatMessageInSchema.parse({ type: "chat", content: "hello" });
    expect(result.type).toBe("chat");
  });

  it("voice 合法 → parse 成功", () => {
    const result = WsChatMessageInSchema.parse({
      type: "voice",
      audioUrl: "http://x",
      duration: 10,
      waveform: [0.1, 0.2],
    });
    expect(result.type).toBe("voice");
  });

  it("chat 缺 content → safeParse 失败", () => {
    const result = WsChatMessageInSchema.safeParse({ type: "chat" });
    expect(result.success).toBe(false);
  });
});

describe("WsPlayerDanmakuSchema 播放器弹幕", () => {
  it("合法 comments 数组 → parse 成功", () => {
    const result = WsPlayerDanmakuSchema.parse({ comments: [{ user: "a", text: "b" }] });
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toEqual({ user: "a", text: "b" });
  });

  it("comments 非数组 → safeParse 失败", () => {
    const result = WsPlayerDanmakuSchema.safeParse({ comments: "not-array" });
    expect(result.success).toBe(false);
  });
});

describe("实测 payload 回归（docs/logs/frontend.md + docs/logs/.tmp_probe）", () => {
  it("user 缺 deleted（WS 广播实测不下发）→ parse 成功且 deleted 为 undefined", () => {
    const result = WsChatMessageSchema.parse({
      type: "user",
      uname: "晋军喜灵车漂移甩出王桂希",
      messageId: "2102292186698747904",
      uid: 13050,
      avatar: "https://rustfs.saidao.cc/images/avatar/default1.png",
      faction: "",
      content: "这大肿脸",
      ipGeo: "广州市",
      timestamp: "15:01:44",
    });
    expect(result.type).toBe("user");
    if (result.type !== "user") return;
    expect(result.deleted).toBeUndefined();
  });

  it("history 内消息缺 deleted（/message/history/window 实测不下发）→ parse 成功", () => {
    const result = WsChatMessageSchema.safeParse({
      type: "history",
      messages: [
        {
          uid: 0,
          type: "user",
          ipGeo: "湘潭市",
          uname: "湘潭市用户6196",
          avatar: "https://rustfs.saidao.cc/images/avatar/default1.png",
          content: "@汕头用户4708 还有一边",
          faction: "",
          mentions: [],
          createdAt: "2026-09-21T10:33:42.478038+08:00",
          messageId: "2101862403636596736",
          timestamp: "10:33:42",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("hotScoreUpdate level 为 number（实测下发 1）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "hotScoreUpdate",
      scores: [{ saidaoId: 197, hotScore: 962, level: 1 }],
      timestamp: "15:01:44",
    });
    expect(result.type).toBe("hotScoreUpdate");
    if (result.type !== "hotScoreUpdate") return;
    expect(result.scores[0]!.level).toBe(1);
  });

  it("pong 心跳回包 → parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "pong", timestamp: 1790060528907 });
    expect(result.type).toBe("pong");
  });

  it("captchaRequired 不带 challenge（契约只下发 type）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({ type: "captchaRequired" });
    expect(result.type).toBe("captchaRequired");
    if (result.type !== "captchaRequired") return;
    expect(result.challenge).toBeUndefined();
  });

  it("弹幕项缺 user（匿名）→ parse 成功", () => {
    const result = WsPlayerDanmakuSchema.parse({ comments: [{ text: "a" }] });
    expect(result.comments[0]!.user).toBeUndefined();
  });

  it("history 内消息的 replyTo 缺 uid（WS 快照实测不下发）→ parse 成功", () => {
    const result = WsChatMessageSchema.safeParse({
      type: "history",
      messages: [
        {
          uid: 0,
          type: "user",
          ipGeo: "贵阳市",
          uname: "贵阳市用户8826",
          avatar: "https://rustfs.saidao.cc/images/avatar/default10.png",
          content: "大白胖子要是接了17万现在就在5星级酒店躺起了，不接嘛，活该被整",
          faction: "",
          mentions: [],
          messageId: "2102292186698747905",
          timestamp: "15:01:44",
          replyTo: {
            uname: "汕头用户4708",
            content: "七七真是个畜生。",
            messageId: "2101862352302510080",
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const history = result.data;
    if (history.type !== "history") return;
    const firstMsg = history.messages[0]!;
    if (firstMsg.type !== "user") return;
    expect(firstMsg.replyTo?.uid).toBeUndefined();
    expect(firstMsg.replyTo?.messageId).toBe("2101862352302510080");
  });

  it("link_preview 嵌套 linkPreview 对象 + 反引号 URL（实测契约）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "link_preview",
      messageId: "2102323259201687552",
      linkPreview: {
        url: "`https://b23.tv/zcjkkbI`",
        title: "回到合肥 - 橡树1991 - 哔哩哔哩直播，二次元弹幕直播平台",
      },
    });
    expect(result.type).toBe("link_preview");
    if (result.type !== "link_preview") return;
    expect(result.messageId).toBe("2102323259201687552");
    expect(result.linkPreview.url).toBe("`https://b23.tv/zcjkkbI`");
    expect(result.linkPreview.title).toContain("回到合肥");
  });

  it("link_preview 缺 messageId → safeParse 失败（结构契约要求）", () => {
    const result = WsChatMessageSchema.safeParse({
      type: "link_preview",
      linkPreview: { url: "https://x", title: "t" },
    });
    expect(result.success).toBe(false);
  });

  it("saidaoCoverUpdated content 为 JSON 字符串（实测双形态之一）→ parse 成功", () => {
    const result = WsChatMessageSchema.parse({
      type: "saidaoCoverUpdated",
      content:
        '{"cover":"`https://rustfs.saidao.cc/images/cover/f96d647a-ebec-4e79-a85d-14f132bd268c.jpg`","liveUrl":"`https://n8n.saidao.cc/forward/youtube/index.m3u8`"}',
    });
    expect(result.type).toBe("saidaoCoverUpdated");
    if (result.type !== "saidaoCoverUpdated") return;
    expect(typeof result.content).toBe("string");
  });

  it("history 快照混入 status 消息（无 uid，实测 messages.80.uid: Required）→ parse 成功", () => {
    const result = WsChatMessageSchema.safeParse({
      type: "history",
      messages: [
        {
          uid: 0,
          type: "user",
          ipGeo: "郑州市",
          uname: "郑州市用户2188",
          avatar: "`https://rustfs.saidao.cc/images/avatar/default4.png`",
          content: "浩刘把这网站整挺好，浩刘真正的热爱抽象",
          deleted: false,
          faction: "",
          messageId: "2102323200000000001",
          timestamp: "15:02:11",
        },
        {
          type: "status",
          content: "主播 某某 开启了直播",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data;
    if (data.type !== "history") return;
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]!.type).toBe("user");
    expect(data.messages[1]!.type).toBe("status");
  });

  it("user 消息缺 avatar（实测可能缺失）→ parse 成功且 avatar 为 undefined", () => {
    const result = WsChatMessageSchema.parse({
      uid: 13050,
      type: "user",
      uname: "晋军喜灵车漂移甩出王桂希",
      content: "这大肿脸",
      ipGeo: "广州市",
      messageId: "2102292186698747904",
      timestamp: "15:01:44",
    });
    expect(result.type).toBe("user");
    if (result.type !== "user") return;
    expect(result.avatar).toBeUndefined();
  });

  it("faction 为空串时 user 消息通过校验（实测契约）", () => {
    const result = WsChatMessageSchema.parse({
      uid: 0,
      type: "user",
      uname: "济南市用户7482",
      content: "谁不想铲",
      faction: "",
      messageId: "2102292266835120128",
      timestamp: "15:01:44",
    });
    expect(result.type).toBe("user");
    if (result.type !== "user") return;
    expect(result.faction).toBe("");
  });

  it("faction 为 null 时 user 消息通过校验（宽松 string）", () => {
    const result = WsChatMessageSchema.safeParse({
      uid: 0,
      type: "user",
      uname: "test",
      content: "hi",
      faction: null,
      messageId: "123",
      timestamp: "15:01:44",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data;
    if (data.type !== "user") return;
    expect(data.faction).toBeNull();
  });

  it('faction 为脏数据 "foo" 时 user 消息仍通过校验（宽松 string，不拒脏数据）', () => {
    const result = WsChatMessageSchema.safeParse({
      uid: 0,
      type: "user",
      uname: "test",
      content: "hi",
      faction: "foo",
      messageId: "123",
      timestamp: "15:01:44",
    });
    expect(result.success).toBe(true);
  });
});
