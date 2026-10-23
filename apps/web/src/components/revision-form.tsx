import { adminButton, adminInput } from "./admin-ui";

interface Option { id: string; label: string }

export function RevisionFields({
  defaults, models, sources, selectedModels, selectedSources,
}: {
  defaults?: { title?: string; summary?: string; body?: string; safety?: string; changeNote?: string; machineTranslated?: boolean };
  models: Option[];
  sources: Option[];
  selectedModels: string[];
  selectedSources: string[];
}) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">Title
        <input name="title" required maxLength={200} defaultValue={defaults?.title} className={adminInput} />
      </label>
      <label className="block text-sm font-medium">Summary
        <input name="summary" maxLength={300} defaultValue={defaults?.summary} className={adminInput} />
      </label>
      <label className="block text-sm font-medium">Body (Markdown: ## headings, lists, **bold**; no HTML)
        <textarea name="body" required rows={16} maxLength={50000} defaultValue={defaults?.body} className={`${adminInput} font-mono`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Safety level
          <select name="safety" defaultValue={defaults?.safety ?? "normal"} className={adminInput}>
            <option value="normal">Normal</option>
            <option value="caution">Caution</option>
            <option value="danger">Danger (hazard warnings)</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Change note
          <input name="changeNote" maxLength={300} defaultValue={defaults?.changeNote} className={adminInput} />
        </label>
      </div>
      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Applies to models (leave empty for the whole category)</legend>
        <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
          {models.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="models" value={m.id} defaultChecked={selectedModels.includes(m.id)} />{m.label}</label>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Sources (required before approval)</legend>
        <div className="grid max-h-48 gap-1 overflow-y-auto">
          {sources.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sources" value={s.id} defaultChecked={selectedSources.includes(s.id)} />{s.label}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="machineTranslated" value="1" defaultChecked={defaults?.machineTranslated} /> Draft translation produced by a machine (needs fluent review)</label>
      <button type="submit" className={adminButton}>Save draft</button>
    </div>
  );
}
