import { createPublicClient, defineChain, formatEther, http, type Address } from 'viem';

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

export interface YieldResult {
  success: boolean;
  amount: number;
}

/**
 * Mock: MON'u Nema (yield) havuzuna yatırır.
 * Gerçek kontrat yerine 2 saniyelik delay ile simüle eder.
 */
export async function depositToYieldPool(amount: number): Promise<YieldResult> {
  console.log(`📥 [Yield] ${amount.toFixed(4)} MON havuza yatırılıyor...`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`✅ [Yield] ${amount.toFixed(4)} MON başarıyla havuza yatırıldı`);
  return { success: true, amount };
}

/**
 * Mock: Nema (yield) havuzundan MON çeker.
 * Gerçek kontrat yerine 2 saniyelik delay ile simüle eder.
 */
export async function withdrawFromYieldPool(amount: number): Promise<YieldResult> {
  console.log(`📤 [Yield] ${amount.toFixed(4)} MON havuzdan çekiliyor...`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`✅ [Yield] ${amount.toFixed(4)} MON başarıyla havuzdan çekildi`);
  return { success: true, amount };
}
