(ns metabase.te-analytics.core
  "Public API for the event-analysis module."
  (:require
   [metabase.te-analytics.execute :as execute]
   [metabase.te-analytics.metadata :as metadata]
   [metabase.te-analytics.query :as query]))

(set! *warn-on-reflection* true)

(defn events
  "Registered events in catalog order. See [[metabase.te-analytics.metadata/events]]."
  []
  (metadata/events))

(defn event
  "The registered event named `event-key`, or nil."
  [event-key]
  (metadata/event event-key))

(defn compile-event-query
  "Compile `request` into SQL and output columns. See [[metabase.te-analytics.query/compile-event-query]]."
  [request]
  (query/compile-event-query request))

(defn run-event-query
  "Compile `request` and pass it to [[metabase.te-analytics.execute/run-compiled-query]].

  `:database-id` is forwarded and may be nil. The live runner returns a stub result."
  [{:keys [database-id] :as request}]
  (execute/run-compiled-query (query/compile-event-query request) database-id))
