import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextButton } from '@/components/Button';
import { ChevronLeftIcon } from '@/components/icons';
import { headerLabel, isDemoDiagnoser } from '@/diagnosis/confidence';
import { QUESTIONS } from '@/diagnosis/questions';
import { DemoTag } from '@/scan/components/DemoTag';
import { useScanSession } from '@/scan/session';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

// Artboard 06 Follow-up questions: one question per step.
export default function QuestionsScreen() {
  const router = useRouter();
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  // Set once "See my diagnosis" navigates, so a double tap opens one Result.
  const leaving = useRef(false);

  const { diagnosis, answers, photo } = session.state;
  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const answer = answers[question.id];

  // Android Back steps back through the questions before leaving them.
  useFocusEffect(
    useCallback(() => {
      if (step === 0) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setStep((s) => s - 1);
        return true;
      });
      return () => subscription.remove();
    }, [step]),
  );

  // Back on Result lands here again: allow "See my diagnosis" once more.
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
    }, []),
  );

  if (!diagnosis) return <Redirect href="/scan" />;

  const next = () => {
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    session.finish();
    router.push('/scan/result');
  };

  const back = () => (step === 0 ? router.back() : setStep(step - 1));

  const notSure = () => {
    session.answer(question.id, 'not_sure');
    next();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* The iOS back swipe would skip the earlier questions; only allow it on the first. */}
      <Stack.Screen options={{ gestureEnabled: step === 0 }} />
      <View style={styles.top}>
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? 'Back to camera' : 'Previous question'}
          style={styles.back}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <View
          style={styles.bars}
          accessible
          accessibilityLabel={`Question ${step + 1} of ${QUESTIONS.length}`}>
          {QUESTIONS.map((q, i) => (
            <View key={q.id} style={[styles.bar, i <= step && styles.barOn]} />
          ))}
        </View>
        <Text style={[type.chip, styles.count]}>
          {step + 1} of {QUESTIONS.length}
        </Text>
      </View>

      <ScrollView testID="questions-scroll" contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {photo && (
            <Image
              source={{ uri: photo.uri }}
              style={styles.thumb}
              accessibilityIgnoresInvertColors
            />
          )}
          <View style={styles.cardText}>
            <Text style={[type.bodyStrong, styles.cardTitle]}>{headerLabel(diagnosis)}</Text>
            <Text style={[type.small, styles.cardBody]}>
              Two causes look alike. Your answers decide.
            </Text>
            {isDemoDiagnoser(diagnosis.diagnoserId) && <DemoTag />}
          </View>
        </View>

        <Text accessibilityRole="header" style={[type.title, styles.question]}>
          {question.text}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={question.text}
          style={styles.options}>
          {question.options.map((option) => {
            const checked = answer === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => session.answer(question.id, option.id)}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked }}
                style={[styles.option, checked && styles.optionOn]}>
                <View style={[styles.ring, checked && styles.ringOn]}>
                  {checked && <View style={styles.dot} />}
                </View>
                <Text style={[type.bodyStrong, styles.optionText]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.notSure}>
          <TextButton label="I'm not sure" onPress={notSure} />
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button
          label={isLast ? 'See my diagnosis' : 'Continue'}
          disabledLabel="Pick an answer"
          disabled={!answer}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', gap: 6, paddingRight: spacing.sm },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.disabled },
  barOn: { backgroundColor: colors.primary },
  count: { color: colors.textSecondary, paddingRight: spacing.md },
  content: { padding: spacing.xl - 4, gap: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm - 2, backgroundColor: colors.photoBg },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontFamily: type.button.fontFamily },
  cardBody: { color: colors.textSecondary },
  question: { color: colors.text, marginTop: spacing.sm },
  options: { gap: spacing.md - 2 },
  option: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionOn: { borderWidth: 2, borderColor: colors.primary },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionText: { flex: 1, color: colors.text },
  notSure: { alignItems: 'flex-start' },
  bottom: { paddingHorizontal: spacing.xl - 4, paddingTop: spacing.md },
});
