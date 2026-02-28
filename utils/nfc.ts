/**
 * NFC Helper — HCE Broadcast & Reader Mode
 *
 * HCE (Host Card Emulation): Adres yayını için NDEF yazma
 * Reader: Karşı cihazın NFC tag'ini okuma
 *
 * Expo ortamında HCE sınırlı olabilir, bu yüzden tüm fonksiyonlar
 * try/catch ile sarmalanmış ve hata durumunda null döner.
 */
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let nfcInitialized = false;

/**
 * NFC'nin cihazda desteklenip desteklenmediğini kontrol et
 */
export async function isNfcSupported(): Promise<boolean> {
	try {
		const supported = await NfcManager.isSupported();
		return supported;
	} catch {
		console.warn('⚠️ [NFC] isSupported kontrolü başarısız');
		return false;
	}
}

/**
 * NFC Manager'ı başlat (bir kere çalıştırılır)
 */
export async function initNfc(): Promise<boolean> {
	if (nfcInitialized) return true;
	try {
		await NfcManager.start();
		nfcInitialized = true;
		console.log('✅ [NFC] Manager başlatıldı');
		return true;
	} catch (e) {
		console.warn('⚠️ [NFC] Manager başlatılamadı:', e);
		return false;
	}
}

/**
 * HCE ile Ethereum adresini NDEF olarak yayınla.
 * Expo/managed workflow'da çalışmayabilir — çağıran fallback olarak QR göstersin.
 */
export async function startNfcBroadcast(address: string): Promise<boolean> {
	try {
		await initNfc();

		// NDEF mesajı oluştur
		const bytes = Ndef.encodeMessage([Ndef.textRecord(address)]);

		if (!bytes) {
			throw new Error('NDEF encode başarısız');
		}

		// NfcA / IsoDep teknolojisi ile HCE simülasyonu
		await NfcManager.requestTechnology(NfcTech.Ndef);

		// Tag'a yaz (HCE modunda kendi cihaz tag'ine)
		await NfcManager.ndefHandler.writeNdefMessage(bytes);
		console.log('📡 [NFC] HCE yayını başladı:', address);
		return true;
	} catch (e) {
		console.warn('⚠️ [NFC] HCE yayını başarısız:', e);
		// Teknoloji isteğini iptal et
		try {
			await NfcManager.cancelTechnologyRequest();
		} catch { }
		return false;
	}
}

/**
 * NFC Reader moduna geç ve karşı cihazın yayınladığı NDEF'i oku.
 * Başarılı olursa Ethereum adresini döner.
 */
export async function startNfcRead(): Promise<string | null> {
	try {
		await initNfc();
		await NfcManager.requestTechnology(NfcTech.Ndef);

		const tag = await NfcManager.getTag();

		if (tag?.ndefMessage && tag.ndefMessage.length > 0) {
			const record = tag.ndefMessage[0];
			if (record?.payload) {
				// Text record payload'ı decode et
				const text = Ndef.text.decodePayload(new Uint8Array(record.payload));
				console.log('📖 [NFC] Okunan adres:', text);
				return text;
			}
		}

		console.warn('⚠️ [NFC] Geçerli NDEF mesajı bulunamadı');
		return null;
	} catch (e) {
		console.warn('⚠️ [NFC] Okuma başarısız:', e);
		return null;
	} finally {
		try {
			await NfcManager.cancelTechnologyRequest();
		} catch { }
	}
}

/**
 * Aktif NFC oturumunu kapat
 */
export async function stopNfc(): Promise<void> {
	try {
		await NfcManager.cancelTechnologyRequest();
		console.log('🛑 [NFC] Oturum kapatıldı');
	} catch {
		// Zaten kapalı olabilir
	}
}
