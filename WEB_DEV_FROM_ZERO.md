# Web Development, From Zero — A Field Guide Using Your Own Project

This teaches web development using the exact app we built (the Distribution Sales & Ledger system) as the running example. Every concept is explained as: **analogy → definition → where it happens in your actual code**. Self-test questions are at the end of each section — try to answer before scrolling, don't just read the answer.

---

## Part 1: The Big Picture

### The restaurant analogy
Imagine a restaurant:
- **You (the customer)** = the **browser** — you look at a menu and ask for food.
- **The waiter** = the **API** — carries your request to the kitchen and brings back a plate.
- **The kitchen** = the **backend/server** — does the actual work (cooking).
- **The pantry/fridge** = the **database** — where ingredients (data) are stored long-term.
- **The plate of food, presented nicely** = the **frontend** — what you actually see and interact with.

**Formal definition:** A web app has two halves that talk to each other over the internet:
- **Frontend** (a.k.a. "client"): runs in the user's browser. Its job is to *display* things and *collect* input. In our project: the `frontend/` folder (React).
- **Backend** (a.k.a. "server"): runs on a computer somewhere else (not the user's machine). Its job is to *enforce rules*, *do calculations*, and *store/retrieve data*. In our project: the `backend/` folder (Node.js/Express).

**Why split them at all?** Two big reasons:
1. **Trust.** Anything running in the user's browser can be inspected, edited, or faked by that user (open dev tools, anyone can do it). So any rule that actually matters — "only an admin can delete a distributor," "a discount can't exceed the order total" — must be enforced on the backend, where the user can't tamper with it. The frontend can *also* check these things (for a nicer experience — instant feedback instead of waiting for the server to say no), but the backend check is the one that's actually trustworthy.
2. **Data must outlive any one visit.** If distributor balances were only stored in your browser, they'd vanish the moment you closed the tab, and nobody else could see them. The database lives on the server, always on, shared by everyone who uses the app.

**Self-test:**
1. Why can't you trust a rule that's only checked in the frontend?
2. In our project, which folder is the "kitchen" and which is the "plate of food"?

---

## Part 2: HTTP — How Browser and Server Talk

### Analogy
HTTP is like a very structured letter-writing system. Every letter (a "request") has:
- An **address** (URL) — where it's going
- An **action** (method) — what you want done
- Sometimes **contents** (body) — data you're sending
- The reply (a "response") always comes with a **status code** — a 3-digit number that says, before you even read the reply, whether it went well or badly.

**Definition:** HTTP (HyperText Transfer Protocol) is the language browsers and servers use to communicate. It's *request/response*: the client sends one request, the server sends back exactly one response. Nothing happens unless the client asks first (this matters later when we talk about Socket.io/real-time, which breaks this rule on purpose).

### The methods (verbs)
| Method | Real-world meaning | Used in our project for |
|---|---|---|
| `GET` | "Show me X" — read-only, never changes anything | Fetching orders, products, distributors, reports |
| `POST` | "Create a new X" | Creating an order, logging in, adding a distributor |
| `PUT` | "Replace/update all of X" | Editing a distributor's full details |
| `PATCH` | "Update *part* of X" | Changing just an order's status |
| `DELETE` | "Remove X" | Deleting a manufacturer |

**Why does the method matter, technically?** Browsers and servers treat these differently. For example, `GET` requests can be cached (the browser might reuse an old answer instead of asking again) and can be re-sent automatically if something fails — which is safe because reading data twice doesn't hurt anything. A `POST` should *never* be auto-retried like that, because creating the same order twice would be a real bug. Choosing the right verb isn't just style — it's a signal to every tool in between (browsers, proxies, caches) about whether it's safe to repeat.

**Where to see it:** open `backend/src/routes/orderRoutes.js` — look at `router.get(...)`, `router.post(...)`, `router.patch('/:id/status', ...)`. Each line pairs a method + URL pattern with a function that handles it.

### The anatomy of a request
```
POST /api/orders HTTP/1.1
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{
  "distributor_id": 1,
  "items": [{ "product_id": 1, "quantity": 10 }]
}
```
- **`POST /api/orders`** — method + path (which "room" of the server you're knocking on)
- **Headers** (`Authorization`, `Content-Type`) — metadata about the request. `Authorization` proves who you are (more on this in Part 6). `Content-Type: application/json` tells the server "the body below is JSON, parse it that way."
- **Body** — the actual data, in this case JSON (JavaScript Object Notation — just a text format for structured data, like a very strict, computer-readable version of a form).

**Self-test:**
1. Which HTTP method would you use to view a list of distributors? To delete one?
2. Why shouldn't a browser automatically retry a failed `POST`, but it's fine to retry a failed `GET`?

---

## Part 3: HTTP Status Codes — The Full Map

Every response comes back with a 3-digit code. The **first digit tells you the category** — you can often guess what's going on just from that, even for a code you've never seen before.

### 1xx — Informational (rare, you'll almost never touch these)
The server received the request and is still processing. `100 Continue` is the only common one — used internally by some clients before sending a large upload.

### 2xx — Success ("it worked")
| Code | Meaning | Where it shows up in our app |
|---|---|---|
| `200 OK` | Standard success | `GET /api/orders`, `GET /api/reports/dashboard` — any successful fetch |
| `201 Created` | Success, *and* a new thing now exists | `POST /api/orders` returns 201 with the new order — see `orderController.js`, `res.status(201).json(order)` |
| `204 No Content` | Success, but there's nothing to send back | `DELETE /api/distributors/:id` — see `distributorController.js`, `res.status(204).send()` |

**Why the distinction between 200/201/204?** It lets the *frontend* react correctly without having to guess. If your frontend code sees 201, it knows "something new was made, here it is, I should probably navigate to it" — which is exactly what `CreateOrderPage.jsx` does: `navigate(`/orders/${res.data.id}`)`.

### 3xx — Redirection ("go look over there instead")
Not used directly in our API, but common on the web generally — e.g. `301 Moved Permanently` (this page lives at a new URL forever, update your bookmark) vs `302 Found` (temporary detour).

### 4xx — Client Error ("you (the request) did something wrong")
This is the category to know cold — it means *the problem is on the sending side*, not the server's fault.

| Code | Meaning | Where it shows up in our app |
|---|---|---|
| `400 Bad Request` | The request is malformed or fails a business rule | Ordering with a discount bigger than the total — see `ledgerService.js`: `throw new ApiError(400, 'Discount cannot exceed subtotal + freight.')` |
| `401 Unauthorized` | You didn't prove who you are (missing/invalid/expired login token) | Any protected route with no `Authorization` header — see `middleware/auth.js`, `requireAuth` |
| `403 Forbidden` | The server knows exactly who you are — you're just not allowed | A sales rep trying to delete a distributor — see `requireRole('admin')` |
| `404 Not Found` | The thing you asked for doesn't exist | `GET /api/orders/9999` when order 9999 was never created |
| `409 Conflict` | Your request collides with existing data | Creating a manufacturer with a name that already exists (unique constraint) — see `errorHandler.js`, Postgres error code `23505` |
| `422 Unprocessable Entity` | (Not used here, but common elsewhere) The request is well-formed but semantically invalid | — |
| `429 Too Many Requests` | You're being rate-limited | Not implemented in v1 — flagged as a good next step in the README |

**401 vs 403 — the single most-confused pair in web dev.** Analogy: 401 is a bouncer saying "I don't know you, show ID" (you haven't logged in, or your login expired). 403 is the bouncer saying "I know exactly who you are, and you're still not on the list" (you're logged in, but your role doesn't permit this). Getting this distinction right matters because the *frontend's reaction should differ*: on 401, send the user to the login page (their session is invalid). On 403, don't — logging in again won't fix anything; the right response is to hide that button/feature entirely, or show "you don't have permission."

### 5xx — Server Error ("you didn't do anything wrong — we broke")
| Code | Meaning | Where it shows up |
|---|---|---|
| `500 Internal Server Error` | Something crashed unexpectedly on the backend | The catch-all in `errorHandler.js` — any bug we didn't anticipate falls here |
| `502 Bad Gateway` | A server acting as a proxy got a bad response from *another* server behind it | Not in our app directly, but common when e.g. Vite's dev proxy can't reach the backend (this actually happened during development — see PROJECT_LOG.md, "ECONNREFUSED") |
| `503 Service Unavailable` | The server is up but temporarily can't handle requests (overloaded, or intentionally down for maintenance) | — |

**Why the 4xx/5xx split matters practically:** it tells you *where to start debugging*. A 4xx means: re-read the request you sent — you're probably missing a field, sending the wrong type, or not logged in. A 5xx means: the bug is in the server's code, and you (as the frontend developer) can't fix it by changing what you send — go check the server logs.

**Self-test:**
1. A user reports "I click submit and get an error." The status code was 403. What's the most likely cause, and how is it different from if the code had been 401?
2. Why does `DELETE` return `204` instead of `200` with an empty body — what's actually different?
3. You see a `500` error. Should you change the data you're sending and try again? Why or why not?

---

## Part 4: The Frontend — React

### Analogy
Think of a web page as a house built out of **reusable pre-fab rooms**. Instead of hand-building a kitchen from scratch every time you build a house, you design one "Kitchen" blueprint and stamp it out wherever you need a kitchen — each one can look slightly different (different countertop color) but they all share the same structure.

**Definition:** React is a JavaScript library for building user interfaces out of **components** — small, reusable, self-contained pieces of UI. A component is just a function that returns what should appear on screen.

**Where to see it:** `frontend/src/components/StatusBadge.jsx`:
```jsx
export default function StatusBadge({ value }) {
  const tone = TONES[value] || 'neutral';
  return <span className={`badge badge-${tone}`}>{value}</span>;
}
```
This is a "Kitchen blueprint." Every time you write `<StatusBadge value="paid" />` anywhere in the app, React stamps out a little colored pill showing "paid." `value` here is called a **prop** ("property") — an input you hand to a component, the same way a function takes an argument.

**Why components at all?** Without them, you'd copy-paste the same badge-styling HTML in every single place a status appears (orders table, distributor table, ledger table...) — and if you ever wanted to change how badges look, you'd have to find and fix every copy. With a component, you change `StatusBadge.jsx` once, and every badge in the app updates.

### State — "things that change and the UI needs to know about it"
**Analogy:** think of a light switch. The switch has a *state* (on/off). When you flip it, the room changes to match. React's `useState` is exactly this, but for data.

**Where to see it**, `frontend/src/pages/OrdersPage.jsx`:
```jsx
const [rows, setRows] = useState([]);
```
`rows` is the current list of orders (starts empty, `[]`). `setRows` is the *only* correct way to change it. When you call `setRows(newData)`, React automatically re-runs the component and updates what's on screen — you never manually touch the HTML.

**Why not just change a variable directly?** Because React needs to *know* something changed in order to redraw the screen. A normal JavaScript variable change is invisible to React — nothing would update. `useState`'s setter function is how you tell React "hey, redraw using this new value."

### Effects — "do something *because* the screen appeared, or because something changed"
**Where to see it**, same file:
```jsx
useEffect(() => { load(); }, [load]);
```
**Analogy:** a motion-sensor light. It doesn't turn on because you told it to right now — it turns on *automatically* in reaction to something happening (someone walked by). `useEffect` says: "whenever this component appears on screen, or whenever `load` changes, run this function." In this case: "as soon as the Orders page opens, go fetch the order list from the server."

### JSX — HTML mixed into JavaScript
```jsx
return <div className="content">{o.order_number}</div>;
```
This looks like HTML but it's actually JavaScript — `{o.order_number}` means "drop the *value* of this variable in right here." JSX gets compiled (translated) into plain JavaScript function calls before it ever reaches the browser; it's a convenience for humans to write, not something browsers understand natively.

**Self-test:**
1. What's the difference between a "prop" and "state"? (Hint: who's allowed to change each one — the component itself, or its parent?)
2. Why would directly writing `rows = newData` instead of `setRows(newData)` silently fail to update the screen?

---

## Part 5: The Backend — Node.js & Express

### Analogy
If React components are pre-fab rooms, the backend is the **building's reception desk with a very literal staff**: every possible request has one specific staff member assigned to handle it, and there's a strict order of operations (check ID first, then log the visit, then actually help you).

**Definition:** Node.js lets you run JavaScript *outside* a browser — on a server. Express is a framework (a toolkit) on top of Node.js that makes it easy to define "when a request like *this* comes in, run *this* function."

**Where to see it**, `backend/src/routes/orderRoutes.js`:
```js
router.post('/', controller.create);
```
Reads as: "when a `POST` request arrives at this route's base path, call `controller.create`." This pairing of (method + path) → function is called a **route**.

### Middleware — "the checkpoints before you reach the actual handler"
**Analogy:** airport security before you reach your gate. Multiple checkpoints, each can either wave you through or stop you entirely, and they run *in order*.

**Where to see it**, `backend/src/routes/orderRoutes.js`:
```js
router.use(requireAuth);
```
Every request to any order route passes through `requireAuth` first. If it fails (no valid token), the request never even reaches `controller.create` — it stops right there and a `401` goes back.

**Why put this logic in middleware instead of inside every single controller function?** Repetition and mistakes. If "check the user is logged in" were copy-pasted into all 10 order-related functions, forgetting it in just one creates a security hole. As middleware, it's defined once and applied consistently — impossible to forget.

### Controllers — "the actual work"
**Where to see it**, `backend/src/controllers/orderController.js`:
```js
const create = asyncHandler(async (req, res) => {
  const { distributor_id, items, ... } = req.body;
  // ... validate, do the work ...
  res.status(201).json(order);
});
```
- `req` (request) — everything about the incoming request: `req.body` (the JSON sent), `req.params` (URL parts like `/orders/:id`), `req.user` (who's logged in, attached by the auth middleware).
- `res` (response) — how you send an answer back: `res.status(201).json(order)` means "send status 201, with this data as JSON."

**Self-test:**
1. Why does authentication live in middleware rather than being copy-pasted into every controller?
2. If a request fails `requireAuth`, does the controller function ever run at all?

---

## Part 6: Async Code — `async`/`await` and Promises

### Analogy
Ordering food at a counter and getting a buzzer. You don't stand frozen at the counter staring at the kitchen until your food is ready (that would block everyone behind you) — you take the buzzer, go sit down, and get notified when it's done.

**Definition:** A **Promise** is JavaScript's buzzer — an object representing "a value that isn't ready yet, but will be (or will fail) eventually." `async`/`await` is syntax that lets you *write* asynchronous code that *reads* like normal top-to-bottom code, even though it's not actually blocking anything while it waits.

**Where to see it**, everywhere in the backend:
```js
const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
```
`pool.query(...)` talks to the database over the network — this takes time (milliseconds, but not zero). `await` says "pause *this function* here until the database responds, but don't freeze the whole server — it can go handle other people's requests in the meantime." Without `await`, `result` would just be an unfulfilled Promise, not actual data — you'd be trying to read the buzzer number as if it were the food itself.

**Why does this matter for a server specifically?** A server handles many users at once. If querying the database *actually* froze the whole program, one slow query would make every other user's request wait in line behind it. `async`/`await` (built on Node's non-blocking design) is what lets one Node process serve many requests concurrently without needing a separate thread per user.

**Self-test:**
1. What would happen (conceptually) if a server's database queries were blocking instead of async?
2. `await` pauses the *current function*. What is it *not* pausing?

---

## Part 7: The Database — PostgreSQL & SQL

### Analogy
A relational database is a set of **spreadsheets that are allowed to reference each other by row number**, plus a bouncer that enforces rules about what's allowed to go in each cell.

**Definition:** PostgreSQL is a *relational* database — data lives in **tables** (rows and columns), and tables can be linked via **foreign keys**.

**Where to see it**, `backend/src/db/schema.sql`:
```sql
CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    NUMERIC(12,2) NOT NULL CHECK (quantity > 0)
);
```
- **`SERIAL PRIMARY KEY`** — an auto-incrementing unique ID (1, 2, 3, ...) — the row's "name tag."
- **`REFERENCES orders(id)`** — a **foreign key**: this column's value must match an existing row's `id` in the `orders` table. This is how "an order has many items" is represented — each item row points back at its parent order.
- **`ON DELETE CASCADE`** vs **`ON DELETE RESTRICT`** — what happens to child rows if the parent is deleted. `CASCADE` on `order_items` means "if an order is deleted, delete its items too" (they're meaningless without their parent). `RESTRICT` on `product_id` means "you may *not* delete a product if any order_item still references it" — protects historical order data from silently breaking.
- **`CHECK (quantity > 0)`** — a rule enforced by the database itself, not just the application code. Even if a bug in the backend tried to insert `quantity = -5`, Postgres would refuse and throw an error. This is a second line of defense beneath the application-level validation.

**Why enforce rules at the database level *and* the application level?** Belt and suspenders. Application code can have bugs, or a future developer could write a new script that bypasses your normal code path. A `CHECK` constraint at the database level is the last, unbypassable line of defense — the data literally cannot exist in an invalid shape, no matter what code touches it.

### SQL — the query language
**Definition:** SQL (Structured Query Language) is how you ask a relational database for data or tell it to change something.

```sql
SELECT o.*, d.name AS distributor_name
FROM orders o
JOIN distributors d ON d.id = o.distributor_id
WHERE o.order_status = 'pending'
ORDER BY o.order_date DESC;
```
Read it almost like English: "Give me all columns from orders, plus the distributor's name, by matching each order to its distributor, but only pending ones, newest first." A **`JOIN`** is exactly the "spreadsheets referencing each other" idea made real — it stitches rows from two tables together based on matching keys.

### Transactions — "all or nothing"
**Analogy:** transferring money between two bank accounts. If the system subtracts $100 from Account A but then crashes *before* adding it to Account B, that $100 has vanished into thin air. You need both steps to succeed together, or neither happens.

**Where to see it**, `backend/src/controllers/orderController.js`:
```js
await client.query('BEGIN');
try {
  const order = await createOrderWithLedger(client, {...});
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
}
```
`BEGIN` starts a transaction — a boundary around multiple database operations that must all succeed or all fail together. `createOrderWithLedger` does several inserts/updates (the order, its line items, the ledger debit, maybe a ledger credit). If *any* of those fail partway through, `ROLLBACK` undoes everything done so far in this transaction — the database ends up exactly as if none of it had ever happened. Without this, a crash halfway through could leave you with an order that exists but was never posted to the ledger — silently wrong financial data.

**Self-test:**
1. What's a foreign key, in your own words?
2. Why does `order_items` cascade-delete but `products` restrict-delete when referenced by an order?
3. Why does creating an order need to be wrapped in a transaction instead of just running each `INSERT` separately?

---

## Part 8: Auth — Passwords, Hashing, and JWTs

### Passwords are never stored as plain text
**Analogy:** instead of writing down someone's actual password, you write down the result of feeding it through a blender that only ever spits out mush in one direction — you can check "does this new password, blended, match the mush I have on file?" but you can never un-blend the mush back into the original password.

**Definition:** **Hashing** is a one-way mathematical function: same input always produces the same output, but you (practically) cannot reverse it to recover the input.

**Where to see it**, `backend/src/db/seed.js`:
```js
const hash = await bcrypt.hash(password, 10);
```
`bcrypt` is a hashing algorithm designed specifically for passwords (deliberately slow, to make brute-force guessing expensive). We store `hash`, never `password`. Later, at login (`authController.js`):
```js
const valid = await bcrypt.compare(password, user.password_hash);
```
This re-hashes the login attempt and checks if it matches — it never "decrypts" anything, because hashing isn't encryption; there's no key that reverses it.

**Why does this matter?** If your database were ever leaked or breached, plain-text passwords would hand attackers every user's real password immediately (and since people reuse passwords across sites, that's catastrophic beyond just your app). Hashed passwords are useless to an attacker without enormous computational effort per password.

### JWT — proving who you are on every subsequent request
**Analogy:** a wristband at a festival. You show ID once at the entrance (login), get a wristband, and for the rest of the day you just show the wristband — nobody re-checks your ID at every single stage/stall.

**Definition:** A JWT (JSON Web Token) is a signed piece of text the server hands you after login, containing your identity (`{id, name, role}`) plus a cryptographic signature proving the server issued it and it hasn't been tampered with.

**Where to see it**, `backend/src/controllers/authController.js`:
```js
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
```
The frontend stores this token (`localStorage`) and attaches it to every future request:
```js
config.headers.Authorization = `Bearer ${token}`;
```
On the backend, `requireAuth` middleware verifies the signature using the same secret. If someone tampered with the token (tried to change `role: "sales_rep"` to `role: "admin"` by hand), the signature check fails immediately — you can't fake a valid signature without knowing the server's secret key.

**Why not just re-send the username/password on every single request instead?** That would mean the password travels over the network constantly, multiplying the risk if any single request is intercepted. A JWT is scoped (expires after 8h here), revocable in design (though this app doesn't implement revocation lists — a real gap noted in the README), and doesn't expose the actual password after the initial login.

**Self-test:**
1. Why can't you "decrypt" a bcrypt hash back into the original password?
2. What stops a user from editing their own JWT to claim `role: "admin"`?
3. Why is `expiresIn: '8h'` a meaningful security choice rather than an arbitrary number?

---

## Part 9: Terminology Glossary (Quick Reference)

| Term | Plain-English meaning | Why it exists / when you'll hit it |
|---|---|---|
| **API** | A defined set of "doors" a program exposes for other programs to talk to it through | So the frontend and backend (or two totally different companies' systems) can interact without either needing to know the other's internal code |
| **REST** | A style/convention for designing APIs around URLs + HTTP methods representing "things" (nouns) and "actions" (verbs) | `GET /orders/5` reads clearly as "get order 5" — REST is about predictable, guessable API shapes |
| **JSON** | A text format for structured data: `{"key": "value"}` | It's how frontend and backend exchange data — lightweight, human-readable, and every language can parse it |
| **CRUD** | Create, Read, Update, Delete — the four basic operations almost any data-driven feature needs | Shorthand used constantly when describing what a resource/route supports |
| **Endpoint** | One specific URL + method combination on an API | "The `POST /api/orders` endpoint creates an order" |
| **Middleware** | Code that runs *between* the request arriving and the final handler, that can inspect/modify/reject it | Auth checks, logging, error formatting — cross-cutting concerns you don't want repeated everywhere |
| **ORM** | "Object-Relational Mapper" — a library that lets you write database queries using regular code objects instead of raw SQL | *Not used in this project* (we wrote raw SQL via the `pg` library) — worth knowing the term exists as an alternative approach |
| **Environment variable** | A configuration value kept *outside* the code, injected when the program runs | `.env` files (`DATABASE_URL`, `JWT_SECRET`) — keeps secrets out of source code/git history, and lets the same code run differently in dev vs. production |
| **CORS** | "Cross-Origin Resource Sharing" — a browser security rule that blocks a webpage from calling an API on a *different* domain unless that API explicitly allows it | Why `backend/src/app.js` has `app.use(cors(...))` — without it, the browser would refuse the frontend's requests to the backend on principle |
| **npm / package.json** | npm = Node's package manager (installs libraries). `package.json` = the manifest listing which libraries (and versions) your project depends on | `npm install` reads `package.json` and downloads everything listed into `node_modules/` |
| **Dependency** | A piece of someone else's code your project relies on | `express`, `react`, `bcryptjs` are all dependencies — reusing solved problems instead of rewriting them |
| **Socket.io / WebSocket** | A connection that stays open, letting the *server* push data to the client without being asked first | Breaks the normal "client always asks first" HTTP rule — used here so the dashboard updates live when someone else creates an order, without needing to constantly re-ask "anything new?" |
| **Environment (dev/production)** | "Dev" = your local machine while building; "production" = the real, live version other people use | Different settings apply (e.g. detailed error messages are fine in dev, but leak information in production) |
| **Migration** | A script that changes a database's structure (add a table, add a column) in a repeatable, trackable way | `backend/src/db/migrate.js` — running it applies `schema.sql`; in bigger projects, migrations are usually numbered/incremental instead of one big file |
| **Seed data** | Fake or starter data inserted so a fresh setup isn't completely empty | `backend/src/db/seed.js` — creates your first admin login and a sample product so the app isn't blank on first run |
| **Race condition** | A bug that only happens when two things try to happen at almost exactly the same time, in an unexpected order | Why `ledgerService.js` uses `SELECT ... FOR UPDATE` — without it, two simultaneous orders for the same distributor could both read the same starting balance and produce a wrong final number |
| **Idempotent** | An operation that produces the same result no matter how many times you repeat it | `GET` and `DELETE` are meant to be idempotent (deleting something already deleted is still "gone"); `POST` (create) usually isn't — calling it twice makes two things |

---

## Part 10: Walking Through One Real Request, Start to Finish

To tie it all together, here's exactly what happens, in order, when someone creates an order in the app you now have:

1. **Frontend (`CreateOrderPage.jsx`)**: user fills out the stepper, clicks "Create Order." React calls `ordersApi.create({...})`.
2. **Axios** (`api/client.js`) attaches the JWT from `localStorage` as an `Authorization` header, sends a `POST /api/orders` request as JSON.
3. **Express routing** (`orderRoutes.js`) matches `POST /` and runs middleware first: `requireAuth` checks the JWT is valid (else `401`) — if valid, attaches `req.user`.
4. **Controller** (`orderController.js`, `create`) reads `req.body`, opens a database **transaction** (`BEGIN`).
5. **Service layer** (`ledgerService.js`, `createOrderWithLedger`) does the actual logic: locks the distributor row, validates products exist and are active (else `400`), calculates subtotal/discount/freight/total, inserts the order + line items, posts a ledger **debit** entry, updates the distributor's running balance.
6. If everything succeeded: `COMMIT` makes it permanent. If anything threw an error: `ROLLBACK` undoes all of it, and the error flows to `errorHandler.js`, which turns it into the right status code (`400`, `404`, `409`, or `500`).
7. **Response** goes back: `201 Created` with the new order as JSON.
8. **Socket.io** emits `order:created` to every connected browser.
9. **Frontend** receives the `201` response, navigates to the new order's detail page. Meanwhile, any other open tab/user's **Dashboard** or **Orders list**, listening via `useLiveOrderEvents`, automatically re-fetches and shows the new order — without anyone refreshing.

**Final self-test — answer these using everything above:**
1. If the JWT had expired, at which numbered step would this whole flow stop, and what status code would come back?
2. If the discount was invalid, which layer catches that, and what happens to the partial database changes already made?
3. Why does step 8 exist at all — what problem would you have without Socket.io, given that step 2's request/response already told the *original* browser the order was created?

---

*This document was generated for the Distribution Sales & Ledger Management project — every code reference above points at real files in that codebase, not hypothetical examples.*
