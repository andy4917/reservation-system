# Readonly Core Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend-facing read-only core by adding a main-owned live-read bundle contract and aligning probe coverage around the same contract, while keeping write/apply execution out of scope.

**Architecture:** Add a dedicated main-process bundle module that composes the existing sheet, OTA, and PMS read paths into one payload with shared query metadata and an overall classification. Keep the existing per-source APIs for compatibility, but promote the bundle as the authoritative backend surface for future frontend work and backend smoke/probe flows.

**Tech Stack:** Electron main/preload IPC, TypeScript contracts, existing app_v2 read runners, Node regression tests
