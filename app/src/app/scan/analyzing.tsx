import { Redirect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useEffectEvent, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hiddenBehindSheet } from '@/components/BottomSheet';
import { CheckIcon, LockIcon } from '@/components/icons';
import { isDemoDiagnoser, isLowConfidence } from '@/diagnosis/confidence';
import { diagnoser } from '@/diagnosis/engine';
import { KINDWISE_ID } from '@/diagnosis/kindwiseMap';
import type { PreparedPhoto } from '@/diagnosis/types';
import { DemoTag } from '@/scan/components/DemoTag';
import { ErrorState } from '@/scan/components/ErrorState';
import { LowConfidenceSheet } from '@/scan/components/LowConfidenceSheet';
import { TipsSheet } from '@/scan/components/TipsSheet';
import { DiagnosisError, runDiagnosis, type DiagnosisErrorKind, type Step } from '@/scan/runDiagnosis';
import { beginPendingScan, markScanReady } from '@/scan/saveScan';
import { useScanSession } from '@/scan/session';
import { cameraColors, colors, radius, spacing, type } from '@/theme/tokens';

// The fake checks on the phone; Kindwise gets the photo, so its copy says so (design 1).
const DEMO_STEPS = ['Photo ready', 'Checking color, spots and edges', 'Comparing likely causes'];
const KINDWISE_STEPS = ['Photo ready', 'Sending to our diagnosis service', 'Comparing likely causes'];
const SLOW_MS = 8_000;
const SLOW_TEXT = 'Still checking. This can take up to 20 seconds.';

type Phase = 'running' | 'low' | 'error';
type Failure = { kind: DiagnosisErrorKind; resetsAt: string | null };

const NOT_COUNTED = "This didn't use a free scan.";

// "1 December" in the phone's own format; the server sends UTC.
function resetDay(resetsAt: string | null): string {
  if (!resetsAt || Number.isNaN(Date.parse(resetsAt))) return 'at the start of next month';
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });
  return `on ${day.format(new Date(resetsAt))}`;
}

