import { useMainWallet } from '@/contexts/MainWalletContext';
import { useNfcStatus } from '@/hooks/useNfcStatus';
import { sweepFromVault } from '@/utils/monad';
import { startNfcBroadcast, startNfcRead, stopNfc } from '@/utils/nfc';
import type { PaymentStep } from '@/utils/payment';
import { executePayment } from '@/utils/payment';
import { getPrivateKey } from '@/utils/wallet';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	Vibration,
	View,
} from 'react-native';
import 'react-native-get-random-values';
import QRCode from 'react-native-qrcode-svg';
import type { Address } from 'viem';

// ─── Types ───
type PaymentMode = 'idle' | 'receive' | 'send' | 'processing' | 'done';

export default function PaymentScreen() {
	const { mainWalletAddress, connectMainWallet, disconnectMainWallet } = useMainWallet();
	const { nfcEnabled, nfcSupported, openNfcSettings } = useNfcStatus();

	// ─── State ───
	const [mode, setMode] = useState<PaymentMode>('idle');
	const [nfcBroadcasting, setNfcBroadcasting] = useState(false);
	const [targetAddress, setTargetAddress] = useState<Address | null>(null);
	const [paymentSteps, setPaymentSteps] = useState<PaymentStep[]>([]);
	const [showConnectModal, setShowConnectModal] = useState(false);
	const [addressInput, setAddressInput] = useState('');
	const [showScanner, setShowScanner] = useState(false);
	const [permission, requestPermission] = useCameraPermissions();
	const scanProcessedRef = useRef(false);

	// Nema (Yield) bakiyesi - basit mock state
	const [yieldBalance, setYieldBalance] = useState(0);

	// ─── Ana Cüzdan Bağlantısı ───
	const handleConnectWallet = useCallback(() => {
		setShowConnectModal(true);
		setAddressInput(mainWalletAddress ?? '');
	}, [mainWalletAddress]);

	const handlePasteAddress = useCallback(async () => {
		const text = await Clipboard.getStringAsync();
		if (text && /^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
			setAddressInput(text.trim());
		} else {
			Alert.alert('Geçersiz Pano', 'Panodaki metin geçerli bir Ethereum adresi değil.');
		}
	}, []);

	const handleSaveAddress = useCallback(async () => {
		const addr = addressInput.trim();
		if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
			Alert.alert('Geçersiz Adres', 'Lütfen geçerli bir Ethereum adresi girin (0x...)');
			return;
		}
		await connectMainWallet(addr as Address);
		setShowConnectModal(false);
		Alert.alert('Başarılı', 'Ana cüzdan bağlandı!');
	}, [addressInput, connectMainWallet]);

	const handleDisconnect = useCallback(async () => {
		await disconnectMainWallet();
		setShowConnectModal(false);
	}, [disconnectMainWallet]);

	// ─── Ödeme Al (Receive) ───
	const handleReceive = useCallback(async () => {
		if (!mainWalletAddress) {
			Alert.alert('Cüzdan Gerekli', 'Önce ana Metamask cüzdanınızı bağlayın.');
			return;
		}
		setMode('receive');

		// NFC HCE'yi arka planda dene
		if (nfcEnabled) {
			setNfcBroadcasting(true);
			const success = await startNfcBroadcast(mainWalletAddress);
			if (!success) {
				setNfcBroadcasting(false);
				console.log('📱 [Receive] NFC HCE başarısız, sadece QR Code gösteriliyor');
			}
		}
		// Her durumda QR Code ekranda gösteriliyor
	}, [mainWalletAddress, nfcEnabled]);

	const handleStopReceive = useCallback(async () => {
		await stopNfc();
		setNfcBroadcasting(false);
		setMode('idle');
	}, []);

	// ─── Ödeme Yap (Send) — NFC veya QR okuma ───
	const handleSend = useCallback(async () => {
		if (!mainWalletAddress) {
			Alert.alert('Cüzdan Gerekli', 'Önce ana Metamask cüzdanınızı bağlayın.');
			return;
		}
		setMode('send');
		setTargetAddress(null);
		scanProcessedRef.current = false;

		// Önce NFC okumayı dene
		if (nfcEnabled) {
			const addr = await startNfcRead();
			if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
				Vibration.vibrate(200);
				setTargetAddress(addr as Address);
				handleStartPayment(addr as Address);
				return;
			}
		}

		// NFC bulunamazsa QR Scanner'ı aç
		if (!permission?.granted) {
			const result = await requestPermission();
			if (!result.granted) {
				Alert.alert('Kamera İzni', 'QR kod okumak için kamera izni gereklidir.');
				setMode('idle');
				return;
			}
		}
		setShowScanner(true);
	}, [mainWalletAddress, nfcEnabled, permission, requestPermission]);

	// QR Code okunduğunda
	const handleBarCodeScanned = useCallback(
		(result: { data: string }) => {
			if (scanProcessedRef.current) return;
			const data = result.data;
			// ethereum: prefix'ini temizle
			const addr = data.replace(/^ethereum:/i, '').split('@')[0];

			if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
				scanProcessedRef.current = true;
				Vibration.vibrate(200);
				setTargetAddress(addr as Address);
				setShowScanner(false);
				handleStartPayment(addr as Address);
			}
		},
		[]
	);

	// ─── Ödeme Akışını Başlat ───
	const handleStartPayment = useCallback(
		async (target: Address) => {
			setMode('processing');
			setPaymentSteps([]);

			const privateKey = await getPrivateKey();
			if (!privateKey) {
				Alert.alert('Hata', 'Burner cüzdan bulunamadı!');
				setMode('idle');
				return;
			}

			if (!mainWalletAddress) {
				Alert.alert('Hata', 'Ana cüzdan bağlı değil!');
				setMode('idle');
				return;
			}

			const onProgress = (step: PaymentStep) => {
				setPaymentSteps((prev) => {
					// Aynı step tipinin son halini güncelle
					const existing = prev.findIndex((s) => s.step === step.step);
					if (existing >= 0) {
						const copy = [...prev];
						copy[existing] = step;
						return copy;
					}
					return [...prev, step];
				});
			};

			const onWithdrawFromYield = async (_amount: number) => {
				if (!mainWalletAddress || !privateKey) return;
				const result = await sweepFromVault(privateKey, mainWalletAddress);
				if (result.success) {
					setYieldBalance(0);
				}
			};

			const result = await executePayment(
				target,
				50, // 50 TL
				privateKey,
				mainWalletAddress,
				yieldBalance,
				onWithdrawFromYield,
				onProgress
			);

			if (result.success) {
				setMode('done');
			} else {
				Alert.alert('Ödeme Başarısız', result.error ?? 'Bilinmeyen hata');
				setMode('idle');
			}
		},
		[mainWalletAddress, yieldBalance]
	);

	const handleReset = useCallback(() => {
		setMode('idle');
		setTargetAddress(null);
		setPaymentSteps([]);
	}, []);

	const shortenAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

	// ─── Render ───
	return (
		<ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
			{/* Header */}
			<Text style={styles.headerTitle}>P2P Ödeme</Text>
			<Text style={styles.headerSubtitle}>NFC veya QR ile anında kripto transferi</Text>

			{/* Ana Cüzdan Durumu */}
			<TouchableOpacity style={styles.walletCard} onPress={handleConnectWallet} activeOpacity={0.7}>
				<View style={styles.walletCardInner}>
					<View style={styles.walletIconContainer}>
						<Text style={styles.walletIcon}>{mainWalletAddress ? '🦊' : '🔗'}</Text>
					</View>
					<View style={styles.walletInfo}>
						<Text style={styles.walletLabel}>
							{mainWalletAddress ? 'Ana Cüzdan Bağlı' : 'Ana Cüzdan Bağla'}
						</Text>
						<Text style={styles.walletAddress}>
							{mainWalletAddress ? shortenAddr(mainWalletAddress) : 'Metamask adresinizi bağlayın'}
						</Text>
					</View>
					<View
						style={[styles.walletStatus, mainWalletAddress ? styles.walletConnected : styles.walletDisconnected]}
					>
						<Text style={styles.walletStatusText}>{mainWalletAddress ? '●' : '○'}</Text>
					</View>
				</View>
			</TouchableOpacity>

			{/* NFC Durum Badge */}
			<View style={styles.nfcBadge}>
				<View style={[styles.nfcDot, nfcEnabled ? styles.nfcDotActive : styles.nfcDotInactive]} />
				<Text style={styles.nfcText}>
					NFC: {nfcEnabled ? 'Aktif' : nfcSupported ? 'Kapalı' : 'Mevcut Değil'} • QR: Aktif
				</Text>
				{nfcSupported && !nfcEnabled && (
					<TouchableOpacity style={styles.nfcSettingsButton} onPress={openNfcSettings} activeOpacity={0.7}>
						<Text style={styles.nfcSettingsText}>NFC'yi Aç</Text>
					</TouchableOpacity>
				)}
			</View>

			{/* ─── IDLE: Ödeme Butonları ─── */}
			{mode === 'idle' && (
				<View style={styles.actionButtons}>
					<TouchableOpacity style={styles.receiveButton} onPress={handleReceive} activeOpacity={0.7}>
						<Text style={styles.actionButtonIcon}>📥</Text>
						<Text style={styles.actionButtonTitle}>Ödeme Al</Text>
						<Text style={styles.actionButtonSubtitle}>NFC / QR ile adresinizi paylaşın</Text>
					</TouchableOpacity>

					<TouchableOpacity style={styles.sendButton} onPress={handleSend} activeOpacity={0.7}>
						<Text style={styles.actionButtonIcon}>📤</Text>
						<Text style={styles.actionButtonTitle}>Ödeme Yap</Text>
						<Text style={styles.actionButtonSubtitle}>NFC / QR ile 50 TL gönderin</Text>
					</TouchableOpacity>
				</View>
			)}

			{/* ─── RECEIVE: QR Code + NFC Yayını ─── */}
			{mode === 'receive' && mainWalletAddress && (
				<View style={styles.receiveContainer}>
					<Text style={styles.sectionTitle}>Ödeme Al</Text>

					{nfcBroadcasting && (
						<View style={styles.nfcActiveCard}>
							<ActivityIndicator size="small" color="#4ADE80" />
							<Text style={styles.nfcActiveText}>NFC yayını aktif — telefonunuzu yaklaştırın</Text>
						</View>
					)}

					<View style={styles.qrContainer}>
						<View style={styles.qrBackground}>
							<QRCode
								value={mainWalletAddress}
								size={220}
								backgroundColor="#FFFFFF"
								color="#000000"
							/>
						</View>
						<Text style={styles.qrLabel}>Ana Cüzdan Adresiniz</Text>
						<Text style={styles.qrAddress}>{shortenAddr(mainWalletAddress)}</Text>
					</View>

					<TouchableOpacity style={styles.stopButton} onPress={handleStopReceive} activeOpacity={0.7}>
						<Text style={styles.stopButtonText}>Yayını Durdur</Text>
					</TouchableOpacity>
				</View>
			)}

			{/* ─── SEND: Adres Aranıyor ─── */}
			{mode === 'send' && !targetAddress && !showScanner && (
				<View style={styles.sendContainer}>
					<ActivityIndicator size="large" color="#836EF9" />
					<Text style={styles.searchText}>Karşı tarafın NFC yayını aranıyor...</Text>
					<TouchableOpacity
						style={styles.cancelButton}
						onPress={() => {
							stopNfc();
							setMode('idle');
						}}
						activeOpacity={0.7}
					>
						<Text style={styles.cancelButtonText}>İptal</Text>
					</TouchableOpacity>
				</View>
			)}

			{/* ─── PROCESSING: Ödeme Akışı ─── */}
			{(mode === 'processing' || mode === 'done') && (
				<View style={styles.processingContainer}>
					<Text style={styles.sectionTitle}>
						{mode === 'done' ? '🎉 İşlem Tamamlandı' : '⏳ Ödeme İşleniyor'}
					</Text>

					{targetAddress && (
						<View style={styles.targetCard}>
							<Text style={styles.targetLabel}>Hedef Adres</Text>
							<Text style={styles.targetAddress}>{shortenAddr(targetAddress)}</Text>
						</View>
					)}

					{/* Adım adım progress */}
					<View style={styles.stepsList}>
						{paymentSteps.map((step, i) => (
							<View key={`${step.step}-${i}`} style={styles.stepItem}>
								<View
									style={[
										styles.stepDot,
										step.step === 'error'
											? styles.stepDotError
											: step.step === 'done'
												? styles.stepDotDone
												: styles.stepDotActive,
									]}
								/>
								<View style={styles.stepContent}>
									<Text style={styles.stepMessage}>{step.message}</Text>
									{step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
								</View>
							</View>
						))}
					</View>

					{mode === 'processing' && (
						<ActivityIndicator size="small" color="#836EF9" style={{ marginTop: 16 }} />
					)}

					{mode === 'done' && (
						<TouchableOpacity style={styles.doneButton} onPress={handleReset} activeOpacity={0.7}>
							<Text style={styles.doneButtonText}>Tamam</Text>
						</TouchableOpacity>
					)}
				</View>
			)}

			{/* ─── Connect Wallet Modal ─── */}
			<Modal visible={showConnectModal} transparent animationType="slide">
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Ana Cüzdanı Belirle</Text>
						<Text style={styles.modalSubtitle}>Kriptoları çekeceğiniz adresi girin</Text>

						<View style={styles.inputContainer}>
							<TextInput
								style={styles.addressInputField}
								placeholder="0x..."
								placeholderTextColor="#555"
								value={addressInput}
								onChangeText={setAddressInput}
								autoCapitalize="none"
								autoCorrect={false}
							/>
							<TouchableOpacity
								style={styles.pasteButton}
								onPress={handlePasteAddress}
								activeOpacity={0.7}
							>
								<Text style={styles.pasteButtonText}>📋 Yapıştır</Text>
							</TouchableOpacity>
						</View>

						<TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveAddress} activeOpacity={0.7}>
							<Text style={styles.modalSaveButtonText}>Değişiklikleri Kaydet</Text>
						</TouchableOpacity>

						{mainWalletAddress && (
							<TouchableOpacity style={styles.modalDisconnectButton} onPress={handleDisconnect} activeOpacity={0.7}>
								<Text style={styles.modalDisconnectText}>Cüzdanı Kaldır</Text>
							</TouchableOpacity>
						)}

						<TouchableOpacity
							style={styles.modalCancelButton}
							onPress={() => setShowConnectModal(false)}
							activeOpacity={0.7}
						>
							<Text style={styles.modalCancelText}>İptal</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* ─── QR Scanner Modal ─── */}
			<Modal visible={showScanner} transparent={false} animationType="slide">
				<View style={styles.scannerContainer}>
					<CameraView
						style={styles.camera}
						facing="back"
						barcodeScannerSettings={{
							barcodeTypes: ['qr'],
						}}
						onBarcodeScanned={handleBarCodeScanned}
					/>
					<View style={styles.scannerOverlay}>
						<View style={styles.scannerFrame} />
					</View>
					<View style={styles.scannerBottom}>
						<Text style={styles.scannerHint}>QR kodu kare içine hizalayın</Text>
						<TouchableOpacity
							style={styles.scannerCancelButton}
							onPress={() => {
								setShowScanner(false);
								setMode('idle');
							}}
							activeOpacity={0.7}
						>
							<Text style={styles.scannerCancelText}>İptal</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>
		</ScrollView>
	);
}

