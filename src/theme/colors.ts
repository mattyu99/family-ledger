export interface ThemeColors {
  background: {
    canvas: string;
    card: string;
    cardSubtle: string;
    input: string;
    modal: string;
    overlay: string;
    root: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  border: {
    default: string;
    subtle: string;
    strong: string;
  };
  brand: {
    primary: string;
    primarySubtle: string;
    primaryBorder: string;
  };
  status: {
    income: string;
    incomeBg: string;
    incomeBorder: string;
    expense: string;
    expenseBg: string;
    expenseBorder: string;
    warning: string;
    warningBg: string;
    info: string;
    infoBg: string;
    purple: string;
    purpleBg: string;
  };
}

export const lightColors: ThemeColors = {
  background: {
    canvas: '#F8FAFC',
    card: '#FFFFFF',
    cardSubtle: '#F1F5F9',
    input: '#FFFFFF',
    modal: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.45)',
    root: '#F1F5F9',
  },
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
  },
  border: {
    default: '#E2E8F0',
    subtle: '#F1F5F9',
    strong: '#CBD5E1',
  },
  brand: {
    primary: '#EC4899',
    primarySubtle: '#FDF2F8',
    primaryBorder: '#FBCFE8',
  },
  status: {
    income: '#10B981',
    incomeBg: '#ECFDF5',
    incomeBorder: '#A7F3D0',
    expense: '#EF4444',
    expenseBg: '#FEF2F2',
    expenseBorder: '#FECACA',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    info: '#3B82F6',
    infoBg: '#EFF6FF',
    purple: '#8B5CF6',
    purpleBg: '#F5F3FF',
  },
};

export const darkColors: ThemeColors = {
  background: {
    canvas: '#0F172A',      // Slate 900
    card: '#1E293B',        // Slate 800
    cardSubtle: '#273549',  // Slate 750
    input: '#0B1120',       // Slate 950
    modal: '#1E293B',
    overlay: 'rgba(0, 0, 0, 0.75)',
    root: '#090D16',
  },
  text: {
    primary: '#F8FAFC',     // Slate 50
    secondary: '#94A3B8',   // Slate 400
    muted: '#64748B',       // Slate 500
    inverse: '#0F172A',
  },
  border: {
    default: '#334155',     // Slate 700
    subtle: '#1E293B',
    strong: '#475569',
  },
  brand: {
    primary: '#F472B6',     // Pink 400 (明度更高更鮮明)
    primarySubtle: 'rgba(236, 72, 153, 0.18)',
    primaryBorder: 'rgba(236, 72, 153, 0.35)',
  },
  status: {
    income: '#34D399',      // Emerald 400
    incomeBg: 'rgba(16, 185, 129, 0.18)',
    incomeBorder: 'rgba(16, 185, 129, 0.35)',
    expense: '#F87171',     // Red 400
    expenseBg: 'rgba(239, 68, 68, 0.18)',
    expenseBorder: 'rgba(239, 68, 68, 0.35)',
    warning: '#FBBF24',     // Amber 400
    warningBg: 'rgba(245, 158, 11, 0.18)',
    info: '#60A5FA',        // Blue 400
    infoBg: 'rgba(59, 130, 246, 0.18)',
    purple: '#A78BFA',      // Purple 400
    purpleBg: 'rgba(139, 92, 246, 0.18)',
  },
};
