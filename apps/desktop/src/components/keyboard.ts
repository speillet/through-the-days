/**
 * WebKit, and so the Tauri webview, leaves buttons, links, checkboxes and radio
 * buttons out of the Tab order unless macOS keyboard navigation is switched on.
 * An explicit tabindex keeps every control reachable with Tab regardless; a radio
 * group still counts as one stop, with arrow keys moving inside it. Scrollable
 * regions that a keyboard reader needs to reach use it too.
 */
export const TAB_STOP = 0;
