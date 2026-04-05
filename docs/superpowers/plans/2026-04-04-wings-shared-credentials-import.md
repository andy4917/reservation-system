# Wings Shared Credentials Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import branch-shared Wings credentials from a provided text file, store them in app settings, and use them for branch-aware Wings login with `UHSUITE` fixed as the company id.

**Architecture:** Electron main owns credential import, normalization, and branch-aware login injection. Renderer stops collecting raw Wings id/password manually and instead shows imported shared-account state plus explicit import/login actions. Tests lock the settings contract, importer behavior, and login injection.

**Tech Stack:** TypeScript, Electron main/renderer IPC, Node filesystem, existing app_v2 regression tests

---
