import { Redirect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hiddenBehindSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { BookmarkIcon, ChevronLeftIcon } from '@/components/icons';
import { candidateName, candidateSeverity, candidateSubtitle } from '@/diagnosis/conditions';
import { isDemoDiagnoser, isLowConfidence, isSpeciesUnsure } from '@/diagnosis/confidence';
import { KINDWISE_ID } from '@/diagnosis/kindwiseMap';
import { QUESTIONS } from '@/diagnosis/questions';
import type { Answers, Candidate, Diagnosis, Severity } from '@/diagnosis/types';
import { goBackOr } from '@/lib/goBack';
import { Chip } from '@/scan/components/Chip';
import { ConfidenceBar } from '@/scan/components/ConfidenceBar';
import { DemoTag } from '@/scan/components/DemoTag';
import { FeedbackSheet } from '@/scan/components/FeedbackSheet';
import { SaveSheet } from '@/scan/components/SaveSheet';
import { saveAsPlant, saveFeedback } from '@/scan/saveScan';
import { useScanSession } from '@/scan/session';
import { listRooms } from '@/storage/plantsRepo';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

const SEVERITY: Record<Severity, { label: string; text: string; bg: string }> = {
  none: { label: 'Healthy', text: colors.healthy, bg: colors.healthyBg },
  mild: { label: 'Mild', text: colors.warning, bg: colors.warningBg },
  moderate: { label: 'Moderate', text: colors.warning, bg: colors.warningBg },
  severe: { label: 'Severe', text: colors.severe, bg: colors.severeBg },
};

const candidateKey = (c: Candidate) => c.disease?.id ?? c.conditionId ?? 'unknown';
const guessId = (c: Candidate) =>
  c.conditionId ?? (`kindwise:${c.disease?.id ?? 'unknown'}` as const);

// The name to save the plant under: first common name, else the scientific name (design 8).
function suggestedName(diagnosis: Diagnosis): string | null {
  const top = diagnosis.species?.[0];
  if (!top || isSpeciesUnsure(diagnosis)) return null;
  return top.commonNames[0] ?? top.name;
}

function scansLeftText(left: number): string {
  if (left <= 0) return 'That was your last free scan this month';
  return left === 1 ? '1 free scan left this month' : `${left} free scans left this month`;
}

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
  const db = useSQLiteContext();
  const [sheet, setSheet] = useState<'save' | 'feedback' | null>(null);
  // A fresh feedback sheet each time it opens.
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [rooms, setRooms] = useState<string[]>([]);
  const { diagnosis, result, photo, answers } = session.state;

  if (!result || result.candidates.length === 0) return <Redirect href="/scan" />;

  const [top, ...others] = result.candidates;
  const kindwise = result.diagnoserId === KINDWISE_ID;
  const healthy = top.conditionId === 'healthy';
  const topName = candidateName(top);
  const topSubtitle =
    kindwise && healthy ? 'No signs of disease or pests in this photo.' : candidateSubtitle(top);
  const species = kindwise ? result.species?.[0] : undefined;
  const speciesUnsure = isSpeciesUnsure(result);
  const topSeverity = candidateSeverity(top);
  const severity = topSeverity ? SEVERITY[topSeverity] : null;
  // Answers re-weight the model's guesses but can't make an unsure photo sure.
  const low = isLowConfidence(result) || (diagnosis !== null && isLowConfidence(diagnosis));
  const chips = answerChips(answers);
  const retake = () => router.dismissTo('/scan');

  const openSave = () => {
    setSheet('save');
    listRooms(db).then(setRooms, () => setRooms([]));
  };

  const openFeedback = () => {
    setFeedbackKey((k) => k + 1);
    setSheet('feedback');
  };

  // Close the whole scan and land on My Plants; Back there won't reopen it.
  const savePlant = async (plant: { name: string; room: string | null }) => {
    await saveAsPlant(db, session.state, plant);
    session.markPhotoStored();
    session.markPersisted();
    router.dismissTo('/plants');
  };

  const sendFeedback = async (feedback: Parameters<typeof saveFeedback>[2]) => {
    await saveFeedback(db, session.state, feedback);
    session.markPhotoStored();
    session.markPersisted();
  };

  return (
    <View style={styles.screen}>
      <View
        style={[styles.screen, { paddingTop: insets.top }]}
        {...hiddenBehindSheet(sheet !== null)}>
        <View style={styles.top}>
          <Pressable
            onPress={() => goBackOr('/scan')}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.iconButton}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[type.bodyStrong, styles.topTitle]}>Diagnosis</Text>
          <Pressable
            onPress={openSave}
            accessibilityRole="button"
            accessibilityLabel="Save to My Plants"
            style={styles.iconButton}>
            <BookmarkIcon color={colors.text} size={22} />
          </Pressable>
        </View>

        <ScrollView testID="result-scroll" contentContainerStyle={styles.content}>
          <View style={styles.photoWrap}>
            {photo && (
              <Image
                source={{ uri: photo.uri }}
                style={StyleSheet.absoluteFill}
                accessibilityLabel="Your photo"
                resizeMode="cover"
              />
            )}
            <View style={styles.photoChip}>
              <Text style={[type.small, styles.photoChipText]}>
                {kindwise ? 'Saved on your phone only' : 'Scanned on your phone'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            {low && (
              <View style={styles.unsure}>
                <Text style={[type.bodyStrong, styles.unsureTitle]}>{"We're not sure yet"}</Text>
                <Text style={[type.small, styles.unsureBody]}>
                  {healthy
                    ? "Looks healthy, but the photo isn't clear enough to be sure."
                    : 'A clearer photo of the sick leaf will give a better answer.'}
                </Text>
              </View>
            )}
            {kindwise && (
              <View
                accessible
                accessibilityLabel={
                  species && !speciesUnsure
                    ? `${species.name}${species.commonNames[0] ? `, ${species.commonNames[0]}` : ''}, ${Math.round(species.probability * 100)} percent likely`
                    : 'Species not sure'
                }>
                {species && !speciesUnsure ? (
                  <>
                    <Text style={[type.label, styles.label]} numberOfLines={2}>
                      {species.name}
                    </Text>
                    <Text style={[type.small, styles.subtitle]}>
                      {species.commonNames[0] ? `${species.commonNames[0]} · ` : ''}species match{' '}
                      {Math.round(species.probability * 100)}%
                    </Text>
                  </>
                ) : (
                  <Text style={[type.label, styles.label]}>Species not sure</Text>
                )}
              </View>
            )}
            <View style={styles.heading}>
              <View style={styles.labelRow}>
                <Text style={[type.label, styles.label]}>Most likely</Text>
                {isDemoDiagnoser(result.diagnoserId) && <DemoTag full />}
              </View>
              <View style={styles.nameRow}>
                <Text
                  accessibilityRole="header"
                  accessibilityLabel={topName}
                  numberOfLines={2}
                  style={[type.title, styles.name]}>
                  {topName}
                </Text>
                {severity && (
                  <View style={[styles.severity, { backgroundColor: severity.bg }]}>
                    <Text style={[type.label, { color: severity.text }]}>{severity.label}</Text>
                  </View>
                )}
              </View>
              {topSubtitle && <Text style={[type.body, styles.subtitle]}>{topSubtitle}</Text>}
            </View>
            <ConfidenceBar value={top.confidence} label="Diagnosis confidence" />
            {others.length > 0 && (
              <View style={styles.others}>
                <Text style={[type.small, styles.othersTitle]}>Other possibilities</Text>
                {others.map((c) => (
                  <View key={candidateKey(c)} style={styles.otherRow}>
                    <Text
                      style={[type.body, styles.otherName]}
                      numberOfLines={2}
                      accessibilityLabel={candidateName(c)}>
                      {candidateName(c)}
                    </Text>
                    <Text style={[type.body, styles.otherValue]}>
                      {Math.round(c.confidence * 100)}%
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.answers}>
            <View style={styles.answersHeader}>
              <Text style={[type.small, styles.othersTitle]}>
                {chips.length > 0 ? 'Based on your answers' : ''}
              </Text>
              <TextButton label="Doesn't look right?" onPress={openFeedback} />
            </View>
            {chips.length > 0 && (
              <View style={styles.chips}>
                {chips.map((chip) => (
                  <Chip key={chip} label={chip} />
                ))}
              </View>
            )}
            {typeof result.scansLeft === 'number' && (
              <Text style={[type.small, styles.subtitle]}>{scansLeftText(result.scansLeft)}</Text>
            )}
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
          {healthy && kindwise ? (
            <>
              <Button label="Save to My Plants" onPress={openSave} />
              <TextButton label="Scan another" onPress={retake} />
            </>
          ) : low ? (
            <>
              <Button label="Retake photo" onPress={retake} />
              <TextButton
                label="See treatment plan anyway"
                onPress={() => router.push('/scan/treatment')}
              />
            </>
          ) : (
            <>
              <Button label="See treatment plan" onPress={() => router.push('/scan/treatment')} />
              <TextButton label="Retake photo" onPress={retake} />
            </>
          )}
        </View>
      </View>

      <SaveSheet
        visible={sheet === 'save'}
        rooms={rooms}
        suggestedName={suggestedName(result)}
        onSave={savePlant}
        onClose={() => setSheet(null)}
      />
      <FeedbackSheet
        key={feedbackKey}
        visible={sheet === 'feedback'}
        conditionName={topName}
        alternatives={others.map((c) => ({ id: guessId(c), name: candidateName(c) }))}
        onSubmit={sendFeedback}
        onClose={() => setSheet(null)}
      />
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
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: colors.text },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
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
  unsure: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningBg,
    gap: 2,
  },
  unsureTitle: { color: colors.warning },
  unsureBody: { color: colors.text },
  heading: { gap: 6 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { color: colors.textSecondary, textTransform: 'uppercase' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: { flexShrink: 1, color: colors.text },
  severity: {
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  subtitle: { color: colors.textSecondary },
  others: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  othersTitle: {
    color: colors.textSecondary,
    fontFamily: type.chip.fontFamily,
  },
  otherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  otherName: { flexShrink: 1, color: colors.text },
  otherValue: { color: colors.textSecondary },
  answers: { gap: spacing.sm },
  answersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bottom: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
