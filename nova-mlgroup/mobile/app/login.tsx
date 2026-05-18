// ============================================================
// mobile/app/login.tsx — Liquid Glass × AMOLED
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, SafeAreaView, Alert, Dimensions
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Glass, Typography, Spacing } from '../lib/theme';

const { width, height } = Dimensions.get('window');
const DEVICE_KEY   = 'nova_device_id';
const DEVICE_TABLE = 'admin_devices';
const MAX_FAILURES = 3;

async function getDeviceId(): Promise<string> {
  try {
    const androidId = await Application.getAndroidId();
    if (androidId) return `android_${androidId}`;
    const appId   = Application.applicationId ?? 'com.mlgroup.nova';
    const modelId = Device.modelId ?? 'unknown';
    return `ios_${appId}_${modelId}`.replace(/[^a-zA-Z0-9_]/g, '_');
  } catch { return `fallback_${Date.now()}`; }
}

async function isDeviceAuthorized(deviceId: string): Promise<boolean> {
  const { data } = await supabase.from(DEVICE_TABLE).select('id')
    .eq('device_id', deviceId).eq('is_active', true).single();
  return !!data;
}

async function registerDevice(deviceId: string, name: string): Promise<void> {
  const { error } = await supabase.from(DEVICE_TABLE)
    .insert({ device_id: deviceId, device_name: name, is_active: true, registered_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await SecureStore.setItemAsync(DEVICE_KEY, deviceId);
}

// ── Orbe animée (fond décoratif) ─────────────────────────────
function FloatingOrb({ delay, size, x, y }: { delay: number; size: number; x: number; y: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 4000 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 4000 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const opacity    = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.04, 0.10, 0.04] });

  return (
    <Animated.View style={{
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: Colors.white,
      opacity, transform: [{ translateY }],
    }} />
  );
}

