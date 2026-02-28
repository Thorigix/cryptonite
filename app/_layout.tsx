import { MainWalletProvider } from '@/contexts/MainWalletContext';
import '@/utils/web3config';
import { wagmiConfig } from '@/utils/web3config';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Web3Modal } from '@web3modal/wagmi-react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'fast-text-encoding';
import 'react-native-reanimated';
import { WagmiProvider } from 'wagmi';
import '../shim';

import { useColorScheme } from '@/hooks/use-color-scheme';

const queryClient = new QueryClient();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MainWalletProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
          <Web3Modal />
        </MainWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
