# Project Guardrails

## 적용 범위
- 이 파일은 현재 작업 디렉터리가 `예약 통합 관리 시스템` 저장소일 때만 적용합니다.

## 우선순위
- 전역 또는 상위 지침이 있으면 그 규칙을 먼저 따르고, 이 파일은 현재 저장소에만 필요한 로컬 제약을 보완하는 용도로만 사용합니다.

## 런타임 확인
- 실제 적용 범위와 런타임 적용 여부는 이 파일 내용만으로 단정하지 말고, Codex가 어느 디렉터리에서 실행 중인지 별도 확인합니다.

## 질문 범위
- 현재 적용 여부를 묻는 질문은 session-injected instructions 와 runtime state 를 먼저 확인하고, 파일 내용 자체를 묻는 경우에만 이 문서를 직접 근거로 사용합니다.

- Keep this file limited to repository-specific rules for this project.
- Do not commit or paste live credentials, tokens, cookies, auth bundles, or OAuth secrets into tracked files or instructions.
- Use `instruction-hygiene` when refactoring `AGENTS.md` or other instruction files.
