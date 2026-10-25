import { Redirect, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hiddenBehindSheet } from '@/components/BottomSheet';
import { CheckIcon, LockIcon } from '@/components/icons';
import { isDemoDiagnoser, isLowConfidence } from '@/diagnosis/confidence';
import { diagnoser } from '@/diagnosis/engine';
import type { PreparedPhoto } from '@/diagnosis/types';
import { DemoTag } from '@/scan/components/DemoTag';
import { ErrorState } from '@/scan/components/ErrorState';
import { LowConfidenceSheet } from '@/scan/components/LowConfidenceSheet';
import { DiagnosisError, runDiagnosis, type Step } from '@/scan/runDiagnosis';
import { useScanSession } from '@/scan/session';
import { cameraColors, colors, radius, spacing, type } from '@/theme/tokens';

const STEPS = ['Photo ready', 'Checking color, spots and edges', 'Comparing likely causes'];

type Phase = 'running' | 'low' | 'error';

// Artboard 05 Analyzing. Replaces itself with Questions, so Back from there
// never lands here again. Back while running cancels and returns to Camera.
export default function AnalyzingScreen() {
  const router = useRouter();
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('running');
  const [done, setDone] = useState(0);
  // Bumped by "Try again" to run once more.
  const [attempt, setAttempt] = useState(0);

  const { state } = session;
  const hasPhoto = state.sourceUri !== null || state.photo !== null;

  const run = useEffectEvent((signal: AbortSignal) => {
    const onStep = (step: Step, photo: PreparedPhoto) => {
      // The session owns the prepared photo from here on: it shows on screen
      // and gets deleted if the user leaves, even mid-diagnosis.
      if (step === 'prepared') session.setPrepared(photo);
      setDone(step === 'prepared' ? 1 : 2);
      // Announced on both platforms rather than via a live region, which iOS lacks.
      AccessibilityInfo.announceForAccessibility(
        step === 'prepared' ? `${STEPS[0]}. ${STEPS[1]}` : STEPS[2],
      );
    };
    runDiagnosis(
      { scanId: state.scanId, sourceUri: state.sourceUri, prepared: state.photo },
      { diagnoser, signal, onStep },
    ).then(
      ({ photo, diagnosis }) => {
        if (signal.aborted) return;
        session.setPrepared(photo);
        session.setDiagnosis(diagnosis);
        if (isLowConfidence(diagnosis)) setPhase('low');
        else router.replace('/scan/questions');
      },
      (error: unknown) => {
        if (signal.aborted || (error instanceof DiagnosisError && error.kind === 'aborted')) return;
        // Keep a prepared photo so Try again goes straight to diagnosing.
        if (error instanceof DiagnosisError && error.photo) session.setPrepared(error.photo);
        setPhase('error');
      },
    );
  });

  useEffect(() => {
    if (!hasPhoto) return;
    const controller = new AbortController();
    run(controller.signal);
    return () => controller.abort();
    // `hasPhoto` never changes while this screen is up; `attempt` drives retries.
  }, [attempt, hasPhoto]);

  if (!hasPhoto) return <Redirect href="/scan" />;

  const backToCamera = () => router.dismissTo('/scan');

  if (phase === 'error') {
    return (
      <ErrorState
        onRetry={() => {
          setDone(0);
          setPhase('running');
          setAttempt((n) => n + 1);
        }}
        onScanAnother={backToCamera}
      />
    );
  }

  const photoUri = state.photo?.uri ?? state.sourceUri ?? undefined;

  return (
    <View style={styles.screen}>
      <View style={styles.screen} {...hiddenBehindSheet(phase === 'low')}>
        <View style={[styles.photoArea, { paddingTop: insets.top }]}>
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              accessibilityLabel="Your photo being analyzed"
            />
          )}
          <View style={[styles.chip, { top: insets.top + spacing.xl }]}>
            <Text style={[type.chip, styles.chipText]}>Analyzing on your phone</Text>
          </View>
        </View>

        <View style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[type.title, styles.title]}>
              Reading the leaf…
            </Text>
            {isDemoDiagnoser(diagnoser.id) && <DemoTag />}
          </View>
          <View style={styles.steps}>
            {STEPS.map((label, index) => (
              <StepRow
                key={label}
                label={label}
                status={index < done ? 'done' : index === done ? 'active' : 'pending'}
              />
            ))}
          </View>
          <View style={styles.spacer} />
          <View style={styles.footer}>
            <LockIcon color={colors.textSecondary} size={16} />
            <Text style={[type.caption, styles.footerText]}>Your photo stays on your phone</Text>
          </View>
        </View>
      </View>

      <LowConfidenceSheet
        visible={phase === 'low'}
        onRetake={backToCamera}
        onUseAnyway={() => router.replace('/scan/questions')}
      />
    </View>
  );
}

function StepRow({ label, status }: { label: string; status: 'done' | 'active' | 'pending' }) {
  return (
    <View
      style={styles.step}
      accessibilityLabel={`${label}${status === 'done' ? ', done' : status === 'active' ? ', in progress' : ''}`}>
      {status === 'done' ? (
        <View style={styles.doneDot}>
          <CheckIcon color={colors.onPrimary} size={14} strokeWidth={3} />
        </View>
      ) : status === 'active' ? (
        <View style={styles.dotSlot}>
          <View style={styles.activeDot} />
        </View>
      ) : (
        <View style={styles.pendingDot} />
      )}
      <Text style={[type.bodyStrong, status === 'pending' ? styles.pendingText : styles.stepText]}>
        {label}
      </Text>
    </View>
  );
}

const DOT = 26;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cameraColors.ground },
  photoArea: {
    height: '60%',
    backgroundColor: cameraColors.analyzing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: 260,
    height: 260,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.reward,
  },
  chip: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: cameraColors.overlay,
  },
  chipText: { color: cameraColors.text },
  card: {
    flex: 1,
    marginTop: -spacing.xxl,
    borderTopLeftRadius: spacing.xxl,
    borderTopRightRadius: spacing.xxl,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl + 4,
    gap: spacing.lg + 2,
  },
  heading: { gap: spacing.sm },
  title: { color: colors.text },
  steps: { gap: spacing.md + 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doneDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.healthy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSlot: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.reward,
  },
  pendingDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.controlBorder,
  },
  stepText: { color: colors.text },
  pendingText: { color: colors.textSecondary, fontFamily: type.body.fontFamily },
  spacer: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerText: { color: colors.textSecondary },
});
