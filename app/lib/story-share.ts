type ShareBrowser = {
  clipboard?: Pick<Clipboard, "writeText">;
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/** Link sharing never receives a File, including native suggested contacts and
 * Messages. Image saving is an explicit, independent download action. */
export async function shareStoryLink(url: string, browser: ShareBrowser = navigator) {
  const data: ShareData = { url };
  if (typeof browser.share === "function") {
    try {
      await browser.share(data);
      return "shared" as const;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled" as const;
    }
  }
  if (!browser.clipboard) throw new Error("Link sharing is unavailable");
  await browser.clipboard.writeText(url);
  return "copied" as const;
}

type ShareCallbacks = {
  open: () => void;
  close: () => void;
  download: () => void;
};

export type StoryShareResult = "shared" | "downloaded" | "cancelled";
export type StoryShareConfirmationData = {
  image: string | null;
  copied: boolean | null;
};

export function getStoryShareConfirmation(result: StoryShareResult, copied: boolean | null): StoryShareConfirmationData | null {
  if (result === "cancelled" && copied === null) return null;
  return {
    // Web Share deliberately hides which native action was chosen.
    image: result === "shared" ? "Story image saved or shared" : result === "downloaded" ? "Story image download started" : null,
    copied,
  };
}

export function beginStoryShare(data: ShareData, url: string, callbacks: ShareCallbacks, browser: ShareBrowser = navigator) {
  // Start both privileged actions in the original tap. Awaiting clipboard first
  // can lose Safari's activation; calling share first consumes that activation.
  let copied: Promise<boolean>;
  try {
    copied = browser.clipboard
      ? browser.clipboard.writeText(url).then(() => true, () => false)
      : Promise.resolve(false);
  } catch {
    copied = Promise.resolve(false);
  }

  let supported = false;
  try {
    supported = typeof browser.share === "function" &&
      (typeof browser.canShare !== "function" || browser.canShare(data));
  } catch { /* A browser that cannot inspect files can still download them. */ }
  if (!supported) {
    callbacks.download();
    return { copied, finished: Promise.resolve("downloaded" as const) };
  }

  callbacks.open();
  let sharing: Promise<void>;
  try {
    sharing = browser.share!(data);
  } catch (error) {
    sharing = Promise.reject(error);
  }
  const finished = sharing.then(
    () => "shared" as const,
    (error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return "cancelled" as const;
      callbacks.download();
      return "downloaded" as const;
    },
  ).finally(callbacks.close);
  return { copied, finished };
}
