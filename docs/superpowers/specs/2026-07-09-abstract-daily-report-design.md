# 抽象日报模块 设计文档

日期: 2026-07-09
状态: 已确认, 待实现

## 1. 背景与目标

在 `index.html` 现有的筛选 tab(直播中 / 全部)右侧新增第三个 tab "抽象日报"。页面加载时请求后端接口获取最近日报数据, 以卡片形式展示(顶部封面图, 不含头像)。

需要实现:
- 前端: 新增"抽象日报"tab 与日报卡片渲染, 本地记录已看过的最大日报 id, 未看过时显示"最近更新"角标与 tab "更新啦"红点。
- WebSocket: 收到日报更新消息时刷新列表, 并往聊天室插入一条系统消息(含标题与可点击链接)。
- 后端(C:\gitlab\saidao-web): 新增日报存储表、保存接口、查询接口(固定返回最近 10 条); 保存时若发现有更新则广播 WebSocket 消息。

## 2. 数据协议

保存接口入参(数组):

```json
[
  {
    "title": "【抽象日报07-08】直播总结/弹幕精选",
    "link": "https://mp.weixin.qq.com/s/U4FHK3e0IIpw2l2wCYi5IQ",
    "id": 1000000031,
    "cover": "https://mmbiz.qpic.cn/.../0?wx_fmt=jpeg",
    "update_time": 1783551600
  }
]
```

字段说明:
- `id`: 外部指定的日报唯一 id(非自增, BIGINT)。
- `title`: 日报标题。
- `link`: 微信文章链接。
- `cover`: 文章封面图 URL。
- `update_time`: Unix 秒时间戳, 后端原样存储与透传, 前端负责格式化展示。

## 3. 整体数据流

```
外部自动化(n8n/爬虫)
   │ POST /dailyReport/save  (Header 校验 token, body = 数组协议)
   ▼
后端 saidao-web
   │ 1. 记录库中当前 maxId(oldMaxId)
   │ 2. upsert 日报数据到 daily_report 表
   │ 3. 计算入参 maxIncomingId
   │ 4. 若 maxIncomingId > oldMaxId → 有新日报
   │      → 取入参中 id 最大的那条, 广播 ws(type=dailyReportUpdate, 带 title/link)
   ▼
所有在线前端(index.html)
   │ 收到 ws → 重新 GET /dailyReport/list 刷新卡片
   │         → 本地往聊天室插入一条系统消息(含标题 + 可点击链接)
   ▼
页面加载时: GET /dailyReport/list(公开, 无需鉴权) → 渲染日报卡片
```

关键约定: **是否广播由后端比较入参最大 id 与数据库原最大 id 决定, 只有入参最大 id 更大(存在更新的日报)时才广播。**

## 4. 后端设计 (C:\gitlab\saidao-web)

技术栈: Spring Boot 3.3, Java 21, MyBatis-Plus 3.5, PostgreSQL。统一返回 `com.saidao.live.vo.Response<T>`(code "0" 成功 / "1" 失败)。DTO/VO 使用嵌套 record。

### 4.1 数据库表

新增 `src/main/resources/db/daily_report.sql`(手动执行, 项目无 Flyway/Liquibase):

```sql
CREATE TABLE IF NOT EXISTS daily_report (
    id          BIGINT PRIMARY KEY,        -- 外部指定 id(非自增)
    title       VARCHAR(512)  NOT NULL,
    link        VARCHAR(1024) NOT NULL,
    cover       VARCHAR(1024),
    update_time BIGINT        NOT NULL,     -- unix 秒, 原样透传前端
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_report_id ON daily_report (id DESC);
```

### 4.2 Entity

`model/DailyReport.java`, 普通 Lombok POJO(依赖 `map-underscore-to-camel-case`, 与 `SaidaoUser` 风格一致):

```java
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class DailyReport {
    private Long id;
    private String title;
    private String link;
    private String cover;
    private Long updateTime;
    private LocalDateTime createdAt;
}
```

### 4.3 Mapper

