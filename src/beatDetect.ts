/**
 * beatDetect.ts
 * 使用 Web Audio API 分析音訊 Buffer，偵測節拍時間點（能量突波偵測）。
 * 方法：滑動窗口能量比較（Energy-based Onset Detection）
 * 輸出：節拍出現的秒數陣列，例如 [0.25, 0.75, 1.00, ...]
 */

const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const BASS_MIN = 20;
const BASS_MAX = 300;

/** 分析指定 AudioBuffer，回傳節拍時間點（秒）的陣列 */
export async function detectBeats(audioBuffer: AudioBuffer): Promise<number[]> {
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  // 使用 OfflineAudioContext 做離線分析
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  analyser.connect(offlineCtx.destination);
  source.start(0);

  // Render 整首到 OfflineContext
  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  // 計算每個 hop 的低頻能量
  const energies: number[] = [];
  const numHops = Math.floor((length - FFT_SIZE) / HOP_SIZE);

  const nyquist = sampleRate / 2;
  const binCount = FFT_SIZE / 2;
  const bassMinBin = Math.floor((BASS_MIN / nyquist) * binCount);
  const bassMaxBin = Math.ceil((BASS_MAX / nyquist) * binCount);

  for (let hop = 0; hop < numHops; hop++) {
    const offset = hop * HOP_SIZE;
    let energy = 0;

    // 手動計算低頻能量（簡化：直接對原始波形的 bass 區段平方和）
    for (let i = offset + bassMinBin; i < offset + bassMaxBin && i < channelData.length; i++) {
      energy += channelData[i] * channelData[i];
    }
    energies.push(energy);
  }

  // 滑動窗口平均能量比較 → 找出能量突波
  const WINDOW = 43; // 約 0.5 秒的 window（43 hops × 512 / 44100 ≈ 0.5s）
  const THRESHOLD = 1.4; // 高出平均多少倍才算節拍
  const COOLDOWN = 10;   // 兩個節拍之間最少幾個 hop（避免連擊）

  const beats: number[] = [];
  let lastBeatHop = -COOLDOWN;

  for (let i = WINDOW; i < energies.length; i++) {
    // 計算局部平均能量
    let avg = 0;
    for (let j = i - WINDOW; j < i; j++) avg += energies[j];
    avg /= WINDOW;

    if (energies[i] > avg * THRESHOLD && i - lastBeatHop > COOLDOWN) {
      const timeSec = (i * HOP_SIZE) / sampleRate;
      beats.push(timeSec);
      lastBeatHop = i;
    }
  }

  return beats;
}
