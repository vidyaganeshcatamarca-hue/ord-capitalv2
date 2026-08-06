**Change**: iconos-audit-2026-08

## Section 1: Task List Format

```markdown
## Task N: <id> — <title>

**Type**: code | test | refactor
**File(s)**: <paths>
**Depends on**: <Task M, Task K> (or `none`)
**Acceptance criteria**:
- [ ] tsc --noEmit passes
- [ ] <specific behavior verifiable>
**Commit message**: `<type>(<scope>): <subject>` (no Co-Authored-By trailer)
**Rollback boundary**: <which commit to revert if this task alone is bad>
```

## Section 2: Tasks (ordered by WU)

### WU-1: Refactor CategoryIcon (1 task)

**Task 1.1**: Extend CategoryIcon with isLikelyLucideName and text-branch.
- **Type**: refactor
- **File(s)**: `src/components/CategoryIcon/CategoryIcon.tsx`
- **Depends on**: none
- **Acceptance criteria**:
  - [ ] Named export `isLikelyLucideName` present
  - [ ] `CategoryIcon` accepts `name?: string | null` (loose prop)
  - [ ] Renders domain fallback (`Tag`) when name is null/undefined/empty/whitespace
  - [ ] Renders lucide icon when name passes `isLikelyLucideName` AND exists in ICON_MAP
  - [ ] Renders text-span (with `fontSize: 'inherit'`, `lineHeight: 1`) when name is non-null but doesn't match ICON_MAP
  - [ ] All existing 19+ call sites of CategoryIcon continue to render identically
  - [ ] tsc --noEmit passes
  - [ ] npm run build passes
- **Commit message**: `refactor(category-icon): add isLikelyLucideName and emoji fallback`
- **Rollback boundary**: revert commit → reverts refactor, app reverts to old CategoryIcon behavior

### WU-2: WalletIcon (3 tasks)

**Task 2.1**: Create WalletIcon component.
- **Type**: code
- **File(s)**: `src/components/WalletIcon/WalletIcon.tsx` (new)
- **Depends on**: Task 1.1
- **Acceptance criteria**:
  - [ ] `WalletIconProps` exported with `name?`, `size?`, `className?`
  - [ ] `WalletIcon` component exported
  - [ ] Missing/empty name → renders CategoryIcon with `"Wallet"`
  - [ ] Non-null name → renders CategoryIcon with the name
- **Commit message**: `feat(wallet-icon): introduce wrapper component`
- **Rollback boundary**: revert commit → component removed, no call sites yet so zero impact

**Task 2.2**: Add WalletIcon barrel export.
- **Type**: code
- **File(s)**: `src/components/WalletIcon/index.ts` (new)
- **Depends on**: Task 2.1
- **Acceptance criteria**:
  - [ ] Re-exports WalletIcon and WalletIconProps
  - [ ] tsc passes
- **Commit message**: `chore(wallet-icon): add barrel export`
- **Rollback boundary**: revert commit → import paths using `components/WalletIcon` still work; barrel only saves typing

**Task 2.3**: Add unit + component test for WalletIcon.
- **Type**: test
- **File(s)**: `tests/icon-wrappers/wallet-icon.test.tsx` (new)
- **Depends on**: Task 2.1
- **Acceptance criteria**:
  - [ ] Test renders `<WalletIcon/>` and asserts `Tag` is NOT shown; rather, the lucide `Wallet` is rendered
  - [ ] Test renders `<WalletIcon name="M"/>` and asserts the text-branch span shows "M"
  - [ ] Test renders `<WalletIcon name="Landmark"/>` and asserts the lucide `Landmark` SVG is present
  - [ ] Test runs via `node tests/test_runner.js wallet-icon` (or equivalent pattern in this repo)
- **Commit message**: `test(wallet-icon): add render tests for fallback + legacy + lucide`
- **Rollback boundary**: revert commit → test removed, no impact on app

### WU-3: ProyectoIcon (3 tasks, mirror of WU-2)

