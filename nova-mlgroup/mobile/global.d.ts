/// <reference types="expo/types" />

// ============================================================
// global.d.ts — Déclarations de types globaux
// Placé dans mobile/ à la racine
// ============================================================

// Fix : process.env disponible dans Expo
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
    EXPO_PUBLIC_BACKEND_URL: string;
    NODE_ENV: 'development' | 'production' | 'test';
    [key: string]: string | undefined;
  };
};

// Fix : __DEV__ global Expo/React Native
declare const __DEV__: boolean;
