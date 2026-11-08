import Storage from 'expo-sqlite/kv-store';

const KEY = 'onboarding_seen';

// Storage trouble must never trap anyone in the intro: reaching the app matters more.
export function readSeen() {
  try {
    return Storage.getItemSync(KEY) !== null;
  } catch {
    return true;
  }
}

export function saveSeen() {
  try {
    Storage.setItemSync(KEY, '1');
  } catch {
    // The worst case is seeing the intro again next launch.
  }
}
