"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
  isScanningActive?: boolean;
}

interface Html5QrcodeInstance {
  start: (
    cameraConfig: { facingMode: string },
    configuration: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    qrCodeSuccessCallback: (decodedText: string) => void,
    qrCodeErrorCallback?: (errorMessage: string) => void
  ) => Promise<null>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
}

export function QrScannerComponent({
  onScanSuccess,
  onScanError,
  isScanningActive = true,
}: QrScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const readerElementId = "html5-qr-reader-container";

  useEffect(() => {
    let isMounted = true;

    async function initScanner() {
      if (!isScanningActive) return;

      try {
        setIsInitializing(true);
        setErrorMessage(null);

        // Dynamically import html5-qrcode to prevent any SSR window issues
        const { Html5Qrcode } = await import("html5-qrcode");

        if (!isMounted) return;

        // Clean up any existing scanner instance
        if (scannerRef.current) {
          try {
            await scannerRef.current.stop();
            await scannerRef.current.clear();
          } catch {
            // Ignore stop errors if already stopped
          }
          scannerRef.current = null;
        }

        const html5QrCode = new Html5Qrcode(readerElementId) as unknown as Html5QrcodeInstance;
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText: string) => {
            if (isMounted) {
              onScanSuccess(decodedText);
            }
          },
          (err: string) => {
            if (onScanError && typeof err === "string") {
              onScanError(err);
            }
          }
        );

        if (isMounted) {
          setHasPermission(true);
          setIsInitializing(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setIsInitializing(false);
          setHasPermission(false);
          const msg =
            err instanceof Error
              ? err.message
              : "No se pudo acceder a la cámara. Revisa los permisos o usa el PIN manual.";
          setErrorMessage(msg);
        }
      }
    }

    initScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        try {
          scannerRef.current
            .stop()
            .then(() => scannerRef.current?.clear())
            .catch(() => {});
        } catch {
          // ignore
        }
      }
    };
  }, [isScanningActive, onScanSuccess, onScanError]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 text-white shadow-inner">
      <div
        id={readerElementId}
        className="w-full min-h-[280px] flex items-center justify-center overflow-hidden"
      />

      {isInitializing && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-2" />
          <p className="text-sm font-medium text-slate-300">
            Iniciando cámara del dispositivo...
          </p>
          <span className="text-xs text-slate-500 mt-1">
            Permite el acceso si tu navegador lo solicita
          </span>
        </div>
      )}

      {hasPermission === false && (
        <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
            <CameraOff className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Cámara no disponible
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            {errorMessage || "No se detectó cámara o se denegó el permiso."}
          </p>
          <p className="text-xs text-amber-400 font-medium mt-3 bg-amber-950/50 px-3 py-1.5 rounded-lg border border-amber-800/60">
            💡 Puedes usar el código PIN de 4 dígitos abajo
          </p>
        </div>
      )}

      {/* Target framing aesthetic overlay */}
      {hasPermission && !isInitializing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-6">
          <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-slate-300 border border-white/10 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            Enfoca el código QR proyectado
          </div>
          <div className="w-52 h-52 border-2 border-dashed border-blue-400/80 rounded-2xl relative animate-pulse">
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />
          </div>
          <span className="text-[10px] text-slate-400 bg-black/60 px-2 py-0.5 rounded">
            Lector QR en tiempo real
          </span>
        </div>
      )}
    </div>
  );
}
