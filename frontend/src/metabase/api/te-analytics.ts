import { Api } from "./api";

export const TE_METRICS = ["count", "unique_users", "sum"] as const;

export type TeMetric = (typeof TE_METRICS)[number];

export const TE_TIME_GRAINS = ["day", "hour", "week"] as const;

export type TeTimeGrain = (typeof TE_TIME_GRAINS)[number];

export type TeColumnRole = "time" | "user_subject" | "attribute";

export type TeColumn = {
  name: string;
  display_name: string;
  base_type: string;
  role: TeColumnRole | null;
  groupable: boolean;
  filterable: boolean;
  summable: boolean;
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
  note: string | null;
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
  measure?: string;
  time_range: {
    start: string;
    end: string;
  };
  time_grain: TeTimeGrain;
  database_id?: number;
  group_by: string[];
  filters: TeEventFilter[];
};

export type TeResultColumn = {
  name: string;
  base_type: string;
};

export type TeCell = string | number | boolean | null;

export type TeEventQueryResponse = {
  status: "compiled";
  execution: "stub" | "database";
  database_id: number | null;
  sql: string;
  columns: TeResultColumn[];
  rows: TeCell[][];
  row_count: number;
  time_grain: TeTimeGrain | null;
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
