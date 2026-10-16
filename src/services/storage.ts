import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small JSON persistence wrapper. Failures are swallowed: losing a cache must never crash a drive. */
export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(`odos:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(`odos:${key}`, JSON.stringify(value));
  } catch {}
}
