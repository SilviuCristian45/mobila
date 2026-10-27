// Tipuri de persistență expuse straturilor superioare prin `state/` (features/ nu importă direct persistence/).
export type {
  ProjectMeta,
  SnapshotMeta,
  SnapshotReason,
  StorageFailure,
  StorageInfo,
} from '@/persistence/types';
