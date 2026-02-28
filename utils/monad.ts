import { createPublicClient, http, defineChain, formatEther, type Address } from 'viem';

/**
 * Monad Testnet chain definition
 */
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
});

/**
 * Public client for reading data from Monad Testnet
 */
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

/**
 * Get the MON balance of an address on Monad Testnet
 */
export async function getMonBalance(address: Address): Promise<string> {
  const balanceWei = await publicClient.getBalance({ address });
  return formatEther(balanceWei);
}
