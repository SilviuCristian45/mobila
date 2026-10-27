// Rezultate derivate (geometrie, buget, scenă), memoizate pe identitatea documentului. NU se stochează în document,
// în istoric sau în IndexedDB: se recalculează din `ProjectDocument`. Imuabilitatea (partajare structurală) garantează
// că același obiect `doc` ⇒ aceleași rezultate.
import {
  analyzeGeometry,
  buildScene,
  computeBudget,
  type BudgetSummary,
  type GeometryModel,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';

const geometryCache = new WeakMap<ProjectDocument, GeometryModel>();
const budgetCache = new WeakMap<ProjectDocument, BudgetSummary | Error>();
const sceneCache = new WeakMap<ProjectDocument, SceneDescription | Error>();

export function selectGeometry(doc: ProjectDocument): GeometryModel {
  let g = geometryCache.get(doc);
  if (!g) {
    g = analyzeGeometry(doc);
    geometryCache.set(doc, g);
  }
  return g;
}

function memo<T>(
  cache: WeakMap<ProjectDocument, T | Error>,
  doc: ProjectDocument,
  compute: () => T,
): T {
  const hit = cache.get(doc);
  if (hit instanceof Error) throw hit;
  if (hit !== undefined) return hit;
  try {
    const value = compute();
    cache.set(doc, value);
    return value;
  } catch (e) {
    cache.set(doc, e as Error);
    throw e;
  }
}

/** Aruncă `InvalidDocumentError` pe documente invalide (excepția se memorează). */
export const selectBudget = (doc: ProjectDocument): BudgetSummary =>
  memo(budgetCache, doc, () => computeBudget(doc, selectGeometry(doc)));
export const selectScene = (doc: ProjectDocument): SceneDescription =>
  memo(sceneCache, doc, () => buildScene(doc, selectGeometry(doc)));
