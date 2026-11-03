export type CreationStep = "media" | "stickers" | "message";
export type OnboardingStep = "landing" | "phone" | "code" | "username" | "background" | CreationStep;

const key = "stripOnboarding";
const rank: Record<OnboardingStep, number> = { landing: 0, phone: 1, code: 2, username: 2, background: 3, media: 4, stickers: 5, message: 6 };

/** Same-document entries keep Safari Back in the flow without changing the
 * URL, scrolling the document, or putting phone numbers in browser history. */
export function createOnboardingHistory(host: Pick<Window, "history" | "location">, navigate: (step: OnboardingStep) => boolean | Promise<boolean>) {
  const session = crypto.randomUUID();
  let entries: OnboardingStep[] = [];
  let index = -1;
  let active = false;
  let pending: OnboardingStep | null = null;
  let desired: OnboardingStep | null = null;
  let path = "";
  const state = () => ({ ...host.history.state, [key]: { session, index } });
  const replace = () => host.history.replaceState(state(), "");
  const push = (step: OnboardingStep) => {
    entries = entries.slice(0, index + 1); entries.push(step); index++;
    host.history.pushState(state(), "");
  };
  const controller = {
    observe(step: OnboardingStep | null) {
      desired = step;
      if (!step) { active = false; pending = null; return; }
      active = true;
      if (pending) { if (pending === step) pending = null; return; }
      if (index < 0 || path !== host.location.pathname || host.history.state?.[key]?.session !== session) {
        path = host.location.pathname;
        entries = ["landing"]; index = 0; replace();
        const chain: OnboardingStep[] = ["phone", step === "code" ? "code" : "username", "background", "media", "stickers", "message"];
        for (const item of chain) { if (rank[item] <= rank[step]) push(item); }
        return;
      }
      const current = entries[index];
      if (current === step) return;
      if (rank[current] === rank[step]) { entries[index] = step; replace(); return; }
      const previous = entries.lastIndexOf(step, index - 1);
      if (previous >= 0) {
        pending = step;
        host.history.go(previous - index);
      } else push(step);
    },
    pop(event: PopStateEvent) {
      const entry = event.state?.[key];
      if (!active || path !== host.location.pathname || entry?.session !== session || !entries[entry.index]) return;
      event.stopImmediatePropagation();
      const oldIndex = index;
      index = entry.index;
      const step = entries[index];
      if (pending === step) {
        pending = null;
        if (desired !== step) controller.observe(desired);
        return;
      }
      pending = step;
      void Promise.resolve(navigate(step)).then(success => {
        if (success || pending !== step) return;
        // A failed sign-out must keep the verified username screen usable.
        index = oldIndex; pending = null; replace();
      });
    },
  };
  return controller;
}