export default function LoginScreen() {
  const [status, setStatus]         = useState<'checking' | 'ready' | 'first_init' | 'scanning' | 'error'>('checking');
  const [statusText, setStatusText] = useState('Initialisation...');
  const [failures, setFailures]     = useState(0);
  const [deviceId, setDeviceId]     = useState<string | null>(null);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;
  const ringAnim   = useRef(new Animated.Value(1)).current;

  // Fade in au montage
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    initAuth();
  }, []);

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Ring ripple
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.4, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 1.0, duration: 0,    useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim, ringAnim]);

  const initAuth = async () => {
    setStatus('checking');
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        setStatus('error');
        setStatusText('Biométrie non disponible\nConfigure tes empreintes dans les Paramètres');
        return;
      }
      const id = await getDeviceId();
      setDeviceId(id);
      const authorized = await isDeviceAuthorized(id);
      if (!authorized) {
        setStatus('first_init');
        setStatusText('Premier accès — active cet appareil');
      } else {
        setStatus('ready');
        setStatusText('Pose ton doigt pour accéder');
        startPulse();
        setTimeout(() => triggerBiometric(id), 600);
      }
    } catch (err: unknown) {
      setStatus('error');
      setStatusText(`Erreur : ${String(err)}`);
    }
  };

  const handleFirstInit = async () => {
    if (!deviceId) return;
    setStatus('scanning');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Active NOVA sur cet appareil',
        fallbackLabel: 'Code PIN',
        cancelLabel:   'Annuler',
        disableDeviceFallback: false,
      });
      if (!result.success) { setStatus('first_init'); return; }
      const name = `${Device.deviceName ?? 'Appareil'} — ${new Date().toLocaleDateString('fr-FR')}`;
      await registerDevice(deviceId, name);
      setStatusText('Appareil activé');
      setTimeout(() => router.replace('/(tabs)/support'), 600);
    } catch (err: unknown) {
      setStatus('first_init');
      Alert.alert('Erreur', String(err));
    }
  };

  const triggerBiometric = async (id?: string) => {
    const cid = id ?? deviceId;
    if (!cid) return;
    setStatus('scanning');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Connexion NOVA',
        fallbackLabel: 'Code PIN',
        cancelLabel:   'Annuler',
        disableDeviceFallback: false,
      });
      if (result.success) {
        const ok = await isDeviceAuthorized(cid);
        if (!ok) { setStatus('error'); setStatusText('Appareil révoqué'); return; }
        setStatusText('Accès accordé');
        setTimeout(() => router.replace('/(tabs)/support'), 400);
      } else {
        const n = failures + 1;
        setFailures(n);
        if (n >= MAX_FAILURES) {
          setStatus('error');
          setStatusText('Trop de tentatives');
        } else {
          setStatus('ready');
          setStatusText(`Échec ${n}/${MAX_FAILURES} — Réessaie`);
          startPulse();
        }
      }
    } catch {
      setStatus('ready');
      setStatusText('Erreur — Réessaie');
      startPulse();
    }
  };

  // ── Couleur du statut ─────────────────────────────────────
  const dotColor = status === 'error' ? Colors.statusDispute
    : status === 'scanning'           ? Colors.statusProgress
    : status === 'ready'              ? Colors.statusNew
    : Colors.textMuted;

  return (
    <View style={styles.root}>

      {/* Fond AMOLED avec orbes flottantes */}
      <FloatingOrb delay={0}    size={300} x={-80}  y={-60}  />
      <FloatingOrb delay={800}  size={200} x={width - 120} y={height * 0.3} />
      <FloatingOrb delay={1600} size={150} x={width * 0.3} y={height * 0.7} />

      <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView style={styles.safe}>

          {/* Logo */}
          <View style={styles.logoArea}>
            <Text style={styles.logoText}>NOVA</Text>
            <View style={styles.logoUnderline} />
            <Text style={styles.logoSub}>ML GROUP · ADMIN</Text>
          </View>

          {/* Zone centrale */}
          <View style={styles.centerArea}>

            {/* Bouton biométrique */}
            {(status === 'ready' || status === 'scanning' || status === 'first_init') && (
              <View style={styles.biometricContainer}>

                {/* Anneau ripple */}
                <Animated.View style={[styles.ring, {
                  transform:   [{ scale: ringAnim }],
                  borderColor: dotColor + '20',
                }]} />

                {/* Bouton principal */}
                <TouchableOpacity
                  onPress={() => status === 'first_init' ? handleFirstInit() : triggerBiometric()}
                  activeOpacity={0.85}
                  disabled={status === 'scanning'}
                >
                  <Animated.View style={[styles.biometricBtn, {
                    transform:   [{ scale: pulseAnim }],
                    borderColor: dotColor + '40',
                    shadowColor: dotColor,
                  }]}>
                    {/* Cercle intérieur en verre */}
                    <View style={[styles.biometricInner, { backgroundColor: dotColor + '12' }]}>
                      <Text style={[styles.biometricIcon, { color: dotColor }]}>
                        {status === 'scanning' ? '◌' : status === 'first_init' ? '◎' : '⊕'}
                      </Text>
                    </View>
                  </Animated.View>
                </TouchableOpacity>

                {/* Label action */}
                <Text style={[styles.actionLabel, { color: dotColor }]}>
                  {status === 'first_init' ? 'ACTIVER CET APPAREIL'
                    : status === 'scanning' ? 'VÉRIFICATION...'
                    : 'TOUCHER POUR ACCÉDER'}
                </Text>
              </View>
            )}

            {/* État checking */}
            {status === 'checking' && (
              <View style={styles.checkingContainer}>
                <Text style={styles.checkingText}>◌</Text>
              </View>
            )}

            {/* État erreur */}
            {status === 'error' && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⊗</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={initAuth}>
                  <Text style={styles.retryText}>RÉESSAYER</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>

          {/* Statut en bas */}
          <View style={styles.bottomArea}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              <Text style={[styles.statusText, { color: dotColor }]}>{statusText}</Text>
            </View>
            <Text style={styles.version}>NOVA v1.0 · Sécurisé</Text>
          </View>

        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.void,
  },
  container: { flex: 1 },
  safe:      { flex: 1, paddingHorizontal: 32 },

  // Logo
  logoArea: {
    paddingTop:  80,
    alignItems: 'center',
    gap:         8,
  },
  logoText: {
    fontSize:      52,
    fontWeight:   '800',
    color:         Colors.textPrimary,
    letterSpacing: -3,
  },
  logoUnderline: {
    width:           40,
    height:          2,
    backgroundColor: Colors.textPrimary,
    borderRadius:    1,
    opacity:         0.6,
  },
  logoSub: {
    fontSize:      10,
    fontWeight:   '600',
    color:         Colors.textMuted,
    letterSpacing: 4,
    marginTop:     4,
  },

  // Centre
  centerArea: {
    flex:            1,
    justifyContent: 'center',
    alignItems:     'center',
  },

  biometricContainer: {
    alignItems: 'center',
    gap:        24,
  },

  ring: {
    position:     'absolute',
    width:        160,
    height:       160,
    borderRadius: 80,
    borderWidth:  1,
  },

  biometricBtn: {
    width:        130,
    height:       130,
    borderRadius: 65,
    borderWidth:  1,
    ...Glass.glow,
    justifyContent: 'center',
    alignItems:     'center',
    backgroundColor: Colors.glass05,
  },

  biometricInner: {
    width:          100,
    height:         100,
    borderRadius:   50,
    justifyContent: 'center',
    alignItems:     'center',
  },

  biometricIcon: {
    fontSize:   42,
  },

  actionLabel: {
    fontSize:      10,
    fontWeight:   '700',
    letterSpacing: 3,
    marginTop:     8,
  },

  checkingContainer: {
    alignItems: 'center',
  },
  checkingText: {
    fontSize:  48,
    color:     Colors.textMuted,
  },

  errorContainer: {
    alignItems: 'center',
    gap:        20,
  },
  errorIcon: {
    fontSize: 48,
    color:    Colors.statusDispute,
  },
  retryBtn: {
    ...Glass.pill,
    paddingHorizontal: 28,
    paddingVertical:   12,
  },
  retryText: {
    fontSize:      10,
    fontWeight:   '700',
    letterSpacing: 3,
    color:         Colors.textSecondary,
  },

  // Bas de l'écran
  bottomArea: {
    paddingBottom: 48,
    alignItems:   'center',
    gap:           12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:   'center',
    gap:           8,
  },
  statusDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },
  statusText: {
    fontSize:      12,
    fontWeight:   '500',
    letterSpacing: 0.5,
  },
  version: {
    fontSize:  10,
    color:     Colors.textDisabled,
    letterSpacing: 1,
  },
});
