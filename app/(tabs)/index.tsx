import { depositToYieldPool, getMonBalance, withdrawFromYieldPool } from '@/utils/monad';
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
  const [address, setAddress] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fiyat state'leri
  const [monForFiftyTL, setMonForFiftyTL] = useState<number | null>(null);
  const [priceIsFallback, setPriceIsFallback] = useState(false);

  // Nema (Yield) state'leri
  const [yieldBalance, setYieldBalance] = useState(0);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const initWallet = useCallback(async () => {
    try {
      setError(null);
      const wallet = await getOrCreateWallet();
      setAddress(wallet.address);
      const bal = await getMonBalance(wallet.address);
      setBalance(bal);

      // Fiyat bilgisini çek
      try {
        const { monAmount, priceData } = await calculateMonForTRY(50);
        setMonForFiftyTL(monAmount);
        setPriceIsFallback(priceData.isFallback);
      } catch {
        console.warn('⚠️ Fiyat bilgisi alınamadı');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      console.error('❌ [Wallet] Hata:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    setRefreshing(true);
    try {
      const bal = await getMonBalance(address);
      setBalance(bal);

      // Fiyatı da güncelle
      try {
        const { monAmount, priceData } = await calculateMonForTRY(50);
        setMonForFiftyTL(monAmount);
        setPriceIsFallback(priceData.isFallback);
      } catch {
        // sessizce geç
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bakiye alınamadı';
      Alert.alert('Hata', msg);
    } finally {
      setRefreshing(false);
    }
  }, [address]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  /** Cüzdan bakiyesini Nema havuzuna yatır */
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
        Alert.alert('Başarılı ✅', `${result.amount.toFixed(4)} MON Nema havuzuna yatırıldı.`);
      }
    } catch {
      Alert.alert('Hata', 'Nema\'ya yatırma işlemi başarısız oldu.');
    } finally {
      setDepositing(false);
    }
  }, [balance]);

  /** Nema havuzundan cüzdana çek */
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
        Alert.alert('Başarılı ✅', `${result.amount.toFixed(4)} MON cüzdana çekildi.`);
      }
    } catch {
      Alert.alert('Hata', 'Nema\'dan çekme işlemi başarısız oldu.');
    } finally {
      setWithdrawing(false);
    }
  }, [yieldBalance, balance]);

  useEffect(() => {
    initWallet();
  }, [initWallet]);

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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
        <Text style={styles.errorEmoji}>⚠️</Text>
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
      {/* Network Badge */}
      <View style={styles.networkBadge}>
        <View style={styles.networkDot} />
        <Text style={styles.networkText}>Monad Testnet</Text>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>MON Bakiye</Text>
        <Text style={styles.balanceValue}>
          {parseFloat(balance ?? '0').toFixed(4)}
        </Text>
        <Text style={styles.balanceCurrency}>MON</Text>
      </View>

      {/* İstanbulkart Dolum Bilgisi */}
      <View style={styles.priceCard}>
        <Text style={styles.priceIcon}>🚇</Text>
        <View style={styles.priceContent}>
          <Text style={styles.priceTitle}>İstanbulkart Dolum (50 TL)</Text>
          <Text style={styles.priceValue}>
            = {monForFiftyTL != null ? monForFiftyTL.toFixed(4) : '—'} MON
          </Text>
        </View>
        {priceIsFallback && (
          <View style={styles.fallbackBadge}>
            <Text style={styles.fallbackText}>Tahmini</Text>
          </View>
        )}
      </View>

      {/* Nema Havuz Bakiyesi */}
      <View style={styles.yieldCard}>
        <View style={styles.yieldHeader}>
          <Text style={styles.yieldIcon}>🌱</Text>
          <Text style={styles.yieldTitle}>Nema Havuzu</Text>
        </View>
        <Text style={styles.yieldBalance}>{yieldBalance.toFixed(4)} MON</Text>
        <View style={styles.yieldBar}>
          <View
            style={[
              styles.yieldBarFill,
              {
                width:
                  yieldBalance > 0
                    ? `${Math.min((yieldBalance / (yieldBalance + parseFloat(balance ?? '0'))) * 100, 100)}%`
                    : '0%',
              },
            ]}
          />
        </View>
        <Text style={styles.yieldHint}>
          Boşta duran MON'unuzu Nema havuzuna yatırarak getiri kazanın
        </Text>
      </View>

      {/* Nema Butonları */}
      <View style={styles.yieldButtons}>
        <TouchableOpacity
          style={[styles.yieldButton, styles.depositButton]}
          onPress={handleDeposit}
          disabled={depositing || withdrawing}
          activeOpacity={0.7}
        >
          {depositing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.yieldButtonText}>📥  Parayı Nema'ya Yatır</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.yieldButton, styles.withdrawButton]}
          onPress={handleWithdraw}
          disabled={depositing || withdrawing}
          activeOpacity={0.7}
        >
          {withdrawing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.yieldButtonText}>📤  Nema'dan Çek</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Address Card */}
      <TouchableOpacity
        style={styles.addressCard}
        onPress={copyAddress}
        activeOpacity={0.7}
      >
        <View style={styles.addressHeader}>
          <Text style={styles.addressLabel}>Cüzdan Adresi</Text>
          <Text style={styles.copyIcon}>{copied ? '✅' : '📋'}</Text>
        </View>
        <Text style={styles.addressShort}>
          {address ? shortenAddress(address) : '—'}
        </Text>
        <Text style={styles.addressFull}>{address}</Text>
        <Text style={styles.copyHint}>
          {copied ? 'Kopyalandı!' : 'Kopyalamak için dokun'}
        </Text>
      </TouchableOpacity>

      {/* Refresh Button */}
      <TouchableOpacity
        style={styles.refreshButton}
        onPress={refreshBalance}
        disabled={refreshing}
        activeOpacity={0.7}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.refreshButtonText}>🔄  Bakiyeyi Yenile</Text>
        )}
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>ℹ️  Burner Wallet</Text>
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
  /* Loading */
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 15,
  },
  /* Error */
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
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
    backgroundColor: 'rgba(131,110,249,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 32,
  },
  networkDot: {
    width: 8,
    height: 8,
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
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
  },
  balanceCurrency: {
    color: '#836EF9',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  /* İstanbulkart Price Card */
  priceCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    marginBottom: 16,
  },
  priceIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  priceContent: {
    flex: 1,
  },
  priceTitle: {
    color: '#AAA',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  fallbackBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  fallbackText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '600',
  },
  /* Yield Card */
  yieldCard: {
    width: '100%',
    backgroundColor: '#13131A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
    marginBottom: 12,
  },
  yieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  yieldIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  yieldTitle: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '700',
  },
  yieldBalance: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  yieldBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#1E1E2A',
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  yieldBarFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: 3,
  },
  yieldHint: {
    color: '#666',
    fontSize: 12,
    lineHeight: 18,
  },
  /* Yield Buttons */
  yieldButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  yieldButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  depositButton: {
    backgroundColor: '#16A34A',
  },
  withdrawButton: {
    backgroundColor: '#DC2626',
  },
  yieldButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  copyIcon: {
    fontSize: 18,
  },
  addressShort: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  addressFull: {
    color: '#555',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  copyHint: {
    color: '#836EF9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  /* Refresh Button */
  refreshButton: {
    width: '100%',
    backgroundColor: '#836EF9',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  /* Info */
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(131,110,249,0.08)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(131,110,249,0.15)',
  },
  infoTitle: {
    color: '#836EF9',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoText: {
    color: '#777',
    fontSize: 13,
    lineHeight: 20,
  },
});
