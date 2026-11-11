// Opens a video file for frame extraction with an HTMLVideoElement (plays iPhone
// .mov/HEVC and .mp4 on iPad). Per §10.3: for each time, set `currentTime`, wait
// for `seeked` (and `requestVideoFrameCallback` when available, so the frame is
// actually presented), then draw the element to a canvas. Audio is ignored.
export interface VideoHandle {
  element: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
  /** Seeks to `time` seconds and resolves once that frame is ready to draw. */
  seek(time: number): Promise<void>;
  dispose(): void;
}

function once(target: EventTarget, type: string, timeoutMs: number, failOn?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(type, onOk);
      if (failOn) target.removeEventListener(failOn, onFail);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onFail = () => {
      cleanup();
      reject(new Error("This video can't be read."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out reading the video.'));
    }, timeoutMs);
    target.addEventListener(type, onOk);
    if (failOn) target.addEventListener(failOn, onFail);
  });
}

type FrameCallbackVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

/** Waits for a newly presented frame when the browser can tell us; never blocks for long if it can't. */
function frameReady(video: FrameCallbackVideo): Promise<void> {
  if (!video.requestVideoFrameCallback) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 250);
    video.requestVideoFrameCallback!(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function openVideo(file: Blob): Promise<VideoHandle> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as FrameCallbackVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  const dispose = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
  try {
    video.src = url;
    await once(video, 'loadedmetadata', 15000, 'error');
    if (video.readyState < 2) await once(video, 'loadeddata', 15000, 'error');
    if (video.duration === Infinity) {
      // Some recordings (e.g. MediaRecorder output) don't declare a length up front; seeking far past the end
      // makes the browser work it out.
      video.currentTime = 1e7;
      await once(video, 'timeupdate', 8000, 'error');
      video.currentTime = 0;
      await once(video, 'seeked', 8000, 'error');
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth === 0) throw new Error("This video can't be read.");
  } catch (err) {
    dispose();
    throw err;
  }
  return {
    element: video,
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    async seek(time: number) {
      const t = Math.max(0, Math.min(video.duration - 0.001, time));
      if (Math.abs(video.currentTime - t) < 0.0005 && video.readyState >= 2) return;
      // Register the frame callback before seeking so it can't be missed.
      const presented = frameReady(video);
      const seeked = once(video, 'seeked', 8000, 'error');
      video.currentTime = t;
      await seeked;
      await presented;
    },
    dispose,
  };
}