**Task 3.1**: Create ProyectoIcon component (fallback `FolderKanban`).
- **Type**: code
- **File(s)**: `src/components/ProyectoIcon/ProyectoIcon.tsx` (new)
- **Depends on**: Task 1.1
- **Acceptance criteria**: Same as Task 2.1 with `FolderKanban` fallback.
- **Commit message**: `feat(proyecto-icon): introduce wrapper component`
- **Rollback boundary**: revert commit → component removed

**Task 3.2**: Add ProyectoIcon barrel export.
- **Type**: code
- **File(s)**: `src/components/ProyectoIcon/index.ts` (new)
- **Depends on**: Task 3.1
- **Acceptance criteria**: Re-exports ProyectoIcon and ProyectoIconProps; tsc passes.
- **Commit message**: `chore(proyecto-icon): add barrel export`
- **Rollback boundary**: revert commit → import paths still work

**Task 3.3**: Add unit + component test for ProyectoIcon.
- **Type**: test
- **File(s)**: `tests/icon-wrappers/proyecto-icon.test.tsx` (new)
- **Depends on**: Task 3.1
- **Acceptance criteria**: Similar to WalletIcon tests; asserts correct renders with fallback, legacy, and lucide names.
- **Commit message**: `test(proyecto-icon): add render tests for fallback + legacy + lucide`
- **Rollback boundary**: revert commit → test removed

### WU-4: Migrate CategoryIcon render sites (6 tasks, one per file)

**Task 4.1**: Migrate AddCategoryModal.tsx (L154).
- **Type**: refactor
- **File(s)**: `src/components/AddCategoryModal/AddCategoryModal.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: Replace `{rubro.icono}` raw string with `<CategoryIcon name={rubro.icono} size={...}/>`; visual identical.
- **Commit message**: `refactor(add-category-modal): use CategoryIcon for rubro`
- **Rollback boundary**: revert commit → changes to this modal undone

**Task 4.2**: Migrate AddMovementModal.tsx (L883 — categoriaIngreso).
- **Type**: refactor
- **File(s)**: `src/components/AddMovementModal/AddMovementModal.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: Replace one site with CategoryIcon; preserve size if present.
- **Commit message**: `refactor(add-movement-modal): use CategoryIcon for income category`
- **Rollback boundary**: revert commit

**Task 4.3**: Migrate DetalleBalanceModal.tsx (L198).
- **Type**: refactor
- **File(s)**: `src/components/DetalleBalanceModal/DetalleBalanceModal.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: One CategoryIcon replacement.
- **Commit message**: `refactor(detalle-balance-modal): use CategoryIcon for category`
- **Rollback boundary**: revert commit

**Task 4.4**: Migrate EditarCuarentenaModal.tsx (L138).
- **Type**: refactor
- **File(s)**: `src/components/saneamiento/EditarCuarentenaModal.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: One CategoryIcon replacement.
- **Commit message**: `refactor(cuarentena-modal): use CategoryIcon for category`
- **Rollback boundary**: revert commit

