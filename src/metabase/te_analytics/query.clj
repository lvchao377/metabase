(ns metabase.te-analytics.query
  "Compile an event query into Spark SQL from registered metadata.

  Identifiers come only from the event catalog. A requested column that is missing,
  or not marked groupable or filterable for that use, is rejected. The returned map
  is SQL plus output columns; nothing here opens a warehouse connection."
  (:require
   [clojure.string :as str]
   [metabase.te-analytics.metadata :as metadata])
  (:import
   (java.time LocalDate)
   (java.time.format DateTimeParseException)))

(set! *warn-on-reflection* true)

(def ^:private identifier-pattern
  #"^[A-Za-z_][A-Za-z0-9_]*$")

(def ^:private date-pattern
  #"\d{4}-\d{2}-\d{2}")

(def ^:private comparison-ops
  #{"=" "!=" ">" ">=" "<" "<="})

(defn- reject!
  ([message]
   (reject! message {}))
  ([message data]
   (throw (ex-info message (assoc data :status-code 400)))))

(defn- quote-ident
  "Backtick-quote a catalog identifier. Throws when `s` is not a plain identifier."
  ^String [s]
  (when-not (and (string? s) (re-matches identifier-pattern s))
    (reject! (str "非法标识符：" s) {:identifier s}))
  (str "`" s "`"))

(defn- sql-string
  "SQL string literal. Single quotes inside `s` are doubled."
  ^String [s]
  (when-not (string? s)
    (reject! "过滤值必须是字符串" {:value s}))
  (str "'" (str/replace s "'" "''") "'"))

(defn- sql-number
  "SQL numeric literal. Rejects NaN, infinities, and non-integer non-float numbers."
  ^String [n]
  (cond
    (integer? n)
    (str n)

    (and (float? n)
         (not (Double/isNaN (double n)))
         (not (Double/isInfinite (double n))))
    (str (double n))

    :else
    (reject! "过滤值必须是有限数字" {:value n})))

(defn- sql-scalar
  "A string or number SQL literal."
  ^String [value]
  (cond
    (string? value) (sql-string value)
    (number? value) (sql-number value)
    :else           (reject! "过滤值必须是字符串或数字" {:value value})))

(defn- parse-date
  "Parse a `YYYY-MM-DD` date. `label` is included in the rejection message."
  ^LocalDate [s label]
  (when-not (and (string? s) (re-matches date-pattern s))
    (reject! (str label "必须是 YYYY-MM-DD") {:value s}))
  (try
    (LocalDate/parse s)
    (catch DateTimeParseException _
      (reject! (str label "不是合法日期") {:value s}))))

(defn- timestamp-literal
  "Spark TIMESTAMP literal for the start of `date`."
  ^String [^LocalDate date]
  (str "TIMESTAMP " (sql-string (str date " 00:00:00"))))

(defn- column-named
  [event column-name]
  (first (filter #(= column-name (:name %)) (:available-columns event))))

(defn- require-column!
  "The registered column `column-name`. When `purpose` is `:group`, `:filter`, or `:sum`, the column must allow that use."
  ([event column-name]
   (require-column! event column-name nil))
  ([event column-name purpose]
   (let [column (column-named event column-name)]
     (when-not column
       (reject! (format "列 %s 不在事件 %s 的 available_columns 中"
                        column-name
                        (:event-key event))
                {:column column-name :event_key (:event-key event)}))
     (when (and (= purpose :group) (not (:groupable column)))
       (reject! (format "列 %s 不可用于分组" column-name) {:column column-name}))
     (when (and (= purpose :filter) (not (:filterable column)))
       (reject! (format "列 %s 不可用于过滤" column-name) {:column column-name}))
     (when (and (= purpose :sum) (not (:summable column)))
       (reject! (format "列 %s 不可用于求和" column-name) {:column column-name}))
     column)))

(defn- require-event-shape!
  "Reject an event that is missing a physical table, time column, or user subject."
  [event]
  (doseq [k [:event-key :schema :table :time-column :user-subject-column]]
    (when-not (seq (str (get event k)))
      (reject! (str "事件缺少必填元数据：" (name k)) {:event_key (:event-key event)})))
  (require-column! event (:time-column event))
  (require-column! event (:user-subject-column event))
  (quote-ident (:schema event))
  (quote-ident (:table event)))

(def ^:private time-grains
  #{"day" "hour" "week"})

(defn- time-bucket
  "Spark SQL bucket for the time column. `day` stays `to_date` so a calendar day is one row."
  [column-name grain]
  (case grain
    "day"  {:sql       (str "to_date(" (quote-ident column-name) ")")
            :alias     "time_day"
            :base-type "type/Date"}
    "hour" {:sql       (str "date_trunc('hour', " (quote-ident column-name) ")")
            :alias     "time_hour"
            :base-type "type/DateTime"}
    "week" {:sql       (str "date_trunc('week', " (quote-ident column-name) ")")
            :alias     "time_week"
            :base-type "type/DateTime"}
    (reject! (str "未知时间粒度：" grain) {:time_grain grain})))

(defn- group-select
  "SELECT/GROUP BY item for `column-name`. The time column uses `grain` (`day`, `hour`, or `week`)."
  [event column-name grain]
  (let [column (require-column! event column-name :group)]
    (if (= column-name (:time-column event))
      (time-bucket column-name grain)
      {:sql       (quote-ident column-name)
       :alias     column-name
       :base-type (:base-type column)})))

(defn- metric-select
  [event metric measure]
  (case metric
    "count"
    {:sql "COUNT(*)" :alias "event_count" :base-type "type/Integer"}

    "unique_users"
    (let [subject (:user-subject-column event)]
      (require-column! event subject)
      {:sql       (str "COUNT(DISTINCT " (quote-ident subject) ")")
       :alias     "unique_users"
       :base-type "type/Integer"})

    "sum"
    (do
      (when-not (string? measure)
        (reject! "求和需要 measure，指向该事件可求和的列" {:metric metric}))
      (let [column (require-column! event measure :sum)]
        {:sql       (str "SUM(" (quote-ident (:name column)) ")")
         :alias     (str measure "_sum")
         :base-type (:base-type column)}))

    (reject! (str "未知指标：" metric) {:metric metric})))

(defn- filter-sql
  [event {:keys [column op value]}]
  (require-column! event column :filter)
  (let [ident (quote-ident column)]
    (cond
      (comparison-ops op)
      (do
        (when (sequential? value)
          (reject! (str op " 的过滤值必须是单个值") {:column column :op op}))
        (str ident " " op " " (sql-scalar value)))

      (= op "in")
      (do
        (when-not (and (sequential? value) (seq value))
          (reject! "in 的过滤值必须是非空列表" {:column column}))
        (str ident " IN (" (str/join ", " (map sql-scalar value)) ")"))

      :else
      (reject! (str "未知过滤操作：" op) {:op op}))))

(defn- time-predicate
  "Inclusive calendar-day range. `end` covers that whole date, so the upper bound is the next day."
  [event {:keys [start end] :as time-range}]
  (when-not (map? time-range)
    (reject! "必须提供 time_range" {}))
  (let [^LocalDate start-date (parse-date start "开始日期")
        ^LocalDate end-date   (parse-date end "结束日期")]
    (when (.isAfter start-date end-date)
      (reject! "开始日期不能晚于结束日期" {:start start :end end}))
    (let [^LocalDate exclusive-end (.plusDays end-date 1)
          column                   (quote-ident (:time-column event))]
      [(str column " >= " (timestamp-literal start-date))
       (str column " < " (timestamp-literal exclusive-end))])))

(defn- select-item
  [{:keys [sql alias]}]
  (let [quoted (quote-ident alias)]
    (if (= sql quoted)
      sql
      (str sql " AS " quoted))))

(defn- compile-sql
  [from groups metric-item where]
  (let [items       (concat groups [metric-item])
        select-line (str "SELECT\n  " (str/join ",\n  " (map select-item items)))
        from-line   (str "FROM " from)
        where-line  (str "WHERE " (str/join "\n  AND " where))
        group-line  (when (seq groups)
                      (str "GROUP BY " (str/join ", " (map :sql groups))))
        order-line  (when (seq groups)
                      (str "ORDER BY " (str/join ", " (map #(quote-ident (:alias %)) groups))))]
    (str/join "\n" (filter some? [select-line from-line where-line group-line order-line]))))

(defn- require-group-by!
  [group-by]
  (when-not (or (nil? group-by) (sequential? group-by))
    (reject! "group_by 必须是列表" {:value group-by}))
  (when (and (sequential? group-by)
             (not= (count group-by) (count (distinct group-by))))
    (reject! "group_by 包含重复列" {}))
  (when-not (or (nil? group-by) (every? string? group-by))
    (reject! "group_by 的每一项必须是列名" {})))

(defn- require-time-grain!
  [time-grain]
  (let [grain (or time-grain "day")]
    (when-not (time-grains grain)
      (reject! (str "未知时间粒度：" time-grain) {:time_grain time-grain}))
    grain))

(defn compile-query
  "Compile `request` against `event`.

  `request` keys:

  - `:metric` — `\"count\"`, `\"unique_users\"`, or `\"sum\"`
  - `:measure` — column to sum; required for `\"sum\"`, and it must be `:summable`
  - `:time-range` — inclusive `:start` and `:end` dates, `YYYY-MM-DD`
  - `:time-grain` — `\"day\"` (default), `\"hour\"`, or `\"week\"`, used when the time column is grouped
  - `:group-by` — column names from `:available-columns` that are groupable
  - `:filters` — maps of `:column`, `:op`, and `:value`

  Returns `{:sql :columns :time-grain}`. `:time-grain` is the applied bucket, or nil when the
  time column is not grouped. Throws ExceptionInfo with `:status-code` 400 when a column
  is missing from the event or is not allowed for that use. `unique_users` counts the
  event's user subject column."
  [event {:keys [metric measure time-range time-grain group-by filters]}]
  (require-event-shape! event)
  (require-group-by! group-by)
  (when-not (or (nil? filters) (sequential? filters))
    (reject! "filters 必须是列表" {:value filters}))
  (let [grain       (require-time-grain! time-grain)
        grouped     (vec (or group-by []))
        groups      (map #(group-select event % grain) grouped)
        metric-item (metric-select event metric measure)
        where       (concat (time-predicate event time-range)
                            (map #(filter-sql event %) (or filters [])))
        from        (str (quote-ident (:schema event)) "." (quote-ident (:table event)))
        items       (concat groups [metric-item])
        applied     (when (some #(= % (:time-column event)) grouped) grain)]
    {:sql        (compile-sql from groups metric-item where)
     :columns    (mapv (fn [{:keys [alias base-type]}]
                         {:name alias :base_type base-type})
                       items)
     :time-grain applied}))

(defn compile-event-query
  "Compile `request` for the registered event named by `:event-key`. See [[compile-query]]."
  [{:keys [event-key] :as request}]
  (if-let [found (metadata/event event-key)]
    (compile-query found request)
    (reject! (str "未知事件：" event-key) {:event_key event-key})))
