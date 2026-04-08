# UI Workbench Recovery

이 폴더는 `2026-04-06` 프론트 재작업 산출물을 현재 저장소 작업면으로 다시 불러오기 위해 만든 복구 작업면입니다.

구성:

- `public/desktop-program-ui/`
  - `/mnt/c/Users/anise/Desktop/프로그램 ui`에서 회수한 기능별 HTML/PNG/메모
- `public/stitch-recovery/`
  - `/home/dev/repos/reservation-system-recovery-assets/2026-04-06-uh-task-manager-stitch`에서 회수한 Stitch export
- `stories/`
  - 회수한 HTML 화면을 Storybook에서 바로 훑을 수 있게 만든 최소 story 집합

실행:

```bash
npm --prefix ui-workbench install
npm --prefix ui-workbench run storybook
```

주의:

- 현재 `ui-workbench/` 원본 소스는 아직 찾지 못했습니다.
- 이 작업면은 살아남은 HTML/PNG/디자인 산출물을 기준으로 만든 복구용 워크벤치입니다.
- 따라서 `2026-04-07` reset backup 안의 원본 `ui-workbench/`와 100% 동일하다고 단정할 수는 없습니다.
