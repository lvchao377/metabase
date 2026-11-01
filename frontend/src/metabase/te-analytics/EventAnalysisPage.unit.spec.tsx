import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupTeEventQueryEndpoint,
  setupTeEventsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TeEvent, TeEventQueryResponse } from "metabase/api/te-analytics";

import { EventAnalysisPage } from "./EventAnalysisPage";

const eventGame: TeEvent = {
  event_key: "event_game",
  display_name: "游戏事件",
  schema_name: "project_y5",
  table: "dwd_event_game",
  time_column: "time",
  user_subject_column: "role_id",
  properties_column: "properties",
  stub: false,
  note: null,
  available_columns: [
    {
      name: "time",
      display_name: "事件时间",
      base_type: "type/DateTime",
      role: "time",
      groupable: true,
      filterable: true,
      summable: false,
    },
    {
      name: "role_id",
      display_name: "角色 ID",
      base_type: "type/Text",
      role: "user_subject",
      groupable: true,
      filterable: true,
      summable: false,
    },
    {
      name: "region_id",
      display_name: "区服",
      base_type: "type/Text",
      role: "attribute",
      groupable: true,
      filterable: true,
      summable: false,
    },
    {
      name: "vip_level",
      display_name: "VIP 等级",
      base_type: "type/Integer",
      role: "attribute",
      groupable: true,
      filterable: true,
      summable: true,
    },
  ],
};

const compiled: TeEventQueryResponse = {
  status: "compiled",
  execution: "stub",
  database_id: null,
  sql: "SELECT to_date(`time`) AS `time_day`, COUNT(DISTINCT `role_id`) AS `unique_users`",
  columns: [
    { name: "time_day", base_type: "type/Date" },
    { name: "unique_users", base_type: "type/Integer" },
  ],
  rows: [],
  row_count: 0,
  time_grain: "day",
  note: "只编译了 Spark SQL，没有在数仓上执行。",
};

interface SetupOpts {
  queryResponse?: TeEventQueryResponse | { status: number; body: unknown };
}

function setup({ queryResponse = compiled }: SetupOpts = {}) {
  setupTeEventsEndpoint({ events: [eventGame] });
  setupTeEventQueryEndpoint(queryResponse);
  renderWithProviders(<EventAnalysisPage />);
}

describe("EventAnalysisPage", () => {
  it("lists event_game columns and shows compiled SQL with an empty stub", async () => {
    setup();

    expect(
      (await screen.findAllByText("事件时间（time），可分组、可过滤")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("VIP 等级（vip_level），可分组、可过滤、可求和"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("物理表：project_y5.dwd_event_game"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "运行查询" }));

    expect(
      await screen.findByText(/COUNT\(DISTINCT `role_id`\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("没有结果行")).toBeInTheDocument();
    expect(screen.getByText(/编译预览/)).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/te/event-query", {
      method: "POST",
    });
    const body: unknown = JSON.parse(String(call?.options.body));
    expect(body).toMatchObject({
      event_key: "event_game",
      metric: "unique_users",
      time_grain: "day",
      group_by: ["time"],
      filters: [],
    });
  });

  it("shows the rejection returned by the API", async () => {
    setup({
      queryResponse: {
        status: 400,
        body: {
          message: "列 vip_level 不在事件 event_game 的 available_columns 中",
        },
      },
    });

    await screen.findAllByText("事件时间（time），可分组、可过滤");
    await userEvent.click(screen.getByRole("button", { name: "运行查询" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "列 vip_level 不在事件 event_game 的 available_columns 中",
    );
    expect(screen.queryByText("编译 SQL")).not.toBeInTheDocument();
  });

  it("renders returned rows in a table", async () => {
    setup({
      queryResponse: {
        ...compiled,
        rows: [["2026-01-01", 4]],
        row_count: 1,
      },
    });

    await screen.findByRole("button", { name: "运行查询" });
    await userEvent.click(screen.getByRole("button", { name: "运行查询" }));

    expect(await screen.findByRole("cell", { name: "4" })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "2026-01-01" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("没有结果行")).not.toBeInTheDocument();
  });
});
