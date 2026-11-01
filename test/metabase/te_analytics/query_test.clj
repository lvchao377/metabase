(ns metabase.te-analytics.query-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.te-analytics.metadata :as metadata]
   [metabase.te-analytics.query :as query]))

(set! *warn-on-reflection* true)

(def ^:private day-range
  {:start "2026-01-01" :end "2026-01-07"})

(defn- ex-info?
  [form]
  (try
    (form)
    nil
    (catch clojure.lang.ExceptionInfo e
      e)))

(deftest event-game-columns-test
  (let [event   (metadata/event "event_game")
        columns (set (map :name (:available-columns event)))]
    (is (= "dwd_event_game" (:table event)))
    (is (= "role_id" (:user-subject-column event)))
    (is (= "time" (:time-column event)))
    (is (set/subset? #{"time" "role_id" "region_id" "vip_level" "properties"} columns))
    (is (false? (:stub event)))))

(deftest activity-play-omits-common-columns-test
  (let [names (set (map :name (:available-columns (metadata/event "event_activity_play"))))]
    (is (= #{"time" "role_id" "activity_id"} names))
    (is (not (contains? names "vip_level")))
    (is (not (contains? names "region_id")))))

(deftest unique-users-by-day-test
  (is (= (str "SELECT\n"
              "  to_date(`time`) AS `time_day`,\n"
              "  COUNT(DISTINCT `role_id`) AS `unique_users`\n"
              "FROM `project_y5`.`dwd_event_game`\n"
              "WHERE `time` >= TIMESTAMP '2026-01-01 00:00:00'\n"
              "  AND `time` < TIMESTAMP '2026-01-08 00:00:00'\n"
              "GROUP BY to_date(`time`)\n"
              "ORDER BY `time_day`")
         (:sql (query/compile-event-query
                {:event-key  "event_game"
                 :metric     "unique_users"
                 :time-range day-range
                 :group-by   ["time"]}))))
  (is (= [{:name "time_day" :base_type "type/Date"}
          {:name "unique_users" :base_type "type/Integer"}]
         (:columns (query/compile-event-query
                    {:event-key  "event_game"
                     :metric     "unique_users"
                     :time-range day-range
                     :group-by   ["time"]})))))

(deftest count-with-region-filter-test
  (let [sql (:sql (query/compile-event-query
                   {:event-key  "event_game"
                    :metric     "count"
                    :time-range {:start "2026-03-01" :end "2026-03-01"}
                    :filters    [{:column "region_id" :op "=" :value "cn"}]}))]
    (is (str/includes? sql "COUNT(*) AS `event_count`"))
    (is (str/includes? sql "`region_id` = 'cn'"))
    (is (str/includes? sql "`time` < TIMESTAMP '2026-03-02 00:00:00'"))
    (is (not (str/includes? sql "vip_level")))
    (is (not (str/includes? sql "GROUP BY")))))

(deftest filter-value-is-escaped-test
  (let [sql (:sql (query/compile-event-query
                   {:event-key  "event_game"
                    :metric     "count"
                    :time-range day-range
                    :filters    [{:column "region_id" :op "=" :value "o'brien"}]}))]
    (is (str/includes? sql "`region_id` = 'o''brien'"))))

(deftest numeric-and-in-filters-test
  (let [sql (:sql (query/compile-event-query
                   {:event-key  "event_game"
                    :metric     "unique_users"
                    :time-range day-range
                    :group-by   ["channel"]
                    :filters    [{:column "vip_level" :op "=" :value 3}
                                 {:column "channel" :op "in" :value ["a" "b"]}]}))]
    (is (str/includes? sql "`vip_level` = 3"))
    (is (str/includes? sql "`channel` IN ('a', 'b')"))
    (is (str/includes? sql "COUNT(DISTINCT `role_id`)"))))

(deftest unregistered-column-is-rejected-test
  (doseq [request [{:event-key "event_activity_play"
                    :metric "unique_users"
                    :time-range day-range
                    :group-by ["vip_level"]}
                   {:event-key "event_game"
                    :metric "count"
                    :time-range day-range
                    :filters [{:column "password" :op "=" :value "x"}]}
                   {:event-key "event_activity_play"
                    :metric "count"
                    :time-range day-range
                    :filters [{:column "region_id" :op "=" :value "1"}]}]]
    (let [e (ex-info? #(query/compile-event-query request))]
      (is (some? e) (str request))
      (is (= 400 (:status-code (ex-data e))))
      (is (re-find #"available_columns" (ex-message e))))))

(deftest non-groupable-column-is-rejected-test
  (let [e (ex-info? #(query/compile-event-query
                      {:event-key  "event_game"
                       :metric     "count"
                       :time-range day-range
                       :group-by   ["properties"]}))]
    (is (= 400 (:status-code (ex-data e))))
    (is (re-find #"不可用于分组" (ex-message e)))))

(deftest unknown-event-is-rejected-test
  (let [e (ex-info? #(query/compile-event-query
                      {:event-key  "event_missing"
                       :metric     "count"
                       :time-range day-range}))]
    (is (= 400 (:status-code (ex-data e))))
    (is (re-find #"未知事件" (ex-message e)))))

(deftest user-subject-comes-from-metadata-test
  (let [event {:event-key           "event_custom"
               :schema              "project_y5"
               :table               "dwd_event_custom"
               :time-column         "event_time"
               :user-subject-column "user_id"
               :available-columns   [{:name "event_time" :base-type "type/DateTime"
                                      :groupable true :filterable true}
                                     {:name "user_id" :base-type "type/Text"
                                      :groupable true :filterable true}]}
        sql   (:sql (query/compile-query
                     event
                     {:metric     "unique_users"
                      :time-range day-range
                      :group-by   ["event_time"]}))]
    (is (str/includes? sql "COUNT(DISTINCT `user_id`)"))
    (is (str/includes? sql "to_date(`event_time`)"))
    (is (str/includes? sql "`project_y5`.`dwd_event_custom`"))
    (is (not (str/includes? sql "role_id")))))

(deftest invalid-range-is-rejected-test
  (let [e (ex-info? #(query/compile-event-query
                      {:event-key  "event_game"
                       :metric     "count"
                       :time-range {:start "2026-02-02" :end "2026-02-01"}}))]
    (is (= 400 (:status-code (ex-data e))))
    (is (re-find #"开始日期不能晚于结束日期" (ex-message e))))
  (let [e (ex-info? #(query/compile-event-query
                      {:event-key  "event_game"
                       :metric     "count"
                       :time-range {:start "2026-02-31" :end "2026-03-01"}}))]
    (is (= 400 (:status-code (ex-data e))))
    (is (re-find #"不是合法日期" (ex-message e)))))
