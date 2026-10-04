const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const TMP_DIR = path.join(__dirname, 'tmp');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: 800 * 1024 * 1024,
  },
});

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
    });
  });
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

app.use(
  '/videos',
  express.static(OUTPUT_DIR, {
    maxAge: '30d',
    etag: true,
    lastModified: true,
  })
);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'UNERA video service running',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    ffmpeg: true,
    tmp_dir: TMP_DIR,
    output_dir: OUTPUT_DIR,
  });
});

app.post('/prepare-video', upload.single('file'), async (req, res) => {
  const inputFile = req.file;

  if (!inputFile) {
    return res.status(400).json({
      success: false,
      error: 'file is required',
    });
  }

  const inputPath = inputFile.path;
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const feedPath = path.join(OUTPUT_DIR, `${id}-feed.mp4`);
  const playPath = path.join(OUTPUT_DIR, `${id}-play.mp4`);
  const thumbPath = path.join(OUTPUT_DIR, `${id}-thumb.jpg`);

  try {
    // Run feed + play versions in parallel for faster total time
    await Promise.all([
      runFfmpeg([
        '-y',
        '-i', inputPath,
        '-vf', 'scale=-2:480,fps=24',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '31',
        '-maxrate', '700k',
        '-bufsize', '1400k',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        feedPath,
      ]),
      runFfmpeg([
        '-y',
        '-i', inputPath,
        '-vf', 'scale=-2:720,fps=30',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '27',
        '-maxrate', '1800k',
        '-bufsize', '3600k',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        playPath,
      ]),
      runFfmpeg([
        '-y',
        '-i', inputPath,
        '-ss', '00:00:01',
        '-vframes', '1',
        '-vf', 'scale=-2:720',
        thumbPath,
      ]),
    ]);

    return res.json({
      success: true,
      video: {
        feed: `/videos/${path.basename(feedPath)}`,
        play: `/videos/${path.basename(playPath)}`,
        thumbnail: `/videos/${path.basename(thumbPath)}`,
      },
    });
  } catch (err) {
    safeUnlink(feedPath);
    safeUnlink(playPath);
    safeUnlink(thumbPath);

    return res.status(500).json({
      success: false,
      error: err?.message || 'Video preparation failed',
    });
  } finally {
    safeUnlink(inputPath);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UNERA video service listening on http://0.0.0.0:${PORT}`);
});
