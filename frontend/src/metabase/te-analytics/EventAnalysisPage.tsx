import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  type TeCell,
  type TeColumn,
  type TeEvent,
  type TeEventQueryRequest,
  type TeEventQueryResponse,
  type TeFilterOp,
  type TeMetric,
  type TeTimeGrain,
  useCompileTeEventQueryMutation,
  useListTeEventsQuery,
} from "metabase/api";
import {
  Box,
  Button,
  Code,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

import S from "./EventAnalysisPage.module.css";

const FILTER_OPS: TeFilterOp[] = ["=", "!=", ">", ">=", "<", "<=", "in"];

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

function isMetric(value: string | null): value is TeMetric {
  return value === "count" || value === "unique_users" || value === "sum";
}

function isTimeGrain(value: string | null): value is TeTimeGrain {
  return value === "day" || value === "hour" || value === "week";
}

function isFilterOp(value: string | null): value is TeFilterOp {
  return value != null && FILTER_OPS.some((op) => op === value);
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

function parseDatabaseId(raw: string): number | undefined {
  if (raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function columnLabel(column: TeColumn): string {
  if (column.summable) {
    return t`${column.display_name}（${column.name}），可分组、可过滤、可求和`;
  }
  if (column.groupable && column.filterable) {
    return t`${column.display_name}（${column.name}），可分组、可过滤`;
  }
  if (column.groupable) {
    return t`${column.display_name}（${column.name}），可分组`;
  }
  return t`${column.display_name}（${column.name}）`;
}

function cellText(value: TeCell): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

function ResultChart({
  columns,
  rows,
}: {
  columns: TeEventQueryResponse["columns"];
  rows: TeEventQueryResponse["rows"];
}) {
  const valueIndex = columns.findIndex(
    (column) =>
      column.base_type === "type/Integer" ||
      column.base_type === "type/Float" ||
      column.base_type === "type/BigInteger",
  );
  if (valueIndex < 0 || rows.length === 0) {
    return null;
  }
  const labelIndex = valueIndex === 0 ? Math.min(1, columns.length - 1) : 0;
  const amounts = rows.map((row) => {
    const value = row[valueIndex];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  const max = Math.max(...amounts, 1);

  return (
    <Stack gap="xs" aria-label={t`结果图`}>
      {rows.map((row, index) => {
        const amount = amounts[index] ?? 0;
        const width = `${Math.round((amount / max) * 100)}%`;
        return (
          <Group
            key={`${cellText(row[labelIndex] ?? null)}-${index}`}
            gap="sm"
            wrap="nowrap"
          >
            <Text size="sm" w={140}>
              {cellText(row[labelIndex] ?? null)}
            </Text>
            <Box flex={1} h={8} bg="background_page-secondary" bdrs="sm">
              <Box
                h={8}
                w={width}
                bg="background_surface-brand-strong"
                bdrs="sm"
              />
            </Box>
            <Text size="sm">{amount}</Text>
          </Group>
        );
      })}
    </Stack>
  );
}

function ResultPanel({ result }: { result: TeEventQueryResponse }) {
  return (
    <Stack gap="sm">
      <Title order={3}>{t`查询结果`}</Title>
      <Text size="sm" c="text-secondary">
        {result.execution === "stub"
          ? t`当前是编译预览，没有查询数仓。${result.note}`
          : result.note}
      </Text>
      {result.rows.length === 0 ? (
        <Text>{t`没有结果行`}</Text>
      ) : (
        <>
          <ResultChart columns={result.columns} rows={result.rows} />
          <Box component="table" className={S.table}>
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th key={column.name}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((value, cellIndex) => (
                    <td key={`${index}-${cellIndex}`}>{cellText(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </>
      )}
      <Text fw={600}>{t`编译 SQL`}</Text>
      <Code block className={S.sql}>
        {result.sql}
      </Code>
    </Stack>
  );
}

export function EventAnalysisPage() {
  const { data, isLoading, isError } = useListTeEventsQuery();
  const [compileQuery, { isLoading: isCompiling }] =
    useCompileTeEventQueryMutation();
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<TeMetric>("unique_users");
  const [measure, setMeasure] = useState<string | null>(null);
  const [timeGrain, setTimeGrain] = useState<TeTimeGrain>("day");
  const [timeRange, setTimeRange] = useState(defaultTimeRange);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [filterOp, setFilterOp] = useState<TeFilterOp>("=");
  const [filterValue, setFilterValue] = useState("");
  const [databaseIdRaw, setDatabaseIdRaw] = useState("");
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
        <Text role="alert">{t`无法加载事件列表`}</Text>
      </Box>
    );
  }

  const columns = selected?.available_columns ?? [];
  const groupable = columns.filter((column) => column.groupable);
  const filterable = columns.filter((column) => column.filterable);
  const summable = columns.filter((column) => column.summable);
  const metricOptions: Array<{ value: TeMetric; label: string }> = [
    { value: "unique_users", label: t`去重人数` },
    { value: "count", label: t`事件次数` },
    ...(summable.length > 0 ? [{ value: "sum" as const, label: t`求和` }] : []),
  ];

  const resetResult = () => {
    setResult(null);
    setErrorMessage(null);
  };

  const handleEventChange = (value: string | null) => {
    setEventKey(value);
    const next = events.find((event) => event.event_key === value);
    setGroupBy(next ? defaultGroupBy(next) : []);
    setFilterColumn(null);
    setFilterValue("");
    const nextSummable =
      next?.available_columns.filter((column) => column.summable) ?? [];
    if (metric === "sum" && nextSummable.length === 0) {
      setMetric("unique_users");
      setMeasure(null);
    } else if (metric === "sum") {
      setMeasure(nextSummable[0]?.name ?? null);
    }
    resetResult();
  };

  const handleSubmit = async () => {
    if (!selected) {
      return;
    }
    if (metric === "sum" && measure == null) {
      setResult(null);
      setErrorMessage(t`请选择要求和的数值列`);
      return;
    }
    if (databaseIdRaw.trim() !== "" && parseDatabaseId(databaseIdRaw) == null) {
      setResult(null);
      setErrorMessage(t`数据库 ID 需要是正整数`);
      return;
    }
    const databaseId = parseDatabaseId(databaseIdRaw);
    const request: TeEventQueryRequest = {
      event_key: selected.event_key,
      metric,
      time_range: timeRange,
      time_grain: timeGrain,
      group_by: groupBy,
      filters:
        filterColumn && filterValue.trim().length > 0
          ? [{ column: filterColumn, op: filterOp, value: filterValue.trim() }]
          : [],
      ...(metric === "sum" && measure ? { measure } : {}),
      ...(databaseId != null ? { database_id: databaseId } : {}),
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
    <Box p="xl">
      <Stack gap="md" mb="lg">
        <Title order={2}>{t`事件分析`}</Title>
        <Text c="text-secondary">
          {t`选择事件、指标和时间范围。分组和过滤只能使用该事件 available_columns 里允许的字段。`}
        </Text>
      </Stack>
      <div className={S.layout}>
        <Stack gap="md">
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
              {selected.note && (
                <Text size="sm" c="text-secondary">
                  {selected.note}
                </Text>
              )}
              <Text fw={600}>{t`可用字段`}</Text>
              {columns.map((column) => (
                <Text key={column.name} size="sm">
                  {columnLabel(column)}
                </Text>
              ))}
            </Stack>
          )}
          <Select<TeMetric>
            label={t`指标`}
            data={metricOptions}
            value={metric}
            onChange={(value) => {
              if (!isMetric(value)) {
                return;
              }
              setMetric(value);
              if (value === "sum") {
                setMeasure(summable[0]?.name ?? null);
              }
              resetResult();
            }}
            allowDeselect={false}
          />
          {metric === "sum" && (
            <Select<string | null>
              label={t`求和字段`}
              data={summable.map((column) => ({
                value: column.name,
                label: columnLabel(column),
              }))}
              value={measure}
              onChange={setMeasure}
              allowDeselect={false}
            />
          )}
          <Select<TeTimeGrain>
            label={t`时间粒度`}
            description={t`分组里包含时间列时，按这个粒度汇总。`}
            data={[
              { value: "day", label: t`按天` },
              { value: "hour", label: t`按小时` },
              { value: "week", label: t`按周` },
            ]}
            value={timeGrain}
            onChange={(value) => {
              if (isTimeGrain(value)) {
                setTimeGrain(value);
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
            description={t`只能选择当前事件允许分组的列。`}
            data={groupable.map((column) => ({
              value: column.name,
              label: columnLabel(column),
            }))}
            value={groupBy}
            onChange={setGroupBy}
            searchable
            clearable
          />
          <Select<string | null>
            label={t`过滤字段`}
            description={t`留空表示不追加过滤。时间范围始终生效。`}
            data={filterable.map((column) => ({
              value: column.name,
              label: columnLabel(column),
            }))}
            value={filterColumn}
            onChange={setFilterColumn}
            clearable
          />
          {filterColumn && (
            <Group grow>
              <Select<TeFilterOp>
                label={t`比较`}
                data={FILTER_OPS.map((op) => ({ value: op, label: op }))}
                value={filterOp}
                onChange={(value) => {
                  if (isFilterOp(value)) {
                    setFilterOp(value);
                  }
                }}
                allowDeselect={false}
              />
              <TextInput
                label={t`过滤值`}
                value={filterValue}
                onChange={(event) => setFilterValue(event.currentTarget.value)}
              />
            </Group>
          )}
          <TextInput
            label={t`数据库 ID`}
            description={t`可选。填写后请求会带上 database_id。当前执行器仍只编译 SQL。`}
            value={databaseIdRaw}
            onChange={(event) => setDatabaseIdRaw(event.currentTarget.value)}
          />
          <Button
            type="button"
            w="fit-content"
            loading={isCompiling}
            disabled={
              !selected || timeRange.start === "" || timeRange.end === ""
            }
            onClick={() => {
              void handleSubmit();
            }}
          >
            {t`运行查询`}
          </Button>
          {errorMessage && (
            <Text size="sm" role="alert" c="text-secondary">
              {errorMessage}
            </Text>
          )}
        </Stack>
        <Box>
          {result ? (
            <ResultPanel result={result} />
          ) : (
            <Text c="text-secondary">{t`运行后在这里看到 SQL 和结果表。`}</Text>
          )}
        </Box>
      </div>
    </Box>
  );
}
