(ns metabase.te-analytics.metadata
  "Registered 城主数仓 event tables and the columns a query is allowed to use.

  `dwd_event_game` carries the known common column set. Other event tables may omit
  those columns; a column that is absent here cannot be selected, grouped, or filtered.")

(set! *warn-on-reflection* true)

(def ^:private identifier-pattern
  "Physical schema, table, and column names the compiler will quote."
  #"^[A-Za-z_][A-Za-z0-9_]*$")

(defn- col
  "One registered column. `role` is `:time`, `:user-subject`, or `:attribute`."
  [column-name display-name base-type role & {:keys [groupable filterable]
                                              :or   {groupable true
                                                     filterable true}}]
  {:name         column-name
   :display-name display-name
   :base-type    base-type
   :role         role
   :groupable    groupable
   :filterable   filterable})

(def ^:private event-game-columns
  [(col "time" "事件时间" "type/DateTime" :time)
   (col "role_id" "角色 ID" "type/Text" :user-subject)
   (col "region_id" "区服" "type/Text" :attribute)
   (col "server_id" "服务器" "type/Text" :attribute)
   (col "channel" "渠道" "type/Text" :attribute)
   (col "os" "系统" "type/Text" :attribute)
   (col "vip_level" "VIP 等级" "type/Integer" :attribute)
   (col "properties" "扩展属性" "type/JSON" :attribute :groupable false :filterable false)])

(def ^:private event-activity-play-columns
  "This table does not carry the common attributes (`region_id`, `vip_level`, `properties`)."
  [(col "time" "事件时间" "type/DateTime" :time)
   (col "role_id" "角色 ID" "type/Text" :user-subject)
   (col "activity_id" "活动 ID" "type/Text" :attribute)])

(defn- bad-metadata!
  [message data]
  (throw (ex-info message data)))

(defn- assert-ident!
  [label value]
  (when-not (and (string? value) (re-matches identifier-pattern value))
    (bad-metadata! (str "事件元数据标识符非法：" label) {:label label :value value})))

(defn- validate-event!
  "Throw when `event` is missing the physical table, time column, or user subject."
  [{:keys [event-key schema table time-column user-subject-column properties-column available-columns]
    :as   event}]
  (assert-ident! "event-key" event-key)
  (assert-ident! "schema" schema)
  (assert-ident! "table" table)
  (assert-ident! "time-column" time-column)
  (assert-ident! "user-subject-column" user-subject-column)
  (when properties-column
    (assert-ident! "properties-column" properties-column))
  (when-not (seq available-columns)
    (bad-metadata! "事件至少要登记一列" {:event-key event-key}))
  (let [names (mapv :name available-columns)]
    (when (not= (count names) (count (set names)))
      (bad-metadata! "available-columns 有重复列名" {:event-key event-key}))
    (doseq [column-name names]
      (assert-ident! "column" column-name))
    (doseq [required [time-column user-subject-column properties-column]
            :when required]
      (when-not (some #(= required (:name %)) available-columns)
        (bad-metadata! (str "必填列未登记：" required) {:event-key event-key :column required}))))
  event)

(def ^:private catalog
  [(validate-event!
    {:event-key            "event_game"
     :display-name         "游戏事件"
     :schema               "project_y5"
     :table                "dwd_event_game"
     :time-column          "time"
     :user-subject-column  "role_id"
     :properties-column    "properties"
     :stub                 false
     :available-columns    event-game-columns})
   (validate-event!
    {:event-key            "event_activity_play"
     :display-name         "活动参与"
     :schema               "project_y5"
     :table                "dwd_event_activity_play"
     :time-column          "time"
     :user-subject-column  "role_id"
     :properties-column    nil
     :stub                 true
     :available-columns    event-activity-play-columns})])

(defn events
  "Registered events in catalog order."
  []
  catalog)

(defn event
  "The registered event named `event-key`, or nil when nothing is registered under that key."
  [event-key]
  (first (filter #(= event-key (:event-key %)) catalog)))
