(ns metabase.te-analytics.api
  "Authenticated HTTP API for event analysis.

  `POST /event-query` compiles SQL and returns the runner envelope. The runner in
  [[metabase.te-analytics.execute]] is a stub: `database_id` is accepted and echoed,
  and no warehouse query is opened."
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
   [:filterable :boolean]
   [:summable :boolean]])

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
   [:note [:maybe :string]]
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
   [:metric [:enum "count" "unique_users" "sum"]]
   [:measure {:optional true} NonBlank]
   [:time_range [:map {:closed true}
                 [:start NonBlank]
                 [:end NonBlank]]]
   [:time_grain {:optional true} [:enum "day" "hour" "week"]]
   [:database_id {:optional true} [:int {:min 1}]]
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
   [:status [:enum "compiled"]]
   [:execution [:enum "stub" "database"]]
   [:database_id [:maybe [:int {:min 1}]]]
   [:sql :string]
   [:columns [:sequential ResultColumn]]
   [:rows [:sequential [:sequential [:or :string :int :double :boolean :nil]]]]
   [:row_count :int]
   [:time_grain [:maybe [:enum "day" "hour" "week"]]]
   [:note :string]])

(defn- public-column
  [column]
  {:name          (:name column)
   :display_name  (:display-name column)
   :base_type     (:base-type column)
   :role          (some-> (:role column) name)
   :groupable     (boolean (:groupable column))
   :filterable    (boolean (:filterable column))
   :summable      (boolean (:summable column))})

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
   :note                  (:note event)
   :available_columns     (mapv public-column (:available-columns event))})

(defn- request->query
  [{:keys [event_key metric measure time_range time_grain database_id group_by filters]}]
  {:event-key   event_key
   :metric      metric
   :measure     measure
   :database-id database_id
   :time-range  {:start (:start time_range)
                 :end   (:end time_range)}
   :time-grain  time_grain
   :group-by    (vec (or group_by []))
   :filters     (mapv (fn [{:keys [column op value]}]
                        {:column column :op op :value value})
                      (or filters []))})

(api.macros/defendpoint :get "/events" :- EventsResponse
  "List registered events and the columns a query may use."
  []
  {:events (mapv public-event (te/events))})

(api.macros/defendpoint :post "/event-query" :- EventQueryResponse
  "Compile an event query and return the runner result. The current runner does not execute SQL."
  [_route-params
   _query-params
   body :- EventQueryRequest]
  (-> body request->query te/run-event-query))

(def ^{:arglists '([request respond raise])} routes
  "`/api/te` routes."
  (api.macros/ns-handler *ns*))
