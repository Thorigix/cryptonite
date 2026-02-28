import { useMainWallet } from '@/contexts/MainWalletContext';
import { depositToYieldPool, getMonBalance, withdrawFromYieldPool } from '@/utils/monad';
import type { PriceData } from '@/utils/price';
import { calculateMonForTRY } from '@/utils/price';
import { getOrCreateWallet } from '@/utils/wallet';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Address } from 'viem';

export default function WalletScreen() {
  const { mainWalletAddress } = useMainWallet();
  const [address, setAddress] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fiyat state'leri
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [monForFiftyTL, setMonForFiftyTL] = useState<number | null>(null);

  // Nema (Yield) state'leri
  const [yieldBalance, setYieldBalance] = useState(0);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchPrice = useCallback(async () => {
    try {
      const { monAmount, priceData: pd } = await calculateMonForTRY(50);
      setMonForFiftyTL(monAmount);
      setPriceData(pd);
    } catch {
      console.warn('[Price] Fiyat bilgisi alınamadı');
    }
  }, []);

  const initWallet = useCallback(async () => {
    try {
      setError(null);
      const wallet = await getOrCreateWallet();
      setAddress(wallet.address);
      const bal = await getMonBalance(wallet.address);
      setBalance(bal);
      await fetchPrice();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      console.error('[Wallet] Hata:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchPrice]);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    setRefreshing(true);
    try {
      const bal = await getMonBalance(address);
      setBalance(bal);
      await fetchPrice();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bakiye alınamadı';
      Alert.alert('Hata', msg);
    } finally {
      setRefreshing(false);
    }
  }, [address, fetchPrice]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const handleDeposit = useCallback(async () => {
    const walletBal = parseFloat(balance ?? '0');
    if (walletBal <= 0) {
      Alert.alert('Yetersiz Bakiye', 'Cüzdanınızda yatırılacak MON yok.');
      return;
    }
    setDepositing(true);
    try {
      const result = await depositToYieldPool(walletBal);
      if (result.success) {
        setYieldBalance((prev) => prev + result.amount);
        setBalance('0');
        Alert.alert('Başarılı', `${result.amount.toFixed(4)} MON Nema havuzuna yatırıldı.`);
      }
    } catch {
      Alert.alert('Hata', "Nema'ya yatırma işlemi başarısız oldu.");
    } finally {
      setDepositing(false);
    }
  }, [balance]);

  const handleWithdraw = useCallback(async () => {
    if (yieldBalance <= 0) {
      Alert.alert('Yetersiz Bakiye', 'Nema havuzunda çekilecek MON yok.');
      return;
    }
    setWithdrawing(true);
    try {
      const result = await withdrawFromYieldPool(yieldBalance);
      if (result.success) {
        const currentBal = parseFloat(balance ?? '0');
        setBalance((currentBal + result.amount).toString());
        setYieldBalance(0);
        Alert.alert('Başarılı', `${result.amount.toFixed(4)} MON cüzdana çekildi.`);
      }
    } catch {
      Alert.alert('Hata', "Nema'dan çekme işlemi başarısız oldu.");
    } finally {
      setWithdrawing(false);
    }
  }, [yieldBalance, balance]);

  useEffect(() => {
    initWallet();
  }, [initWallet]);

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  /** MON bakiyesinin USD ve TRY karşılığını hesapla */
  const balanceNum = parseFloat(balance ?? '0');
  const balanceUSD = priceData ? (balanceNum * priceData.monUSD).toFixed(2) : null;
  const balanceTRY = priceData ? (balanceNum * priceData.monTRY).toFixed(2) : null;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#836EF9" />
        <Text style={styles.loadingText}>Cüzdan yükleniyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initWallet}>
          <Text style={styles.retryButtonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Ana Cüzdan (MetaMask) Kartı */}
      {mainWalletAddress ? (
        <View style={styles.mainWalletCard}>
          <View style={styles.mainWalletRow}>
            <Text style={styles.mainWalletIcon}>🦊</Text>
            <View style={styles.mainWalletInfo}>
              <Text style={styles.mainWalletLabel}>Ana Cüzdan (MetaMask)</Text>
              <Text style={styles.mainWalletAddr}>
                {shortenAddress(mainWalletAddress)}
              </Text>
            </View>
            <View style={styles.mainWalletStatusDot} />
          </View>
        </View>
      ) : (
        <View style={styles.mainWalletCardDisconnected}>
          <Text style={styles.mainWalletDisconnectedText}>
            Ana cüzdan bağlı değil — Payment sekmesinden bağlayın
          </Text>
        </View>
      )}

      {/* Network Badge */}
      <View style={styles.networkBadge}>
        <View style={styles.networkDot} />
        <Text style={styles.networkText}>Monad Testnet</Text>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>MON Bakiye</Text>
        <Text style={styles.balanceValue}>{balanceNum.toFixed(4)}</Text>
        <Text style={styles.balanceCurrency}>MON</Text>

        {/* Fiat karşılıkları */}
        {(balanceUSD !== null || balanceTRY !== null) && (
          <View style={styles.fiatRow}>
            {balanceUSD !== null && (
              <View style={styles.fiatChip}>
                <Text style={styles.fiatLabel}>USD</Text>
                <Text style={styles.fiatValue}>${balanceUSD}</Text>
              </View>
            )}
            {balanceTRY !== null && (
              <View style={styles.fiatChip}>
                <Text style={styles.fiatLabel}>TRY</Text>
                <Text style={styles.fiatValue}>₺{balanceTRY}</Text>
              </View>
            )}
            {priceData?.isFallback && (
              <View style={styles.fiatChipMuted}>
                <Text style={styles.fiatMutedText}>Tahmini</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Istanbul Kart Dolum Bilgisi */}
      <View style={styles.priceCard}>
        <View style={styles.priceMeta}>
          <Text style={styles.priceTitle}>Istanbulkart Dolum</Text>
          <Text style={styles.priceSubtitle}>50 TL</Text>
        </View>
        <View style={styles.priceDivider} />
        <View style={styles.priceMeta}>
          <Text style={styles.priceSubtitle}>MON karşılığı</Text>
          <Text style={styles.priceAmount}>
            {monForFiftyTL != null ? monForFiftyTL.toFixed(4) : '—'} MON
          </Text>
        </View>
      </View>

      {/* Nema Havuz Kartı */}
      <View style={styles.yieldCard}>
        <View style={styles.yieldHeader}>
          <Text style={styles.yieldTitle}>Nema Havuzu</Text>
          <Text style={styles.yieldBadge}>MOCK</Text>
        </View>
        <Text style={styles.yieldBalance}>{yieldBalance.toFixed(4)} MON</Text>
        <View style={styles.yieldBar}>
          <View
            style={[
              styles.yieldBarFill,
              {
                width:
                  yieldBalance > 0
                    ? `${Math.min(
                      (yieldBalance / (yieldBalance + balanceNum)) * 100,
                      100
                    )}%`
                    : '0%',
              },
            ]}
          />
        </View>
        <Text style={styles.yieldHint}>
          Boşta duran MON'unuzu Nema havuzuna yatırarak getiri kazanın
        </Text>

        {/* Nema Butonları */}
        <View style={styles.yieldButtons}>
          <TouchableOpacity
            style={[styles.yieldButton, (depositing || withdrawing) && styles.yieldButtonDisabled]}
            onPress={handleDeposit}
            disabled={depositing || withdrawing}
            activeOpacity={0.7}
          >
            {depositing ? (
              <ActivityIndicator size="small" color="#836EF9" />
            ) : (
              <>
                <Text style={styles.yieldButtonIcon}>↓</Text>
                <Text style={styles.yieldButtonText}>Nema'ya Yatır</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.yieldButton, (depositing || withdrawing) && styles.yieldButtonDisabled]}
            onPress={handleWithdraw}
            disabled={depositing || withdrawing}
            activeOpacity={0.7}
          >
            {withdrawing ? (
              <ActivityIndicator size="small" color="#836EF9" />
            ) : (
              <>
                <Text style={styles.yieldButtonIcon}>↑</Text>
                <Text style={styles.yieldButtonText}>Nema'dan Çek</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Address Card */}
      <TouchableOpacity
        style={styles.addressCard}
        onPress={copyAddress}
        activeOpacity={0.7}
      >
        <View style={styles.addressHeader}>
          <Text style={styles.addressLabel}>Cüzdan Adresi</Text>
          <Text style={styles.copyHint}>{copied ? 'Kopyalandı' : 'Dokun & Kopyala'}</Text>
        </View>
        <Text style={styles.addressShort}>
          {address ? shortenAddress(address) : '—'}
        </Text>
        <Text style={styles.addressFull}>{address}</Text>
      </TouchableOpacity>

      {/* Refresh Button */}
      <TouchableOpacity
        style={styles.refreshButton}
        onPress={refreshBalance}
        disabled={refreshing}
        activeOpacity={0.7}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color="#836EF9" />
        ) : (
          <Text style={styles.refreshButtonText}>Bakiyeyi Yenile</Text>
        )}
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Burner Wallet</Text>
        <Text style={styles.infoText}>
          Bu geçici bir cüzdandır. Adresinize test MON göndermek için yukarıdaki
          adrese dokunarak kopyalayın ve Monad Faucet'ten token talep edin.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },

  /* Main Wallet Card */
  mainWalletCard: {
    width: '100%',
    backgroundColor: '#13131A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(246,133,27,0.3)',
    marginBottom: 16,
  },
  mainWalletRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainWalletIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  mainWalletInfo: {
    flex: 1,
  },
  mainWalletLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  mainWalletAddr: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  mainWalletStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  mainWalletCardDisconnected: {
    width: '100%',
    backgroundColor: 'rgba(255,107,107,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.1)',
    marginBottom: 16,
    alignItems: 'center',
  },
  mainWalletDisconnectedText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },

  /* Loading */
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 15,
  },

  /* Error */
  errorText: {
    color: '#FF6B6B',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#836EF9',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  /* Network Badge */
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(131,110,249,0.12)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 32,
  },
  networkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    marginRight: 8,
  },
  networkText: {
    color: '#836EF9',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Balance Card */
  balanceCard: {
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    color: '#555',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  balanceCurrency: {
    color: '#836EF9',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 16,
  },
  /* Fiat row */
  fiatRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  fiatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#13131A',
    borderWidth: 1,
    borderColor: '#1E1E2A',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  fiatLabel: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  fiatValue: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '700',
  },
  fiatChipMuted: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  fiatMutedText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '600',
  },

  /* Istanbulkart Price Card */
  priceCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    marginBottom: 16,
  },
  priceMeta: {
    flex: 1,
    alignItems: 'center',
  },
  priceDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#1E1E2A',
    marginHorizontal: 12,
  },
  priceTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  priceSubtitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 2,
  },
  priceAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Yield Card */
  yieldCard: {
    width: '100%',
    backgroundColor: '#13131A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    marginBottom: 12,
  },
  yieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  yieldTitle: {
    color: '#CCCCCC',
    fontSize: 15,
    fontWeight: '700',
  },
  yieldBadge: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: '#1A1A24',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  yieldBalance: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 16,
  },
  yieldBar: {
    width: '100%',
    height: 3,
    backgroundColor: '#1E1E2A',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  yieldBarFill: {
    height: '100%',
    backgroundColor: '#836EF9',
    borderRadius: 2,
  },
  yieldHint: {
    color: '#555',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
  },

  /* Yield Buttons */
  yieldButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  yieldButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#1A1A26',
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  yieldButtonDisabled: {
    opacity: 0.4,
  },
  yieldButtonIcon: {
    color: '#836EF9',
    fontSize: 16,
    fontWeight: '800',
  },
  yieldButtonText: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Address Card */
  addressCard: {
    width: '100%',
    backgroundColor: '#13131A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    marginBottom: 16,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressLabel: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  copyHint: {
    color: '#836EF9',
    fontSize: 12,
    fontWeight: '600',
  },
  addressShort: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  addressFull: {
    color: '#444',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },

  /* Refresh Button */
  refreshButton: {
    width: '100%',
    backgroundColor: '#13131A',
    borderWidth: 1,
    borderColor: '#836EF9',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshButtonText: {
    color: '#836EF9',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Info */
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(131,110,249,0.05)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(131,110,249,0.1)',
  },
  infoTitle: {
    color: '#836EF9',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  infoText: {
    color: '#666',
    fontSize: 13,
    lineHeight: 20,
  },
});
