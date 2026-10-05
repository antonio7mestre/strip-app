export const ONBOARDING_BACKGROUND = "#304DFF";

// Cobalt belongs in the top-right slot. The grid adds whole rows as space allows.
export const ONBOARDING_COLORS = [
  { name: "Paper", value: "#F5F1E8" },
  { name: "Pink", value: "#FF8CCC" },
  { name: "Acid yellow", value: "#D7FF00" },
  { name: "Cobalt", value: ONBOARDING_BACKGROUND },
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#000000" },
  { name: "Orange", value: "#FF4D00" },
  { name: "Lilac", value: "#BCA1FF" },
  { name: "Cherry", value: "#C91B38" },
  { name: "Butter", value: "#F8DB77" },
  { name: "Sky", value: "#91D9F7" },
  { name: "Forest", value: "#174C38" },
  { name: "Hot pink", value: "#FF4FA3" },
  { name: "Mint", value: "#BDF4D2" },
  { name: "Violet", value: "#7A2CFF" },
  { name: "Chrome", value: "#D9D9D9" },
  { name: "Lime", value: "#8ACE00" },
  { name: "Peach", value: "#FFA980" },
  { name: "Navy", value: "#13224B" },
  { name: "Rose", value: "#A64869" },
  { name: "Turquoise", value: "#26C4B8" },
  { name: "Chocolate", value: "#583728" },
  { name: "Lemon", value: "#FFE800" },
  { name: "Periwinkle", value: "#889AFF" },
  { name: "Plum", value: "#622D65" },
  { name: "Coral", value: "#FF6C64" },
  { name: "Olive", value: "#7E8835" },
  { name: "Ice", value: "#DDEDF1" },
  { name: "Apricot", value: "#F4B455" },
  { name: "Petal", value: "#F1BBD5" },
  { name: "Ocean", value: "#006677" },
  { name: "Lavender", value: "#DFD1F1" },
] as const;

export function onboardingGrid(width: number, height: number) {
  const gap = 16;
  const size = Math.max(1, Math.min(80, (width - gap * 3) / 4, height));
  const rows = Math.max(1, Math.min(ONBOARDING_COLORS.length / 4,
    Math.floor((height + gap) / (size + gap))));
  return { size, count: rows * 4 };
}

const PENDING_KEY = "strip:onboarding-background";
export function backgroundOnboardingPending(userId: string) {
  try { return window.sessionStorage.getItem(PENDING_KEY) === userId; }
  catch { return false; }
}
export function rememberBackgroundOnboarding(userId: string | null) {
  try {
    if (userId) window.sessionStorage.setItem(PENDING_KEY, userId);
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch { /* A blocked storage preference must not block signup. */ }
}
