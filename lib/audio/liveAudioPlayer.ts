/**
 * Live API streaming audio player.
 *
 * Audio arrives one small chunk at a time and needs to play back-to-back as
 * a continuous stream — not "wait for the whole reply, then play one file"
 * like a one-shot TTS clip. Playback is scheduled via AudioBufferSourceNode
 * start times rather than calling play() as each chunk arrives, which would
 * leave audible gaps/clicks between chunks. A running "next chunk starts at
 * this time" cursor keeps chunks flush against each other.
 */
export class LiveAudioPlayer {
  private audioContext: AudioContext;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private readonly sampleRate: number;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate });
  }

  private base64ToInt16Array(base64: string): Int16Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  /** Queues one base64-encoded PCM chunk for playback. */
  async enqueueChunk(base64Pcm: string): Promise<void> {
    if (!base64Pcm) return;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const int16 = this.base64ToInt16Array(base64Pcm);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      const sample = int16[i]!;
      float32[i] = sample / (sample < 0 ? 0x8000 : 0x7fff);
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    const startTime = Math.max(this.nextStartTime, now);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
  }

  /**
   * Called when the user interrupts the AI mid-reply (Live API's
   * `interrupted: true`) — stops whatever's still queued so the old reply
   * doesn't keep playing under the new one.
   */
  interrupt(): void {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Chunk may have already finished playing naturally — ignore.
      }
    });
    this.activeSources = [];
    this.nextStartTime = this.audioContext.currentTime;
  }

  close(): void {
    this.interrupt();
    void this.audioContext.close();
  }
}
