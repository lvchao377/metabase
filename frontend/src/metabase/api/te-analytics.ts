import { Api } from "./api";

export const TE_METRICS = ["count", "unique_users"] as const;

export type TeMetric = (typeof TE_METRICS)[number];

export type TeColumnRole = "time" | "user_subject" | "attribute";

export type TeColumn = {
  name: string;
  display_name: string;
  base_type: string;
  role: TeColumnRole | null;
  groupable: boolean;
  filterable: boolean;
};

export type TeEvent = {
  event_key: string;
  display_name: string;
  schema_name: string;
  table: string;
  time_column: string;
  user_subject_column: string;
  properties_column: string | null;
  stub: boolean;
  available_columns: TeColumn[];
};

export type TeEventsResponse = {
  events: TeEvent[];
};

export const TE_FILTER_OPS = ["=", "!=", ">", ">=", "<", "<=", "in"] as const;

export type TeFilterOp = (typeof TE_FILTER_OPS)[number];

export type TeFilterValue = string | number | Array<string | number>;

export type TeEventFilter = {
  column: string;
  op: TeFilterOp;
  value: TeFilterValue;
};

export type TeEventQueryRequest = {
  event_key: string;
  metric: TeMetric;
  time_range: {
    start: string;
    end: string;
  };
  group_by: string[];
  filters: TeEventFilter[];
};

export type TeResultColumn = {
  name: string;
  base_type: string;
};

export type TeEventQueryResponse = {
  status: "dry_run";
  execution: "stub";
  sql: string;
  columns: TeResultColumn[];
  rows: Array<Array<string | number | boolean | null>>;
  row_count: number;
  note: string;
};

export const teAnalyticsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listTeEvents: builder.query<TeEventsResponse, void>({
      query: () => "/api/te/events",
    }),
    compileTeEventQuery: builder.mutation<
      TeEventQueryResponse,
      TeEventQueryRequest
    >({
      query: (body) => ({
        url: "/api/te/event-query",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useListTeEventsQuery, useCompileTeEventQueryMutation } =
  teAnalyticsApi;
