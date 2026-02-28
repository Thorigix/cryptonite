/**
 * Ödeme Pipeline — Oracle → Flash-Withdraw → Transfer → Sweep → Burn
 *
 * Bu modül, P2P ödeme akışının tüm adımlarını sırasıyla yürütür:
 * 1. Fiyat Oracle: 50 TL → MON dönüşümü
 * 2. Flash-Withdraw: Nema havuzundan bakiye çek (gerekirse)
 * 3. Transfer: Hesaplanan MON'u hedef adrese gönder
 * 4. Sweep: Kalan bakiyeyi ana cüzdana transfer et
 * 5. Burn: Burner cüzdan private key'ini sil
 */
import type { Address, Hex } from 'viem';
import { getMonBalance, sweepBalance, transferMon } from './monad';
import { calculateMonForTRY } from './price';
import { deleteWallet } from './wallet';

export interface PaymentStep {
	step: 'oracle' | 'withdraw' | 'transfer' | 'sweep' | 'burn' | 'done' | 'error';
	message: string;
	detail?: string;
}

export type PaymentProgressCallback = (step: PaymentStep) => void;

export interface PaymentResult {
	success: boolean;
	txHash?: string;
	sweepTxHash?: string;
	monAmount?: number;
	error?: string;
}

/**
 * Tam P2P ödeme akışını yürütür.
 *
 * @param targetAddress - Ödeme alanın Metamask adresi
 * @param amountTRY - TL cinsinden ödeme miktarı (varsayılan 50)
 * @param burnerPrivateKey - Burner cüzdanının private key'i
 * @param mainWalletAddress - Ödeme yapanın ana Metamask adresi (sweep hedefi)
 * @param yieldBalance - Nema havuzundaki bakiye
 * @param onWithdrawFromYield - Nema havuzundan çekme callback (UI state güncellemesi için)
 * @param onProgress - Adım adım ilerleme callback'i
 */
export async function executePayment(
	targetAddress: Address,
	amountTRY: number,
	burnerPrivateKey: Hex,
	mainWalletAddress: Address,
	yieldBalance: number,
	onWithdrawFromYield: (amount: number) => Promise<void>,
	onProgress: PaymentProgressCallback
): Promise<PaymentResult> {
	try {
		// ─── Adım 1: Fiyat Oracle ───
		onProgress({
			step: 'oracle',
			message: 'Fiyat hesaplanıyor...',
			detail: `${amountTRY} TL → MON dönüşümü`,
		});

		const { monAmount, priceData } = await calculateMonForTRY(amountTRY);
		console.log(`🧮 [Payment] ${amountTRY} TL = ${monAmount.toFixed(6)} MON`);
		console.log(`🧮 [Payment] Kaynak: ${priceData.isFallback ? 'Fallback' : 'CoinGecko'}`);

		onProgress({
			step: 'oracle',
			message: `${monAmount.toFixed(4)} MON hesaplandı`,
			detail: `1 MON = ₺${priceData.monTRY.toFixed(2)}`,
		});

		// ─── Adım 2: Flash-Withdraw (gerekirse) ───
		const { privateKeyToAccount } = await import('viem/accounts');
		const burnerAccount = privateKeyToAccount(burnerPrivateKey);
		const burnerBalanceStr = await getMonBalance(burnerAccount.address);
		const burnerBalance = parseFloat(burnerBalanceStr);

		if (burnerBalance < monAmount) {
			if (yieldBalance > 0) {
				onProgress({
					step: 'withdraw',
					message: 'Nema havuzundan çekiliyor...',
					detail: `${yieldBalance.toFixed(4)} MON geri çekiliyor`,
				});

				await onWithdrawFromYield(yieldBalance);

				console.log(`📤 [Payment] Flash-Withdraw: ${yieldBalance.toFixed(4)} MON Nema'dan çekildi`);
			} else {
				// Nema'da da yok — yine de deneyeceğiz, başarısız olabilir
				console.warn('⚠️ [Payment] Yetersiz bakiye, Nema havuzunda da yok');
			}
		}

		// ─── Adım 3: MON Transferi ───
		onProgress({
			step: 'transfer',
			message: 'MON gönderiliyor...',
			detail: `${monAmount.toFixed(4)} MON → ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
		});

		const txHash = await transferMon(burnerPrivateKey, targetAddress, monAmount);

		onProgress({
			step: 'transfer',
			message: 'Transfer tamamlandı!',
			detail: `TX: ${txHash.slice(0, 10)}...`,
		});

		// ─── Adım 4: Sweep (kalan bakiyeyi ana cüzdana) ───
		onProgress({
			step: 'sweep',
			message: 'Kalan bakiye süpürülüyor...',
			detail: `→ ${mainWalletAddress.slice(0, 6)}...${mainWalletAddress.slice(-4)}`,
		});

		const sweepTxHash = await sweepBalance(burnerPrivateKey, mainWalletAddress);

		if (sweepTxHash) {
			console.log(`🧹 [Payment] Sweep tamamlandı: ${sweepTxHash}`);
		} else {
			console.log('🧹 [Payment] Sweep: Yetersiz bakiye veya gas, atlanıyor');
		}

		// ─── Adım 5: Burn (private key silme) ───
		onProgress({
			step: 'burn',
			message: 'Burner cüzdan imha ediliyor...',
		});

		await deleteWallet();

		onProgress({
			step: 'done',
			message: 'İşlem Başarılı, Cüzdan İmha Edildi! ✅',
		});

		return {
			success: true,
			txHash,
			sweepTxHash: sweepTxHash ?? undefined,
			monAmount,
		};
	} catch (e) {
		const errorMsg = e instanceof Error ? e.message : 'Bilinmeyen hata';
		console.error('❌ [Payment] Hata:', errorMsg);

		onProgress({
			step: 'error',
			message: 'Ödeme başarısız!',
			detail: errorMsg,
		});

		return {
			success: false,
			error: errorMsg,
		};
	}
}
