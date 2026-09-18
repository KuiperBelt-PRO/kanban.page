import { a as deriveWeekStartsOn, c as formatWeekNumber, i as deriveWeekNumbering, l as resolveChartLocale, n as EN_US_LABELS, o as deriveWeekendDays, r as LocaleLabelKey, s as formatLabel, t as ChartLocale } from "./locale-3A5xWe8q.mjs";
import { z } from "zod";
//#region src/lib/validation/schemas.d.ts
declare const TaskSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  kind: z.ZodLiteral<"task">;
  endDate: z.ZodString;
  percentComplete: z.ZodDefault<z.ZodNumber>;
  id: z.ZodNumber;
  text: z.ZodString;
  startDate: z.ZodString;
  parent: z.ZodOptional<z.ZodNumber>;
  color: z.ZodOptional<z.ZodString>;
  readonly: z.ZodOptional<z.ZodBoolean>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"project">;
  endDate: z.ZodString;
  percentComplete: z.ZodDefault<z.ZodNumber>;
  open: z.ZodDefault<z.ZodBoolean>;
  id: z.ZodNumber;
  text: z.ZodString;
  startDate: z.ZodString;
  parent: z.ZodOptional<z.ZodNumber>;
  color: z.ZodOptional<z.ZodString>;
  readonly: z.ZodOptional<z.ZodBoolean>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"milestone">;
  id: z.ZodNumber;
  text: z.ZodString;
  startDate: z.ZodString;
  parent: z.ZodOptional<z.ZodNumber>;
  color: z.ZodOptional<z.ZodString>;
  readonly: z.ZodOptional<z.ZodBoolean>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>], "kind">;
