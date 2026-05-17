// ============================================================
// mobile/app/login.tsx — VERSION CORRIGÉE v3
// Corrections :
//  - Application.androidId → await Application.getAndroidId()
//    (API changée dans expo-application SDK 51+)
//  - Paramètre 'r' typé explicitement
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, SafeAreaView, Animated, Easing
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

const DEVICE_KEY   = 'nova_device_id';
const DEVICE_TABLE = 'admin_devices';
const MAX_FAILURES = 3;

// ─────────────────────────────────────────────────────────────
// UTILITAIRE : ID unique de l'appareil
// ✅ CORRECTION : getAndroidId() est maintenant async
// ─────────────────────────────────────────────────────────────
async function getDeviceId(): Promise<string> {
  try {
    // ✅ CORRIGÉ : était Application.androidId (n'existe plus)
    //              maintenant : await Application.getAndroidId()
    const androidId = await Application.getAndroidId();
    if (androidId) return `android_${androidId}`;

    // iOS fallback
    const appId   = Application.applicationId   ?? 'com.mlgroup.nova';
    const modelId = Device.modelId              ?? 'unknown';
    const osVer   = Device.osVersion            ?? '0';
    return `ios_${appId}_${modelId}_${osVer}`.replace(/[^a-zA-Z0-9_]/g, '_');
  } catch {
    return `fallback_${Date.now()}`;
  }
}

async function isDeviceAuthorized(deviceId: string): Promise<boolean> {
  const { data } = await supabase
    .from(DEVICE_TABLE)
    .select('id')
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .single();
  return !!data;
}

