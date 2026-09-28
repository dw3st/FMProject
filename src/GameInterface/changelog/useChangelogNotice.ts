import { useCallback, useEffect, useState } from "react";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";
import { shouldShowChangelogNotice } from "@/GameInterface/changelog/changelogNotice";

const STORAGE_KEY = "fmproject.changelog.seenVersion";

function readStoredVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // Private browsing / blocked storage — the notice will just show again next visit.
  }
}

/**
 * Drives the "new version" changelog notice. On mount, compares the last version the player
 * saw (localStorage) against `CURRENT_VERSION`:
 *  - never visited before → no notice, just remember the current version
 *  - same version → no notice
 *  - older version stored → show the notice
 *
 * `markSeen()` hides the notice and remembers `CURRENT_VERSION` — call it both when the
 * changelog modal is opened and when the notice is explicitly dismissed.
 */
export function useChangelogNotice() {
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    const stored = readStoredVersion();
    if (shouldShowChangelogNotice(stored, CURRENT_VERSION)) {
      setShowNotice(true);
    } else if (stored === null) {
      writeStoredVersion(CURRENT_VERSION);
    }
  }, []);

  const markSeen = useCallback(() => {
    setShowNotice(false);
    writeStoredVersion(CURRENT_VERSION);
  }, []);

  return { showNotice, markSeen };
}
