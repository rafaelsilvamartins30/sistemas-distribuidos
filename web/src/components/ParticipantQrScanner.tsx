import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useToast } from "../contexts/ToastContext";

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
  scanMessage?: string;
  cameraButtonLabel?: string;
  submitLabel?: string;
  resetKey?: number;
  onToken: (token: string) => void;
}

export function ParticipantQrScanner({
  busy,
  autoSubmitOnScan = false,
  scanMessage,
  cameraButtonLabel,
  submitLabel,
  resetKey = 0,
  onToken,
}: ParticipantQrScannerProps) {
  const toast = useToast();
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

  useEffect(() => {
    if (resetKey > 0) {
      setManualToken("");
      setMessage(null);
    }
  }, [resetKey]);

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
      toast.info("Este navegador não oferece leitura de QR pela câmera. Você ainda pode colar o token abaixo.");
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
              setMessage(scanMessage ?? "QR lido. Registrando sua presença…");
              onTokenRef.current(token);
            } else {
              toast.info("QR lido. Confira os dados antes de confirmar.");
            }
            return;
          }
        } catch {
          stopCamera();
          toast.error("Não foi possível ler o QR. Você pode colar o token abaixo.");
          return;
        }
        timerRef.current = window.setTimeout(() => void scanFrame(), 300);
      };
      void scanFrame();
    } catch {
      stopCamera();
      toast.error("Não foi possível abrir a câmera. Você pode colar o token abaixo.");
    }
  }

  function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = manualToken.trim();
    if (token && !busy) onToken(token);
  }

  async function pasteFromClipboard() {
    setMessage(null);
    if (!navigator.clipboard?.readText) {
      toast.info("Cole o código manualmente no campo abaixo (Ctrl+V / Cmd+V).");
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.info("A área de transferência está vazia. Copie o código do QR primeiro.");
        return;
      }
      setManualToken(text);
      if (autoSubmitOnScan && !busy) {
        setMessage(scanMessage ?? "Código colado. Registrando presença…");
        onToken(text);
      } else {
        toast.info("Código do QR colado. Clique no botão abaixo para confirmar.");
      }
    } catch {
      toast.error("Permissão de área de transferência negada. Cole o código no campo abaixo (Ctrl+V / Cmd+V).");
    }
  }

  return (
    <div className="attendance-scanner">
      <div className="attendance-scanner-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => (scanning ? stopCamera() : void startCamera())}
        >
          {scanning
            ? "Parar câmera"
            : (cameraButtonLabel ?? (autoSubmitOnScan ? "Ler QR pela câmera" : "Ler QR do participante"))}
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void pasteFromClipboard()}
        >
          Colar código copiado
        </button>
      </div>
      <video
        ref={videoRef}
        className="attendance-scanner-video"
        aria-label="Leitor de QR do evento"
        muted
        playsInline
        hidden={!scanning}
      />
      <form className="attendance-token-form" onSubmit={submitToken}>
        <label htmlFor="attendance-qr-token">Código do QR / Presença</label>
        <input
          id="attendance-qr-token"
          autoComplete="off"
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
          placeholder="Escaneie com a câmera ou cole o código aqui"
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
