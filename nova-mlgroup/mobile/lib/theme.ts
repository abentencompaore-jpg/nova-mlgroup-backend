// ============================================================
// mobile/lib/theme.ts
// Système de design — Liquid Glass × AMOLED
// Inspiré iOS 26 Liquid Glass
// Noir profond #000000 + Blanc sale #F2EFE9
// ============================================================

export const Colors = {
  // ── Fonds AMOLED ─────────────────────────────────────────
  void:        '#000000',   // Noir absolu AMOLED (économie batterie max)
  deep:        '#06060A',   // Noir profond avec légère teinte bleue
  surface:     '#0D0D12',   // Surface principale
  elevated:    '#141419',   // Surface élevée

  // ── Verre (Glass morphism) ────────────────────────────────
  glass05:  'rgba(242, 239, 233, 0.04)',
  glass08:  'rgba(242, 239, 233, 0.07)',
  glass12:  'rgba(242, 239, 233, 0.11)',
  glass20:  'rgba(242, 239, 233, 0.18)',
  glassBorder: 'rgba(242, 239, 233, 0.10)',
  glassBorderBright: 'rgba(242, 239, 233, 0.20)',

  // ── Texte ─────────────────────────────────────────────────
  textPrimary:  '#F2EFE9',   // Blanc sale
  textSecondary:'rgba(242, 239, 233, 0.55)',
  textMuted:    'rgba(242, 239, 233, 0.30)',
  textDisabled: 'rgba(242, 239, 233, 0.18)',

  // ── Accentuation ─────────────────────────────────────────
  white:     '#FFFFFF',
  whiteGlow: 'rgba(255, 255, 255, 0.25)',

  // ── Statuts (lumineux sur AMOLED) ────────────────────────
  statusNew:      '#4ADE80',   // Vert
  statusProgress: '#FCD34D',   // Jaune
  statusPayment:  '#FB923C',   // Orange
  statusDone:     '#60A5FA',   // Bleu
  statusDispute:  '#F87171',   // Rouge

  // ── Urgences renouvellement ───────────────────────────────
  expired:  '#F87171',
  critical: '#FB923C',
  warning:  '#FCD34D',
  notice:   '#60A5FA',
  ok:       '#4ADE80',
};

export const Glass = {
  card: {
    backgroundColor: Colors.glass08,
    borderWidth:     1,
    borderColor:     Colors.glassBorder,
    borderRadius:    20,
  } as const,

  cardBright: {
    backgroundColor: Colors.glass12,
    borderWidth:     1,
    borderColor:     Colors.glassBorderBright,
    borderRadius:    20,
  } as const,

  pill: {
    backgroundColor: Colors.glass08,
    borderWidth:     1,
    borderColor:     Colors.glassBorder,
    borderRadius:    50,
  } as const,

  // Effet de glow blanc
  glow: {
    shadowColor:   '#FFFFFF',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius:  12,
    elevation:     8,
  } as const,

  glowStrong: {
    shadowColor:   '#FFFFFF',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius:  24,
    elevation:     16,
  } as const,
};

export const Typography = {
  hero:    { fontSize: 48, fontWeight: '800' as const, letterSpacing: -2,   color: Colors.textPrimary },
  h1:      { fontSize: 32, fontWeight: '700' as const, letterSpacing: -1.2, color: Colors.textPrimary },
  h2:      { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.8, color: Colors.textPrimary },
  h3:      { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.3, color: Colors.textPrimary },
  body:    { fontSize: 15, fontWeight: '400' as const, lineHeight: 22,      color: Colors.textPrimary },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.3,  color: Colors.textSecondary },
  micro:   { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.8,  color: Colors.textMuted },
  amount:  { fontSize: 36, fontWeight: '800' as const, letterSpacing: -1.5, color: Colors.textPrimary },
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40,
};

export const Radius = {
  sm: 10, md: 16, lg: 20, xl: 28, full: 999,
};

// Statuts conversations
export const STATUS_META = {
  new: {
    color: Colors.statusNew,
    bg:    'rgba(74, 222, 128, 0.10)',
    label: 'Nouveau',
    emoji: '●',
  },
  in_progress: {
    color: Colors.statusProgress,
    bg:    'rgba(252, 211, 77, 0.10)',
    label: 'En cours',
    emoji: '●',
  },
  awaiting_payment: {
    color: Colors.statusPayment,
    bg:    'rgba(251, 146, 60, 0.10)',
    label: 'Paiement',
    emoji: '●',
  },
  delivered: {
    color: Colors.statusDone,
    bg:    'rgba(96, 165, 250, 0.10)',
    label: 'Finalisée',
    emoji: '●',
  },
  disputed: {
    color: Colors.statusDispute,
    bg:    'rgba(248, 113, 113, 0.10)',
    label: 'Litige',
    emoji: '●',
  },
} as const;