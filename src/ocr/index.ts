// src/ocr/index.ts
// ============================================
// OCR v1 - Public surface of the OCR frontend module
// ============================================
//
// Consumer-facing exports only. Nothing here re-exports Voice: the two
// integrations share generic utilities, never semantics (PRD §78).

export {
  OCR_API_BASE_URL,
  OCR_JOB_CREATE_PATH,
  OCR_JOB_POLL_PATH,
  OCR_CATEGORY_MEMORY_PATH,
  MAX_OCR_IMAGES,
  MAX_OCR_FILE_BYTES,
  MAX_OCR_TOTAL_BYTES,
  OCR_IMAGE_MIME_TYPES,
  OCR_PDF_MIME_TYPE,
  buildOcrJobFormData,
  isOcrImageFile,
  isOcrPdfFile,
  isOcrUnsupportedFile,
  parseOcrErrorResponse,
  toLocalDateString,
  validateOcrFiles,
  type OcrFileLike,
  type OcrFileRejection,
  type OcrFileValidationResult,
} from './contract';

export {
  DEFAULT_OCR_LANGUAGE,
  DEFAULT_OCR_LOCAL_CURRENCY,
  cardSupportedCurrencies,
  isOcrContextWithinBudget,
  MAX_OCR_CONTEXT_BYTES,
  type OcrCatalogCard,
  type OcrCatalogCategory,
  type OcrCatalogWallet,
  type OcrContext,
} from './contextTypes';

export {
  buildOcrContext,
  resolveLocalTimezone,
  toLocalOffsetISOString,
  useOcrContext,
  type OcrCatalogData,
  type UseOcrContextResult,
} from './contextBuilder';

export {
  OCR_SCHEMA_VERSION,
  normalizeCurrencyCode,
  normalizeDate,
  normalizeId,
  normalizeOcrResult,
} from './normalize';

export {
  OCR_UNRECOGNIZED_KEY,
  ROUNDING_TOLERANCE_CENTS,
  computeTicketGroups,
  confirmableGroups,
  fromCents,
  groupingBlocker,
  isClosureExact,
  toCents,
  type ComputeGroupsInput,
  type GroupingItem,
  type OcrCategoryGroup,
  type OcrGroupingResult,
} from './grouping';

export {
  OCR_TERMINAL_STATUSES,
  OCR_DISPATCH_STATUSES,
  isOcrDispatchStatus,
  isOcrTerminalStatus,
  type OcrDiscount,
  type OcrImageManifestEntry,
  type OcrIssue,
  type OcrItem,
  type OcrJob,
  type OcrJobAccepted,
  type OcrJobStatus,
  type OcrPayment,
  type OcrTicket,
} from './types';

export { OcrApiError, createOcrJob, getOcrJob, readOcrAccessToken, registerCategoryMemory } from './apiClient';
export { ocrErrorI18nKey, ocrFileRejectionI18nKey, type OcrTelemetryStage } from './errors';
export {
  OCR_POLL_DELAYS_MS,
  OCR_POLL_INTERVAL_MAX_MS,
  ocrPollDelayFor,
  runOcrPollingLoop,
  type OcrPollingController,
} from './polling';

export {
  OCR_CACHE_MAINTENANCE_INTERVAL_MS,
  OCR_JOBS_STORAGE_KEY,
  OCR_PENDING_MEMORY_STORAGE_KEY,
  isOcrCacheMaintenanceDue,
  loadOcrJobs,
  loadPendingOcrMemory,
  patchOcrJob,
  pruneDispatchedOcrJobs,
  queuePendingOcrMemory,
  removeOcrJob,
  resolvePendingOcrMemory,
  upsertOcrJob,
  type PendingOcrMemory,
  type StoredOcrJob,
} from './storage';

export {
  OCR_IMAGE_TTL_MS,
  clearAllOcrImages,
  deleteOcrImages,
  isOcrImageStorageAvailable,
  listOcrImages,
  markOcrImagesProcessed,
  ocrImageKey,
  readOcrImage,
  rekeyOcrImages,
  saveOcrImages,
  sweepOcrImages,
  type OcrStoredImage,
} from './imageStore';

export {
  collectCategoryCorrections,
  effectiveSavedCategory,
  isNonLearnableCategory,
  pendingMemoryCount,
  queueCorrections,
  syncPendingOcrMemory,
  type OcrCategoryCorrection,
} from './memory';

export {
  confirmOcrQuarantine,
  loadOcrQuarantine,
  rejectOcrQuarantine,
  saveOcrQuarantine,
  toQuarantineTicketPayload,
  type OcrConfirmGroupRow,
  type OcrQuarantineLoadRow,
  type OcrQuarantineTicketPayload,
} from './quarantine';

export { OCR_EVENTS, sanitizeOcrTelemetryProps, trackOcrError, trackOcrEvent, type OcrTelemetryProps } from './telemetry';
export { OcrJobsProvider, useOcrJobsContext, useOptionalOcrJobs } from './OcrJobsProvider';
export { useOcrJobs, type OcrJobPhase, type OcrJobState, type SubmitOcrTicketResult } from './useOcrJobs';
export { useOcrImages, type OcrImageView } from './useOcrImages';
