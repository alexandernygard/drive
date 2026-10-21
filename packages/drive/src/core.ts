// Everything that runs anywhere (browser, Workers, Node): types, the app registry, templates, formatting.
// The Worker imports this; pages import the package root, which adds the browser client.
export * from "./types.js"
export { APPS, DOC_KINDS, KIND_COLORS, KIND_LABELS, defaultOrigins, isDocKind } from "./apps.js"
export type { AppInfo, Origins } from "./apps.js"
export { template } from "./templates.js"
export { colorFor, displayName, firstName, formatBytes, initials, timeAgo } from "./format.js"
export type { Named } from "./format.js"
