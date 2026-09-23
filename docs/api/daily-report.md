# 日报与公告模块（Daily Report / Notice）

> 基地址：`https://api.saidao.cc`。

## 1. 日报列表 — `GET /dailyReport/list`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.dailyReportList()`
- **入参**：无
- **成功响应**：`data` 为日报对象**数组**（probe `02_dailyReport_list` / `81_dailyReport_auth`），按 `update_time` 倒序。

单个日报对象：

```json
{
  "id": 1789945245,
  "title": "【抽象日报09-20】大白接受抽象最狠任务改造爷爷头，最终定价167777！",
  "link": "https://mp.weixin.qq.com/s/5ZVUei9OS1N8NLmzNPDHhg",
  "cover": "https://images.weserv.nl/?url=https://mmbiz.qpic.cn/...",
  "update_time": 1789945245
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 日报 ID（时间戳型） |
| `title` | string | 标题 |
| `link` | string | 原文链接（微信公众号） |
| `cover` | string | 封面图（经 weserv 代理） |
| `update_time` | number | 更新时间（Unix 秒） |

## 2. 公告 — `GET /notice`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.notice()`
- **入参**：无
- **成功响应**：`data` 为**纯字符串**（公告文本，可为空串）（probe `01_notice`）。

```json
{
  "code": "0",
  "message": "",
  "data": "这里是公告内容文本……"
}
```

> 注意：本接口 `data` 不是对象，是字符串，前端直接作为公告文案展示。
