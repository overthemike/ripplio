# ripplio _(experimental)_

> NOTE: If you want to read about the basic ideas behind this: https://dev.to/overthemike/cosplay-and-wiretapping-javascripts-hidden-superpowers-1gcm
> NOTE: I also turned this into an experimental reactive state management library for React

An experimental, fine-grained reactive state manager for React — **heavily inspired by [Valtio]** — with:

- **Framework-agnostic core** (no React imports, no classes)
- **Computed getters** (including _computed-of-computed_)
- **Fine-grained subscriptions** so components re-render only for what they read
- **React binding** via `useSnapshot` built on `useSyncExternalStore`
- **Valtio-ish API** (not drop-in compatible)

> ⚠️ **Status:** pre-alpha / research project. Expect breaking changes, edge cases, and incomplete features. Not production-ready.

---

## Install

```bash
npm i ripplio
# or
pnpm add ripplio
# or
yarn add ripplio
```

- **Core** is framework-agnostic and ships TypeScript types.
- **React binding** lives under a subpath export.

```ts
// Core:
import { proxy, snapshot, ref } from 'ripplio';

// React hook:
import { useSnapshot } from 'ripplio/react';
```

Peer deps: React 18+ for the React binding. The core has no React dependency.

---

## Quick start

### 1) Create a store (proxy)

```ts
import { proxy } from 'ripplio';

export const state = proxy({
  cart: {
    items: [
      { id: 'a', name: 'Widget', price: 10, qty: 1 },
      { id: 'b', name: 'Gadget', price: 20, qty: 2 },
    ],
  },

  taxRate: 0.1,

  // Computed chain
  get subtotal() {
    return this.cart.items.reduce((s, it) => s + it.price * it.qty, 0);
  },
  get tax() {
    return this.subtotal * this.taxRate;
  },
  get total() {
    return this.subtotal + this.tax;
  },
});
```

### 2) Read in React with `useSnapshot`

```tsx
import { useSnapshot } from 'ripplio/react';
import { state } from './state';

export function Totals() {
  const snap = useSnapshot(state);
  return (
    <div>
      <div>Subtotal: {snap.subtotal}</div>
      <div>Tax: {snap.tax}</div>
      <div>Total: {snap.total}</div>
    </div>
  );
}
```

### 3) Mutate directly

```tsx
function TaxControl() {
  const { taxRate } = useSnapshot(state); // read
  return (
    <div>
      <span>Tax: {taxRate}</span>
      <button onClick={() => (state.taxRate = +(Math.min(0.25, taxRate + 0.01)))}
      >
        +0.01
      </button>
      <button onClick={() => (state.taxRate = +(Math.max(0, taxRate - 0.01)))}
      >
        -0.01
      </button>
    </div>
  );
}
```

---

## Fine-grained list rendering

Ripplio returns **plain arrays** from snapshots, so React rendering is predictable. Objects within are read via a “view” that yields plain primitives and tracks deps.

```tsx
import { useSnapshot } from 'ripplio/react';
import { state } from './state';

function ItemsHeader() {
  const { cart } = useSnapshot(state);
  return <h3>Items ({cart.items.length})</h3>;
}

function ItemsList() {
  const { cart } = useSnapshot(state);
  return (
    <ul>
      {cart.items.map((_, i) => (
        <ItemRow key={state.cart.items[i].id} index={i} />
      ))}
    </ul>
  );
}

function ItemRow({ index }: { index: number }) {
  const row = useSnapshot(state.cart.items[index]);
  return (
    <li>
      {row.name} — ${row.price.toFixed(2)} × {row.qty}{' '}
      <button onClick={() => state.cart.items[index].qty++}>+1 qty</button>
    </li>
  );
}
```

Only the row you interact with re-renders; the header re-renders when `items.length` changes; totals re-render when fields used in the computed chain change.

---

## Todo example (controlled inputs)

