"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied" | "error";

export function PushSettings() {
  const [state, setState] = useState<State>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setError(null);
    setState("loading");
    if (
      !window.isSecureContext ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const sub = await registration.pushManager.getSubscription();
      const response = await fetch("/api/push/subscriptions", { cache: "no-store" });
      const result = await response.json();
      if (version !== loadVersion.current) return;
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? "알림 설정을 불러오지 못했어요.");
      setPublicKey(result.publicKey);
      setSubscription(sub);
      if (!result.configured) {
        setState("unconfigured");
        return;
      }
      const digest = sub
        ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint))
        : null;
      const hash = digest
        ? Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
        : null;
      if (version !== loadVersion.current) return;
      setState(
        Notification.permission === "denied"
          ? "denied"
          : hash && result.endpointHashes.includes(hash)
            ? "on"
            : "off",
      );
    } catch (e) {
      if (version !== loadVersion.current) return;
      setState("error");
      setError(e instanceof Error ? e.message : "알림 설정을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [load]);

  async function enable() {
    if (busy || !publicKey) return;
    setBusy(true);
    setError(null);
    let created: PushSubscription | null = null;
    try {
      // Permission must be requested directly from the button gesture, especially on iOS.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const previous = await registration.pushManager.getSubscription();
      // A browser may have belonged to another account; never silently reuse its subscription.
      if (previous) await previous.unsubscribe();
      const decoded = atob(publicKey.replaceAll("-", "+").replaceAll("_", "/"));
      created = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(decoded, (c) => c.charCodeAt(0)),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(created.toJSON()),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "알림을 켜지 못했어요.");
      setSubscription(created);
      setState("on");
    } catch (e) {
      if (created) await created.unsubscribe().catch(() => false);
      setSubscription(null);
      setState("off");
      setError(e instanceof Error ? e.message : "알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy || !subscription) return;
    setBusy(true);
    setError(null);
    try {
      // Stop server delivery first; if that fails, keep the control available to retry.
      const response = await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "알림을 끄지 못했어요.");
      await subscription.unsubscribe();
      setSubscription(null);
      setState(publicKey ? "off" : "unconfigured");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림을 끄지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const message: Record<State, string> = {
    loading: "이 브라우저의 알림 설정을 확인하고 있어요.",
    unsupported:
      "이 브라우저에서는 알림을 지원하지 않아요. iPhone·iPad는 홈 화면에 추가한 앱에서 확인해 주세요.",
    unconfigured: "일정 알림을 준비 중이에요. 준비가 끝나면 여기에서 켤 수 있어요.",
    off: "일정에 알림 시각을 지정하면 이 브라우저로 받아요.",
    on: "이 브라우저의 일정 알림이 켜져 있어요. 캘린더에서 일정별 알림 시각을 선택해 주세요.",
    denied: "브라우저 설정에서 arch-campus의 알림을 허용한 뒤 다시 확인해 주세요.",
    error: "알림 설정을 확인하지 못했어요. 다시 불러와 주세요.",
  };
  const buttonClass =
    "mt-4 min-h-11 rounded-full bg-[var(--color-apple-action)] px-5 text-[13px] wght-600 text-white disabled:opacity-50";
  return (
    <section className="mt-5 fade-up fade-up-3">
      <div className="elev-1 rounded-[18px] bg-white px-6 py-7 sm:px-8">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#edf4ff] text-[var(--color-apple-action)]">
            <Bell aria-hidden size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] wght-650 text-[var(--color-apple-ink)]">일정 알림</h2>
            <p
              role="status"
              className="mt-2 text-[12.5px] leading-[1.6] text-[var(--color-apple-muted)]"
            >
              {message[state]}
            </p>
            {state === "off" && (
              <button type="button" disabled={busy} onClick={enable} className={buttonClass}>
                {busy ? "연결 중…" : "이 브라우저 알림 켜기"}
              </button>
            )}
            {(state === "on" || (subscription && ["unconfigured", "denied"].includes(state))) && (
              <button type="button" disabled={busy} onClick={disable} className={buttonClass}>
                {busy ? "해제 중…" : "이 브라우저 알림 끄기"}
              </button>
            )}
            {["error", "denied"].includes(state) && (
              <button type="button" disabled={busy} onClick={load} className={buttonClass}>
                다시 확인
              </button>
            )}
            {state === "on" && (
              <p className="mt-3 text-[11px] leading-[1.5] text-[var(--color-apple-muted)]">
                잠금 화면에는 일정 내용을 표시하지 않아요. 브라우저·기기의 절전이나 네트워크 상태에
                따라 알림이 늦어질 수 있어요.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-[12px] text-[var(--color-urgent)]">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
