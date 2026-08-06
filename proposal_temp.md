# Proposal: iconos-audit-2026-08

## Intent

Eliminate the `{x.icono}` antipattern across the frontend by routing every domain-icon render through a typed wrapper component, introducing `WalletIcon` and `ProyectoIcon` mirroring the existing `CategoryIcon` pattern with emoji/lucide disambiguation for backwards compatibility.

## Scope

### In Scope
- Create `WalletIcon` wrapper component (fallback to `<CategoryIcon name="Wallet" />`)
- Create `ProyectoIcon` wrapper component (fallback to `<CategoryIcon name="FolderKanban" />`)
- Refactor `CategoryIcon` to expose `isLikelyLucideName()` helper for emoji detection
- Replace 19+ raw-string `{x.icono}` render sites with appropriate wrappers
- Implement backwards compatibility for legacy wallet icons (emojis like `"M"`, `"💳"`, `"S"`)

### Out of Scope
- Modifications to `BCGScatterPlot.tsx` SVG `<text>` and `<title>` elements (accessibility preservation)
- Backend icon validation logic
- i18n changes for icon strings
- New icons in `CategoryIcon` ICON_MAP

## Capabilities

### New Capabilities
- `icon-component-wrappers`: Unified contract for `CategoryIcon`, `WalletIcon`, and `ProyectoIcon` components.

### Modified Capabilities
- `category-icon-system`: Extending existing `CategoryIcon` to include emoji fallback detection logic.

## Approach

1. Refactor `CategoryIcon` to expose a public `isLikelyLucideName()` helper for Unicode vs lucide name disambiguation.
2. Create two thin wrapper components: `WalletIcon.tsx` and `ProyectoIcon.tsx` that apply domain-specific fallbacks using `CategoryIcon`.
3. Replace all raw-string `{x.icono}` render sites with the appropriate wrapped component, ensuring backwards compatibility.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/CategoryIcon/CategoryIcon.tsx` | Modified | Add `isLikelyLucideName()` helper; keep existing behavior intact |
| `src/components/WalletIcon/WalletIcon.tsx` | New | Render wallet icons with fallback to `"Wallet"` |
| `src/components/ProyectoIcon/ProyectoIcon.tsx` | New | Render project icons with fallback to `"FolderKanban"` |
| `src/components/AddMovementModal/AddMovementModal.tsx` | Modified | ~10 replace sites for category, wallet, and project icons |
| `src/pages/Home/HomePage.tsx` | Modified | 5+ replace sites across UI surface |
| Other files (BCGDetail, EditarCuarentenaModal, etc.) | Modified | Remaining ~9 render sites |

## Risks

- **Visual regression** in legacy wallets that store emojis as strings; requires careful detection logic.
- **Missed render sites**; the pre-audit found 29 `.tsx` files but a final grep may reveal additional candidates.
- **CSS class conflicts**: `cuenta-icono` is a span with hardcoded emoji; wrappers must not override existing styles unintendedly.

## Rollback Plan

Revert the apply commit — each wrapper component and each page/file constitutes a single work unit per the skill `work-unit-commits`. No database migration required; rollback is purely frontend component revert.

## Success Criteria

- [x] TypeScript compilation (`tsc --noEmit`) passes without errors
- [x] Build (`npm run build`) completes successfully
- [x] All 19+ raw-string render sites replaced with `{<WalletIcon ... />}` or `{<ProyectoIcon ... />}`
- [x] No visual regression on existing wallets with emoji icons in Home page renders
- [x] Automated grep for antipattern returns zero matches: `grep -rn "{.*\.icono}" src/` yields 0 results (excluding BCGScatterPlot SVG)
