import { getMonBalance } from '@/utils/monad';
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

  const initWallet = useCallback(async () => {
    try {
      setError(null);
      const wallet = await getOrCreateWallet();
      setAddress(wallet.address);
      const bal = await getMonBalance(wallet.address);
      setBalance(bal);
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
    marginBottom: 32,
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
