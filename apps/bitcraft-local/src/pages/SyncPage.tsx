import React from "react";
import { ExternalLink, Link, Save } from "lucide-react";

function validOptionalSyncUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" && parsed.hostname === "bitcraftsync.app";
  } catch {
    return false;
  }
}

export function SyncPanel({ syncUrl, onSyncUrlSaved }: { syncUrl: string; onSyncUrlSaved: (syncUrl: string) => void }) {
  const [draft, setDraft] = React.useState(syncUrl);
  const [status, setStatus] = React.useState("");
  React.useEffect(() => setDraft(syncUrl), [syncUrl]);
  const trimmed = draft.trim();
  const invalid = !validOptionalSyncUrl(draft);
  const canSave = Boolean(trimmed) && !invalid;
  function save() {
    if (!canSave) return;
    onSyncUrlSaved(trimmed);
    setStatus("BitCraft Sync URL saved in this browser.");
  }
  if (!syncUrl.trim()) {
    return (
      <div className="panel sync-panel sync-panel-empty">
        <header className="members-topbar sync-topbar">
          <div>
            <h2>BitCraft Sync</h2>
            <p>Optional browser-local materials board</p>
          </div>
        </header>
        <section className="sync-empty-card">
          <div className="sync-empty-heading">
            <span className="sync-empty-icon"><Link size={18} /></span>
            <div>
              <h3>Add Sync link</h3>
              <p>Saved only in this browser.</p>
            </div>
            <em>Optional</em>
          </div>
          <div className="sync-url-row">
            <label className="field">
              <span>BitCraft Sync URL</span>
              <input value={draft} onChange={(event) => { setDraft(event.target.value); setStatus(""); }} placeholder="https://bitcraftsync.app/s/..." />
            </label>
            <button className="toolbar-button primary" disabled={!canSave} onClick={save}><Save size={14} /> Save</button>
          </div>
          {invalid ? <p className="error">Use a HTTPS bitcraftsync.app link.</p> : null}
          {status ? <p className="theme-share-status">{status}</p> : null}
        </section>
      </div>
    );
  }
  return (
    <div className="panel sync-panel">
      <header className="members-topbar sync-topbar">
        <div>
          <h2>Sync</h2>
          <p>Embedded BitCraft Sync materials and goals board</p>
        </div>
        <div className="dashboard-top-meta">
          <a className="toolbar-button" href={syncUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full page</a>
        </div>
      </header>
      <iframe className="sync-frame" src={syncUrl} title="BitCraft Sync" />
    </div>
  );
}