`mapper/DailyReportMapper.java` extends `BaseMapper<DailyReport>`:

```java
@Mapper
public interface DailyReportMapper extends BaseMapper<DailyReport> {

    @Select("SELECT id, title, link, cover, update_time, created_at " +
            "FROM daily_report ORDER BY id DESC LIMIT 10")
    List<DailyReport> selectLatest10();

    @Select("SELECT COALESCE(MAX(id), 0) FROM daily_report")
    long selectMaxId();
}
```

upsert 使用 PostgreSQL `INSERT ... ON CONFLICT (id) DO UPDATE`。为避免逐条往返, 在 Mapper 增加批量 upsert:

```java
@Insert("<script>" +
        "INSERT INTO daily_report (id, title, link, cover, update_time) VALUES " +
        "<foreach collection='list' item='it' separator=','>" +
        "(#{it.id}, #{it.title}, #{it.link}, #{it.cover}, #{it.updateTime})" +
        "</foreach>" +
        " ON CONFLICT (id) DO UPDATE SET " +
        "title = EXCLUDED.title, link = EXCLUDED.link, " +
        "cover = EXCLUDED.cover, update_time = EXCLUDED.update_time" +
        "</script>")
int upsertBatch(@Param("list") List<DailyReport> list);
```

### 4.4 DTO / VO

`dto/DailyReportDto.java`:

```java
public class DailyReportDto {
    public record Save(
        @NotNull Long id,
        @NotBlank String title,
        @NotBlank String link,
        String cover,
        @JsonProperty("update_time") @NotNull Long updateTime
    ) {}
}
```

`vo/DailyReportVo.java`:

```java
public class DailyReportVo {
    public record Item(
        Long id,
        String title,
        String link,
        String cover,
        @JsonProperty("update_time") Long updateTime
    ) {}
}
```

注: 入参与出参的时间字段均为 `update_time`(下划线), 通过 `@JsonProperty` 与 record 字段 `updateTime` 映射, 保持前端协议不变。

### 4.5 Controller

`controller/DailyReportController.java`, `@RequestMapping("/dailyReport")`:

```java
@Slf4j
@RestController
@RequestMapping("/dailyReport")
@RequiredArgsConstructor
public class DailyReportController {

    private final DailyReportService dailyReportService;

    @Value("${daily-report.save-token}")
    private String saveToken;

    // 公开, 无需登录鉴权, 返回最近 10 条
    @GetMapping("/list")
    public Response<List<DailyReportVo.Item>> list() {
        return Response.success(dailyReportService.list());
    }

    // 写接口: 需 Header token 校验, 供外部自动化调用
    @PostMapping("/save")
    public Response<Void> save(
            @RequestHeader(value = "X-Report-Token", required = false) String token,
            @RequestBody @Valid List<DailyReportDto.Save> list) {
        Assert.isTrue(StrUtil.isNotBlank(saveToken) && saveToken.equals(token), "无权限");
        dailyReportService.save(list);
        return Response.success();
    }
}
```

### 4.6 Service

`service/DailyReportService.java` + `service/impl/DailyReportServiceImpl.java`:

```java
public interface DailyReportService {
    List<DailyReportVo.Item> list();
    void save(List<DailyReportDto.Save> list);
}
```

实现要点(`save`):

```java
@Override
@Transactional
public void save(List<DailyReportDto.Save> list) {
    if (CollUtil.isEmpty(list)) return;

    long oldMaxId = dailyReportMapper.selectMaxId();      // 1. 保存前的最大 id

    List<DailyReport> entities = list.stream()
        .map(s -> DailyReport.builder()
            .id(s.id()).title(s.title()).link(s.link())
            .cover(s.cover()).updateTime(s.updateTime()).build())
        .toList();
    dailyReportMapper.upsertBatch(entities);              // 2. upsert

    DailyReportDto.Save maxIncoming = list.stream()       // 3. 入参最大 id 的那条
        .max(Comparator.comparingLong(DailyReportDto.Save::id))
        .orElseThrow();

    if (maxIncoming.id() > oldMaxId) {                    // 4. 有更新才广播
        chatWebSocketHandler.broadcastDailyReportUpdate(
            maxIncoming.title(), maxIncoming.link());
    }
}
```

