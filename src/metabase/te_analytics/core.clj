(ns metabase.te-analytics.core
  "Public API for the event-analysis module."
  (:require
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
