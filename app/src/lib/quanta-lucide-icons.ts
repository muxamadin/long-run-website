/**
 * Lucide replacement for `@higgsfield-ai/icons` (template-only).
 *
 * The vendored `@higgsfield/quanta` components import their glyphs from the
 * private, Nexus-only `@higgsfield-ai/icons` package. Generated websites build on
 * the PUBLIC npm registry and must not depend on the internal registry, so
 * `@higgsfield-ai/icons/*` is aliased to THIS module (see `vite.config.ts`
 * `resolve.alias` + `tsconfig.json` paths). Each export mirrors the
 * `@higgsfield-ai/icons/<Name>` subpath a quanta component imports, mapped to its
 * closest lucide-react equivalent. lucide icons are `SVGProps<SVGSVGElement>`
 * components, so they drop straight into quanta's `<Icon as={…}>` (which sizes +
 * colors the glyph via CSS tokens on the `<svg>`).
 *
 * Only the 17 generic UI glyphs the SHIPPED quanta components use are mapped; the
 * brand/model glyphs live only in quanta's dev-only stories/scripts, which are
 * trimmed from the vendored copy. If a future quanta sync adds a new glyph to a
 * component, add it here (the build will fail with an unresolved export otherwise).
 */
export {
  Search as IconMagnifyingGlass2Outlined,
  Search as IconMagnifyingGlassOutlined,
  Folder as IconFolder1Outlined,
  Check as IconCheckmark2MediumOutlined,
  Plus as IconPlusMediumOutlined,
  Pin as IconPinFilledThin,
  TriangleAlert as IconExclamationTriangleOutlined,
  X as IconCrossMediumOutlined,
  CircleX as IconCircleXOutlined,
  Circle as IconCircleOutlined,
  Info as IconCircleInfoOutlined,
  CircleCheck as IconCircleCheckOutlined,
  ChevronRight as IconChevronRightMediumOutlined,
  ChevronLeft as IconChevronLeftMediumOutlined,
  ChevronsUpDown as IconChevronGrabberVerticalOutlined,
  ChevronDown as IconChevronDownMediumOutlined,
  ChevronDown as IconChevronBottomOutlined,
} from "lucide-react";
