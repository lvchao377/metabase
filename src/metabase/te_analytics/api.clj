(ns metabase.te-analytics.api
  "Authenticated HTTP API for the event-analysis MVP.

  `POST /event-query` compiles SQL and returns an empty stub result. It does not
  execute the SQL against a Metabase database."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.te-analytics.core :as te]))

(set! *warn-on-reflection* true)

(def ^:private NonBlank
  [:string {:min 1}])

(def ^:private Column
  [:map {:closed true}
   [:name :string]
   [:display_name :string]
   [:base_type :string]
   [:role [:maybe :string]]
   [:groupable :boolean]
   [:filterable :boolean]])

(def ^:private Event
  [:map {:closed true}
   [:event_key :string]
   [:display_name :string]
   [:schema_name :string]
   [:table :string]
   [:time_column :string]
   [:user_subject_column :string]
   [:properties_column [:maybe :string]]
   [:stub :boolean]
   [:available_columns [:sequential Column]]])

(def ^:private EventsResponse
  [:map {:closed true}
   [:events [:sequential Event]]])

(def ^:private FilterOp
  [:enum "=" "!=" ">" ">=" "<" "<=" "in"])

(def ^:private FilterValue
  [:or :string number? [:sequential [:or :string number?]]])

(def ^:private EventQueryRequest
  [:map {:closed true}
   [:event_key NonBlank]
   [:metric [:enum "count" "unique_users"]]
   [:time_range [:map {:closed true}
                 [:start NonBlank]
                 [:end NonBlank]]]
   [:group_by {:optional true} [:sequential NonBlank]]
   [:filters {:optional true}
    [:sequential
     [:map {:closed true}
      [:column NonBlank]
      [:op FilterOp]
      [:value FilterValue]]]]])

(def ^:private ResultColumn
  [:map {:closed true}
   [:name :string]
   [:base_type :string]])

(def ^:private EventQueryResponse
  [:map {:closed true}
   [:status [:enum "dry_run"]]
   [:execution [:enum "stub"]]
   [:sql :string]
   [:columns [:sequential ResultColumn]]
   [:rows [:sequential [:sequential [:or :string :int :double :boolean :nil]]]]
   [:row_count :int]
   [:note :string]])

(def ^:private dry-run-note
  "MVP 只编译 SQL 并返回空结果，不会在数仓上执行。请先在 Metabase 中把数仓添加为数据库。")

(defn- public-column
  [column]
  {:name          (:name column)
   :display_name  (:display-name column)
   :base_type     (:base-type column)
   :role          (some-> (:role column) name)
   :groupable     (boolean (:groupable column))
   :filterable    (boolean (:filterable column))})

(defn- public-event
  [event]
  {:event_key             (:event-key event)
   :display_name          (:display-name event)
   :schema_name           (:schema event)
   :table                 (:table event)
   :time_column           (:time-column event)
   :user_subject_column   (:user-subject-column event)
   :properties_column     (:properties-column event)
   :stub                  (boolean (:stub event))
   :available_columns     (mapv public-column (:available-columns event))})

(defn- request->query
  [{:keys [event_key metric time_range group_by filters]}]
  {:event-key  event_key
   :metric     metric
   :time-range {:start (:start time_range)
                :end   (:end time_range)}
   :group-by   (vec (or group_by []))
   :filters    (mapv (fn [{:keys [column op value]}]
                       {:column column :op op :value value})
                     (or filters []))})

(defn- public-result
  "Dry-run envelope around compiled SQL. Rows are always empty in this MVP."
  [{:keys [sql columns]}]
  {:status     "dry_run"
   :execution  "stub"
   :sql        sql
   :columns    columns
   :rows       []
   :row_count  0
   :note       dry-run-note})

(api.macros/defendpoint :get "/events" :- EventsResponse
  "List registered events and the columns a query may use."
  []
  {:events (mapv public-event (te/events))})

(api.macros/defendpoint :post "/event-query" :- EventQueryResponse
  "Compile an event query to SQL and return an empty stub result."
  [_route-params
   _query-params
   body :- EventQueryRequest]
  (-> body request->query te/compile-event-query public-result))

(def ^{:arglists '([request respond raise])} routes
  "`/api/te` routes."
  (api.macros/ns-handler *ns*))
