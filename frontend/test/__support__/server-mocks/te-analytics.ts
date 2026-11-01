import fetchMock from "fetch-mock";

import type {
  TeEventQueryResponse,
  TeEventsResponse,
} from "metabase/api/te-analytics";

export function setupTeEventsEndpoint(response: TeEventsResponse) {
  fetchMock.get("path:/api/te/events", response, { name: "te-events" });
}

export function setupTeEventQueryEndpoint(
  response: TeEventQueryResponse | { status: number; body: unknown },
) {
  fetchMock.post("path:/api/te/event-query", response, {
    name: "te-event-query",
  });
}
