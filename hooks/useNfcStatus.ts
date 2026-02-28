import { isNfcEnabled, isNfcSupported } from '@/utils/nfc';
import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const POLL_INTERVAL = 10_000; // 10 saniye

/**
 * NFC durumunu her 10 saniyede bir kontrol eden hook.
 * Döndürür: nfcEnabled, nfcSupported, openNfcSettings
 */
export function useNfcStatus() {
	const [nfcEnabled, setNfcEnabled] = useState(false);
	const [nfcSupported, setNfcSupported] = useState(false);

	const checkNfc = useCallback(async () => {
		const supported = await isNfcSupported();
		setNfcSupported(supported);
		if (supported) {
			const enabled = await isNfcEnabled();
			setNfcEnabled(enabled);
		} else {
			setNfcEnabled(false);
		}
	}, []);

	useEffect(() => {
		checkNfc();
		const interval = setInterval(checkNfc, POLL_INTERVAL);
		return () => clearInterval(interval);
	}, [checkNfc]);

	const openNfcSettings = useCallback(async () => {
		if (Platform.OS === 'android') {
			try {
				await IntentLauncher.startActivityAsync(
					IntentLauncher.ActivityAction.NFC_SETTINGS
				);
			} catch (e) {
				console.warn('⚠️ [NFC] Ayarlar açılamadı:', e);
			}
		}
	}, []);

	return { nfcEnabled, nfcSupported, openNfcSettings };
}
