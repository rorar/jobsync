"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "../ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { BellRing, Loader2, Send, RefreshCw } from "lucide-react";
import {
  getVapidPublicKeyAction,
  subscribePush,
  unsubscribePush,
  getSubscriptionCount,
  rotateVapidKeysAction,
  sendTestPush,
} from "@/actions/push.actions";
import { useTranslations } from "@/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PushSettings() {
  const { t } = useTranslations();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [subscribing, setSubscribing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Test cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Check subscription status
  // -------------------------------------------------------------------------

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check browser support
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setBrowserSupported(false);
        setIsLoading(false);
        return;
      }

      // Check current permission
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      ) {
        setPermissionDenied(true);
      }

      // Check existing subscription
      const registration =
        await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription =
          await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } else {
        setIsSubscribed(false);
      }

      // Get device count from server
      const countResult = await getSubscriptionCount();
      if (countResult.success && countResult.data !== undefined) {
        setDeviceCount(countResult.data.count);
      }
    } catch {
      // Best effort — don't block the UI
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Cooldown management
  // -------------------------------------------------------------------------

  const startCooldown = () => {
    setCooldown(TEST_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // -------------------------------------------------------------------------
  // Subscribe
  // -------------------------------------------------------------------------

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      // 1. Get VAPID public key from server
      const vapidResult = await getVapidPublicKeyAction();
      if (!vapidResult.success || !vapidResult.data) {
        toast({
          variant: "destructive",
          title: t("settings.pushSubscribeFailed"),
          description: vapidResult.message
            ? t(vapidResult.message)
            : undefined,
        });
        return;
      }
      const vapidKey = vapidResult.data.publicKey;

      // 2. Check browser support
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setBrowserSupported(false);
        return;
      }

      // 3. Register service worker
      const registration = await navigator.serviceWorker.register(
        "/sw-push.js",
      );

      // 4. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPermissionDenied(true);
        toast({
          title: t("settings.pushPermissionDenied"),
        });
        return;
      }
      setPermissionDenied(false);

      // 5. Subscribe
      const appServerKey = urlBase64ToUint8Array(vapidKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      // 6. Extract keys and send to server
      const p256dh = btoa(
        String.fromCharCode(
          ...new Uint8Array(subscription.getKey("p256dh")!),
        ),
      );
      const auth = btoa(
        String.fromCharCode(
          ...new Uint8Array(subscription.getKey("auth")!),
        ),
      );

      const result = await subscribePush({
        endpoint: subscription.endpoint,
        keys: { p256dh, auth },
      });

      if (result.success) {
        setIsSubscribed(true);
        toast({ variant: "success", title: t("settings.pushEnabled") });
        // Refresh count
        const countResult = await getSubscriptionCount();
        if (countResult.success && countResult.data !== undefined) {
          setDeviceCount(countResult.data.count);
        }
      } else {
        toast({
          variant: "destructive",
          title: t("settings.pushSubscribeFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.pushSubscribeFailed"),
      });
    } finally {
      setSubscribing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Unsubscribe
  // -------------------------------------------------------------------------

  const handleUnsubscribe = async () => {
    setUnsubscribing(true);
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/sw-push.js");
      const subscription =
        await registration?.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await unsubscribePush(subscription.endpoint);
      }
      setIsSubscribed(false);
      toast({ variant: "success", title: t("settings.pushDisabled") });
      // Refresh count
      const countResult = await getSubscriptionCount();
      if (countResult.success && countResult.data !== undefined) {
        setDeviceCount(countResult.data.count);
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.pushUnsubscribeFailed"),
      });
    } finally {
      setUnsubscribing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Test Push
  // -------------------------------------------------------------------------

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await sendTestPush();
      if (result.success) {
        toast({ variant: "success", title: t("settings.pushTestSuccess") });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.pushTestFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.pushTestFailed"),
      });
    } finally {
      setTesting(false);
      startCooldown();
    }
  };

  // -------------------------------------------------------------------------
  // VAPID Rotation
  // -------------------------------------------------------------------------

  const handleRotate = async () => {
    setRotating(true);
    try {
      const result = await rotateVapidKeysAction();
      if (result.success) {
        setIsSubscribed(false);
        setDeviceCount(0);
        toast({ variant: "success", title: t("settings.pushRotated") });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.error"),
      });
    } finally {
      setRotating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.pushTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.pushDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Not supported
  // -------------------------------------------------------------------------

  if (!browserSupported) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.pushTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.pushDescription")}
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <BellRing
              className="h-8 w-8 mx-auto text-muted-foreground mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-muted-foreground">
              {t("settings.pushNotSupported")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main UI
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("settings.pushTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.pushDescription")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {t("settings.pushTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings.pushDescription")}
              </CardDescription>
            </div>
            {isSubscribed ? (
              <Badge className="bg-green-600 hover:bg-green-600 text-white">
                {t("settings.pushSubscribed")}
              </Badge>
            ) : (
              <Badge variant="secondary">
                {t("settings.pushNotSubscribed")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Permission denied warning */}
          {permissionDenied && !isSubscribed && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3" role="alert">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {t("settings.pushPermissionBlockedHint")}
              </p>
            </div>
          )}

          {/* Device count */}
          {deviceCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("settings.pushDevices").replace(
                "{count}",
                String(deviceCount),
              )}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Subscribe / Unsubscribe */}
            {isSubscribed ? (
              <Button
                variant="outline"
                onClick={handleUnsubscribe}
                disabled={unsubscribing}
              >
                {unsubscribing ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                    aria-hidden="true"
                  />
                ) : (
                  <BellRing className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {t("settings.pushDisable")}
              </Button>
            ) : (
              <Button
                onClick={handleSubscribe}
                disabled={subscribing || permissionDenied}
              >
                {subscribing ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                    aria-hidden="true"
                  />
                ) : (
                  <BellRing className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {t("settings.pushEnable")}
              </Button>
            )}

            {/* Test Push (only when subscribed) */}
            {isSubscribed && (
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || cooldown > 0}
              >
                {testing ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {testing
                  ? t("settings.pushTestSending")
                  : cooldown > 0
                    ? <span aria-live="polite">{t("settings.pushTestCooldown").replace(
                        "{seconds}",
                        String(cooldown),
                      )}</span>
                    : t("settings.pushTestTitle")}
              </Button>
            )}
          </div>

          {/* VAPID Key Rotation — separate section */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings.pushRotateTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.pushRotateDesc")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={rotating}
                  >
                    {rotating ? (
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                        aria-hidden="true"
                      />
                    ) : (
                      <RefreshCw
                        className="h-4 w-4 mr-2"
                        aria-hidden="true"
                      />
                    )}
                    {t("settings.pushRotateConfirm")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("settings.pushRotateWarning")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.pushRotateDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t("settings.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleRotate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {t("settings.pushRotateConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
