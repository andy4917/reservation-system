(() => {
  const App = (globalThis.App = globalThis.App || {});
  App.ui = App.ui || {};
  const C = App.constants || {};
  const TEXT = C.TEXT || {};

  const STYLE = `
    :host {
      all: initial;
      contain: layout style paint;
      isolation: isolate;
      --font-main: "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif;
      --z-index: 2147483646;
    }

    /* =========================================
       1. Theme Variables (CSS Variables)
    ========================================= */
    /* 기본 (Station/Modern): slate + indigo 운영 톤 */
    .wrap {
      /* Colors */
      --c-primary: #1a73e8;
      --c-primary-fg: #ffffff;
      --c-accent: #1557b0;
      --c-danger: #d93025;
      --c-success: #0f9d58;

      /* Backgrounds */
      --bg-panel: #ffffff;
      --bg-body: #ffffff;
      --bg-card: #ffffff;
      --bg-hover: #f8f9fa;
      --bg-input: #ffffff;
      --bg-header: #ffffff;
      --bg-header-soft: #f8f9fa;

      /* Borders & Shadows */
      --border-color: #e0e0e0;
      --shadow-panel: 0 22px 54px -36px rgba(31, 41, 55, 0.26);
      --shadow-card: 0 12px 26px -24px rgba(31, 41, 55, 0.2);
      --shadow-soft: 0 8px 18px -14px rgba(31, 41, 55, 0.18);

      /* Radius */
      --r-panel: 8px;
      --r-card: 8px;
      --r-btn: 4px;
      --r-input: 4px;
      --sidebar-width: 380px;

      /* Motion */
      --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
      --ease-snap: cubic-bezier(0.2, 0.85, 0.28, 1);
      --motion-fast: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

      /* Text */
      --text-main: #000000;
      --text-sub: #5f6368;
      --line-soft: #e0e0e0;
      --header-text: #000000;
      --header-control-bg: #f8f9fa;
      --header-control-border: #e0e0e0;
      --header-control-text: #5f6368;
      --header-control-hover-bg: #eceff1;
      --header-control-hover-text: #000000;

      /* Icons */
      --icon-site: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='3' width='20' height='16' rx='3' fill='%23111827'/%3E%3Crect x='4' y='5' width='16' height='2' fill='%2394a3b8'/%3E%3Ccircle cx='7' cy='12' r='3' fill='none' stroke='%23ffffff' stroke-width='1.5'/%3E%3Cpath d='M10 12h7M7 9v6' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      --icon-sheet: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230f9d58' d='M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'/%3E%3Cpath fill='%23fff' d='M15 2v5h5'/%3E%3Cpath fill='none' stroke='%23fff' stroke-width='1.7' d='M8 11h8M8 15h8M8 19h8M12 11v8'/%3E%3C/svg%3E");
    }

    /* 네이버 (Naver Provider): 네이버 그린, 각진 디자인 */
    .wrap.provider-naver {
      /* Colors */
      --c-primary: #03c75a;
      --c-primary-fg: #ffffff;
      --c-accent: #0f9e49;
      --c-danger: #d93025;

      /* Backgrounds */
      --bg-panel: #ffffff;
      --bg-body: #ffffff;
      --bg-card: #ffffff;
      --bg-hover: #f3fbf7;
      --bg-input: #ffffff;
      --bg-header: #ffffff;
      --bg-header-soft: #f6fbf8;

      /* Borders & Shadows */
      --border-color: #dae6df;
      --shadow-panel: 0 20px 52px -34px rgba(2, 84, 42, 0.25);
      --shadow-card: 0 10px 22px -20px rgba(2, 84, 42, 0.18);
      --shadow-soft: 0 8px 18px -15px rgba(2, 84, 42, 0.16);

      /* Text */
      --text-main: #10291c;
      --text-sub: #4f6759;
      --line-soft: #dce9e1;
      --header-text: #10291c;
      --header-control-bg: #f2f8f4;
      --header-control-border: #d6e4db;
      --header-control-text: #3b604a;
      --header-control-hover-bg: #e5f3ea;
      --header-control-hover-text: #10291c;
      --icon-site: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='3' width='20' height='16' rx='3' fill='%2303C75A'/%3E%3Crect x='4' y='5' width='16' height='2' fill='%23c8f3dd'/%3E%3Cpath fill='%23fff' d='M8 9h2.2l2.8 3.8V9h2v6H13l-3-4.1V15H8z'/%3E%3C/svg%3E");
    }

    .wrap.provider-station {
      --c-primary: #1a73e8;
      --c-accent: #1557b0;
      --bg-panel: #ffffff;
      --bg-body: #ffffff;
      --bg-hover: #f8f9fa;
      --bg-header: #ffffff;
      --bg-header-soft: #f8f9fa;
      --border-color: #e0e0e0;
      --text-main: #000000;
      --text-sub: #5f6368;
      --line-soft: #e0e0e0;
      --header-text: #000000;
      --header-control-bg: #f8f9fa;
      --header-control-border: #e0e0e0;
      --header-control-text: #5f6368;
      --header-control-hover-bg: #eceff1;
      --header-control-hover-text: #000000;
      --icon-site: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='3' width='20' height='16' rx='3' fill='%232a3f56'/%3E%3Crect x='4' y='5' width='16' height='2' fill='%23b6c4d2'/%3E%3Ccircle cx='8' cy='12' r='2.4' fill='none' stroke='%23ffffff' stroke-width='1.5'/%3E%3Cpath d='M11 12h6M8 9.5v5' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    }

    /* =========================================
       2. Reset & Layout
    ========================================= */
    .wrap, .wrap * {
      font-family: var(--font-main);
      box-sizing: border-box;
      word-break: keep-all;
    }

    .wrap {
      position: fixed;
      inset: 0;
      z-index: var(--z-index);
      color: var(--text-main);
      font-size: 13px;
      line-height: 1.5;
      pointer-events: none;
    }
    .hidden {
      display: none !important;
    }

    /* =========================================
       3. Main Components
    ========================================= */

    .backdrop {
      position: fixed;
      inset: 0;
      background: transparent;
      opacity: 0;
      pointer-events: none;
      transition: none;
      z-index: 1;
    }
    .backdrop.is-open {
      opacity: 0;
      pointer-events: none;
    }
    .backdrop.is-closing {
      opacity: 0;
    }

    /* Main Panel */
    .panel {
      position: fixed;
      bottom: max(12px, calc(env(safe-area-inset-bottom) + 8px));
      right: 14px;
      width: min(var(--sidebar-width), 60vw, calc(100vw - 18px));
      max-width: min(60vw, calc(100vw - 18px));
      min-width: min(480px, calc(100vw - 18px));
      height: calc(100vh - 24px);
      max-height: calc(100vh - 24px);
      min-height: 300px;
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: var(--r-panel);
      box-shadow: var(--shadow-panel);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px) scale(0.96);
      transition:
        opacity 0.12s ease,
        transform 0.12s ease;
      pointer-events: none;
      z-index: 2;
      will-change: opacity, transform;
    }
    .panel.is-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .panel.is-closing {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
      pointer-events: none;
    }
    /* Header */
    .header {
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 16px 16px 12px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
      cursor: default;
      user-select: auto;
      touch-action: auto;
    }
    .header-main {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      width: 100%;
      padding-right: 68px;
      text-align: center;
    }
    .title-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .title-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: color-mix(in srgb, var(--c-primary) 62%, #1f2937 38%);
      text-transform: uppercase;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      color: var(--header-text);
      letter-spacing: 0.01em;
    }
    .title-sub {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-sub);
    }
    .header-status-pill {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #9bd6b2;
      background: #ebf7f0;
      color: #1f6b3e;
      line-height: 1;
    }
    .header-status-pill.warn {
      border-color: #efd188;
      background: #fff7e5;
      color: #946200;
    }
    .header-status-pill.error {
      border-color: #f3b3ae;
      background: rgba(217, 48, 37, 0.08);
      color: #b3261e;
    }
    .header-status-pill.loading {
      border-color: #a7c7f5;
      background: rgba(26, 115, 232, 0.08);
      color: #1557b0;
    }
    .close {
      position: absolute;
      top: 13px;
      right: 14px;
      background: var(--header-control-bg);
      border: 1px solid var(--header-control-border);
      color: var(--header-control-text);
      cursor: pointer;
      min-width: 48px;
      height: 32px;
      padding: 0 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
      cursor: pointer;
    }
    .close:hover {
      background: var(--header-control-hover-bg);
      color: var(--header-control-hover-text);
      border-color: color-mix(in srgb, var(--header-control-border) 70%, #cbd5e1 30%);
    }

    /* Body (Scrollable) */
    .body {
      padding: 16px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--bg-body);
    }
    .body::-webkit-scrollbar {
      width: 6px;
    }
    .body::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 999px;
    }
    .body > * {
      flex: 0 0 auto;
      min-width: 0;
    }

    .site {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-sub);
      margin-top: 0;
      background: var(--bg-header-soft);
      border: 1px solid var(--border-color);
      border-radius: 999px;
      padding: 6px 12px;
      width: fit-content;
      box-shadow: none;
    }

    .flow {
      display: grid;
      gap: 8px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 10px;
      box-shadow: none;
    }
    .flow-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-sub);
      letter-spacing: 0.01em;
    }
    .flow-steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .flow-step {
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-hover);
      color: var(--text-sub);
      font-size: 12px;
      text-align: center;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .flow-step.is-active {
      border-color: color-mix(in srgb, var(--c-primary) 50%, #ffffff 50%);
      background: color-mix(in srgb, var(--c-primary) 10%, #ffffff 90%);
      color: var(--text-main);
      font-weight: 700;
    }
    .flow-step.is-done {
      border-color: #9bd6b2;
      background: #edf8f1;
      color: #1f6b3e;
    }
    .flow-gate,
    .policy-box {
      display: grid;
      gap: 10px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 249, 252, 0.96));
      border: 1px solid rgba(214, 221, 232, 0.94);
      border-radius: 18px;
      padding: 14px;
      box-shadow: 0 12px 28px -26px rgba(15, 23, 42, 0.28);
    }
    .flow-gate {
      border-color: color-mix(in srgb, var(--c-primary) 24%, rgba(214, 221, 232, 0.94) 76%);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--c-primary) 6%, #ffffff 94%), rgba(246, 249, 252, 0.98)),
        radial-gradient(120% 120% at 0% 0%, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0));
    }
    .policy-box-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }
    .policy-grid {
      display: grid;
      gap: 8px;
    }
    .policy-item {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid rgba(223, 228, 237, 0.98);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.92);
    }
    .policy-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-main);
    }
    .policy-item-status {
      padding: 3px 8px;
      border-radius: 999px;
      background: #eef2f7;
      color: var(--text-sub);
      font-size: 10px;
      font-weight: 800;
    }
    .policy-item-status.ready {
      background: #e8f6ee;
      color: #146c43;
    }
    .policy-item-status.blocked {
      background: #fff2f0;
      color: #b42318;
    }
    .policy-item-status.guard {
      background: #fff8e6;
      color: #9a6700;
    }
    .policy-item-body {
      font-size: 12px;
      color: var(--text-sub);
      line-height: 1.55;
    }

    /* =========================================
       4. Calendar & Date Picker
    ========================================= */
    .calendar {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      overflow: hidden;
      box-shadow: none;
      min-width: 0;
      flex-shrink: 0;
      position: relative;
    }
    .cal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-header-soft);
    }
    .cal-title { font-weight: 800; font-size: 16px; letter-spacing: 0.01em; }
    .cal-nav { display: flex; gap: 4px; }
    .cal-btn {
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid var(--border-color);
      background: #ffffff;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-sub);
      transition: background 0.14s ease, color 0.14s ease;
    }
    .cal-btn:hover { background: var(--bg-hover); color: var(--text-main); }

    .week {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      padding: 10px 12px 2px;
      font-size: 11px;
      color: var(--text-sub);
      text-align: center;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .dates {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      grid-template-rows: repeat(6, minmax(38px, auto));
      grid-auto-rows: minmax(38px, auto);
      padding: 4px 12px 12px;
      gap: 4px;
    }
    .day {
      min-height: 38px;
      width: 100%;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid transparent;
      border-radius: 10px;
      font-size: 13px; color: var(--text-main);
      cursor: pointer;
      line-height: 1;
      font-weight: 600;
      transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
    }
    .day:hover {
      background: var(--bg-hover);
      border-color: color-mix(in srgb, var(--c-primary) 34%, #ffffff 66%);
    }
    .day.other { color: #cbd5e1; }
    .day.sun { color: var(--c-danger); }
    .day.sat { color: #3b82f6; }

    .day.range {
      background: #e8f2ff;
      color: var(--c-primary);
      border-color: #cddff5;
      border-radius: 6px;
    }
    .wrap.provider-naver .day.range { background: #e8f8f0; color: var(--c-primary); border-color: #c8ebd4; }
    .wrap.provider-naver .dates.range-complete .day.range {
      background: #dbf4e6;
      border-color: #a3dfbf;
      color: #0e6f3c;
      font-weight: 700;
    }

    .day.start { background: var(--c-primary); color: var(--c-primary-fg); border-radius: 10px 4px 4px 10px; border-color: transparent; }
    .day.end { background: var(--c-primary); color: var(--c-primary-fg); border-radius: 4px 10px 10px 4px; border-color: transparent; }
    .day.start.end { border-radius: 10px; }
    .wrap.provider-naver .dates.range-complete .day.start,
    .wrap.provider-naver .dates.range-complete .day.end {
      background: #03c75a;
      border-color: #03a64b;
      color: #ffffff;
      font-weight: 800;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
    }

    .picked {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: var(--bg-header-soft);
      border-top: 1px solid var(--border-color);
    }
    #pickedText { font-size: 12px; font-weight: 500; }
    .reset {
      font-size: 11px; padding: 4px 8px;
      background: var(--bg-card); border: 1px solid var(--border-color);
      color: var(--text-sub); border-radius: 8px; cursor: pointer;
      transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
    }
    .reset:hover { color: var(--c-danger); border-color: var(--c-danger); }
    .quick-presets {
      display: flex;
      gap: 6px;
      padding: 8px 12px 12px;
      border-top: 1px dashed var(--border-color);
      background: #ffffff;
      flex-wrap: wrap;
    }
    .preset-btn {
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--border-color);
      border-radius: 999px;
      background: #ffffff;
      color: var(--text-main);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: background 0.14s ease, border-color 0.14s ease;
    }
    .preset-btn:hover {
      background: var(--bg-hover);
      border-color: #b7ccdf;
    }

    /* =========================================
       5. Status & Review
    ========================================= */
    .status {
      padding: 10px 12px;
      border-radius: var(--r-card);
      font-size: 12px;
      background: #f8f9fa;
      color: var(--text-sub);
      border: 1px solid var(--border-color);
      display: flex; align-items: center; gap: 8px;
      box-shadow: none;
    }
    .status.ok { background: #ebf7f0; color: #1f6b3e; border-color: #9bd6b2; }
    .status.warn { background: #fff7e5; color: #946200; border-color: #efd188; }
    .status.error { background: rgba(217, 48, 37, 0.08); color: #b3261e; border-color: #f3b3ae; }
    .status-k {
      flex: 0 0 auto;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent 70%);
      background: rgba(255, 255, 255, 0.5);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.03em;
      line-height: 1.4;
      text-transform: uppercase;
    }
    .status-msg {
      min-width: 0;
      flex: 1 1 auto;
      line-height: 1.5;
      font-weight: 600;
    }
    .read-only-note {
      margin-top: -4px;
      border: 1px dashed #b7ccdf;
      background: rgba(26, 115, 232, 0.08);
      color: #1557b0;
      font-size: 12px;
      font-weight: 600;
    }
    .severity-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--r-card);
      border: 1px solid #f3b3ae;
      background: rgba(217, 48, 37, 0.08);
      color: #b3261e;
    }
    .severity-banner.warn {
      border-color: #efd188;
      background: #fff7e5;
      color: #946200;
    }
    .severity-pill {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      height: 22px;
      padding: 0 9px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid color-mix(in srgb, currentColor 28%, transparent 72%);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .severity-text {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 12px;
      line-height: 1.45;
      font-weight: 700;
      word-break: break-word;
    }

    .review-shell {
      display: grid;
      gap: 8px;
    }
    .review-head {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .review-count {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-sub);
    }
    .review-direction {
      margin-top: -2px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--text-sub);
    }
    .review-list {
      display: grid;
      gap: 8px;
      max-height: 292px;
      overflow: auto;
      padding-right: 2px;
    }
    .review-list::-webkit-scrollbar {
      width: 4px;
    }
    .review-list::-webkit-scrollbar-thumb {
      background: #e5e7eb;
      border-radius: 999px;
    }
    .review-empty {
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      background: #ffffff;
      color: var(--text-sub);
      font-size: 11px;
      line-height: 1.45;
      padding: 12px;
      text-align: center;
      font-weight: 600;
    }
    .review-card {
      border-radius: var(--r-card);
      background: #ffffff;
      padding: 12px;
      border: 1px solid var(--border-color);
    }
    .review-card.is-mismatch {
      border: 2px solid #fecaca;
      box-shadow: 0 8px 20px -18px rgba(239, 68, 68, 0.45);
    }
    .review-card.is-match {
      opacity: 0.72;
      background: #f9fafb;
    }
    .review-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .review-date {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: #f3f4f6;
      color: #6b7280;
    }
    .review-card.is-mismatch .review-date {
      background: #fef2f2;
      color: #dc2626;
    }
    .review-room {
      margin-top: 6px;
      font-size: 13px;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.35;
    }
    .review-state {
      font-size: 11px;
      font-weight: 700;
      color: #16a34a;
      white-space: nowrap;
    }
    .review-card.is-mismatch .review-state {
      color: #dc2626;
    }
    .review-suggest {
      text-align: right;
      font-size: 11px;
      color: var(--text-sub);
      line-height: 1.35;
    }
    .review-suggest b {
      display: block;
      margin-top: 2px;
      font-size: 13px;
      color: var(--c-primary);
    }
    .review-suggest.alt {
      margin-top: 4px;
      color: #64748b;
    }
    .review-suggest.alt b {
      color: #475569;
    }
    .review-grid {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--line-soft);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .review-k {
      font-size: 10px;
      color: var(--text-sub);
      font-weight: 700;
    }
    .review-v {
      margin-top: 2px;
      font-size: 13px;
      color: var(--text-main);
      font-weight: 800;
      line-height: 1.25;
    }
    .review-v.diff {
      color: #dc2626;
    }
    .review-collapsed {
      margin-left: 6px;
      font-size: 10px;
      font-weight: 700;
      color: var(--text-sub);
    }

    .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .card {
      background: #f8f9fa;
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 10px;
      min-height: 72px;
      text-align: left;
      font-size: 12px;
      color: var(--text-sub);
      display: flex;
      flex-direction: column;
      justify-content: center;
      box-shadow: none;
      position: relative;
      padding-left: 28px;
    }
    .card::before {
      content: "";
      position: absolute;
      left: 10px;
      top: 12px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-sub);
      line-height: 1;
    }
    .card.kpi-rows::before { content: "R"; }
    .card.kpi-open::before { content: "O"; }
    .card.kpi-closed::before { content: "C"; }
    .card.kpi-period::before { content: "D"; }
    .card.kpi-sync::before { content: "S"; }
    .card.kpi-mismatch::before { content: "!"; color: #b3261e; }
    .card.kpi-pms::before { content: "P"; }
    .card.kpi-load::before { content: "L"; }
    .card b {
      display: block;
      margin-top: 3px;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--text-main);
    }
    .card.is-critical {
      border-color: #f3b3ae;
      background: rgba(217, 48, 37, 0.08);
      box-shadow: inset 0 0 0 1px rgba(217, 48, 37, 0.2);
      position: relative;
      padding-left: 34px;
      border-left: 2px solid #d93025;
    }
    .card.is-critical::before {
      content: "!";
      position: absolute;
      left: 10px;
      top: 10px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #b3261e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    .card.is-critical b {
      color: #b3261e;
    }
    .user-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      grid-template-columns: none;
    }
    .user-summary .card {
      min-height: 0;
      padding: 6px 10px;
      padding-left: 10px;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: #ffffff;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .user-summary .card::before {
      display: none;
    }
    .user-summary .card b {
      display: inline;
      margin-top: 0;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
    }
    .user-summary .card.is-critical {
      padding-left: 10px;
      border-left: 1px solid #d93025;
    }
    .user-summary .card.is-critical::before {
      display: none;
    }
    .user-hint {
      margin-top: 4px;
    }
    .result-wrap .summary { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }

    /* =========================================
       6. Tables & Actions
    ========================================= */
    .section-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px;
      padding: 12px 2px 0;
      border-top: 1px solid var(--line-soft);
    }
    .summary + .section-head { margin-top: 0; }
    .section-title { font-size: 14px; font-weight: 700; color: var(--text-main); }
    .section-title.with-icon {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .section-title.with-icon::before {
      content: "";
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      background-repeat: no-repeat;
      background-size: contain;
      background-position: center;
    }
    .section-site-title::before { background-image: var(--icon-site); }
    .section-sheet-title::before { background-image: var(--icon-sheet); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .actions .btn { flex: 1 1 calc(50% - 4px); min-width: 0; }
    .actions.wide .btn { flex-basis: 100%; width: 100%; }
    .actions.sync-cta {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px;
    }
    .actions.sync-cta #toggleConfig {
      flex: 0 0 38px;
    }
    .actions.sync-cta #syncBtn {
      flex: 0 0 auto;
      min-width: 180px;
      margin-left: auto;
    }

    /* Buttons */
    .btn {
      height: 38px; padding: 0 14px;
      min-width: 0;
      border-radius: var(--r-btn);
      border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent 60%);
      font-size: 14px; font-weight: 600;
      cursor: pointer;
      transition:
        background 0.14s ease,
        border-color 0.14s ease,
        color 0.14s ease;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--c-primary);
      color: var(--c-primary-fg);
      white-space: nowrap;
      box-shadow: 0 6px 16px -12px color-mix(in srgb, var(--c-primary) 68%, #111827 32%);
    }
    .btn:hover:not(:disabled) { background: color-mix(in srgb, var(--c-primary) 92%, #ffffff 8%); }
    .btn:disabled { background: #eef2f7; color: #94a3b8; border-color: #d7dee8; cursor: not-allowed; box-shadow: none; }

    .btn.secondary {
      background: #ffffff; border-color: var(--border-color); color: var(--text-main); box-shadow: none;
    }
    .btn.secondary:hover:not(:disabled) { background: var(--bg-hover); border-color: #b7ccdf; }

    .btn.gray { background: #f3f6fa; color: var(--text-main); border: 1px solid #dce4ef; box-shadow: none; }
    .btn.gray:hover:not(:disabled) { background: #e2e8f0; }

    .btn.ready {
      background: var(--c-accent);
      border-color: color-mix(in srgb, var(--c-accent) 60%, transparent 40%);
      color: white;
    }
    .btn .btn-spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, currentColor 32%, transparent 68%);
      border-top-color: currentColor;
      animation: sync-spin 0.72s linear infinite;
      display: none;
      flex: 0 0 14px;
    }
    .btn.is-loading {
      cursor: progress;
      pointer-events: none;
    }
    .btn.has-inline-spinner.is-loading {
      position: relative;
      color: transparent !important;
    }
    .btn.has-inline-spinner.is-loading::before {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 12px;
      height: 12px;
      margin-top: -6px;
      margin-left: -6px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #ffffff;
      animation: sync-spin 0.72s linear infinite;
    }
    .btn.is-loading .btn-spinner {
      display: inline-block;
    }
    .btn.is-loading .btn-label {
      margin-left: 8px;
    }
    @keyframes sync-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    #load,
    #loadAll,
    #applyCorrectionSiteBtn,
    #copySite,
    #loadSheet,
    #copySheet,
    #syncFeatureToggle,
    #toggleConfig,
    #saveSyncCfg,
    #syncBtn,
    #toggleErrorBtn,
    #toggleOpsSectionBtn,
    #exportGoldenSetBtn,
    #toggleDebugBtn,
    #clearRuntimeBtn,
    #toggleSecretsBtn {
      width: auto;
      min-width: 0;
    }
    #toggleConfig {
      flex: 0 0 38px;
      width: 38px;
      min-width: 38px;
      padding: 0;
      font-size: 17px;
      font-weight: 700;
      line-height: 1;
    }

    /* Data Tables */
    .copy-wrap {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      overflow: auto;
      max-height: 320px;
      min-width: 0;
      box-shadow: none;
    }
    .copy-wrap.is-loading {
      background-image: linear-gradient(
        90deg,
        rgba(248, 249, 250, 0.9) 0%,
        rgba(255, 255, 255, 0.95) 40%,
        rgba(248, 249, 250, 0.9) 100%
      );
      background-size: 240px 100%;
      animation: table-shimmer 1.1s linear infinite;
    }
    @keyframes table-shimmer {
      from { background-position: -240px 0; }
      to { background-position: calc(100% + 240px) 0; }
    }
    .copy-wrap.inventory,
    .copy-wrap.mismatch-wrap {
      min-height: 112px;
    }
    .section-head + .copy-wrap {
      margin-top: 6px;
    }
    table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; }
    th {
      position: sticky; top: 0;
      background: var(--bg-hover); color: var(--text-sub);
      font-weight: 600; padding: 6px 8px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap; z-index: 10;
      min-width: 56px;
      min-height: 28px;
      text-align: center;
    }
    td {
      padding: 6px 8px; border-bottom: 1px solid var(--border-color);
      color: var(--text-main); text-align: center; white-space: nowrap;
      min-width: 56px;
      min-height: 28px;
      font-size: 13px;
      line-height: 1.3;
      border-bottom-color: #f1f3f4;
    }
    tbody tr:hover td {
      background: var(--bg-hover);
    }
    tbody tr:nth-child(even) td {
      background: #fafcff;
    }
    tr:last-child td { border-bottom: none; }

    .room-col {
      position: sticky; left: 0;
      background: var(--bg-card); font-weight: 600;
      z-index: 20; border-right: 1px solid var(--border-color);
      text-align: left;
      min-width: 130px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th.room-col { background: var(--bg-hover); z-index: 30; }
    tbody tr:hover .room-col {
      background: var(--bg-hover);
    }
    .table-empty td {
      text-align: center;
      color: var(--text-sub);
      font-weight: 600;
      padding: 16px 10px;
      white-space: normal;
    }
    .mismatch-wrap td { white-space: normal; line-height: 1.35; }
    .inventory td.corrected-cell {
      color: #1557b0;
      font-weight: 700;
      background: rgba(26, 115, 232, 0.08);
      transition: color 0.15s ease, background 0.15s ease;
      position: relative;
      border-color: color-mix(in srgb, #8ab4f8 60%, #f1f3f4 40%);
    }
    .inventory td.corrected-cell::after {
      content: "";
      position: absolute;
      top: 4px;
      right: 4px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #1a73e8;
    }
    .inventory td.has-inline-diff {
      white-space: nowrap;
    }
    .inventory td .cell-main {
      display: inline-block;
    }
    .inventory td .cell-inline-diff {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid #a7c7f5;
      background: rgba(26, 115, 232, 0.08);
      color: #1557b0;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.45;
      vertical-align: middle;
    }
    .inventory td.corrected-cell:hover,
    .inventory tbody tr:hover td.corrected-cell {
      color: #1557b0;
      background: rgba(26, 115, 232, 0.15);
    }
    .inventory td.error-cell {
      box-shadow: inset 0 0 0 1px #d93025;
      background: rgba(217, 48, 37, 0.08) !important;
      color: #b3261e;
    }
    .inventory td.flash-cell {
      animation: cell-flash 320ms ease;
    }
    @keyframes cell-flash {
      0% { box-shadow: inset 0 0 0 999px rgba(26, 115, 232, 0.2); }
      100% { box-shadow: inset 0 0 0 999px rgba(26, 115, 232, 0); }
    }
    .inventory tbody tr.row-soft-focus td:not(.room-col) {
      background: color-mix(in srgb, var(--c-primary) 8%, #ffffff 92%);
    }
    .inventory td.cell-soft-focus {
      background: color-mix(in srgb, var(--c-primary) 14%, #ffffff 86%) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-accent) 38%, #ffffff 62%);
      color: var(--text-main);
      font-weight: 700;
    }
    .soft-focus-highlight {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-accent) 24%, #ffffff 76%);
      background: color-mix(in srgb, var(--c-primary) 6%, #ffffff 94%);
      border-radius: inherit;
    }

    /* Mismatch Highlight */
    .mismatch-wrap td.diff .mm-site { color: var(--c-danger); font-weight: 700; }
    .mismatch-wrap td.diff .mm-sheet { color: var(--text-sub); text-decoration: line-through; }
    .verify-note {
      margin-top: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #16a34a;
      text-align: right;
    }
    .verify-note.warn { color: #b45309; }
    .verify-note.error { color: #b91c1c; }

    /* =========================================
       7. Settings & Errors (Collapsible)
    ========================================= */
    .sheet {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 16px; margin-top: 8px;
      box-shadow: none;
    }
    .sync-feature-section {
      display: grid;
      gap: 10px;
      margin-top: 2px;
      padding-top: 8px;
      border-top: 1px dashed var(--line-soft);
    }
    .sync-cta {
      position: sticky;
      bottom: 0;
      z-index: 12;
      padding: 8px;
      margin-top: 2px;
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 249, 250, 0.97));
      backdrop-filter: blur(4px);
    }
    .ops-shell {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed var(--line-soft);
    }
    .ops-head {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .ops-section {
      display: grid;
      gap: 10px;
    }
    .sync-approval {
      background: #f8fafc;
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 12px;
      display: grid;
      gap: 8px;
    }
    .sync-approval-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }
    .sync-approval-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .sync-approval-item {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: #ffffff;
      padding: 7px 8px;
      font-size: 11px;
      color: var(--text-sub);
      line-height: 1.3;
    }
    .sync-approval-item b {
      display: block;
      margin-top: 3px;
      font-size: 12px;
      color: var(--text-main);
    }
    .sync-approval-check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-main);
      line-height: 1.35;
      cursor: pointer;
    }
    .sync-approval-check input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--c-accent);
    }
    /* .hidden class defined in section 2 handles the visibility */

    .sheet-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
    .sheet-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }

    .field { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--text-sub); }
    .field.full { grid-column: span 2; }

    .field input, .field select, .field textarea {
      padding: 10px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--r-input);
      font-family: inherit; font-size: 12px;
      background: var(--bg-input); color: var(--text-main);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .field input[type="checkbox"] {
      width: 16px;
      height: 16px;
      padding: 0;
      margin-top: 4px;
      border-radius: 4px;
      accent-color: var(--c-accent);
    }
    .field input:focus, .field select:focus, .field textarea:focus {
      outline: none; border-color: var(--c-accent);
      box-shadow: 0 0 0 3px rgba(47, 106, 246, 0.14);
    }
    .field textarea.secret-masked {
      -webkit-text-security: disc;
    }
    .wrap.provider-naver .field input:focus { box-shadow: 0 0 0 2px rgba(3,199,90,0.1); }
    #cfgManualRanges {
      min-height: 96px;
      line-height: 1.45;
      font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
      white-space: pre;
    }
    #cfgAuthBundle {
      min-height: 132px;
      line-height: 1.45;
      font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
      white-space: pre;
    }
    .range-tools {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 4px;
    }
    .range-tools .btn {
      min-width: 0;
      height: 30px;
      padding: 0 10px;
      font-size: 11px;
    }
    .range-hint {
      margin-top: 6px;
      padding: 10px 12px;
      border: 1px solid var(--border-color);
      border-left-width: 3px;
      border-left-color: #c5d6e7;
      border-radius: var(--r-input);
      background: #f8fafc;
      color: var(--text-sub);
      font-size: 11px;
      line-height: 1.56;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .wrap.provider-naver .range-hint {
      border-left-color: #9fd8b9;
    }
    .range-hint.warn {
      border-color: #f59e0b;
      border-left-color: #f59e0b;
      background: #fffbeb;
      color: #92400e;
    }
    .insight-wrap {
      display: grid;
      gap: 6px;
      margin-top: 8px;
    }
    .insight-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 2px;
    }
    .insight-note {
      margin-top: 0;
      font-size: 11px;
      color: var(--text-sub);
      line-height: 1.56;
      white-space: pre-wrap;
    }

    .btn:focus-visible,
    .cal-btn:focus-visible,
    .day:focus-visible,
    .reset:focus-visible,
    .close:focus-visible,
    .field input:focus-visible,
    .field select:focus-visible,
    .field textarea:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--c-accent) 70%, #ffffff 30%);
      outline-offset: 2px;
    }
    .copy-wrap.insight {
      max-height: 220px;
      min-height: 72px;
    }
    .copy-wrap.insight td.warn-cell {
      background: #fff7ed;
      color: #9a3412;
      font-weight: 700;
    }

    .result-wrap {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 12px;
      margin-top: 4px;
      display: grid;
      gap: 10px;
      box-shadow: none;
    }

    /* Error Table */
    .error-wrap { margin-top: 10px; border-top: 1px solid var(--border-color); }
    .debug-head {
      margin-top: 10px;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-sub);
    }
    .debug-head:first-child { margin-top: 0; }
    .debug-pre {
      margin: 0;
      padding: 10px;
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      background: #f8fafc;
      color: var(--text-main);
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
    }
    .debug-log {
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      background: #ffffff;
      max-height: 220px;
      overflow: auto;
    }
    .debug-log-row {
      display: grid;
      grid-template-columns: 62px 48px 1fr;
      gap: 8px;
      align-items: start;
      padding: 8px 10px;
      border-bottom: 1px solid #eef2f7;
      font-size: 11px;
      line-height: 1.4;
      color: var(--text-main);
    }
    .debug-log-row:last-child { border-bottom: none; }
    .debug-log-row .k {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .debug-log-row .k.warn { color: #b45309; }
    .debug-log-row .k.error { color: #b91c1c; }
    .debug-log-row .k.info { color: #475569; }
    .debug-log-empty {
      padding: 10px;
      font-size: 11px;
      color: var(--text-sub);
    }

    /* Responsive */
    @media (max-width: 900px) {
      .panel { min-width: 0; width: min(96vw, 380px); right: 0; }
      .flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sync-approval-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .quick-presets { gap: 4px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .review-grid { grid-template-columns: 1fr; }
      .sheet-grid { grid-template-columns: 1fr; }
      .field.full { grid-column: span 1; }
      .btn { min-width: 0; }
      #load,
      #loadAll,
      #applyCorrectionSiteBtn,
      #copySite,
      #loadSheet,
      #applyCorrectionBtn,
      #downloadCorrectionDiffBtn,
      #exportUnknownColorBtn,
      #copySheet,
      #syncFeatureToggle,
      #toggleConfig,
      #toggleOpsSectionBtn,
      #exportGoldenSetBtn,
      #toggleDebugBtn,
      #clearRuntimeBtn,
      #saveSyncCfg,
      #syncBtn,
      #toggleErrorBtn,
      #toggleSecretsBtn {
        width: auto;
        min-width: 0;
      }
    }
    @media (max-width: 640px) {
      .panel { width: calc(100vw - 16px); right: 8px; bottom: 8px; max-height: calc(100vh - 16px); min-width: 0; min-height: 280px; }
      .header { padding: 16px 16px 12px; }
      .header-main { padding-right: 58px; }
      .title { font-size: 17px; }
      .body { padding: 12px 14px 14px; }
      .flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sync-approval-summary { grid-template-columns: 1fr; }
      .quick-presets { padding: 8px 10px 10px; }
      .preset-btn { flex: 1 1 calc(33.33% - 4px); min-width: 0; text-align: center; }
      .summary { grid-template-columns: repeat(2, 1fr); }
      .copy-wrap { max-height: 260px; }
      .review-list { max-height: 240px; }
      .section-head { align-items: flex-start; }
      .actions { width: 100%; }
      .actions .btn { flex: 1 1 calc(50% - 8px); min-width: 0 !important; width: auto !important; }
      .actions.sync-cta { flex-wrap: wrap; }
      .actions.sync-cta #syncBtn { margin-left: 0; min-width: 0; flex: 1 1 calc(100% - 46px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel,
      .backdrop,
      .btn,
      .cal-btn,
      .day,
      .reset,
      .close,
      .status,
      .card,
      .dates,
      .btn .btn-spinner {
        transition: none !important;
        animation: none !important;
      }
    }
  `;

  const HTML = ``;

  const SHELL_STYLE = `${STYLE}
    .wrap {
      --context-bar-h: 48px;
      --rail-w: 48px;
      --sidebar-width: 420px;
      --sidebar-top: 72px;
      --workspace-bottom: 14px;
      --sidebar-gap: 14px;
      --workspace-left: auto;
      --workspace-top: var(--sidebar-top);
      --workspace-width: min(var(--sidebar-width), calc(100vw - 28px));
      --workspace-height: calc(100vh - var(--sidebar-top) - var(--workspace-bottom));
      background: transparent;
    }
    .wrap.sidebar-docked .host-context-bar {
      opacity: 0;
      transform: translate3d(20px, 0, 0);
      pointer-events: none;
      transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out);
    }
    .wrap.sidebar-docked.panel-open .host-context-bar {
      opacity: 1;
      transform: translate3d(0, 0, 0);
      pointer-events: auto;
    }
    .host-context-bar {
      position: fixed;
      top: 14px;
      left: auto;
      right: 14px;
      width: min(calc(var(--sidebar-width) - 8px), calc(100vw - 28px));
      min-height: var(--context-bar-h);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 10px 16px;
      border: 1px solid rgba(207, 216, 232, 0.9);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(18px);
      box-shadow: 0 16px 44px -34px rgba(15, 23, 42, 0.45);
      z-index: 4;
    }
    .host-context-main,
    .host-context-status {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .host-context-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .host-badge {
      min-width: 58px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--c-primary) 14%, #ffffff 86%);
      border: 1px solid color-mix(in srgb, var(--c-primary) 30%, #d8e1ef 70%);
      color: var(--text-main);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .context-entity {
      font-size: 12px;
      color: var(--text-sub);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .context-pill {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.88);
      color: var(--text-main);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .context-pill.subtle {
      color: var(--text-sub);
      border-color: color-mix(in srgb, var(--border-color) 82%, #ffffff 18%);
    }
    .context-last {
      font-size: 11px;
      color: var(--text-sub);
      white-space: nowrap;
    }
    .backdrop {
      transition: opacity 0.18s ease;
    }
    .backdrop.is-open {
      opacity: 1;
      background: transparent;
      pointer-events: auto;
    }
    .wrap.fit-focus .backdrop.is-open {
      background: transparent;
    }
    .panel {
      top: var(--workspace-top);
      left: auto;
      right: 14px;
      bottom: var(--workspace-bottom);
      width: var(--workspace-width);
      height: auto;
      max-width: none;
      max-height: none;
      min-width: 360px;
      min-height: 420px;
      border-radius: 28px;
      border-color: rgba(211, 217, 232, 0.95);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(246, 248, 252, 0.86)),
        radial-gradient(120% 100% at 0% 0%, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0));
      backdrop-filter: blur(24px);
      box-shadow: 0 34px 80px -46px rgba(15, 23, 42, 0.56);
      z-index: 7;
      transform: translate3d(34px, 0, 0);
      transition: opacity 0.18s ease, transform 0.22s var(--ease-out);
      will-change: opacity, transform;
    }
    .panel.is-open {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
    .panel.is-closing {
      opacity: 0;
      transform: translate3d(24px, 0, 0);
    }
    .header {
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 16px 14px;
      background: transparent;
      cursor: default;
      user-select: auto;
      touch-action: auto;
    }
    .workspace-header-main {
      width: 100%;
      padding-right: 0;
      align-items: flex-start;
      text-align: left;
      gap: 6px;
    }
    .workspace-header-top {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .workspace-mode-stack {
      display: inline-grid;
      gap: 6px;
      justify-items: end;
    }
    .mode-row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .mode-row-help {
      font-size: 10px;
      color: var(--text-sub);
      line-height: 1.45;
      text-align: right;
    }
    .mode-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--text-sub);
      text-transform: uppercase;
    }
    .workspace-task-pill {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--c-primary) 12%, #ffffff 88%);
      border: 1px solid color-mix(in srgb, var(--c-primary) 32%, #d8e2ef 68%);
      color: var(--text-main);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .fit-switch {
      display: inline-flex;
      gap: 4px;
      padding: 3px;
      border-radius: 999px;
      background: rgba(245, 247, 250, 0.96);
      border: 1px solid rgba(219, 225, 236, 0.92);
    }
    .fit-btn {
      height: 26px;
      padding: 0 9px;
      border-radius: 999px;
      border: 0;
      background: transparent;
      color: var(--text-sub);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }
    .fit-btn.is-active {
      background: rgba(255, 255, 255, 0.96);
      color: var(--text-main);
      box-shadow: 0 8px 18px -16px rgba(15, 23, 42, 0.62);
    }
    .fit-btn.is-disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }
    .header-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .close {
      position: static;
      min-width: 52px;
    }
    .body {
      padding: 10px 14px 18px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      overflow-y: auto;
      background: transparent;
      align-content: stretch;
    }
    .wrap.scope-open .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .wrap.utility-open .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .wrap.scope-open.utility-open .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .scope-drawer,
    .workspace-main-col,
    .workspace-utility {
      min-height: auto;
      overflow: hidden;
      border: 1px solid rgba(221, 226, 237, 0.96);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 14px 36px -30px rgba(15, 23, 42, 0.32);
    }
    .scope-drawer,
    .workspace-utility {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .workspace-main-col {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .task-guide-card {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid rgba(221, 226, 237, 0.94);
      border-radius: 20px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 253, 0.94)),
        radial-gradient(120% 100% at 0% 0%, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0));
      box-shadow: 0 14px 34px -30px rgba(15, 23, 42, 0.36);
    }
    .task-guide-head {
      display: grid;
      gap: 4px;
    }
    .task-guide-kicker {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--text-sub);
      text-transform: uppercase;
    }
    .task-guide-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--text-main);
    }
    .task-guide-summary {
      font-size: 12px;
      color: var(--text-sub);
      line-height: 1.6;
    }
    .task-guide-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .task-guide-item {
      display: grid;
      gap: 4px;
      padding: 12px;
      border: 1px solid rgba(225, 229, 238, 0.98);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.88);
    }
    .task-guide-item .k {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--text-sub);
      text-transform: uppercase;
    }
    .task-guide-item .v {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.5;
    }
    .task-guide-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .task-guide-actions .btn {
      flex: 1 1 160px;
    }
    .wrap.workspace-blocked .task-navigation {
      display: none;
    }
    .site {
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
      font-size: 13px;
      font-weight: 800;
    }
    .summary-primary {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .table-surface,
    .verification-section,
    .result-section {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(221, 226, 237, 0.94);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.92);
    }
    .verification-section,
    .result-section {
      padding: 14px 16px;
    }
    .sync-feature-section {
      display: grid;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid rgba(221, 226, 237, 0.94);
      border-radius: 20px;
      background: rgba(251, 252, 255, 0.92);
    }
    .actions.sync-cta {
      justify-content: flex-end;
    }
    .actions.sync-cta #syncBtn {
      min-width: 180px;
      margin-left: auto;
    }
    .read-only-note {
      margin-top: -2px;
    }
    .workspace-utility .sheet-title,
    .result-wrap .sheet-title {
      margin-bottom: 0;
    }
    .wrap.task-sheet #siteTableSection,
    .wrap.task-sheet #syncFeatureSection,
    .wrap.task-sheet #resultSection {
      display: none;
    }
    .wrap.task-sheet #verificationSection {
      display: none;
    }
    .wrap.task-reservation #comparisonSection,
    .wrap.task-reservation #syncFeatureSection {
      display: none;
    }
    .wrap.task-audit #syncFeatureSection {
      display: none;
    }
    .wrap.task-reservation #siteTableSection,
    .wrap.task-reservation #sheetTableSection,
    .wrap.task-audit #siteTableSection,
    .wrap.task-audit #sheetTableSection {
      display: none;
    }
    .wrap.task-reservation #reviewSection,
    .wrap.task-audit #reviewSection {
      display: none;
    }
    .wrap.task-reservation #verificationSection,
    .wrap.task-audit #verificationSection,
    .wrap.task-sheet #sheetTableSection {
      display: grid;
    }
    .wrap.task-reservation .workspace-main-col,
    .wrap.task-audit .workspace-main-col {
      gap: 14px;
    }
    .workspace-main-col::-webkit-scrollbar,
    .scope-drawer::-webkit-scrollbar,
    .workspace-utility::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .workspace-main-col::-webkit-scrollbar-thumb,
    .scope-drawer::-webkit-scrollbar-thumb,
    .workspace-utility::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.7);
      border-radius: 999px;
    }
    @media (max-width: 1280px) {
      .panel {
        min-width: 0;
      }
      .summary-primary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .comparison-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 1080px) {
      .host-context-status {
        display: none;
      }
    }
    .workspace-shell {
      display: grid;
      gap: 12px;
      min-height: 100%;
      align-content: start;
    }
    .task-navigation {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 6px;
      border: 1px solid rgba(221, 226, 237, 0.94);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 14px 36px -30px rgba(15, 23, 42, 0.32);
    }
    .task-nav-btn {
      min-height: 40px;
      border: 1px solid rgba(211, 217, 231, 0.95);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.98);
      color: var(--text-sub);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
    }
    .task-nav-btn:hover,
    .task-nav-btn.is-active {
      transform: translateY(-1px);
      color: var(--text-main);
      border-color: color-mix(in srgb, var(--c-primary) 36%, #cbd5e1 64%);
      background: color-mix(in srgb, var(--c-primary) 9%, #ffffff 91%);
    }
    .workspace-shell-inner {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.86fr);
      gap: 12px;
      align-items: start;
    }
    .secondary-surface {
      min-height: auto;
      overflow: hidden;
      border: 1px solid rgba(221, 226, 237, 0.96);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 14px 36px -30px rgba(15, 23, 42, 0.32);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .secondary-tabs {
      display: grid;
      gap: 10px;
      padding: 14px 14px 0;
    }
    .secondary-tab-group {
      display: grid;
      gap: 6px;
    }
    .secondary-tab-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--text-sub);
      text-transform: uppercase;
    }
    .secondary-tab-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .secondary-tab {
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid rgba(211, 217, 231, 0.95);
      background: rgba(255, 255, 255, 0.96);
      color: var(--text-sub);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
    }
    .secondary-tab:hover,
    .secondary-tab.is-active {
      transform: translateY(-1px);
      color: var(--text-main);
      border-color: color-mix(in srgb, var(--c-primary) 34%, #cbd5e1 66%);
      background: color-mix(in srgb, var(--c-primary) 10%, #ffffff 90%);
    }
    .secondary-panel-wrap {
      padding: 12px 14px 14px;
      display: grid;
      gap: 12px;
      overflow-y: auto;
      min-height: 0;
    }
    .secondary-pane {
      display: none;
      gap: 12px;
    }
    .secondary-pane.is-active {
      display: grid;
    }
    .secondary-surface .scope-drawer,
    .secondary-surface .workspace-utility,
    .secondary-surface .verification-section,
    .secondary-surface .result-section {
      box-shadow: none;
      background: rgba(255, 255, 255, 0.92);
    }
    .surface-panel.hidden {
      display: none !important;
    }
    .secondary-footnote {
      font-size: 11px;
      color: var(--text-sub);
      line-height: 1.5;
    }
    .utility-debug-panel {
      display: grid;
      gap: 10px;
      padding: 14px;
      border: 1px solid rgba(221, 226, 237, 0.94);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.92);
    }
    .utility-debug-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .utility-debug-actions .btn {
      flex: 1 1 140px;
    }
    .wrap.secondary-evidence #secondarySurface {
      border-color: color-mix(in srgb, var(--c-primary) 24%, rgba(221, 226, 237, 0.96) 76%);
    }
    .wrap.secondary-utility #secondarySurface {
      border-color: rgba(200, 208, 226, 0.96);
    }
    .wrap.fit-focus .panel {
      --sidebar-width: min(42vw, 44vw);
    }
    .wrap.fit-standard .panel {
      --sidebar-width: min(36vw, 44vw);
    }
    .wrap.fit-compact .panel {
      --sidebar-width: min(32vw, 44vw);
    }
    .wrap.width-collapsed .panel {
      --sidebar-width: min(32vw, 44vw);
    }
    .wrap.width-standard .panel {
      --sidebar-width: min(36vw, 44vw);
    }
    .wrap.width-expanded .panel {
      --sidebar-width: min(42vw, 44vw);
    }
    @media (max-width: 1280px) {
      .workspace-shell-inner {
        grid-template-columns: 1fr;
      }
      .secondary-surface {
        min-height: 0;
      }
      .task-guide-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 820px) {
      .host-context-bar {
        width: calc(100vw - 24px);
        left: 12px;
        right: auto;
        top: 12px;
      }
      .panel {
        top: 68px;
        right: 8px;
        left: auto;
        width: calc(100vw - 16px);
        height: calc(100vh - 136px);
        min-width: 0;
      }
      .header {
        flex-direction: column;
      }
      .workspace-header-top {
        flex-direction: column;
        align-items: flex-start;
      }
      .workspace-mode-stack {
        width: 100%;
        justify-items: stretch;
      }
      .mode-row {
        justify-content: space-between;
      }
      .header-actions {
        width: 100%;
        justify-content: flex-end;
      }
      .body {
        padding: 12px 14px 14px;
      }
      .task-navigation {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  const SHELL_HTML = `
    <div id="wrap" class="wrap fit-auto fit-standard width-standard sidebar-docked">
      <div id="hostContextBar" class="host-context-bar">
        <div class="host-context-main">
          <div id="contextHostBadge" class="host-badge">HOST</div>
          <div class="host-context-copy">
            <div id="siteLabel" class="site"></div>
            <div id="contextEntityName" class="context-entity">컨텍스트 확인 중</div>
          </div>
        </div>
        <div class="host-context-status">
          <span id="contextConnectionStatus" class="context-pill">연결 확인</span>
          <span id="contextPermissionState" class="context-pill subtle">읽기 전용</span>
          <div id="contextLastRun" class="context-last">조회 - / 비교 - / 반영 -</div>
        </div>
      </div>

      <div id="backdrop" class="backdrop hidden"></div>

      <section id="panel" class="panel hidden">
        <div id="panelHeader" class="header">
          <div class="header-main workspace-header-main">
            <div class="workspace-header-top">
              <span id="workspaceTaskPill" class="workspace-task-pill">재고 조회 / 비교</span>
              <div class="workspace-mode-stack">
                <div class="mode-row">
                  <span class="mode-label">Density</span>
                  <div class="fit-switch" aria-label="Density mode">
                    <button id="fitCompactBtn" class="fit-btn" type="button">Compact</button>
                    <button id="fitAutoBtn" class="fit-btn is-active" type="button">Standard</button>
                    <button id="fitFocusBtn" class="fit-btn" type="button">Focus</button>
                  </div>
                </div>
                <div class="mode-row">
                  <span class="mode-label">Width</span>
                  <div class="fit-switch" aria-label="Width mode">
                    <button id="widthCollapsedBtn" class="fit-btn" type="button">Collapsed</button>
                    <button id="widthStandardBtn" class="fit-btn is-active" type="button">Standard</button>
                    <button id="widthExpandedBtn" class="fit-btn" type="button">Expanded</button>
                  </div>
                </div>
                <div class="mode-row-help">Expanded는 Focus에서만 활성화됩니다. Task와 Evidence / Utility를 함께 볼 때만 폭을 넓힙니다.</div>
              </div>
            </div>
            <div class="title-row">
              <div id="panelTitle" class="title">${TEXT.toggle}</div>
              <span id="headerStatusPill" class="header-status-pill">정상</span>
            </div>
            <div id="workspaceContextSummary" class="title-sub">현재 단계와 다음 행동을 확인하세요.</div>
          </div>
          <div class="header-actions">
            <button id="scopeToggleBtn" class="btn gray" type="button">범위</button>
            <button id="toggleConfig" class="btn secondary" type="button" title="Utility">Utility</button>
            <button id="close" class="close" type="button">${TEXT.close}</button>
          </div>
        </div>

        <div class="body">
          <div class="workspace-shell">
            <nav id="taskNavigation" class="task-navigation" aria-label="Task Navigation">
              <button id="taskNavInventoryBtn" class="task-nav-btn is-active" type="button">Inventory</button>
              <button id="taskNavReservationBtn" class="task-nav-btn" type="button">Reservation Validation</button>
              <button id="taskNavSheetBtn" class="task-nav-btn" type="button">Sheet Mapping</button>
              <button id="taskNavAuditBtn" class="task-nav-btn" type="button">OTA/PMS Audit</button>
            </nav>

            <div class="workspace-shell-inner">
              <main id="inventorySection" class="workspace-main-col">
                <section id="flowGateCard" class="flow-gate hidden">
                  <div class="task-guide-head">
                    <div id="flowGateKicker" class="task-guide-kicker">Start Gate</div>
                    <div id="flowGateTitle" class="task-guide-title">세션 확인 중</div>
                  </div>
                  <div id="flowGateSummary" class="task-guide-summary">현재 호스트와 연동 준비 상태를 확인합니다.</div>
                  <div id="flowGateSupportList" class="policy-grid"></div>
                  <div class="task-guide-actions">
                    <button id="flowGateUtilityBtn" class="btn secondary" type="button">Utility 열기</button>
                    <button id="flowGateRefreshBtn" class="btn gray" type="button">상태 다시 확인</button>
                  </div>
                </section>

                <div id="workspaceFlow" class="flow" aria-label="${TEXT.flowTitle}">
                  <div class="flow-title">${TEXT.flowTitle}</div>
                  <div class="flow-steps" id="flowSteps">
                    <div id="flowStepPeriod" class="flow-step">${TEXT.flowStepPeriod}</div>
                    <div id="flowStepLoad" class="flow-step">${TEXT.flowStepLoad}</div>
                    <div id="flowStepReview" class="flow-step">${TEXT.flowStepReview}</div>
                    <div id="flowStepApply" class="flow-step">${TEXT.flowStepApply}</div>
                  </div>
                </div>

                <div id="status" class="status" role="status" aria-live="polite" aria-atomic="true"><span class="status-k">INFO</span><span class="status-msg">${TEXT.statusIdle}</span></div>
                <div id="readOnlyNotice" class="range-hint read-only-note">읽기 전용 모드: 시트/OTA 쓰기 없이 조회와 비교만 수행합니다.</div>

                <div id="primarySummary" class="summary summary-primary">
                  <div class="card kpi-rows">${TEXT.sumRows}<b id="sumRows">0</b></div>
                  <div class="card kpi-open">${TEXT.sumOpen}<b id="sumOpen">0</b></div>
                  <div class="card kpi-closed">${TEXT.sumClosed}<b id="sumClosed">0</b></div>
                  <div class="card kpi-period">${TEXT.sumPeriod}<b id="sumPeriod">${TEXT.noPeriod}</b></div>
                </div>
                <div id="userOpsSummary" class="summary user-summary">
                  <div class="card kpi-sync">${TEXT.userSyncState}<b id="userSyncState">대기</b></div>
                  <div class="card kpi-mismatch">${TEXT.userMismatchSummary}<b id="userMismatchCount">0</b></div>
                  <div class="card kpi-pms">${TEXT.userPmsSummary}<b id="userPmsStatus">미조회</b></div>
                  <div class="card kpi-load">${TEXT.userLoadSummary}<b id="userLoadState">대기</b></div>
                </div>
                <div id="userOpsHint" class="range-hint user-hint">${TEXT.userHintIdle}</div>

                <section id="taskGuideCard" class="task-guide-card">
                  <div class="task-guide-head">
                    <div class="task-guide-kicker">Task Focus</div>
                    <div id="taskGuideTitle" class="task-guide-title">Inventory</div>
                  </div>
                  <div id="taskGuideSummary" class="task-guide-summary">현재 task의 목적과 다음 행동을 정리합니다.</div>
                  <div class="task-guide-grid">
                    <div class="task-guide-item">
                      <div class="k">Now</div>
                      <div id="taskGuideAction" class="v">범위 선택</div>
                    </div>
                    <div class="task-guide-item">
                      <div class="k">Primary View</div>
                      <div id="taskGuidePrimaryView" class="v">Task View</div>
                    </div>
                    <div class="task-guide-item">
                      <div class="k">Evidence</div>
                      <div id="taskGuideEvidence" class="v">Evidence</div>
                    </div>
                    <div class="task-guide-item">
                      <div class="k">Utility</div>
                      <div id="taskGuideUtility" class="v">Utility</div>
                    </div>
                  </div>
                  <div class="task-guide-actions">
                    <button id="taskGuideEvidenceBtn" class="btn secondary" type="button">Evidence 열기</button>
                    <button id="taskGuideUtilityBtn" class="btn gray" type="button">Utility 열기</button>
                  </div>
                </section>

                <div id="severityBanner" class="severity-banner hidden" role="alert" aria-live="assertive" aria-atomic="true">
                  <span id="severityPill" class="severity-pill">${TEXT.severityApi}</span>
                  <span id="severityText" class="severity-text">-</span>
                </div>

                <div id="workspaceActionPrimary" class="actions wide">
                  <button id="loadAll" class="btn has-inline-spinner">${TEXT.loadAll}</button>
                </div>
                <div id="workspaceActionSecondary" class="actions">
                  <button id="load" class="btn has-inline-spinner">${TEXT.loadSite}</button>
                  <button id="loadSheet" class="btn has-inline-spinner">${TEXT.loadSheet}</button>
                  <button id="syncFeatureToggle" class="btn gray hidden"></button>
                </div>

                <section id="reviewSection" class="review-shell">
                  <div class="section-head review-head">
                    <div class="section-title">${TEXT.reviewTitle}</div>
                    <div id="reviewMismatchCount" class="review-count">0건</div>
                  </div>
                  <div class="review-direction">${TEXT.reviewDirectionGuide}</div>
                  <div id="mismatchReviewList" class="review-list">
                    <div class="review-empty">${TEXT.reviewEmpty}</div>
                  </div>
                </section>

                <section id="comparisonSection" class="comparison-grid">
                  <div id="siteTableSection" class="table-surface">
                    <div class="section-head">
                      <div class="section-title with-icon section-site-title">${TEXT.siteInventory}</div>
                      <div class="actions">
                        <button id="applyCorrectionSiteBtn" class="btn secondary">보정 미리보기</button>
                        <button id="copySite" class="btn secondary">${TEXT.copySite}</button>
                      </div>
                    </div>
                    <div class="copy-wrap inventory">
                      <table>
                        <thead id="siteHead"></thead>
                        <tbody id="siteBody"></tbody>
                      </table>
                    </div>
                  </div>

                  <div id="sheetTableSection" class="table-surface">
                    <div class="section-head">
                      <div class="section-title with-icon section-sheet-title">${TEXT.sheetInventory}</div>
                      <div class="actions">
                        <button id="applyCorrectionBtn" class="btn secondary">보정 미리보기</button>
                        <button id="copySheet" class="btn secondary">${TEXT.copySheet}</button>
                      </div>
                    </div>
                    <div class="copy-wrap inventory">
                      <table>
                        <thead id="sheetHead"></thead>
                        <tbody id="sheetBody"></tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <div id="correctionBadge" class="range-hint hidden">보정 이력
- 적용 이력 없음</div>

                <div id="sheetInsightWrap" class="insight-wrap hidden">
                  <div id="insightTitle" class="insight-title">시트 객실별 예약 카운트</div>
                  <div class="copy-wrap inventory insight">
                    <table>
                      <thead id="insightHead"></thead>
                      <tbody id="insightBody"></tbody>
                    </table>
                  </div>
                  <div id="correctionIssueHint" class="range-hint insight-note">자동보정 이슈 요약
- 상태: 대기</div>
                </div>

                <div id="syncFeatureSection" class="sync-feature-section">
                  <div id="syncApprovalWrap" class="sync-approval hidden">
                    <div class="sync-approval-title">${TEXT.syncApproveTitle}</div>
                    <div class="sync-approval-summary">
                      <div class="approval-kpi">
                        <div class="k">${TEXT.syncApproveMismatch}</div>
                        <div class="v" id="syncApprovalMismatch">0</div>
                      </div>
                      <div class="approval-kpi">
                        <div class="k">${TEXT.syncApproveClosed}</div>
                        <div class="v" id="syncApprovalClosed">0</div>
                      </div>
                      <div class="approval-kpi span-2">
                        <div class="k">${TEXT.syncApprovePeriod}</div>
                        <div class="v" id="syncApprovalPeriod">${TEXT.noPeriod}</div>
                      </div>
                    </div>
                    <label class="sync-approval-check"><input id="syncApprovalCheck" type="checkbox" /> ${TEXT.syncApproveConfirmLabel}</label>
                  </div>

                  <div class="actions sync-cta">
                    <button id="syncBtn" class="btn gray">
                      <span id="syncBtnSpinner" class="btn-spinner hidden" aria-hidden="true"></span>
                      <span id="syncBtnLabel" class="btn-label"></span>
                    </button>
                  </div>
                </div>
              </main>

              <aside id="secondarySurface" class="secondary-surface">
                <div class="secondary-tabs">
                  <div class="secondary-tab-group">
                    <div class="secondary-tab-label">Evidence</div>
                    <div class="secondary-tab-row">
                      <button id="evidenceResultTabBtn" class="secondary-tab is-active" type="button">Result</button>
                      <button id="evidenceBlockingTabBtn" class="secondary-tab" type="button">Blocking</button>
                      <button id="evidenceValidationTabBtn" class="secondary-tab" type="button">Validation Basis</button>
                      <button id="evidenceTraceTabBtn" class="secondary-tab" type="button">Trace / Log</button>
                      <button id="evidenceExportTabBtn" class="secondary-tab" type="button">Export</button>
                    </div>
                  </div>
                  <div class="secondary-tab-group">
                    <div class="secondary-tab-label">Utility</div>
                    <div class="secondary-tab-row">
                      <button id="utilityScopeTabBtn" class="secondary-tab" type="button">Scope</button>
                      <button id="utilitySettingsTabBtn" class="secondary-tab" type="button">Settings</button>
                      <button id="utilityOpsTabBtn" class="secondary-tab" type="button">Ops</button>
                      <button id="utilityDebugTabBtn" class="secondary-tab" type="button">Debug</button>
                    </div>
                  </div>
                </div>

                <div class="secondary-panel-wrap">
                  <div id="evidenceSurface" class="secondary-pane is-active">
                    <section id="evidenceResultPanel" class="surface-panel result-section">
                      <div id="syncResultWrap" class="result-wrap hidden">
                        <div class="sheet-title">${TEXT.syncResult}</div>
                        <div class="summary">
                          <div class="card">${TEXT.resultTotal}<b id="resTotal">0</b></div>
                          <div class="card">${TEXT.resultSuccess}<b id="resSuccess">0</b></div>
                          <div class="card">${TEXT.resultFail}<b id="resFail">0</b></div>
                          <div class="card">${TEXT.resultClosed}<b id="resClosed">0</b></div>
                        </div>
                      </div>
                      <div class="secondary-footnote">작업 결과는 Evidence에서 확인하고 Task 흐름은 그대로 유지합니다.</div>
                    </section>

                    <section id="evidenceBlockingPanel" class="surface-panel result-section hidden">
                      <div id="syncBlockWrap" class="copy-wrap error-wrap hidden">
                        <div class="debug-head">${TEXT.syncBlockedTitle}</div>
                        <table class="result-table">
                          <thead id="syncBlockHead"></thead>
                          <tbody id="syncBlockBody"></tbody>
                        </table>
                      </div>
                      <div class="actions">
                        <button id="toggleErrorBtn" class="btn gray">${TEXT.errorToggle} (0)</button>
                      </div>
                      <div id="errorWrap" class="copy-wrap error-wrap hidden">
                        <table class="result-table">
                          <thead id="errorHead"></thead>
                          <tbody id="errorBody"></tbody>
                        </table>
                      </div>
                    </section>

                    <section id="evidenceValidationPanel" class="surface-panel verification-section hidden">
                      <div id="verifyNote" class="verify-note hidden"></div>
                      <div id="verifyIssueWrap" class="copy-wrap error-wrap hidden">
                        <table class="result-table">
                          <thead id="verifyIssueHead"></thead>
                          <tbody id="verifyIssueBody"></tbody>
                        </table>
                      </div>
                    </section>

                    <section id="evidenceTracePanel" class="surface-panel result-section hidden">
                      <div id="debugWrap" class="sheet">
                        <div class="sheet-title">${TEXT.debugTitle}</div>
                        <div class="debug-head">${TEXT.debugScan}</div>
                        <pre id="debugDiag" class="debug-pre">-</pre>
                        <div class="debug-head">${TEXT.debugLog}</div>
                        <div id="debugLog" class="debug-log">
                          <div class="debug-log-empty">-</div>
                        </div>
                      </div>
                    </section>

                    <section id="evidenceExportPanel" class="surface-panel result-section hidden">
                      <div class="sheet-title">Export</div>
                      <div class="actions">
                        <button id="exportGoldenSetBtn" class="btn secondary">${TEXT.goldenSetExport}</button>
                        <button id="exportTraceJson" class="btn secondary">${TEXT.traceExportJson}</button>
                        <button id="exportTraceCsv" class="btn secondary">${TEXT.traceExportCsv}</button>
                        <button id="downloadCorrectionDiffBtn" class="btn secondary">보정 diff CSV</button>
                        <button id="exportUnknownColorBtn" class="btn secondary">미인식 색상 CSV</button>
                      </div>
                    </section>
                  </div>

                  <div id="utilitySurface" class="secondary-pane">
                    <section id="utilityScopePanel" class="surface-panel hidden">
                      <aside id="scopeDrawer" class="scope-drawer">
                        <div id="supportPolicyBox" class="policy-box">
                          <div class="policy-box-title">지원 정책</div>
                          <div id="supportPolicySummary" class="range-hint">직접 시작 호스트와 보조 연동 상태를 확인합니다.</div>
                          <div id="supportPolicyList" class="policy-grid"></div>
                        </div>

                        <div class="calendar">
                          <div class="cal-head">
                            <div id="monthLabel" class="cal-title"></div>
                            <div class="cal-nav">
                              <button id="prevMonth" class="cal-btn">&#8249;</button>
                              <button id="nextMonth" class="cal-btn">&#8250;</button>
                            </div>
                          </div>
                          <div class="week">
                            <span>${TEXT.daySun}</span><span>${TEXT.dayMon}</span><span>${TEXT.dayTue}</span><span>${TEXT.dayWed}</span><span>${TEXT.dayThu}</span><span>${TEXT.dayFri}</span><span>${TEXT.daySat}</span>
                          </div>
                          <div id="dateGrid" class="dates"></div>
                          <div class="picked">
                            <div id="pickedText">${TEXT.selectedNone}</div>
                            <button id="resetDate" class="reset">${TEXT.resetDate}</button>
                          </div>
                          <div class="quick-presets">
                            <button id="presetRange2d" class="preset-btn">${TEXT.quickRange2d}</button>
                            <button id="presetRange7d" class="preset-btn">${TEXT.quickRange7d}</button>
                            <button id="presetRangeMonth" class="preset-btn">${TEXT.quickRangeMonth}</button>
                          </div>
                        </div>
                      </aside>
                    </section>

                    <section id="utilitySettingsPanel" class="surface-panel hidden">
                      <div id="sheetBox" class="sheet workspace-utility">
                        <div class="sheet-title">${TEXT.settingsOpen}</div>
                        <div class="sheet-grid">
                          <label class="field full">${TEXT.syncSheet}<input id="cfgSpreadsheet" type="text" /></label>
                          <label class="field">${TEXT.syncSheetName}<input id="cfgSheetName" type="text" /></label>
                          <label class="field">${TEXT.syncStartRow}<input id="cfgStartRow" type="number" min="1" /></label>
                          <label class="field">${TEXT.syncYear}<input id="cfgYear" type="number" min="2000" max="2100" /></label>
                          <label class="field">${TEXT.syncStockMode}
                            <select id="cfgStockMode">
                              <option value="available">${TEXT.syncModeAvailable}</option>
                              <option value="current">${TEXT.syncModeCurrent}</option>
                            </select>
                          </label>
                          <label class="field">${TEXT.scanMode}
                            <select id="cfgScanMode">
                              <option value="auto">${TEXT.scanModeAuto}</option>
                              <option value="manual">${TEXT.scanModeManual}</option>
                            </select>
                          </label>
                          <label class="field">${TEXT.scanAllowPkgRows}<input id="cfgAllowPkgInventoryRows" type="checkbox" /></label>
                          <label class="field">날짜/요일 기준 행(날짜행)<input id="cfgDateAnchorRow" type="number" min="1" /></label>
                          <label class="field full">수동 범위(한 박스 입력)
                            <textarea id="cfgManualRanges" placeholder="ROOM U=67-86,D=87-106,G=107-107&#10;STATION U=115-115,D=117-117,G=119-119&#10;NAVER U=120-120,D=121-121,G=122-122"></textarea>
                            <div class="range-tools">
                              <button id="cfgManualRangeSampleBtn" type="button" class="btn secondary">현재 스캔값 채우기</button>
                            </div>
                            <div id="cfgManualRangesPreview" class="range-hint">입력 미리보기: -</div>
                          </label>
                          <label class="field">${TEXT.syncClientId}<input id="cfgClientId" type="text" /></label>
                          <label class="field">${TEXT.syncClientSecret}<input id="cfgClientSecret" type="password" /></label>
                          <label class="field">${TEXT.syncProviderApply}
                            <input id="cfgProviderApply" type="checkbox" />
                            <div id="cfgProviderApplyHint" class="range-hint">-</div>
                          </label>
                          <label class="field full">${TEXT.syncAccessToken}<textarea id="cfgAccessToken"></textarea></label>
                          <label class="field full">${TEXT.syncRefreshToken}<textarea id="cfgRefreshToken"></textarea></label>
                          <label class="field">${TEXT.syncPmsPreset}
                            <select id="cfgPmsPresetKey">
                              <option value="">${TEXT.syncPmsPresetCustom}</option>
                              <option value="wings-global-guest-list">${TEXT.syncPmsPresetGlobalGuestList}</option>
                              <option value="wings-reservation-list">${TEXT.syncPmsPresetReservationList}</option>
                            </select>
                          </label>
                          <label class="field">${TEXT.syncPmsPropertyNo}<input id="cfgPmsPropertyNo" type="text" placeholder="지점 코드" /></label>
                          <label class="field">${TEXT.syncPmsBsnsCode}<input id="cfgPmsBsnsCode" type="text" placeholder="사업장 코드" /></label>
                          <label class="field">${TEXT.syncPmsPageId}<input id="cfgPmsPageId" type="text" placeholder="IR04_0100X_V03" /></label>
                          <label class="field">${TEXT.syncPmsPageSize}<input id="cfgPmsPageSize" type="number" min="1" step="1" placeholder="300" /></label>
                          <label class="field full">Wings 프리셋 미리보기
                            <div id="cfgPmsPresetPreview" class="range-hint">직접 입력 모드</div>
                            <div class="range-tools">
                              <button id="cfgPmsPresetApplyBtn" type="button" class="btn secondary">${TEXT.syncPmsPresetApply}</button>
                            </div>
                          </label>
                          <label class="field full">${TEXT.syncPmsReservationUrl}<input id="cfgPmsReservationUrl" type="text" placeholder="https://.../reservation/list?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD" /></label>
                          <label class="field full">${TEXT.syncPmsHarInput}
                            <textarea id="cfgPmsHarInput" placeholder='{"log":{"entries":[{"request":{"method":"POST","url":"https://pms.sanhait.com/...","headers":[{"name":"Cookie","value":"..."}],"postData":{"mimeType":"application/x-www-form-urlencoded","text":"..."}}}]}}'></textarea>
                            <div class="range-tools">
                              <button id="cfgPmsHarConvertBtn" type="button" class="btn secondary">${TEXT.syncPmsHarConvert}</button>
                            </div>
                          </label>
                          <label class="field full">${TEXT.syncPmsAuthBundle}
                            <textarea id="cfgPmsAuthBundle" placeholder='{"method":"POST","contentType":"form","requestBody":"BSNS_CODE=<code>&PROPERTY_NO=<code>&ARRV_DATE_F=<start>&ARRV_DATE_T=<end>","authorization":"Bearer ...","headers":{"x-requested-with":"XMLHttpRequest"},"cookieHeader":"a=1; b=2"}'></textarea>
                          </label>
                          <label class="field full">${TEXT.syncAuthBundle}
                            <textarea id="cfgAuthBundle" placeholder='{"providerType":"naver-partner","cookies":[...],"csrfToken":"...","role":"OWNER"}'></textarea>
                            <div class="range-tools">
                              <button id="captureAuthBundleBtn" type="button" class="btn secondary">${TEXT.syncAuthBundleCapture}</button>
                              <button id="copyAuthBundleBtn" type="button" class="btn gray">${TEXT.syncAuthBundleCopy}</button>
                            </div>
                          </label>
                        </div>
                        <div class="actions">
                          <button id="saveSyncCfg" class="btn secondary">${TEXT.syncSaveCfg}</button>
                          <button id="toggleSecretsBtn" class="btn gray">${TEXT.secretMaskOn}</button>
                        </div>
                      </div>
                    </section>

                    <section id="utilityOpsPanel" class="surface-panel hidden">
                      <div id="opsSection" class="ops-section">
                        <div class="sheet-title">${TEXT.opsSectionTitle}</div>
                        <div id="opsPolicySummary" class="range-hint">${TEXT.opsPolicyDefault}</div>
                        <div id="opsRetentionSummary" class="range-hint">${TEXT.opsRetentionDefault}</div>
                        <div id="opsEvidenceSummary" class="range-hint">${TEXT.opsEvidenceDefault}</div>
                      </div>
                    </section>

                    <section id="utilityDebugPanel" class="surface-panel hidden">
                      <div class="utility-debug-panel">
                        <div class="sheet-title">Debug Utility</div>
                        <div class="secondary-footnote">작업 흐름을 끊지 않고 진단 도구만 제공합니다.</div>
                        <div class="utility-debug-actions">
                          <button id="toggleDebugBtn" class="btn gray">${TEXT.debugToggle} (0)</button>
                          <button id="clearRuntimeBtn" class="btn gray">${TEXT.clearRuntime}</button>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  App.ui.panelTemplate = { STYLE: SHELL_STYLE, HTML: SHELL_HTML };
})();
