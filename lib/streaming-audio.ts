"use client";

const MPEG_MIME_TYPE = "audio/mpeg";

export type StreamingAudioPlayback = {
  audio: HTMLAudioElement;
  mode: "media-source" | "blob";
  stop: () => void;
};

export type StreamingAudioOptions = {
  signal?: AbortSignal;
  onPlay?: (playback: StreamingAudioPlayback) => void;
  onEnded?: (playback: StreamingAudioPlayback) => void;
  onError?: (error: unknown, playback?: StreamingAudioPlayback) => void;
};

function canStreamMpegWithMediaSource() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaSource === "function" &&
    typeof window.MediaSource.isTypeSupported === "function" &&
    window.MediaSource.isTypeSupported(MPEG_MIME_TYPE)
  );
}

function arrayBufferFromChunk(chunk: Uint8Array<ArrayBufferLike>) {
  return chunk.buffer.slice(
    chunk.byteOffset,
    chunk.byteOffset + chunk.byteLength,
  ) as ArrayBuffer;
}

function waitForSourceOpen(mediaSource: MediaSource, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (mediaSource.readyState === "open") {
      resolve();
      return;
    }

    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", handleOpen);
      mediaSource.removeEventListener("sourceclose", handleClose);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      reject(new Error("media_source_closed_before_open"));
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    mediaSource.addEventListener("sourceopen", handleOpen, { once: true });
    mediaSource.addEventListener("sourceclose", handleClose, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array<ArrayBufferLike>,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
      sourceBuffer.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleUpdateEnd = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("media_source_append_failed"));
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    sourceBuffer.addEventListener("updateend", handleUpdateEnd, { once: true });
    sourceBuffer.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      sourceBuffer.appendBuffer(arrayBufferFromChunk(chunk));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function playBlobResponse(
  response: Response,
  options: StreamingAudioOptions,
) {
  const blob = await response.blob();
  if (!blob.size) throw new Error("speech_audio_empty");
  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  audio.preload = "auto";
  let stopped = false;

  const release = () => {
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(objectUrl);
  };

  const playback: StreamingAudioPlayback = {
    audio,
    mode: "blob",
    stop: () => {
      if (stopped) return;
      stopped = true;
      release();
    },
  };

  audio.onplay = () => {
    if (!stopped) options.onPlay?.(playback);
  };
  audio.onended = () => {
    if (stopped) return;
    stopped = true;
    release();
    options.onEnded?.(playback);
  };
  audio.onerror = () => {
    if (stopped) return;
    stopped = true;
    const error = audio.error ?? new Error("speech_audio_playback_failed");
    release();
    options.onError?.(error, playback);
  };

  try {
    await audio.play();
  } catch (error) {
    playback.stop();
    throw error;
  }

  return playback;
}

function playMediaSourceResponse(
  response: Response,
  options: StreamingAudioOptions,
) {
  if (!response.body) throw new Error("speech_audio_stream_missing");

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(objectUrl);
  audio.preload = "auto";
  const reader = response.body.getReader();
  let stopped = false;
  let playbackStarted = false;

  const release = () => {
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(objectUrl);
  };

  const playback: StreamingAudioPlayback = {
    audio,
    mode: "media-source",
    stop: () => {
      if (stopped) return;
      stopped = true;
      void reader.cancel().catch(() => undefined);
      release();
    },
  };

  audio.onplay = () => {
    if (!stopped) options.onPlay?.(playback);
  };
  audio.onended = () => {
    if (stopped) return;
    stopped = true;
    release();
    options.onEnded?.(playback);
  };
  audio.onerror = () => {
    if (stopped || options.signal?.aborted) return;
    stopped = true;
    const error = audio.error ?? new Error("speech_audio_playback_failed");
    void reader.cancel().catch(() => undefined);
    release();
    options.onError?.(error, playback);
  };

  void (async () => {
    try {
      await waitForSourceOpen(mediaSource, options.signal);
      if (stopped || options.signal?.aborted) return;

      const sourceBuffer = mediaSource.addSourceBuffer(MPEG_MIME_TYPE);
      sourceBuffer.mode = "sequence";

      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        await appendChunk(sourceBuffer, value, options.signal);
        if (!playbackStarted && !stopped) {
          playbackStarted = true;
          await audio.play();
        }
      }

      if (
        !stopped &&
        mediaSource.readyState === "open" &&
        !sourceBuffer.updating
      ) {
        mediaSource.endOfStream();
      }
    } catch (error) {
      if (stopped || options.signal?.aborted) return;
      stopped = true;
      void reader.cancel().catch(() => undefined);
      release();
      options.onError?.(error, playback);
    }
  })();

  return playback;
}

export async function playStreamingAudioResponse(
  response: Response,
  options: StreamingAudioOptions = {},
): Promise<StreamingAudioPlayback> {
  if (!response.ok) throw new Error(`speech_audio_${response.status}`);
  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  if (canStreamMpegWithMediaSource() && response.body) {
    return playMediaSourceResponse(response, options);
  }

  return playBlobResponse(response, options);
}
