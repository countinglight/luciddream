#!/usr/bin/env node

/**
 * Synthesizes the placeholder notification tones under assets/sounds/*.wav.
 * These are generated locally (plain sine-wave math, no external assets) so the
 * skeleton ships with royalty-free sounds out of the box. Swap them for real
 * recordings whenever you like — nothing else in the app cares how the .wav
 * files were produced, only that assets/sounds/<id>.wav exists.
 *
 * Run with: node scripts/generate-tones.js
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

/** One sine partial: frequency in Hz, relative amplitude (0-1). */
function tone(durationSeconds, partials, { attack = 0.005, decay = 'exp' } = {}) {
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const attackEnv = Math.min(1, t / attack);
    const releaseEnv = decay === 'exp' ? Math.exp(-3.5 * (t / durationSeconds)) : 1 - t / durationSeconds;
    const envelope = attackEnv * releaseEnv;

    let value = 0;
    for (const [freq, amp] of partials) {
      value += amp * Math.sin(2 * Math.PI * freq * t);
    }
    samples[i] = value * envelope;
  }

  return samples;
}

/** Concatenate tone segments with silence gaps in between (seconds). */
function sequence(parts) {
  const total = parts.reduce((sum, p) => sum + p.samples.length + Math.round((p.gapAfter ?? 0) * SAMPLE_RATE), 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part.samples, offset);
    offset += part.samples.length + Math.round((part.gapAfter ?? 0) * SAMPLE_RATE);
  }
  return out;
}

function normalize(samples, peak = 0.85) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const scale = peak / max;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

function writeWavFile(filePath, floatSamples) {
  const numSamples = floatSamples.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`wrote ${path.relative(process.cwd(), filePath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

const SOUNDS = {
  // Soft two-note chime, quick decay.
  chime: () =>
    normalize(
      sequence([
        { samples: tone(0.35, [[880, 1], [1318.5, 0.4]]), gapAfter: 0.05 },
        { samples: tone(0.5, [[1318.5, 1], [1760, 0.3]]) },
      ])
    ),
  // Single low, long-ringing bell.
  bell: () => normalize(tone(1.4, [[329.6, 1], [493.9, 0.5], [659.3, 0.25]], { decay: 'exp' })),
  // Urgent double-beep.
  alert: () =>
    normalize(
      sequence([
        { samples: tone(0.15, [[988, 1]], { attack: 0.002, decay: 'linear' }), gapAfter: 0.08 },
        { samples: tone(0.15, [[988, 1]], { attack: 0.002, decay: 'linear' }) },
      ])
    ),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [id, generate] of Object.entries(SOUNDS)) {
  writeWavFile(path.join(OUT_DIR, `${id}.wav`), generate());
}
