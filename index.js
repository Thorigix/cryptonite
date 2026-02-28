console.log("🚀 [BOOT] Adım 1: Başlıyor...");
require('react-native-get-random-values');
console.log("🚀 [BOOT] Adım 2: random-values tamam.");

require('fast-text-encoding');
console.log("🚀 [BOOT] Adım 3: text-encoding tamam.");

const { Buffer } = require('buffer');
global.Buffer = global.Buffer || Buffer;
console.log("🚀 [BOOT] Adım 4: Buffer tamam.");

console.log("🚀 [BOOT] Adım 5: Expo Router çağrılıyor...");
require('expo-router/entry');
