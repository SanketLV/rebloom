import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('png'); // flat brand colours: avoid JPEG artefacts before encoding
Config.setCrf(16);
Config.setX264Preset('slow');
Config.setColorSpace('bt709');