```tsx
import { proxy } from 'ripplio';
import { useSnapshot } from 'ripplio/react';

const todos = proxy({
  list: [] as { text: string; done: boolean }[],
  get completed() {
    return this.list.filter((t) => t.done);
  },
  get remaining() {
    return this.list.filter((t) => !t.done);
  },
});

export function TodoApp() {
  const snap = useSnapshot(todos);

  return (
    <div>
      <button onClick={() => todos.list.push({ text: `Task ${todos.list.length + 1}`, done: false })}>
        Add Task
      </button>

      <ul>
        {snap.list.map((t, i) => (
          <li key={i}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(t.done)}           {/* keep it controlled */}
                onChange={(e) => (todos.list[i].done = e.target.checked)}
              />
              {t.text}
            </label>
          </li>
        ))}
      </ul>

      <p>
        Completed: {snap.completed.length}, Remaining: {snap.remaining.length}
      </p>
    </div>
  );
}
```

> Snapshots always expose arrays as **plain arrays** and their elements as **plain objects** with primitive fields, so `checked` is a boolean at first render.

---

## API

### Core (`ripplio`)

- `proxy<T extends object>(initial: T): T`  
  Wraps an object and returns a reactive proxy. Mutate it directly.

- `snapshot<T>(value: T): Snapshot<T>`  
  Produces a render-safe view:
  - Arrays → **plain arrays** (deep materialized)
  - Objects → lightweight “view” proxies; property reads return **plain primitives** and **track deps**
  - Safe to pass to JSX

- `ref<T>(value: T): Ref<T>`  
  Wrap a value to keep reference semantics (e.g., as a `Map` key) without further proxying.

> Internals (not part of public API, but present): `getStoreFor`, `withComponentTracking`.

### React (`ripplio/react`)

- `useSnapshot<T extends object>(state: T): Snapshot<T>`
- `useSnapshot<T extends object, S>(state: T, selector: (state: T) => S): S` (optional)

`useSnapshot` subscribes the component to exactly what it reads during render (via `useSyncExternalStore`). A small cache satisfies React’s `getSnapshot` stability requirement.

---

## Computed values

Use ES getters. Computeds can depend on other computeds.

```ts
const s = proxy({
  items: [{ price: 10, qty: 1 }, { price: 20, qty: 2 }],
  taxRate: 0.1,
  get subtotal() {
    return this.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  },
  get tax() {
    return this.subtotal * this.taxRate; // computed-of-computed
  },
  get total() {
    return this.subtotal + this.tax;
  },
});
```

**How it works (high level)**

- Each computed has a key `__computed__:path`.
- On read, it recomputes lazily if dirty and captures **raw deps** (like `cart.items.0.qty`) and **prefixes** (`cart.items.0`, `cart.items`, …).
- A reverse index (raw→computed) and a computed→computed graph allow **fast dirty propagation**.
- Components subscribe to either raw paths or computed keys, so updates precisely re-render the right views.

---

## Differences from Valtio

- Similar: direct mutations, `useSnapshot`, `ref`, getter-based computed values.
- Different:
  - Not drop-in compatible.
  - Snapshots always give **plain arrays** (Valtio snapshots are deep frozen structures).
  - Some Valtio utilities (`proxyMap`, `proxySet`, etc.) are not implemented here (yet).

---

## Tips & caveats

- **Always render from the snapshot**, not the raw proxy.
- Treat snapshots as **read-only**; mutate the proxy.
- Use `ref()` for identity-sensitive keys you don’t want proxied.
- Controlled inputs: `checked={Boolean(t.done)}` is a good defensive pattern.
- This is experimental; expect sharp edges.

---

## TypeScript

Fully typed. `useSnapshot` returns a typed snapshot view:
- Primitives are primitives
- Arrays are `ReadonlyArray<...>`
- Objects expose the same keys but values are snapshot-safe (primitives or nested views)

---

## Contributing

Issues and PRs welcome — just remember this is research code. Please describe the scenario, include a minimal repro, and note your React/Node/TS versions.

---

## License

MIT

---

[Valtio]: https://github.com/pmndrs/valtio
