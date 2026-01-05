import { useState, useEffect, useCallback } from "react";
import { SYSTEM_PROMPT, DEFAULT_REFUSAL_PREFIXES } from "./apple-on-device";

const STORAGE_KEY = "applefm-advanced-settings";

export interface AdvancedSettings {
  enabled: boolean;
  systemPrompt: string;
  refusalPrefixes: string[];
}

const DEFAULT_SETTINGS: AdvancedSettings = {
  enabled: false,
  systemPrompt: SYSTEM_PROMPT,
  refusalPrefixes: [...DEFAULT_REFUSAL_PREFIXES],
};

function loadSettings(): AdvancedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed.enabled) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSettings(settings: AdvancedSettings | null): void {
  if (typeof window === "undefined") return;
  if (!settings || !settings.enabled) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }
}

export function useAdvancedSettings() {
  const [settings, setSettingsState] = useState<AdvancedSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = loadSettings();
    if (stored) {
      setSettingsState(stored);
    }
    setLoaded(true);
  }, []);

  const setSettings = useCallback((newSettings: AdvancedSettings) => {
    setSettingsState(newSettings);
    saveSettings(newSettings.enabled ? newSettings : null);
  }, []);

  const toggleEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      const newSettings = { ...settings, enabled: true };
      setSettingsState(newSettings);
      saveSettings(newSettings);
    } else {
      setSettingsState(DEFAULT_SETTINGS);
      saveSettings(null);
    }
  }, [settings]);

  const getEffectiveSystemPrompt = useCallback(() => {
    return settings.enabled ? settings.systemPrompt : SYSTEM_PROMPT;
  }, [settings]);

  const getEffectiveRefusalPrefixes = useCallback(() => {
    return settings.enabled ? settings.refusalPrefixes : DEFAULT_REFUSAL_PREFIXES;
  }, [settings]);

  return {
    settings,
    loaded,
    setSettings,
    toggleEnabled,
    getEffectiveSystemPrompt,
    getEffectiveRefusalPrefixes,
  };
}
