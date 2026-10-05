export const ONBOARDING_BACKGROUND = "#304DFF";

// Cobalt belongs in the top-left slot. The grid adds whole rows as space allows.
export const ONBOARDING_COLORS = [
  { name: "Cobalt", value: ONBOARDING_BACKGROUND },
  { name: "Acid green", value: "#BFFF00" },
  { name: "Hot pink", value: "#FF0099" },
  { name: "Orange", value: "#FF4D00" },
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#000000" },
  { name: "Cherry", value: "#FF1744" },
  { name: "Violet", value: "#8500FF" },
  { name: "Pool blue", value: "#00D5FF" },
  { name: "Lemon", value: "#FFD500" },
  { name: "Forest", value: "#007F21" },
  { name: "Burgundy", value: "#98004F" },
  { name: "Candy pink", value: "#FF94D2" },
  { name: "Chrome", value: "#A3A3A3" },
  { name: "Midnight", value: "#171E5B" },
  { name: "Lilac", value: "#CB8DFF" },
  { name: "Peach", value: "#FFBFA0" },
  { name: "Petrol", value: "#00686F" },
  { name: "Chocolate", value: "#683C27" },
  { name: "Mint", value: "#39FFE3" },
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
