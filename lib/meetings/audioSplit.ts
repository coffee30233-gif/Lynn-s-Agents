import { SEGMENT_SECONDS } from "./constants";

// Splits a recording into fixed-length, independently-decodable WAV
// segments, entirely client-side (Web Audio API — no ffmpeg.wasm or other
// dependency needed). Each segment is transcribed by its own Gemini call
// with its own fresh 60s Vercel budget (see app/api/meetings/[meetingId]/process/route.ts).

// Downsampled to this rate regardless of the source file's — plenty for
// speech intelligibility (matches the rate used elsewhere for voice in this
// app), and keeps each segment's WAV small: 5 minutes mono 16-bit at 16kHz
// is under 10MB, comfortably under chunkedUpload.ts's 45MB per-object
// threshold even before any of that byte-level splitting would kick in.
const TARGET_SAMPLE_RATE = 16000;

export async function splitAudioIntoSegments(file: Blob): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  // Decoding happens at the file's native sample rate/channel count — only
  // the per-segment render below (OfflineAudioContext) downsamples/downmixes.
  const decodeContext = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    await decodeContext.close();
  }

  const totalDuration = audioBuffer.duration;
  const numSegments = Math.max(1, Math.ceil(totalDuration / SEGMENT_SECONDS));
  const segments: Blob[] = [];

  for (let i = 0; i < numSegments; i++) {
    const startSec = i * SEGMENT_SECONDS;
    const durationSec = Math.min(SEGMENT_SECONDS, totalDuration - startSec);

    const offlineContext = new OfflineAudioContext(1, Math.ceil(durationSec * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0, startSec, durationSec);
    const rendered = await offlineContext.startRendering();

    segments.push(encodeWav(rendered));
  }

  return segments;
}

function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const dataSize = samples.length * 2; // 16-bit mono
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (16 = no extension)
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view.buffer], { type: "audio/wav" });
}
