// Renders every Rebloom animation into brand/kit/motion. Usage: npm run render
import {execSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';

const OUT = '../kit/motion';
mkdirSync(OUT, {recursive: true});
const run = (cmd) => execSync(cmd, {stdio: 'inherit'});

// Full-quality masters (settings in remotion.config.ts)
run(`npx remotion render RevealWide ${OUT}/rebloom-reveal-1920x1080.mp4`);
run(`npx remotion render RevealSquare ${OUT}/rebloom-reveal-1080x1080.mp4`);
run(`npx remotion render RevealTall ${OUT}/rebloom-reveal-1080x1920.mp4`);
run(`npx remotion render Recovery ${OUT}/rebloom-recovery-1080x1080.mp4`);

// Web version of Recovery for the brand book hero: 720 px, and a keyframe every 6 frames
// so the Day slider can seek to any point instantly.
run(`npx remotion ffmpeg -y -i ${OUT}/rebloom-recovery-1080x1080.mp4 -vf scale=720:720:flags=lanczos -c:v libx264 -crf 20 -preset slow -g 6 -keyint_min 6 -pix_fmt yuv420p -movflags +faststart -an ${OUT}/recovery-web.mp4`);
run(`npx remotion still Recovery out/recovery-poster.png --frame=0`); // Day 1: what the hero shows before it plays
run(`npx remotion ffmpeg -y -i out/recovery-poster.png -vf scale=720:720:flags=lanczos ${OUT}/recovery-web-poster.png`);
run(`npx remotion still RevealWide ${OUT}/rebloom-reveal-poster.png --frame=329`);
