import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://api.azem-smm.site").replace(/\/$/, "");
const AUTH_KEY = "azem-admin-authorization";
const EMPTY_FORM = {
    type: "PROJECT", slug: "", title: "", category: "", description: "", serviceTags: "",
    externalUrl: "", featuredOnHome: false, published: false, sortOrder: "0",
};
const COLORS = { ink: "#211d1e", wine: "#590f1b", paper: "#f6f4f1", muted: "#817a78", line: "#e5dfda", white: "#fff", green: "#2f7658", red: "#a32d36" };

function encodeBasic(username, password) {
    const bytes = unescape(encodeURIComponent(`${username}:${password}`));
    return `Basic ${btoa(bytes)}`;
}

function toForm(item) {
    if (!item) return { ...EMPTY_FORM };
    return {
        type: item.type || "PROJECT", slug: item.slug || "", title: item.title || "", category: item.category || "",
        description: item.description || "", serviceTags: (item.serviceTags || []).join(", "),
        externalUrl: item.externalUrl || "", featuredOnHome: Boolean(item.featuredOnHome),
        published: Boolean(item.published), sortOrder: String(item.sortOrder ?? 0),
    };
}

function Button({ title, onPress, variant = "primary", disabled = false, compact = false }) {
    return (
        <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [
            styles.button, styles[`button_${variant}`], compact && styles.buttonCompact,
            disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed,
        ]}>
            <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{title}</Text>
        </Pressable>
    );
}

function Field({ label, value, onChangeText, multiline = false, keyboardType, placeholder, autoCapitalize, secureTextEntry = false }) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                multiline={multiline}
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType || "default"}
                placeholder={placeholder}
                placeholderTextColor="#a59d99"
                autoCapitalize={autoCapitalize || "sentences"}
                style={[styles.input, multiline && styles.inputMultiline]}
                textAlignVertical={multiline ? "top" : "center"}
            />
        </View>
    );
}

