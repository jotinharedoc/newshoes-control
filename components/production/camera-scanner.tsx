"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type CameraScannerProps = {
  onDetected: (code: string) => void;
};

export function CameraScanner({ onDetected }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const openingRef = useRef(false);
  const detectedRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const closeCamera = useCallback(() => {
    sessionRef.current += 1;
    openingRef.current = false;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setOpening(false);
    setReady(false);
  }, []);

  async function openCamera() {
    if (openingRef.current || streamRef.current) return;

    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Câmera indisponível. No celular, abra o sistema pelo endereço HTTPS.",
      );
      return;
    }

    openingRef.current = true;
    setOpening(true);
    detectedRef.current = false;

    const session = ++sessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // Descarta a câmera se o componente foi fechado durante a abertura.
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setReady(false);
      setCameraOpen(true);
    } catch (err) {
      if (session !== sessionRef.current) return;

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "A câmera foi bloqueada. Libere a permissão nas configurações do navegador.",
        );
      } else {
        setError(
          "Não foi possível abrir a câmera. Verifique se ela está disponível.",
        );
      }
    } finally {
      if (session === sessionRef.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  }

  function readFrame() {
    const video = videoRef.current;

    if (
      detectedRef.current ||
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    setError("");

    let code: string | null = null;

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        setError("Não foi possível processar a imagem da câmera.");
        return;
      }

      // Analisa o quadro inteiro, preservando a proporção original.
      // Não corta o QR nem aplica um filtro fixo de preto e branco.
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const result = jsQR(frame.data, frame.width, frame.height, {
        inversionAttempts: "dontInvert",
      });

      if (!result) {
        setError(
          "QR não encontrado. Aproxime até ele ficar nítido, evite reflexos e toque em Ler etiqueta novamente.",
        );
        return;
      }

      const value = result.data.trim();

      // Aceita números de comprimentos diferentes e preserva zeros iniciais.
      // Não transforma URLs ou outros textos em um código numérico.
      if (!/^\d+$/.test(value)) {
        setError(
          "O QR foi lido, mas o conteúdo não é apenas um número. Precisamos conferir o formato dessa etiqueta.",
        );
        return;
      }

      code = value;
    } catch {
      setError("Não foi possível ler a imagem. Tente novamente.");
      return;
    }

    if (code !== null) {
      detectedRef.current = true;
      closeCamera();
      onDetected(code);
    }
  }

  useEffect(() => {
    if (!cameraOpen) return;

    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video || !stream) return;

    let cancelled = false;
    video.srcObject = stream;

    void video.play().catch(() => {
      if (!cancelled) {
        setError("Não foi possível exibir a câmera. Feche e abra novamente.");
      }
    });

    return () => {
      cancelled = true;
      video.srcObject = null;
    };
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-dashed border-(--border-strong) bg-(--surface-soft) p-3 sm:p-5">
      {!cameraOpen ? (
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-(--brand-soft) text-xl font-semibold text-(--brand)">
            QR
          </div>

          <h2 className="mt-4 text-lg font-semibold text-(--text-primary)">
            Ler etiqueta
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-(--text-secondary)">
            Abra a câmera e aponte para o QR Code da etiqueta.
          </p>

          <button
            type="button"
            onClick={() => void openCamera()}
            disabled={opening}
            className="mt-5 w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover) disabled:opacity-60"
          >
            {opening ? "Abrindo câmera..." : "Abrir câmera"}
          </button>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onPlaying={() => setReady(true)}
              className="block h-[60dvh] min-h-[300px] max-h-[640px] w-full object-contain"
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
              <span className="rounded-full bg-black/70 px-4 py-2 text-center text-xs font-medium text-white">
                Mantenha apenas um QR visível e nítido
              </span>
            </div>
          </div>

          <p className="mt-4 text-center text-sm leading-6 text-(--text-secondary)">
            Aproxime a etiqueta sem perder o foco. Incline um pouco se
            houver reflexo no plástico.
          </p>

          <button
            type="button"
            onClick={readFrame}
            disabled={!ready}
            className="mt-4 w-full rounded-2xl bg-(--brand) px-4 py-4 font-semibold text-white transition hover:bg-(--brand-hover) disabled:opacity-60"
          >
            {ready ? "Ler etiqueta" : "Preparando câmera..."}
          </button>

          <button
            type="button"
            onClick={closeCamera}
            className="mt-3 w-full rounded-2xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
          >
            Fechar câmera
          </button>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-(--text-primary)"
        >
          {error}
        </p>
      )}
    </div>
  );
}