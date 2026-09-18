import { z } from "zod";
//#region src/lib/errors.ts
/**
* Domain-specific error with a machine-readable {@link GanttErrorCode}.
*/
var GanttError = class extends Error {
	code;
	/**
	* @param code - A machine-readable {@link GanttErrorCode} categorising the error.
	* @param message - A human-readable description.
	*/
	constructor(code, message) {
		super(message);
		this.name = "GanttError";
		this.code = code;
	}
};
//#endregion
//#region src/lib/domain/tree.ts
function detectParentCycles(tasks) {
	const adj = /* @__PURE__ */ new Map();
	for (const task of tasks) adj.set(task.id, []);
	for (const task of tasks) if (task.parent !== void 0) {
		const parents = adj.get(task.parent);
		if (parents !== void 0) parents.push(task.id);
	}
	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = /* @__PURE__ */ new Map();
	const parent = /* @__PURE__ */ new Map();
	for (const id of adj.keys()) color.set(id, WHITE);
	const dfs = (u) => {
		color.set(u, GRAY);
		for (const v of adj.get(u) ?? []) {
			const vc = color.get(v) ?? WHITE;
			if (vc === GRAY) {
				const path = [v, u];
				let cur = u;
				while (cur !== v) {
					const p = parent.get(cur);
					if (p === void 0) break;
					path.push(p);
					cur = p;
				}
				throw new GanttError("PARENT_CYCLE", `Parent cycle detected: ${[...path].reverse().join(" -> ")}`);
			}
			if (vc === WHITE) {
				parent.set(v, u);
				dfs(v);
			}
		}
		color.set(u, BLACK);
	};
	for (const id of adj.keys()) if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
}
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
function buildTaskTree(tasks) {
	const map = /* @__PURE__ */ new Map();
	const roots = [];
	for (const task of tasks) if (task.parent !== void 0) {
		const parentTask = tasks.find((t) => t.id === task.parent);
		if (parentTask !== void 0 && (parentTask.kind === "milestone" || parentTask.kind === "task")) throw new GanttError("PARENT_REFERENCE", `Task id=${task.id} cannot have parent id=${task.parent} of kind '${parentTask.kind}'`);
	}
	for (const task of tasks) map.set(task.id, {
		...task,
		children: [],
		depth: 0
	});
	detectParentCycles(tasks);
	for (const task of tasks) {
		const node = map.get(task.id);
		if (node === void 0) continue;
		if (task.parent !== void 0) {
			const parent = map.get(task.parent);
			if (parent === void 0) throw new GanttError("PARENT_REFERENCE", `Task id=${task.id} references non-existent parent id=${task.parent}`);
			parent.children.push(node);
		} else roots.push(node);
	}
	(function setDepths(nodes, d) {
		for (const n of nodes) {
			n.depth = d;
			setDepths(n.children, d + 1);
		}
	})(roots, 0);
	return roots;
}
/**
* Flattens a tree into a visible row list.
* A node's children are included only when its id is in `expandedIds`.
*
* @param roots - The root-level {@link TaskNode} instances of the tree.
* @param expandedIds - Set of task IDs whose children should be rendered.
* @returns A depth-first flattened array of visible {@link TaskNode} items.
*/
function flattenTree(roots, expandedIds) {
	const rows = [];
	function walk(node) {
		rows.push(node);
		if (node.children.length > 0 && expandedIds.has(node.id)) for (const child of node.children) walk(child);
	}
	for (const root of roots) walk(root);
	return rows;
}
/**
* Returns `true` when a node has children in the tree.
*
* @param node - The {@link TaskNode} to inspect.
* @returns `true` if `node.children.length > 0`.
*/
function isParent(node) {
	return node.children.length > 0;
}
//#endregion
//#region src/lib/domain/dependencies.ts
/**
* Detects circular dependencies in the link graph using DFS tri-colour marking.
*
* @param tasks - The task list (used to build the vertex set).
* @param links - The dependency links defining the directed edges.
* @throws {GanttError} When a cycle is detected, with a human-readable cycle path.
*/
function detectCycles(tasks, links) {
	const adj = /* @__PURE__ */ new Map();
	for (const task of tasks) adj.set(task.id, []);
	for (const link of links) {
		const neighbors = adj.get(link.source);
		if (neighbors !== void 0) neighbors.push(link.target);
	}
	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = /* @__PURE__ */ new Map();
	const parent = /* @__PURE__ */ new Map();
	for (const id of adj.keys()) color.set(id, WHITE);
	const dfs = (u) => {
		color.set(u, GRAY);
		for (const v of adj.get(u) ?? []) {
			const vc = color.get(v) ?? WHITE;
			if (vc === GRAY) {
				const path = [v, u];
				let cur = u;
				while (cur !== v) {
					const p = parent.get(cur);
					if (p === void 0) break;
					path.push(p);
					cur = p;
				}
				throw new GanttError("DEPENDENCY_CYCLE", `Circular dependency detected: ${[...path].reverse().join(" -> ")}`);
			}
			if (vc === WHITE) {
				parent.set(v, u);
				dfs(v);
			}
		}
		color.set(u, BLACK);
	};
	for (const id of adj.keys()) if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
}
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
function validateLinkRefs(tasks, links) {
	const ids = new Set(tasks.map((t) => t.id));
	const taskById = new Map(tasks.map((t) => [t.id, t]));
	const pairKeys = /* @__PURE__ */ new Set();
	for (const link of links) {
		if (!ids.has(link.source)) throw new GanttError("LINK_REFERENCE", `Link id=${link.id}: source=${link.source} not found`);
		if (!ids.has(link.target)) throw new GanttError("LINK_REFERENCE", `Link id=${link.id}: target=${link.target} not found`);
		const pairKey = `${link.source}:${link.target}`;
		if (pairKeys.has(pairKey)) throw new GanttError("DUPLICATE_LINK_PAIR", `Link id=${link.id}: duplicate pair source=${link.source} target=${link.target}`);
		pairKeys.add(pairKey);
		if (link.type !== "FS") {
			const sourceTask = taskById.get(link.source);
			const targetTask = taskById.get(link.target);
			if (sourceTask?.kind === "milestone" || targetTask?.kind === "milestone") throw new GanttError("MILESTONE_LINK_TYPE", `Link id=${link.id}: non-FS type '${link.type}' not allowed when connected to a milestone`);
		}
	}
}
//#endregion
//#region src/lib/locale.ts
const WEEK_START_REGION = {
	US: 0,
	CA: 0,
	MX: 0,
	JP: 0,
	PH: 0,
	BR: 0,
	CO: 0,
	VE: 0,
	PE: 0,
	EC: 0,
	CL: 0,
	AR: 0,
	UY: 0,
	PY: 0,
	BO: 0,
	GT: 0,
	HN: 0,
	SV: 0,
	NI: 0,
	CR: 0,
	PA: 0,
	DO: 0,
	PR: 0,
	IL: 0,
	SA: 0,
	KW: 0,
	QA: 0,
	BH: 0,
	OM: 0,
	YE: 0,
	MA: 0,
	DZ: 0,
	TN: 0,
	LY: 0,
	EG: 0,
	IQ: 0,
	JO: 0,
	SD: 0,
	SY: 0,
	LB: 0,
	PS: 0,
	AE: 6,
	IR: 6,
	AF: 6,
	DJ: 6,
	SO: 6
};
const WEEK_START_LANG = {
	ar: 6,
	fa: 6
};
const WEEK_NUMBERING_REGION = {
	US: "us",
	CA: "us",
	MX: "us",
	BR: "us",
	AR: "us",
	CL: "us",
	CO: "us",
	PE: "us",
	JP: "us",
	KR: "us",
	CN: "us",
	TW: "us",
	IN: "us",
	PH: "us",
	IL: "us",
	SA: "us",
	AE: "us",
	IR: "us",
	ZA: "us",
	AU: "us",
	NZ: "us"
};
const WEEKEND_REGION = {
	AE: [5, 6],
	AF: [4, 5],
	DZ: [5, 6],
	BH: [5, 6],
	BD: [5, 6],
	EG: [5, 6],
	IQ: [5, 6],
	IL: [5, 6],
	JO: [5, 6],
	KW: [5, 6],
	LY: [5, 6],
	MV: [5, 6],
	MR: [5, 6],
	MA: [5, 6],
	OM: [5, 6],
	PK: [5, 6],
	PS: [5, 6],
	QA: [5, 6],
	SA: [5, 6],
	SD: [5, 6],
	SY: [5, 6],
	TN: [5, 6],
	YE: [5, 6],
	BN: [5, 0],
	IN: [0],
	UG: [0],
	NP: [6],
	IR: [5],
	DJ: [4, 5],
	SO: [5],
	MY: [5, 0]
};
const EN_US_LABELS = {
	ariaTask: "Task {0}",
	ariaMilestone: "Milestone {0}",
	addSubtaskTitle: "Add subtask",
	expandAllTitle: "Expand all",
	collapseAllTitle: "Collapse all",
	columnTaskName: "Task name",
	columnStartDate: "Start",
	columnEndDate: "End",
	columnDuration: "Duration",
	columnQuarter: "Q"
};
function tryGetWeekInfo(code) {
	try {
		if (typeof Intl !== "undefined" && typeof Intl.Locale === "function") {
			const locale = new Intl.Locale(code);
			const fn = locale.getWeekInfo;
			if (typeof fn === "function") return fn.call(locale);
		}
	} catch {}
}
/**
* Derives the first day of week (0=Sun, 1=Mon, 6=Sat) from a BCP 47 code.
* Uses `Intl.Locale.getWeekInfo()` where available (Chromium, Safari 15.4+),
* with a CLDR-based fallback table for Firefox and older runtimes.
*
* @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
* @returns The first day of the week: `0` (Sunday), `1` (Monday), or `6` (Saturday).
*/
function deriveWeekStartsOn(code) {
	const primary = code.split("-")[0]?.toLowerCase() ?? "en";
	const region = code.split("-")[1]?.toUpperCase();
	if (region !== void 0) {
		const fromRegion = WEEK_START_REGION[region];
		if (fromRegion !== void 0) return fromRegion;
	}
	const fromLang = WEEK_START_LANG[primary];
	if (fromLang !== void 0) return fromLang;
	const info = tryGetWeekInfo(code);
	if (info !== void 0) {
		const day = info.firstDay;
		return day === 7 ? 0 : day;
	}
	return 1;
}
/**
* Derives the week numbering scheme from a BCP 47 code.
* Europe and ISO-aligned regions default to `'iso'`; Americas and others to `'us'`.
*
* @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
* @returns The week numbering scheme: `'iso'`, `'us'`, or `'simple'`.
*/
function deriveWeekNumbering(code) {
	const region = code.split("-")[1]?.toUpperCase();
	if (region !== void 0) {
		const fromRegion = WEEK_NUMBERING_REGION[region];
		if (fromRegion !== void 0) return fromRegion;
		if (region in WEEK_START_REGION) return "us";
	}
	const info = tryGetWeekInfo(code);
	if (info !== void 0) {
		if (info.minimalDays >= 4 && info.firstDay === 1) return "iso";
		return "us";
	}
	return "iso";
}
/**
* Derives weekend days (0=Sun … 6=Sat) from a BCP 47 code.
* Uses `Intl.Locale.getWeekInfo()` where available, with a CLDR-based fallback table.
*
* @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
* @returns An array of weekend day indices (sorted ascending).
*/
function deriveWeekendDays(code) {
	const region = code.split("-")[1]?.toUpperCase();
	if (region !== void 0) {
		const fromRegion = WEEKEND_REGION[region];
		if (fromRegion !== void 0) {
			const days = [...fromRegion];
			days.sort((a, b) => a - b);
			return days;
		}
	}
	const info = tryGetWeekInfo(code);
	if (info !== void 0) {
		const days = info.weekend.map((d) => d === 7 ? 0 : d);
		days.sort((a, b) => a - b);
		return days;
	}
	return [0, 6];
}
/**
* Resolves a {@link ChartLocale} from either a full `ChartLocale` object or a BCP 47 string.
* When given a string, derives `weekStartsOn`, `weekNumbering`, and `weekendDays` from CLDR conventions.
*
* @param raw - A {@link ChartLocale} object, a BCP 47 language tag string, or `undefined`.
* @returns A fully resolved {@link ChartLocale} with defaults applied.
*/
function resolveChartLocale(raw) {
	if (raw === void 0) return {
		code: "en",
		labels: EN_US_LABELS,
		weekStartsOn: 0,
		weekNumbering: "iso",
		weekendDays: [0, 6]
	};
	if (typeof raw !== "string") {
		const locale = {
			code: raw.code,
			weekStartsOn: raw.weekStartsOn ?? deriveWeekStartsOn(raw.code),
			weekNumbering: raw.weekNumbering ?? deriveWeekNumbering(raw.code),
			weekendDays: raw.weekendDays ?? deriveWeekendDays(raw.code)
		};
		if (raw.labels !== void 0) locale.labels = raw.labels;
		return locale;
	}
	const code = raw;
	return {
		code,
		weekStartsOn: deriveWeekStartsOn(code),
		weekNumbering: deriveWeekNumbering(code),
		weekendDays: deriveWeekendDays(code)
	};
}
function isoWeek(date) {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
function usWeek(date) {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 864e5);
	const jan1Dow = yearStart.getUTCDay();
	const weekStartDayOfYear = jan1Dow === 0 ? 0 : -jan1Dow;
	if (dayOfYear < weekStartDayOfYear) return 0;
	return Math.floor((dayOfYear - weekStartDayOfYear) / 7) + 1;
}
function simpleWeek(date) {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 864e5);
	return Math.ceil((dayOfYear + 1) / 7);
}
/**
* Formats a week number according to the specified scheme.
*
* - `'iso'`: ISO 8601 (week 1 contains the first Thursday; Monday start).
* - `'us'`: Week 1 contains January 1; Sunday start.
* - `'simple'`: `Math.ceil(dayOfYear / 7)`.
*
* @param date - The date to compute the week number for.
* @param scheme - The week numbering scheme: `'iso'`, `'us'`, or `'simple'`.
* @returns The week number as a positive integer.
*/
function formatWeekNumber(date, scheme) {
	switch (scheme) {
		case "iso": return isoWeek(date);
		case "us": return usWeek(date);
		case "simple": return simpleWeek(date);
	}
}
/**
* Formats a label template by replacing `{0}` with the given argument.
*
* @param template - The template string containing `{0}` as placeholder.
* @param arg - The value to substitute for `{0}`.
* @returns The formatted string with the placeholder replaced.
*/
function formatLabel(template, arg) {
	return template.replaceAll("{0}", arg);
}
//#endregion
//#region src/lib/domain/dateMath.ts
/**
* Parses `YYYY-MM-DD` → UTC midnight `Date`.
*
* @param dateStr - An ISO-8601 date string in `YYYY-MM-DD` format.
* @returns A `Date` representing UTC midnight of the given date.
* @throws {Error} When `dateStr` does not represent a valid date.
*/
function parseDate(dateStr) {
	const d = /* @__PURE__ */ new Date(`${dateStr}T00:00:00.000Z`);
	if (isNaN(d.getTime())) throw new Error(`Invalid date: "${dateStr}"`);
	return d;
}
/**
* Returns `date + n` days using exact millisecond arithmetic.
*
* @param date - The base date.
* @param days - Number of days to add (may be negative).
* @returns A new `Date` offset by the given number of days.
*/
function addDays(date, days) {
	return new Date(date.getTime() + days * 864e5);
}
/**
* Returns `date + n` hours using exact millisecond arithmetic.
*
* @param date - The base date.
* @param hours - Number of hours to add (may be negative).
* @returns A new `Date` offset by the given number of hours.
*/
function addHours(date, hours) {
	return new Date(date.getTime() + hours * 36e5);
}
/**
* Difference in days (float). Positive when `b > a`.
*
* @param a - The earlier date.
* @param b - The later date.
* @returns The fractional number of days between the two dates.
*/
function diffDays(a, b) {
	return (b.getTime() - a.getTime()) / 864e5;
}
/**
* Difference in hours (float). Positive when `b > a`.
*
* @param a - The earlier date.
* @param b - The later date.
* @returns The fractional number of hours between the two dates.
*/
function diffHours(a, b) {
	return (b.getTime() - a.getTime()) / 36e5;
}
/**
* Returns the UTC start-of-day for the given date.
*
* @param date - Any `Date`.
* @returns A new `Date` set to UTC midnight of the same calendar date.
*/
function startOfDay(date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function resolveQuarterLabel(locale) {
	if (locale.labels?.columnQuarter !== void 0) return locale.labels.columnQuarter;
	return EN_US_LABELS.columnQuarter;
}
/**
* Formats a `Date` for the time-header label given the active scale.
*
* @param date - The date to format.
* @param scale - The active {@link TimeScale} determining the label granularity.
* @param locale - The {@link ChartLocale} used for formatting.
* @returns A human-readable header label string.
*/
function formatHeaderLabel(date, scale, locale) {
	const { code, weekNumbering: weekNumScheme = "iso" } = locale;
	switch (scale) {
		case "hour": return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
		case "day": {
			const day = date.toLocaleDateString(code, {
				weekday: "short",
				timeZone: "UTC"
			});
			return `${date.getUTCDate()} ${day}`;
		}
		case "week": return `W${formatWeekNumber(date, weekNumScheme)}`;
		case "month": return date.toLocaleDateString(code, {
			month: "short",
			year: "numeric",
			timeZone: "UTC"
		});
		case "quarter": return `${resolveQuarterLabel(locale)}${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
		case "year": return `${date.getUTCFullYear()}`;
	}
}
/**
* Returns the upper-level (month/year) label for a given scale column.
* Used in the top header row of the timeline.
*
* @param date - The date to format.
* @param scale - The active {@link TimeScale}. Determines how the upper label is computed.
* @param locale - The {@link ChartLocale} used for formatting.
* @returns A human-readable upper-level header label string.
*/
function formatUpperLabel(date, scale, locale) {
	const { code } = locale;
	switch (scale) {
		case "hour": return date.toLocaleDateString(code, {
			month: "long",
			day: "numeric",
			year: "numeric",
			timeZone: "UTC"
		});
		case "day":
		case "week": return date.toLocaleDateString(code, {
			month: "long",
			year: "numeric",
			timeZone: "UTC"
		});
		case "month": return `${date.getUTCFullYear()}`;
		case "quarter": return `${date.getUTCFullYear()}`;
		case "year": return `${date.getUTCFullYear()}`;
	}
}
/**
* Returns the number of days in an inclusive range from `start` to `end`.
*
* @param start - The start date.
* @param end - The end date.
* @returns The number of days, inclusive.
*/
function getRangeDays(start, end) {
	return Math.round(diffDays(start, end)) + 1;
}
/**
* Formats a `YYYY-MM-DD` string for display in the grid.
*
* @param dateStr - An ISO-8601 date string in `YYYY-MM-DD` format.
* @param locale - The {@link ChartLocale} used for locale-aware formatting.
* @returns A locale-formatted date string.
*/
function formatDisplayDate(dateStr, locale) {
	return parseDate(dateStr).toLocaleDateString(locale.code, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone: "UTC"
	});
}
//#endregion
//#region src/lib/timeline/scale.ts
const H = 36e5;
const D = 864e5;
const SCALE_CONFIGS = {
	hour: {
		columnWidth: 60,
		msPerColumn: H,
		headerFormat: "hour"
	},
	day: {
		columnWidth: 72,
		msPerColumn: D,
		headerFormat: "day"
	},
	week: {
		columnWidth: 120,
		msPerColumn: 7 * D,
		headerFormat: "week"
	},
	month: {
		columnWidth: 160,
		msPerColumn: 30 * D,
		headerFormat: "month"
	},
	quarter: {
		columnWidth: 220,
		msPerColumn: 91 * D,
		headerFormat: "quarter"
	},
	year: {
		columnWidth: 280,
		msPerColumn: 365 * D,
		headerFormat: "year"
	}
};
/**
* Snaps a date to the column boundary for the provided scale.
* All operations use UTC semantics.
* The week boundary respects the optional `weekStartsOn` override (0=Sun, 1=Mon, 6=Sat).
*
* @param date - The date to snap.
* @param scale - The target {@link TimeScale}.
* @param weekStartsOn - First day of the week (`0`-Sun, `1`-Mon, `6`-Sat). Defaults to `1` (Monday).
* @returns A new `Date` snapped to the column boundary.
*/
function snapToScaleBoundary(date, scale, weekStartsOn = 1) {
	switch (scale) {
		case "hour": return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
		case "day": return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
		case "week": {
			const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
			const offset = ((d.getUTCDay() - weekStartsOn) % 7 + 7) % 7;
			d.setUTCDate(d.getUTCDate() - offset);
			return d;
		}
		case "month": return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
		case "quarter": {
			const month = date.getUTCMonth();
			const quarterStartMonth = Math.floor(month / 3) * 3;
			return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
		}
		case "year": return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	}
}
/**
* Returns the next column boundary from a boundary-aligned date.
* Month/quarter/year use true calendar stepping (not fixed-day approximations).
*
* @param date - A boundary-aligned date.
* @param scale - The target {@link TimeScale}.
* @returns The next boundary date.
*/
function nextScaleBoundary(date, scale) {
	switch (scale) {
		case "hour": return new Date(date.getTime() + H);
		case "day": return new Date(date.getTime() + D);
		case "week": return new Date(date.getTime() + 7 * D);
		case "month": return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
		case "quarter": return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 3, 1));
		case "year": return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
	}
}
/**
* Rounds a date up to the end boundary of the containing scale bucket.
* If the date is already on a boundary, it is returned unchanged.
*
* @param date - The date to round.
* @param scale - The target {@link TimeScale}.
* @param weekStartsOn - First day of the week (`0`-Sun, `1`-Mon, `6`-Sat). Defaults to `1` (Monday).
* @returns A boundary-aligned date at or after the input.
*/
function ceilToScaleBoundary(date, scale, weekStartsOn = 1) {
	const start = snapToScaleBoundary(date, scale, weekStartsOn);
	if (start.getTime() === date.getTime()) return start;
	return nextScaleBoundary(start, scale);
}
//#endregion
//#region src/lib/timeline/pixelMapper.ts
/**
* Creates a stateless pixel mapper for the given scale and viewport start.
* All conversions are O(1) arithmetic — safe to call in tight loops.
*
* @param scale - The active {@link TimeScale}.
* @param viewportStart - The leftmost date visible in the viewport.
* @returns A {@link PixelMapper} configured for the given viewport.
*/
function createPixelMapper(scale, viewportStart) {
	const { columnWidth, msPerColumn } = SCALE_CONFIGS[scale];
	const originMs = viewportStart.getTime();
	const pxPerMs = columnWidth / msPerColumn;
	const msPerPx = msPerColumn / columnWidth;
	const msPerDay = 864e5;
	return {
		originMs,
		columnWidth,
		toX(date) {
			return (date.getTime() - originMs) * pxPerMs;
		},
		toDate(x) {
			return new Date(originMs + x * msPerPx);
		},
		durationDaysToWidth(days) {
			return days * msPerDay * pxPerMs;
		},
		widthToDurationDays(px) {
			return px * msPerPx / msPerDay;
		}
	};
}
//#endregion
//#region src/lib/timeline/layoutEngine.ts
const DENSITY = {
	rowHeight: 44,
	barHeight: 28,
	milestoneSize: 20
};
const ROW_HEIGHT = DENSITY.rowHeight;
const BAR_HEIGHT = DENSITY.barHeight;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const MILESTONE_SIZE = DENSITY.milestoneSize;
/** Half-width of a milestone diamond */
const MILESTONE_HALF = MILESTONE_SIZE / 2;
/**
* Computes pixel-space layout for all visible task rows.
* Returns a map keyed by task id for O(1) lookup during link routing.
*
* @param rows - The flattened, visible {@link TaskNode} rows.
* @param mapper - The {@link PixelMapper} for coordinate conversion.
* @returns A `Map` from task ID to its computed {@link BarLayout}.
*/
function computeLayout(rows, mapper) {
	const result = /* @__PURE__ */ new Map();
	for (let i = 0; i < rows.length; i++) {
		const task = rows[i];
		if (task === void 0) continue;
		const start = parseDate(task.startDate);
		const x = mapper.toX(start);
		const y = i * ROW_HEIGHT + BAR_Y_OFFSET;
		const centerY = i * ROW_HEIGHT + ROW_HEIGHT / 2;
		if (task.kind === "milestone") {
			result.set(task.id, {
				taskId: task.id,
				x,
				y,
				width: 0,
				height: BAR_HEIGHT,
				progressWidth: 0,
				kind: "milestone",
				rowIndex: i,
				centerX: x,
				centerY
			});
			continue;
		}
		const days = getRangeDays(start, parseDate(task.endDate));
		const width = Math.max(mapper.durationDaysToWidth(days), 4);
		const progressWidth = width * Math.min(1, Math.max(0, (task.percentComplete ?? 0) / 100));
		result.set(task.id, {
			taskId: task.id,
			x,
			y,
			width,
			height: BAR_HEIGHT,
			progressWidth,
			kind: task.kind,
			rowIndex: i,
			centerX: x + width / 2,
			centerY
		});
	}
	return result;
}
/**
* Computes the total pixel height of all rows.
*
* @param rowCount - The number of visible rows.
* @returns The total pixel height (`rowCount * ROW_HEIGHT`).
*/
function totalContentHeight(rowCount) {
	return rowCount * ROW_HEIGHT;
}
/**
* Derives viewport bounds from task data with padding.
*
* @param tasks - The task nodes to derive bounds from.
* @param paddingHours - Extra hours added before the earliest start and after the latest end. Defaults to `48`.
* @returns A tuple `[start, end]` of UTC midnight `Date` instances.
*/
function deriveViewport(tasks, paddingHours = 48) {
	if (tasks.length === 0) {
		const now = /* @__PURE__ */ new Date();
		return [now, addHours(now, 720)];
	}
	let minMs = Infinity;
	let maxMs = -Infinity;
	for (const task of tasks) {
		const start = parseDate(task.startDate);
		if (start.getTime() < minMs) minMs = start.getTime();
		if (task.kind !== "milestone") {
			const end = parseDate(task.endDate);
			if (end.getTime() > maxMs) maxMs = end.getTime();
		} else if (start.getTime() > maxMs) maxMs = start.getTime();
	}
	return [addHours(new Date(minMs), -paddingHours), addHours(new Date(maxMs), paddingHours)];
}
//#endregion
//#region src/lib/rendering/linkRouter.ts
/** px gap before/after bar for routing clearance and arrow approach */
const TURN_MARGIN = 24;
/** px vertical offset below the bar row for same-row loop detours */
const SAME_ROW_DETOUR = 24;
/** Segments shorter than this (px) are collapsed before stroking */
const STUB_THRESHOLD = 2;
/**
* Removes consecutive points whose Euclidean distance is below {@link STUB_THRESHOLD}.
* The first point is always kept.  This prevents near‑zero‑length segments from
* appearing as visible stubs near the arrowhead.
*
* @param points - The ordered vertex list.
* @returns A filtered copy, guaranteed to contain at least the first point.
*/
function collapseStubs(points) {
	const out = [];
	for (const pt of points) {
		const last = out.at(-1);
		if (last === void 0 || Math.hypot(pt.x - last.x, pt.y - last.y) >= STUB_THRESHOLD) out.push(pt);
	}
	return out;
}
/**
* True when the dependency arrow enters the target on its **left** edge (FS, SS).
* False when the arrow enters on the target's **right** edge (FF, SF).
*
* The arrowhead uses SVG `orient="auto"` so it rotates to match the direction
* of the **last** path segment. Therefore:
*
*   - Left-entry  → last segment must travel **RIGHT**   (penultimate.x < tx).
*   - Right-entry → last segment must travel **LEFT**    (penultimate.x > tx).
*
* @param type - The link type.
* @returns `true` for FS / SS, `false` for FF / SF.
*/
function isLeftEntry(type) {
	return type === "FS" || type === "SS";
}
/**
* True when the link exits the source bar on its **right** edge (FS, FF).
* False when it exits on the **left** edge (SS, SF).
*
* The first step after the source anchor should move **away** from the bar,
* **not** into it.  This means:
*
*   - Exit‑right → first horizontal segment goes RIGHT  (+TURN_MARGIN).
*   - Exit‑left  → first horizontal segment goes LEFT   (-TURN_MARGIN).
*
* @param type - The link type.
* @returns `true` for FS / FF, `false` for SS / SF.
*/
function isExitRight(type) {
	return type === "FS" || type === "FF";
}
/**
* Computes anchor points for the given link type.
*
* | Type | Source anchor (`sx`)        | Target anchor (`tx`)          |
* |------|-----------------------------|-------------------------------|
* | FS   | right edge of source        | left edge of target           |
* | SS   | left edge of source         | left edge of target           |
* | FF   | right edge of source        | right edge of target          |
* | SF   | left edge of source         | right edge of target          |
*
* Milestone offsets are applied automatically: ± {@link MILESTONE_HALF} replaces
* ± width for zero‑width milestones.
*
* @param type - The link type determining start/end anchor points.
* @param src  - The source bar layout.
* @param tgt  - The target bar layout.
* @returns Anchor x coordinates `{sx, tx}`.
* @throws {Error} if the link type is not handled (exhaustiveness guard).
*/
function getAnchors(type, src, tgt) {
	const srcRight = src.kind === "milestone" ? src.x + MILESTONE_HALF : src.x + src.width;
	const srcLeft = src.kind === "milestone" ? src.x - MILESTONE_HALF : src.x;
	const tgtRight = tgt.kind === "milestone" ? tgt.x + MILESTONE_HALF : tgt.x + tgt.width;
	const tgtLeft = tgt.kind === "milestone" ? tgt.x - MILESTONE_HALF : tgt.x;
	switch (type) {
		case "FS": return {
			sx: srcRight,
			tx: tgtLeft
		};
		case "SS": return {
			sx: srcLeft,
			tx: tgtLeft
		};
		case "FF": return {
			sx: srcRight,
			tx: tgtRight
		};
		case "SF": return {
			sx: srcLeft,
			tx: tgtRight
		};
		default: throw new Error(`Unhandled link type: ${String(type)}`);
	}
}
/**
* Routes a link whose source and target rows are within 1 px of each other.
*
* **Direct‑line optimisation**
* A plain horizontal segment is only used when it is non‑degenerate (`sx ≠ tx`)
* AND the arrowhead direction is visually correct:
*
* | Entry side | Condition  | Arrow direction |
* |-----------|-----------|----------------|
* | left      | `sx < tx` | → RIGHT ✓       |
* | right     | `sx > tx` | ← LEFT ✓        |
*
* Otherwise a 6‑vertex detour is drawn so that the last segment approaches
* the target from the correct side. By default the detour goes **below** the
* bars; pass `above = true` when headroom is insufficient below.
*
* @param sx - Source anchor x.
* @param sy - Source row center y.
* @param tx - Target anchor x.
* @param ty - Target row center y.
* @param leftEntry - Whether the link enters the target on its left edge.
* @param exitRight - Whether the link exits the source on its right edge.
* @param above - Route the detour above the bar row instead of below (default `false`).
* @returns An ordered array of {@link Point} vertices.
*/
function routeSameRow(sx, sy, tx, ty, leftEntry, exitRight, above = false) {
	if (Math.abs(sx - tx) >= STUB_THRESHOLD) {
		if (leftEntry && sx < tx || !leftEntry && sx > tx) return [{
			x: sx,
			y: sy
		}, {
			x: tx,
			y: ty
		}];
	}
	const exitDir = exitRight ? TURN_MARGIN : -24;
	const detourY = sy + (above ? -24 : SAME_ROW_DETOUR);
	const approachX = leftEntry ? tx - TURN_MARGIN : tx + TURN_MARGIN;
	return [
		{
			x: sx,
			y: sy
		},
		{
			x: sx + exitDir,
			y: sy
		},
		{
			x: sx + exitDir,
			y: detourY
		},
		{
			x: approachX,
			y: detourY
		},
		{
			x: approachX,
			y: ty
		},
		{
			x: tx,
			y: ty
		}
	];
}
/**
* Routes a link between **different** rows using an orthogonal path.
*
*   1. Step **away** from the source bar to the crossover x (`crossX`).
*   2. Travel **vertically** to the midpoint between rows (`midY`).
*   3. Travel **horizontally** to the approach point on the correct side
*      of the target.
*   4. Travel **vertically** to the target row (`ty`).
*   5. Final segment to the target entry point (`tx`).
*
* The crossover x is clamped so the path never doubles back past both bars.
* When exit and entry are on the **same** side (SS / FF) the exit-side step
* is limited to the approach x, avoiding a wide U‑shape.
*
* The approach point is chosen so the last segment travels in the arrow
* direction demanded by the entry side:
*
*   - Left‑entry  (FS, SS): approach from the **left**  → `tx - TURN_MARGIN`
*     Last segment goes RIGHT.
*   - Right‑entry (FF, SF): approach from the **right** → `tx + TURN_MARGIN`
*     Last segment goes LEFT.
*
*         left‑entry (FS / SS)              right‑entry (FF / SF)
*         ─────────────────────              ─────────────────────
*   sx  ●────────────────►              sx  ●────────────────►
*        exitDir                             exitDir
*        │                                    │
*        │  midY                              │  midY
*        ▼  ════════════════════►             ▼  ════════════════════►
*                                │                                   │
*                                │                                   │
*                                ▼  approachFromLeft                 ▼  approachFromRight
*                              ●────────────────►                 ◄────────────────●
*                              tx                                   tx
*
* @param sx - Source anchor x.
* @param sy - Source row center y.
* @param tx - Target anchor x.
* @param ty - Target row center y.
* @param leftEntry - Whether the link enters the target on its left edge.
* @param exitRight - Whether the link exits the source on its right edge.
* @returns An ordered array of {@link Point} vertices.
*/
function routeMultiRow(sx, sy, tx, ty, leftEntry, exitRight) {
	const midY = Math.round(Math.abs(sy - ty) / ROW_HEIGHT) % 2 === 0 ? (sy + ty) / 2 + ROW_HEIGHT / 2 : (sy + ty) / 2;
	const approachX = leftEntry ? tx - TURN_MARGIN : tx + TURN_MARGIN;
	const crossX = exitRight ? Math.max(sx + TURN_MARGIN, approachX) : Math.min(sx - TURN_MARGIN, approachX);
	return [
		{
			x: sx,
			y: sy
		},
		{
			x: crossX,
			y: sy
		},
		{
			x: crossX,
			y: midY
		},
		{
			x: approachX,
			y: midY
		},
		{
			x: approachX,
			y: ty
		},
		{
			x: tx,
			y: ty
		}
	];
}
/**
* Produces the vertex list for an orthogonal connector between source and target.
*
* ## Anchor points (sx / tx)
*
* | Type | Source anchor (`sx`)        | Target anchor (`tx`)          |
* |------|-----------------------------|-------------------------------|
* | FS   | right edge of source        | left edge of target           |
* | SS   | left edge of source         | left edge of target           |
* | FF   | right edge of source        | right edge of target          |
* | SF   | left edge of source         | right edge of target          |
*
* Milestone offsets are applied automatically: ± {@link MILESTONE_HALF} replaces
* ± width for zero‑width milestones.
*
* ## Routing strategy
*
* **Same row** (|sy − ty| < 1 px):
* - Direct horizontal line when non‑degenerate **and** the arrow direction
*   naturally points **into** the target (see {@link routeSameRow}).
* - Otherwise a 6‑vertex detour below the bars is drawn.
*
* **Different rows**: always a 6‑vertex orthogonal path that steps away from
* the source, passes through the midpoint between rows, and approaches the
* target from the correct side (see {@link routeMultiRow}).
*
* ## Arrowhead direction guarantee
*
* The SVG `marker-end` uses `orient="auto"`, so the arrow rotates to match
* the last segment. This function ensures the last segment always travels
* **into** the target on the semantically correct edge:
*
* | Entry side | Target edge  | Last segment direction |
* |-----------|-------------|-----------------------|
* | left      | left edge    | → RIGHT               |
* | right     | right edge   | ← LEFT                |
*
* @param type - The link type determining start/end anchor points.
* @param src  - The source bar layout.
* @param tgt  - The target bar layout.
* @returns An ordered array of {@link Point} vertices.
*/
function route(type, src, tgt) {
	const { sx, tx } = getAnchors(type, src, tgt);
	const sy = src.centerY;
	const ty = tgt.centerY;
	const leftEntry = isLeftEntry(type);
	const exitRight = isExitRight(type);
	return collapseStubs(Math.abs(sy - ty) < 1 ? routeSameRow(sx, sy, tx, ty, leftEntry, exitRight) : routeMultiRow(sx, sy, tx, ty, leftEntry, exitRight));
}
/**
* Computes orthogonal routing for all dependency links.
* Links whose source or target is not in the layout map are skipped silently
* (e.g. when the row is collapsed).
*
* @param links   - The dependency links to route.
* @param layouts - A map from task ID to its computed {@link BarLayout}.
* @returns An array of {@link RoutedLink} objects with computed vertex paths.
*/
function routeLinks(links, layouts) {
	return links.map((link) => {
		const src = layouts.get(link.source);
		const tgt = layouts.get(link.target);
		if (src === void 0 || tgt === void 0) return null;
		return {
			linkId: link.id,
			sourceTaskId: link.source,
			targetTaskId: link.target,
			type: link.type,
			points: route(link.type, src, tgt)
		};
	}).filter((r) => r !== null);
}
//#endregion
//#region src/lib/validation/schemas.ts
const LinkTypeSchema = z.enum([
	"FS",
	"SS",
	"FF",
	"SF"
]);
z.enum([
	"task",
	"project",
	"milestone"
]);
const SpecialDayKindSchema = z.enum(["holiday", "custom"]);
/** @internal */
const SpecialDaySchema = z.object({
	/** ISO date: YYYY-MM-DD */
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"),
	kind: SpecialDayKindSchema,
	label: z.string().min(1).optional(),
	className: z.string().min(1).optional()
});
const taskBase = {
	/** Unique positive integer identifier for the task. */
	id: z.number().int().positive(),
	/** Display name / label of the task. */
	text: z.string().min(1),
	/** ISO date: YYYY-MM-DD */
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"),
	/** Optional id of the parent task. When set, this task is a child in the hierarchy. */
	parent: z.number().int().positive().optional(),
	/** Optional CSS color value for the task bar. Overrides the default color assignment. */
	color: z.string().optional(),
	/** When `true`, the task bar cannot be dragged or resized. */
	readonly: z.boolean().optional(),
	/** Optional arbitrary metadata for consumer use. Preserved in the parsed output. */
	data: z.record(z.string(), z.unknown()).optional()
};
/** @internal */
const TaskLeafSchema = z.object({
	...taskBase,
	kind: z.literal("task"),
	/** ISO date: YYYY-MM-DD */
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"),
	/** 0–100 completion percentage (integer). */
	percentComplete: z.number().int().min(0).max(100).default(0)
}).refine((t) => t.endDate >= t.startDate, {
	message: "endDate must be on or after startDate",
	path: ["endDate"]
});
/** @internal */
const TaskProjectSchema = z.object({
	...taskBase,
	kind: z.literal("project"),
	/** ISO date: YYYY-MM-DD */
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"),
	/** 0–100 completion percentage (integer). */
	percentComplete: z.number().int().min(0).max(100).default(0),
	/**
	* Initial expanded state for tree hierarchy.
	* When `false`, children of this task are hidden on initial render.
	*
	* @default true
	*/
	open: z.boolean().default(true)
}).refine((t) => t.endDate >= t.startDate, {
	message: "endDate must be on or after startDate",
	path: ["endDate"]
});
/** @internal */
const TaskMilestoneSchema = z.object({
	...taskBase,
	kind: z.literal("milestone")
});
const TaskSchema = z.discriminatedUnion("kind", [
	TaskLeafSchema,
	TaskProjectSchema,
	TaskMilestoneSchema
]);
const LinkSchema = z.object({
	/** Unique positive integer identifier for the dependency link. */
	id: z.number().int().positive(),
	/** The `id` of the predecessor task (the task that drives the dependency). */
	source: z.number().int().positive(),
	/** The `id` of the successor task (the task that depends on the predecessor). */
	target: z.number().int().positive(),
	/**
	* Dependency type.
	*
	* - `'FS'` — Finish-to-start: successor starts after predecessor finishes.
	* - `'SS'` — Start-to-start: successor starts at the same time as predecessor.
	* - `'FF'` — Finish-to-finish: successor finishes at the same time as predecessor.
	* - `'SF'` — Start-to-finish: successor finishes after predecessor starts.
	*
	* @default 'FS'
	*/
	type: LinkTypeSchema.default("FS"),
	/** When `true`, the link cannot be modified or deleted through the UI. */
	readonly: z.boolean().optional(),
	/** Optional arbitrary metadata for consumer use. Preserved in the parsed output. */
	data: z.record(z.string(), z.unknown()).optional()
}).refine((l) => l.source !== l.target, {
	message: "A link cannot connect a task to itself",
	path: ["target"]
});
/** @internal */
const GanttInputSchema = z.object({
	/** Array of task objects. At least one task is required. */
	tasks: z.array(TaskSchema).min(1),
	/** Optional array of dependency link objects. Defaults to empty array. */
	links: z.array(LinkSchema).default([])
}).superRefine((data, ctx) => {
	const taskIds = /* @__PURE__ */ new Set();
	for (let i = 0; i < data.tasks.length; i++) {
		const task = data.tasks[i];
		if (task !== void 0) {
			if (taskIds.has(task.id)) ctx.addIssue({
				code: "custom",
				message: `Duplicate task id: ${task.id}`,
				path: [
					"tasks",
					i,
					"id"
				]
			});
			taskIds.add(task.id);
		}
	}
	const linkIds = /* @__PURE__ */ new Set();
	for (let i = 0; i < data.links.length; i++) {
		const link = data.links[i];
		if (link !== void 0) {
			if (linkIds.has(link.id)) ctx.addIssue({
				code: "custom",
				message: `Duplicate link id: ${link.id}`,
				path: [
					"links",
					i,
					"id"
				]
			});
			linkIds.add(link.id);
		}
	}
	const pairKeys = /* @__PURE__ */ new Set();
	for (let i = 0; i < data.links.length; i++) {
		const link = data.links[i];
		if (link !== void 0) {
			const key = `${link.source}:${link.target}`;
			if (pairKeys.has(key)) ctx.addIssue({
				code: "custom",
				message: `Duplicate link pair: source=${link.source} target=${link.target}`,
				path: ["links", i]
			});
			pairKeys.add(key);
		}
	}
});
//#endregion
//#region src/lib/vanilla/dom/helpers.ts
/**
* Batches style assignments; avoids repeated style recalculations.
*
* @param elem - The target element.
* @param styles - A partial CSS style declaration to apply.
*/
function css(elem, styles) {
	for (const [k, v] of Object.entries(styles)) elem.style[k] = v ?? "";
}
function el(tag, props, ns) {
	const elem = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
	if (props !== void 0) for (const [k, v] of Object.entries(props)) if (k === "style" && typeof v === "object" && v !== null) css(elem, v);
	else if (k in elem) elem[k] = v;
	else elem.setAttribute(k, String(v));
	return elem;
}
/**
* Removes all child nodes from elem. Faster than `innerHTML = ''` for large subtrees.
*
* @param elem - The element to clear.
*/
function clearChildren(elem) {
	while (elem.firstChild !== null) elem.removeChild(elem.firstChild);
}
/**
* Appends all nodes from an array/fragment into parent in one pass.
*
* @param parent - The parent element.
* @param children - The child elements or text nodes to append.
*/
function appendAll(parent, children) {
	const frag = document.createDocumentFragment();
	for (const c of children) frag.appendChild(c);
	parent.append(frag);
}
/**
* Sets multiple SVG attributes in one call.
*
* @param elem - The target SVG element.
* @param attrs - Attributes to set (values are stringified).
*/
function setAttrs(elem, attrs) {
	for (const [k, v] of Object.entries(attrs)) elem.setAttribute(k, String(v));
}
//#endregion
//#region src/lib/vanilla/dom/timeHeader.ts
function specialDayKind(date, specialDaysByDate, showWeekends, weekendDays) {
	const dateKey = startOfDay(date).toISOString().slice(0, 10);
	const specialDay = specialDaysByDate.get(dateKey);
	if (specialDay !== void 0) return specialDay.kind;
	if (showWeekends && weekendDays.has(date.getUTCDay())) return "weekend";
	return null;
}
/**
* Inline style helper local to this module.
*
* @param elem - The target element.
* @param styles - A partial CSS style declaration to apply.
*/
function css_(elem, styles) {
	for (const [k, v] of Object.entries(styles)) elem.style[k] = v ?? "";
}
/**
* Fully replaces the content of `container` with two header rows.
* Called on scale change or viewport change only — not on scroll.
*
* @param container - The header container element to render into.
* @param state - The current chart state.
*/
function renderTimeHeader(container, state) {
	const { scale, viewportStart, viewportEnd, mapper, totalWidth, locale, showWeekends, weekendDays, specialDaysByDate } = state;
	const weekStartsOn = locale.weekStartsOn ?? 1;
	const upperCells = [];
	const lowerCells = [];
	let cur = snapToScaleBoundary(viewportStart, scale, weekStartsOn);
	let prevUpperLabel = "";
	let upperStart = 0;
	let upperWidth = 0;
	while (cur < viewportEnd) {
		const next = nextScaleBoundary(cur, scale);
		const x = mapper.toX(cur);
		const w = mapper.toX(next) - x;
		lowerCells.push({
			label: formatHeaderLabel(cur, scale, locale),
			x,
			width: w,
			date: new Date(cur)
		});
		const uLabel = formatUpperLabel(cur, scale, locale);
		if (uLabel !== prevUpperLabel) {
			if (prevUpperLabel !== "") upperCells.push({
				label: prevUpperLabel,
				x: upperStart,
				width: upperWidth
			});
			prevUpperLabel = uLabel;
			upperStart = x;
			upperWidth = w;
		} else upperWidth += w;
		cur = next;
	}
	if (prevUpperLabel !== "") upperCells.push({
		label: prevUpperLabel,
		x: upperStart,
		width: upperWidth
	});
	const upperRow = el("div");
	css_(upperRow, {
		position: "relative",
		height: "24px",
		width: `${totalWidth}px`,
		background: "var(--gantt-header-bg)",
		borderBottom: "1px solid var(--gantt-border)"
	});
	const upperNodes = upperCells.map((cell) => {
		const d = el("div");
		css_(d, {
			position: "absolute",
			left: `${cell.x}px`,
			width: `${cell.width}px`,
			height: "100%",
			borderRight: "1px solid var(--gantt-border)",
			display: "flex",
			alignItems: "center",
			paddingLeft: "8px",
			fontSize: "var(--gantt-font-size-xs)",
			fontWeight: "var(--gantt-font-weight-bold)",
			color: "var(--gantt-text)",
			overflow: "hidden",
			whiteSpace: "nowrap",
			letterSpacing: "var(--gantt-letter-spacing-tight)",
			textTransform: "uppercase"
		});
		d.textContent = cell.label;
		return d;
	});
	const lowerRow = el("div");
	css_(lowerRow, {
		position: "relative",
		height: "28px",
		width: `${totalWidth}px`,
		background: "var(--gantt-header-bg)",
		borderBottom: "1px solid var(--gantt-border)"
	});
	const lowerNodes = lowerCells.map((cell) => {
		const d = el("div");
		css_(d, {
			position: "absolute",
			left: `${cell.x}px`,
			width: `${cell.width}px`,
			height: "100%",
			borderRight: "1px solid var(--gantt-border)",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			fontSize: "var(--gantt-font-size-xs)",
			color: "var(--gantt-text-secondary)",
			overflow: "hidden",
			whiteSpace: "nowrap"
		});
		d.textContent = cell.label;
		if (scale === "day") {
			const kind = specialDayKind(cell.date, specialDaysByDate, showWeekends, weekendDays);
			if (kind !== null) {
				d.classList.add(`gantt-header-cell--${kind}`);
				const dateKey = startOfDay(cell.date).toISOString().slice(0, 10);
				d.dataset["date"] = dateKey;
				const specialDay = specialDaysByDate.get(dateKey);
				if (specialDay?.label !== void 0) {
					d.dataset["label"] = specialDay.label;
					d.title = specialDay.label;
				}
			}
		}
		return d;
	});
	appendAll(upperRow, upperNodes);
	appendAll(lowerRow, lowerNodes);
	clearChildren(container);
	container.append(upperRow);
	container.append(lowerRow);
}
//#endregion
//#region src/lib/vanilla/dom/gridColumns.ts
const DEFAULT_GRID_COLUMNS = [
	{
		id: "name",
		header: "Task name",
		width: "1fr"
	},
	{
		id: "startDate",
		header: "Start",
		width: "90px",
		field: "startDate",
		format: (value, _task, _row, locale) => formatDisplayDate(value, locale)
	},
	{
		id: "actions",
		header: "",
		width: "28px"
	}
];
/**
* Returns a localized default grid column schema.
* Column headers use locale label overrides with `EN_US_LABELS` fallback.
*
* @param locale - The {@link ChartLocale} to derive column header labels from.
* @returns An array of {@link GridColumn} objects.
*/
function gridColumnDefaults(locale) {
	return [
		{
			id: "name",
			header: locale.labels?.columnTaskName ?? EN_US_LABELS.columnTaskName,
			width: "1fr"
		},
		{
			id: "startDate",
			header: locale.labels?.columnStartDate ?? EN_US_LABELS.columnStartDate,
			width: "90px",
			field: "startDate",
			format: (value, _task, _row, loc) => formatDisplayDate(String(value), loc)
		},
		{
			id: "actions",
			header: "",
			width: "28px"
		}
	];
}
/**
* Builds a CSS `grid-template-columns` value from a column schema.
*
* @param columns - The full column schema array (only visible columns are included).
* @returns A space-separated CSS track list.
*/
function gridTemplateColumns(columns) {
	return columns.filter((c) => c.visible !== false).map((c) => c.width).join(" ");
}
/**
* Filters a column schema to only visible columns.
*
* @param columns - The full column schema array.
* @returns A new array containing only columns where `visible` is not `false`.
*/
function visibleColumns(columns) {
	return columns.filter((c) => c.visible !== false);
}
const GRID_COLUMN_FR_MIN_WIDTH = 120;
const PX_RE = /^(?<value>\d+(?:\.\d+)?)px$/u;
const FR_RE = /^(?<value>\d+(?:\.\d+)?)fr$/u;
function parseColumnMinWidth(width) {
	const trimmed = width.trim();
	const pxMatch = PX_RE.exec(trimmed);
	if (pxMatch) return parseFloat(pxMatch.groups?.["value"] ?? "0");
	const frMatch = FR_RE.exec(trimmed);
	if (frMatch) return parseFloat(frMatch.groups?.["value"] ?? "0") * 120;
	return 0;
}
/**
* Computes the minimum natural pixel width of a grid column schema.
*
* @param columns - The full column schema array.
* @returns The sum of minimum widths: `px` columns sum directly, `fr` units contribute
*          `GRID_COLUMN_FR_MIN_WIDTH` px each.
*/
function gridNaturalWidth(columns) {
	let total = 0;
	for (const col of visibleColumns(columns)) total += parseColumnMinWidth(col.width);
	return total;
}
//#endregion
//#region src/lib/vanilla/dom/leftPane.ts
const INDENT = 16;
const COLUMN_MIN_WIDTH = 30;
function toTask$1(node) {
	const base = {
		id: node.id,
		text: node.text,
		startDate: node.startDate,
		...node.parent === void 0 ? {} : { parent: node.parent },
		...node.color === void 0 ? {} : { color: node.color },
		...node.data === void 0 ? {} : { data: node.data }
	};
	switch (node.kind) {
		case "task": return {
			...base,
			kind: "task",
			endDate: node.endDate,
			percentComplete: node.percentComplete
		};
		case "project": return {
			...base,
			kind: "project",
			endDate: node.endDate,
			percentComplete: node.percentComplete,
			open: node.open
		};
		case "milestone": return {
			...base,
			kind: "milestone"
		};
	}
}
function getTaskField(task, field) {
	switch (field) {
		case "endDate": return task.kind !== "milestone" ? task.endDate : void 0;
		case "percentComplete": return task.kind !== "milestone" ? task.percentComplete : void 0;
		case "open": return task.kind === "project" ? task.open : void 0;
		default: return task[field];
	}
}
function buildTreeNameCell(row, expandedIds, cbs) {
	const hasChildren = isParent(row);
	const expanded = expandedIds.has(row.id);
	const cell = el("div");
	css(cell, {
		display: "flex",
		alignItems: "center",
		paddingLeft: `${row.depth * INDENT}px`,
		gap: "4px",
		overflow: "hidden"
	});
	if (hasChildren) {
		const btn = el("button");
		btn.className = "gantt-toggle";
		btn.textContent = expanded ? "▾" : "▸";
		css(btn, {
			width: "16px",
			height: "16px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			background: "none",
			border: "none",
			cursor: "pointer",
			color: "var(--gantt-text-secondary)",
			padding: "0",
			flexShrink: "0"
		});
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			cbs.onToggle(row.id);
		});
		cell.append(btn);
	} else {
		const spacer = el("span");
		spacer.style.width = "16px";
		spacer.style.flexShrink = "0";
		cell.append(spacer);
	}
	const label = el("span");
	css(label, {
		fontSize: "var(--gantt-font-size-md)",
		fontWeight: row.kind === "project" ? "var(--gantt-font-weight-bold)" : "var(--gantt-font-weight-normal)",
		color: "var(--gantt-text)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	});
	label.textContent = row.text;
	cell.append(label);
	return cell;
}
function buildDataCell(row, column, locale) {
	const cell = el("span");
	const styles = {
		fontSize: "var(--gantt-font-size-sm)",
		color: "var(--gantt-text-secondary)",
		paddingRight: "8px",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	};
	if (column.align !== void 0) styles.textAlign = column.align;
	css(cell, styles);
	const task = toTask$1(row);
	if (column.field !== void 0) {
		const rawValue = getTaskField(task, column.field);
		if (column.format !== void 0) cell.textContent = column.format(rawValue, task, row, locale);
		else cell.textContent = rawValue !== null && rawValue !== void 0 ? typeof rawValue === "object" ? JSON.stringify(rawValue) : typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean" ? String(rawValue) : "" : "";
	}
	return cell;
}
function buildAddButton(row, cbs, locale) {
	const btn = el("button");
	btn.className = "gantt-add-btn";
	btn.textContent = "+";
	btn.title = locale.labels?.addSubtaskTitle ?? EN_US_LABELS.addSubtaskTitle;
	css(btn, {
		background: "none",
		border: "none",
		cursor: "pointer",
		color: "var(--gantt-text-secondary)",
		fontSize: "var(--gantt-font-size-lg)",
		lineHeight: "1"
	});
	btn.addEventListener("click", (event) => {
		event.stopPropagation();
		cbs.onTaskAdd(row.id);
	});
	return btn;
}
function buildActionsPlaceholder() {
	return el("div");
}
function buildCell(column, row, expandedIds, cbs, locale, showAddTaskButton) {
	switch (column.id) {
		case "name": return buildTreeNameCell(row, expandedIds, cbs);
		case "actions": return showAddTaskButton ? buildAddButton(row, cbs, locale) : buildActionsPlaceholder();
		default: return buildDataCell(row, column, locale);
	}
}
function buildRow(row, selectedId, expandedIds, cbs, columns, locale, showAddTaskButton) {
	const selected = row.id === selectedId;
	const wrapper = el("div");
	wrapper.className = "gantt-row";
	css(wrapper, {
		display: "grid",
		gridTemplateColumns: gridTemplateColumns(columns),
		height: `${ROW_HEIGHT}px`,
		alignItems: "center",
		paddingLeft: "8px",
		background: selected ? "var(--gantt-row-selected)" : "var(--gantt-bg)",
		borderBottom: "1px solid var(--gantt-border)",
		cursor: "default",
		boxSizing: "border-box"
	});
	wrapper.tabIndex = 0;
	wrapper.setAttribute("role", "row");
	wrapper.setAttribute("aria-selected", String(selected));
	wrapper.dataset["taskId"] = String(row.id);
	wrapper.addEventListener("click", () => {
		const task = toTask$1(row);
		cbs.onRowClick({
			id: row.id,
			task
		});
	});
	wrapper.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			cbs.onTaskClick(row.id);
		}
	});
	for (const column of visibleColumns(columns)) wrapper.append(buildCell(column, row, expandedIds, cbs, locale, showAddTaskButton));
	return wrapper;
}
/**
* Renders the left grid pane.
*
* @param container - The left pane body element to render into.
* @param state - The current chart state.
* @param cbs - The left pane callbacks.
* @param columns - The grid column schema.
* @param showAddTaskButton - Whether to render the add-subtask button in the actions column.
*/
function renderLeftPane(container, state, cbs, columns, showAddTaskButton = true) {
	const { allRows, selectedId, expandedIds, startIndex, endIndex, paddingTop, paddingBottom, locale } = state;
	const frag = document.createDocumentFragment();
	if (paddingTop > 0) {
		const spacer = el("div");
		spacer.style.height = `${paddingTop}px`;
		frag.append(spacer);
	}
	for (const row of allRows.slice(startIndex, endIndex + 1)) frag.append(buildRow(row, selectedId, expandedIds, cbs, columns, locale, showAddTaskButton));
	if (paddingBottom > 0) {
		const spacer = el("div");
		spacer.style.height = `${paddingBottom}px`;
		frag.append(spacer);
	}
	clearChildren(container);
	container.append(frag);
}
/**
* Builds the header row for the left pane.
*
* @param columns - The grid column schema.
* @param locale - The current chart locale.
* @returns The header DOM element.
*/
function buildLeftPaneHeader(columns, locale) {
	const header = el("div");
	css(header, {
		display: "grid",
		gridTemplateColumns: gridTemplateColumns(columns),
		height: "52px",
		background: "var(--gantt-header-bg)",
		borderBottom: "1px solid var(--gantt-border)",
		paddingLeft: "8px",
		alignItems: "flex-end",
		paddingBottom: "4px",
		boxSizing: "border-box"
	});
	const visible = visibleColumns(columns);
	for (let i = 0; i < visible.length; i++) {
		const column = visible[i];
		if (column === void 0) continue;
		const wrapper = el("div");
		css(wrapper, {
			position: "relative",
			display: "flex",
			alignItems: "flex-end"
		});
		if (i === 0 && visible[0]?.id === "name") {
			const btnContainer = el("div");
			btnContainer.className = "gantt-header-tree-controls";
			css(btnContainer, {
				display: "flex",
				gap: "4px",
				marginRight: "6px",
				paddingBottom: "1px"
			});
			const expandBtn = el("button");
			expandBtn.className = "gantt-header-expand-btn";
			expandBtn.textContent = "+";
			expandBtn.title = locale.labels?.expandAllTitle ?? EN_US_LABELS.expandAllTitle;
			expandBtn.setAttribute("aria-label", expandBtn.title);
			css(expandBtn, {
				width: "18px",
				height: "18px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "var(--gantt-header-bg)",
				border: "1px solid var(--gantt-border)",
				borderRadius: "3px",
				cursor: "pointer",
				color: "var(--gantt-text-secondary)",
				fontSize: "14px",
				fontWeight: "var(--gantt-font-weight-bold)",
				lineHeight: "1",
				padding: "0"
			});
			const collapseBtn = el("button");
			collapseBtn.className = "gantt-header-collapse-btn";
			collapseBtn.textContent = "−";
			collapseBtn.title = locale.labels?.collapseAllTitle ?? EN_US_LABELS.collapseAllTitle;
			collapseBtn.setAttribute("aria-label", collapseBtn.title);
			css(collapseBtn, {
				width: "18px",
				height: "18px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "var(--gantt-header-bg)",
				border: "1px solid var(--gantt-border)",
				borderRadius: "3px",
				cursor: "pointer",
				color: "var(--gantt-text-secondary)",
				fontSize: "14px",
				fontWeight: "var(--gantt-font-weight-bold)",
				lineHeight: "1",
				padding: "0"
			});
			btnContainer.append(expandBtn, collapseBtn);
			wrapper.append(btnContainer);
		}
		const cell = el("span");
		css(cell, {
			fontSize: "var(--gantt-font-size-xs)",
			fontWeight: "var(--gantt-font-weight-bold)",
			color: "var(--gantt-text-secondary)",
			letterSpacing: "var(--gantt-letter-spacing-wide)",
			textTransform: "uppercase",
			paddingRight: "8px"
		});
		if (column.align !== void 0) cell.style.textAlign = column.align;
		cell.textContent = column.header;
		wrapper.append(cell);
		if (i < visible.length - 1) {
			const handle = el("div");
			handle.className = "gantt-col-resize-handle";
			css(handle, {
				position: "absolute",
				right: "-3px",
				top: "0",
				bottom: "0",
				width: "6px",
				cursor: "col-resize",
				zIndex: "1"
			});
			wrapper.append(handle);
		}
		header.append(wrapper);
	}
	return header;
}
/**
* Wires up column resize interactions on header handles.
* Must be called after the header is in the DOM (so `getBoundingClientRect` works).
*
* @param headerEl - The header element containing resize handles.
* @param bodyEl - The body element whose rows share the column widths.
* @param columns - The grid column schema (mutated in place on resize end).
* @param onChange - Optional callback fired on drag end with updated columns.
* @returns A cleanup function that removes all resize listeners.
*/
function setupColumnResize(headerEl, bodyEl, columns, onChange) {
	const handles = headerEl.querySelectorAll(".gantt-col-resize-handle");
	const cleanups = [];
	for (let colIndex = 0; colIndex < handles.length; colIndex++) {
		const handle = handles.item(colIndex);
		if (handle === null) continue;
		const capturedColIndex = colIndex;
		const onPointerDown = (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startWidths = [...headerEl.children].map((c) => c.getBoundingClientRect().width);
			const onMove = (me) => {
				const dx = me.clientX - startX;
				const newWidths = [...startWidths];
				newWidths[capturedColIndex] = Math.max(COLUMN_MIN_WIDTH, (startWidths[capturedColIndex] ?? 0) + dx);
				if (capturedColIndex + 1 < newWidths.length) newWidths[capturedColIndex + 1] = Math.max(COLUMN_MIN_WIDTH, (startWidths[capturedColIndex + 1] ?? 0) - dx);
				const template = newWidths.map((w) => `${Math.round(w)}px`).join(" ");
				headerEl.style.gridTemplateColumns = template;
				const rows = bodyEl.querySelectorAll("[role=\"row\"]");
				for (const row of rows) row.style.gridTemplateColumns = template;
			};
			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				const finalCells = [...headerEl.children];
				const visible = visibleColumns(columns);
				for (let i = 0; i < visible.length && i < finalCells.length; i++) {
					const col = visible[i];
					const cell = finalCells[i];
					if (col !== void 0 && cell !== void 0) {
						const w = cell.getBoundingClientRect().width;
						col.width = `${Math.round(w)}px`;
					}
				}
				onChange?.([...columns]);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		};
		handle.addEventListener("pointerdown", onPointerDown);
		cleanups.push(() => {
			handle.removeEventListener("pointerdown", onPointerDown);
		});
	}
	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}
//#endregion
//#region src/lib/vanilla/dom/dependencyLayer.ts
const NS = "http://www.w3.org/2000/svg";
const ARROW_PATH = "M 0 1 L 10 5 L 0 9 Z";
const ARROW_SIZE = 6;
/**
* Creates the SVG overlay element. Call once; pass to updateDependencyLayer on each render.
* Also creates a hidden ghost-line path used during link-creation drags.
*
* The SVG is initially zero-sized; `updateDependencyLayer` sets width/height each frame.
*
* @param _totalWidth - The total pixel width of the SVG viewport.
* @param _totalHeight - The total pixel height of the SVG viewport.
* @returns An `SVGSVGElement` ready to be inserted into the DOM.
*/
function createDependencyLayer(_totalWidth, _totalHeight) {
	const svg = document.createElementNS(NS, "svg");
	Object.assign(svg.style, {
		position: "absolute",
		top: "0",
		left: "0",
		pointerEvents: "none",
		overflow: "visible",
		zIndex: "1"
	});
	const defs = document.createElementNS(NS, "defs");
	for (const [id, color] of [["gantt-arrow", "var(--gantt-link)"], ["gantt-arrow-hi", "var(--gantt-link-hi)"]]) {
		const marker = document.createElementNS(NS, "marker");
		setAttrs(marker, {
			id,
			viewBox: "0 0 10 10",
			refX: "10",
			refY: "5",
			markerWidth: ARROW_SIZE,
			markerHeight: ARROW_SIZE,
			orient: "auto"
		});
		const path = document.createElementNS(NS, "path");
		setAttrs(path, {
			d: ARROW_PATH,
			fill: color
		});
		marker.append(path);
		defs.append(marker);
	}
	svg.append(defs);
	const ghostPath = document.createElementNS(NS, "path");
	setAttrs(ghostPath, {
		d: "",
		fill: "none",
		stroke: "var(--gantt-link)",
		"stroke-width": "1.5",
		"stroke-dasharray": "5 3"
	});
	ghostPath.classList.add("gantt-ghost-line");
	ghostPath.style.display = "none";
	svg.append(ghostPath);
	return svg;
}
/**
* Shows or updates the ghost line drawn during a link-creation drag.
*
* @param svg - The SVG dependency layer element.
* @param x1 - Start X coordinate.
* @param y1 - Start Y coordinate.
* @param x2 - End X coordinate.
* @param y2 - End Y coordinate.
* @param valid - When `true`, the line is drawn solid with an arrow marker.
*/
function showGhostLine(svg, x1, y1, x2, y2, valid) {
	const ghost = svg.querySelector("path.gantt-ghost-line");
	if (ghost === null) return;
	setAttrs(ghost, { d: `M ${x1},${y1} L ${x2},${y2}` });
	if (valid) ghost.removeAttribute("stroke-dasharray");
	else ghost.setAttribute("stroke-dasharray", "5 3");
	if (valid) ghost.setAttribute("marker-end", "url(#gantt-arrow)");
	else ghost.removeAttribute("marker-end");
	ghost.style.display = "";
}
/**
* Hides the ghost line after a link-creation drag completes or is cancelled.
*
* @param svg - The SVG dependency layer element.
*/
function hideGhostLine(svg) {
	const ghost = svg.querySelector("path.gantt-ghost-line");
	if (ghost !== null) {
		ghost.style.display = "none";
		ghost.removeAttribute("marker-end");
	}
}
/**
* Replaces all path elements in the SVG to reflect the current link set.
* The `<defs>` node (first child) is preserved.
*
* @param svg - The SVG dependency layer element.
* @param links - The array of routed links to render.
* @param totalWidth - The total pixel width of the SVG viewport.
* @param totalHeight - The total pixel height of the SVG viewport.
* @param selectedTaskId - The currently selected task ID, or `null`.
* @param highlightLinkedDependenciesOnSelect - When `true`, links connected to the selected task use highlight styling.
* @param cbs - Optional callbacks for link click and double-click events.
*/
function updateDependencyLayer(svg, links, totalWidth, totalHeight, selectedTaskId, highlightLinkedDependenciesOnSelect, cbs) {
	setAttrs(svg, {
		width: totalWidth,
		height: totalHeight
	});
	const toRemove = [...svg.children].slice(1).filter((c) => !c.classList.contains("gantt-ghost-line"));
	for (const node of toRemove) svg.removeChild(node);
	const ghost = svg.querySelector("path.gantt-ghost-line");
	for (const link of links) {
		const { points } = link;
		if (points.length === 0) continue;
		const [first, ...rest] = points;
		const d = `M ${first.x},${first.y}${rest.map((p) => ` L ${p.x},${p.y}`).join("")}`;
		const isRelated = highlightLinkedDependenciesOnSelect && selectedTaskId !== null && (link.sourceTaskId === selectedTaskId || link.targetTaskId === selectedTaskId);
		const path = document.createElementNS(NS, "path");
		setAttrs(path, {
			d,
			fill: "none",
			stroke: isRelated ? "var(--gantt-link-hi)" : "var(--gantt-link)",
			"stroke-width": isRelated ? "1.8" : "1.5",
			"stroke-linejoin": "round",
			"marker-end": isRelated ? "url(#gantt-arrow-hi)" : "url(#gantt-arrow)",
			"data-link-id": String(link.linkId)
		});
		path.style.pointerEvents = "visibleStroke";
		path.style.cursor = "pointer";
		path.addEventListener("click", (event) => {
			if (event.detail === 1) cbs?.onLinkClick?.({
				id: link.linkId,
				source: link.sourceTaskId,
				target: link.targetTaskId,
				type: link.type
			});
		});
		path.addEventListener("dblclick", (_event) => {
			cbs?.onLinkDblClick?.({
				id: link.linkId,
				source: link.sourceTaskId,
				target: link.targetTaskId,
				type: link.type
			});
		});
		if (ghost !== null) svg.insertBefore(path, ghost);
		else svg.append(path);
	}
}
//#endregion
//#region src/lib/vanilla/interaction/drag.ts
function toTask(node) {
	const base = {
		id: node.id,
		text: node.text,
		startDate: node.startDate,
		...node.parent === void 0 ? {} : { parent: node.parent },
		...node.color === void 0 ? {} : { color: node.color },
		...node.readonly === void 0 ? {} : { readonly: node.readonly },
		...node.data === void 0 ? {} : { data: node.data }
	};
	switch (node.kind) {
		case "task": return {
			...base,
			kind: "task",
			endDate: node.endDate,
			percentComplete: node.percentComplete
		};
		case "project": return {
			...base,
			kind: "project",
			endDate: node.endDate,
			percentComplete: node.percentComplete,
			open: node.open
		};
		case "milestone": return {
			...base,
			kind: "milestone"
		};
	}
}
/**
* Attaches drag-to-move and resize listeners to a bar element.
*
* Design: all mutable state lives in closure variables captured at mousedown.
* No global state; multiple bars can be dragged independently (one at a time).
*
* @param barEl - The bar DOM element.
* @param resizeHandleEl - The resize handle DOM element.
* @param task - The {@link TaskNode} for this bar.
* @param getMapper - A function returning the current {@link PixelMapper} (snapshotted at mousedown).
* @param cbs - The chart callbacks.
* @returns A cleanup function that removes all listeners.
*/
function attachDrag(barEl, resizeHandleEl, task, getMapper, cbs) {
	function onBarDown(e) {
		if (e.button !== 0) return;
		e.preventDefault();
		try {
			barEl.setPointerCapture(e.pointerId);
		} catch {}
		cbs.onTaskClick?.(task.id);
		const startX = e.clientX;
		const originDate = parseDate(task.startDate);
		const mapper = getMapper();
		let lastDays = 0;
		function onMove(me) {
			const dx = me.clientX - startX;
			lastDays = Math.round(mapper.widthToDurationDays(dx));
			cbs.onTaskMove?.({
				id: task.id,
				startDate: addDays(originDate, lastDays)
			});
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			barEl.style.cursor = "grab";
			if (lastDays !== 0) cbs._onTaskMoveFinal?.({
				id: task.id,
				startDate: addDays(originDate, lastDays)
			});
		}
		barEl.style.cursor = "grabbing";
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
	function onResizeDown(e) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		try {
			resizeHandleEl.setPointerCapture(e.pointerId);
		} catch {}
		const startX = e.clientX;
		if (task.kind === "milestone") return;
		const origEnd = parseDate(task.endDate);
		const mapper = getMapper();
		let lastEnd = origEnd;
		function onMove(me) {
			const dx = me.clientX - startX;
			const daysDelta = Math.round(mapper.widthToDurationDays(dx));
			lastEnd = addDays(origEnd, daysDelta);
			cbs.onTaskResize?.({
				id: task.id,
				endDate: lastEnd.toISOString().slice(0, 10)
			});
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			cbs._onTaskResizeFinal?.({
				id: task.id,
				endDate: lastEnd.toISOString().slice(0, 10)
			});
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
	barEl.addEventListener("pointerdown", onBarDown);
	resizeHandleEl.addEventListener("pointerdown", onResizeDown);
	return () => {
		barEl.removeEventListener("pointerdown", onBarDown);
		resizeHandleEl.removeEventListener("pointerdown", onResizeDown);
	};
}
/**
* Attaches drag-to-change-progress listeners to a progress overlay element.
*
* @param progressEl - The progress overlay DOM element.
* @param barEl - The bar DOM element (for width measurement).
* @param task - The {@link TaskNode} for this bar.
* @param _getMapper - A function returning the current {@link PixelMapper} (unused, kept for API symmetry).
* @param cbs - The chart callbacks.
* @returns A cleanup function that removes all listeners.
*/
function attachProgressDrag(progressEl, barEl, task, _getMapper, cbs) {
	function onProgressDown(e) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		cbs.onTaskClick?.(task.id);
		try {
			progressEl.setPointerCapture(e.pointerId);
		} catch {}
		const startX = e.clientX;
		const barWidth = barEl.getBoundingClientRect().width;
		const origPercent = task.kind !== "milestone" ? task.percentComplete ?? 0 : 0;
		let lastPercent = origPercent;
		function onMove(me) {
			const dx = me.clientX - startX;
			const percentDelta = barWidth > 0 ? dx / barWidth * 100 : 0;
			lastPercent = Math.max(0, Math.min(100, Math.round(origPercent + percentDelta)));
			cbs.onTaskProgressDrag?.({
				id: task.id,
				percentComplete: lastPercent
			});
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			progressEl.style.cursor = "ew-resize";
			cbs._onTaskProgressDragFinal?.({
				id: task.id,
				percentComplete: lastPercent
			});
		}
		progressEl.style.cursor = "ew-resize";
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
	progressEl.addEventListener("pointerdown", onProgressDown);
	return () => {
		progressEl.removeEventListener("pointerdown", onProgressDown);
	};
}
/**
* Attaches click-to-select on a milestone diamond.
*
* @param diamondEl - The milestone diamond DOM element.
* @param taskId - The task ID to select.
* @param cbs - The chart callbacks.
* @returns A cleanup function that removes all listeners.
*/
function attachMilestoneClick(diamondEl, taskId, cbs) {
	function onClick() {
		cbs.onTaskClick?.(taskId);
	}
	function onDoubleClick(event) {
		if (event.detail === 2) {
			const task = diamondEl.__task;
			if (task === void 0) return;
			cbs.onTaskDoubleClick?.({
				id: taskId,
				task
			});
		}
	}
	diamondEl.addEventListener("click", onClick);
	diamondEl.addEventListener("click", onDoubleClick);
	return () => {
		diamondEl.removeEventListener("click", onClick);
		diamondEl.removeEventListener("click", onDoubleClick);
	};
}
function bindMilestoneTask(diamondEl, task) {
	diamondEl.__task = task;
}
//#endregion
//#region src/lib/vanilla/interaction/linkCreation.ts
/**
* Attaches a link-creation drag listener to an endpoint handle.
*
* @param handle - The endpoint DOM element.
* @param sourceTaskId - The task ID from which the link originates.
* @param anchorX - The X anchor coordinate (task center).
* @param anchorY - The Y anchor coordinate (task center).
* @param svgLayer - The SVG dependency layer element for ghost line rendering.
* @param absoluteLayer - The absolute-positioned layer for coordinate calculations.
* @param cbs - The chart callbacks.
* @returns A cleanup function that removes all listeners.
*/
function attachLinkEndpointHandle(handle, sourceTaskId, anchorX, anchorY, svgLayer, absoluteLayer, cbs) {
	function onPointerDown(e) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		try {
			handle.setPointerCapture(e.pointerId);
		} catch {}
		let validTargetId = null;
		function onMove(me) {
			const layerRect = absoluteLayer.getBoundingClientRect();
			const x = me.clientX - layerRect.left;
			const y = me.clientY - layerRect.top;
			const barEl = document.elementFromPoint(me.clientX, me.clientY)?.closest("[data-task-id]");
			const targetId = barEl !== null && barEl !== void 0 ? Number(barEl.dataset["taskId"]) : null;
			validTargetId = targetId !== null && targetId !== sourceTaskId ? targetId : null;
			showGhostLine(svgLayer, anchorX, anchorY, x, y, validTargetId !== null);
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			hideGhostLine(svgLayer);
			if (validTargetId !== null) cbs.onLinkCreate?.({
				sourceTaskId,
				targetTaskId: validTargetId,
				type: "FS"
			});
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
	handle.addEventListener("pointerdown", onPointerDown);
	handle.tabIndex = 0;
	handle.setAttribute("role", "button");
	handle.setAttribute("aria-label", `Create link from task ${sourceTaskId}`);
	function onKeyDown(event) {
		if (event.key === "Enter" || event.key === " ") event.preventDefault();
	}
	handle.addEventListener("keydown", onKeyDown);
	return () => {
		handle.removeEventListener("pointerdown", onPointerDown);
		handle.removeEventListener("keydown", onKeyDown);
	};
}
/**
* Creates an endpoint handle DOM element.
* The caller must position it with inline styles and append it to the layer.
*
* @returns A new `HTMLElement` with the `gantt-link-endpoint` class.
*/
function createEndpointHandle() {
	const handle = document.createElement("div");
	handle.className = "gantt-link-endpoint";
	handle.style.position = "absolute";
	handle.style.width = "10px";
	handle.style.height = "10px";
	handle.style.borderRadius = "50%";
	handle.style.background = "var(--gantt-link)";
	handle.style.border = "2px solid var(--gantt-bg)";
	handle.style.cursor = "crosshair";
	handle.style.zIndex = "4";
	handle.style.opacity = "0";
	handle.style.transition = "opacity 0.15s ease, transform 0.1s ease";
	handle.style.transform = "translate(-50%, -50%) scale(0.8)";
	handle.style.pointerEvents = "auto";
	handle.style.touchAction = "none";
	return handle;
}
//#endregion
//#region src/lib/vanilla/dom/rightPane.ts
const BAR_COLOR = {
	task: "var(--gantt-task)",
	project: "var(--gantt-project)",
	milestone: "var(--gantt-milestone)"
};
/**
* Creates the skeleton DOM structure for the right pane. Call once.
*
* @returns A new {@link RightPaneRefs} with empty containers and bar registry.
*/
function createRightPaneRefs() {
	const scrollContainer = el("div");
	const stripeContainer = el("div");
	const absoluteLayer = el("div");
	const svgLayer = createDependencyLayer(0, 0);
	css(stripeContainer, { position: "relative" });
	css(absoluteLayer, {
		position: "absolute",
		top: "52px",
		left: "0"
	});
	scrollContainer.append(stripeContainer);
	scrollContainer.append(absoluteLayer);
	absoluteLayer.append(svgLayer);
	const tooltipEl = el("div");
	tooltipEl.className = "gantt-tooltip";
	tooltipEl.style.display = "none";
	scrollContainer.append(tooltipEl);
	return {
		scrollContainer,
		stripeContainer,
		absoluteLayer,
		svgLayer,
		tooltipEl,
		barRegistry: /* @__PURE__ */ new Map()
	};
}
function ariaLabel(locale, key, arg) {
	return formatLabel(locale.labels?.[key] ?? EN_US_LABELS[key], arg);
}
function renderSpecialDayBackgrounds(layer, beforeNode, state, contentHeight) {
	const { mapper, viewportStart, viewportEnd, showWeekends, weekendDays, specialDaysByDate } = state;
	let cur = startOfDay(viewportStart);
	while (cur < viewportEnd) {
		const next = new Date(cur.getTime() + 864e5);
		const x = mapper.toX(cur);
		const width = Math.max(1, mapper.toX(next) - x);
		const dateKey = cur.toISOString().slice(0, 10);
		const specialDay = specialDaysByDate.get(dateKey);
		const isWeekend = weekendDays.has(cur.getUTCDay());
		let kind = null;
		if (specialDay !== void 0) {
			const { kind: specialKind } = specialDay;
			kind = specialKind;
		} else if (showWeekends && isWeekend) kind = "weekend";
		if (kind !== null) {
			const dayCell = el("div");
			dayCell.className = `gantt-day-cell gantt-day-cell--${kind}`;
			if (specialDay?.className !== void 0) dayCell.classList.add(specialDay.className);
			dayCell.dataset["date"] = dateKey;
			if (specialDay?.label !== void 0) {
				dayCell.dataset["label"] = specialDay.label;
				dayCell.title = specialDay.label;
			}
			css(dayCell, {
				position: "absolute",
				left: `${x}px`,
				top: "0",
				width: `${width}px`,
				height: `${contentHeight}px`,
				pointerEvents: "none",
				zIndex: "1"
			});
			layer.insertBefore(dayCell, beforeNode);
		}
		cur = next;
	}
}
function renderBar(layer, svgLayer, task, layout, selectedId, registry, state, cbs, tooltipEl) {
	const selected = task.id === selectedId;
	const readonly = task.readonly === true;
	const color = BAR_COLOR[layout.kind] ?? BAR_COLOR["task"];
	const bar = el("div");
	bar.className = `gantt-bar${selected ? " gantt-bar--selected gantt-shape--selected" : ""}`;
	css(bar, {
		position: "absolute",
		left: `${layout.x}px`,
		top: `${layout.y}px`,
		width: `${layout.width}px`,
		height: `${layout.height}px`,
		...color === void 0 ? {} : { background: color },
		borderRadius: layout.kind === "project" ? "3px" : "4px",
		cursor: readonly ? "pointer" : "grab",
		userSelect: "none",
		overflow: "hidden",
		zIndex: selected ? "3" : "2",
		touchAction: "none"
	});
	let cleanupProgressDrag;
	if (layout.progressWidth > 0) {
		const prog = el("div");
		const progressEnabled = state.progressDragEnabled;
		css(prog, {
			position: "absolute",
			left: "0",
			top: "0",
			width: `${layout.progressWidth}px`,
			height: "100%",
			background: "rgba(0,0,0,0.18)",
			...progressEnabled ? {
				cursor: "ew-resize",
				touchAction: "none"
			} : { pointerEvents: "none" }
		});
		if (progressEnabled) {
			prog.className = "gantt-progress-overlay";
			cleanupProgressDrag = attachProgressDrag(prog, bar, task, () => state.mapper, cbs);
		}
		bar.append(prog);
	}
	const label = el("span");
	css(label, {
		position: "absolute",
		left: "8px",
		right: "8px",
		top: "50%",
		transform: "translateY(-50%)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		color: "var(--gantt-bar-label-color)",
		fontSize: "var(--gantt-font-size-sm)",
		fontWeight: "var(--gantt-font-weight-semibold)",
		whiteSpace: "nowrap",
		pointerEvents: "none",
		textShadow: "0 1px 2px rgba(0,0,0,0.25)"
	});
	label.textContent = task.text;
	bar.append(label);
	bar.tabIndex = 0;
	bar.setAttribute("role", "button");
	bar.setAttribute("aria-label", ariaLabel(state.locale, "ariaTask", task.text));
	bar.setAttribute("aria-pressed", String(selected));
	bar.dataset["taskId"] = String(task.id);
	bar.addEventListener("click", (event) => {
		if (event.detail === 2) cbs.onTaskDoubleClick?.({
			id: task.id,
			task: toTask(task)
		});
		else cbs.onTaskClick?.(task.id);
	});
	bar.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			cbs.onTaskClick?.(task.id);
		}
	});
	let handle;
	let cleanupDrag;
	if (!readonly) {
		handle = el("div");
		handle.className = "gantt-resize-handle";
		css(handle, {
			position: "absolute",
			right: "0",
			top: "0",
			width: "8px",
			height: "100%",
			cursor: "ew-resize",
			zIndex: "1",
			touchAction: "none"
		});
		bar.append(handle);
		layer.insertBefore(bar, svgLayer);
		cleanupDrag = attachDrag(bar, handle, task, () => state.mapper, cbs);
	} else layer.insertBefore(bar, svgLayer);
	let cleanupLinkHandles;
	if (state.linkCreationEnabled) {
		const barCenterY = layout.y + layout.height / 2;
		const leftHandle = createEndpointHandle();
		leftHandle.style.left = `${layout.x}px`;
		leftHandle.style.top = `${barCenterY}px`;
		layer.insertBefore(leftHandle, svgLayer);
		const rightHandle = createEndpointHandle();
		rightHandle.style.left = `${layout.x + layout.width}px`;
		rightHandle.style.top = `${barCenterY}px`;
		layer.insertBefore(rightHandle, svgLayer);
		const cleanupLeft = attachLinkEndpointHandle(leftHandle, task.id, layout.x, barCenterY, svgLayer, layer, cbs);
		const cleanupRight = attachLinkEndpointHandle(rightHandle, task.id, layout.x + layout.width, barCenterY, svgLayer, layer, cbs);
		const onBarEnter = () => {
			leftHandle.style.opacity = "1";
			rightHandle.style.opacity = "1";
			leftHandle.style.transform = "translate(-50%, -50%) scale(1)";
			rightHandle.style.transform = "translate(-50%, -50%) scale(1)";
		};
		const onBarLeave = () => {
			leftHandle.style.opacity = "0";
			rightHandle.style.opacity = "0";
			leftHandle.style.transform = "translate(-50%, -50%) scale(0.8)";
			rightHandle.style.transform = "translate(-50%, -50%) scale(0.8)";
		};
		bar.addEventListener("mouseenter", onBarEnter);
		bar.addEventListener("mouseleave", onBarLeave);
		cleanupLinkHandles = () => {
			cleanupLeft();
			cleanupRight();
			bar.removeEventListener("mouseenter", onBarEnter);
			bar.removeEventListener("mouseleave", onBarLeave);
		};
	}
	const onTooltipEnter = () => {
		const content = cbs.onTooltipText?.({
			id: task.id,
			task: toTask(task)
		});
		if (content && content.length > 0) {
			tooltipEl.innerHTML = content;
			tooltipEl.style.display = "";
		} else tooltipEl.style.display = "none";
	};
	const onTooltipMove = (e) => {
		const offsetX = 12;
		const offsetY = -8;
		let left = e.clientX + offsetX;
		let top = e.clientY + offsetY;
		const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 4;
		const maxTop = window.innerHeight - tooltipEl.offsetHeight - 4;
		left = Math.max(4, Math.min(left, maxLeft));
		top = Math.max(4, Math.min(top, maxTop));
		tooltipEl.style.left = `${left}px`;
		tooltipEl.style.top = `${top}px`;
	};
	const onTooltipLeave = () => {
		tooltipEl.style.display = "none";
	};
	bar.addEventListener("mouseenter", onTooltipEnter);
	bar.addEventListener("mousemove", onTooltipMove);
	bar.addEventListener("mouseleave", onTooltipLeave);
	const cleanupTooltip = () => {
		bar.removeEventListener("mouseenter", onTooltipEnter);
		bar.removeEventListener("mousemove", onTooltipMove);
		bar.removeEventListener("mouseleave", onTooltipLeave);
	};
	const entry = {
		bar,
		resizeHandle: handle ?? el("div")
	};
	if (cleanupDrag !== void 0) entry.cleanupDrag = cleanupDrag;
	if (cleanupLinkHandles !== void 0) entry.cleanupLinkHandles = cleanupLinkHandles;
	if (cleanupProgressDrag !== void 0) entry.cleanupProgressDrag = cleanupProgressDrag;
	if (cleanupTooltip !== void 0) entry.cleanupTooltip = cleanupTooltip;
	registry.set(task.id, entry);
}
function renderMilestone(layer, svgLayer, task, layout, selectedId, registry, cbs, state, tooltipEl) {
	const selected = task.id === selectedId;
	const readonly = task.readonly === true;
	const size = MILESTONE_HALF * 2;
	const diamond = el("div");
	diamond.className = `gantt-milestone${selected ? " gantt-shape--selected" : ""}`;
	css(diamond, {
		position: "absolute",
		left: `${layout.x - MILESTONE_HALF}px`,
		top: `${layout.y + (layout.height - size) / 2}px`,
		width: `${size}px`,
		height: `${size}px`,
		background: "var(--gantt-milestone)",
		transform: "rotate(45deg)",
		cursor: readonly ? "default" : "pointer",
		zIndex: "4"
	});
	diamond.tabIndex = 0;
	diamond.setAttribute("role", "button");
	diamond.setAttribute("aria-label", ariaLabel(state.locale, "ariaMilestone", task.text));
	diamond.setAttribute("aria-pressed", String(selected));
	diamond.dataset["taskId"] = String(task.id);
	diamond.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			cbs.onTaskClick?.(task.id);
		}
	});
	const labelEl = el("span");
	css(labelEl, {
		position: "absolute",
		left: "50%",
		top: "110%",
		transform: "translate(-50%, 0) rotate(-45deg)",
		fontSize: "var(--gantt-font-size-xs)",
		fontWeight: "var(--gantt-font-weight-semibold)",
		color: "var(--gantt-milestone)",
		whiteSpace: "nowrap",
		pointerEvents: "none"
	});
	labelEl.textContent = task.text;
	diamond.append(labelEl);
	layer.insertBefore(diamond, svgLayer);
	bindMilestoneTask(diamond, task);
	const dummy = el("div");
	let cleanupDrag;
	if (!readonly) cleanupDrag = attachMilestoneClick(diamond, task.id, cbs);
	else diamond.addEventListener("click", (event) => {
		if (event.detail === 2) cbs.onTaskDoubleClick?.({
			id: task.id,
			task: toTask(task)
		});
		else cbs.onTaskClick?.(task.id);
	});
	let cleanupLinkHandles;
	if (state.linkCreationEnabled) {
		const diamondCenterY = layout.y + layout.height / 2;
		const linkHandle = createEndpointHandle();
		linkHandle.style.left = `${layout.x}px`;
		linkHandle.style.top = `${diamondCenterY}px`;
		linkHandle.style.background = "var(--gantt-milestone)";
		layer.insertBefore(linkHandle, svgLayer);
		const cleanupLink = attachLinkEndpointHandle(linkHandle, task.id, layout.x, diamondCenterY, svgLayer, layer, cbs);
		const onDiamondEnter = () => {
			linkHandle.style.opacity = "1";
			linkHandle.style.transform = "translate(-50%, -50%) scale(1)";
		};
		const onDiamondLeave = () => {
			linkHandle.style.opacity = "0";
			linkHandle.style.transform = "translate(-50%, -50%) scale(0.8)";
		};
		diamond.addEventListener("mouseenter", onDiamondEnter);
		diamond.addEventListener("mouseleave", onDiamondLeave);
		cleanupLinkHandles = () => {
			cleanupLink();
			diamond.removeEventListener("mouseenter", onDiamondEnter);
			diamond.removeEventListener("mouseleave", onDiamondLeave);
		};
	}
	const onTooltipEnter = () => {
		const content = cbs.onTooltipText?.({
			id: task.id,
			task: toTask(task)
		});
		if (content && content.length > 0) {
			tooltipEl.innerHTML = content;
			tooltipEl.style.display = "";
		} else tooltipEl.style.display = "none";
	};
	const onTooltipMove = (e) => {
		const offsetX = 12;
		const offsetY = -8;
		let left = e.clientX + offsetX;
		let top = e.clientY + offsetY;
		const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 4;
		const maxTop = window.innerHeight - tooltipEl.offsetHeight - 4;
		left = Math.max(4, Math.min(left, maxLeft));
		top = Math.max(4, Math.min(top, maxTop));
		tooltipEl.style.left = `${left}px`;
		tooltipEl.style.top = `${top}px`;
	};
	const onTooltipLeave = () => {
		tooltipEl.style.display = "none";
	};
	diamond.addEventListener("mouseenter", onTooltipEnter);
	diamond.addEventListener("mousemove", onTooltipMove);
	diamond.addEventListener("mouseleave", onTooltipLeave);
	const cleanupTooltip = () => {
		diamond.removeEventListener("mouseenter", onTooltipEnter);
		diamond.removeEventListener("mousemove", onTooltipMove);
		diamond.removeEventListener("mouseleave", onTooltipLeave);
	};
	const entry = {
		bar: diamond,
		resizeHandle: dummy
	};
	if (cleanupDrag !== void 0) entry.cleanupDrag = cleanupDrag;
	if (cleanupLinkHandles !== void 0) entry.cleanupLinkHandles = cleanupLinkHandles;
	if (cleanupTooltip !== void 0) entry.cleanupTooltip = cleanupTooltip;
	registry.set(task.id, entry);
}
/**
* Full render of the right pane.
* Grid lines and stripes are rebuilt each call (cheap — no event listeners).
* Bars are rebuilt each call with fresh drag listeners (old ones cleaned up first).
*
* @param refs - The right pane DOM references.
* @param state - The current chart state.
* @param cbs - The chart callbacks.
*/
function renderRightPane(refs, state, cbs) {
	const { allRows, layouts, links, mapper, scale, viewportStart, viewportEnd, totalWidth, selectedId, highlightLinkedDependenciesOnSelect, paddingTop, paddingBottom, startIndex } = state;
	const { stripeContainer, absoluteLayer, svgLayer, barRegistry } = refs;
	const rowCount = allRows.length;
	const contentHeight = totalContentHeight(rowCount);
	const visibleRows = allRows.slice(state.startIndex, state.endIndex + 1);
	clearChildren(stripeContainer);
	css(stripeContainer, { width: `${totalWidth}px` });
	if (paddingTop > 0) {
		const s = el("div");
		s.style.height = `${paddingTop}px`;
		stripeContainer.append(s);
	}
	for (let i = 0; i < visibleRows.length; i++) {
		const rowIdx = startIndex + i;
		const stripe = el("div");
		css(stripe, {
			height: `${ROW_HEIGHT}px`,
			background: rowIdx % 2 === 0 ? "var(--gantt-bg)" : "var(--gantt-stripe)",
			borderBottom: "1px solid var(--gantt-border)"
		});
		stripeContainer.append(stripe);
	}
	if (paddingBottom > 0) {
		const s = el("div");
		s.style.height = `${paddingBottom}px`;
		stripeContainer.append(s);
	}
	css(absoluteLayer, {
		width: `${totalWidth}px`,
		height: `${contentHeight}px`
	});
	const toRemove = [];
	for (const child of [...absoluteLayer.children]) if (child !== svgLayer) toRemove.push(child);
	for (const node of toRemove) absoluteLayer.removeChild(node);
	hideGhostLine(svgLayer);
	for (const { cleanupDrag, cleanupLinkHandles, cleanupProgressDrag } of barRegistry.values()) {
		cleanupDrag?.();
		cleanupLinkHandles?.();
		cleanupProgressDrag?.();
	}
	barRegistry.clear();
	if (scale === "day") renderSpecialDayBackgrounds(absoluteLayer, svgLayer, state, contentHeight);
	let gridCur = snapToScaleBoundary(viewportStart, scale);
	while (gridCur <= viewportEnd) {
		const x = mapper.toX(gridCur);
		const line = el("div");
		css(line, {
			position: "absolute",
			left: `${x}px`,
			top: "0",
			width: "1px",
			height: `${contentHeight}px`,
			background: "var(--gantt-grid-line)",
			pointerEvents: "none"
		});
		absoluteLayer.insertBefore(line, svgLayer);
		gridCur = nextScaleBoundary(gridCur, scale);
	}
	const todayX = mapper.toX(/* @__PURE__ */ new Date());
	const todayLineWidth = 2;
	if (state.showTodayMarker && todayX >= 0 && todayX <= totalWidth - todayLineWidth) {
		const todayLine = el("div");
		todayLine.className = "gantt-today-marker";
		css(todayLine, {
			position: "absolute",
			left: `${todayX}px`,
			top: "0",
			width: `${todayLineWidth}px`,
			height: `${contentHeight}px`,
			background: "var(--gantt-today)",
			pointerEvents: "none",
			zIndex: "5"
		});
		absoluteLayer.insertBefore(todayLine, svgLayer);
	}
	const visibleTaskIds = new Set(visibleRows.map((task) => task.id));
	for (const task of visibleRows) {
		const layout = layouts.get(task.id);
		if (layout === void 0) continue;
		if (layout.kind === "milestone") renderMilestone(absoluteLayer, svgLayer, task, layout, selectedId, barRegistry, cbs, state, refs.tooltipEl);
		else renderBar(absoluteLayer, svgLayer, task, layout, selectedId, barRegistry, state, cbs, refs.tooltipEl);
	}
	updateDependencyLayer(svgLayer, links.filter((link) => visibleTaskIds.has(link.sourceTaskId) && visibleTaskIds.has(link.targetTaskId)), totalWidth, contentHeight, selectedId, highlightLinkedDependenciesOnSelect, cbs);
}
//#endregion
//#region src/lib/vanilla/utils.ts
function buildTaskIndex(tasks) {
	const index = /* @__PURE__ */ new Map();
	for (let i = 0; i < tasks.length; i++) {
		const task = tasks[i];
		if (task !== void 0) index.set(task.id, i);
	}
	return index;
}
function toIsoDate(date) {
	return date.toISOString().slice(0, 10);
}
function buildSpecialDayIndex(specialDays) {
	const map = /* @__PURE__ */ new Map();
	for (const specialDay of specialDays) {
		const parsed = SpecialDaySchema.parse(specialDay);
		const isoDate = toIsoDate(parseDate(parsed.date));
		map.set(isoDate, {
			kind: parsed.kind,
			...parsed.label === void 0 ? {} : { label: parsed.label },
			...parsed.className === void 0 ? {} : { className: parsed.className }
		});
	}
	return map;
}
function normalizeWeekendDays(days) {
	if (days === void 0) return /* @__PURE__ */ new Set([0, 6]);
	const normalized = /* @__PURE__ */ new Set();
	for (const day of days) {
		if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("weekendDays must contain integers in range 0..6");
		normalized.add(day);
	}
	return normalized;
}
function getExpandableTaskIds(tasks) {
	const roots = buildTaskTree(tasks);
	const expandableIds = /* @__PURE__ */ new Set();
	const stack = [...roots];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === void 0) continue;
		if (node.children.length > 0) expandableIds.add(node.id);
		for (const child of node.children) stack.push(child);
	}
	return expandableIds;
}
function getInitialExpandedIds(tasks) {
	const expandableIds = getExpandableTaskIds(tasks);
	const expandedIds = /* @__PURE__ */ new Set();
	for (const task of tasks) if (task.kind === "project" && task.open && expandableIds.has(task.id)) expandedIds.add(task.id);
	return expandedIds;
}
//#endregion
//#region src/lib/vanilla/splitter.ts
const MIN_PANE_WIDTH$1 = 96;
function attachSplitter(splitterHandle, leftPane, container, timelineMinWidth, onDragEnd) {
	splitterHandle.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const startWidth = Number.parseFloat(leftPane.style.width) || 0;
		function onMove(me) {
			const dx = me.clientX - startX;
			let newWidth = startWidth + dx;
			const hostWidth = container.clientWidth;
			if (hostWidth > 0) newWidth = Math.max(MIN_PANE_WIDTH$1, Math.min(newWidth, hostWidth - timelineMinWidth));
			newWidth = Math.max(MIN_PANE_WIDTH$1, newWidth);
			leftPane.style.width = `${newWidth}px`;
			leftPane.style.minWidth = `${newWidth}px`;
			leftPane.style.maxWidth = `${newWidth}px`;
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			onDragEnd(Number.parseFloat(leftPane.style.width));
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	});
}
const DESKTOP_MIN_RATIO = .25;
const DESKTOP_MAX_RATIO = .4;
const MIN_PANE_WIDTH = 96;
function computeLeftPaneWidth(options) {
	const { hostWidth, defaultWidth, userSplitWidth, explicitOptWidth, responsiveSplitPane, mobileBreakpoint, mobileLeftPaneMinWidth, mobileLeftPaneMaxRatio, timelineMinWidth } = options;
	let width = defaultWidth;
	if (hostWidth <= 0) return width;
	if (userSplitWidth !== null) width = userSplitWidth;
	else if (explicitOptWidth !== void 0) width = explicitOptWidth;
	else if (responsiveSplitPane && hostWidth <= mobileBreakpoint) {
		const ratioWidth = Math.floor(hostWidth * mobileLeftPaneMaxRatio);
		width = Math.min(defaultWidth, Math.max(mobileLeftPaneMinWidth, ratioWidth));
	} else {
		const minProportional = Math.floor(hostWidth * DESKTOP_MIN_RATIO);
		const maxProportional = Math.floor(hostWidth * DESKTOP_MAX_RATIO);
		width = Math.min(maxProportional, Math.max(defaultWidth, minProportional));
	}
	const maxAllowed = Math.max(MIN_PANE_WIDTH, hostWidth - timelineMinWidth);
	width = Math.min(width, maxAllowed);
	return Math.max(MIN_PANE_WIDTH, Math.floor(width));
}
//#endregion
//#region src/lib/vanilla/gantt-chart.ts
const HEADER_H = 52;
const OVERSCAN = 4;
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
var GanttChart = class {
	#container;
	#opts;
	#callbacks;
	#input = null;
	#scale;
	#selectedId = null;
	#scrollTop = 0;
	#rafPending = false;
	#rafId = null;
	#destroyed = false;
	#dragOriginals = /* @__PURE__ */ new Map();
	#taskIndex;
	#lastGridClick = null;
	#userSplitWidth = null;
	#height;
	#locale;
	#timelineMinWidth;
	#columns;
	#leftPaneDefaultWidth;
	#showAddTaskButton;
	#weekendDays;
	#specialDaysByDate;
	#expandedIds;
	#root;
	#scrollEl;
	#leftPane;
	#leftHeader;
	#leftBody;
	#rightPane;
	#rightHeader;
	#rightPaneRefs;
	#cbs;
	#resizeObserver = null;
	#columnResizeCleanup;
	/**
	* Constructs a new chart, builds the DOM, and wires internal event handling.
	* Data must be loaded via {@link update} before the chart renders.
	* Callbacks must be set via {@link setCallbacks} before user interactions are handled.
	*
	* @param container - The host `HTMLElement` the chart will be appended to.
	* @param opts - Configuration options.
	*/
	constructor(container, opts = {}) {
		this.#container = container;
		this.#scale = opts.scale ?? "day";
		this.#opts = opts;
		this.#callbacks = {};
		this.#taskIndex = /* @__PURE__ */ new Map();
		this.#locale = resolveChartLocale(opts.locale);
		this.#columns = opts.gridColumns ?? gridColumnDefaults(this.#locale);
		this.#showAddTaskButton = opts.showAddTaskButton ?? true;
		this.#syncActionsColumnVisibility();
		this.#leftPaneDefaultWidth = opts.leftPaneWidth ?? gridNaturalWidth(this.#columns);
		this.#height = opts.height ?? 500;
		this.#timelineMinWidth = opts.timelineMinWidth ?? 220;
		this.#weekendDays = normalizeWeekendDays(opts.weekendDays ?? this.#locale.weekendDays);
		this.#specialDaysByDate = buildSpecialDayIndex(opts.specialDays ?? []);
		this.#expandedIds = /* @__PURE__ */ new Set();
		this.#cbs = this.#buildCallbackAdapter();
		this.#buildDom();
		this.#wireEvents();
		container.append(this.#root);
		this.#applyTheme();
		this.#applyResponsivePaneStyles();
		this.#setupResizeObserver();
	}
	#buildCallbackAdapter() {
		return {
			onTaskClick: (id) => {
				if (this.#selectedId === id) return;
				this.#selectedId = id;
				if (this.#selectedId !== null) {
					const task = this.#findTask(this.#selectedId);
					if (task !== void 0) this.#callbacks.onTaskClick?.({
						task,
						instance: this
					});
				}
				this.#scheduleRender();
			},
			onTaskDoubleClick: (payload) => {
				this.#callbacks.onTaskDoubleClick?.({
					task: payload.task,
					instance: this
				});
			},
			onTaskEditIntent: (payload) => {
				this.#callbacks.onTaskDoubleClick?.({
					task: payload.task,
					instance: this
				});
			},
			onTaskMove: (payload) => {
				if (!this.#dragOriginals.has(payload.id)) {
					const task = this.#input?.tasks.find((t) => t.id === payload.id);
					if (task !== void 0) this.#dragOriginals.set(payload.id, task);
				}
				const iso = payload.startDate.toISOString().slice(0, 10);
				this.#patchTask(payload.id, { startDate: iso });
				this.#scheduleRender();
			},
			_onTaskMoveFinal: async (payload) => {
				const task = this.#findTask(payload.id);
				if (task !== void 0) {
					const newEndDate = task.kind !== "milestone" ? parseDate(task.endDate) : payload.startDate;
					const result = this.#callbacks.onTaskMove?.({
						task,
						newStartDate: payload.startDate,
						newEndDate,
						instance: this
					});
					if (result instanceof Promise) {
						if (!await result) {
							const original = this.#dragOriginals.get(payload.id);
							if (original !== void 0) this.#patchTask(payload.id, { startDate: original.startDate });
						}
					} else if (!result) {
						const original = this.#dragOriginals.get(payload.id);
						if (original !== void 0) this.#patchTask(payload.id, { startDate: original.startDate });
					}
				}
				this.#dragOriginals.clear();
				this.#scheduleRender();
				return true;
			},
			onTaskResize: (payload) => {
				if (!this.#dragOriginals.has(payload.id)) {
					const task = this.#input?.tasks.find((t) => t.id === payload.id);
					if (task !== void 0) this.#dragOriginals.set(payload.id, task);
				}
				this.#patchTask(payload.id, { endDate: payload.endDate });
				this.#scheduleRender();
			},
			_onTaskResizeFinal: async (payload) => {
				const task = this.#findTask(payload.id);
				if (task !== void 0 && task.kind !== "milestone") {
					const newStartDate = parseDate(task.startDate);
					const newEndDate = parseDate(task.endDate);
					const newDurationHours = diffHours(newEndDate, newStartDate);
					const result = this.#callbacks.onTaskResize?.({
						task,
						newDurationHours,
						newStartDate,
						newEndDate,
						instance: this
					});
					if (result instanceof Promise) {
						if (!await result) {
							const original = this.#dragOriginals.get(payload.id);
							if (original !== void 0 && original.kind !== "milestone") this.#patchTask(payload.id, { endDate: original.endDate });
						}
					} else if (!result) {
						const original = this.#dragOriginals.get(payload.id);
						if (original !== void 0 && original.kind !== "milestone") this.#patchTask(payload.id, { endDate: original.endDate });
					}
				}
				this.#dragOriginals.clear();
				this.#scheduleRender();
				return true;
			},
			onTaskProgressDrag: (payload) => {
				if (!this.#dragOriginals.has(payload.id)) {
					const task = this.#input?.tasks.find((t) => t.id === payload.id);
					if (task !== void 0) this.#dragOriginals.set(payload.id, task);
				}
				this.#patchTask(payload.id, { percentComplete: payload.percentComplete });
				this.#scheduleRender();
			},
			_onTaskProgressDragFinal: async (payload) => {
				const task = this.#findTask(payload.id);
				if (task !== void 0) {
					const result = this.#callbacks.onProgressChange?.({
						task,
						newPercentComplete: payload.percentComplete,
						instance: this
					});
					if (result instanceof Promise) {
						if (!await result) {
							const original = this.#dragOriginals.get(payload.id);
							if (original !== void 0 && original.kind !== "milestone") this.#patchTask(payload.id, { percentComplete: original.percentComplete });
						}
					} else if (!result) {
						const original = this.#dragOriginals.get(payload.id);
						if (original !== void 0 && original.kind !== "milestone") this.#patchTask(payload.id, { percentComplete: original.percentComplete });
					}
				}
				this.#dragOriginals.clear();
				this.#scheduleRender();
				return true;
			},
			onTaskAdd: (parentId) => {
				const parentTask = this.#findTask(parentId);
				if (parentTask !== void 0) this.#callbacks.onTaskAdd?.({
					parentTask,
					instance: this
				});
			},
			onLeftPaneWidthChange: (width) => {
				this.#callbacks.onLeftPaneWidthChange?.({
					width,
					instance: this
				});
			},
			onGridColumnsChange: (updatedColumns) => {
				this.#callbacks.onGridColumnsChange?.({
					columns: updatedColumns,
					instance: this
				});
			},
			onLinkCreate: (payload) => {
				const sourceTask = this.#findTask(payload.sourceTaskId);
				const targetTask = this.#findTask(payload.targetTaskId);
				if (sourceTask !== void 0 && targetTask !== void 0) this.#callbacks.onLinkCreate?.({
					type: "FS",
					sourceTask,
					targetTask,
					instance: this
				});
			},
			onLinkClick: (payload) => {
				this.#callbacks.onLinkClick?.({
					link: payload,
					instance: this
				});
			},
			onLinkDblClick: (payload) => {
				this.#callbacks.onLinkDblClick?.({
					link: payload,
					instance: this
				});
			},
			onTooltipText: (payload) => this.#callbacks.onTooltipText?.({
				task: payload.task,
				instance: this
			}) ?? null
		};
	}
	/**
	* Sets or replaces the chart's user-facing callbacks.
	* Does not trigger a re-render.
	*
	* @param cbs - The {@link GanttCallbacks} to register.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	setCallbacks(cbs) {
		this.#assertAlive();
		this.#callbacks = cbs;
		this.#cbs = this.#buildCallbackAdapter();
	}
	/**
	* Replaces the full dataset and re-renders.
	*
	* @param newInput - The new {@link GanttInput} to apply.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	update(newInput) {
		this.#assertAlive();
		const input = GanttInputSchema.parse(newInput);
		validateLinkRefs(input.tasks, input.links);
		detectCycles(input.tasks, input.links);
		this.#input = structuredClone(input);
		this.#taskIndex = buildTaskIndex(this.#input.tasks);
		this.#expandedIds = getInitialExpandedIds(this.#input.tasks);
		if (this.#rafPending && this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#rafPending = false;
		}
		this.#render();
	}
	/**
	* Merges the supplied options into the current configuration and re-renders
	* only the panes affected by the changed options.
	*
	* @param opts - A partial {@link GanttOptions} object. Only the keys present
	*               in this parameter are updated; missing keys keep their
	*               previous values.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	setOptions(opts) {
		this.#assertAlive();
		Object.assign(this.#opts, opts);
		this.#scale = this.#opts.scale ?? "day";
		let columnsChanged = false;
		if (opts.locale !== void 0) {
			this.#locale = resolveChartLocale(opts.locale);
			if (this.#opts.gridColumns === void 0) {
				this.#columns = gridColumnDefaults(this.#locale);
				this.#leftPaneDefaultWidth = gridNaturalWidth(this.#columns);
				columnsChanged = true;
			}
			if (this.#opts.weekendDays === void 0) this.#weekendDays = normalizeWeekendDays(this.#locale.weekendDays);
		}
		if (opts.gridColumns !== void 0) {
			this.#columns = opts.gridColumns;
			this.#leftPaneDefaultWidth = this.#opts.leftPaneWidth ?? gridNaturalWidth(this.#columns);
			columnsChanged = true;
		}
		if (columnsChanged && this.#input !== null) this.#rebuildLeftPaneHeader();
		if (opts.leftPaneWidth !== void 0) this.#leftPaneDefaultWidth = opts.leftPaneWidth;
		if (opts.height !== void 0) {
			this.#height = opts.height;
			this.#root.style.height = `${this.#height}px`;
		}
		if (opts.timelineMinWidth !== void 0) {
			this.#timelineMinWidth = opts.timelineMinWidth;
			this.#rightPane.style.minWidth = `${this.#timelineMinWidth}px`;
		}
		if (opts.weekendDays !== void 0) this.#weekendDays = normalizeWeekendDays(opts.weekendDays);
		if (opts.specialDays !== void 0) this.#specialDaysByDate = buildSpecialDayIndex(opts.specialDays);
		if (opts.theme !== void 0) this.#applyTheme();
		if (opts.showAddTaskButton !== void 0) {
			this.#showAddTaskButton = opts.showAddTaskButton;
			this.#syncActionsColumnVisibility();
			const naturalWidth = gridNaturalWidth(this.#columns);
			if (naturalWidth !== this.#leftPaneDefaultWidth) {
				this.#leftPaneDefaultWidth = naturalWidth;
				columnsChanged = true;
				this.#rebuildLeftPaneHeader();
			}
		}
		const hasLayoutChange = opts.leftPaneWidth !== void 0 || opts.responsiveSplitPane !== void 0 || opts.mobileBreakpoint !== void 0 || opts.mobileLeftPaneMinWidth !== void 0 || opts.mobileLeftPaneMaxRatio !== void 0 || opts.timelineMinWidth !== void 0;
		if (hasLayoutChange) this.#applyResponsivePaneStyles();
		const hasLeftPaneChange = columnsChanged || opts.locale !== void 0 || opts.showAddTaskButton !== void 0;
		const hasRightPaneChange = opts.scale !== void 0 || opts.showTodayMarker !== void 0 || opts.showWeekends !== void 0 || opts.weekendDays !== void 0 || opts.specialDays !== void 0 || opts.highlightLinkedDependenciesOnSelect !== void 0 || opts.linkCreationEnabled !== void 0 || opts.progressDragEnabled !== void 0 || opts.viewportStart !== void 0 || opts.viewportEnd !== void 0 || opts.locale !== void 0 || opts.timelineMinWidth !== void 0;
		if (!(hasLeftPaneChange || hasRightPaneChange || hasLayoutChange)) return;
		if (this.#rafPending && this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#rafPending = false;
		}
		if (hasLeftPaneChange && !hasRightPaneChange) this.#renderGrid();
		else if (!hasLeftPaneChange && hasRightPaneChange) this.#renderTimeline();
		else this.#render();
	}
	/**
	* Programmatically selects or deselects a task.
	*
	* @param id - The task ID to select, or `null` to clear the selection.
	* @param fireCallback - Whether to fire the `onTaskClick` callback. Default `false`.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	select(id, fireCallback = false) {
		this.#assertAlive();
		if (id === null) this.#selectedId = null;
		else {
			const task = this.#input?.tasks.find((t) => t.id === id);
			if (task !== void 0 && fireCallback) this.#callbacks.onTaskClick?.({
				task,
				instance: this
			});
			this.#selectedId = id;
		}
		if (this.#rafPending && this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#rafPending = false;
		}
		this.#render();
	}
	/**
	* Collapses all expandable groups in the task tree.
	*
	* @param fireCallback - Whether to fire the `onExpandCollapseAll` callback. Default `false`.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	collapseAll(fireCallback = false) {
		this.#assertAlive();
		const changed = fireCallback ? this.#buildExpandCollapseAllPayload(false) : [];
		this.#expandedIds.clear();
		if (this.#rafPending && this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#rafPending = false;
		}
		this.#render();
		if (changed.length > 0) this.#callbacks.onExpandCollapseAll?.({
			tasks: changed,
			instance: this
		});
	}
	/**
	* Expands all expandable groups in the task tree.
	*
	* @param fireCallback - Whether to fire the `onExpandCollapseAll` callback. Default `false`.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	expandAll(fireCallback = false) {
		this.#assertAlive();
		const changed = fireCallback ? this.#buildExpandCollapseAllPayload(true) : [];
		this.#expandedIds.clear();
		if (this.#input !== null) for (const id of getExpandableTaskIds(this.#input.tasks)) this.#expandedIds.add(id);
		if (this.#rafPending && this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#rafPending = false;
		}
		this.#render();
		if (changed.length > 0) this.#callbacks.onExpandCollapseAll?.({
			tasks: changed,
			instance: this
		});
	}
	#buildExpandCollapseAllPayload(open) {
		if (this.#input === null) return [];
		const expandableIds = getExpandableTaskIds(this.#input.tasks);
		const changed = [];
		for (const id of expandableIds) if (this.#expandedIds.has(id) !== open) {
			const task = this.#findTask(id);
			if (task !== void 0) changed.push(task.kind === "project" ? {
				...task,
				open
			} : { ...task });
		}
		return changed;
	}
	/**
	* Returns the current expand/collapse state of every expandable node
	* (project tasks that have children). The result is ordered by the
	* input task list order.
	*
	* @returns An array of `{id, open}` objects for expandable nodes only.
	* @throws {GanttError} When the instance has been destroyed.
	*/
	getOpenStates() {
		this.#assertAlive();
		if (this.#input === null) return [];
		const expandableIds = getExpandableTaskIds(this.#input.tasks);
		const result = [];
		for (const task of this.#input.tasks) if (expandableIds.has(task.id)) result.push({
			id: task.id,
			open: this.#expandedIds.has(task.id)
		});
		return result;
	}
	/**
	* Removes the chart DOM and internal listeners, rendering the instance
	* unusable. Subsequent calls to any public method will throw.
	*/
	destroy() {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#scrollEl.removeEventListener("scroll", this.#onScroll);
		if (this.#resizeObserver !== null) this.#resizeObserver.disconnect();
		else window.removeEventListener("resize", this.#applyResponsivePaneStyles);
		if (this.#rafId !== null) cancelAnimationFrame(this.#rafId);
		this.#columnResizeCleanup();
		for (const { cleanupDrag, cleanupLinkHandles, cleanupProgressDrag, cleanupTooltip } of this.#rightPaneRefs.barRegistry.values()) {
			cleanupDrag?.();
			cleanupLinkHandles?.();
			cleanupProgressDrag?.();
			cleanupTooltip?.();
		}
		clearChildren(this.#container);
	}
	#patchTask(id, patch) {
		if (this.#input === null) return;
		const index = this.#taskIndex.get(id);
		if (index === void 0) return;
		const target = this.#input.tasks[index];
		if (target === void 0) return;
		this.#input.tasks[index] = {
			...target,
			...patch
		};
	}
	#findTask(id) {
		return this.#input?.tasks.find((t) => t.id === id);
	}
	#syncActionsColumnVisibility() {
		const actionsCol = this.#columns.find((c) => c.id === "actions");
		if (actionsCol !== void 0) {
			if (this.#showAddTaskButton) delete actionsCol.visible;
			else actionsCol.visible = false;
		}
	}
	#handleGridClick = (payload) => {
		const now = Date.now();
		const prev = this.#lastGridClick;
		if (prev !== null && prev.id === payload.id && now - prev.atMs <= 350) {
			this.#lastGridClick = null;
			this.#cbs.onTaskDoubleClick?.({
				id: payload.id,
				task: payload.task
			});
			return;
		}
		this.#lastGridClick = {
			id: payload.id,
			atMs: now
		};
		this.#cbs.onTaskClick?.(payload.id);
	};
	#onScroll = () => {
		({scrollTop: this.#scrollTop} = this.#scrollEl);
		this.#scheduleRender();
	};
	#applyResponsivePaneStyles = () => {
		const computedWidth = computeLeftPaneWidth({
			hostWidth: Math.max(0, this.#container.clientWidth),
			defaultWidth: this.#leftPaneDefaultWidth,
			userSplitWidth: this.#userSplitWidth,
			explicitOptWidth: this.#opts.leftPaneWidth,
			responsiveSplitPane: this.#opts.responsiveSplitPane ?? true,
			mobileBreakpoint: this.#opts.mobileBreakpoint ?? 768,
			mobileLeftPaneMinWidth: this.#opts.mobileLeftPaneMinWidth ?? 140,
			mobileLeftPaneMaxRatio: this.#opts.mobileLeftPaneMaxRatio ?? .45,
			timelineMinWidth: this.#timelineMinWidth
		});
		this.#leftPane.style.width = `${computedWidth}px`;
		this.#leftPane.style.minWidth = `${computedWidth}px`;
		this.#leftPane.style.maxWidth = `${computedWidth}px`;
		this.#rightPane.style.minWidth = `${this.#timelineMinWidth}px`;
	};
	#computeState(input) {
		const allRows = flattenTree(buildTaskTree(input.tasks), this.#expandedIds);
		const [vpStart, vpEnd] = this.#opts.viewportStart !== void 0 && this.#opts.viewportEnd !== void 0 ? [this.#opts.viewportStart, this.#opts.viewportEnd] : deriveViewport(allRows, 48);
		const weekStartsOn = this.#locale.weekStartsOn ?? 1;
		const renderViewportEnd = ceilToScaleBoundary(vpEnd, this.#scale, weekStartsOn);
		const mapper = createPixelMapper(this.#scale, vpStart);
		const totalWidth = Math.ceil(mapper.toX(renderViewportEnd)) + 1;
		const layouts = computeLayout(allRows, mapper);
		const links = routeLinks(input.links, layouts);
		const containerH = this.#height - HEADER_H;
		const rowCount = allRows.length;
		const startIndex = Math.max(0, Math.floor(this.#scrollTop / ROW_HEIGHT) - OVERSCAN);
		const endIndex = Math.min(rowCount - 1, Math.ceil((this.#scrollTop + containerH) / ROW_HEIGHT) + OVERSCAN - 1);
		const paddingTop = startIndex * ROW_HEIGHT;
		const paddingBottom = Math.max(0, (rowCount - 1 - endIndex) * ROW_HEIGHT);
		return {
			input,
			scale: this.#scale,
			highlightLinkedDependenciesOnSelect: this.#opts.highlightLinkedDependenciesOnSelect ?? false,
			linkCreationEnabled: this.#opts.linkCreationEnabled ?? false,
			progressDragEnabled: this.#opts.progressDragEnabled ?? false,
			expandedIds: this.#expandedIds,
			selectedId: this.#selectedId,
			scrollTop: this.#scrollTop,
			allRows,
			mapper,
			viewportStart: vpStart,
			viewportEnd: renderViewportEnd,
			totalWidth,
			layouts,
			links,
			startIndex,
			endIndex,
			paddingTop,
			paddingBottom,
			showWeekends: this.#opts.showWeekends ?? true,
			showTodayMarker: this.#opts.showTodayMarker ?? true,
			weekendDays: this.#weekendDays,
			specialDaysByDate: this.#specialDaysByDate,
			locale: this.#locale
		};
	}
	#render = () => {
		this.#rafPending = false;
		const input = this.#input;
		if (input === null) return;
		const state = this.#computeState(input);
		renderTimeHeader(this.#rightHeader, state);
		this.#renderGridInternal(state);
		renderRightPane(this.#rightPaneRefs, state, this.#cbs);
	};
	#renderGrid = () => {
		this.#rafPending = false;
		const input = this.#input;
		if (input === null) return;
		this.#renderGridInternal(this.#computeState(input));
	};
	#renderGridInternal(state) {
		renderLeftPane(this.#leftBody, state, {
			onToggle: (id) => {
				const expanded = !this.#expandedIds.has(id);
				if (expanded) this.#expandedIds.add(id);
				else this.#expandedIds.delete(id);
				const task = this.#findTask(id);
				if (task !== void 0) {
					const payload = task.kind === "project" ? {
						...task,
						open: expanded
					} : { ...task };
					this.#callbacks.onExpandCollapse?.({
						task: payload,
						instance: this
					});
				}
				this.#scheduleRender();
			},
			onTaskClick: (id) => this.#cbs.onTaskClick?.(id),
			onRowClick: (payload) => {
				this.#handleGridClick(payload);
			},
			onTaskDoubleClick: (payload) => this.#cbs.onTaskDoubleClick?.(payload),
			onTaskAdd: (id) => this.#cbs.onTaskAdd?.(id)
		}, this.#columns, this.#showAddTaskButton);
	}
	#renderTimeline = () => {
		this.#rafPending = false;
		const input = this.#input;
		if (input === null) return;
		const state = this.#computeState(input);
		renderTimeHeader(this.#rightHeader, state);
		renderRightPane(this.#rightPaneRefs, state, this.#cbs);
	};
	#rebuildLeftPaneHeader() {
		this.#columnResizeCleanup();
		clearChildren(this.#leftHeader);
		const headerEl = buildLeftPaneHeader(this.#columns, this.#locale);
		this.#wireHeaderTreeControls(headerEl);
		this.#leftHeader.append(headerEl);
		this.#columnResizeCleanup = setupColumnResize(headerEl, this.#leftBody, this.#columns, (updated) => {
			this.#cbs.onGridColumnsChange?.(updated);
		});
	}
	#wireHeaderTreeControls(headerEl) {
		const expandBtn = headerEl.querySelector(".gantt-header-expand-btn");
		const collapseBtn = headerEl.querySelector(".gantt-header-collapse-btn");
		if (expandBtn !== null) expandBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.expandAll(true);
		});
		if (collapseBtn !== null) collapseBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.collapseAll(true);
		});
	}
	#scheduleRender() {
		if (this.#rafPending || this.#destroyed) return;
		this.#rafPending = true;
		this.#rafId = requestAnimationFrame(this.#render);
	}
	#applyTheme() {
		const theme = this.#opts.theme ?? "system";
		this.#container.dataset["theme"] = theme;
	}
	#assertAlive() {
		if (this.#destroyed) throw new GanttError("INSTANCE_DESTROYED", "Gantt instance was destroyed");
	}
	#buildDom() {
		const root = el("div");
		root.className = "gantt-root";
		css(root, {
			height: `${this.#height}px`,
			overflow: "hidden",
			display: "flex",
			flexDirection: "column",
			fontFamily: "var(--gantt-font)",
			background: "var(--gantt-bg)"
		});
		this.#root = root;
		const scrollEl = el("div");
		css(scrollEl, {
			flex: "1",
			overflow: "auto",
			position: "relative",
			display: "flex"
		});
		root.append(scrollEl);
		this.#scrollEl = scrollEl;
		const leftPane = el("div");
		leftPane.dataset["pane"] = "left";
		css(leftPane, {
			width: `${this.#leftPaneDefaultWidth}px`,
			flexShrink: "0",
			position: "sticky",
			left: "0",
			zIndex: "10",
			background: "var(--gantt-bg)",
			borderRight: "1px solid var(--gantt-border)"
		});
		this.#leftPane = leftPane;
		const leftHeader = el("div");
		css(leftHeader, {
			position: "sticky",
			top: "0",
			zIndex: "11",
			background: "var(--gantt-header-bg)"
		});
		const headerEl = buildLeftPaneHeader(this.#columns, this.#locale);
		this.#wireHeaderTreeControls(headerEl);
		leftHeader.append(headerEl);
		leftPane.append(leftHeader);
		this.#leftHeader = leftHeader;
		const leftBody = el("div");
		leftPane.append(leftBody);
		this.#leftBody = leftBody;
		this.#columnResizeCleanup = setupColumnResize(headerEl, leftBody, this.#columns, (updated) => {
			this.#cbs.onGridColumnsChange?.(updated);
		});
		scrollEl.append(leftPane);
		const rightPane = el("div");
		rightPane.dataset["pane"] = "right";
		css(rightPane, {
			flexShrink: "0",
			position: "relative",
			minWidth: `${this.#timelineMinWidth}px`
		});
		this.#rightPane = rightPane;
		const rightHeader = el("div");
		css(rightHeader, {
			position: "sticky",
			top: "0",
			zIndex: "9",
			background: "var(--gantt-header-bg)"
		});
		rightPane.append(rightHeader);
		this.#rightHeader = rightHeader;
		this.#rightPaneRefs = createRightPaneRefs();
		rightPane.append(this.#rightPaneRefs.scrollContainer);
		scrollEl.append(rightPane);
		const splitterHandle = el("div");
		splitterHandle.className = "gantt-splitter-handle";
		css(splitterHandle, {
			position: "absolute",
			right: "0",
			top: "0",
			bottom: "0",
			width: "4px",
			cursor: "col-resize",
			zIndex: "20"
		});
		leftPane.append(splitterHandle);
		attachSplitter(splitterHandle, leftPane, this.#container, this.#timelineMinWidth, (finalWidth) => {
			this.#userSplitWidth = finalWidth;
			this.#cbs.onLeftPaneWidthChange?.(finalWidth);
		});
	}
	#wireEvents() {
		this.#rightPaneRefs.absoluteLayer.addEventListener("click", (event) => {
			if (event.target.closest(".gantt-bar, .gantt-milestone, .gantt-resize-handle")) return;
			this.#selectedId = null;
			this.#scheduleRender();
		});
		this.#root.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && this.#selectedId !== null) {
				event.preventDefault();
				this.#selectedId = null;
				this.#scheduleRender();
			}
		});
		this.#scrollEl.addEventListener("scroll", this.#onScroll);
	}
	#setupResizeObserver() {
		if (typeof ResizeObserver !== "undefined") {
			this.#resizeObserver = new ResizeObserver(() => {
				this.#applyResponsivePaneStyles();
			});
			this.#resizeObserver.observe(this.#container);
		} else window.addEventListener("resize", this.#applyResponsivePaneStyles);
	}
};
//#endregion
export { BAR_HEIGHT, BAR_Y_OFFSET, DEFAULT_GRID_COLUMNS, DENSITY, EN_US_LABELS, GRID_COLUMN_FR_MIN_WIDTH, GanttChart, GanttError, MILESTONE_HALF, MILESTONE_SIZE, ROW_HEIGHT, SCALE_CONFIGS, addDays, addHours, buildTaskTree, computeLayout, createPixelMapper, deriveViewport, deriveWeekNumbering, deriveWeekStartsOn, deriveWeekendDays, detectCycles, diffDays, diffHours, flattenTree, formatLabel, formatWeekNumber, gridColumnDefaults, gridNaturalWidth, gridTemplateColumns, isParent, parseDate, resolveChartLocale, routeLinks, validateLinkRefs, visibleColumns };

//# sourceMappingURL=index.mjs.map