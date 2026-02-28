import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  createWalletClient as viemCreateWalletClient,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
 * Create a wallet client for signing transactions with a burner private key
 */
export function createBurnerWalletClient(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return viemCreateWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });
}

/**
 * Get the MON balance of an address on Monad Testnet
 */
export async function getMonBalance(address: Address): Promise<string> {
  const balanceWei = await publicClient.getBalance({ address });
  return formatEther(balanceWei);
}

/**
 * Get the MON balance in Wei (for gas-aware sweep calculations)
 */
export async function getMonBalanceWei(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}

/**
 * Transfer MON (native token) from burner wallet to a target address.
 * Returns the transaction hash.
 */
export async function transferMon(
  privateKey: Hex,
  to: Address,
  amountMon: number
): Promise<Hex> {
  const walletClient = createBurnerWalletClient(privateKey);
  const account = privateKeyToAccount(privateKey);

  const value = parseEther(amountMon.toString());

  console.log(`💸 [Transfer] ${amountMon} MON → ${to}`);

  const hash = await walletClient.sendTransaction({
    account,
    to,
    value,
  });

  console.log(`✅ [Transfer] TX Hash: ${hash}`);

  // İşlemin onaylanmasını bekle
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ [Transfer] TX Onaylandı, block: ${receipt.blockNumber}`);

  return hash;
}

/**
 * Sweep: Kalan tüm bakiyeyi (gas düşülerek) hedef adrese gönder.
 * Returns the transaction hash, or null if balance too low.
 */
export async function sweepBalance(
  privateKey: Hex,
  to: Address
): Promise<Hex | null> {
  const account = privateKeyToAccount(privateKey);
  const balance = await getMonBalanceWei(account.address);

  if (balance === 0n) {
    console.log('⚠️ [Sweep] Bakiye sıfır, sweep yapılmıyor');
    return null;
  }

  const walletClient = createBurnerWalletClient(privateKey);

  // Gas tahmini
  const gasPrice = await publicClient.getGasPrice();
  const gasLimit = 21000n; // Basit transfer gas limiti
  const gasCost = gasPrice * gasLimit;

  if (balance <= gasCost) {
    console.log('⚠️ [Sweep] Bakiye gas masrafından düşük, sweep yapılmıyor');
    return null;
  }

  const sweepAmount = balance - gasCost;

  console.log(`🧹 [Sweep] ${formatEther(sweepAmount)} MON → ${to}`);

  const hash = await walletClient.sendTransaction({
    account,
    to,
    value: sweepAmount,
    gas: gasLimit,
    gasPrice,
  });

  console.log(`✅ [Sweep] TX Hash: ${hash}`);

  await publicClient.waitForTransactionReceipt({ hash });
  console.log('✅ [Sweep] TX Onaylandı');

  return hash;
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