`list`: 调 `selectLatest10()` 映射为 `DailyReportVo.Item`。

### 4.7 WebSocket 广播

在 `wschat/ChatWebSocketHandler` 增加方法,广播 `type=dailyReportUpdate` 且 `addToHistory=true` 的消息(对标 `status` 类型的处理模式):

```java
public void broadcastDailyReportUpdate(String title, String link) {
    String content = "抽象日报更新啦：<a href=\"" + link
            + "\" target=\"_blank\" rel=\"noopener\">"
            + cn.hutool.http.HtmlUtil.escape(title) + "</a>";
    broadcastMessage(content, "dailyReportUpdate", true);
}
```

`title` 经 `HtmlUtil.escape` 转义防注入; `link` 为受信来源(微信文章链接)。前端对 `dailyReportUpdate` 的处理与 `status` 一致:实时消息 → 聊天室显示 + 刷新列表;history 回放 → 仅聊天室显示。

### 4.8 配置

`application.yml` 增加:

```yaml
daily-report:
  save-token: ${DAILY_REPORT_SAVE_TOKEN:changeme}
```

推荐通过环境变量注入, 不硬编码明文。

## 5. 前端设计 (chouxiang-live)

纯静态站点。配置在 `assets/js/config.js`(`API_BASE_URL=https://api.saidao.cc`), API 封装在 `assets/js/api.js` 的 `window.ApiEndpoints`, index 页面逻辑在 `assets/js/app.js`。

### 5.1 index.html

`.filter-tabs`(第 92-99 行)内, 在"全部"tab 之后、刷新按钮之前新增:

```html
<button class="filter-tab report-tab" data-status="dailyReport">
    抽象日报
    <span class="tab-dot" id="reportTabDot" hidden>更新啦</span>
</button>
```

### 5.2 app.js

复用现有 `#cardsGrid` 网格容器, 通过 `state.currentStatus` 分支控制渲染内容。

- **配置常量**: 新增 `DAILY_REPORT_LAST_SEEN_ID` 作为 localStorage key。
- **状态**: `state.dailyReports = []`。
- **初始化**: 页面加载时(与 `fetchStreamers` 同级)调用 `fetchDailyReports()`, 无论当前处于哪个 tab 都请求, 用于计算 tab 红点。
- **`fetchDailyReports()`**: 调 `ApiEndpoints.dailyReportList()` → 写入 `state.dailyReports` → 调 `refreshReportTabDot()` → 若当前在日报 tab 则 `renderStreamerCards()` 重渲染。
- **tab 切换**(现有 `.filter-tab` click 监听, 第 460-466 行): 无需改动逻辑, `state.currentStatus` 会被设为 `dailyReport`, 随后 `renderStreamerCards()` 分支渲染。
- **`renderStreamerCards()`**: 开头增加分支
  ```js
  if (state.currentStatus === 'dailyReport') { renderDailyReportCards(); return; }
  ```
- **`renderDailyReportCards()`**: 清空 `#cardsGrid`, 遍历 `dailyReportsData` 生成 `.report-card`:
  - 顶部 `.report-card-cover`(背景图用 `cover`)
  - `.report-card-title`(title)
  - `.report-card-time`(格式化 `update_time`, 秒 → 本地日期)
  - 卡片 `dataset.link = report.link`
  - 卡片本身不显示"最近更新"角标(更新提示只体现在 tab 红点)
- **点击日报卡片**(事件委托在 `#cardsGrid`, 与现有卡片委托共存, 用 `.report-card` 判定): 仅 `window.open(link, '_blank', 'noopener')` 跳转, 不改变已看状态。
- **点击"抽象日报"tab**(`.filter-tab` click 监听): 若 `data-status === 'dailyReport'` 则调 `markDailyReportsSeen()` — 把 `lastSeenId` 设为当前列表最大 id 并刷新红点(隐藏"更新啦")。
- **`refreshReportTabDot()`**: `getDailyReportsMaxId() > getDailyReportLastSeenId()` → 显示 `#reportTabDot`, 否则隐藏。
- **`getDailyReportLastSeenId()` / `setDailyReportLastSeenId(id)`**: 读写 localStorage, 空值按 0 处理。

