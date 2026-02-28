import * as SecureStore from 'expo-secure-store';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const SECURE_STORE_KEY = 'BURNER_PRIVATE_KEY';

export interface BurnerWallet {
	privateKey: Hex;
	address: Address;
}

/**
 * Get or create a burner wallet.
 * - If a private key exists in SecureStore, load it.
 * - Otherwise generate a new one and persist it.
 * - Logs the private key and address to the console.
 */
export async function getOrCreateWallet(): Promise<BurnerWallet> {
	let privateKey = (await SecureStore.getItemAsync(SECURE_STORE_KEY)) as Hex | null;

	if (privateKey) {
		console.log('♻️  [Wallet] Mevcut burner wallet SecureStore\'dan yüklendi');
	} else {
		privateKey = generatePrivateKey();
		await SecureStore.setItemAsync(SECURE_STORE_KEY, privateKey);
		console.log('🆕 [Wallet] Yeni burner wallet oluşturuldu ve SecureStore\'a kaydedildi');
	}

	const account = privateKeyToAccount(privateKey);

	console.log(`🔐 [Wallet] Private Key: ${privateKey}`);
	console.log(`📍 [Wallet] Address: ${account.address}`);

	return {
		privateKey,
		address: account.address,
	};
}
