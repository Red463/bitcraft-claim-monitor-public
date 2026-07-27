import React from "react";
import { Bell, Monitor, Moon, RotateCcw, Shield, SlidersHorizontal } from "lucide-react";

import type { ThemeSettings } from "../../theme";
import type { UserToastSettings } from "../../types/settings";
import { Dialog } from "./Dialog";

type UserSettingsDialogProps = {
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  toastSettings: UserToastSettings;
  appToastSettings: Record<string, boolean>;
  onToastSettingsChange: (settings: UserToastSettings) => void;
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  showAdminTools?: boolean;
  onOpenAdmin?: () => void;
  onResetSettings: () => void;
  modal?: boolean;
  onClose: () => void;
};

export function UserSettingsDialog({
  density,
  onDensityChange,
  toastSettings,
  onToastSettingsChange,
  theme,
  onThemeChange,
  showAdminTools = false,
  onOpenAdmin,
  onResetSettings,
  onClose,
}: UserSettingsDialogProps) {
  const notificationSettings = toastSettings as unknown as Record<string, unknown>;

  function setNotification(key: string, enabled: boolean) {
    onToastSettingsChange({ ...toastSettings, [key]: enabled } as UserToastSettings);
  }

  return (
    <Dialog open title="Browser settings" onClose={onClose} className="user-settings-dialog">
      <div className="settings-section-stack">
        <section className="form-card">
          <h3><Monitor size={17} /> Display</h3>
          <p className="legend">These preferences stay in this browser.</p>
          <label className="research-filter-field">
            <span>Information density</span>
            <select value={density} onChange={(event) => onDensityChange(event.target.value as "comfortable" | "compact")}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="research-filter-field">
            <span>Panel colour</span>
            <input type="color" value={theme.panel} onChange={(event) => onThemeChange({ ...theme, panel: event.target.value })} />
          </label>
          <label className="research-filter-field">
            <span>Accent colour</span>
            <input type="color" value={theme.activeColor} onChange={(event) => onThemeChange({ ...theme, activeColor: event.target.value })} />
          </label>
        </section>

        <section className="form-card">
          <h3><Bell size={17} /> Browser notifications</h3>
          <p className="legend">Notifications are evaluated locally while the application is open.</p>
          {[
            ["marketListings", "Market listings"],
            ["marketSales", "Market sales"],
            ["production", "Craft activity"],
            ["soundEnabled", "Notification sounds"],
          ].map(([key, label]) => (
            <label className="toggle-line" key={key}>
              <span>{label}</span>
              <input type="checkbox" checked={notificationSettings[key] !== false} onChange={(event) => setNotification(key, event.target.checked)} />
            </label>
          ))}
        </section>

        <section className="form-card">
          <h3><SlidersHorizontal size={17} /> Local data</h3>
          <p className="legend">Settlement choice, shared-plan selection, filters, map focus, Market watches, and visual preferences are stored on this device.</p>
          <button className="toolbar-button danger" type="button" onClick={() => window.confirm("Clear all local Settlement Monitor settings from this browser?") && onResetSettings()}>
            <RotateCcw size={15} /> Clear browser settings
          </button>
        </section>

        {showAdminTools && onOpenAdmin ? (
          <section className="form-card">
            <h3><Shield size={17} /> Administration</h3>
            <button className="toolbar-button primary" type="button" onClick={onOpenAdmin}><Shield size={15} /> Open protected admin console</button>
          </section>
        ) : null}

        <p className="legend"><Moon size={13} /> Public visitors do not have accounts and nothing here synchronizes to a server profile.</p>
      </div>
    </Dialog>
  );
}
