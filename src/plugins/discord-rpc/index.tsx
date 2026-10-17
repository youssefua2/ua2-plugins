import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";

const { View, ScrollView, TouchableOpacity } = ReactNative;
const {
  FormText,
  FormInput,
  FormRow,
  FormSwitchRow,
  FormSection
} = Forms;

const assetManager = findByProps("getAssetIds");
const pluginStartSince = Date.now();
const SOCKET_ID = "RPC@Revenge";

// --- Utility: clone and filter out invalid/underscore-prefixed fields ---
function isValid(val: any) {
  if (val === false || val === 0) return true;
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val).length > 0;
  return true;
}

function cloneAndFilter<T extends object>(obj: T): T {
  const filter = (key: PropertyKey, value: any) => {
    if (value === obj) return value;
    if (typeof key === "string" && key.startsWith("_")) return undefined;
    return isValid(value) ? value : undefined;
  };
  return JSON.parse(JSON.stringify(obj, filter));
}

// --- Storage Types ---
const typedStorage = storage as typeof storage & {
  selected: string;
  selections: Record<string, any>;
  autoStart: boolean;
};

enum ActivityTypes {
  PLAYING = 0,
  STREAMING = 1,
  LISTENING = 2,
  WATCHING = 3,
  COMPETING = 5,
}

function createDefaultSelection() {
  return {
    name: "Revenge",
    application_id: "1054951789318909972",
    flags: 0,
    type: ActivityTypes.PLAYING,
    timestamps: { _enabled: false, start: pluginStartSince },
    assets: {},
    buttons: [{}, {}],
  };
}

// Initialize storage if empty
if (!storage.selected || typeof storage.selected !== "string") {
  storage.selected = "default";
  storage.selections = { default: createDefaultSelection() };
}

// -- Asset Resolution --
async function resolveAsset(appId: string, key?: string): Promise<string | undefined> {
  if (!key) return undefined;
  // external URLs and mp: pass through untouched
  if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("mp:")) return key;
  
  // app asset keys need resolving
  let ids: string[] = [];
  try { ids = assetManager.getAssetIds(appId, [key]); } catch {}
  if (!ids?.length) {
    try { ids = await assetManager.fetchAssetIds(appId, [key]); } catch {}
  }
  return ids?.[0] ?? key;
}

// --- Send Activity ---
async function sendRequest(activity: any | null): Promise<any | null> {
  if (activity === null) {
    FluxDispatcher.dispatch({
      type: "LOCAL_ACTIVITY_UPDATE",
      activity: null,
      pid: 1608,
      socketId: SOCKET_ID,
    });
    return null;
  }

  const timestampEnabled = activity.timestamps?._enabled;
  activity = cloneAndFilter(activity);

  if (timestampEnabled) {
    activity.timestamps ??= {};
    if (typeof activity.timestamps.start !== "number") activity.timestamps.start = pluginStartSince;
    if (typeof activity.timestamps.end !== "number" || activity.timestamps.end === 0) delete activity.timestamps.end;
    if (Object.keys(activity.timestamps).length === 0) delete activity.timestamps;
  } else {
    delete activity.timestamps;
  }

  if (activity.assets) {
    try {
      const appId = activity.application_id;
      const large = await resolveAsset(appId, activity.assets.large_image);
      const small = await resolveAsset(appId, activity.assets.small_image);
      
      if (large) activity.assets.large_image = large; 
      else delete activity.assets.large_image;
      
      if (small) activity.assets.small_image = small; 
      else delete activity.assets.small_image;

      // Make large image clickable to open Discord game page
      if (activity.assets.large_image && activity.application_id) {
        activity.assets.large_url = `https://discord.com/games/${activity.application_id}`;
      }

      if (Object.keys(activity.assets).length === 0) delete activity.assets;
    } catch (e) {
      logger.error("[RPC] Asset resolve failed:", e);
    }
  }

  if (activity.buttons?.length) {
    activity.buttons = activity.buttons.filter((x: any) => x && x.label);
    if (activity.buttons.length) {
      Object.assign(activity, {
        metadata: { button_urls: activity.buttons.map((x: any) => x.url) },
        buttons: activity.buttons.map((x: any) => x.label),
      });
    } else {
      delete activity.buttons;
    }
  } else {
    delete activity.buttons;
  }

  FluxDispatcher.dispatch({
    type: "LOCAL_ACTIVITY_UPDATE",
    activity,
    pid: 1608,
    socketId: SOCKET_ID,
  });

  return activity;
}

