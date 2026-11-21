import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

interface DetectedBarcode {
  rawValue: string;
}

interface BrowserBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BrowserBarcodeDetector;
  }
}

interface ParticipantQrScannerProps {
  busy: boolean;
  autoSubmitOnScan?: boolean;
  submitLabel?: string;
  onToken: (token: string) => void;
}

export function ParticipantQrScanner({
  busy,
  autoSubmitOnScan = false,
  submitLabel,
  onToken,
}: ParticipantQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const onTokenRef = useRef(onToken);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      setMessage("Este navegador não oferece leitura de QR pela câmera. Você ainda pode colar o token abaixo.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      scanningRef.current = true;
      setScanning(true);

      const scanFrame = async () => {
        const video = videoRef.current;
        if (!scanningRef.current || !video) return;
        try {
          const [code] = await detector.detect(video);
          if (code?.rawValue) {
            const token = code.rawValue.trim();
            stopCamera();
            setManualToken(token);
            if (autoSubmitOnScan) {
              setMessage("QR lido. Registrando sua presença…");
              onTokenRef.current(token);
            } else {
              setMessage("QR lido. Confira os dados antes de confirmar.");
            }
            return;
          }
        } catch {
          stopCamera();
          setMessage("Não foi possível ler o QR. Você pode colar o token abaixo.");
          return;
        }
        timerRef.current = window.setTimeout(() => void scanFrame(), 300);
      };
      void scanFrame();
    } catch {
      stopCamera();
      setMessage("Não foi possível abrir a câmera. Você pode colar o token abaixo.");
    }
  }

  function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = manualToken.trim();
    if (token && !busy) onToken(token);
  }

  return (
    <div className="attendance-scanner">
      <button
        className="button button-secondary"
        type="button"
        disabled={busy}
        onClick={() => (scanning ? stopCamera() : void startCamera())}
      >
        {scanning ? "Parar câmera" : autoSubmitOnScan ? "Ler QR do evento" : "Ler QR do participante"}
      </button>
      <video
        ref={videoRef}
        className="attendance-scanner-video"
        aria-label="Leitor de QR do evento"
        muted
        playsInline
        hidden={!scanning}
      />
      <form className="attendance-token-form" onSubmit={submitToken}>
        <label htmlFor="attendance-qr-token">Código do QR</label>
        <input
          id="attendance-qr-token"
          autoComplete="off"
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
          placeholder="Escaneie ou cole o token"
          disabled={busy}
        />
        <button className="button button-primary" type="submit" disabled={busy || !manualToken.trim()}>
          {busy ? "Verificando…" : (submitLabel ?? "Registrar presença")}
        </button>
      </form>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
