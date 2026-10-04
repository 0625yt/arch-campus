"use client";

import { useEffect, useState } from "react";

/** Register the public offline fallback and communicate connectivity without retrying mutations. */
export function PwaStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          console.warn("오프라인 안내를 준비하지 못했어요.");
        });
    }
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg shadow-lg"
    >
      인터넷 연결이 끊겼어요. 다시 연결한 뒤 저장·생성을 진행해 주세요.
    </div>
  );
}