declare const LinkSchema: z.ZodObject<{
  id: z.ZodNumber;
  source: z.ZodNumber;
  target: z.ZodNumber;
  type: z.ZodDefault<z.ZodEnum<{
    FS: "FS";
    SS: "SS";
    FF: "FF";
    SF: "SF";
  }>>;
  readonly: z.ZodOptional<z.ZodBoolean>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
/** @internal */
type ZodTaskInferred = z.infer<typeof TaskSchema>;
/** @internal */
type ZodLinkInferred = z.infer<typeof LinkSchema>;
/**
 * A task in the Gantt chart &mdash; discriminated by `kind` into leaf tasks,
 * summary projects, and milestones.
 *
 * @param TData - The type of the optional `data` property. Defaults to `never`,
 * which omits the `data` property from the type. Specify a concrete type to enable
 * compile-time-checked task data in both input and callback payloads.
 *
 * @example
 * ```ts
 * // Default: no `data` property
 * const task: Task = { id: 1, text: 'Build', startDate: '2026-01-01', endDate: '2026-01-03', kind: 'task' };
 *
 * // With typed data
 * interface TaskMeta { priority: number; label: string }
 * const typedTask: Task<TaskMeta> = {
 *   id: 1, text: 'Build', startDate: '2026-01-01', endDate: '2026-01-03',
 *   kind: 'task', data: { priority: 1, label: 'critical' }
 * };
 * ```
 */
type Task<TData = never> = {
  id: number;
  text: string;
  startDate: string;
  parent?: number | undefined;
  color?: string | undefined;
  readonly?: boolean | undefined;
  data?: unknown;
  kind: 'task';
  endDate: string;
  percentComplete: number;
} | {
  id: number;
  text: string;
  startDate: string;
  parent?: number | undefined;
  color?: string | undefined;
  readonly?: boolean | undefined;
  data?: unknown;
  kind: 'project';
  endDate: string;
  percentComplete: number;
  open: boolean;
} | {
  id: number;
  text: string;
  startDate: string;
  parent?: number | undefined;
  color?: string | undefined;
  readonly?: boolean | undefined;
  data?: unknown;
  kind: 'milestone';
} extends (infer _U) ? _U extends unknown ? Omit<_U, 'data'> & ([TData] extends [never] ? Record<never, never> : {
  data?: TData | undefined;
}) : never : never;
/**
 * A dependency link between two tasks.
 *
 * @param TData - The type of the optional `data` property. Defaults to `never`.
 */
type Link<TData = never> = {
  id: number;
  source: number;
  target: number;
  type: LinkType;
  readonly?: boolean | undefined;
} & ([TData] extends [never] ? Record<never, never> : {
  data?: TData | undefined;
});
/**
 * The complete input data for the chart.
 *
 * @param TTaskData - The type of the `data` property on tasks. Defaults to `never`.
 * @param TLinkData - The type of the `data` property on links. Defaults to `never`.
 */
type GanttInput<TTaskData = never, TLinkData = never> = {
  tasks: Task<TTaskData>[];
  links: Link<TLinkData>[];
};
/**
 * The raw input shape that consumers pass to {@link GanttChart.update}.
 *
 * Fields with defaults in the schema (e.g. `percentComplete`, `type`) remain optional here.
 *
 * @param TTaskData - The type of the `data` property on tasks. Defaults to `never`.
 * @param TLinkData - The type of the `data` property on links. Defaults to `never`.
 */
type GanttInputRaw<TTaskData = never, TLinkData = never> = {
  tasks: readonly ({
    id: number;
    text: string;
    startDate: string;
    parent?: number | undefined;
    color?: string | undefined;
    readonly?: boolean | undefined;
    data?: unknown;
    kind: 'task';
    endDate: string;
    percentComplete?: number | undefined;
  } | {
    id: number;
    text: string;
    startDate: string;
    parent?: number | undefined;
    color?: string | undefined;
    readonly?: boolean | undefined;
    data?: unknown;
    kind: 'project';
    endDate: string;
    percentComplete?: number | undefined;
    open?: boolean | undefined;
  } | {
    id: number;
    text: string;
    startDate: string;
    parent?: number | undefined;
    color?: string | undefined;
    readonly?: boolean | undefined;
    data?: unknown;
    kind: 'milestone';
  } extends (infer _RU) ? _RU extends unknown ? Omit<_RU, 'data'> & ([TTaskData] extends [never] ? Record<never, never> : {
    data?: TTaskData | undefined;
  }) : never : never)[];
  links?: readonly ({
    id: number;
    source: number;
    target: number;
    type?: LinkType | undefined;
    readonly?: boolean | undefined;
  } & ([TLinkData] extends [never] ? Record<never, never> : {
    data?: TLinkData | undefined;
  }))[];
};
/** Allowed dependency link type values: `'FS'`, `'SS'`, `'FF'`, or `'SF'`. */
type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
/** Allowed task kind values: `'task'`, `'project'`, or `'milestone'`. */
type TaskKind = 'task' | 'project' | 'milestone';
type SpecialDayKind = 'holiday' | 'custom';
type SpecialDay = {
  /** ISO date: YYYY-MM-DD */
  date: string;
  kind: SpecialDayKind;
  label?: string | undefined;
  className?: string | undefined;
};
//#endregion
//#region src/lib/timeline/scale.d.ts
type TimeScale = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
type ScaleConfig = {
  /** Pixel width of one column unit */
  columnWidth: number;
  /** Milliseconds per column unit */
  msPerColumn: number;
  headerFormat: TimeScale;
};
export declare const SCALE_CONFIGS: Record<TimeScale, ScaleConfig>;
//#endregion
//#region src/lib/domain/tree.d.ts
/**
 * A task node in the render tree, combining the flat {@link Task} input data
 * with computed hierarchy structure.
 *
 * Produced by {@link buildTaskTree}; consumed by virtualized row rendering
 * and the timeline layout engine.
 */
type TaskNode = Task<Record<string, unknown>> & {
  /** Array of child task nodes in the tree hierarchy. */
  children: TaskNode[];
  /** 0 = root */
  depth: number;
};
/**
 * Builds a typed tree from a flat task array.
 * Order of tasks[] is irrelevant — parents need not precede children.
 *
 * @param tasks - The flat array of tasks to convert into a tree.
 * @returns Root-level {@link TaskNode} instances with populated `children`.
 * @throws {GanttError} When a task references a `parent` id that does not exist,
 *         when a parent cycle is detected, or when a `parent` points to a
 *         milestone or leaf task.
 */
export declare function buildTaskTree(tasks: ZodTaskInferred[]): TaskNode[];
/**
 * Flattens a tree into a visible row list.
 * A node's children are included only when its id is in `expandedIds`.
 *
 * @param roots - The root-level {@link TaskNode} instances of the tree.
 * @param expandedIds - Set of task IDs whose children should be rendered.
 * @returns A depth-first flattened array of visible {@link TaskNode} items.
 */
export declare function flattenTree(roots: TaskNode[], expandedIds: ReadonlySet<number>): TaskNode[];
/**
 * Returns `true` when a node has children in the tree.
 *
 * @param node - The {@link TaskNode} to inspect.
 * @returns `true` if `node.children.length > 0`.
 */
export declare function isParent(node: TaskNode): boolean;
//#endregion
//#region src/lib/timeline/pixelMapper.d.ts
type PixelMapper = {
  /** Date → x pixel offset from viewport start */
  toX: (date: Date) => number;
  /** x pixel offset → Date */
  toDate: (x: number) => Date;
  /** Days → pixel width */
  durationDaysToWidth: (days: number) => number;
  /** Pixel width → days (float) */
  widthToDurationDays: (px: number) => number;
  /** The origin timestamp used for this mapper */
  originMs: number;
  /** Pixel width of one column unit */
  columnWidth: number;
};
/**
 * Creates a stateless pixel mapper for the given scale and viewport start.
 * All conversions are O(1) arithmetic — safe to call in tight loops.
 *
 * @param scale - The active {@link TimeScale}.
 * @param viewportStart - The leftmost date visible in the viewport.
 * @returns A {@link PixelMapper} configured for the given viewport.
 */
export declare function createPixelMapper(scale: TimeScale, viewportStart: Date): PixelMapper;
//#endregion
//#region src/lib/timeline/layoutEngine.d.ts
export declare const DENSITY: {
  readonly rowHeight: 44;
  readonly barHeight: 28;
  readonly milestoneSize: 20;
};
export declare const ROW_HEIGHT: 44;
export declare const BAR_HEIGHT: 28;
export declare const BAR_Y_OFFSET: number;
export declare const MILESTONE_SIZE: 20;
/** Half-width of a milestone diamond */
export declare const MILESTONE_HALF: number;
type BarLayout = {
  taskId: number;
  /** Left edge x in timeline coordinates */
  x: number;
  /** Top edge y in content coordinates */
  y: number;
  width: number;
  height: number;
  progressWidth: number;
  kind: 'task' | 'project' | 'milestone';
  rowIndex: number;
  /** Center x; identical to x + width/2 or x for milestones */
  centerX: number;
  centerY: number;
};
/**
 * Computes pixel-space layout for all visible task rows.
 * Returns a map keyed by task id for O(1) lookup during link routing.
 *
 * @param rows - The flattened, visible {@link TaskNode} rows.
 * @param mapper - The {@link PixelMapper} for coordinate conversion.
 * @returns A `Map` from task ID to its computed {@link BarLayout}.
 */
export declare function computeLayout(rows: TaskNode[], mapper: PixelMapper): Map<number, BarLayout>;
/**
 * Derives viewport bounds from task data with padding.
 *
 * @param tasks - The task nodes to derive bounds from.
 * @param paddingHours - Extra hours added before the earliest start and after the latest end. Defaults to `48`.
 * @returns A tuple `[start, end]` of UTC midnight `Date` instances.
 */
export declare function deriveViewport(tasks: TaskNode[], paddingHours?: number): [Date, Date];
//#endregion
//#region src/lib/domain/dependencies.d.ts
/**
 * Detects circular dependencies in the link graph using DFS tri-colour marking.
 *
 * @param tasks - The task list (used to build the vertex set).
 * @param links - The dependency links defining the directed edges.
 * @throws {GanttError} When a cycle is detected, with a human-readable cycle path.
 */
export declare function detectCycles(tasks: ZodTaskInferred[], links: ZodLinkInferred[]): void;
/**
 * Validates that every link references existing task IDs and that no
 * duplicate (source, target) pairs exist.
 *
 * @param tasks - The task list (used as the reference set of valid IDs).
 * @param links - The dependency links to validate.
 * @throws {GanttError} When any link references a non-existent source or target task,
 *         when a non-FS link connects to/from a milestone, or when duplicate
 *         (source, target) pairs exist.
 */
export declare function validateLinkRefs(tasks: ZodTaskInferred[], links: ZodLinkInferred[]): void;
//#endregion
//#region src/lib/domain/dateMath.d.ts
/**
 * Parses `YYYY-MM-DD` → UTC midnight `Date`.
 *
 * @param dateStr - An ISO-8601 date string in `YYYY-MM-DD` format.
 * @returns A `Date` representing UTC midnight of the given date.
 * @throws {Error} When `dateStr` does not represent a valid date.
 */
export declare function parseDate(dateStr: string): Date;
/**
 * Returns `date + n` days using exact millisecond arithmetic.
 *
 * @param date - The base date.
 * @param days - Number of days to add (may be negative).
 * @returns A new `Date` offset by the given number of days.
 */
export declare function addDays(date: Date, days: number): Date;
/**
 * Returns `date + n` hours using exact millisecond arithmetic.
 *
 * @param date - The base date.
 * @param hours - Number of hours to add (may be negative).
 * @returns A new `Date` offset by the given number of hours.
 */
export declare function addHours(date: Date, hours: number): Date;
/**
 * Difference in days (float). Positive when `b > a`.
 *
 * @param a - The earlier date.
 * @param b - The later date.
 * @returns The fractional number of days between the two dates.
 */
export declare function diffDays(a: Date, b: Date): number;
/**
 * Difference in hours (float). Positive when `b > a`.
 *
 * @param a - The earlier date.
 * @param b - The later date.
 * @returns The fractional number of hours between the two dates.
 */
export declare function diffHours(a: Date, b: Date): number;
//#endregion
//#region src/lib/rendering/linkRouter.d.ts
type Point = {
  x: number;
  y: number;
};
type RoutedLink = {
  linkId: number;
  sourceTaskId: number;
  targetTaskId: number;
  type: LinkType;
  /** Ordered vertices of the orthogonal polyline (source → target). */
  points: Point[];
};
/**
 * Computes orthogonal routing for all dependency links.
 * Links whose source or target is not in the layout map are skipped silently
 * (e.g. when the row is collapsed).
 *
 * @param links   - The dependency links to route.
 * @param layouts - A map from task ID to its computed {@link BarLayout}.
 * @returns An array of {@link RoutedLink} objects with computed vertex paths.
 */
export declare function routeLinks(links: ZodLinkInferred[], layouts: Map<number, BarLayout>): RoutedLink[];
//#endregion
//#region src/lib/vanilla/dom/gridColumns.d.ts
/**
 * Union of all field names that can appear on any {@link Task} variant.
 * Use when referencing task fields in grid column schemas that apply
 * across a heterogeneous set of task kinds.
 */
type TaskDataField = keyof Task | 'endDate' | 'percentComplete' | 'open';
type GridColumn = {
  id: string;
  header: string;
  width: string;
  align?: 'left' | 'center' | 'right';
  visible?: boolean;
  field?: TaskDataField;
  format?: (value: unknown, task: Task<Record<string, unknown>>, row: TaskNode, locale: ChartLocale) => string;
};
export declare const DEFAULT_GRID_COLUMNS: GridColumn[];
/**
 * Returns a localized default grid column schema.
 * Column headers use locale label overrides with `EN_US_LABELS` fallback.
 *
 * @param locale - The {@link ChartLocale} to derive column header labels from.
 * @returns An array of {@link GridColumn} objects.
 */
export declare function gridColumnDefaults(locale: ChartLocale): GridColumn[];
/**
 * Builds a CSS `grid-template-columns` value from a column schema.
 *
 * @param columns - The full column schema array (only visible columns are included).
 * @returns A space-separated CSS track list.
 */
export declare function gridTemplateColumns(columns: GridColumn[]): string;
/**
 * Filters a column schema to only visible columns.
 *
 * @param columns - The full column schema array.
 * @returns A new array containing only columns where `visible` is not `false`.
 */
export declare function visibleColumns(columns: GridColumn[]): GridColumn[];
export declare const GRID_COLUMN_FR_MIN_WIDTH = 120;
/**
 * Computes the minimum natural pixel width of a grid column schema.
 *
 * @param columns - The full column schema array.
 * @returns The sum of minimum widths: `px` columns sum directly, `fr` units contribute
 *          `GRID_COLUMN_FR_MIN_WIDTH` px each.
 */
export declare function gridNaturalWidth(columns: GridColumn[]): number;
//#endregion
//#region src/lib/vanilla/gantt-chart.d.ts
type OnTaskClick<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnTaskDoubleClick<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnTaskMove<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  newStartDate: Date;
  newEndDate: Date;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => boolean | Promise<boolean>;
type OnTaskResize<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  newDurationHours: number;
  newStartDate: Date;
  newEndDate: Date;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => boolean | Promise<boolean>;
type OnTaskAdd<TTaskData = never, TLinkData = never> = (payload: {
  parentTask: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => boolean | Promise<boolean>;
type OnLinkCreate<TTaskData = never, TLinkData = never> = (payload: {
  type: 'FS';
  sourceTask: Task<TTaskData>;
  targetTask: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => boolean | Promise<boolean>;
type OnLinkClick<TTaskData = never, TLinkData = never> = (payload: {
  link: Link<TLinkData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnLinkDblClick<TTaskData = never, TLinkData = never> = (payload: {
  link: Link<TLinkData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnProgressChange<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  newPercentComplete: number;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => boolean | Promise<boolean>;
type OnExpandCollapse<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnExpandCollapseAll<TTaskData = never, TLinkData = never> = (payload: {
  tasks: Task<TTaskData>[];
  instance: GanttInstance<TTaskData, TLinkData>;
}) => void | Promise<void>;
type OnTooltipText<TTaskData = never, TLinkData = never> = (payload: {
  task: Task<TTaskData>;
  instance: GanttInstance<TTaskData, TLinkData>;
}) => string | null;
type GanttCallbacks<TTaskData = never, TLinkData = never> = {
  onTaskClick?: OnTaskClick<TTaskData, TLinkData>;
  onTaskDoubleClick?: OnTaskDoubleClick<TTaskData, TLinkData>;
  onTaskMove?: OnTaskMove<TTaskData, TLinkData>;
  onTaskResize?: OnTaskResize<TTaskData, TLinkData>;
  onTaskAdd?: OnTaskAdd<TTaskData, TLinkData>;
  onLinkCreate?: OnLinkCreate<TTaskData, TLinkData>;
  onLinkClick?: OnLinkClick<TTaskData, TLinkData>;
  onLinkDblClick?: OnLinkDblClick<TTaskData, TLinkData>;
  onProgressChange?: OnProgressChange<TTaskData, TLinkData>;
  onExpandCollapse?: OnExpandCollapse<TTaskData, TLinkData>;
  onExpandCollapseAll?: OnExpandCollapseAll<TTaskData, TLinkData>;
  onTooltipText?: OnTooltipText<TTaskData, TLinkData>;
  onLeftPaneWidthChange?: (payload: {
    width: number;
    instance: GanttInstance<TTaskData, TLinkData>;
  }) => void | Promise<void>;
  onGridColumnsChange?: (payload: {
    columns: GridColumn[];
    instance: GanttInstance<TTaskData, TLinkData>;
  }) => void | Promise<void>;
};
type ThemeMode = 'light' | 'dark' | 'system';
type GanttOptions = {
  scale?: TimeScale;
  highlightLinkedDependenciesOnSelect?: boolean;
  linkCreationEnabled?: boolean;
  progressDragEnabled?: boolean;
  leftPaneWidth?: number;
  responsiveSplitPane?: boolean;
  mobileBreakpoint?: number;
  mobileLeftPaneMinWidth?: number;
  mobileLeftPaneMaxRatio?: number;
  timelineMinWidth?: number;
  height?: number;
  viewportStart?: Date;
  viewportEnd?: Date;
  locale?: ChartLocale | string;
  showWeekends?: boolean;
  weekendDays?: number[];
  specialDays?: SpecialDay[];
  gridColumns?: GridColumn[];
  theme?: ThemeMode;
  showAddTaskButton?: boolean;
  showTodayMarker?: boolean;
};
type GanttInstance<TTaskData = never, TLinkData = never> = {
  update: (input: GanttInputRaw<TTaskData, TLinkData>) => void;
  setOptions: (opts: Partial<GanttOptions>) => void;
  setCallbacks: (cbs: GanttCallbacks<TTaskData, TLinkData>) => void;
  select: (id: number | null, fireCallback?: boolean) => void;
  collapseAll: (fireCallback?: boolean) => void;
  expandAll: (fireCallback?: boolean) => void;
  getOpenStates: () => {
    id: number;
    open: boolean;
  }[];
  destroy: () => void;
};
/**
 * Progressive-enhancement Gantt chart component.
 * Validates input, builds a DOM tree, and renders a full interactive chart
 * inside the given container element.
 *
 * @param TTaskData - The type of the optional `data` property on tasks. Defaults to `never`.
 * @param TLinkData - The type of the optional `data` property on links. Defaults to `never`.
 *
 * @example
 * ```ts
 * const chart = new GanttChart(document.getElementById('chart')!, {
 *   locale: 'de-DE',
 *   theme: 'dark',
 * });
 * ```
 */
export declare class GanttChart<TTaskData = never, TLinkData = never> implements GanttInstance<TTaskData, TLinkData> {
  #private;
  /**
   * Constructs a new chart, builds the DOM, and wires internal event handling.
   * Data must be loaded via {@link update} before the chart renders.
   * Callbacks must be set via {@link setCallbacks} before user interactions are handled.
   *
   * @param container - The host `HTMLElement` the chart will be appended to.
   * @param opts - Configuration options.
   */
  constructor(container: HTMLElement, opts?: GanttOptions);
  /**
   * Sets or replaces the chart's user-facing callbacks.
   * Does not trigger a re-render.
   *
   * @param cbs - The {@link GanttCallbacks} to register.
   * @throws {GanttError} When the instance has been destroyed.
   */
  setCallbacks(cbs: GanttCallbacks<TTaskData, TLinkData>): void;
  /**
   * Replaces the full dataset and re-renders.
   *
   * @param newInput - The new {@link GanttInput} to apply.
   * @throws {GanttError} When the instance has been destroyed.
   */
  update(newInput: GanttInputRaw<TTaskData, TLinkData>): void;
  /**
   * Merges the supplied options into the current configuration and re-renders
   * only the panes affected by the changed options.
   *
   * @param opts - A partial {@link GanttOptions} object. Only the keys present
   *               in this parameter are updated; missing keys keep their
   *               previous values.
   * @throws {GanttError} When the instance has been destroyed.
   */
  setOptions(opts: Partial<GanttOptions>): void;
  /**
   * Programmatically selects or deselects a task.
   *
   * @param id - The task ID to select, or `null` to clear the selection.
   * @param fireCallback - Whether to fire the `onTaskClick` callback. Default `false`.
   * @throws {GanttError} When the instance has been destroyed.
   */
  select(id: number | null, fireCallback?: boolean): void;
  /**
   * Collapses all expandable groups in the task tree.
   *
   * @param fireCallback - Whether to fire the `onExpandCollapseAll` callback. Default `false`.
   * @throws {GanttError} When the instance has been destroyed.
   */
  collapseAll(fireCallback?: boolean): void;
  /**
   * Expands all expandable groups in the task tree.
   *
   * @param fireCallback - Whether to fire the `onExpandCollapseAll` callback. Default `false`.
   * @throws {GanttError} When the instance has been destroyed.
   */
  expandAll(fireCallback?: boolean): void;
  /**
   * Returns the current expand/collapse state of every expandable node
   * (project tasks that have children). The result is ordered by the
   * input task list order.
   *
   * @returns An array of `{id, open}` objects for expandable nodes only.
   * @throws {GanttError} When the instance has been destroyed.
   */
  getOpenStates(): {
    id: number;
    open: boolean;
  }[];
  /**
   * Removes the chart DOM and internal listeners, rendering the instance
   * unusable. Subsequent calls to any public method will throw.
   */
  destroy(): void;
}
//#endregion
//#region src/lib/errors.d.ts
type GanttErrorCode = 'PARENT_REFERENCE' | 'PARENT_CYCLE' | 'LINK_REFERENCE' | 'DEPENDENCY_CYCLE' | 'MILESTONE_LINK_TYPE' | 'DUPLICATE_LINK_PAIR' | 'INSTANCE_DESTROYED';
/**
 * Domain-specific error with a machine-readable {@link GanttErrorCode}.
 */
export declare class GanttError extends Error {
  readonly code: GanttErrorCode;
  /**
   * @param code - A machine-readable {@link GanttErrorCode} categorising the error.
   * @param message - A human-readable description.
   */
  constructor(code: GanttErrorCode, message: string);
}
//#endregion
export { type BarLayout, type ChartLocale, EN_US_LABELS, type GanttCallbacks, type GanttErrorCode, type GanttInput, type GanttInputRaw, type GanttInstance, type GanttOptions, type GridColumn, type Link, type LinkType, type LocaleLabelKey, type OnExpandCollapse, type OnExpandCollapseAll, type OnLinkClick, type OnLinkCreate, type OnLinkDblClick, type OnProgressChange, type OnTaskAdd, type OnTaskClick, type OnTaskDoubleClick, type OnTaskMove, type OnTaskResize, type OnTooltipText, type PixelMapper, type Point, type RoutedLink, type ScaleConfig, type SpecialDay, type SpecialDayKind, type Task, type TaskDataField, type TaskKind, type TaskNode, type ThemeMode, type TimeScale, deriveWeekNumbering, deriveWeekStartsOn, deriveWeekendDays, formatLabel, formatWeekNumber, resolveChartLocale };
//# sourceMappingURL=index.d.mts.map