### 5.3 WebSocket

在 app.js 的 `onmessage` 分发链(第 3184-3225 行)增加分支,对标 `status` 的处理模式:

**实时消息**(第 3211-3224 行):
```js
else if (data.type === 'dailyReportUpdate') {
    addSystemMessageToChat(data);
    fetchDailyReports();
}
```

**history 回放**(第 3184-3201 行):
```js
data.messages.forEach(msg => {
    if (msg.type === 'status' || msg.type === 'dailyReportUpdate') {
        addSystemMessageToChat(msg, { stickToBottom: false, suppressAlert: true });
    } else {
        addMessageToChat(msg, { stickToBottom: false, suppressAlert: true });
    }
});
```

后端只广播一条 `type=dailyReportUpdate` 消息(`content` 含标题链接, `addToHistory=true`), 前端既显示到聊天室(含历史回放)又触发列表刷新。

### 5.4 api.js

`window.ApiEndpoints` 增加(公开, 不带 auth):

```js
dailyReportList: () => request('/dailyReport/list'),
```

### 5.5 CSS (assets/css/main.css)

新增, 沿用现有 CSS 变量与 `.cards-grid` / 卡片阴影圆角风格:
- `.report-card`: 复用卡片外观(圆角/阴影/hover 上浮), `cursor:pointer`。
- `.report-card-cover`: 16:9 封面区, `object-fit:cover`, 顶部圆角。
- `.report-card-title`: 标题, 2 行截断(`-webkit-line-clamp`)。
- `.report-card-time`: 次要文字色。
- `.report-badge`: 卡片右上角"最近更新"角标(高亮色 + 圆角胶囊)。
- `.tab-dot`: tab 上"更新啦"红点/胶囊(绝对定位右上角, 高亮色)。

## 6. 边界与错误处理

- **列表接口失败**: 前端 `fetchDailyReports` catch 后保持空列表, 不阻塞主流程; 日报 tab 显示空态文案。
- **cover 为空**: 卡片封面区显示占位背景色, 不破版。
- **首次访问(无 localStorage)**: `lastSeenId=0`, 所有日报均显示"最近更新", tab 显示红点; 符合"有更新即提示"预期。
- **save 幂等**: upsert 按 id 冲突更新, 重复推送同一批数据不产生脏数据; 因 oldMaxId 未变化, 不会重复广播。
- **save 鉴权失败**: 返回 `Response.fail("无权限")`, 由全局异常处理器统一包装。
- **ws 消息 xss**: 系统消息在后端生成, title 经 `HtmlUtil.escape` 转义, link 为受信来源。

## 7. 验证

后端:
- `mvnw` 编译通过。
- 手动执行 `daily_report.sql` 建表。
- 用协议样例数据 POST `/dailyReport/save`(带正确/错误 token 各一次), 验证鉴权与入库。
- GET `/dailyReport/list` 返回最近 10 条且字段协议一致(`update_time` 下划线)。
- 二次推送更大 id 验证广播触发; 推送不更大 id 验证不广播。

前端:
- 页面加载后日报 tab 可见, 切换后展示卡片, 封面/标题/时间正确。
- 首次访问显示"最近更新"角标与 tab 红点; 点击任一卡片后角标与红点消失。
- 模拟 ws `dailyReportUpdate` 消息, 验证列表刷新与聊天室系统消息(链接可点)。

## 8. 非目标 (YAGNI)

- 不做日报分页/搜索/分类。
- 不做日报详情页(直接跳转微信链接)。
- 不做后台管理界面(写入由外部自动化经 token 接口完成)。
- 不做已读状态服务端持久化(仅本地 localStorage 记录最大 id)。
