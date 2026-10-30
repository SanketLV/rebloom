import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import type { ConditionId } from '@/diagnosis/types';
import { useSingleFlight } from '@/lib/useSingleFlight';
import type { UserGuess, Verdict } from '@/storage/scansRepo';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

type Props = {
  visible: boolean;
  conditionName: string;
  // The other likely causes, offered when the user says "No".
  alternatives: { id: ConditionId; name: string }[];
  onSubmit: (feedback: { verdict: Verdict; userGuess: UserGuess | null }) => Promise<void>;
  onClose: () => void;
};

// FeedbackSheet artboard. Nothing reviews the answer yet, so the copy only
// says it's saved: no "second look", no promise that it improves anything.
export function FeedbackSheet({ visible, conditionName, alternatives, onSubmit, onClose }: Props) {
  const [mode, setMode] = useState<'ask' | 'guess' | 'thanks'>('ask');
  const [guess, setGuess] = useState<UserGuess | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = useSingleFlight(async (verdict: Verdict, userGuess: UserGuess | null) => {
    setFailed(false);
    try {
      await onSubmit({ verdict, userGuess });
      setMode('thanks');
    } catch {
      setFailed(true);
    }
  });

  const guesses: { id: UserGuess; name: string }[] = [
    ...alternatives,
    { id: 'something_else', name: 'Something else' },
  ];
  const title = mode === 'guess' ? 'What do you think it is?' : `Was "${conditionName}" right?`;

  return (
    <BottomSheet visible={visible} label="Diagnosis feedback" onClose={onClose}>
      {mode === 'thanks' ? (
        <View style={styles.thanks}>
          <Text accessibilityRole="header" style={[type.sheetTitle, styles.title]}>
            Thanks! Your answer is saved.
          </Text>
          <Button label="Done" onPress={onClose} />
        </View>
      ) : (
        <>
          <Text accessibilityRole="header" style={[type.sheetTitle, styles.title]}>
            {title}
          </Text>
          {mode === 'ask' ? (
            <View style={styles.row}>
              {(
                [
                  ['Yes', 'yes'],
                  ['Not sure', 'not_sure'],
                ] as const
              ).map(([label, verdict]) => (
                <Answer
                  key={verdict}
                  label={label}
                  disabled={submit.busy}
                  onPress={() => submit.run(verdict, null)}
                />
              ))}
              <Answer label="No" disabled={submit.busy} onPress={() => setMode('guess')} />
            </View>
          ) : (
            <>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={title}
                style={styles.guesses}>
                {guesses.map((g) => {
                  const checked = guess === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setGuess(g.id)}
                      accessibilityRole="radio"
                      accessibilityLabel={g.name}
                      accessibilityState={{ checked }}
                      style={[styles.guess, checked && styles.guessOn]}>
                      <Text style={[type.bodyStrong, styles.text]}>{g.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                label="Save my answer"
                disabled={guess === null}
                busy={submit.busy}
                onPress={() => submit.run('no', guess)}
              />
            </>
          )}
          {failed && (
            <Text accessibilityRole="alert" style={[type.caption, styles.error]}>
              {"Couldn't save your answer. Try again."}
            </Text>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function Answer({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.answer}>
      <Text style={[type.bodyStrong, styles.text]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text },
  thanks: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  answer: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.onPrimary,
  },
  guesses: { gap: spacing.sm },
  guess: {
    minHeight: Math.max(touchTarget, 48),
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.onPrimary,
  },
  guessOn: { borderWidth: 2, borderColor: colors.primary },
  text: { color: colors.text },
  error: { color: colors.severe },
});