**Task 4.5**: Migrate BCG components (4 files: BCGCuadranteAcordeon L67, BCGDetalleCategoria L118, BCGHormigas L150, BCGPodora L101).
- **Type**: refactor (combined commit per file = 4 commits)
- **File(s)**: `src/components/bcg/BCGCuadranteAcordeon.tsx`, `BCGDetalleCategoria.tsx`, `BCGHormigas.tsx`, `BCGPodora.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: Each file gets CategoryIcon replacement; visual smoke after each.
- **Commit message**: `refactor(bcg): use CategoryIcon for category icon` (repeat per file)
- **Rollback boundary**: revert corresponding commit for each file

**Task 4.6**: Migrate HomePage.tsx CategoryIcon sites (L1278, L1505, L1528).
- **Type**: refactor
- **File(s)**: `src/pages/Home/HomePage.tsx`
- **Depends on**: Task 1.1
- **Acceptance criteria**: Three CategoryIcon replacements; visual smoke.
- **Commit message**: `refactor(home-page): use CategoryIcon for category icons`
- **Rollback boundary**: revert commit

### WU-5: Migrate WalletIcon render sites (3 tasks)

**Task 5.1**: Migrate AddMovementModal.tsx wallet sites (L969, L1053, L1300, L1469, L1496, L1934).
- **Type**: refactor
- **File(s)**: `src/components/AddMovementModal/AddMovementModal.tsx`
- **Depends on**: Task 2.3
- **Acceptance criteria**: Six WalletIcon replacements; preserve class `cuenta-icono`. Option-list inside `<select>` keeps emoji rendering via legacy branch when `b.icono` is `"M"`.
- **Commit message**: `refactor(add-movement-modal): use WalletIcon for wallet renders`
- **Rollback boundary**: revert commit

**Task 5.2**: Migrate BilleteraDetailModal.tsx (L48).
- **Type**: refactor
- **File(s)**: `src/components/BilleteraDetailModal/BilleteraDetailModal.tsx`
- **Depends on**: Task 2.3
- **Acceptance criteria**: One WalletIcon replacement; visual identical.
- **Commit message**: `refactor(billetera-detail-modal): use WalletIcon`
- **Rollback boundary**: revert commit

**Task 5.3**: Migrate HomePage.tsx wallet site (L967).
- **Type**: refactor
- **File(s)**: `src/pages/Home/HomePage.tsx`
- **Depends on**: Task 2.3
- **Acceptance criteria**: One WalletIcon replacement; visual smoke.
- **Commit message**: `refactor(home-page): use WalletIcon for wallet emoji badge`
- **Rollback boundary**: revert commit

### WU-6: Migrate ProyectoIcon render sites (2 tasks)

**Task 6.1**: Migrate AddMovementModal.tsx project site (L182).
- **Type**: refactor
- **File(s)**: `src/components/AddMovementModal/AddMovementModal.tsx`
- **Depends on**: Task 3.3
- **Acceptance criteria**: One ProyectoIcon replacement; visual identical.
- **Commit message**: `refactor(add-movement-modal): use ProyectoIcon for project pill`
- **Rollback boundary**: revert commit

**Task 6.2**: Migrate FamiliaPage.tsx (L240).
- **Type**: refactor
- **File(s)**: `src/pages/Familia/FamiliaPage.tsx`
- **Depends on**: Task 3.3
- **Acceptance criteria**: One ProyectoIcon replacement; visual smoke.
- **Commit message**: `refactor(familia-page): use ProyectoIcon for project icon`
- **Rollback boundary**: revert commit

### WU-7: Final audit (1 task)

**Task 7.1**: Run grep audit + final build.
- **Type**: test
- **File(s)**: `tests/icon-wrappers/audit.sh` (new)
- **Depends on**: all above
- **Acceptance criteria**:
  - [ ] audit.sh script exists and is executable
  - [ ] Running it returns exit 0 with the current state (no matches outside excluded)
  - [ ] tsc --noEmit passes
  - [ ] npm run build passes (single run, since all sub-tasks in apply will batch their build verification per Regla 14)
- **Commit message**: `test(icon-audit): add grep audit script and verify final state`
- **Rollback boundary**: revert commit

## Section 3: Execution Notes for sdd-apply

- Apply phase MUST execute tasks in order, WU-1 → WU-2 → ... → WU-7.
- Within each WU, tasks can be batched in a single commit if they touch the same file (e.g. WU-4 4.5 groups 4 BCG files into 4 separate commits, but a sub-agent may execute them sequentially).
- After each WU, run `tsc --noEmit` (cheap, ~3-5s) per Regla 14. Only run `npm run build` ONCE after WU-7, not per task.
- If tsc fails on any task, that task is in error; the apply agent must fix and re-validate before moving on.
- Tests are run via the project's `node tests/test_runner.js <name>` (or equivalent). Use the existing custom test runner pattern from `sdd-init/ord-capitalv2`.

## Section 4: Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–360 |
| 400-line budget risk | Medium (borderline but under) |
| Chained PRs recommended | No (single PR for atomicity) |
| Decision needed before apply | No |
