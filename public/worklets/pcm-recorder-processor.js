/**
 * PCM Recorder Worklet
 *
 * Runs on the browser's Audio Worklet thread (not the main thread) — takes
 * the microphone's raw audio (Float32, range -1.0 to 1.0) and converts it to
 * the format Gemini Live API expects: 16-bit PCM, little-endian.
 *
 * Uses AudioWorklet instead of the older ScriptProcessorNode because that's
 * deprecated and runs on the main thread, which causes audio stutter.
 *
 * Each full batch of samples is posted back to the main thread via
 * port.postMessage, where it gets base64-encoded and sent to Gemini over
 * the WebSocket.
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // mono, first channel only
    if (!channelData || channelData.length === 0) return true;

    // Float32 (-1.0 to 1.0) -> Int16 PCM
    const pcm16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
