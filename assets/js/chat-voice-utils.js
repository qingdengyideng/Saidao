(function (global) {
    const DEFAULT_WAVEFORM_BUCKETS = 32;
    const DEFAULT_WAVEFORM_VALUE = 0.35;
    const VOICE_MIME_TYPES = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
    ];

    function formatVoiceDuration(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(safeSeconds / 60);
        const remainingSeconds = safeSeconds % 60;
        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    function formatVoiceDurationSeconds(seconds) {
        const safeSeconds = Math.max(1, Math.min(Math.round(Number(seconds) || 0), 60));
        return `${safeSeconds}"`;
    }

    function getVoiceBubbleWidth(seconds) {
        const safeSeconds = Math.max(1, Math.min(Number(seconds) || 1, 60));
        return Math.ceil(92 + ((safeSeconds - 1) / 59) * 184);
    }

    function clampWaveform(waveform, bucketCount = DEFAULT_WAVEFORM_BUCKETS) {
        const safeBucketCount = Math.max(1, Math.min(Number(bucketCount) || DEFAULT_WAVEFORM_BUCKETS, 64));
        const values = Array.isArray(waveform) ? waveform.slice(0, safeBucketCount) : [];

        if (values.length === 0) {
            return Array(safeBucketCount).fill(DEFAULT_WAVEFORM_VALUE);
        }

        while (values.length < safeBucketCount) {
            values.push(DEFAULT_WAVEFORM_VALUE);
        }

        return values.map((value) => {
            const number = Number(value);
            if (!Number.isFinite(number)) return 0;
            return Math.max(0, Math.min(number, 1));
        });
    }

    function buildWaveformFromSamples(samples, bucketCount = DEFAULT_WAVEFORM_BUCKETS) {
        const safeBucketCount = Math.max(1, Math.min(Number(bucketCount) || DEFAULT_WAVEFORM_BUCKETS, 64));
        if (!samples || samples.length === 0) {
            return clampWaveform([], safeBucketCount);
        }

        const bucketSize = Math.max(1, Math.ceil(samples.length / safeBucketCount));
        const waveform = [];

        for (let i = 0; i < safeBucketCount; i++) {
            const start = i * bucketSize;
            const end = Math.min(samples.length, start + bucketSize);
            let peak = 0;

            for (let j = start; j < end; j++) {
                peak = Math.max(peak, Math.abs(samples[j] || 0));
            }

            waveform.push(Math.round(Math.min(peak, 1) * 100) / 100);
        }

        return waveform;
    }

    function getSupportedVoiceMimeType() {
        if (typeof global.MediaRecorder === 'undefined' || !global.MediaRecorder.isTypeSupported) {
            return '';
        }

        return VOICE_MIME_TYPES.find((type) => global.MediaRecorder.isTypeSupported(type)) || '';
    }

    const api = {
        formatVoiceDuration,
        formatVoiceDurationSeconds,
        getVoiceBubbleWidth,
        clampWaveform,
        buildWaveformFromSamples,
        getSupportedVoiceMimeType,
        DEFAULT_WAVEFORM_BUCKETS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    global.ChatVoiceUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
