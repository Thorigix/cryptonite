/**
 * Fiyat Servisi — CoinGecko API + Fallback
 *
 * CoinGecko'nun ücretsiz public API'sini kullanarak MON ve USDT fiyatlarını çeker.
 * Hata durumunda sabit fallback değerleri kullanır (1 MON = 5 USD, 1 USD = 35 TRY).
 */

const COINGECKO_URL =
	'https://api.coingecko.com/api/v3/simple/price?ids=monad,tether&vs_currencies=try,usd';

/** Fallback sabit değerler */
const FALLBACK_MON_USD = 5;
const FALLBACK_USD_TRY = 35;

export interface PriceData {
	monTRY: number;
	monUSD: number;
	usdTRY: number;
	isFallback: boolean;
}

/**
 * CoinGecko'dan güncel fiyatları çeker.
 * Hata veya eksik veri durumunda fallback değerleri döner.
 */
export async function fetchPrices(): Promise<PriceData> {
	try {
		console.log('💰 [Price] CoinGecko\'dan fiyatlar çekiliyor...');

		const response = await fetch(COINGECKO_URL, {
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			throw new Error(`CoinGecko HTTP ${response.status}`);
		}

		const data = await response.json();

		// USD/TRY kurunu tether üzerinden al
		const usdTRY = data?.tether?.try ?? FALLBACK_USD_TRY;

		// MON fiyatını kontrol et
		if (data?.monad?.usd && data?.monad?.try) {
			const monUSD = data.monad.usd as number;
			const monTRY = data.monad.try as number;

			console.log(`✅ [Price] MON = $${monUSD} / ₺${monTRY}`);
			console.log(`✅ [Price] USD/TRY = ₺${usdTRY}`);

			return { monTRY, monUSD, usdTRY, isFallback: false };
		}

		// monad ID bulunamadı — fallback kullan
		console.warn('⚠️ [Price] CoinGecko\'da "monad" ID bulunamadı, fallback kullanılıyor');
		return buildFallback(usdTRY);
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Bilinmeyen hata';
		console.warn(`⚠️ [Price] CoinGecko hatası: ${msg} — fallback kullanılıyor`);
		return buildFallback(FALLBACK_USD_TRY);
	}
}

/**
 * Sabit fallback değerlerle PriceData oluşturur.
 */
function buildFallback(usdTRY: number): PriceData {
	const monUSD = FALLBACK_MON_USD;
	const monTRY = monUSD * usdTRY;

	console.log(`🔄 [Price] Fallback: 1 MON = $${monUSD} / ₺${monTRY}`);

	return { monTRY, monUSD, usdTRY, isFallback: true };
}

/**
 * Verilen TL miktarının kaç MON ettiğini hesaplar.
 */
export async function calculateMonForTRY(amountTRY: number): Promise<{
	monAmount: number;
	priceData: PriceData;
}> {
	const priceData = await fetchPrices();
	const monAmount = amountTRY / priceData.monTRY;

	console.log(`🧮 [Price] ${amountTRY} TL = ${monAmount.toFixed(4)} MON`);

	return { monAmount, priceData };
}
