import {
  createPublicClient,
  defineChain,
  formatEther,
  getContract,
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

// ═══════════════════════════════════════════════════════════════
// MonadYieldVault Contract Integration
// ═══════════════════════════════════════════════════════════════

/**
 * MonadYieldVault kontrat adresi.
 * Deploy edildikten sonra bu adresi güncelleyin.
 */
export const MONAD_YIELD_VAULT_ADDRESS: Address =
  '0x36509F86A748b413a82e510Afc580974cC3F5151'; // TODO: Deploy sonrası güncelle

/**
 * MonadYieldVault Kontrat ABI'si
 */
export const MONAD_YIELD_VAULT_ABI = [
  // ─── deposit ───
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  // ─── getBalanceWithYield ───
  {
    type: 'function',
    name: 'getBalanceWithYield',
    inputs: [{ name: 'user', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  // ─── executePayment ───
  {
    type: 'function',
    name: 'executePayment',
    inputs: [
      { name: 'target', type: 'address', internalType: 'address payable' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── sweep ───
  {
    type: 'function',
    name: 'sweep',
    inputs: [
      { name: 'mainWallet', type: 'address', internalType: 'address payable' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── deposits mapping ───
  {
    type: 'function',
    name: 'deposits',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'depositTime', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  // ─── getContractBalance ───
  {
    type: 'function',
    name: 'getContractBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  // ─── Events ───
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'timestamp', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Payment',
    inputs: [
      { name: 'from', type: 'address', indexed: true, internalType: 'address' },
      { name: 'to', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Sweep',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'mainWallet', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  // ─── receive ───
  {
    type: 'receive',
    stateMutability: 'payable',
  },
] as const;

/**
 * Read-only kontrat instance oluşturur (publicClient ile).
 */
export function getYieldVaultReadContract() {
  return getContract({
    address: MONAD_YIELD_VAULT_ADDRESS,
    abi: MONAD_YIELD_VAULT_ABI,
    client: publicClient,
  });
}

/**
 * Write-capable kontrat instance oluşturur (walletClient ile).
 */
export function getYieldVaultWriteContract(privateKey: Hex) {
  const walletClient = createBurnerWalletClient(privateKey);
  return getContract({
    address: MONAD_YIELD_VAULT_ADDRESS,
    abi: MONAD_YIELD_VAULT_ABI,
    client: { public: publicClient, wallet: walletClient },
  });
}

// ═══════════════════════════════════════════════════════════════
// Kontrat Fonksiyonları
// ═══════════════════════════════════════════════════════════════

export interface YieldResult {
  success: boolean;
  amount: number;
  txHash?: string;
}

/**
 * MON'u YieldVault kontratına yatırır.
 * Burner wallet'tan kontrata deposit() çağrısı yapar.
 */
export async function depositToYieldPool(
  privateKey: Hex,
  amount: number
): Promise<YieldResult> {
  console.log(`📥 [Yield] ${amount.toFixed(4)} MON kontrata yatırılıyor...`);

  try {
    const contract = getYieldVaultWriteContract(privateKey);
    const account = privateKeyToAccount(privateKey);
    const value = parseEther(amount.toString());

    const hash = await contract.write.deposit({
      value,
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ [Yield] ${amount.toFixed(4)} MON başarıyla kontrata yatırıldı. TX: ${hash}`);

    return { success: true, amount, txHash: hash };
  } catch (error) {
    console.error('❌ [Yield] Deposit hatası:', error);
    return { success: false, amount };
  }
}

/**
 * Kontrat üzerinden yield dahil bakiyeyi sorgular.
 * getBalanceWithYield(address) view fonksiyonunu çağırır.
 */
export async function getYieldBalance(userAddress: Address): Promise<string> {
  try {
    const contract = getYieldVaultReadContract();
    const balanceWei = await contract.read.getBalanceWithYield([userAddress]);
    return formatEther(balanceWei);
  } catch (error) {
    console.error('❌ [Yield] Balance sorgu hatası:', error);
    return '0';
  }
}

/**
 * Kontrat üzerinden belirli bir tutarı hedef adrese ödeme yapar.
 * executePayment(target, amount) fonksiyonunu çağırır.
 */
export async function executeContractPayment(
  privateKey: Hex,
  targetAddress: Address,
  amountMon: number
): Promise<YieldResult> {
  console.log(`💳 [Vault] ${amountMon.toFixed(4)} MON → ${targetAddress} ödeme yapılıyor...`);

  try {
    const contract = getYieldVaultWriteContract(privateKey);
    const account = privateKeyToAccount(privateKey);
    const value = parseEther(amountMon.toString());

    const hash = await contract.write.executePayment([targetAddress, value], {
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ [Vault] Ödeme tamamlandı. TX: ${hash}`);

    return { success: true, amount: amountMon, txHash: hash };
  } catch (error) {
    console.error('❌ [Vault] Payment hatası:', error);
    return { success: false, amount: amountMon };
  }
}

/**
 * Kontrat üzerindeki tüm bakiyeyi (yield dahil) ana cüzdana süpürür.
 * sweep(mainWallet) fonksiyonunu çağırır.
 */
export async function sweepFromVault(
  privateKey: Hex,
  mainWalletAddress: Address
): Promise<YieldResult> {
  console.log(`🧹 [Vault] Tüm bakiye → ${mainWalletAddress} süpürülüyor...`);

  try {
    const contract = getYieldVaultWriteContract(privateKey);
    const account = privateKeyToAccount(privateKey);

    // Önce bakiyeyi kontrol et
    const balanceWei = await getYieldVaultReadContract().read.getBalanceWithYield([account.address]);
    const balanceFormatted = parseFloat(formatEther(balanceWei));

    if (balanceFormatted <= 0) {
      console.log('⚠️ [Vault] Kontratta bakiye yok, sweep atlanıyor');
      return { success: true, amount: 0 };
    }

    const hash = await contract.write.sweep([mainWalletAddress], {
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ [Vault] Sweep tamamlandı: ${balanceFormatted.toFixed(4)} MON. TX: ${hash}`);

    return { success: true, amount: balanceFormatted, txHash: hash };
  } catch (error) {
    console.error('❌ [Vault] Sweep hatası:', error);
    return { success: false, amount: 0 };
  }
}
