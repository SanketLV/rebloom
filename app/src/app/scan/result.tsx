import { Redirect, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextButton } from '@/components/Button';
import { ChevronLeftIcon } from '@/components/icons';
import { CONDITIONS } from '@/diagnosis/conditions';
import { isDemoDiagnoser, isLowConfidence } from '@/diagnosis/confidence';
import { QUESTIONS } from '@/diagnosis/questions';
import type { Answers, Severity } from '@/diagnosis/types';
import { Chip } from '@/scan/components/Chip';
import { ConfidenceBar } from '@/scan/components/ConfidenceBar';
import { DemoTag } from '@/scan/components/DemoTag';
import { useScanSession } from '@/scan/session';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

const SEVERITY: Record<Severity, { label: string; text: string; bg: string }> = {
  none: { label: 'Healthy', text: colors.healthy, bg: colors.healthyBg },
  mild: { label: 'Mild', text: colors.warning, bg: colors.warningBg },
  moderate: { label: 'Moderate', text: colors.warning, bg: colors.warningBg },
  severe: { label: 'Severe', text: colors.severe, bg: colors.severeBg },
};

// "Based on your answers" chips, in question order. "I'm not sure" adds nothing.
function answerChips(answers: Answers): string[] {
  return QUESTIONS.flatMap((q) => {
    const option = q.options.find((o) => o.id === answers[q.id]);
    return option ? [option.chip] : [];
  });
}

// Artboard 07 Diagnosis result.
export default function ResultScreen() {
  const router = useRouter();
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const { result, photo, answers } = session.state;

  if (!result || result.candidates.length === 0) return <Redirect href="/scan" />;

  const [top, ...others] = result.candidates;
  const condition = CONDITIONS[top.conditionId];
  const severity = SEVERITY[condition.severity];
  const low = isLowConfidence(result);
  const chips = answerChips(answers);
  const retake = () => router.dismissTo('/scan');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text style={[type.bodyStrong, styles.topTitle]}>Diagnosis</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView testID="result-scroll" contentContainerStyle={styles.content}>
        <View style={styles.photoWrap}>
          {photo && (
            <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} accessibilityLabel="Your photo" resizeMode="cover" />
          )}
          <View style={styles.photoChip}>
            <Text style={[type.small, styles.photoChipText]}>Scanned on your phone</Text>
          </View>
        </View>

        <View style={styles.card}>
          {low && (
            <View style={styles.unsure}>
              <Text style={[type.bodyStrong, styles.unsureTitle]}>{"We're not sure yet"}</Text>
              <Text style={[type.small, styles.unsureBody]}>A clearer photo of the sick leaf will give a better answer.</Text>
            </View>
          )}
          <View style={styles.heading}>
            <View style={styles.labelRow}>
              <Text style={[type.label, styles.label]}>Most likely</Text>
              {isDemoDiagnoser(result.diagnoserId) && <DemoTag full />}
            </View>
            <View style={styles.nameRow}>
              <Text accessibilityRole="header" style={[type.title, styles.name]}>
                {condition.name}
              </Text>
              <View style={[styles.severity, { backgroundColor: severity.bg }]}>
                <Text style={[type.label, { color: severity.text }]}>{severity.label}</Text>
              </View>
            </View>
            <Text style={[type.body, styles.subtitle]}>{condition.subtitle}</Text>
          </View>
          <ConfidenceBar value={top.confidence} />
          {others.length > 0 && (
            <View style={styles.others}>
              <Text style={[type.small, styles.othersTitle]}>Other possibilities</Text>
              {others.map((c) => (
                <View key={c.conditionId} style={styles.otherRow}>
                  <Text style={[type.body, styles.otherName]}>{CONDITIONS[c.conditionId].name}</Text>
                  <Text style={[type.body, styles.otherValue]}>{Math.round(c.confidence * 100)}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {chips.length > 0 && (
          <View style={styles.answers}>
            <Text style={[type.small, styles.othersTitle]}>Based on your answers</Text>
            <View style={styles.chips}>
              {chips.map((chip) => (
                <Chip key={chip} label={chip} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        {low ? (
          <>
            <Button label="Retake photo" onPress={retake} />
            <TextButton label="See treatment plan anyway" onPress={() => router.push('/scan/treatment')} />
          </>
        ) : (
          <>
            <Button label="See treatment plan" onPress={() => router.push('/scan/treatment')} />
            <TextButton label="Retake photo" onPress={retake} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.text },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  photoWrap: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.photoBg,
    overflow: 'hidden',
  },
  photoChip: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  photoChipText: { color: colors.onPrimary },
  card: {
    marginTop: -(spacing.xl + 4),
    padding: spacing.xl - 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.md + 2,
  },
  unsure: { padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.warningBg, gap: 2 },
  unsureTitle: { color: colors.warning },
  unsureBody: { color: colors.text },
  heading: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: colors.textSecondary, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  name: { flexShrink: 1, color: colors.text },
  severity: { paddingHorizontal: spacing.md - 2, paddingVertical: 6, borderRadius: radius.pill },
  subtitle: { color: colors.textSecondary },
  others: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  othersTitle: { color: colors.textSecondary, fontFamily: type.chip.fontFamily },
  otherRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  otherName: { flexShrink: 1, color: colors.text },
  otherValue: { color: colors.textSecondary },
  answers: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bottom: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
});
