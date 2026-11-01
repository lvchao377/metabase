import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  type TeEvent,
  type TeEventQueryRequest,
  type TeEventQueryResponse,
  type TeMetric,
  useCompileTeEventQueryMutation,
  useListTeEventsQuery,
} from "metabase/api";
import {
  Box,
  Button,
  Code,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

import S from "./EventAnalysisPage.module.css";

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultTimeRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: formatIsoDate(start), end: formatIsoDate(end) };
}

function defaultGroupBy(event: TeEvent): string[] {
  const timeColumn = event.available_columns.find(
    (column) => column.name === event.time_column && column.groupable,
  );
  return timeColumn ? [timeColumn.name] : [];
}

function readErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return t`查询失败`;
  }
  const data: unknown = error.data;
  if (typeof data === "string" && data.length > 0) {
    return data;
  }
  if (typeof data === "object" && data !== null && "message" in data) {
    const message: unknown = data.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return t`查询失败`;
}

function isMetric(value: string | null): value is TeMetric {
  return value === "count" || value === "unique_users";
}

export function EventAnalysisPage() {
  const { data, isLoading, isError } = useListTeEventsQuery();
  const [compileQuery, { isLoading: isCompiling }] =
    useCompileTeEventQueryMutation();
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<TeMetric>("unique_users");
  const [timeRange, setTimeRange] = useState(defaultTimeRange);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [result, setResult] = useState<TeEventQueryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const events = data?.events ?? [];
  const selected = events.find((event) => event.event_key === eventKey) ?? null;

  useEffect(() => {
    const first = data?.events[0];
    if (eventKey == null && first) {
      setEventKey(first.event_key);
      setGroupBy(defaultGroupBy(first));
    }
  }, [data, eventKey]);

  if (isLoading) {
    return (
      <Box p="xl">
        <Text>{t`正在加载事件…`}</Text>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box p="xl">
        <Text>{t`无法加载事件列表`}</Text>
      </Box>
    );
  }

  const groupable = (selected?.available_columns ?? []).filter(
    (column) => column.groupable,
  );
  const regionColumn = selected?.available_columns.find(
    (column) => column.name === "region_id" && column.filterable,
  );

  const handleEventChange = (value: string | null) => {
    setEventKey(value);
    const next = events.find((event) => event.event_key === value);
    setGroupBy(next ? defaultGroupBy(next) : []);
    setRegion("");
    setResult(null);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    if (!selected) {
      return;
    }
    const request: TeEventQueryRequest = {
      event_key: selected.event_key,
      metric,
      time_range: timeRange,
      group_by: groupBy,
      filters:
        regionColumn && region.trim().length > 0
          ? [{ column: "region_id", op: "=", value: region.trim() }]
          : [],
    };
    try {
      const response = await compileQuery(request).unwrap();
      setResult(response);
      setErrorMessage(null);
    } catch (error: unknown) {
      setResult(null);
      setErrorMessage(readErrorMessage(error));
    }
  };

  return (
    <Box p="xl" maw={880}>
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>{t`事件分析`}</Title>
          <Text c="text-secondary">
            {t`按已登记的事件表编译查询。只会使用该事件 available_columns 里的字段。`}
          </Text>
        </Stack>

        <Select<string | null>
          label={t`事件`}
          data={events.map((event) => ({
            value: event.event_key,
            label: event.stub
              ? t`${event.display_name}（字段未齐）`
              : event.display_name,
          }))}
          value={eventKey}
          onChange={handleEventChange}
          allowDeselect={false}
        />

        {selected && (
          <Stack gap="xs">
            <Text size="sm" c="text-secondary">
              {t`物理表：${selected.schema_name}.${selected.table}`}
            </Text>
            <Text fw={600}>{t`可用字段`}</Text>
            {selected.available_columns.map((column) => (
              <Text key={column.name} size="sm">
                {t`${column.display_name}（${column.name}）`}
              </Text>
            ))}
          </Stack>
        )}

        <Select<TeMetric>
          label={t`指标`}
          data={[
            { value: "unique_users", label: t`去重人数` },
            { value: "count", label: t`事件次数` },
          ]}
          value={metric}
          onChange={(value) => {
            if (isMetric(value)) {
              setMetric(value);
            }
          }}
          allowDeselect={false}
        />

        <TextInput
          type="date"
          label={t`开始日期`}
          value={timeRange.start}
          onChange={(event) =>
            setTimeRange((current) => ({
              ...current,
              start: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          type="date"
          label={t`结束日期`}
          value={timeRange.end}
          onChange={(event) =>
            setTimeRange((current) => ({
              ...current,
              end: event.currentTarget.value,
            }))
          }
        />

        <MultiSelect
          label={t`分组`}
          description={t`只能选择当前事件已登记且允许分组的列。时间列按天汇总。`}
          data={groupable.map((column) => ({
            value: column.name,
            label: t`${column.display_name}（${column.name}）`,
          }))}
          value={groupBy}
          onChange={setGroupBy}
          searchable
          clearable
        />

        {regionColumn ? (
          <TextInput
            label={t`区服过滤（region_id）`}
            description={t`留空表示不过滤`}
            value={region}
            onChange={(event) => setRegion(event.currentTarget.value)}
          />
        ) : (
          <Text size="sm" c="text-secondary">
            {t`当前事件没有 region_id，不能按区服过滤`}
          </Text>
        )}

        <Button
          type="button"
          w="fit-content"
          loading={isCompiling}
          disabled={!selected || timeRange.start === "" || timeRange.end === ""}
          onClick={() => {
            void handleSubmit();
          }}
        >
          {t`生成 SQL`}
        </Button>

        {errorMessage && <Text size="sm">{errorMessage}</Text>}

        {result && (
          <Stack gap="sm">
            <Text fw={600}>{t`编译 SQL`}</Text>
            <Code block className={S.sql}>
              {result.sql}
            </Code>
            <Text size="sm" c="text-secondary">
              {result.note}
            </Text>
            <Text size="sm">{t`结果行数：${result.row_count}`}</Text>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
