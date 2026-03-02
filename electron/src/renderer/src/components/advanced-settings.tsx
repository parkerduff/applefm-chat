import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { AdvancedSettings as AdvancedSettingsType } from "@/lib/settings";
import { SYSTEM_PROMPT, DEFAULT_REFUSAL_PREFIXES } from "@/lib/apple-on-device";

interface Props {
  settings: AdvancedSettingsType;
  onToggle: (enabled: boolean) => void;
  onSettingsChange: (settings: AdvancedSettingsType) => void;
}

interface ButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function AdvancedSettingsButton({ onClick, isOpen }: ButtonProps) {
  return (
    <Tooltip label="Settings">
      <Button
        variant={isOpen ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8 cursor-pointer hover:bg-foreground/10"
        onClick={onClick}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}

export function AdvancedSettingsPanel({ settings, onToggle, onSettingsChange }: Props) {
  const handleToggle = () => {
    onToggle(!settings.enabled);
  };

  const handleSystemPromptChange = (value: string) => {
    onSettingsChange({ ...settings, systemPrompt: value });
  };

  const handleRefusalPrefixesChange = (value: string) => {
    const prefixes = value.split("\n").filter((line) => line.trim());
    onSettingsChange({ ...settings, refusalPrefixes: prefixes });
  };

  const handleReset = () => {
    onSettingsChange({
      ...settings,
      systemPrompt: SYSTEM_PROMPT,
      refusalPrefixes: [...DEFAULT_REFUSAL_PREFIXES],
    });
  };

  return (
    <div className="shrink-0 border-b px-4 py-4 space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm">
          Enable custom settings
          <span className="text-muted-foreground ml-1">(persists to local storage)</span>
        </span>
      </label>

      {settings.enabled && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => handleSystemPromptChange(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Refusal Prefixes
              <span className="text-muted-foreground font-normal ml-1">(one per line)</span>
            </label>
            <textarea
              value={settings.refusalPrefixes.join("\n")}
              onChange={(e) => handleRefusalPrefixesChange(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Responses starting with these prefixes indicate the model's guardrails were triggered. These responses and their prompts are filtered from history to avoid biasing future responses.
            </p>
          </div>

          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
        </>
      )}
    </div>
  );
}