// --- Settings UI ---
function Settings() {
  useProxy(typedStorage);

  if (!typedStorage.selected || !typedStorage.selections?.[typedStorage.selected]) {
    typedStorage.selected = "default";
    typedStorage.selections ??= {};
    typedStorage.selections.default ??= createDefaultSelection();
  }

  const settings = useProxy(typedStorage.selections[typedStorage.selected]);

  return (
    <ScrollView style={{ paddingBottom: 24 }}>
      <View style={{ padding: 16 }}>
        <FormText style={{ marginBottom: 12 }}>Configure your custom RPC below.</FormText>

        <FormSection title="General">
          <FormSwitchRow
            label="Auto Start"
            subLabel="Start RPC when Revenge launches"
            value={typedStorage.autoStart ?? false}
            onValueChange={(v: boolean) => typedStorage.autoStart = v}
          />
        </FormSection>

        <TouchableOpacity
          style={{ backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 16 }}
          onPress={() => {
            sendRequest(typedStorage.selections[typedStorage.selected]).catch(e => logger.error("[RPC]", e));
          }}
        >
          <FormText style={{ color: "white" }}>Update Presence</FormText>
        </TouchableOpacity>

        <FormSection title="Basic">
          <FormInput title="Application Name" value={settings.name} onChange={(v: string) => settings.name = v} />
          <FormInput title="Application ID" value={settings.application_id} onChange={(v: string) => settings.application_id = v} keyboardType="numeric" />
          <FormInput title="Activity Type (0-5)" value={String(settings.type ?? 0)} onChange={(v: string) => settings.type = Number(v)} keyboardType="numeric" />
          <FormInput title="Details" value={settings.details} onChange={(v: string) => settings.details = v} />
          <FormInput title="State" value={settings.state} onChange={(v: string) => settings.state = v} />
        </FormSection>

        <FormSection title="Images">
          <FormInput title="Large Image" value={settings.assets?.large_image} onChange={(v: string) => settings.assets.large_image = v} />
          <FormInput title="Large Image Text" value={settings.assets?.large_text} onChange={(v: string) => settings.assets.large_text = v} />
          <FormInput title="Small Image" value={settings.assets?.small_image} onChange={(v: string) => settings.assets.small_image = v} />
          <FormInput title="Small Image Text" value={settings.assets?.small_text} onChange={(v: string) => settings.assets.small_text = v} />
        </FormSection>

        <FormSection title="Timestamps">
          <FormSwitchRow
            label="Enable timestamps"
            value={settings.timestamps._enabled}
            onValueChange={(v: boolean) => settings.timestamps._enabled = v}
          />
          <FormInput title="Start (ms)" value={String(settings.timestamps?.start ?? "")} disabled={!settings.timestamps._enabled} onChange={(v: string) => settings.timestamps.start = Number(v)} keyboardType="numeric" />
          <FormInput title="End (ms)" value={String(settings.timestamps?.end ?? "")} disabled={!settings.timestamps._enabled} onChange={(v: string) => settings.timestamps.end = Number(v)} keyboardType="numeric" />
        </FormSection>

        <FormSection title="Buttons">
          <FormInput title="Button 1 Label" value={settings.buttons?.[0]?.label} onChange={(v: string) => settings.buttons[0].label = v} />
          <FormInput title="Button 1 URL" value={settings.buttons?.[0]?.url} onChange={(v: string) => settings.buttons[0].url = v} />
          <FormInput title="Button 2 Label" value={settings.buttons?.[1]?.label} onChange={(v: string) => settings.buttons[1].label = v} />
          <FormInput title="Button 2 URL" value={settings.buttons?.[1]?.url} onChange={(v: string) => settings.buttons[1].url = v} />
        </FormSection>
      </View>
    </ScrollView>
  );
}

// --- Plugin Export ---
export default {
  onLoad() {
    const current = storage.selections?.[storage.selected];
    if (!current) return;
    if (typedStorage.autoStart) {
      sendRequest(current).catch(e => logger.error("[RPC] Auto-start failed:", e));
    }
  },

  onUnload() {
    sendRequest(null);
  },

  settings: Settings,
};
