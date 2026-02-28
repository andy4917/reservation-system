(() => {
  const App = (globalThis.App = globalThis.App || {});
  App.ui = App.ui || {};

  const STYLE = `
    :host {
      --font-main: "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", "Segoe UI", sans-serif;
      --z-index: 2147483646;
    }

    /* =========================================
       1. Theme Variables (CSS Variables)
    ========================================= */
    /* 기본 (Station/Modern): 스테이션 계열 블루 톤 */
    .wrap {
      /* Colors */
      --c-primary: #123f78;
      --c-primary-fg: #ffffff;
      --c-accent: #0f8f95;
      --c-danger: #ef4444;
      --c-success: #059669;

      /* Backgrounds */
      --bg-panel: #f9fcff;
      --bg-body: #edf3fb;
      --bg-card: #ffffff;
      --bg-hover: #dee9f8;
      --bg-input: #ffffff;
      --bg-header: #123f78;
      --bg-header-soft: #e6effb;

      /* Borders & Shadows */
      --border-color: #c1d3e7;
      --shadow-panel: 0 24px 42px -26px rgba(18, 63, 120, 0.5);
      --shadow-card: 0 10px 18px -14px rgba(18, 63, 120, 0.28);
      --shadow-soft: 0 10px 20px -14px rgba(18, 63, 120, 0.3);

      /* Radius */
      --r-panel: 16px;
      --r-card: 12px;
      --r-btn: 10px;
      --r-input: 8px;

      /* Motion */
      --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
      --ease-snap: cubic-bezier(0.2, 0.85, 0.28, 1);

      /* Text */
      --text-main: #102a49;
      --text-sub: #3f5e81;
      --line-soft: #cad9eb;
      --header-text: #f6fbff;
      --header-control-bg: rgba(255, 255, 255, 0.16);
      --header-control-border: rgba(255, 255, 255, 0.4);
      --header-control-text: #eef6ff;
      --header-control-hover-bg: rgba(255, 255, 255, 0.28);
      --header-control-hover-text: #ffffff;

      /* Icons */
      --icon-site: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='3' width='20' height='16' rx='3' fill='%23111827'/%3E%3Crect x='4' y='5' width='16' height='2' fill='%2394a3b8'/%3E%3Ccircle cx='7' cy='12' r='3' fill='none' stroke='%23ffffff' stroke-width='1.5'/%3E%3Cpath d='M10 12h7M7 9v6' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      --icon-sheet: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230f9d58' d='M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'/%3E%3Cpath fill='%23fff' d='M15 2v5h5'/%3E%3Cpath fill='none' stroke='%23fff' stroke-width='1.7' d='M8 11h8M8 15h8M8 19h8M12 11v8'/%3E%3C/svg%3E");
    }

    /* 네이버 (Naver Provider): 네이버 그린, 각진 디자인 */
    .wrap.provider-naver {
      /* Colors */
      --c-primary: #03C75A;       /* Naver Green */
      --c-primary-fg: #ffffff;
      --c-accent: #0f9e49;
      --c-danger: #fa5252;

      /* Backgrounds */
      --bg-panel: #f9fefb;
      --bg-body: #e9f5ee;
      --bg-card: #ffffff;
      --bg-hover: #d8efdf;
      --bg-input: #ffffff;
      --bg-header: #03c75a;
      --bg-header-soft: #e4f7eb;

      /* Borders & Shadows */
      --border-color: #bad8c5;
      --shadow-panel: 0 20px 36px -24px rgba(2, 84, 42, 0.42);
      --shadow-card: 0 10px 16px -14px rgba(2, 84, 42, 0.24);
      --shadow-soft: 0 10px 18px -14px rgba(2, 84, 42, 0.32);

      /* Radius (Boxy) */
      --r-panel: 12px;
      --r-card: 8px;
      --r-btn: 8px;
      --r-input: 8px;

      /* Text */
      --text-main: #143322;
      --text-sub: #3f6b52;
      --line-soft: #c9e4d4;
      --header-text: #ffffff;
      --header-control-bg: rgba(255, 255, 255, 0.18);
      --header-control-border: rgba(255, 255, 255, 0.5);
      --header-control-text: #f4fff8;
      --header-control-hover-bg: rgba(255, 255, 255, 0.3);
      --header-control-hover-text: #ffffff;
      --icon-site: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='3' width='20' height='16' rx='3' fill='%2303C75A'/%3E%3Crect x='4' y='5' width='16' height='2' fill='%23c8f3dd'/%3E%3Cpath fill='%23fff' d='M8 9h2.2l2.8 3.8V9h2v6H13l-3-4.1V15H8z'/%3E%3C/svg%3E");
    }

    .wrap.provider-station {
      --c-primary: #2a3f56;
      --c-accent: #48657f;
      --bg-panel: #f2f5f8;
      --bg-body: #dfe6ee;
      --bg-hover: #c8d4e1;
      --bg-header: #26384c;
      --bg-header-soft: #d5dee8;
      --border-color: #9eb0c2;
      --text-main: #1d2c3b;
      --text-sub: #3e556c;
      --line-soft: #b7c4d2;
      --header-text: #eef3f8;
      --header-control-bg: rgba(255, 255, 255, 0.14);
      --header-control-border: rgba(255, 255, 255, 0.32);
      --header-control-text: #e3ebf3;
      --header-control-hover-bg: rgba(255, 255, 255, 0.24);
      --header-control-hover-text: #ffffff;
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
      right: 20px;
      bottom: 20px;
      z-index: var(--z-index);
      color: var(--text-main);
      font-size: 13px;
      line-height: 1.5;
    }

    .hidden {
      display: none !important;
    }

    /* =========================================
       3. Main Components
    ========================================= */

    /* Toggle Button (Floating) */
    .toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 50px;
      padding: 0 24px;
      background: var(--c-primary);
      color: var(--c-primary-fg);
      border: 1px solid color-mix(in srgb, var(--c-primary) 80%, #ffffff 20%);
      border-radius: 999px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      letter-spacing: 0.01em;
      box-shadow: 0 10px 24px -16px rgba(15, 23, 42, 0.5);
      transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
      position: relative;
      z-index: 3;
    }
    .toggle:hover {
      transform: translateY(-1px);
      background: color-mix(in srgb, var(--c-primary) 92%, #ffffff 8%);
      box-shadow: 0 12px 24px -16px rgba(15, 23, 42, 0.58);
    }
    .toggle:active {
      transform: translateY(0);
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.24);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.14s ease;
      z-index: 1;
    }
    .backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }
    .backdrop.is-closing {
      opacity: 0;
    }

    /* Main Panel */
    .panel {
      position: absolute;
      bottom: max(60px, calc(env(safe-area-inset-bottom) + 12px));
      right: 0;
      width: min(640px, calc(100vw - 48px));
      max-width: 640px;
      min-width: 420px;
      height: min(920px, calc(100vh - 84px));
      max-height: calc(100vh - 84px);
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: var(--r-panel);
      box-shadow: var(--shadow-panel);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px);
      transition:
        opacity 0.14s ease,
        transform 0.16s ease;
      pointer-events: none;
      z-index: 2;
      will-change: opacity, transform;
    }
    .panel.is-open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .panel.is-closing {
      opacity: 0;
      transform: translateY(6px);
      pointer-events: none;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      background: var(--bg-header);
      border-bottom: 1px solid color-mix(in srgb, var(--header-text) 18%, transparent 82%);
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 30;
    }
    .title {
      font-size: 15px;
      font-weight: 800;
      color: var(--header-text);
      letter-spacing: 0.01em;
    }
    .close {
      background: var(--header-control-bg);
      border: 1px solid var(--header-control-border);
      color: var(--header-control-text);
      cursor: pointer;
      padding: 6px 9px;
      border-radius: 999px;
      font-size: 13px;
      transition: background 0.14s ease, color 0.14s ease;
    }
    .close:hover { background: var(--header-control-hover-bg); color: var(--header-control-hover-text); }

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
    .body > * {
      flex: 0 0 auto;
      min-width: 0;
    }

    .site {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-sub);
      margin-bottom: -4px;
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 999px;
      padding: 7px 11px;
      width: fit-content;
      box-shadow: var(--shadow-soft);
    }

    .flow {
      display: grid;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 10px 12px;
      box-shadow: var(--shadow-card);
    }
    .flow-title {
      font-size: 11px;
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
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: #f8fafc;
      color: var(--text-sub);
      font-size: 11px;
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
      border-color: #86efac;
      background: #dcfce7;
      color: #166534;
    }
    .onboarding {
      display: grid;
      gap: 8px;
      background: #fffaf0;
      border: 1px solid #f2d39a;
      border-radius: var(--r-card);
      padding: 10px 12px;
      box-shadow: var(--shadow-card);
    }
    .onboarding-title {
      font-size: 12px;
      font-weight: 700;
      color: #7c2d12;
    }
    .onboarding-items {
      display: grid;
      gap: 5px;
    }
    .onboarding-item {
      font-size: 11px;
      color: #8a5b1f;
      line-height: 1.35;
      font-weight: 600;
    }
    .onboarding-item.done {
      color: #166534;
    }

    /* =========================================
       4. Calendar & Date Picker
    ========================================= */
    .calendar {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      overflow: hidden;
      box-shadow: var(--shadow-card);
      min-width: 0;
      flex-shrink: 0;
      position: relative;
    }
    .cal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
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
      padding: 10px 16px; background: var(--bg-hover);
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
      background: color-mix(in srgb, var(--bg-card) 80%, var(--bg-header-soft) 20%);
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
       5. Status & Dashboard
    ========================================= */
    .status {
      padding: 10px 14px;
      border-radius: var(--r-card);
      font-size: 12px;
      background: #f1f5f9; color: var(--text-sub);
      border: 1px solid transparent;
      display: flex; align-items: center; gap: 8px;
      box-shadow: none;
    }
    .status.ok { background: #dcfce7; color: #15803d; border-color: #86efac; }
    .status.warn { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
    .status.error { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
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

    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--r-card);
      padding: 10px;
      min-height: 66px;
      text-align: center;
      font-size: 11px; color: var(--text-sub);
      display: flex;
      flex-direction: column;
      justify-content: center;
      box-shadow: var(--shadow-card);
    }
    .card b { display: block; margin-top: 4px; font-size: 14px; font-weight: 700; color: var(--text-main); }
    .user-summary .card {
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .user-hint {
      margin-top: 8px;
    }
    .result-wrap .summary { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }

    /* =========================================
       6. Tables & Actions
    ========================================= */
    .section-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 6px;
      padding: 10px 2px 0;
      border-top: 1px solid var(--line-soft);
    }
    .summary + .section-head { margin-top: 0; }
    .section-title { font-size: 13px; font-weight: 700; color: var(--text-main); }
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
    .actions.wide .btn { min-width: 150px; }

    /* Buttons */
    .btn {
      height: 34px; padding: 0 14px;
      min-width: 104px;
      border-radius: var(--r-btn);
      border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent 60%);
      font-size: 12px; font-weight: 600;
      cursor: pointer;
      transition:
        background 0.14s ease,
        border-color 0.14s ease,
        color 0.14s ease;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--c-primary);
      color: var(--c-primary-fg);
      white-space: nowrap;
      box-shadow: none;
    }
    .btn:hover:not(:disabled) { background: color-mix(in srgb, var(--c-primary) 92%, #ffffff 8%); }
    .btn:disabled { background: #e2e8f0; color: #94a3b8; border-color: #d7dee8; cursor: not-allowed; box-shadow: none; }

    .btn.secondary {
      background: #ffffff; border-color: var(--border-color); color: var(--text-main); box-shadow: none;
    }
    .btn.secondary:hover:not(:disabled) { background: var(--bg-hover); border-color: #b7ccdf; }

    .btn.gray { background: #ecf2f8; color: var(--text-main); border: 1px solid #d2deea; box-shadow: none; }
    .btn.gray:hover:not(:disabled) { background: #e2e8f0; }

    .btn.ready {
      background: var(--c-accent);
      border-color: color-mix(in srgb, var(--c-accent) 60%, transparent 40%);
      color: white;
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
      width: 132px;
      min-width: 132px;
    }
    #toggleConfig {
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
      box-shadow: var(--shadow-card);
    }
    .copy-wrap.inventory,
    .copy-wrap.mismatch-wrap {
      min-height: 112px;
    }
    .section-head + .copy-wrap {
      margin-top: 6px;
    }
    table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto; }
    th {
      position: sticky; top: 0;
      background: var(--bg-hover); color: var(--text-sub);
      font-weight: 600; padding: 8px 10px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap; z-index: 10;
      min-width: 56px;
      text-align: center;
    }
    td {
      padding: 8px 10px; border-bottom: 1px solid var(--border-color);
      color: var(--text-main); text-align: center; white-space: nowrap;
      min-width: 56px;
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
      padding: 20px 10px;
      white-space: normal;
    }
    .mismatch-wrap td { white-space: normal; line-height: 1.35; }
    .inventory td.corrected-cell {
      color: #991b1b;
      font-weight: 700;
      background: #fecaca;
      transition: color 0.15s ease, background 0.15s ease;
    }
    .inventory td.corrected-cell:hover,
    .inventory tbody tr:hover td.corrected-cell {
      color: #7f1d1d;
      background: #fca5a5;
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
      box-shadow: var(--shadow-card);
    }
    .sync-feature-section {
      display: grid;
      gap: 10px;
      margin-top: 2px;
      padding-top: 8px;
      border-top: 1px dashed var(--line-soft);
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
      padding: 10px;
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
      padding: 8px 10px;
      border: 1px solid var(--border-color);
      border-radius: var(--r-input);
      font-family: inherit; font-size: 12px;
      background: var(--bg-input); color: var(--text-main);
      transition: border-color 0.2s;
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
      box-shadow: 0 0 0 2px rgba(0,0,0,0.05);
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
      padding: 9px 11px;
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

    .toggle:focus-visible,
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
      box-shadow: var(--shadow-card);
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
      .panel { min-width: 0; width: min(96vw, 640px); right: 0; }
      .flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sync-approval-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .quick-presets { gap: 4px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sheet-grid { grid-template-columns: 1fr; }
      .field.full { grid-column: span 1; }
      .btn { min-width: 96px; }
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
        width: 120px;
        min-width: 120px;
      }
    }
    @media (max-width: 640px) {
      .wrap { left: 8px; right: 8px; bottom: 8px; }
      .panel { width: calc(100vw - 16px); right: 0; bottom: 62px; max-height: calc(100vh - 84px); min-width: 0; }
      .body { padding: 12px; }
      .flow-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sync-approval-summary { grid-template-columns: 1fr; }
      .quick-presets { padding: 8px 10px 10px; }
      .preset-btn { flex: 1 1 calc(33.33% - 4px); min-width: 0; text-align: center; }
      .summary { grid-template-columns: repeat(2, 1fr); }
      .copy-wrap { max-height: 260px; }
      .section-head { align-items: flex-start; }
      .actions { width: 100%; }
      .actions .btn { flex: 1 1 calc(50% - 8px); min-width: 0 !important; width: auto !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel,
      .backdrop,
      .btn,
      .toggle,
      .cal-btn,
      .day,
      .reset,
      .close,
      .status,
      .card,
      .dates {
        transition: none !important;
        animation: none !important;
      }
    }
  `;

  const HTML = `
    <div id="wrap" class="wrap">
      <button id="toggle" class="toggle" aria-expanded="false">${TEXT.toggleStart}</button>
      <div id="backdrop" class="backdrop hidden"></div>
      <section id="panel" class="panel hidden">
        <div class="header">
          <div id="panelTitle" class="title">${TEXT.toggle}</div>
          <button id="close" class="close">${TEXT.close}</button>
        </div>
        <div class="body">
          <div id="siteLabel" class="site"></div>
          <div class="flow" aria-label="${TEXT.flowTitle}">
            <div class="flow-title">${TEXT.flowTitle}</div>
            <div class="flow-steps" id="flowSteps">
              <div id="flowStepPeriod" class="flow-step">${TEXT.flowStepPeriod}</div>
              <div id="flowStepLoad" class="flow-step">${TEXT.flowStepLoad}</div>
              <div id="flowStepReview" class="flow-step">${TEXT.flowStepReview}</div>
              <div id="flowStepApply" class="flow-step">${TEXT.flowStepApply}</div>
            </div>
          </div>
          <div id="onboardingBox" class="onboarding hidden">
            <div class="onboarding-title">${TEXT.onboardingTitle}</div>
            <div class="onboarding-items">
              <div id="onboardingSheetItem" class="onboarding-item"></div>
              <div id="onboardingAuthItem" class="onboarding-item"></div>
              <div id="onboardingRangeItem" class="onboarding-item"></div>
              <div id="onboardingTestItem" class="onboarding-item"></div>
            </div>
            <div class="actions">
              <button id="hideOnboardingBtn" class="btn secondary">${TEXT.onboardingHide}</button>
            </div>
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

          <div id="status" class="status" role="status" aria-live="polite" aria-atomic="true"><span class="status-k">INFO</span><span class="status-msg">${TEXT.statusIdle}</span></div>

          <div class="summary">
            <div class="card">${TEXT.sumRows}<b id="sumRows">0</b></div>
            <div class="card">${TEXT.sumOpen}<b id="sumOpen">0</b></div>
            <div class="card">${TEXT.sumClosed}<b id="sumClosed">0</b></div>
            <div class="card">${TEXT.sumPeriod}<b id="sumPeriod">${TEXT.noPeriod}</b></div>
          </div>
          <div id="userOpsSummary" class="summary user-summary">
            <div class="card">${TEXT.userSyncState}<b id="userSyncState">대기</b></div>
            <div class="card">${TEXT.userMismatchSummary}<b id="userMismatchCount">0</b></div>
            <div class="card">${TEXT.userPmsSummary}<b id="userPmsStatus">미조회</b></div>
            <div class="card">${TEXT.userLoadSummary}<b id="userLoadState">대기</b></div>
          </div>
          <div id="userOpsHint" class="range-hint user-hint">${TEXT.userHintIdle}</div>
          <div class="actions wide">
            <button id="loadAll" class="btn">${TEXT.loadAll}</button>
          </div>

          <div class="actions">
            <button id="load" class="btn">${TEXT.loadSite}</button>
            <button id="loadSheet" class="btn">${TEXT.loadSheet}</button>
            <button id="syncFeatureToggle" class="btn gray"></button>
          </div>

          <div id="syncFeatureSection" class="sync-feature-section">
            <div id="syncApprovalWrap" class="sync-approval hidden">
              <div class="sync-approval-title">${TEXT.syncApproveTitle}</div>
              <div class="sync-approval-summary">
                <div class="sync-approval-item">${TEXT.syncApproveMismatch}<b id="syncApprovalMismatch">0</b></div>
                <div class="sync-approval-item">${TEXT.syncApproveClosed}<b id="syncApprovalClosed">0</b></div>
                <div class="sync-approval-item">${TEXT.syncApprovePeriod}<b id="syncApprovalPeriod">${TEXT.noPeriod}</b></div>
              </div>
              <label class="sync-approval-check">
                <input id="syncApprovalCheck" type="checkbox" />
                <span>${TEXT.syncApproveConfirmLabel}</span>
              </label>
            </div>
            <div class="actions">
              <button id="syncBtn" class="btn gray"></button>
            </div>

            <div id="syncResultWrap" class="result-wrap hidden">
              <div class="sheet-title">${TEXT.syncResult}</div>
              <div class="summary">
                <div class="card">${TEXT.resultTotal}<b id="resTotal">0</b></div>
                <div class="card">${TEXT.resultSuccess}<b id="resSuccess">0</b></div>
                <div class="card">${TEXT.resultFail}<b id="resFail">0</b></div>
                <div class="card">${TEXT.resultClosed}<b id="resClosed">0</b></div>
              </div>
            </div>
            <div class="actions">
              <button id="toggleConfig" class="btn secondary" title="${TEXT.settingsOpen}">⚙</button>
            </div>
            <div id="sheetBox" class="sheet hidden">
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
                <label class="field">${TEXT.syncPmsPropertyNo}<input id="cfgPmsPropertyNo" type="text" placeholder="91" /></label>
                <label class="field">${TEXT.syncPmsBsnsCode}<input id="cfgPmsBsnsCode" type="text" placeholder="91" /></label>
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
                  <textarea id="cfgPmsAuthBundle" placeholder='{"method":"POST","contentType":"form","requestBody":"BSNS_CODE=91&PROPERTY_NO=91&ARRV_DATE_F=2026-02-28&ARRV_DATE_T=2026-03-07","authorization":"Bearer ...","headers":{"x-requested-with":"XMLHttpRequest"},"cookieHeader":"a=1; b=2"}'></textarea>
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
              <div class="ops-shell">
                <div class="section-head ops-head">
                  <div class="section-title">${TEXT.opsSectionTitle}</div>
                  <div class="actions">
                    <button id="toggleOpsSectionBtn" class="btn gray">${TEXT.opsSectionShow}</button>
                  </div>
                </div>
                <div id="opsSection" class="ops-section hidden">
                  <div id="opsPolicySummary" class="range-hint">${TEXT.opsPolicyDefault}</div>
                  <div id="opsRetentionSummary" class="range-hint">${TEXT.opsRetentionDefault}</div>
                  <div id="opsEvidenceSummary" class="range-hint">${TEXT.opsEvidenceDefault}</div>

                  <div class="section-head">
                    <div class="section-title with-icon section-site-title">${TEXT.siteInventory}</div>
                    <div class="actions">
                      <button id="applyCorrectionSiteBtn" class="btn secondary">보정 적용</button>
                      <button id="copySite" class="btn secondary">${TEXT.copySite}</button>
                    </div>
                  </div>
                  <div class="copy-wrap inventory">
                    <table>
                      <thead id="siteHead"></thead>
                      <tbody id="siteBody"></tbody>
                    </table>
                  </div>

                  <div class="section-head">
                    <div class="section-title with-icon section-sheet-title">${TEXT.sheetInventory}</div>
                    <div class="actions">
                      <button id="applyCorrectionBtn" class="btn secondary">보정 적용</button>
                      <button id="copySheet" class="btn secondary">${TEXT.copySheet}</button>
                    </div>
                  </div>
                  <div class="copy-wrap inventory">
                    <table>
                      <thead id="sheetHead"></thead>
                      <tbody id="sheetBody"></tbody>
                    </table>
                  </div>
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

                  <div id="verifyNote" class="verify-note hidden"></div>
                  <div id="verifyIssueWrap" class="copy-wrap error-wrap hidden">
                    <table class="result-table">
                      <thead id="verifyIssueHead"></thead>
                      <tbody id="verifyIssueBody"></tbody>
                    </table>
                  </div>

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

                  <div class="actions">
                    <button id="exportGoldenSetBtn" class="btn secondary">${TEXT.goldenSetExport}</button>
                    <button id="exportTraceJson" class="btn secondary">${TEXT.traceExportJson}</button>
                    <button id="exportTraceCsv" class="btn secondary">${TEXT.traceExportCsv}</button>
                    <button id="downloadCorrectionDiffBtn" class="btn secondary">보정 diff CSV</button>
                    <button id="exportUnknownColorBtn" class="btn secondary">미인식 색상 CSV</button>
                    <button id="toggleDebugBtn" class="btn gray">${TEXT.debugToggle} (0)</button>
                    <button id="clearRuntimeBtn" class="btn gray">${TEXT.clearRuntime}</button>
                  </div>

                  <div id="debugWrap" class="sheet hidden">
                    <div class="sheet-title">${TEXT.debugTitle}</div>
                    <div class="debug-head">${TEXT.debugScan}</div>
                    <pre id="debugDiag" class="debug-pre">-</pre>
                    <div class="debug-head">${TEXT.debugLog}</div>
                    <div id="debugLog" class="debug-log">
                      <div class="debug-log-empty">-</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  App.ui.panelTemplate = { STYLE, HTML };
})();
