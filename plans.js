// Abo-Stufen von MindSpace – EINE Quelle für App und Server.
// Preise sind Endkundenpreise inkl. MwSt. Die echten Preise legst du in App Store Connect und
// Google Play fest; hier stehen sie nur zur Anzeige, falls der Store (noch) keine liefert.
//
// Ein Abo gilt für den ganzen gemeinsamen Bereich (Familie): Hat ein Mitglied Pro, nutzen alle Pro.
// KI-Aktionen und E-Mails werden pro gemeinsamem Bereich und Kalendermonat gezählt.

export const PLAN_ORDER = ['free', 'daily', 'pro'];

export const PLANS = {
  free: {
    id: 'free', name: 'Free', tagline: 'Alles ausprobieren',
    price: { month: 0, year: 0 },
    limits: {
      ownProjects: 1, // eigene Projekte zusätzlich zu den Standard-Bereichen
      members: 2, // Personen im gemeinsamen Bereich
      aiActions: 20, // KI-Aktionen pro Monat (Spracheingabe, Suche, Entwürfe, Auswerten)
      mails: 10, // E-Mails pro Monat, die die KI ausliest
      mailAttachments: 1, // Anhänge je E-Mail, die die KI mitliest (gespeichert werden alle)
      storageMB: 250,
    },
    features: { dailyCheck: false, bestModel: false, calendar: true, faceId: true, push: true },
    models: { quick: 'claude-haiku-5-5', smart: 'claude-haiku-5-5', mail: 'claude-haiku-5-5' },
  },
  daily: {
    id: 'daily', name: 'Daily Driver', tagline: 'Für den Alltag der ganzen Familie',
    price: { month: 6.99, year: 62.99 }, // Jahresabo 25 % günstiger
    limits: { ownProjects: 10, members: 5, aiActions: 150, mails: 40, mailAttachments: 3, storageMB: 5 * 1024 },
    features: { dailyCheck: true, bestModel: false, calendar: true, faceId: true, push: true },
    models: { quick: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5', mail: 'claude-sonnet-5-5' },
  },
  pro: {
    id: 'pro', name: 'Pro', tagline: 'Für sehr viel Planung, Bau und Verträge',
    price: { month: 12.99, year: 116.99 }, // Jahresabo 25 % günstiger
    limits: { ownProjects: Infinity, members: 10, aiActions: 400, mails: 120, mailAttachments: 6, storageMB: 25 * 1024 },
    features: { dailyCheck: true, bestModel: true, calendar: true, faceId: true, push: true },
    models: { quick: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5', mail: 'claude-sonnet-5-5', best: 'claude-opus-5-5' },
  },
};

// Store-Produkte. App Store: genau diese Produkt-IDs. Google Play: Abo „mindspace_daily“ bzw. „mindspace_pro“
// mit den Basis-Abos „monthly“ und „yearly“. In RevenueCat heißen die Pakete daily_monthly, daily_yearly,
// pro_monthly, pro_yearly (Offering „default“) – darüber findet die App die Produkte (native/src/bridge.js).
export const PRODUCTS = {
  daily: { month: 'mindspace_daily_monthly', year: 'mindspace_daily_yearly' },
  pro: { month: 'mindspace_pro_monthly', year: 'mindspace_pro_yearly' },
};
// RevenueCat-Berechtigungen („Entitlements“)
export const ENTITLEMENTS = { daily: 'daily', pro: 'pro' };

// Welche Art von KI-Aufruf welches Modell bekommt und wie viele Aktionen er zählt
export const AI_KINDS = {
  parse: { model: 'quick', cost: 1 }, // Spracheingabe, eingefügter Text
  search: { model: 'quick', cost: 1 },
  assess: { model: 'quick', cost: 1 }, // Fristen einschätzen
  draft: { model: 'smart', cost: 1 }, // E-Mail-Entwurf
  extract: { model: 'smart', cost: 1 }, // Text mit Anhängen auswerten
  test: { model: 'quick', cost: 1 }, // jeder Aufruf zählt – sonst ließe sich das Kontingent umgehen
};

export const planOf = (id) => PLANS[id] || PLANS.free;
export const rank = (id) => Math.max(0, PLAN_ORDER.indexOf(id));
export const bestPlan = (ids) => (ids || []).reduce((best, id) => (rank(id) > rank(best) ? id : best), 'free');
export const limitOf = (planId, key) => planOf(planId).limits[key];
export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
export const fmtLimit = (v) => (v === Infinity ? '∞' : String(v));
export const storageLabel = (mb) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);
