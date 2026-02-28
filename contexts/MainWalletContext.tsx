import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Address } from 'viem';

const SECURE_KEY = 'MAIN_WALLET_ADDRESS';

interface MainWalletContextValue {
	mainWalletAddress: Address | null;
	setMainWalletAddress: (addr: Address | null) => void;
	connectMainWallet: (addr: Address) => Promise<void>;
	disconnectMainWallet: () => Promise<void>;
}

const MainWalletContext = createContext<MainWalletContextValue>({
	mainWalletAddress: null,
	setMainWalletAddress: () => { },
	connectMainWallet: async () => { },
	disconnectMainWallet: async () => { },
});

export function MainWalletProvider({ children }: { children: React.ReactNode }) {
	const [mainWalletAddress, setMainWalletAddress] = useState<Address | null>(null);

	// Load persisted address on mount
	useEffect(() => {
		(async () => {
			const stored = await SecureStore.getItemAsync(SECURE_KEY);
			if (stored) {
				console.log('🔗 [MainWallet] Kayıtlı ana cüzdan yüklendi:', stored);
				setMainWalletAddress(stored as Address);
			}
		})();
	}, []);

	const connectMainWallet = useCallback(async (addr: Address) => {
		await SecureStore.setItemAsync(SECURE_KEY, addr);
		setMainWalletAddress(addr);
		console.log('✅ [MainWallet] Ana cüzdan bağlandı:', addr);
	}, []);

	const disconnectMainWallet = useCallback(async () => {
		await SecureStore.deleteItemAsync(SECURE_KEY);
		setMainWalletAddress(null);
		console.log('❌ [MainWallet] Ana cüzdan bağlantısı kesildi');
	}, []);

	return (
		<MainWalletContext.Provider
			value={{ mainWalletAddress, setMainWalletAddress, connectMainWallet, disconnectMainWallet }}
		>
			{children}
		</MainWalletContext.Provider>
	);
}

export function useMainWallet() {
	return useContext(MainWalletContext);
}
