import type { ImageSourcePropType } from 'react-native';

type OnboardingScreen = {
  photo: ImageSourcePropType;
  // How far the photo moves up, see photoFrame.
  focus: number;
  title: string;
  body: string;
};

export const SCREENS: readonly OnboardingScreen[] = [
  {
    photo: require('../../assets/onboarding/welcome.webp'),
    focus: 0.24,
    title: "Find out what's wrong with your plant",
    body: 'Snap a photo for a free diagnosis. No account, no card.',
  },
  {
    photo: require('../../assets/onboarding/scan.webp'),
    focus: 0.21,
    title: 'One leaf, one photo',
    body: 'Photograph the leaf that worries you, close up, in good light. A few quick questions narrow it down.',
  },
  {
    photo: require('../../assets/onboarding/reminders.webp'),
    focus: 0.2,
    title: 'A check-in on day 7',
    body: "Start a treatment and we'll remind you to take a new photo, so you can see if it's working.",
  },
  {
    photo: require('../../assets/onboarding/ready.webp'),
    focus: 0.1,
    title: "Let's look at your plant",
    body: 'Start with the one that worries you most.',
  },
];
