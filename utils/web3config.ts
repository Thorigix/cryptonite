/**
 * Web3Modal + Wagmi Yapılandırması
 * WalletConnect üzerinden MetaMask ve diğer cüzdanları destekler
 */
import '@walletconnect/react-native-compat';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi-react-native';
import { defineChain } from 'viem';

// WalletConnect Cloud Project ID — ücretsiz: https://cloud.walletconnect.com
const PROJECT_ID = '83aca30db3b90c8d1214dcc3037a1711';

// Monad Testnet chain tanımı
const monadTestnet = defineChain({
	id: 10143,
	name: 'Monad Testnet',
	nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
	rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
	blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' } },
	testnet: true,
});

const metadata = {
	name: 'Cryptonite',
	description: 'Kripto ödeme uygulaması',
	url: 'https://cryptonite.app',
	icons: ['https://cryptonite.app/icon.png'],
	redirect: {
		native: 'cryptonite://',
	},
};

const chains = [monadTestnet] as const;

export const wagmiConfig = defaultWagmiConfig({
	projectId: PROJECT_ID,
	chains,
	metadata,
});

createWeb3Modal({
	projectId: PROJECT_ID,
	wagmiConfig,
	defaultChain: monadTestnet,
});
