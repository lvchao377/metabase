(ns metabase.te-analytics.execute
  "Turn compiled SQL into the event-query response.

  [[run-compiled-query]] is the execution seam. The current runner returns an empty
  stub and does not open a warehouse connection. A later runner can execute
  `compiled` through Metabase's query processor for `database-id` and return the
  same map with `:execution` `\"database\"` and real `:rows`.")

(set! *warn-on-reflection* true)

(def ^:private stub-note
  "只编译了 Spark SQL，没有在数仓上执行。请求里的 database_id 会原样返回，供以后接入 Metabase 的数据库查询。")

(defn run-compiled-query
  "Result envelope for `compiled` and optional Metabase `database-id`.

  `compiled` is the map from [[metabase.te-analytics.query/compile-query]]: `:sql`,
  `:columns`, and `:time-grain`. `database-id` may be nil. This runner always sets
  `:execution` to `\"stub\"` and `:rows` to `[]`."
  [{:keys [sql columns time-grain]} database-id]
  {:status      "compiled"
   :execution   "stub"
   :database_id database-id
   :sql         sql
   :columns     columns
   :rows        []
   :row_count   0
   :time_grain  time-grain
   :note        stub-note})
