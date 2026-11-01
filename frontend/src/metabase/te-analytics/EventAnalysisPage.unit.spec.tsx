import userEvent from "@testing-library/user-event";

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
  available_columns: [
    {
      name: "time",
      display_name: "事件时间",
      base_type: "type/DateTime",
      role: "time",
      groupable: true,
      filterable: true,
    },
    {
      name: "role_id",
      display_name: "角色 ID",
      base_type: "type/Text",
      role: "user_subject",
      groupable: true,
      filterable: true,
    },
    {
      name: "region_id",
      display_name: "区服",
      base_type: "type/Text",
      role: "attribute",
      groupable: true,
      filterable: true,
    },
    {
      name: "vip_level",
      display_name: "VIP 等级",
      base_type: "type/Integer",
      role: "attribute",
      groupable: true,
      filterable: true,
    },
  ],
};

const compiled: TeEventQueryResponse = {
  status: "dry_run",
  execution: "stub",
  sql: "SELECT to_date(`time`) AS `time_day`, COUNT(DISTINCT `role_id`) AS `unique_users`",
  columns: [
    { name: "time_day", base_type: "type/Date" },
    { name: "unique_users", base_type: "type/Integer" },
  ],
  rows: [],
  row_count: 0,
  note: "MVP 只编译 SQL 并返回空结果",
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
  it("lists event_game columns and shows compiled SQL", async () => {
    setup();

    expect(
      (await screen.findAllByText("事件时间（time）")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("VIP 等级（vip_level）")).toBeInTheDocument();
    expect(
      screen.getByText("物理表：project_y5.dwd_event_game"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "生成 SQL" }));

    expect(
      await screen.findByText(/COUNT\(DISTINCT `role_id`\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("MVP 只编译 SQL 并返回空结果")).toBeInTheDocument();
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

    await screen.findAllByText("事件时间（time）");
    await userEvent.click(screen.getByRole("button", { name: "生成 SQL" }));

    expect(
      await screen.findByText(
        "列 vip_level 不在事件 event_game 的 available_columns 中",
      ),
    ).toBeInTheDocument();
  });
});