async function registerDevice(deviceId: string, deviceName: string): Promise<void> {
  const { error } = await supabase.from(DEVICE_TABLE).insert({
    device_id:     deviceId,
    device_name:   deviceName,
    is_active:     true,
    registered_at: new Date().toISOString()
  });
  if (error) throw new Error(`Enregistrement: ${error.message}`);
  await SecureStore.setItemAsync(DEVICE_KEY, deviceId);
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const [status, setStatus]             = useState<'checking' | 'ready' | 'first_init' | 'scanning' | 'error'>('checking');
  const [statusText, setStatusText]     = useState('Initialisation...');
  const [failureCount, setFailureCount] = useState(0);
  const [deviceId, setDeviceId]         = useState<string | null>(null);
  const [pulseAnim]                     = useState(new Animated.Value(1));

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => { initAuth(); }, []);

  const initAuth = async () => {
    setStatus('checking');
    setStatusText("Vérification de l'appareil...");
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        setStatus('error');
        setStatusText("Cet appareil ne supporte pas la biométrie.\nContacte ML Group.");
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Empreintes non configurées',
          'Va dans Paramètres → Sécurité → Empreintes digitales pour en ajouter.'
        );
        setStatus('error');
        setStatusText("Aucune empreinte dans les paramètres de l'appareil.");
        return;
      }

      // ✅ Await nécessaire car getDeviceId() est async
      const id = await getDeviceId();
      setDeviceId(id);

      const authorized = await isDeviceAuthorized(id);
      if (!authorized) {
        setStatus('first_init');
        setStatusText('Premier accès sur cet appareil');
      } else {
        setStatus('ready');
        setStatusText('Appuie sur le scanner pour te connecter');
        startPulse();
        setTimeout(() => triggerBiometric(id), 500);
      }
    } catch (err: unknown) {
      setStatus('error');
      setStatusText(`Erreur : ${String(err)}`);
    }
  };

  const handleFirstInit = async () => {
    if (!deviceId) return;
    setStatus('scanning');
    setStatusText('Valide ton identité pour activer cet appareil...');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Pose ton doigt pour activer NOVA sur cet appareil',
        fallbackLabel: 'Code PIN',
        cancelLabel:   'Annuler',
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setStatus('first_init');
        setStatusText('Authentification annulée. Réessaie.');
        return;
      }

      const name = `${Device.deviceName ?? Device.modelName ?? 'Appareil'} — ${new Date().toLocaleDateString('fr-FR')}`;
      await registerDevice(deviceId, name);
      setStatusText('✅ Appareil activé !');
      setTimeout(() => router.replace('/(tabs)/support'), 800);
    } catch (err: unknown) {
      setStatus('first_init');
      Alert.alert('Erreur', `Impossible d'enregistrer l'appareil :\n${String(err)}`);
    }
  };

  const triggerBiometric = async (id?: string) => {
    const currentId = id ?? deviceId;
    if (!currentId) return;

    setStatus('scanning');
    setStatusText('Scan en cours...');

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Connexion NOVA — ML Group',
        fallbackLabel: 'Code PIN',
        cancelLabel:   'Annuler',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const stillOk = await isDeviceAuthorized(currentId);
        if (!stillOk) {
          setStatus('error');
          setStatusText('Cet appareil a été révoqué.\nContacte ML Group.');
          return;
        }
        setStatus('ready');
        setStatusText('✅ Connexion réussie !');
        setTimeout(() => router.replace('/(tabs)/support'), 600);
      } else {
        const newCount = failureCount + 1;
        setFailureCount(newCount);

        if (newCount >= MAX_FAILURES) {
          setStatus('error');
          setStatusText(`${MAX_FAILURES} tentatives échouées.\nUtilise le code PIN.`);
          setTimeout(() => {
            LocalAuthentication.authenticateAsync({
              promptMessage: 'Code PIN — NOVA',
              disableDeviceFallback: false,
            }).then(r => { if (r.success) router.replace('/(tabs)/support'); });
          }, 1000);
        } else {
          setStatus('ready');
          setStatusText(`Échec (${newCount}/${MAX_FAILURES}). Réessaie.`);
          startPulse();
        }
      }
    } catch {
      setStatus('ready');
      setStatusText('Erreur biométrique. Réessaie.');
      startPulse();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoArea}>
        <Text style={styles.logoText}>✨ NOVA</Text>
        <Text style={styles.logoSub}>ML Group — Espace Admin</Text>
      </View>

      <View style={styles.scannerArea}>
        {status === 'checking' && <ActivityIndicator size="large" color="#22c55e" />}

        {(status === 'ready' || status === 'scanning') && (
          <TouchableOpacity onPress={() => triggerBiometric()} disabled={status === 'scanning'} activeOpacity={0.8}>
            <Animated.View style={[styles.fingerprintBtn, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.fingerprintIcon}>{status === 'scanning' ? '⏳' : '👆'}</Text>
            </Animated.View>
          </TouchableOpacity>
        )}

        {status === 'first_init' && (
          <View style={styles.initContainer}>
            <Text style={styles.initIcon}>🔐</Text>
            <Text style={styles.initTitle}>Premier accès</Text>
            <Text style={styles.initDesc}>
              Cet appareil n'est pas encore autorisé.{'\n'}
              Valide ton empreinte pour l'activer.{'\n\n'}
              Configure tes empreintes dans{'\n'}
              Paramètres → Sécurité (jusqu'à 5).
            </Text>
            <TouchableOpacity style={styles.activateBtn} onPress={handleFirstInit}>
              <Text style={styles.activateBtnText}>👆 Activer cet appareil</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⛔</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={initAuth}>
              <Text style={styles.retryBtnText}>🔄 Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[
        styles.statusText,
        status === 'error'    && styles.statusError,
        status === 'ready'    && styles.statusReady,
        status === 'scanning' && styles.statusScanning,
      ]}>
        {statusText}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60, paddingHorizontal: 24 },
  logoArea:    { alignItems: 'center', gap: 8 },
  logoText:    { fontSize: 42, fontWeight: '800', color: '#22c55e', letterSpacing: -1 },
  logoSub:     { color: '#64748b', fontSize: 14, letterSpacing: 1 },
  scannerArea: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  fingerprintBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#1e293b', borderWidth: 3, borderColor: '#22c55e', justifyContent: 'center', alignItems: 'center', shadowColor: '#22c55e', shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  fingerprintIcon: { fontSize: 56 },
  initContainer:   { alignItems: 'center', gap: 16, paddingHorizontal: 8 },
  initIcon:        { fontSize: 52 },
  initTitle:       { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  initDesc:        { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  activateBtn:     { backgroundColor: '#22c55e', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  activateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorContainer:  { alignItems: 'center', gap: 20 },
  errorIcon:       { fontSize: 52 },
  retryBtn:        { backgroundColor: '#334155', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText:    { color: '#94a3b8', fontWeight: '600' },
  statusText:      { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  statusError:     { color: '#ef4444' },
  statusReady:     { color: '#22c55e' },
  statusScanning:  { color: '#eab308' },
});
