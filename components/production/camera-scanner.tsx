"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker, type Worker } from "tesseract.js";

type CameraScannerProps = {
  onDetected: (code: string) => void;
};

export function CameraScanner({ onDetected }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const readingRef = useRef(false);
  const detectedRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function getWorker() {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = await createWorker("eng");

    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
    });

    workerRef.current = worker;

    return worker;
  }

  async function openCamera() {
    setError("");
    detectedRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não oferece suporte ao acesso à câmera.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment",
          },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      console.error("Erro ao abrir câmera:", err);

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "A câmera foi bloqueada. Libere a permissão nas configurações do navegador.",
        );
        return;
      }

      setError("Não foi possível abrir a câmera.");
    }
  }

  const closeCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setReading(false);
    readingRef.current = false;
  }, []);

  const readFrame = useCallback(async () => {
    if (readingRef.current || detectedRef.current) {
      return;
    }

    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    readingRef.current = true;
    setReading(true);

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      /*
       * Lemos principalmente a faixa central da câmera,
       * onde o funcionário deve posicionar o código.
       */
      const sourceWidth = video.videoWidth * 0.9;
      const sourceHeight = video.videoHeight * 0.3;

      const sourceX = (video.videoWidth - sourceWidth) / 2;
      const sourceY = (video.videoHeight - sourceHeight) / 2;

      canvas.width = 1200;
      canvas.height = 400;

      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      /*
       * Preto e branco com contraste alto ajuda o OCR
       * quando a etiqueta tem fundo claro e números escuros.
       */
      const imageData = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const pixels = imageData.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const gray =
          pixels[i] * 0.299 +
          pixels[i + 1] * 0.587 +
          pixels[i + 2] * 0.114;

        const value = gray > 145 ? 255 : 0;

        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
      }

      context.putImageData(imageData, 0, 0);

      const worker = await getWorker();
      const result = await worker.recognize(canvas);

      const digits = result.data.text.replace(/\D/g, "");

      console.log("OCR:", result.data.text);
      console.log("Código detectado:", digits);

      if (digits.length >= 4 && digits.length <= 10) {
        detectedRef.current = true;

        onDetected(digits);

        await closeCamera();
      }
    } catch (err) {
      console.error("Erro durante leitura automática:", err);
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }, [closeCamera, onDetected]);

  useEffect(() => {
    if (!cameraOpen) {
      return;
    }

    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video || !stream) {
      return;
    }

    video.srcObject = stream;

    video.play().catch((err) => {
      console.error("Erro ao reproduzir câmera:", err);
    });

    const interval = window.setInterval(() => {
      void readFrame();
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [cameraOpen, readFrame]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (workerRef.current) {
        void workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-dashed border-(--border-strong) bg-(--surface-soft) p-5">
      {!cameraOpen ? (
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-(--brand-soft) text-xl font-semibold text-(--brand)">
            123
          </div>

          <h2 className="mt-4 text-lg font-semibold text-(--text-primary)">
            Ler código
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-(--text-secondary)">
            Use a câmera para identificar automaticamente o número da etiqueta.
          </p>

          <button
            type="button"
            onClick={openCamera}
            className="mt-5 w-full rounded-2xl bg-(--brand) px-4 py-3.5 font-semibold text-white transition hover:bg-(--brand-hover)"
          >
            Abrir câmera
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
              className="aspect-4/3 w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-[85%] rounded-xl border-2 border-(--brand)" />
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-(--text-secondary)">
              Posicione o código dentro do retângulo.
            </p>

            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-(--brand)">
              {reading ? "Procurando código..." : "Leitura automática ativa"}
            </p>
          </div>

          <button
            type="button"
            onClick={closeCamera}
            className="mt-4 w-full rounded-2xl border border-(--border-strong) px-4 py-3 font-semibold text-(--text-primary) transition hover:bg-(--surface-hover)"
          >
            Fechar câmera
          </button>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}