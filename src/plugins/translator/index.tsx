import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { useProxy } from "@vendetta/storage";

const { FormInput, FormRow, FormSection } = Forms;
const { ScrollView } = ReactNative;

// --- Storage ---
const typedStorage = storage as typeof storage & {
  targetLang: string;
};

typedStorage.targetLang ??= "en";

// --- Free Google Translate Endpoint ---
async function freeTranslate(text: string, target: string): Promise<string> {
    if (!text || text.trim() === "") return "Empty message.";
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        
        if (data && data[0] && Array.isArray(data[0])) {
            // Combine the translated chunks into a single string
            return data[0].map((chunk: any) => chunk[0]).join("");
        }
        
        return "Translation failed: unexpected response format.";
    } catch (e: any) {
        return `Translation error: ${e.message}`;
    }
}

// --- Settings UI ---
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
                    helpText="Use standard ISO 639-1 codes. 'en' = English, 'es' = Spanish, etc."
                />
            </FormSection>
        </ScrollView>
    );
}

// --- Plugin Export ---
let unpatch: (() => void) | undefined;

export default {
    onLoad() {
        // Patch the message action sheet (long press on mobile)
        unpatch = after("default", findByProps("showSimpleActionSheet"), ([{ header, options }]: any) => {
            const message = header?.props?.message;
            
            if (message && message.content) {
                options.push({
                    label: "Translate",
                    onPress: async () => {
                        showToast("Translating...", 1500);
                        
                        const translated = await freeTranslate(message.content, typedStorage.targetLang);
                        
                        // Show the result
                        showToast(`Translated: ${translated}`, 5000);
                    }
                });
            }
        });
    },

    onUnload() {
        unpatch?.();
    },

    settings: Settings
};
