// ============================================================
// mobile/app/login.tsx
// Authentification biométrique (empreinte digitale)
// 
// Flux :
//  - 1ère ouverture → demande si biométrie disponible → enregistre l'appareil
//  - Ouvertures suivantes → prompt biométrique + vérification ID appareil
//  - Fallback PIN si biométrie échoue 3 fois
//
// Dépendances :
//   npx expo install expo-local-authentication expo-application expo-secure-store expo-device
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

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
const DEVICE_KEY   = 'nova_device_id';          // Clé SecureStore locale
const DEVICE_TABLE = 'admin_devices';            // Table Supabase
const MAX_FAILURES = 3;                          // Tentatives avant fallback PIN

// ─────────────────────────────────────────────────────────────
// UTILITAIRE : Générer un ID unique et stable pour l'appareil
// Android : Application.androidId (stable par app/appareil)
// iOS      : Application.applicationId + Device.modelId
// ─────────────────────────────────────────────────────────────
async function getDeviceId(): Promise<string> {
  try {
    const androidId = Application.androidId;
    if (androidId) return `android_${androidId}`;

    // iOS : pas d'androidId, on compose un identifiant
    const appId   = Application.applicationId  || 'com.mlgroup.nova';
    const modelId = Device.modelId             || 'unknown_model';
    const osVer   = Device.osVersion           || '0';
    return `ios_${appId}_${modelId}_${osVer}`.replace(/[^a-zA-Z0-9_]/g, '_');
  } catch {
    return `fallback_${Date.now()}`;
  }
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRE : Vérifier si cet appareil est déjà autorisé
// ─────────────────────────────────────────────────────────────
async function isDeviceAuthorized(deviceId: string): Promise<boolean> {
  const { data } = await supabase
    .from(DEVICE_TABLE)
    .select('id')
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .single();
  return !!data;
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRE : Enregistrer l'appareil dans Supabase
// ─────────────────────────────────────────────────────────────
async function registerDevice(deviceId: string, deviceName: string): Promise<void> {
  const { error } = await supabase.from(DEVICE_TABLE).insert({
    device_id:    deviceId,
    device_name:  deviceName,
    is_active:    true,
    registered_at: new Date().toISOString()
  });
  if (error) throw new Error(`Enregistrement appareil: ${error.message}`);

  // Sauvegarde locale chiffrée (SecureStore)
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

  // ── Animation pulsation du scanner ───────────────────────
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // ── Initialisation au montage ─────────────────────────────
  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    setStatus('checking');
    setStatusText('Vérification de l\'appareil...');

    try {
      // 1. Vérifier si la biométrie est disponible sur cet appareil
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        setStatus('error');
        setStatusText('Cet appareil ne supporte pas la biométrie.\nContacte ML Group pour configurer l\'accès.');
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Empreintes non configurées',
          'Tu dois d\'abord enregistrer tes empreintes dans les Paramètres de l\'appareil.\n\nParamètres → Sécurité → Empreintes digitales',
          [{ text: 'Compris', style: 'default' }]
        );
        setStatus('error');
        setStatusText('Aucune empreinte configurée\ndans les paramètres de l\'appareil.');
        return;
      }

      // 2. Récupérer l'ID de cet appareil
      const id = await getDeviceId();
      setDeviceId(id);

      // 3. Vérifier si l'appareil est déjà connu de Supabase
      const authorized = await isDeviceAuthorized(id);

      if (!authorized) {
        // Première initialisation : cet appareil n'est pas encore enregistré
        setStatus('first_init');
        setStatusText('Premier accès sur cet appareil');
      } else {
        // Appareil connu → prompt biométrique directement
        setStatus('ready');
        setStatusText('Appuie sur le scanner pour te connecter');
        startPulse();
        // Lance automatiquement le scan après 500ms
        setTimeout(() => triggerBiometric(id), 500);
      }

    } catch (err: any) {
      setStatus('error');
      setStatusText(`Erreur : ${err.message}`);
    }
  };

  // ── Enregistrement premier appareil ──────────────────────
  const handleFirstInit = async () => {
    if (!deviceId) return;
    setStatus('scanning');
    setStatusText('Valide ton identité pour activer cet appareil...');

    try {
      // Demande l'authentification biométrique pour confirmer
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

      // Enregistre l'appareil dans Supabase
      const name = `${Device.deviceName || Device.modelName || 'Appareil'} — ${new Date().toLocaleDateString('fr-FR')}`;
      await registerDevice(deviceId, name);

      // Connexion réussie !
      setStatusText('✅ Appareil activé !');
      setTimeout(() => router.replace('/(tabs)/support'), 800);

    } catch (err: any) {
      setStatus('first_init');
      Alert.alert('Erreur', `Impossible d'enregistrer l'appareil :\n${err.message}`);
    }
  };

  // ── Authentification biométrique normale ─────────────────
  const triggerBiometric = async (id?: string) => {
    const currentDeviceId = id || deviceId;
    if (!currentDeviceId) return;

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
        // Double vérification : l'appareil est toujours autorisé en BDD
        const stillAuthorized = await isDeviceAuthorized(currentDeviceId);
        if (!stillAuthorized) {
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
          setStatusText(`${MAX_FAILURES} tentatives échouées.\nUtilise le code PIN de l'appareil.`);
          // Relance avec fallback forcé
          setTimeout(() => {
            LocalAuthentication.authenticateAsync({
              promptMessage: 'Code PIN — NOVA',
              disableDeviceFallback: false,
            }).then(r => {
              if (r.success) router.replace('/(tabs)/support');
            });
          }, 1000);
        } else {
          setStatus('ready');
          setStatusText(`Échec (${newCount}/${MAX_FAILURES}). Réessaie.`);
          startPulse();
        }
      }

    } catch (err: any) {
      setStatus('ready');
      setStatusText('Erreur biométrique. Réessaie.');
      startPulse();
    }
  };

  // ── RENDU ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>

      {/* Logo */}
      <View style={styles.logoArea}>
        <Text style={styles.logoText}>✨ NOVA</Text>
        <Text style={styles.logoSub}>ML Group — Espace Admin</Text>
      </View>

      {/* Zone du scanner biométrique */}
      <View style={styles.scannerArea}>

        {status === 'checking' && (
          <ActivityIndicator size="large" color="#22c55e" />
        )}

        {(status === 'ready' || status === 'scanning') && (
          <TouchableOpacity
            onPress={() => triggerBiometric()}
            disabled={status === 'scanning'}
            activeOpacity={0.8}
          >
            <Animated.View style={[styles.fingerprintBtn, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.fingerprintIcon}>
                {status === 'scanning' ? '⏳' : '👆'}
              </Text>
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
              Assure-toi d'avoir configuré tes empreintes{'\n'}
              dans les Paramètres de l'appareil{'\n'}
              (jusqu'à 5 empreintes selon ton téléphone).
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

      {/* Texte de statut */}
      <Text style={[
        styles.statusText,
        status === 'error'   && styles.statusError,
        status === 'ready'   && styles.statusReady,
        status === 'scanning' && styles.statusScanning,
      ]}>
        {statusText}
      </Text>

      {/* Infos appareil (debug, visible uniquement en dev) */}
      {__DEV__ && deviceId && (
        <Text style={styles.devInfo}>DEV: {deviceId.slice(0, 30)}...</Text>
      )}

    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },

  // Logo
  logoArea:  { alignItems: 'center', gap: 8 },
  logoText:  { fontSize: 42, fontWeight: '800', color: '#22c55e', letterSpacing: -1 },
  logoSub:   { color: '#64748b', fontSize: 14, letterSpacing: 1 },

  // Zone scanner
  scannerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  // Bouton empreinte
  fingerprintBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  fingerprintIcon: { fontSize: 56 },

  // Premier enregistrement
  initContainer: { alignItems: 'center', gap: 16, paddingHorizontal: 8 },
  initIcon:      { fontSize: 52 },
  initTitle:     { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  initDesc:      { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  activateBtn:   { backgroundColor: '#22c55e', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  activateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Erreur
  errorContainer: { alignItems: 'center', gap: 20 },
  errorIcon:      { fontSize: 52 },
  retryBtn:       { backgroundColor: '#334155', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText:   { color: '#94a3b8', fontWeight: '600' },

  // Statut
  statusText:     { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  statusError:    { color: '#ef4444' },
  statusReady:    { color: '#22c55e' },
  statusScanning: { color: '#eab308' },

  // Dev
  devInfo: { color: '#334155', fontSize: 9, position: 'absolute', bottom: 8 },
});
