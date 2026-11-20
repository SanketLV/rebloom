import { Image, StyleSheet, Text, View } from 'react-native';

import { Button, TextButton } from '@/components/Button';
import { colors, radius, spacing, type } from '@/theme/tokens';

type Action = { label: string; onPress: () => void };

type Props = {
  title?: string;
  body?: string;
  primary: Action;
  secondary?: Action;
  // The photo that was checked, shown small above the title (not a plant, out of free scans).
  photoUri?: string | null;
};

// ErrorState artboard layout. Defaults: a photo that couldn't be read.
export function ErrorState({
  title = "We couldn't read this photo",
  body = 'Something went wrong while checking it. Try again, or scan another plant.',
  primary,
  secondary,
  photoUri,
}: Props) {
  return (
    <View style={styles.wrap}>
      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.thumb} accessibilityLabel="Your photo" />
      )}
      <Text accessibilityRole="header" style={[type.title, styles.center, styles.title]}>
        {title}
      </Text>
      <Text style={[type.body, styles.center, styles.body]}>{body}</Text>
      <View style={styles.actions}>
        <Button label={primary.label} onPress={primary.onPress} />
        {secondary && <TextButton label={secondary.label} onPress={secondary.onPress} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.bg,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    alignSelf: 'center',
    backgroundColor: colors.photoBg,
    marginBottom: spacing.sm,
  },
  center: { textAlign: 'center' },
  title: { color: colors.text },
  body: { color: colors.textSecondary },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.sm },
});