export default function App() {
    const [authorization, setAuthorization] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [uploadAlt, setUploadAlt] = useState("");
    const [uploadOrder, setUploadOrder] = useState("0");

    const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

    const logout = useCallback(async () => {
        await SecureStore.deleteItemAsync(AUTH_KEY);
        setAuthorization(""); setItems([]); setSelectedId(null); setForm({ ...EMPTY_FORM });
        setPassword(""); setError(""); setNotice("");
    }, []);

    const request = useCallback(async (path, options = {}, auth = authorization) => {
        const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers };
        if (auth) headers.Authorization = auth;
        let response;
        try {
            response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
        } catch {
            throw new Error("Не удалось подключиться к серверу. Проверьте интернет и попробуйте ещё раз.");
        }
        if (response.status === 401 || response.status === 403) {
            if (auth === authorization && authorization) await logout();
            throw new Error("Доступ не подтверждён. Войдите в админку ещё раз.");
        }
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.detail || body?.message || `Ошибка сервера (HTTP ${response.status}).`);
        }
        if (response.status === 204) return null;
        return response.json();
    }, [authorization, logout]);

    const refresh = useCallback(async (preferredId = selectedId) => {
        const nextItems = await request("/api/v1/admin/portfolio");
        setItems(nextItems);
        const nextId = nextItems.some((item) => item.id === preferredId) ? preferredId : (nextItems[0]?.id ?? null);
        setSelectedId(nextId);
        setForm(toForm(nextItems.find((item) => item.id === nextId)));
    }, [request, selectedId]);

    useEffect(() => {
        let active = true;
        SecureStore.getItemAsync(AUTH_KEY)
            .then((savedAuth) => { if (active && savedAuth) setAuthorization(savedAuth); })
            .catch(() => { if (active) setError("Не удалось прочитать сохранённую сессию. Войдите заново."); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!authorization) return;
        let active = true;
        setLoading(true); setError("");
        request("/api/v1/admin/portfolio")
            .then((data) => {
                if (!active) return;
                setItems(data); setSelectedId(data[0]?.id ?? null); setForm(toForm(data[0]));
            })
            .catch((err) => { if (active) setError(err.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [authorization, request]);

    async function handleLogin() {
        setLoading(true); setError("");
        const nextAuth = encodeBasic(username.trim(), password);
        try {
            const data = await request("/api/v1/admin/portfolio", {}, nextAuth);
            await SecureStore.setItemAsync(AUTH_KEY, nextAuth);
            setAuthorization(nextAuth); setItems(data); setSelectedId(null); setForm({ ...EMPTY_FORM }); setPassword("");
        } catch (err) { setError(err.message || "Не удалось войти."); }
        finally { setLoading(false); }
    }

    function setField(key, value) { setForm((current) => ({ ...current, [key]: value })); }

    async function saveItem() {
        setSaving(true); setError(""); setNotice("");
        const payload = {
            ...form,
            sortOrder: Number(form.sortOrder) || 0,
            externalUrl: form.externalUrl.trim() || null,
            serviceTags: form.serviceTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        };
        try {
            const saved = await request(
                selectedId ? `/api/v1/admin/portfolio/${selectedId}` : "/api/v1/admin/portfolio",
                { method: selectedId ? "PUT" : "POST", body: JSON.stringify(payload) },
            );
            await refresh(saved.id); setNotice(selectedId ? "Изменения сохранены." : "Работа добавлена.");
        } catch (err) { setError(err.message || "Не удалось сохранить работу."); }
        finally { setSaving(false); }
    }

    async function deleteItem() {
        if (!selectedItem) return;
        Alert.alert("Удалить работу?", `«${selectedItem.title}» и все загруженные к ней медиа будут удалены.`, [
            { text: "Отмена", style: "cancel" },
            { text: "Удалить", style: "destructive", onPress: async () => {
                setSaving(true);
                try { await request(`/api/v1/admin/portfolio/${selectedItem.id}`, { method: "DELETE" }); await refresh(null); setNotice("Работа удалена."); }
                catch (err) { setError(err.message || "Не удалось удалить работу."); }
                finally { setSaving(false); }
            } },
        ]);
    }

    async function pickAndUpload() {
        if (!selectedItem) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            quality: 1,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) {
            Alert.alert("Файл слишком большой", "Сервер принимает файлы до 50 МБ. Выберите файл меньшего размера.");
            return;
        }
        const filename = asset.fileName || asset.uri.split("/").pop() || `media-${Date.now()}`;
        const mimeType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
        if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(mimeType)) {
            Alert.alert("Формат не поддерживается", "Сервер принимает JPG, PNG, WebP, MP4 и WebM. В настройках камеры можно выбрать формат «Наиболее совместимый».");
            return;
        }
        const data = new FormData();
        data.append("file", { uri: asset.uri, name: filename, type: mimeType });
        data.append("altText", uploadAlt);
        data.append("sortOrder", String(Number(uploadOrder) || 0));
        setSaving(true); setError(""); setNotice("");
        try { await request(`/api/v1/admin/portfolio/${selectedItem.id}/media`, { method: "POST", body: data }); await refresh(selectedItem.id); setUploadAlt(""); setUploadOrder("0"); setNotice("Медиа загружено."); }
        catch (err) { setError(err.message || "Не удалось загрузить медиа."); }
        finally { setSaving(false); }
    }

    async function updateMedia(media, patch) {
        setSaving(true); setError("");
        try {
            await request(`/api/v1/admin/portfolio/${selectedItem.id}/media/${media.id}`, {
                method: "PUT", body: JSON.stringify({ altText: patch.altText ?? media.altText ?? "", posterUrl: media.posterUrl || "", sortOrder: Number(patch.sortOrder ?? media.sortOrder) || 0 }),
            });
            await refresh(selectedItem.id); setNotice("Медиа обновлено.");
        } catch (err) { setError(err.message || "Не удалось обновить медиа."); }
        finally { setSaving(false); }
    }

    async function deleteMedia(media) {
        Alert.alert("Удалить медиа?", "Файл будет удалён с сервера.", [
            { text: "Отмена", style: "cancel" },
            { text: "Удалить", style: "destructive", onPress: async () => {
                setSaving(true);
                try { await request(`/api/v1/admin/portfolio/${selectedItem.id}/media/${media.id}`, { method: "DELETE" }); await refresh(selectedItem.id); setNotice("Медиа удалено."); }
                catch (err) { setError(err.message || "Не удалось удалить файл."); }
                finally { setSaving(false); }
            } },
        ]);
    }

    if (loading && !authorization) return <View style={styles.loadingScreen}><ActivityIndicator color={COLORS.wine} size="large" /></View>;

    if (!authorization) {
        return (
            <SafeAreaView style={styles.safe}>
                <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
                <KeyboardAvoidingView style={styles.loginShell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                    <View style={styles.loginCard}>
                        <Text style={styles.brand}>AZEM<Text style={styles.brandDot}>.</Text></Text>
                        <Text style={styles.kicker}>ЗАКРЫТАЯ АДМИНКА</Text>
                        <Text style={styles.loginTitle}>Портфолио<Text style={styles.wineDot}>.</Text></Text>
                        <Text style={styles.subtle}>Войдите, чтобы управлять проектами, кейсами и медиа.</Text>
                        <Field label="ИМЯ ПОЛЬЗОВАТЕЛЯ" value={username} onChangeText={setUsername} autoCapitalize="none" />
                        <Field label="ПАРОЛЬ" value={password} onChangeText={setPassword} secureTextEntry />
                        {!!error && <Text style={styles.error}>{error}</Text>}
                        <Button title={loading ? "ПРОВЕРЯЮ…" : "ВОЙТИ В ПАНЕЛЬ ↗"} onPress={handleLogin} disabled={loading || !username || !password} />
                        <Text style={styles.loginFoot}>Доступ защищён серверной авторизацией</Text>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
            <View style={styles.topbar}>
                <View><Text style={styles.brand}>AZEM<Text style={styles.brandDot}>.</Text></Text><Text style={styles.topbarCaption}>ПОРТФОЛИО · АДМИН</Text></View>
                <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>ВЫЙТИ</Text></Pressable>
            </View>
            <FlatList
                data={items}
                keyExtractor={(item) => String(item.id)}
                ListHeaderComponent={(
                    <View>
                        <View style={styles.pageHeading}>
                            <View><Text style={styles.kicker}>ПРОЕКТЫ И КЕЙСЫ</Text><Text style={styles.pageTitle}>Ваши работы<Text style={styles.wineDot}>.</Text></Text></View>
                            <Button title="＋ НОВАЯ" compact onPress={() => { setSelectedId(null); setForm({ ...EMPTY_FORM }); setNotice(""); setError(""); }} />
                        </View>
                        {loading && <ActivityIndicator color={COLORS.wine} style={{ marginVertical: 16 }} />}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemStrip}>
                            {items.map((item, index) => (
                                <Pressable key={item.id} onPress={() => { setSelectedId(item.id); setForm(toForm(item)); setError(""); setNotice(""); }}
                                    style={[styles.itemChip, selectedId === item.id && styles.itemChipActive]}>
                                    <Text style={[styles.itemChipNumber, selectedId === item.id && styles.itemChipTextActive]}>{String(index + 1).padStart(2, "0")}</Text>
                                    <Text numberOfLines={1} style={[styles.itemChipTitle, selectedId === item.id && styles.itemChipTextActive]}>{item.title}</Text>
                                    <Text style={[styles.itemChipStatus, selectedId === item.id && styles.itemChipTextActive]}>{item.published ? "ОПУБЛИКОВАНО" : "ЧЕРНОВИК"}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                        {!!error && <Text style={styles.error}>{error}</Text>}
                        {!!notice && <Text style={styles.success}>{notice}</Text>}
                        <View style={styles.formCard}>
                            <View style={styles.sectionHeading}><Text style={styles.sectionKicker}>{selectedItem ? "РЕДАКТИРОВАНИЕ" : "НОВЫЙ МАТЕРИАЛ"}</Text>{selectedItem && <Text style={styles.sectionId}>№ {selectedId}</Text>}</View>
                            <Text style={styles.formTitle}>{selectedItem?.title || "Новая работа"}<Text style={styles.wineDot}>.</Text></Text>
                            <Text style={styles.label}>ТИП</Text>
                            <View style={styles.segmentRow}>
                                {[ ["PROJECT", "ПРОЕКТ"], ["CASE_STUDY", "КЕЙС"] ].map(([value, label]) => (
                                    <Pressable key={value} onPress={() => setField("type", value)} style={[styles.segment, form.type === value && styles.segmentActive]}>
                                        <Text style={[styles.segmentText, form.type === value && styles.segmentTextActive]}>{label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <Field label="НАЗВАНИЕ" value={form.title} onChangeText={(value) => setField("title", value)} />
                            <Field label="SLUG" value={form.slug} onChangeText={(value) => setField("slug", value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))} autoCapitalize="none" placeholder="brand-project" />
                            <Field label="КАТЕГОРИЯ" value={form.category} onChangeText={(value) => setField("category", value)} placeholder="SMM · Бишкек" />
                            <Field label="ОПИСАНИЕ" value={form.description} onChangeText={(value) => setField("description", value)} multiline />
                            <Field label="УСЛУГИ · ЧЕРЕЗ ЗАПЯТУЮ" value={form.serviceTags} onChangeText={(value) => setField("serviceTags", value)} placeholder="SMM, контент, таргет" />
                            <Field label="ССЫЛКА · НЕОБЯЗАТЕЛЬНО" value={form.externalUrl} onChangeText={(value) => setField("externalUrl", value)} keyboardType="url" autoCapitalize="none" placeholder="https://instagram.com/brand" />
                            <Field label="ПОРЯДОК ПОКАЗА" value={form.sortOrder} onChangeText={(value) => setField("sortOrder", value)} keyboardType="number-pad" />
                            <View style={styles.toggleRow}>
                                <View style={styles.toggleLabel}><Text style={styles.toggleTitle}>Опубликовано</Text><Text style={styles.toggleHint}>Видно посетителям сайта</Text></View>
                                <Switch value={form.published} onValueChange={(value) => setField("published", value)} trackColor={{ false: "#d6cfca", true: COLORS.wine }} thumbColor={COLORS.white} />
                            </View>
                            {form.type === "PROJECT" && <View style={styles.toggleRow}>
                                <View style={styles.toggleLabel}><Text style={styles.toggleTitle}>На главной</Text><Text style={styles.toggleHint}>В избранных работах</Text></View>
                                <Switch value={form.featuredOnHome} onValueChange={(value) => setField("featuredOnHome", value)} trackColor={{ false: "#d6cfca", true: COLORS.wine }} thumbColor={COLORS.white} />
                            </View>}
                            <Button title={saving ? "СОХРАНЯЮ…" : "СОХРАНИТЬ РАБОТУ ↗"} onPress={saveItem} disabled={saving || !form.title || !form.slug || !form.category || !form.description || !form.serviceTags} />
                            {selectedItem && <Button title="УДАЛИТЬ РАБОТУ" variant="danger" onPress={deleteItem} disabled={saving} />}
                        </View>
                        {selectedItem && <View style={styles.formCard}>
                            <View style={styles.sectionHeading}><Text style={styles.sectionKicker}>ГАЛЕРЕЯ РАБОТЫ</Text><Text style={styles.sectionId}>{selectedItem.media?.length || 0} ФАЙЛОВ</Text></View>
                            <Text style={styles.formTitle}>Фото и видео<Text style={styles.wineDot}>.</Text></Text>
                            <Text style={styles.subtle}>Загрузка фото и видео из медиатеки, до 50 МБ на файл.</Text>
                            <Field label="ALT / ОПИСАНИЕ" value={uploadAlt} onChangeText={setUploadAlt} placeholder="Что изображено на фото" />
                            <Field label="ПОРЯДОК" value={uploadOrder} onChangeText={setUploadOrder} keyboardType="number-pad" />
                            <Button title={saving ? "ЗАГРУЖАЮ…" : "ВЫБРАТЬ И ЗАГРУЗИТЬ ↗"} variant="secondary" onPress={pickAndUpload} disabled={saving} />
                            {(selectedItem.media || []).map((media) => <MediaRow key={media.id} media={media} disabled={saving} onSave={updateMedia} onDelete={deleteMedia} />)}
                        </View>}
                        <View style={styles.bottomSpace} />
                    </View>
                )}
                renderItem={() => null}
                ListEmptyComponent={!loading ? <View style={styles.empty}><Text style={styles.emptyMark}>AZ.</Text><Text style={styles.emptyTitle}>Пока здесь пусто</Text><Text style={styles.subtle}>Добавьте первую работу, чтобы начать.</Text></View> : null}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            />
        </SafeAreaView>
    );
}

function Switch({ value, onValueChange, trackColor, thumbColor }) {
    return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onValueChange(!value)} style={[styles.switchTrack, value && styles.switchTrackOn]}><View style={[styles.switchThumb, value && styles.switchThumbOn]} /></Pressable>;
}

function MediaRow({ media, disabled, onSave, onDelete }) {
    const [altText, setAltText] = useState(media.altText || "");
    const [sortOrder, setSortOrder] = useState(String(media.sortOrder ?? 0));
    const preview = media.posterUrl || media.url;
    const previewUrl = preview?.startsWith("http") ? preview : `${API_BASE_URL}${preview || ""}`;
    return (
        <View style={styles.mediaRow}>
            {media.type === "IMAGE" && preview
                ? <Image source={{ uri: previewUrl }} style={styles.mediaThumbnail} />
                : <View style={styles.mediaIcon}><Text style={styles.mediaIconText}>{media.type === "VIDEO" ? "▶" : "▧"}</Text></View>}
            <View style={styles.mediaFields}>
                <Text style={styles.mediaType}>{media.type === "VIDEO" ? "ВИДЕО" : "ФОТО"} · #{media.id}</Text>
                <TextInput value={altText} onChangeText={setAltText} placeholder="ALT-текст" placeholderTextColor="#a59d99" style={styles.mediaInput} />
                <View style={styles.mediaActions}><TextInput value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" style={styles.orderInput} /><Pressable disabled={disabled} onPress={() => onSave(media, { altText, sortOrder })}><Text style={styles.actionText}>СОХРАНИТЬ</Text></Pressable><Pressable disabled={disabled} onPress={() => onDelete(media)}><Text style={styles.deleteText}>УДАЛИТЬ</Text></Pressable></View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.paper },
    loadingScreen: { flex: 1, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center" },
    loginShell: { flex: 1, justifyContent: "center", padding: 22 },
    loginCard: { backgroundColor: COLORS.white, padding: 26, borderWidth: 1, borderColor: COLORS.line },
    brand: { color: COLORS.wine, fontSize: 23, letterSpacing: 3, fontWeight: "900" },
    brandDot: { color: "#bd7c85" },
    kicker: { color: COLORS.wine, fontSize: 10, letterSpacing: 1.7, fontWeight: "800", marginTop: 32, marginBottom: 10 },
    loginTitle: { color: COLORS.ink, fontSize: 38, fontWeight: "900", letterSpacing: -1.7, marginBottom: 8 },
    wineDot: { color: COLORS.wine },
    subtle: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginBottom: 22 },
    field: { marginBottom: 15 },
    label: { color: COLORS.wine, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 },
    input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, paddingHorizontal: 13, color: COLORS.ink, fontSize: 15 },
    inputMultiline: { minHeight: 116, paddingTop: 12 },
    button: { minHeight: 52, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.wine, marginTop: 10 },
    button_secondary: { backgroundColor: COLORS.ink },
    button_danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#e7cfd1" },
    buttonCompact: { minHeight: 40, marginTop: 0, paddingHorizontal: 12 },
    buttonDisabled: { opacity: 0.45 },
    buttonPressed: { opacity: 0.82 },
    buttonText: { color: COLORS.white, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
    buttonText_danger: { color: COLORS.red },
    loginFoot: { color: COLORS.muted, fontSize: 11, textAlign: "center", marginTop: 18 },
    error: { color: COLORS.red, backgroundColor: "#f8e9e9", padding: 12, fontSize: 13, lineHeight: 19, marginVertical: 8 },
    success: { color: COLORS.green, backgroundColor: "#e7f2ec", padding: 12, fontSize: 13, marginVertical: 8 },
    topbar: { minHeight: 68, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.line },
    topbarCaption: { color: COLORS.muted, fontSize: 9, letterSpacing: 1.4, marginTop: 2 },
    logout: { borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 13, paddingVertical: 10 },
    logoutText: { color: COLORS.wine, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    content: { paddingHorizontal: 18, paddingTop: 22 },
    pageHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 },
    pageTitle: { fontSize: 30, color: COLORS.ink, letterSpacing: -1, fontWeight: "900" },
    itemStrip: { gap: 10, paddingBottom: 16 },
    itemChip: { width: 150, minHeight: 89, padding: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, justifyContent: "space-between" },
    itemChipActive: { backgroundColor: COLORS.wine, borderColor: COLORS.wine },
    itemChipNumber: { color: COLORS.wine, fontSize: 10, fontWeight: "800" },
    itemChipTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
    itemChipStatus: { color: COLORS.muted, fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
    itemChipTextActive: { color: COLORS.white },
    formCard: { backgroundColor: COLORS.white, padding: 17, marginTop: 12, borderWidth: 1, borderColor: COLORS.line },
    sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionKicker: { color: COLORS.wine, fontSize: 10, letterSpacing: 1.3, fontWeight: "800" },
    sectionId: { color: COLORS.muted, fontSize: 10, letterSpacing: 1 },
    formTitle: { color: COLORS.ink, fontSize: 24, fontWeight: "900", marginTop: 8, marginBottom: 16 },
    segmentRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    segment: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper },
    segmentActive: { backgroundColor: COLORS.wine, borderColor: COLORS.wine },
    segmentText: { color: COLORS.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    segmentTextActive: { color: COLORS.white },
    toggleRow: { minHeight: 64, borderTopWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleLabel: { flex: 1 },
    toggleTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
    toggleHint: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
    switchTrack: { width: 48, height: 28, backgroundColor: "#d6cfca", borderRadius: 16, justifyContent: "center", padding: 3 },
    switchTrackOn: { backgroundColor: COLORS.wine },
    switchThumb: { width: 22, height: 22, borderRadius: 12, backgroundColor: COLORS.white },
    switchThumbOn: { alignSelf: "flex-end" },
    mediaRow: { flexDirection: "row", gap: 12, paddingVertical: 14, borderTopWidth: 1, borderColor: COLORS.line },
    mediaIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.paper },
    mediaThumbnail: { width: 58, height: 68, backgroundColor: COLORS.paper },
    mediaIconText: { color: COLORS.wine, fontSize: 20 },
    mediaFields: { flex: 1 },
    mediaType: { color: COLORS.muted, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
    mediaInput: { minHeight: 38, color: COLORS.ink, borderBottomWidth: 1, borderColor: COLORS.line },
    mediaActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
    orderInput: { width: 46, borderWidth: 1, borderColor: COLORS.line, padding: 7, color: COLORS.ink, textAlign: "center" },
    actionText: { color: COLORS.wine, fontSize: 9, fontWeight: "800" },
    deleteText: { color: COLORS.red, fontSize: 9, fontWeight: "800" },
    empty: { alignItems: "center", paddingVertical: 35, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
    emptyMark: { color: COLORS.wine, fontSize: 36, fontWeight: "900", marginBottom: 10 },
    emptyTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "800", marginBottom: 4 },
    bottomSpace: { height: 32 },
});
