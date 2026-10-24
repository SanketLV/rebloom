import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button, TextButton } from '@/components/Button';
import { limitChars } from '@/lib/text';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { NAME_MAX, ROOM_MAX, validateName, validateRoom } from '@/plants/validation';
import { colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

const DEFAULT_ROOMS = ['Living room', 'Bedroom', 'Kitchen'];
// No species ID yet, so no species-based default (spec open question).
const DEFAULT_NAME = 'My plant';

type Props = {
  visible: boolean;
  // Rooms already used by saved plants.
  rooms: string[];
  onSave: (plant: { name: string; room: string | null }) => Promise<void>;
  onClose: () => void;
};

// SaveSheet artboard. Lengths are cut by whole characters in onChangeText,
// not TextInput maxLength, which counts UTF-16 units and can split an emoji.
export function SaveSheet({ visible, rooms, onSave, onClose }: Props) {
  const [name, setName] = useState(DEFAULT_NAME);
  const [room, setRoom] = useState<string | null>(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [failed, setFailed] = useState(false);

  const roomChoices = [...new Set([...DEFAULT_ROOMS, ...rooms])];
  const chosenRoom = addingRoom && newRoom.trim() ? newRoom : room;
  const valid = validateName(name).ok && (chosenRoom === null || validateRoom(chosenRoom).ok);

  const save = useSingleFlight(async () => {
    setFailed(false);
    try {
      await onSave({ name, room: chosenRoom });
    } catch {
      setFailed(true);
    }
  });

  return (
    <BottomSheet visible={visible} label="Save to My Plants" onClose={onClose}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.sheetTitle, styles.title]}>
          Save to My Plants?
        </Text>
        <Text style={[type.caption, styles.muted]}>Keep this diagnosis with your plant.</Text>
      </View>

      <View style={styles.field}>
        <Text style={[type.label, styles.muted]}>Name</Text>
        <TextInput
          accessibilityLabel="Name"
          value={name}
          onChangeText={(text) => setName(limitChars(text, NAME_MAX))}
          style={[type.bodyStrong, styles.input]}
          returnKeyType="done"
        />
      </View>

      <View style={styles.field}>
        <Text style={[type.label, styles.muted]}>Room</Text>
        <View style={styles.chips}>
          {roomChoices.map((choice) => {
            const selected = !addingRoom && room === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => {
                  setAddingRoom(false);
                  setRoom(selected ? null : choice);
                }}
                accessibilityRole="button"
                accessibilityLabel={choice}
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipOn]}>
                <Text style={[type.chip, selected ? styles.chipTextOn : styles.chipText]}>
                  {choice}
                </Text>
              </Pressable>
            );
          })}
          {!addingRoom && (
            <Pressable
              onPress={() => {
                setRoom(null);
                setAddingRoom(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="New room"
              style={[styles.chip, styles.newChip]}>
              <Text style={[type.chip, styles.newChipText]}>+ New room</Text>
            </Pressable>
          )}
        </View>
        {addingRoom && (
          <TextInput
            accessibilityLabel="New room name"
            placeholder="e.g. Balcony"
            placeholderTextColor={colors.textSecondary}
            value={newRoom}
            onChangeText={(text) => setNewRoom(limitChars(text, ROOM_MAX))}
            style={[type.bodyStrong, styles.input]}
            autoFocus
          />
        )}
      </View>

      {failed && (
        <Text accessibilityRole="alert" style={[type.caption, styles.error]}>
          {"Couldn't save the plant. Try again."}
        </Text>
      )}
      <Button label="Save plant" onPress={() => save.run()} busy={save.busy} disabled={!valid} />
      <TextButton label="Not now" onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  title: { color: colors.text },
  muted: { color: colors.textSecondary },
  field: { gap: 6 },
  input: {
    height: 50,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.onPrimary,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextOn: { color: colors.onPrimary },
  newChip: {
    borderStyle: 'dashed',
    borderColor: colors.controlBorder,
    backgroundColor: 'transparent',
  },
  newChipText: { color: colors.primary },
  error: { color: colors.severe },
});