// Artboard 05 Analyzing. Replaces itself with Questions, so Back from there
// never lands here again. Back while running cancels and returns to Camera.
export default function AnalyzingScreen() {
  const router = useRouter();
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<Phase>('running');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [slow, setSlow] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const kindwise = diagnoser.id === KINDWISE_ID;
  const STEPS = kindwise ? KINDWISE_STEPS : DEMO_STEPS;
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
    const scanId = state.scanId;
    // Kindwise: the stored photo and a pending row exist before the photo leaves the phone, so a
    // killed app can still finish this scan from My Plants (plan D5).
    const beforeDiagnose = kindwise
      ? async (photo: PreparedPhoto) => {
          await beginPendingScan(db, scanId, diagnoser.id, photo);
          session.markPending();
        }
      : undefined;
    runDiagnosis(
      { scanId, sourceUri: state.sourceUri, prepared: state.photo },
      { diagnoser, signal, onStep, beforeDiagnose },
    ).then(
      async ({ photo, diagnosis }) => {
        if (signal.aborted) return;
        if (kindwise) {
          // If this write fails the row stays pending and My Plants fetches the result again.
          await markScanReady(db, scanId, diagnosis).then(
            () => session.markReady(),
            () => {},
          );
          if (signal.aborted) return;
        }
        session.setPrepared(photo);
        session.setDiagnosis(diagnosis);
        if (isLowConfidence(diagnosis)) setPhase('low');
        else router.replace('/scan/questions');
      },
      (error: unknown) => {
        if (signal.aborted || (error instanceof DiagnosisError && error.kind === 'aborted')) return;
        // Keep a prepared photo so Try again goes straight to diagnosing.
        if (error instanceof DiagnosisError && error.photo) session.setPrepared(error.photo);
        const kind = error instanceof DiagnosisError ? error.kind : 'diagnose';
        // Not a plant: nothing to finish later, and the server gave the scan back.
        if (kind === 'not_plant') session.discard();
        setFailure({ kind, resetsAt: error instanceof DiagnosisError ? error.resetsAt : null });
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

  // Kindwise takes a while: after 8 s say so, once, to screen readers too (review.md rule).
  useEffect(() => {
    if (!kindwise || phase !== 'running') return;
    const timer = setTimeout(() => {
      setSlow(true);
      AccessibilityInfo.announceForAccessibility(SLOW_TEXT);
    }, SLOW_MS);
    return () => clearTimeout(timer);
  }, [kindwise, phase, attempt]);

  if (!hasPhoto) return <Redirect href="/scan" />;

  const backToCamera = () => router.dismissTo('/scan');
  // Closes the scan; a pending one waits in My Plants.
  const scanLater = () => router.dismissTo('/plants');
  const retry = {
    label: 'Try again',
    onPress: () => {
      setDone(0);
      setSlow(false);
      setFailure(null);
      setPhase('running');
      setAttempt((n) => n + 1);
    },
  };

  if (phase === 'error') {
    const checked = state.photo?.uri ?? null;
    switch (failure?.kind) {
      case 'not_plant':
        return (
          <View style={styles.fill}>
            <View style={styles.fill} {...hiddenBehindSheet(tipsOpen)}>
              <ErrorState
                photoUri={checked}
                title="This doesn't look like a plant"
                body={`Try again with a leaf filling most of the photo. ${NOT_COUNTED}`}
                primary={{ label: 'Retake photo', onPress: backToCamera }}
                secondary={{ label: 'Photo tips', onPress: () => setTipsOpen(true) }}
              />
            </View>
            <TipsSheet visible={tipsOpen} onClose={() => setTipsOpen(false)} />
          </View>
        );
      case 'quota':
        return (
          <ErrorState
            photoUri={checked}
            title="You've used your 3 free scans this month"
            body={`They reset ${resetDay(failure.resetsAt)}. Your photo is saved on your phone, so you can check it then.`}
            primary={{ label: 'Done', onPress: scanLater }}
          />
        );
      case 'busy':
        return (
          <ErrorState
            title="Diagnosis is busy today"
            body={`Lots of people are scanning. Try again tomorrow. ${NOT_COUNTED}`}
            primary={{ label: 'Done', onPress: scanLater }}
          />
        );
      case 'offline':
        return (
          <ErrorState
            title="Can't diagnose without internet"
            body={`Your photo is saved on your phone. Connect and try again. ${NOT_COUNTED}`}
            primary={retry}
            secondary={{ label: 'Scan later', onPress: scanLater }}
          />
        );
      case 'server':
        return (
          <ErrorState
            title="We couldn't check this photo"
            body={`Something went wrong on our side. Your photo is saved on your phone. ${NOT_COUNTED}`}
            primary={retry}
            secondary={{ label: 'Scan later', onPress: scanLater }}
          />
        );
      case 'pending':
      case 'timeout':
        // Kindwise may already have it (and counted it): don't promise it was free.
        if (kindwise) {
          return (
            <ErrorState
              title="Still checking your photo"
              body="This is taking longer than usual. Your photo is saved on your phone, and the answer will wait for you in My Plants."
              primary={retry}
              secondary={{ label: 'Scan later', onPress: scanLater }}
            />
          );
        }
        break;
    }
    return (
      <ErrorState
        primary={retry}
        secondary={{ label: 'Scan another plant', onPress: backToCamera }}
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
            <Text style={[type.chip, styles.chipText]}>
              {kindwise ? 'Checking your photo' : 'Analyzing on your phone'}
            </Text>
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
          {slow && <Text style={[type.small, styles.slow]}>{SLOW_TEXT}</Text>}
          <View style={styles.spacer} />
          {kindwise ? (
            <Text style={[type.caption, styles.footerText]}>
              An automated check. Your photo is sent without its location, and our diagnosis
              partner deletes its copy once you have the result.
            </Text>
          ) : (
            <View style={styles.footer}>
              <LockIcon color={colors.textSecondary} size={16} />
              <Text style={[type.caption, styles.footerText]}>Your photo stays on your phone</Text>
            </View>
          )}
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
  fill: { flex: 1, backgroundColor: colors.bg },
  slow: { color: colors.textSecondary },
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
