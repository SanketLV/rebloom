import { render, screen, waitFor } from '@testing-library/react-native';
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext, SQLiteProvider } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { fakeFs } from '../fileSystemFake';
import { mockSqlite } from '../nativeMocks';

test('the file-system fake copies, sizes, deletes and checks existence', async () => {
  fakeFs.put('file:///cache/a.jpg', { size: 42 });
  const source = new File('file:///cache/a.jpg');
  const target = new File(Paths.document, 'photos', 'a.jpg');
  expect(source.exists).toBe(true);
  expect(source.size).toBe(42);

  await source.copy(target);
  expect(target.uri).toBe('file:///document/photos/a.jpg');
  expect(target.exists).toBe(true);

  source.delete();
  expect(source.exists).toBe(false);
  expect(() => source.delete()).toThrow();
});

test('the file-system fake can fail an operation on demand', async () => {
  fakeFs.put('file:///cache/a.jpg');
  fakeFs.failNext('copy');
  await expect(
    new File('file:///cache/a.jpg').copy(new File(Paths.document, 'b.jpg')),
  ).rejects.toThrow('copy failed');
});

function Rows() {
  const db = useSQLiteContext();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM t', []).then((row) =>
      setCount(row?.n ?? 0),
    );
  }, [db]);
  return <Text>{count === null ? 'loading' : `rows: ${count}`}</Text>;
}

test('the SQLite provider runs onInit before rendering children', async () => {
  const onInit = async (db: { execAsync(sql: string): Promise<void> }) => {
    await db.execAsync("CREATE TABLE t (id TEXT); INSERT INTO t VALUES ('a')");
  };
  await render(
    <SQLiteProvider databaseName="test.db" onInit={onInit}>
      <Rows />
    </SQLiteProvider>,
  );
  expect(await screen.findByText('rows: 1')).toBeOnTheScreen();
  expect(await mockSqlite.db().getAllAsync('SELECT id FROM t', [])).toEqual([{ id: 'a' }]);
});

test('the SQLite provider reports an init failure to onError', async () => {
  mockSqlite.failNextInit = new Error('disk I/O error');
  const onError = jest.fn();
  await render(
    <SQLiteProvider databaseName="test.db" onError={onError}>
      <Rows />
    </SQLiteProvider>,
  );
  await waitFor(() =>
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk I/O error' })),
  );
  expect(screen.queryByText(/rows/)).toBeNull();
});
