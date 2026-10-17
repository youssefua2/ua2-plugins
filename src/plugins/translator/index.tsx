import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { useProxy } from "@vendetta/storage";
import { logger } from "@vendetta"; // Added logger

const { FormInput, FormRow, FormSection } = Forms;
const { ScrollView } = ReactNative;

const typedStorage = storage as typeof storage & {
  targetLang: string;
};

typedStorage.targetLang ??= "en";

async function freeTranslate(text: string, target: string): Promise<string> {
    if (!text || text.trim() === "") return "Empty message.";
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data[0] && Array.isArray(data[0])) {
            return data[0].map((chunk: any) => chunk[0]).join("");
        }
        return "Translation failed: unexpected format.";
    } catch (e: any) {
        return `Translation error: ${e.message}`;
    }
}

function Settings() {
    useProxy(typedStorage);

    return (
        <ScrollView style={{ padding: 16 }}>
            <FormSection title="Translation Settings">
                <FormInput
                    title="Target Language Code"
                    value={typedStorage.targetLang}
                    onChange={(v: string) => typedStorage.targetLang = v}
                    placeholder="e.g. en, es, fr, de, ja"
                    helpText="Use standard ISO 639-1 codes. 'en' = English."
                />
            </FormSection>
        </ScrollView>
    );
}

let unpatch: (() => void) | undefined;

export default {
    onLoad() {
        try {
            logger.log("[Translator] Plugin loading...");
            
            // Try to find the module. If it fails, it will throw an error.
            const actionSheetModule = findByProps("showSimpleActionSheet");
            
            if (!actionSheetModule) {
                logger.error("[Translator] Could not find showSimpleActionSheet!");
                return; // Stop loading if module isn't found
            }

            unpatch = after("default", actionSheetModule, ([{ header, options }]: any) => {
                const message = header?.props?.message;
                
                if (message && message.content) {
                    options.push({
                        label: "Translate",
                        onPress: async () => {
                            showToast("Translating...", 1500);
                            const translated = await freeTranslate(message.content, typedStorage.targetLang);
                            showToast(`Translated: ${translated}`, 5000);
                        }
                    });
                }
            });
            logger.log("[Translator] Plugin loaded successfully.");
        } catch (e) {
            logger.error("[Translator] Failed to load:", e);
        }
    },

    onUnload() {
        if (unpatch) unpatch();
    },

    settings: Settings
};
