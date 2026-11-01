# 事件分析（te-analytics）

城主数仓的事件分析 MVP。不改 Metabase 的查询构建器、仪表盘、驱动和权限，只登记事件表并按元数据编译 SQL。

## 元数据

目录在 `metadata.clj`。每个事件必须声明：

| 字段                  | 含义                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| `event-key`           | API 和页面使用的事件键，例如 `event_game`                              |
| `schema` / `table`    | 物理表。样例是 `project_y5.dwd_${event_name}`                          |
| `time-column`         | 时间列。样例为 `time`                                                  |
| `user-subject-column` | 用户主体。样例为 `role_id`，编译器不会写死这个名字                     |
| `properties-column`   | 可选的 JSON 属性列。没有就写 `nil`                                     |
| `available-columns`   | 查询允许使用的列。未登记的列不能出现在 `SELECT`、`GROUP BY` 或 `WHERE` |
| `stub`                | 字段不完整的占位事件为 `true`                                          |

列上的 `groupable` / `filterable` / `summable` 为 false 时，该列不能用于对应操作。`properties` 只登记，不参与分组、过滤或求和。`vip_level` 是 `event_game` 上明确允许求和的数值列。

目前登记了：

- `event_game` → `project_y5.dwd_event_game`，已知的公共列（`time`、`role_id`、`region_id`、`server_id`、`channel`、`os`、`vip_level`、`properties`）
- `event_activity_play` → `project_y5.dwd_event_activity_play`。只确认了 `time`、`role_id`、`activity_id`。`region_id`、`vip_level`、`properties` 没有登记，请求它们会被拒绝。

其他事件表如果缺公共列，就不要把那些列写进 `available-columns`。

## API

都需要登录会话。

- `GET /api/te/events`：事件列表和 `available_columns`
- `POST /api/te/event-query`

请求体：

```json
{
  "event_key": "event_game",
  "metric": "unique_users",
  "time_range": { "start": "2026-01-01", "end": "2026-01-07" },
  "group_by": ["time"],
  "filters": [{ "column": "region_id", "op": "=", "value": "cn" }]
}
```

`metric`：

- `count`：`COUNT(*)`
- `unique_users`：`COUNT(DISTINCT <user-subject>)`，主体来自事件元数据，样例是 `role_id`
- `sum`：`SUM(<measure>)`，`measure` 必须是该事件标了 `summable` 的列

`time_range` 的日期含首尾两天。`time_grain` 为 `day`（默认）、`hour` 或 `week`，只在分组包含时间列时生效。按天使用 `to_date`，按小时和按周使用 `date_trunc`。

可选 `database_id` 是 Metabase 数据库 ID。响应里的 `status` 为 `compiled`。`execution` 为 `stub` 或将来的 `database`。

**现在实际走的路径：** `metabase.te-analytics.execute/run-compiled-query` 返回编译后的 Spark SQL（Hive / MaxCompute 同样接受这种写法）和空的 `rows`。它不打开 JDBC，也不调用查询处理器。`database_id` 会原样出现在响应里，替换这个函数即可接入 Metabase 现有的数据库执行，前端仍读同一份 `sql` / `columns` / `rows`。

## 页面

侧栏「分析 / 事件分析」，路由 `/analytics/events`。页面文案用 ttag，源字符串是简体中文，所以在加载语言包之前也显示中文。

整站界面语言用 Metabase 的 `site-locale`。代码是 `zh_CN`（也接受 `zh-CN`，会规范成 `zh_CN`）。本地开发可以：

- 管理后台 → 设置 → 本地化 → 实例语言，选简体中文
- 或启动前设置环境变量 `MB_SITE_LOCALE=zh_CN`

语言包在构建时从 `locales/zh-CN.po` 生成。事件分析页的中文不依赖这份语言包。

## 本地运行

按 Metabase 开发环境文档启动，不要为本模块另起一套进程：

[docs/developers-guide/devenv.md](../../../docs/developers-guide/devenv.md)

Windows 请用 WSL2。`./bin/mage` 和 `./bin/test-agent` 是 bash 脚本，不要在 PowerShell 里直接跑。前端热更新见 devenv 里的 `bun run build-hot`。

数仓连接走 Metabase 自己的数据库：管理后台 → Databases，添加 `project_y5` 所在的库。当前运行查询只会编译 SQL。页面上的数据库 ID 会传给执行器，但执行器仍返回空结果。

只跑本模块测试：

```bash
./bin/test-agent :only '[metabase.te-analytics.query-test]'
```
