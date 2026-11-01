# 事件分析（te-analytics）

城主数仓的事件分析 MVP。不改 Metabase 的查询构建器、仪表盘、驱动和权限，只登记事件表并按元数据编译 SQL。

## 元数据

目录在 `metadata.clj`。每个事件必须声明：

| 字段 | 含义 |
| --- | --- |
| `event-key` | API 和页面使用的事件键，例如 `event_game` |
| `schema` / `table` | 物理表。样例是 `project_y5.dwd_${event_name}` |
| `time-column` | 时间列。样例为 `time` |
| `user-subject-column` | 用户主体。样例为 `role_id`，编译器不会写死这个名字 |
| `properties-column` | 可选的 JSON 属性列。没有就写 `nil` |
| `available-columns` | 查询允许使用的列。未登记的列不能出现在 `SELECT`、`GROUP BY` 或 `WHERE` |
| `stub` | 字段不完整的占位事件为 `true` |

列上的 `groupable` / `filterable` 为 false 时，该列即使已登记也不能分组或过滤。`properties` 就是这样：只登记，不参与分组和过滤。

目前登记了：

- `event_game` → `project_y5.dwd_event_game`，已知的公共列（`time`、`role_id`、`region_id`、`server_id`、`channel`、`os`、`vip_level`、`properties`）
- `event_activity_play` → `project_y5.dwd_event_activity_play`，占位，只有 `time`、`role_id`、`activity_id`

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

`metric` 为 `count`（`COUNT(*)`）或 `unique_users`（`COUNT(DISTINCT <user-subject>)`）。`time_range` 的日期含首尾两天。对时间列分组时按天使用 `to_date`。

**执行方式：** 返回编译后的 Spark SQL（Hive / MaxCompute 同样接受这种写法）和一个空的 stub 结果（`execution: "stub"`，`rows: []`）。本模块不打开 JDBC，也不走 Metabase 查询处理器。把数仓加到 Metabase 的 Database 之后，后续才能把这段 SQL 交给现有的数据库执行路径。

## 页面

侧栏「分析 / 事件分析」，路由 `/analytics/events`。事件、指标、日期、分组（仅 `available_columns` 里允许分组的列）和可选的 `region_id` 过滤。页面展示编译出的 SQL。

## 本地运行

按 Metabase 开发环境文档启动，不要为本模块另起一套进程：

[docs/developers-guide/devenv.md](../../../docs/developers-guide/devenv.md)

Windows 请用 WSL2。`./bin/mage` 和 `./bin/test-agent` 是 bash 脚本，不要在 PowerShell 里直接跑。前端热更新见 devenv 里的 `bun run build-hot`。

数仓连接走 Metabase 自己的数据库：管理后台 → Databases，添加 `project_y5` 所在的库。MVP 只编译 SQL，不会用那条连接去查数。

只跑本模块测试：

```bash
./bin/test-agent :only '[metabase.te-analytics.query-test]'
```
