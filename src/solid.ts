import { createSignal, createEffect, onCleanup, createMemo, createRoot } from "solid-js"
import {
	getStoreFor,
	snapshot,
	withComponentTracking,
	type StoreListener,
	type Snapshot as CoreSnapshot,
} from "./ripplio"

// Overloads for good typings:
export function useSnapshot<T extends object>(state: T): CoreSnapshot<T>
export function useSnapshot<T extends object, S>(state: T, selector: (state: T) => S): S
export function useSnapshot<T extends object, S = CoreSnapshot<T>>(
	state: T,
	selector?: (state: T) => S,
): S {
	const store = getStoreFor(state)

	// Stable component id for this hook instance
	const componentId = Symbol("solid-component")

	// Cache for the selected snapshot
	let cachedValue: S | undefined
	let cacheReady = false

	// Stable compute function (similar to React version)
	const computeSelected = (): S => {
		return withComponentTracking(componentId, () => {
			const selected = selector ? selector(state) : (state as unknown as S)
			return snapshot(selected) as S
		})
	}

	// Create a signal to trigger reactivity when store changes
	const [version, setVersion] = createSignal(0, { equals: false })

	// Subscribe to store changes
	createEffect(() => {
		const unsubscribe = store.subscribeComponent(componentId, () => {
			// Precompute the value (like React version)
			cachedValue = computeSelected()
			cacheReady = true
			// Trigger SolidJS reactivity
			setVersion((prev: number) => prev + 1)
		})

		onCleanup(unsubscribe)
	})

	// Return a memo that recomputes when the version signal changes
	return createMemo(() => {
		// Access version to create dependency
		version()

		// Compute if not cached (first render or cache invalidated)
		if (!cacheReady) {
			cachedValue = computeSelected()
			cacheReady = true
		}

		return cachedValue as S
	})
}

// Alternative hook that returns a signal directly (more SolidJS-idiomatic)
export function useSnapshotSignal<T extends object>(state: T): [() => CoreSnapshot<T>]
export function useSnapshotSignal<T extends object, S>(
	state: T,
	selector: (state: T) => S,
): [() => S]
export function useSnapshotSignal<T extends object, S = CoreSnapshot<T>>(
	state: T,
	selector?: (state: T) => S,
): [() => S] {
	const store = getStoreFor(state)
	const componentId = Symbol("solid-component-signal")

	const computeSelected = (): S => {
		return withComponentTracking(componentId, () => {
			const selected = selector ? selector(state) : (state as unknown as S)
			return snapshot(selected) as S
		})
	}

	// Create the reactive signal
	const [snapshotSignal, setSnapshotSignal] = createSignal<S>(computeSelected(), { equals: false })

	// Subscribe to store changes
	createEffect(() => {
		const unsubscribe = store.subscribeComponent(componentId, () => {
			const newValue = computeSelected()
			setSnapshotSignal(() => newValue)
		})

		onCleanup(unsubscribe)
	})

	return [snapshotSignal]
}

// Utility to create a reactive store-like object (similar to SolidJS createStore but backed by ripplio)
export function createSnapshotStore<T extends object>(state: T) {
	const store = getStoreFor(state)
	const componentId = Symbol("solid-snapshot-store")

	const [version, setVersion] = createSignal(0, { equals: false })

	// Subscribe to any changes
	createRoot(() => {
		createEffect(() => {
			const unsubscribe = store.subscribeComponent(componentId, () => {
				setVersion((prev: number) => prev + 1)
			})

			onCleanup(unsubscribe)
		})
	})

	// Return a proxy that creates memos for accessed properties
	return new Proxy(state, {
		get(target, prop) {
			if (typeof prop === "symbol") {
				return Reflect.get(target, prop)
			}

			// Create a memo for this property access
			return createMemo(() => {
				version() // Create dependency on version
				return withComponentTracking(componentId, () => {
					const value = Reflect.get(target, prop)
					return snapshot(value)
				})
			})
		},
	}) as {
		readonly [K in keyof T]: () => CoreSnapshot<T[K]>
	}
}
