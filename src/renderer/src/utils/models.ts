/**
 * Small pure helper for the model-picker combobox: filter the installed models by what the user has
 * typed. Kept separate from the component so it can be unit-tested without a DOM.
 */
export interface HasModelName {
  modelName: string
}

/**
 * Case-insensitive substring match on the model name. An empty/whitespace query returns the full
 * list unchanged (so the picker shows everything until the user starts typing). Order is preserved.
 */
export function filterModels<T extends HasModelName>(models: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return models
  return models.filter((m) => m.modelName.toLowerCase().includes(q))
}
