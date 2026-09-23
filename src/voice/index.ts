// src/voice/index.ts
// ============================================
// Voice v1 - Public barrel
// ============================================
// Logic only. The recorder UI lives under `src/components/voice/` and is imported
// by path (project convention): re-exporting it here would pull the component CSS
// into every module that only needs the voice contracts.
export * from './types';
export * from './contract';
export * from './codec';
export * from './errors';
export * from './storage';
export * from './apiClient';
export * from './contextBuilder';
export * from './useVoicePolling';
export * from './useVoiceRecorder';
export * from './useVoiceJobs';
