import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextButton } from '@/components/Button';
import { hiddenBehindSheet } from '@/components/BottomSheet';
import { CloseIcon, GalleryIcon, HelpIcon, LockIcon } from '@/components/icons';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { PermissionSheet } from '@/scan/components/PermissionSheet';
import { TipsSheet } from '@/scan/components/TipsSheet';
import { useScanSession } from '@/scan/session';
import { cameraColors, colors, radius, spacing, touchTarget, type } from '@/theme/tokens';

const FRAME = 300;
const CORNER = 40;

// Artboard 04 Camera.
export default function CameraScreen() {
  const router = useRouter();
  const session = useScanSession();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const camera = useRef<CameraView>(null);

  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [sheetClosed, setSheetClosed] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const granted = permission?.granted === true;
  const canAskAgain = permission?.canAskAgain ?? true;
  const permissionSheetOpen = permission !== null && !granted && !sheetClosed;

  // The user may grant the camera in Settings and come back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  // The preview stops while another scan screen is on top; wait for it again on return.
  useFocusEffect(
    useCallback(() => {
      return () => setReady(false);
    }, []),
  );

  async function takePhoto() {
    const picture = await camera.current?.takePictureAsync();
    return picture?.uri;
  }

  async function pickPhoto() {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    return picked.canceled ? undefined : picked.assets[0]?.uri;
  }

  // One flight for shutter and gallery: a double tap, or both at once, starts one scan.
  const start = useSingleFlight(async (source: 'camera' | 'gallery') => {
    setFailed(false);
    try {
      const uri = source === 'camera' ? await takePhoto() : await pickPhoto();
      if (!uri) return;
      session.startScan(uri);
      router.push('/scan/analyzing');
    } catch {
      setFailed(true);
    }
  });

  const sheetOpen = permissionSheetOpen || tipsOpen;

  return (
    <View style={styles.screen}>
      <View style={styles.screen} {...hiddenBehindSheet(sheetOpen)}>
        <View style={styles.preview}>
          {granted ? (
            <CameraView ref={camera} style={StyleSheet.absoluteFill} active={focused} onCameraReady={() => setReady(true)} />
          ) : (
            permission !== null &&
            !permissionSheetOpen && (
              <View style={styles.off}>
                <Text accessibilityRole="header" style={[type.sheetTitle, styles.offTitle]}>
                  Camera is off
                </Text>
                {canAskAgain ? (
                  <Button label="Allow camera" onPress={requestPermission} />
                ) : (
                  <Button label="Open Settings" onPress={Linking.openSettings} />
                )}
                <TextButton label="Choose a photo instead" onPress={() => start.run('gallery')} />
              </View>
            )
          )}
          {granted && <Corners />}
        </View>

        <View style={[styles.top, { paddingTop: insets.top + spacing.lg }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            style={styles.round}>
            <CloseIcon color={cameraColors.text} size={20} strokeWidth={2.2} />
          </Pressable>
          {granted && (
            <View style={styles.prompt}>
              <Text style={[type.chip, styles.promptText]}>Fill the frame with the sick leaf</Text>
            </View>
          )}
          <View style={styles.spacer} />
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
          {failed && <Text style={[type.small, styles.caption]}>{"Couldn't get that photo. Try again."}</Text>}
          <View style={styles.controls}>
            <Pressable
              onPress={() => start.run('gallery')}
              disabled={start.busy}
              accessibilityRole="button"
              accessibilityLabel="Choose from photos"
              style={styles.gallery}>
              <GalleryIcon color={cameraColors.buttonIcon} size={22} />
            </Pressable>
            <Pressable
              onPress={() => start.run('camera')}
              disabled={!granted || !ready || start.busy}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ disabled: !granted || !ready || start.busy, busy: start.busy }}
              style={[styles.shutter, (!granted || !ready) && styles.shutterOff]}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable
              onPress={() => setTipsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Photo tips"
              style={styles.tips}>
              <HelpIcon color={cameraColors.buttonIcon} size={22} />
            </Pressable>
          </View>
          <View style={styles.offline}>
            <LockIcon color={cameraColors.caption} size={14} />
            <Text style={[type.small, styles.caption]}>Runs on your phone · works offline</Text>
          </View>
        </View>
      </View>

      <PermissionSheet
        visible={permissionSheetOpen}
        canAskAgain={canAskAgain}
        onAllow={requestPermission}
        onOpenSettings={Linking.openSettings}
        onChoosePhoto={() => {
          setSheetClosed(true);
          start.run('gallery');
        }}
        onClose={() => setSheetClosed(true)}
      />
      <TipsSheet visible={tipsOpen} onClose={() => setTipsOpen(false)} />
    </View>
  );
}

// Lime framing corners from the artboard. Decorative.
function Corners() {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cameraColors.ground },
  preview: { flex: 1, backgroundColor: cameraColors.preview, alignItems: 'center', justifyContent: 'center' },
  off: { alignSelf: 'stretch', padding: spacing.xxl, gap: spacing.md },
  offTitle: { color: cameraColors.text, textAlign: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  round: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: cameraColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: touchTarget },
  prompt: {
    flexShrink: 1,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: cameraColors.overlay,
  },
  promptText: { color: cameraColors.text, textAlign: 'center' },
  frame: { width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.reward },
  topLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 18 },
  topRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 18 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 18 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 18 },
  bottom: { backgroundColor: cameraColors.ground, paddingTop: spacing.xl, gap: spacing.md + 2, alignItems: 'center' },
  controls: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
  },
  gallery: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: cameraColors.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: cameraColors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: { opacity: 0.4 },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: cameraColors.text },
  tips: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: cameraColors.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  caption: { color: cameraColors.caption },
});
