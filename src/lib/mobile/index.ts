/**
 * Mobile UI barrel export
 *
 * Re-exports every public symbol so consumers can do:
 *   import { MOBILE_DEFAULTS, filterReducer, ... } from "@/lib/mobile";
 */

export {
  TypeFilterEnum,
  StatusFilterEnum,
  SortKeyEnum,
  ViewModeEnum,
  ListModeEnum,
  FuturesStatusEnum,
  MOBILE_DEFAULTS,
  normalizeAppliedFilters,
  type MobileAppliedFilters,
} from "./filter-contracts";

export {
  filterReducer,
  initialFilterState,
  type FilterState,
  type FilterAction,
} from "./filter-reducer";

export {
  type MobileSection,
  nextSectionRoute,
} from "./navigation";

export { commitDraftFilters } from "./commit-filters";

export {
  useOrientationStability,
  type OrientationStability,
} from "./useOrientationStability";
