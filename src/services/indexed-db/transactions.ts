import { TIndexedDbRecord } from './schema'

export function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = (event) => reject(event)
  })
}

export function openIndexedDbStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode
): { transaction: IDBTransaction; store: IDBObjectStore } {
  const transaction = db.transaction(storeName, mode)
  return {
    transaction,
    store: transaction.objectStore(storeName)
  }
}

export function commitTransaction(transaction: IDBTransaction) {
  const commit = (transaction as IDBTransaction & { commit?: () => void }).commit
  commit?.call(transaction)
}

export function abortTransaction(transaction: IDBTransaction) {
  const abort = (transaction as IDBTransaction & { abort?: () => void }).abort
  abort?.call(transaction)
}

export async function readStoredValue<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | null | undefined> {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readonly')
  try {
    const result = await requestPromise<TIndexedDbRecord<T> | undefined>(store.get(key))
    commitTransaction(transaction)
    return result?.value
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function writeStoredValue<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  value: T
): Promise<void> {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readwrite')
  try {
    await requestPromise(store.put({ key: String(key), value, addedAt: Date.now() }))
    commitTransaction(transaction)
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function deleteStoredValue(db: IDBDatabase, storeName: string, key: IDBValidKey) {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readwrite')
  try {
    await requestPromise(store.delete(key))
    commitTransaction(transaction)
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function readAllStoredValues<T>(
  db: IDBDatabase,
  storeName: string
): Promise<TIndexedDbRecord<T>[]> {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readonly')
  try {
    const result = await requestPromise<TIndexedDbRecord<T>[]>(store.getAll())
    commitTransaction(transaction)
    return result
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function countStoredValues(db: IDBDatabase, storeName: string): Promise<number> {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readonly')
  try {
    const result = await requestPromise<number>(store.count())
    commitTransaction(transaction)
    return result
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}

export async function clearStore(db: IDBDatabase, storeName: string): Promise<void> {
  const { transaction, store } = openIndexedDbStore(db, storeName, 'readwrite')
  try {
    await requestPromise(store.clear())
    commitTransaction(transaction)
  } catch (error) {
    abortTransaction(transaction)
    throw error
  }
}