// ─── Styles ───
const styles = StyleSheet.create({
	container: {
		flexGrow: 1,
		backgroundColor: '#0A0A0F',
		paddingHorizontal: 20,
		paddingTop: 60,
		paddingBottom: 40,
	},

	headerTitle: {
		color: '#FFFFFF',
		fontSize: 28,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 4,
	},
	headerSubtitle: {
		color: '#666',
		fontSize: 14,
		textAlign: 'center',
		marginBottom: 24,
	},

	// Wallet Card
	walletCard: {
		backgroundColor: '#13131A',
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: '#1E1E2A',
		marginBottom: 16,
	},
	walletCardInner: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	walletIconContainer: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: '#1A1A26',
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 12,
	},
	walletIcon: {
		fontSize: 22,
	},
	walletInfo: {
		flex: 1,
	},
	walletLabel: {
		color: '#CCCCCC',
		fontSize: 14,
		fontWeight: '700',
		marginBottom: 2,
	},
	walletAddress: {
		color: '#666',
		fontSize: 12,
		fontFamily: 'monospace',
	},
	walletStatus: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	walletConnected: {
		backgroundColor: 'rgba(74,222,128,0.15)',
	},
	walletDisconnected: {
		backgroundColor: 'rgba(255,107,107,0.1)',
	},
	walletStatusText: {
		fontSize: 10,
		color: '#4ADE80',
	},

	// NFC Badge
	nfcBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 24,
		gap: 6,
	},
	nfcDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	nfcDotActive: { backgroundColor: '#4ADE80' },
	nfcDotInactive: { backgroundColor: '#555' },
	nfcText: {
		color: '#666',
		fontSize: 12,
		fontWeight: '500',
	},
	nfcSettingsButton: {
		backgroundColor: 'rgba(131,110,249,0.15)',
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderRadius: 8,
		marginLeft: 4,
	},
	nfcSettingsText: {
		color: '#836EF9',
		fontSize: 11,
		fontWeight: '700',
	},

	// Action Buttons
	actionButtons: {
		gap: 12,
	},
	receiveButton: {
		backgroundColor: '#13131A',
		borderRadius: 16,
		padding: 24,
		borderWidth: 1,
		borderColor: 'rgba(74,222,128,0.2)',
		alignItems: 'center',
	},
	sendButton: {
		backgroundColor: '#13131A',
		borderRadius: 16,
		padding: 24,
		borderWidth: 1,
		borderColor: 'rgba(131,110,249,0.2)',
		alignItems: 'center',
	},
	actionButtonIcon: {
		fontSize: 32,
		marginBottom: 8,
	},
	actionButtonTitle: {
		color: '#FFFFFF',
		fontSize: 18,
		fontWeight: '800',
		marginBottom: 4,
	},
	actionButtonSubtitle: {
		color: '#666',
		fontSize: 13,
	},

	// Receive
	receiveContainer: {
		alignItems: 'center',
	},
	sectionTitle: {
		color: '#FFFFFF',
		fontSize: 22,
		fontWeight: '800',
		marginBottom: 16,
		textAlign: 'center',
	},
	nfcActiveCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		backgroundColor: 'rgba(74,222,128,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(74,222,128,0.2)',
		borderRadius: 12,
		paddingVertical: 10,
		paddingHorizontal: 16,
		marginBottom: 20,
	},
	nfcActiveText: {
		color: '#4ADE80',
		fontSize: 13,
		fontWeight: '600',
	},
	qrContainer: {
		alignItems: 'center',
		marginBottom: 24,
	},
	qrBackground: {
		backgroundColor: '#FFFFFF',
		borderRadius: 20,
		padding: 20,
		marginBottom: 16,
	},
	qrLabel: {
		color: '#888',
		fontSize: 12,
		marginBottom: 4,
	},
	qrAddress: {
		color: '#FFFFFF',
		fontSize: 16,
		fontWeight: '700',
		fontFamily: 'monospace',
	},
	stopButton: {
		backgroundColor: '#1A1A26',
		borderWidth: 1,
		borderColor: '#FF6B6B',
		borderRadius: 14,
		paddingVertical: 14,
		paddingHorizontal: 48,
	},
	stopButtonText: {
		color: '#FF6B6B',
		fontSize: 15,
		fontWeight: '700',
	},

	// Send
	sendContainer: {
		alignItems: 'center',
		paddingVertical: 40,
	},
	searchText: {
		color: '#888',
		fontSize: 14,
		marginTop: 16,
		marginBottom: 24,
	},
	cancelButton: {
		paddingVertical: 12,
		paddingHorizontal: 32,
	},
	cancelButtonText: {
		color: '#FF6B6B',
		fontSize: 14,
		fontWeight: '600',
	},

	// Processing
	processingContainer: {
		alignItems: 'center',
	},
	targetCard: {
		backgroundColor: '#13131A',
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: '#1E1E2A',
		alignItems: 'center',
		width: '100%',
		marginBottom: 20,
	},
	targetLabel: {
		color: '#666',
		fontSize: 12,
		marginBottom: 4,
	},
	targetAddress: {
		color: '#FFFFFF',
		fontSize: 18,
		fontWeight: '700',
		fontFamily: 'monospace',
	},

	// Steps
	stepsList: {
		width: '100%',
		gap: 12,
		paddingHorizontal: 4,
	},
	stepItem: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
	},
	stepDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginTop: 4,
	},
	stepDotActive: { backgroundColor: '#836EF9' },
	stepDotDone: { backgroundColor: '#4ADE80' },
	stepDotError: { backgroundColor: '#FF6B6B' },
	stepContent: {
		flex: 1,
	},
	stepMessage: {
		color: '#CCCCCC',
		fontSize: 14,
		fontWeight: '600',
	},
	stepDetail: {
		color: '#666',
		fontSize: 12,
		marginTop: 2,
	},

	doneButton: {
		backgroundColor: '#836EF9',
		borderRadius: 14,
		paddingVertical: 15,
		paddingHorizontal: 48,
		marginTop: 24,
	},
	doneButtonText: {
		color: '#FFFFFF',
		fontSize: 16,
		fontWeight: '700',
	},

	// Connect Modal
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.8)',
		justifyContent: 'flex-end',
	},
	modalContent: {
		backgroundColor: '#13131A',
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		padding: 24,
		paddingBottom: 40,
		borderWidth: 1,
		borderColor: '#1E1E2A',
	},
	modalTitle: {
		color: '#FFFFFF',
		fontSize: 20,
		fontWeight: '800',
		marginBottom: 4,
		textAlign: 'center',
	},
	modalSubtitle: {
		color: '#666',
		fontSize: 13,
		textAlign: 'center',
		marginBottom: 20,
	},
	inputContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginBottom: 20,
	},
	addressInputField: {
		flex: 1,
		backgroundColor: 'rgba(255,255,255,0.05)',
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#2A2A3E',
		color: '#FFF',
		fontSize: 14,
		fontFamily: 'monospace',
		padding: 14,
	},
	pasteButton: {
		backgroundColor: 'rgba(131,110,249,0.15)',
		borderWidth: 1,
		borderColor: 'rgba(131,110,249,0.3)',
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pasteButtonText: {
		color: '#836EF9',
		fontSize: 14,
		fontWeight: '600',
	},
	modalSaveButton: {
		backgroundColor: '#1A1A26',
		borderRadius: 14,
		borderWidth: 1,
		borderColor: '#836EF9',
		paddingVertical: 15,
		alignItems: 'center',
		marginBottom: 10,
	},
	modalSaveButtonText: {
		color: '#836EF9',
		fontSize: 16,
		fontWeight: '700',
	},
	modalDisconnectButton: {
		paddingVertical: 12,
		alignItems: 'center',
	},
	modalDisconnectText: {
		color: '#FF6B6B',
		fontSize: 14,
		fontWeight: '600',
	},
	modalCancelButton: {
		paddingVertical: 12,
		alignItems: 'center',
	},
	modalCancelText: {
		color: '#666',
		fontSize: 14,
	},

	// QR Scanner
	scannerContainer: {
		flex: 1,
		backgroundColor: '#000',
	},
	camera: {
		flex: 1,
	},
	scannerOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
	},
	scannerFrame: {
		width: 250,
		height: 250,
		borderWidth: 2,
		borderColor: '#836EF9',
		borderRadius: 20,
		backgroundColor: 'transparent',
	},
	scannerBottom: {
		position: 'absolute',
		bottom: 60,
		left: 0,
		right: 0,
		alignItems: 'center',
	},
	scannerHint: {
		color: '#FFFFFF',
		fontSize: 14,
		marginBottom: 16,
	},
	scannerCancelButton: {
		backgroundColor: 'rgba(255,255,255,0.15)',
		borderRadius: 14,
		paddingVertical: 12,
		paddingHorizontal: 36,
	},
	scannerCancelText: {
		color: '#FFFFFF',
		fontSize: 15,
		fontWeight: '600',
	},
});
