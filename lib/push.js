// Browser push notifications for price tracker alerts.
//
// The VAPID public key is public by design (it identifies the sender); the
// private key lives only in the `price-alerts` edge function's secrets.

import { supabase } from "./supabase";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BGxeJvm77_tolS94q-Mn7lcvE2AJ_aZCegH7woxPGmWapVjHIUmX140aQITJSDSHb4FKpiY2lTeZblTLrROVhoM";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

// "unsupported" | "needs-home-screen" | "denied" | "off" | "on"
export async function pushStatus() {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === "granted" ? "on" : "off";
}

async function callAlerts(body) {
  const { data, error } = await supabase.functions.invoke("price-alerts", { body });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || "Request failed");
  return data;
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed in this browser.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await callAlerts({ action: "subscribe", subscription: sub.toJSON(), user_agent: navigator.userAgent });
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await callAlerts({ action: "unsubscribe", endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) throw new Error("Notifications are off on this device.");
  return callAlerts({ action: "test_push", endpoint: sub.endpoint });
}
