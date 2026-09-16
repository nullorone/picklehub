import type { PropsWithChildren, ReactNode } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    type TextInputProps,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, title }: PropsWithChildren<{ readonly title: string }>) {
    return (
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
                <Text accessibilityRole="header" style={styles.title}>
                    {title}
                </Text>
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}

export function Field({ label, ...props }: TextInputProps & { readonly label: string }) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput accessibilityLabel={label} placeholderTextColor="#68736d" style={styles.input} {...props} />
        </View>
    );
}

export function Button({
    disabled = false,
    label,
    onPress,
    secondary = false,
}: {
    readonly disabled?: boolean;
    readonly label: string;
    readonly onPress: () => void;
    readonly secondary?: boolean;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                secondary && styles.buttonSecondary,
                disabled && styles.buttonDisabled,
                pressed && !disabled && styles.buttonPressed,
            ]}
        >
            <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
        </Pressable>
    );
}

export function Status({
    children,
    kind = 'neutral',
}: {
    readonly children: ReactNode;
    readonly kind?: 'error' | 'neutral' | 'stale';
}) {
    return (
        <View
            accessibilityLiveRegion="polite"
            style={[styles.status, kind === 'error' && styles.error, kind === 'stale' && styles.stale]}
        >
            <Text style={styles.statusText}>{children}</Text>
        </View>
    );
}

export function Loading() {
    return (
        <View accessibilityLabel="Загрузка" accessibilityRole="progressbar" style={styles.loading}>
            <ActivityIndicator color="#12634f" />
            <Text>Загрузка…</Text>
        </View>
    );
}

export function Card({ children, onPress }: PropsWithChildren<{ readonly onPress?: () => void }>) {
    if (onPress === undefined) return <View style={styles.card}>{children}</View>;
    return (
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
            {children}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        backgroundColor: '#12634f',
        borderRadius: 12,
        justifyContent: 'center',
        minHeight: 48,
        paddingHorizontal: 18,
        paddingVertical: 12,
    },
    buttonDisabled: { opacity: 0.45 },
    buttonPressed: { opacity: 0.8 },
    buttonSecondary: { backgroundColor: '#e4eee9', borderColor: '#12634f', borderWidth: 1 },
    buttonSecondaryText: { color: '#12634f' },
    buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
    card: {
        backgroundColor: '#ffffff',
        borderColor: '#d6ded9',
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
        minHeight: 48,
        padding: 16,
    },
    error: { backgroundColor: '#ffe8e4' },
    field: { gap: 6 },
    input: {
        backgroundColor: '#ffffff',
        borderColor: '#87948e',
        borderRadius: 10,
        borderWidth: 1,
        color: '#17201c',
        fontSize: 17,
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    label: { color: '#25332d', fontSize: 15, fontWeight: '600' },
    loading: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 80 },
    safeArea: { backgroundColor: '#f3f5ee', flex: 1 },
    screen: { gap: 16, padding: 18, paddingBottom: 40 },
    stale: { backgroundColor: '#fff3ca' },
    status: { backgroundColor: '#e7eeeb', borderRadius: 10, padding: 12 },
    statusText: { color: '#17201c', fontSize: 15, lineHeight: 21 },
    title: { color: '#12372d', fontSize: 30, fontWeight: '800', lineHeight: 36 },
});
